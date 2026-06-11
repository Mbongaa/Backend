// Verifies: (#1) the Daily Close drill-down "Variance inputs" table renders the
// close's own server-computed ingredient lines (not a re-derivation from
// today's bootstrap), and (#3) the Overview profit tile uses the same
// after-payroll definition in Daily and Weekly scopes.
// Ground truth (close 75 / K-03 / 06-10): RAW-CUP 488 expected vs 484 counted,
// RAW-ORANGE 28.5 vs 27.3 — values only present in the server lines.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, has, shot, makeRecorder, writeReport, odooLogin, api, numRe } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  // Backend ground truth for the profit tile, fetched through the same API.
  const { cookie } = await odooLogin("owner@miza.iq");
  const boot = await api("/bayaan/api/chain_bootstrap", cookie, {});
  const periods = boot?.summary?.reportPeriods || {};
  const dailyNet = Math.round(Number(periods.daily?.netProfitAfterPayroll ?? 0));
  const weeklyNet = Math.round(Number(periods.weekly?.netProfitAfterPayroll ?? 0));

  await adminLogin(page, "owner@miza.iq");

  // ---- #1: close drill-down variance inputs ----
  await gotoAdmin(page, "Daily Close");
  await page.waitForTimeout(2200);
  const k03row = page.locator("tr.row-click", { hasText: "K-03" })
    .filter({ hasText: /Pending approval|Needs review|بانتظار|تحتاج/ }).first();
  await k03row.click();
  await page.waitForTimeout(1200);
  let t = await bodyText(page);
  rec.add("VAR-1", "Variance inputs header present", has(t, /Variance inputs|مدخلات الفارق/));
  rec.add("VAR-2", "Server line: cup 488 expected / 484 counted", has(t, "488") && has(t, "484"),
    "values exist only in bayaan_shift_close_ingredient_line for close 75");
  rec.add("VAR-3", "Server line: orange 28.5 expected / 27.3 counted", has(t, "28.5") && has(t, "27.3"));
  await shot(page, "close-variance-inputs.png");

  // ---- #3: profit tile consistent across Daily/Weekly ----
  await gotoAdmin(page, "Today Command");
  await page.waitForTimeout(2200);
  t = await bodyText(page);
  rec.add("PROFIT-1", `Daily tile shows after-payroll net (${dailyNet.toLocaleString("en")})`,
    numRe(dailyNet).test(t), `expected ~IQD ${dailyNet.toLocaleString("en")} from reportPeriods.daily`);
  await page.locator("select[title='Dashboard time scope']").selectOption("Weekly");
  await page.waitForTimeout(3500);
  t = await bodyText(page);
  rec.add("PROFIT-2", `Weekly tile shows after-payroll net (${weeklyNet.toLocaleString("en")})`,
    numRe(weeklyNet).test(t), `expected ~IQD ${weeklyNet.toLocaleString("en")} from reportPeriods.weekly`);
  await shot(page, "profit-weekly-scope.png");
  await page.locator("select[title='Dashboard time scope']").selectOption("Daily");
  await page.waitForTimeout(2000);

  rec.add("PAGE-ERRORS", "No console/page errors", page._errors.length === 0, page._errors.slice(0, 3).join(" | ") || "clean");
} catch (err) {
  rec.add("ERR", "Run error", false, String((err && err.message) || err).slice(0, 220));
  await shot(page, "close-profit-run-error.png");
} finally {
  writeReport(rec.results, "Close variance + profit tile verification");
  await browser.close();
}
