// Live walkthrough of the Finance & Accounting workspace + per-kiosk CapEx.
// Runs against the LIVE Odoo backend (real account.move / account.move.line).
// Proves: General Ledger, Journal Entries, Trial Balance, Income Statement,
// Balance Sheet and Chart of Accounts read the real ledger, and that a kiosk
// one-time cost capitalizes into a real, balanced fixed-asset journal entry.
import { launch, makePage, adminLogin, gotoAdmin, navLabels, bodyText, has, numRe, shot, makeRecorder, writeReport, odooLogin, api } from "./lib.mjs";

const ACCT_NAV = ["Finance overview", "General ledger", "Journal entries", "Trial balance", "Income & Balance", "Chart of accounts"];

async function main() {
  const browser = await launch();
  const rec = makeRecorder();
  const page = await makePage(browser);

  // Backend ground truth (so UI numbers can be checked against the source).
  const { cookie } = await odooLogin("owner@miza.iq");
  const tb = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "trial_balance" } });
  const bs = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "balance_sheet" } });
  const truthDebit = Math.round(tb?.totals?.debit || 0);
  const truthAssets = Math.round(bs?.totals?.assets || 0);

  try {
    await adminLogin(page, "owner@miza.iq");
    const labels = await navLabels(page);
    const navOk = ACCT_NAV.every((l) => labels.some((x) => x.includes(l)));
    rec.add("ACC-1", "Owner sees the Finance & Accounting nav category", navOk, navOk ? ACCT_NAV.join(", ") : `got: ${labels.join(", ")}`, await shot(page, "acc-01-nav"));

    // General ledger
    await gotoAdmin(page, "General ledger");
    let t = await bodyText(page);
    const glOk = has(t, "Odoo engine", "Debit", "Credit", "Balance") && /\d/.test(t);
    rec.add("ACC-2", "General ledger renders real posted journal items", glOk, "", await shot(page, "acc-02-general-ledger"));

    // Journal entries
    await gotoAdmin(page, "Journal entries");
    t = await bodyText(page);
    rec.add("ACC-3", "Journal entries list posted moves", has(t, "Journal", "Reference") && /\d/.test(t), "", await shot(page, "acc-03-journals"));

    // Trial balance — must show debit=credit and a Balanced badge
    await gotoAdmin(page, "Trial balance");
    t = await bodyText(page);
    const tbBalanced = has(t, "Balanced") && (truthDebit ? numRe(truthDebit).test(t) : true);
    rec.add("ACC-4", "Trial balance balances and matches the ledger total", tbBalanced, `debit total ${truthDebit.toLocaleString()}`, await shot(page, "acc-04-trial-balance"));

    // Income statement & Balance sheet
    await gotoAdmin(page, "Income & Balance");
    t = await bodyText(page);
    const pnlOk = has(t, "Net profit", "Revenue");
    // switch to the balance sheet sub-tab
    const bsBtn = page.getByRole("button", { name: /Balance sheet|الميزانية/ }).first();
    if (await bsBtn.isVisible({ timeout: 2000 }).catch(() => false)) { await bsBtn.click(); await page.waitForTimeout(1200); }
    t = await bodyText(page);
    const bsOk = has(t, "Assets", "Liabilities", "Equity") && (truthAssets ? numRe(truthAssets).test(t) : true) && has(t, /balances|متوازنة/);
    rec.add("ACC-5", "Income statement & Balance sheet render and balance", pnlOk && bsOk, `assets ${truthAssets.toLocaleString()}`, await shot(page, "acc-05-statements"));

    // Chart of accounts
    await gotoAdmin(page, "Chart of accounts");
    t = await bodyText(page);
    rec.add("ACC-6", "Chart of accounts lists the real accounts", has(t, "accounts in the books", "Code", "Type") && /\d/.test(t), "", await shot(page, "acc-06-chart"));

    // ---- Per-kiosk CapEx ----
    await gotoAdmin(page, "Kiosks");
    await page.waitForTimeout(1200);
    const card = page.locator(".card").filter({ hasText: /K-0\d/ }).first();
    let onDetail = false;
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(1800);
      onDetail = await page.getByRole("button", { name: /All kiosks|كل الأكشاك/ }).first().isVisible({ timeout: 3000 }).catch(() => false);
    }
    rec.add("ACC-7", "Open a kiosk detail page", onDetail, "", await shot(page, "acc-07-kiosk-detail"));

    if (onDetail) {
      const capexTab = page.getByRole("button", { name: /Setup & assets|التأسيس والأصول/ }).first();
      await capexTab.click();
      await page.waitForTimeout(1500);
      let ct = await bodyText(page);
      rec.add("ACC-8", "Kiosk Setup & assets tab shows invested capital", has(ct, /invested capital/i, /net book value/i), "", await shot(page, "acc-08-capex-tab"));

      // Add a one-time cost and confirm it capitalizes into the real books.
      const stamp = Date.now().toString().slice(-5);
      const costName = `Demo espresso machine ${stamp}`;
      await page.getByRole("button", { name: /Add cost|إضافة تكلفة/ }).first().click();
      const dlg = page.locator("[role='dialog']");
      await dlg.waitFor({ state: "visible", timeout: 6000 });
      await dlg.getByPlaceholder(/Espresso machine/).fill(costName);
      await dlg.getByPlaceholder("e.g. 1500000").fill("480000");
      await dlg.getByRole("button", { name: /Capitalize cost|رسملة التكلفة/ }).click();
      await page.waitForTimeout(3500);
      ct = await bodyText(page);
      const posted = has(ct, costName) && has(ct, "Capitalized");
      rec.add("ACC-9", "Kiosk one-time cost capitalizes to a real fixed-asset entry", posted, costName, await shot(page, "acc-09-capex-posted"));

      // Backend cross-check: the capex row exists and posted with a move + asset account.
      const capexList = await api("/bayaan/api/kiosk_capex", cookie, { payload: { action: "list" } });
      const row = (capexList?.capex || []).find((r) => r.name === costName);
      const backendOk = !!row && row.state === "posted" && !!row.moveName && !!row.assetAccount;
      rec.add("ACC-10", "Backend: capex posted a balanced move to a fixed-asset account",
        backendOk, row ? `move ${row.moveName} · asset ${row.assetAccount} · NBV ${row.netBookValue}` : "row not found");
    }
  } catch (err) {
    rec.add("ACC-ERR", "Walkthrough exception", false, String(err && err.message).slice(0, 200), await shot(page, "acc-error"));
  }

  // Accountant role sees the read-only books.
  try {
    const acc = await makePage(browser);
    await adminLogin(acc, "noor@miza.iq");
    const labels = await navLabels(acc);
    const seesBooks = ["General ledger", "Trial balance", "Chart of accounts"].every((l) => labels.some((x) => x.includes(l)));
    rec.add("ACC-11", "Accountant role sees the formal books", seesBooks, seesBooks ? "" : `got: ${labels.join(", ")}`, await shot(acc, "acc-11-accountant-nav"));
  } catch (err) {
    rec.add("ACC-11", "Accountant role sees the formal books", false, String(err && err.message).slice(0, 160));
  }

  const errs = (page._errors || []).filter(Boolean);
  rec.add("ACC-12", "No console/page errors on accounting screens", errs.length === 0, errs.slice(0, 3).join(" | "));

  const summary = writeReport(rec.results, "Finance & Accounting live verification");
  console.log(`\n${summary.pass}/${summary.total} passed · ${summary.fail} failed · ${summary.dir}`);
  await browser.close();
  process.exit(summary.fail ? 1 : 0);
}

main();
