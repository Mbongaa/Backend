// Verifies tonight's pre-demo fixes through the live UI (backend :8069 + vite :5174).
//   FIX 1: product+recipe save from the Products screen (Odoo datetime normalization)
//   FIX 2: Record attendance with explicit check-in/check-out times
//   FIX 4: Supplier PO lines show real received quantities (was always 0/N)
// FIX 3 (consumption retry idempotency) is verified separately via odoo shell.
// Creates one sacrificial product ("ZZ Verify Juice") and one attendance row;
// both are cleaned up by the caller after DB ground-truth checks.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, has, shot, makeRecorder, writeReport } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  await adminLogin(page, "owner@koub.iq");

  // ---- FIX 4: Suppliers screen PO received quantities ----
  await gotoAdmin(page, "Suppliers");
  await page.waitForTimeout(1800);
  let t = await bodyText(page);
  rec.add("FIX4-1", "Fully received PO line reads 20/20 received", /20\/20/.test(t), "P00017 is received in full (qty_received=20)");
  rec.add("FIX4-2", "Unreceived PO line reads 0/100 (genuine zero)", /0\/100/.test(t), "P00018 has no receipt yet");
  await shot(page, "fix4-suppliers-received.png");

  // ---- FIX 1: create a product WITH a recipe line via the New product dialog ----
  await gotoAdmin(page, "Products");
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: /New product|منتج جديد/ }).first().click();
  const dlg = page.locator("[role='dialog']");
  await dlg.waitFor({ state: "visible", timeout: 6000 });
  await dlg.locator("input[placeholder='e.g. Vanilla Latte']").fill("ZZ Verify Juice");
  await dlg.locator("input[type='number']").first().fill("3000");
  await dlg.locator("button", { hasText: /Add line|إضافة بند/ }).click();
  await dlg.locator("input[step='0.01']").first().fill("0.05");
  const respP = page.waitForResponse((r) => /product_create_bundle|recipe_version|product_catalog/.test(r.url()), { timeout: 25000 });
  await dlg.locator("button", { hasText: /Add product|إضافة المنتج/ }).click();
  const resp = await respP;
  const json = await resp.json().catch(() => ({}));
  const errMsg = json?.error?.data?.message || json?.error?.message || "";
  rec.add("FIX1-1", "Create product+recipe call succeeds", resp.status() < 400 && !errMsg,
    errMsg ? errMsg.slice(0, 160) : `via ${resp.url().split("/").pop()}`);
  await page.waitForTimeout(3000);
  t = await bodyText(page);
  rec.add("FIX1-2", "No datetime-format error surfaced", !/does not match format|time data/i.test(t));
  rec.add("FIX1-3", "New product appears in the list", has(t, "ZZ Verify Juice"));
  await shot(page, "fix1-product-created.png");

  // ---- FIX 2: record attendance with check-in/check-out times ----
  await gotoAdmin(page, "Staff");
  await page.waitForTimeout(1800);
  await page.locator("button", { hasText: /Record attendance|تسجيل الحضور/ }).first().click();
  const adlg = page.locator("[role='dialog']");
  await adlg.waitFor({ state: "visible", timeout: 6000 });
  const times = adlg.locator("input[type='time']");
  await times.nth(0).fill("09:00");
  await times.nth(1).fill("17:00");
  await adlg.locator("input[inputmode='decimal']").fill("");
  const respA = page.waitForResponse((r) => r.url().includes("hr_attendance"), { timeout: 20000 });
  await adlg.locator("button", { hasText: /Save attendance|حفظ الحضور/ }).click();
  const ra = await respA;
  const ja = await ra.json().catch(() => ({}));
  const aerr = ja?.error?.data?.message || ja?.error?.message || "";
  rec.add("FIX2-1", "Attendance with explicit times saves", ra.status() < 400 && !aerr,
    aerr ? aerr.slice(0, 160) : JSON.stringify(ja?.result || {}).slice(0, 140));
  await page.waitForTimeout(1500);
  t = await bodyText(page);
  rec.add("FIX2-2", "No ORM datetime error surfaced", !/does not match format|time data/i.test(t));
  await shot(page, "fix2-attendance.png");

  rec.add("PAGE-ERRORS", "No console/page errors during run", page._errors.length === 0,
    page._errors.slice(0, 3).join(" | ") || "clean");
} catch (err) {
  rec.add("ERR", "Run error", false, String((err && err.message) || err).slice(0, 220));
  await shot(page, "fixes-run-error.png");
} finally {
  writeReport(rec.results, "Fixes 1-4 UI verification");
  await browser.close();
}
