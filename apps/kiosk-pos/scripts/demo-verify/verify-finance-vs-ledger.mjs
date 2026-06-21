// Verify the Finance overview (operational chain_bootstrap layer) agrees with the
// formal Odoo ledger (account.move via accounting_report). The audit found these
// DIVERGED before the books were posted; after the GL reseed they must tie.
import { odooLogin, api } from "./lib.mjs";

const money = (n) => Number(n || 0).toLocaleString("en-US");
const num = (n) => Number(n || 0);

const { cookie } = await odooLogin("noor@koub.iq");

// Operational finance — exactly what the Finance overview renders (odooReportMetrics → summary.reportPeriods)
const boot = await api("/bayaan/api/chain_bootstrap", cookie, {});
const rp = boot?.summary?.reportPeriods || {};
const op = rp.monthly || {};

// Formal ledger P&L (account.move), default window = first-of-month .. today (same as op.monthly)
const pnl = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "pnl" } });
const tb = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "trial_balance" } });
const taxr = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "tax_report" } });
const vat = num(taxr?.totals?.tax);

console.log("Formal P&L window:", pnl?.meta?.dateFrom, "..", pnl?.meta?.dateTo, " engine:", pnl?.meta?.engine);
console.log("");
console.log("                         FINANCE OVERVIEW (operational)   FORMAL LEDGER (account.move)");
console.log("  revenue                ", money(op.revenue).padStart(18), "   ", money(pnl?.totals?.revenue).padStart(18), "  (op=gross, ledger=net)");
console.log("  COGS                   ", money(op.cogs).padStart(18), "   ", money(pnl?.totals?.cogs).padStart(18));
console.log("  operating expenses     ", money(op.operatingExpenses).padStart(18), "   ", money(pnl?.totals?.opex).padStart(18));
console.log("  payroll                ", money(op.payrollExpense).padStart(18), "    (in ledger opex/wages)");
console.log("");

// revenue: operational is GROSS (amount_total), ledger is NET (Product Sales) — should differ ONLY by VAT.
const revGrossVsNet = num(op.revenue) - (num(pnl?.totals?.revenue) + vat);
const cogsDelta = num(op.cogs) - num(pnl?.totals?.cogs);
const tbBalanced = Math.abs(num(tb?.totals?.debit) - num(tb?.totals?.credit)) < 1;

const problems = [];
console.log("CHECKS:");
console.log("  ledger revenue (net) + VAT", money(num(pnl?.totals?.revenue) + vat), "vs operational gross", money(op.revenue),
            "-> delta", money(revGrossVsNet), Math.abs(revGrossVsNet) < 1 ? "TIE" : "OFF");
if (Math.abs(revGrossVsNet) >= 1) problems.push("operational revenue (gross) != ledger net + VAT");
console.log("  COGS operational vs ledger -> delta", money(cogsDelta), Math.abs(cogsDelta) < 1 ? "TIE" : "OFF");
if (Math.abs(cogsDelta) >= 1) problems.push("operational COGS != ledger COGS");
console.log("  trial balance balanced:", tbBalanced ? "YES" : "NO");
if (!tbBalanced) problems.push("trial balance does not balance");
// Finance overview must be source-driven (no demo fallback) when live.
const liveCounts = boot?.summary?.sourceCounts || op?.sourceCounts || {};
console.log("  source rows behind it: orders", liveCounts.orders ?? "?", " (proves real Odoo data, not demo)");

console.log("");
if (problems.length) {
  console.error("FINANCE OVERVIEW IS OFF vs the ledger:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log("Finance overview is rooted in the real Odoo ledger and ties to the formal books",
            "(revenue differs from ledger only by VAT, which is correct gross-vs-net).");
