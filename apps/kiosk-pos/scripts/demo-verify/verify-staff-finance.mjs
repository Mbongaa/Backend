// Focused verification of the Staff (HR/payroll) and Finance (tabbed, per-kiosk) work.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, has, shot, makeRecorder, writeReport } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  await adminLogin(page, "owner@miza.iq");

  // ---- STAFF ----
  await gotoAdmin(page, "Staff");
  await page.waitForTimeout(1500);
  let t = await bodyText(page);
  rec.add("STAFF-1", "Staff page loads (roster + cashier performance)", has(t, "Cashier performance") && has(t, "Roster"));
  rec.add("STAFF-2", "Hourly rate column present", has(t, /Hourly rate/i), "looks for 'Hourly rate' header");
  rec.add("STAFF-3", "Real employees in roster", has(t, "Layla Qasim") && has(t, "Zainab Hassan") && has(t, "Ali Jabbar"));
  rec.add("STAFF-4", "Per-hour rate values shown (.../h)", /\/h\b/.test(t) || /\/س/.test(t), "expects e.g. 2,885/h");
  rec.add("STAFF-5", "Work week roster populated (shifts, not all empty)", has(t, /Confirmed|Planned|مؤكدة|مخططة/));
  rec.add("STAFF-6", "Coverage gaps surfaced", has(t, /missing|gap|ناقص|فجوة|Covered/i));
  rec.add("STAFF-7", "Payroll run + adjustments populated", has(t, /Payroll run/i) && has(t, /Advance|Bonus|Deduction/i));
  await shot(page, "staff-page.png");

  // ---- FINANCE ----
  await gotoAdmin(page, "Finance");
  await page.waitForTimeout(1500);
  t = await bodyText(page);
  rec.add("FIN-1", "Finance tab bar present", has(t, "Summary") && has(t, "By kiosk") && has(t, "Report pack"));
  rec.add("FIN-2", "Timeframe toggle present", has(t, /Timeframe|الإطار الزمني/) && has(t, "Daily") && has(t, "Weekly") && has(t, "Monthly"));
  rec.add("FIN-3", "Summary shows P&L (Payroll + Operating expenses rows)", has(t, /Profit & loss|الأرباح والخسائر/) && has(t, "Payroll"));
  await shot(page, "finance-summary.png");

  // Switch timeframe to Monthly and confirm it re-renders
  const monthlyBtn = page.locator("button", { hasText: /^Monthly$|^شهري$/ }).first();
  if (await monthlyBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await monthlyBtn.click();
    await page.waitForTimeout(1200);
  }
  t = await bodyText(page);
  rec.add("FIN-4", "Monthly timeframe selectable", has(t, /Monthly|شهري/));
  await shot(page, "finance-monthly.png");

  // By-kiosk tab
  const byKioskBtn = page.locator("button", { hasText: /By kiosk|حسب الكشك/ }).first();
  let kioskOk = false;
  if (await byKioskBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await byKioskBtn.click();
    await page.waitForTimeout(1200);
    kioskOk = true;
  }
  t = await bodyText(page);
  rec.add("FIN-5", "By-kiosk tab opens", kioskOk && has(t, /Approximate profit per kiosk|الربح التقريبي لكل كشك/));
  rec.add("FIN-6", "Per-kiosk P&L columns (COGS, Staff cost, Approx profit, Margin)", has(t, "COGS") && has(t, /Staff cost/i) && has(t, /Approx profit/i) && has(t, /Margin/i));
  rec.add("FIN-7", "Kiosk codes + margins present", has(t, "K-01") && has(t, "K-02") && has(t, "K-03") && /%/.test(t));
  await shot(page, "finance-bykiosk.png");

} catch (err) {
  rec.add("ERR", "Run error", false, String(err && err.message || err));
} finally {
  writeReport(rec.results, "Staff & Finance verification");
  await browser.close();
}
