// Verifies the two reported issues are fixed:
//  (1) Opening the POS panel must not fail with "Another session is already
//      opened for this point of sale" (wedged closing_control sessions are
//      recovered server-side).
//  (2) The live POS "pick your name" screen lists kiosk staff, not only the
//      signed-in account, when a chain user (superadmin) logs in.
import { launch, makePage, adminLogin, bodyText, has, shot, makeRecorder, writeReport } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  await adminLogin(page, "owner@miza.iq");

  // Switch to the POS panel (top-bar Admin | POS toggle).
  await page.locator("button", { hasText: /^POS$/ }).first().click();
  await page.waitForTimeout(2500);
  let t = await bodyText(page);
  rec.add("POS-1", "Pick-your-name screen renders", has(t, /Pick your name to start the shift|اختر اسمك/));
  const colleagues = ["Zainab Hassan", "Hassan Jabbar", "Layla Qasim", "Fatima Noori", "Yusuf Kamal"]
    .filter((name) => t.includes(name));
  rec.add("POS-2", "Kiosk staff visible to superadmin (not just self)", colleagues.length >= 1,
    colleagues.length ? `sees: ${colleagues.join(", ")}` : "only self card rendered");
  rec.add("POS-3", "Signed-in user card present", has(t, "Miza Owner"));
  await shot(page, "pos-staff-picker.png");

  // Pick a colleague's card (scoped to .card to avoid the top-bar account
  // button) and start the shift — the call that previously crashed with
  // Odoo's "Another session is already opened".
  await page.locator("button.card", { hasText: "Zainab Hassan" }).first().click();
  await page.waitForTimeout(600);
  const respP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 25000 });
  await page.locator("button", { hasText: /Start shift|ابدأ الوردية/ }).click();
  const resp = await respP;
  const json = await resp.json().catch(() => ({}));
  const err = json?.error?.data?.message || json?.error?.message || "";
  rec.add("POS-4", "open_session succeeds (no 'Another session' error)", resp.status() < 400 && !err,
    err ? err.slice(0, 180) : `session ${json?.result?.name || json?.result?.id || "?"} state=${json?.result?.state || "?"}`);
  await page.waitForTimeout(2500);
  t = await bodyText(page);
  rec.add("POS-5", "Sale screen reached", has(t, /Tap an item to start|Charge IQD|Search product|اضغط/i));
  rec.add("POS-6", "Picked colleague shown as operating cashier", has(t, "Zainab Hassan"));
  rec.add("PAGE-ERRORS", "No console/page errors", page._errors.length === 0, page._errors.slice(0, 3).join(" | ") || "clean");
  await shot(page, "pos-shift-started.png");
} catch (err) {
  rec.add("ERR", "Run error", false, String((err && err.message) || err).slice(0, 220));
  await shot(page, "pos-login-run-error.png");
} finally {
  writeReport(rec.results, "POS login + staff picker verification");
  await browser.close();
}
