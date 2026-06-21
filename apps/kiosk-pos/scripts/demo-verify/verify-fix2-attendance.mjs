// FIX 2 only: Record attendance with explicit check-in/check-out times.
// The button lives under the Staff screen's "Payroll & costs" tab.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, makeRecorder, writeReport } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  await adminLogin(page, "owner@koub.iq");
  await gotoAdmin(page, "Staff");
  await page.waitForTimeout(1500);
  await page.locator("button", { hasText: /Payroll & costs|الرواتب/ }).first().click();
  await page.waitForTimeout(1200);
  await page.locator("button", { hasText: /Record attendance|تسجيل الحضور/ }).first().click();
  const adlg = page.locator("[role='dialog']");
  await adlg.waitFor({ state: "visible", timeout: 6000 });
  const times = adlg.locator("input[type='time']");
  // Evening slot: the seeded day already has 08:00-16:00 Baghdad attendance
  // for every roster member; overlapping times are (correctly) rejected.
  await times.nth(0).fill("18:00");
  await times.nth(1).fill("20:00");
  const respA = page.waitForResponse((r) => r.url().includes("hr_attendance"), { timeout: 20000 });
  await adlg.locator("button", { hasText: /Save attendance|حفظ الحضور/ }).click();
  const ra = await respA;
  const ja = await ra.json().catch(() => ({}));
  const aerr = ja?.error?.data?.message || ja?.error?.message || "";
  rec.add("FIX2-1", "Attendance with explicit times saves", ra.status() < 400 && !aerr,
    aerr ? aerr.slice(0, 180) : JSON.stringify(ja?.result || {}).slice(0, 160));
  await page.waitForTimeout(1500);
  const t = await bodyText(page);
  rec.add("FIX2-2", "No ORM datetime error surfaced", !/does not match format|time data/i.test(t));
  rec.add("PAGE-ERRORS", "No console/page errors", page._errors.length === 0, page._errors.slice(0, 3).join(" | ") || "clean");
  await shot(page, "fix2-attendance.png");
} catch (err) {
  rec.add("ERR", "Run error", false, String((err && err.message) || err).slice(0, 220));
  await shot(page, "fix2-run-error.png");
} finally {
  writeReport(rec.results, "Fix 2 attendance UI verification");
  await browser.close();
}
