// Adversarial accountant audit. Role-plays the client's accountant who would
// rather buy a vanilla Odoo install: pulls every formal report straight from the
// engine for tie-outs (TB balances, BS balances, P&L flows to equity), probes the
// places a real accountant pokes (AR/AP, depreciation, period lock, currency,
// vendor bills, bank rec), and screenshots every live accounting page.
import {
  launch, makePage, adminLogin, gotoAdmin, navLabels, bodyText, shot,
  odooLogin, api,
} from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const FROM = "2026-01-01";
const TO = "2026-12-31";
const OUT = path.resolve(process.cwd(), "verification/demo-verify");
fs.mkdirSync(OUT, { recursive: true });

function money(n) { return Number(n || 0).toLocaleString("en-US"); }
function bucket(rows) {
  const m = {};
  for (const r of rows || []) {
    const t = r.type || "?";
    m[t] = (m[t] || 0) + Number(r.balance || 0);
  }
  return m;
}

async function main() {
  const findings = [];
  const problems = [];
  const note = (k, v) => { findings.push([k, v]); console.log(`• ${k}: ${v}`); };
  const fail = (msg) => { problems.push(msg); console.log(`  ✗ ${msg}`); };

  // ---------------- Part 1: engine ground truth (no browser) ----------------
  console.log("\n========== ENGINE GROUND TRUTH (as accountant noor) ==========");
  const { cookie, uid } = await odooLogin("noor@miza.iq");
  note("accountant uid", uid);

  const auth = await api("/bayaan/api/auth_status", cookie, {});
  note("roles", JSON.stringify(auth?.roles || auth?.user?.roles || auth));
  note("vatRate on auth", auth?.vatRate ?? auth?.user?.vatRate ?? "(none)");

  const common = { dateFrom: FROM, dateTo: TO };
  const gl = await api("/bayaan/api/accounting_report", cookie, { payload: { ...common, report: "ledger", limit: 2000 } });
  const journals = await api("/bayaan/api/accounting_report", cookie, { payload: { ...common, report: "journals", limit: 1000 } });
  const tb = await api("/bayaan/api/accounting_report", cookie, { payload: { ...common, report: "trial_balance" } });
  const pnl = await api("/bayaan/api/accounting_report", cookie, { payload: { ...common, report: "pnl" } });
  const bs = await api("/bayaan/api/accounting_report", cookie, { payload: { dateTo: TO, report: "balance_sheet" } });
  const chart = await api("/bayaan/api/accounting_report", cookie, { payload: { dateTo: TO, report: "chart" } });

  note("currency", gl?.meta?.currency || "(?)");
  note("company", gl?.meta?.company || "(?)");

  // GL
  note("GL lines returned", `${gl?.rows?.length} (truncated=${gl?.truncated})`);
  note("GL totals", `debit ${money(gl?.totals?.debit)} / credit ${money(gl?.totals?.credit)}`);

  // Journals: which journals feed the books?
  const jrCount = {};
  for (const r of journals?.rows || []) {
    const key = `${r.journal} (${r.journalName})`;
    jrCount[key] = (jrCount[key] || 0) + 1;
  }
  note("journal entry count", journals?.rows?.length);
  note("journals feeding books", JSON.stringify(jrCount));

  // Trial balance — THE fundamental check
  const tbBalanced = Math.abs((tb?.totals?.debit || 0) - (tb?.totals?.credit || 0)) < 1;
  note("TRIAL BALANCE debit==credit", `${tbBalanced ? "YES" : "NO!!"} (D ${money(tb?.totals?.debit)} vs C ${money(tb?.totals?.credit)})`);
  note("TB accounts", tb?.rows?.length);

  // Balance sheet
  note("BS assets", money(bs?.totals?.assets));
  note("BS liabilities", money(bs?.totals?.liabilities));
  note("BS equity (incl net income)", money(bs?.totals?.equity));
  note("BS L+E", money(bs?.totals?.liabilitiesAndEquity));
  note("BS net income", money(bs?.netIncome));
  note("BS balanced flag", bs?.totals?.balanced);
  const bsDelta = Math.abs((bs?.totals?.assets || 0) - (bs?.totals?.liabilitiesAndEquity || 0));
  note("BS A-(L+E) delta", money(bsDelta));

  // P&L
  note("P&L revenue", money(pnl?.totals?.revenue));
  note("P&L cogs", money(pnl?.totals?.cogs));
  note("P&L gross profit", money(pnl?.totals?.grossProfit));
  note("P&L opex", money(pnl?.totals?.opex));
  note("P&L net profit", money(pnl?.totals?.netProfit));
  const pnlTiesBs = Math.abs((pnl?.totals?.netProfit || 0) - (bs?.netIncome || 0)) < 1;
  note("P&L net == BS net income", `${pnlTiesBs ? "YES" : "NO"} (${money(pnl?.totals?.netProfit)} vs ${money(bs?.netIncome)})`);
  note("revenue > 0 (sales hit the books)", (pnl?.totals?.revenue || 0) > 0 ? "YES" : "NO!!");

  // Chart bucket by type — probe AR/AP/depreciation/fixed assets
  const byType = bucket(chart?.rows);
  note("chart account count", chart?.rows?.length);
  note("accounts by type (balance)", JSON.stringify(Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, money(v)]))));
  note("AR (asset_receivable) balance", money(byType.asset_receivable || 0));
  note("AP (liability_payable) balance", money(byType.liability_payable || 0));
  note("fixed assets (asset_fixed) balance", money(byType.asset_fixed || 0));
  note("DEPRECIATION expense posted", money(byType.expense_depreciation || 0) + "  (0 => never posted to books)");

  // ---------------- Part 2: gap probes (expect errors / absence) ------------
  console.log("\n========== GAP PROBES (routes a real accountant expects) ==========");
  async function probe(route, payload, label) {
    try {
      const r = await api(route, cookie, { payload });
      const isErr = r && (r.code || r.message || r.data);
      note(label, isErr ? `ERROR: ${(r.message || JSON.stringify(r)).slice(0, 120)}` : `OK: ${JSON.stringify(r).slice(0, 120)}`);
    } catch (e) { note(label, `THREW: ${String(e.message).slice(0, 120)}`); }
  }
  // These reports are now REQUIRED (the gaps are filled) — an error here fails the audit.
  async function require_ok(route, payload, label) {
    try {
      const r = await api(route, cookie, { payload });
      const isErr = r && (r.code || r.message || r.data);
      if (isErr) { fail(`${label} errored: ${(r.message || JSON.stringify(r)).slice(0, 120)}`); return null; }
      note(label, `OK: ${JSON.stringify(r).slice(0, 100)}`);
      return r;
    } catch (e) { fail(`${label} threw: ${String(e.message).slice(0, 120)}`); return null; }
  }
  const cf = await require_ok("/bayaan/api/accounting_report", { report: "cash_flow", dateFrom: FROM, dateTo: TO }, "cash flow statement");
  // This is an arithmetic tie-out (cash-flow closing == cash/bank GL balance), NOT a bank
  // reconciliation. Bank reconciliation against external statements is not implemented in
  // Bayaan (see the explicit scope note below).
  if (cf && !cf.totals?.reconciled) fail(`cash flow does not tie to the cash/bank GL balance (closing ${cf.closing} vs ${cf.totals?.cashBalance})`);
  await require_ok("/bayaan/api/accounting_report", { report: "aged_receivable", dateTo: TO }, "aged receivable report");
  await require_ok("/bayaan/api/accounting_report", { report: "aged_payable", dateTo: TO }, "aged payable report");
  await require_ok("/bayaan/api/accounting_report", { report: "tax_report", dateFrom: FROM, dateTo: TO }, "tax/VAT return report");
  await require_ok("/bayaan/api/company_config", { action: "read" }, "company / fiscal-lock config route");
  await require_ok("/bayaan/api/tax_settings", {}, "tax/VAT settings route");
  // register_payment mutates (settles a bill), so a read probe is invalid; instead confirm
  // the engine advertises the accountant's registerPayment capability.
  const caps = auth?.user?.capabilities || auth?.capabilities || {};
  note("registerPayment capability", String(caps.registerPayment ?? "(none)"));
  // HONEST SCOPE NOTE: statement-level bank reconciliation is NOT implemented in Bayaan.
  // It is performed in the accounting engine and is on the Bayaan roadmap. We surface this
  // explicitly (rather than silently passing) so the audit never implies a capability the
  // product does not yet have. The route is expected to be absent.
  note("bank reconciliation", "NOT IMPLEMENTED IN BAYAAN — performed in the accounting engine (known scope limitation; on roadmap)");
  await probe("/bayaan/api/bank_reconcile", { action: "read" }, "bank reconciliation route (expected absent — see scope note)");
  // Trial balance + balance sheet + P&L tie-outs are hard requirements.
  if (!tbBalanced) fail(`trial balance does not balance (D ${tb?.totals?.debit} vs C ${tb?.totals?.credit})`);
  if (!bs?.totals?.balanced || bsDelta >= 1) fail(`balance sheet does not balance (A-(L+E) delta ${bsDelta})`);
  if (!pnlTiesBs) fail(`P&L net (${pnl?.totals?.netProfit}) != BS net income (${bs?.netIncome})`);

  // ---------------- Part 3: live UI screenshots ----------------------------
  console.log("\n========== LIVE UI (logged in as accountant) ==========");
  const browser = await launch();
  const page = await makePage(browser);
  const shots = [];
  try {
    await adminLogin(page, "noor@miza.iq");
    const labels = await navLabels(page);
    note("accountant nav labels", labels.join(" | "));

    const pages = [
      ["Finance overview", "aud-finance"],
      ["General ledger", "aud-gl"],
      ["Journal entries", "aud-journals"],
      ["Trial balance", "aud-trial"],
      ["Income & Balance", "aud-statements"],
      ["Cash flow", "aud-cashflow"],
      ["Aged payables", "aud-aged-payable"],
      ["Aged receivables", "aud-aged-receivable"],
      ["VAT / tax return", "aud-tax"],
      ["Chart of accounts", "aud-coa"],
      ["Settings", "aud-settings"],
    ];
    for (const [label, file] of pages) {
      const ok = await gotoAdmin(page, label);
      await page.waitForTimeout(1200);
      const s = await shot(page, file);
      shots.push(s);
      const t = (await bodyText(page)).replace(/\s+/g, " ").slice(0, 260);
      note(`UI '${label}'`, ok ? `shown — ${t}` : "NOT in nav");
      if (!ok) fail(`accountant page '${label}' is not reachable from the nav`);
    }

    // On the statements page, flip to the Balance sheet tab and screenshot.
    await gotoAdmin(page, "Income & Balance");
    await page.waitForTimeout(800);
    const balTab = page.getByRole("button", { name: /Balance sheet|الميزانية/ }).first();
    if (await balTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await balTab.click();
      await page.waitForTimeout(800);
      shots.push(await shot(page, "aud-balancesheet"));
    }

    // ---- Dark-mode walkthrough (theme does not change language, so English nav labels
    //      still resolve; walk the key accounting pages and prove dark renders) ----
    const keyPages = ["General ledger", "Trial balance", "Income & Balance", "Cash flow", "Chart of accounts"];
    const darkBtn = page.getByRole("button", { name: "Dark theme" }).first();
    if (await darkBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await darkBtn.click();
      await page.waitForTimeout(500);
      const theme = await page.locator(".app-frame").first().getAttribute("data-theme").catch(() => null);
      note("Dark mode", theme === "dark" ? "app-frame data-theme=dark ✓ (walking key pages)" : `data-theme=${theme}`);
      if (theme !== "dark") fail("Dark theme toggle did not apply (data-theme != dark)");
      for (const label of keyPages) { await gotoAdmin(page, label); await page.waitForTimeout(500); }
      shots.push(await shot(page, "aud-dark"));
      const lightBtn = page.getByRole("button", { name: "Light theme" }).first();
      if (await lightBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await lightBtn.click(); await page.waitForTimeout(300); }
    } else {
      fail("Dark theme toggle not found in the admin shell");
    }

    // ---- Arabic RTL (nav localizes to Arabic; assert the frame flips to RTL and the
    //      accounting workspace renders in Arabic without console errors) ----
    const arBtn = page.getByRole("button", { name: "AR", exact: true }).first();
    if (await arBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await arBtn.click();
      await page.waitForTimeout(700);
      const dir = await page.locator(".app-frame").first().getAttribute("dir").catch(() => null);
      const arLabels = await navLabels(page);
      note("Arabic RTL", dir === "rtl" ? `app-frame dir=rtl ✓ (Arabic nav: ${arLabels.slice(0, 4).join(" | ")})` : `dir=${dir}`);
      if (dir !== "rtl") fail("Arabic toggle did not switch the app to RTL (dir != rtl)");
      shots.push(await shot(page, "aud-ar-rtl"));
      const enBtn = page.getByRole("button", { name: "EN", exact: true }).first();
      if (await enBtn.isVisible({ timeout: 1000 }).catch(() => false)) await enBtn.click();
    } else {
      fail("Arabic (AR) language toggle not found in the admin shell");
    }

    const errs = (page._errors || []).filter(Boolean);
    note("console/page errors", errs.length ? errs.slice(0, 5).join(" || ") : "none");
    if (errs.length) fail(`accountant UI produced ${errs.length} console/page error(s): ${errs.slice(0, 3).join(" || ")}`);
  } catch (e) {
    note("UI walkthrough exception", String(e.message).slice(0, 200));
    shots.push(await shot(page, "aud-error"));
    fail(`UI walkthrough exception: ${String(e.message).slice(0, 160)}`);
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT, "accountant-audit.json"),
    JSON.stringify({ findings, problems, gl: gl?.totals, tb: tb?.totals, bs: bs?.totals, pnl: pnl?.totals, byType }, null, 2));
  console.log(`\nScreenshots: ${shots.join(", ")}`);
  console.log(`Saved: ${path.join(OUT, "accountant-audit.json")}`);
  if (problems.length) {
    console.error(`\nACCOUNTANT AUDIT FAILED with ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nAccountant audit passed: every accounting page loads, all reports tie, no console errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
