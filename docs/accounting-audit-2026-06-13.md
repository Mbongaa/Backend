# Bayaan Accounting System Audit

Date: 2026-06-13  
Persona: skeptical client accountant  
Scope: live UI walkthrough, accountant-role permission probes, Odoo accounting trace, and release-gate verification

## Executive Verdict

**Status: RED for a hostile accountant demo.**

Bayaan has a sound formal-accounting foundation: its General Ledger, Journal Entries, Trial Balance, Income Statement, Balance Sheet, and Chart of Accounts read posted Odoo `account.move` / `account.move.line` records (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4169`). Manual journals are balanced before posting (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4617`), lock dates are enforced (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:14`), and deletion of accounting entries is blocked (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:38`).

However, Bayaan is not yet a complete daily accounting replacement for Odoo. The live database currently produces materially different formal and operational profit figures, branch financial statements are out of balance, supplier invoices do not create vendor bills, payroll and operating expenses do not post to the ledger, and several manager-only actions are shown as enabled to the accountant.

The client accountant can expose these weaknesses during the demo without opening Odoo.

## Live Accounting Inventory

Accountant-facing formal pages:

1. General Ledger
2. Journal Entries with drill-down, manual posting, and reversal
3. Trial Balance
4. Income Statement
5. Balance Sheet
6. Chart of Accounts
7. VAT, company, fiscal-year, and period-lock settings

Supporting pages visible to the accountant:

1. Sales & POS Monitor
2. Daily Close & Variance
3. Purchases & Suppliers
4. Staff, payroll, and operating expenses
5. Finance overview
6. Management Reports

The formal pages are wired through `/bayaan/api/accounting_report` (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:19010`) and the accountant navigation is explicitly enabled by the backend (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:218`).

## Live Figures

Period checked: 2026-06-01 through 2026-06-13.

| Measure | Formal Odoo books | Bayaan operational report |
|---|---:|---:|
| Revenue | IQD 1,086,000 | IQD 4,101,800 |
| COGS | IQD 0 | IQD 530,935 |
| Operating expenses | IQD 980,000 | IQD 685,000 |
| Payroll | Not posted | IQD 2,921,666.67 |
| Net result | IQD 106,000 profit | IQD 261,851.67 loss |
| Orders | Reflected only through posted sessions | 601 paid orders |

Other live facts:

- 210 posted General Ledger lines.
- 102 posted journal entries, including numerous test and reversal entries.
- 57 Chart of Accounts rows.
- 12 operational daily closes.
- 1,893 recipe-consumption rows.
- Formal Balance Sheet: IQD 586,000 assets, IQD 0 liabilities, IQD 586,000 equity.
- Formal Balance Sheet includes negative POS receivables of IQD 5,880,800.

The operational report calculates revenue from paid `pos.order`, COGS from the custom consumption ledger, payroll from salary accruals, and expenses from custom Bayaan records (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:6445`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:6460`). The formal statements calculate only posted accounting moves (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4382`).

## Demo-Blocking Gaps

### P0-1: Daily close does not close the Odoo POS session

The normal `/bayaan/api/shift_close` path creates a `bayaan.shift.close`, calculates variance, and returns without closing the linked `pos.session` (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:8307`). Odoo accounting entries are therefore delayed until a separate stale-session auto-close path runs (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:273`).

This is the clearest cause of the live IQD 3,015,800 revenue difference. A completed Bayaan daily close must transactionally finalize the corresponding Odoo POS session, or visibly fail and remain unapproved.

### P0-2: Branch Trial Balance and Balance Sheet are out of balance

The kiosk filter keeps only move lines carrying the branch analytic account (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4217`). Cash, receivable, payable, and equity counterpart lines commonly have no analytic distribution, by design (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:49`).

Live K-01 result:

- Trial Balance debit: IQD 2,741,000
- Trial Balance credit: IQD 2,395,000
- Balance Sheet assets: IQD 480,000
- Balance Sheet liabilities plus equity: IQD 134,000

The existing test even confirms that the kiosk-filtered ledger includes the income line but excludes the cash line (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_accounting_report_api.py:119`). Branch GL may be useful as a cost-center report, but it must not be labeled Trial Balance or Balance Sheet until balanced branch attribution exists.

### P0-3: Supplier “invoice” flow does not create a vendor bill

The purchase flow creates and confirms `purchase.order` and receives stock (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:7890`). The invoice-commit path creates a supplier, PO, attachment, and warehouse receipt, but no `account.move` vendor bill (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:8088`).

Consequences:

- No Accounts Payable balance.
- No vendor bill approval.
- No due dates or payment terms.
- No register-payment flow.
- No aged payable report.
- No vendor credit notes.
- No three-way match between PO, receipt, and bill.

Calling this action “Upload invoice” is misleading to an accountant.

### P0-4: Payroll and operating expenses are outside the official books

`bayaan.operating.expense` stores a custom expense record only (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4067`). Payroll approval changes a custom run state, and “Mark paid” only sets `state = "paid"` (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_hr_payroll.py:508`).

Neither action creates an expense accrual, payable, cash/bank payment, or journal entry. The operational P&L therefore includes costs absent from the formal Odoo P&L.

### P0-5: Standard accountant workflows are missing

The API rejects `cash_flow`, `aged_receivable`, `aged_payable`, and `tax_report` as unsupported accounting reports. There is no Bayaan-native bank reconciliation, customer/vendor aging, payment registration, bank statement import, vendor bill workflow, tax return report, or formal cash-flow statement.

The Settings page explicitly says bank reconciliation, multi-currency, and chart import remain in Odoo (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:19941`). That directly contradicts the product goal that the client should not need to open Odoo.

### P0-6: Accountant UI exposes manager/logistics actions

The accountant sees:

- Daily-close Approve and Reject buttons.
- Review, Approve, and Mark Paid payroll buttons.
- Payroll adjustment approval buttons.
- Upload Invoice, receive PO, recurring purchase, and Add Supplier actions.
- VAT Apply.
- Global New Transfer and Approvals buttons.

The backend correctly denies many of these actions. The live Playwright probe of Review Payroll returned “Only Bayaan managers can run payroll” (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5217`). The UI renders those buttons without role capability checks (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:17638`). Global transfer actions are also unconditional (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:20115`).

This makes the product look unfinished and invites the accountant to test permissions during the demo.

### P0-7: Accounting write authority is too broad

The accountant’s Odoo group implies read-only accounting (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:26`), but sudo-backed Bayaan routes allow the accountant to post journals, reverse any posted company move, and reclassify account types (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4548`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4655`).

Risks:

- A POS, bank, purchase, or system-generated entry can be reversed from the generic journal screen.
- No reversal reason or approval is required.
- A posted account can be changed from asset to expense or another type, rewriting historical statement classification.
- An accountant can clear a period lock because the lock is reversible and accountant-accessible (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4987`).

### P0-8: Demo database is not accountant-clean

The current journals contain repeated “UI accountant test,” cleanup reversals, and repeated espresso-machine capitalization/reversal entries. The Chart of Accounts contains unrelated template accounts such as furniture-shop, clothes-shop, and bakery cash accounts.

The live formal Balance Sheet has zero liabilities, negative POS receivables, and no COGS despite 601 paid orders. Even after code fixes, the demo database needs a controlled opening balance, closed sessions, matched payments, realistic AP, posted COGS, and reconciled reports.

## Important P1 Gaps

1. CapEx capitalization posts to the ledger, but depreciation is only a managerial calculation and does not create depreciation expense or accumulated-depreciation entries (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk_capex.py:200`).
2. The General Ledger shows one running balance across all accounts; that balance is meaningful only when one account is filtered (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4282`).
3. Manual journals lack journal selection in the UI, partner, attachment, tax, currency, and reconciliation fields.
4. “Print / PDF” invokes browser print rather than producing an immutable, numbered, server-generated accounting report (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:19072`).
5. The report Schedule button reports that a source-backed scheduler is still needed.
6. Sales monthly view displays 601 orders while its subtitle remains “0 source orders / 0 payment rows.”
7. The Sales page can show “Needs review 171” together with “all posted,” which is contradictory.
8. The trial balance shows a signed closing balance rather than separate closing debit and closing credit columns.
9. VAT settings make an unqualified jurisdictional assumption. The client’s accountant or tax adviser must sign off the Iraqi tax configuration before the demo.

## What Is Strong

1. Formal statements read the real posted Odoo ledger, not a second accounting database.
2. Manual journals reject unbalanced entries.
3. Posted moves cannot be deleted through normal workflows.
4. Fiscal lock dates block retroactive posting.
5. Daily close captures expected versus counted cash, card, stock, and ingredient variance.
6. Close approval blocks missing or failed recipe consumption and locks approved closes (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:8424`).
7. Arabic accounting labels and RTL mode are present.
8. CSV export and drill-down from journals to lines work.
9. Browser console inspection found no warnings or errors during the walkthrough.

## Required Remediation Order

1. Make manual Bayaan close finalize the exact Odoo POS session and add a reconciliation assertion: paid POS revenue equals posted sales revenue for all closed periods.
2. Post recipe COGS, payroll accrual/payment, operating expenses, and purchase/vendor bills into Odoo accounting.
3. Remove branch Trial Balance and Balance Sheet until all counterpart lines have a reliable branch dimension, or implement balanced branch allocation.
4. Build the minimum daily accountant workspace: vendor bills, AP aging, payment registration, bank/cash reconciliation, AR aging, tax report, and cash-flow report.
5. Add capability-driven UI hiding/disabling for every write action.
6. Restrict reversals to eligible manual entries or add typed workflows, reason, attachment, and approval.
7. Block account-type changes after postings, or require a governed migration workflow.
8. Post real depreciation or clearly remove depreciation/NBV from the formal-accounting claim.
9. Clean and reseed a golden demo company; reconcile every report before the meeting.
10. Add cross-ledger tests for POS-to-GL, COGS-to-GL, payroll-to-GL, expense-to-GL, AP, and branch balance.

## Verification Status

- Playwright accountant walkthrough: completed in the live app.
- Browser console warnings/errors: none observed.
- Vitest: 17 files and 191 tests passed.
- Production build: passed, with a large-chunk warning.
- Wiring gate: failed with 11 live/demo integrity violations.
- Smoke test: failed waiting for `[data-testid='mod-size-large']`.
- Odoo addon gate: not run; available WSL environments lack Docker and the required Odoo virtualenv.
- `AGENTS.md` and `CLAUDE.md`: verified identical.

Evidence is stored in `apps/kiosk-pos/verification/accountant-audit-2026-06-13/`.

## Demo Recommendation

Do not present Bayaan as a complete standard accounting replacement in its current state. A skeptical accountant can demonstrate contradictory profit figures, unbalanced branch statements, missing AP/bank workflows, and role-button failures directly in Bayaan.

After P0-1 through P0-8 are closed and a golden database reconciles operational totals to the formal ledger, the strongest demo story is:

1. Sale recorded in Bayaan POS.
2. Recipe and stock consumption posted.
3. Cash/card payment visible.
4. Daily close counted and approved.
5. Odoo POS session finalized automatically.
6. Revenue, COGS, cash/bank, variance, and profit reconcile from order to journal to Trial Balance and statements.
7. Supplier bill, payroll, and operating expense follow the same traceable path.

That end-to-end trace is what will convince an accountant, not the number of screens.
