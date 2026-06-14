# Accounting Remediation Handoff

**Date:** 2026-06-13  
**Audience:** Coding agent responsible for completing Bayaan accounting  
**Current gate:** RED  
**Mission:** Make Bayaan a trustworthy daily accounting workspace whose official
records remain in Odoo Community 19.0, without requiring the client's accountant
to open the Odoo UI.

This document is the active implementation handoff for accounting remediation.
For this work, it supersedes accounting readiness claims in `HANDOFF.md`,
`docs/production-gap-plan.md`, and the point-in-time conclusions in
`docs/accounting-audit-2026-06-13.md`. Re-read the code and rerun every gate
before updating any status.

## Non-Negotiable Rules

1. Odoo is the only accounting, POS, stock, AP, AR, and payment source of truth.
2. Do not edit Odoo core under `backend/odoo/` or the external Odoo runtime.
   Changes belong in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/`.
3. Do not create a second official accounting ledger in the React application.
4. Never change an Odoo workflow state with raw SQL.
5. A failed accounting operation must fail visibly and atomically. Do not log
   and continue as if the business operation succeeded.
6. Never make a red gate green by weakening an assertion, hiding a button only,
   deleting coverage, or changing expected data to match a defect.
7. Permission enforcement must exist on the server. UI capability checks are
   required in addition to, not instead of, server checks.
8. Preserve the user's dirty worktree. Do not revert or overwrite unrelated
   changes. Inspect `git status --short` before every editing round.
9. Keep `AGENTS.md` and `CLAUDE.md` identical whenever either is edited.
10. Every completion claim must include a verified command, browser evidence,
    or database reconciliation. Cite the final evidence as `path:line`.

## Verified Starting State

The following was verified on 2026-06-13 and must be reproduced before fixes.

### Working pieces

- Frontend unit tests passed: 17 files and 191 tests.
- `npm run build` passed, with only a large-chunk warning.
- Live company-wide trial balance and balance sheet tied at the time of audit.
- Income statement net income tied to balance-sheet current earnings.
- General ledger, journal entries, trial balance, income statement, balance
  sheet, chart of accounts, cash report, aging reports, and tax report load.
- Real vendor bills and AP balances now exist.
- Manual journal entry creation and backend reversal governance exist.
- Payroll, operating expense, CapEx, and depreciation posting code exists.

These positives do not override the stop-ship defects below.

### Failing gates

- `npm run verify` failed the wiring gate with 11 failures.
- `npm run smoke` failed because the header logo was reported as not loaded.
- `npm run smoke:live` could not start because Playwright Chromium was missing.
- The clean disposable Odoo addon run had 3 failures:
  - reversal test omitted the newly required reason;
  - HR/payroll fixtures used fixed May 2026 dates while APIs queried June 2026.
- Python compilation passed.

### Live database warning

Recent POS sessions were marked closed without an Odoo session accounting move.
The audit found closed sessions containing hundreds of orders with
`move_id = 0`. The custom daily MISC entries currently make top-level reports
look balanced, but they do not prove that the official Odoo POS close workflow
ran.

## Stop-Ship Findings

### P0.1 POS sessions are closed with raw SQL

Two code paths bypass the official Odoo POS close workflow:

- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:8534`
  posts custom daily entries, searches every open session for the kiosk config,
  and executes `UPDATE pos_session` at `api.py:8551`. The entire block catches
  all exceptions and lets the shift close continue at `api.py:8555`.
- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:288`
  also executes `UPDATE pos_session`.

This bypasses Odoo checks and side effects such as order validation, invoices,
pickings, valuation/cost handling, session account moves, cash differences,
posting, reconciliation, and final order state transitions.

#### Required implementation

- Remove both raw SQL session-state updates.
- Identify the exact `pos.session` linked to the submitted close and its orders.
  Do not close every open session sharing a `pos.config`.
- Use the official Odoo 19 ORM closing workflow. Inspect the actual runtime
  implementation before selecting methods:
  `/home/hassan/bayaan-odoo/addons/point_of_sale/models/pos_session.py`.
- Make the close atomic. If the official POS close fails, the Bayaan daily close
  must fail, display the reason, and write an audit event. It must not claim
  success.
- Choose one authoritative revenue/tax posting path:
  - Prefer the official Odoo POS session accounting move.
  - Remove or disable duplicate custom revenue posting when Odoo posts revenue.
  - If any custom move remains, document why Odoo cannot own that posting and
    prove there is no duplicate or missing revenue, tax, receivable, cash, bank,
    stock valuation, or COGS.
- Keep recipe consumption and the variance loop intact.

#### Acceptance

- `rg -n "UPDATE pos_session" backend/bayaan_odoo_addons` returns no workflow
  state mutation.
- A paid session cannot become closed if the official close raises an error.
- A successful closed session has the expected posted accounting move and all
  paid orders reach the correct final Odoo state.
- Cash, card, mixed-payment, invoiced, refunded, and stockable-product sessions
  reconcile to their accounting moves.
- Closing one session never closes another session on the same configuration.
- Repeating a close request is idempotent and creates no duplicate moves.

### P0.2 Custom daily posting loses later transactions

`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_gl.py:145` treats a
posted move `ref` as the idempotency key. COGS, revenue, and waste aggregate by
kiosk and day and use one daily reference at `bayaan_gl.py:249`,
`bayaan_gl.py:310`, and `bayaan_gl.py:504`.

After the first move posts, a second shift, late order, late waste entry, or
back-dated correction on the same kiosk/day cannot update the official amount.

#### Required implementation

- Do not use a kiosk/day aggregate reference as the sole source marker.
- Prefer official Odoo source documents and accounting hooks.
- For Bayaan-only postings, make idempotency source-based:
  - one immutable source record maps to one posting; or
  - maintain explicit posted source IDs and post only the delta.
- Define the business-date and timezone rule for shifts crossing midnight.
- Ensure refunds and reversals post as explicit correcting documents.

#### Acceptance

- Two sessions on the same kiosk/day both reach the books exactly once.
- A late order and a late waste entry post exactly once after an earlier close.
- Re-running the posting job creates no duplicate and loses no new source row.
- Tests cover retry after a transaction rollback.

### P0.3 Configurable VAT is not posted by custom POS revenue

Tax settings support non-zero rates at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4997`, but custom
POS revenue credits the full payment to Product Sales at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_gl.py:282`. It does
not create a tax-liability line. The tax report reads real tax/base lines at
`api.py:4520`, so a non-zero VAT receipt can disagree with the books and return.

#### Required implementation

- Make Odoo tax computation authoritative for POS lines and accounting.
- If prices are tax-inclusive, split gross payment into net sales and tax.
- If prices are tax-exclusive, ensure the customer total includes computed tax.
- Preserve product tax IDs, tax base lines, and tax liability lines through POS
  close, refunds, and reports.
- Do not advertise a configurable non-zero rate until this is proven.

#### Acceptance

- Automated scenarios for 0%, 5%, and 10% VAT, including tax-inclusive and
  tax-exclusive pricing.
- For each scenario: receipt total = POS order total = payment total.
- Revenue + tax liability = gross sale for tax-inclusive sales.
- Tax report base and tax equal the posted move lines.
- Refunds reverse the correct net revenue and tax.

### P0.4 Accountant UI exposes operational powers

The accountant navigation currently includes closing, suppliers, staff, and
settings at `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:218`.
The screen construction at
`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:20776` does not pass a common
capability model into these screens.

The accountant browser audit showed controls for:

- New Transfer and approvals.
- Daily close approve/reject.
- Purchase receive, Upload invoice, Add supplier, and Schedule.
- Staff creation and attendance operations.
- Payroll adjustment, review, approve, mark paid, and expense operations.

Examples are visible at `ExactKioskApp.jsx:14853`, `:16210`, `:16327`,
`:17646`, `:17649`, and `:20275`.

#### Required role matrix

Implement named server capabilities and consume them in the UI. Do not infer
write permission from whether a page is in navigation.

| Capability | Accountant | Manager/Owner | Warehouse | Cashier |
| --- | --- | --- | --- | --- |
| Read accounting books | Yes | Yes | No | No |
| Post balanced manual journal | Yes | Yes | No | No |
| Reverse eligible manual journal | Yes | Yes | No | No |
| Manage chart of accounts | Yes | Yes | No | No |
| Register AP/AR payment | Yes | Yes | No | No |
| View sales, closes, suppliers, staff | Read only | Yes | Scoped | Scoped |
| Approve/reject daily close | No | Yes | No | No |
| Receive stock or progress transfers | No | Yes | Yes | No |
| Create suppliers or purchase orders | No | Yes | As approved | No |
| Create/edit staff or attendance | No | Yes | No | Self/scoped only |
| Approve or mark payroll paid | No | Yes | No | No |
| Change company/VAT configuration | No | Yes | No | No |

If the business owner approves a different matrix, update this table and tests
in the same change. Do not silently broaden permissions.

#### Acceptance

- Server tests prove every disallowed role receives an authorization error.
- UI controls are absent or disabled from server-supplied capabilities.
- Direct API calls remain denied even if a user manipulates the browser.
- Accountant screenshots show read-only operational pages and only accounting
  actions listed above.
- Owner, manager, warehouse, and cashier regression walkthroughs pass.

### P0.5 Journal reversal frontend does not meet backend contract

The backend restricts reversal to manual general-journal entries and requires a
reason at `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4651`.
The frontend gateway only accepts an ID at
`apps/kiosk-pos/src/services/sourceOfTruth.ts:611` and
`sourceOfTruth.ts:1317`. The detail modal displays reversal too broadly and
sends no reason at `ExactKioskApp.jsx:18985` and `:19881`.
The current backend test also omits the reason at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_accounting_report_api.py:233`.

#### Required implementation

- Change the gateway contract to accept `{ id, reason, date? }`.
- Add a required reason field and explicit confirmation in the modal.
- Serialize `canReverse` and an ineligible reason from the backend, or reproduce
  exactly the same eligibility rule in a shared capability response.
- Never show Reverse for POS, bank, purchase, payroll, CapEx, COGS, waste, tax,
  or other system-generated entries.
- Keep the original and reversal linked and visible in drill-down.

#### Acceptance

- Eligible manual entry reverses with a non-empty reason.
- Missing reason is blocked in UI and server.
- System and operational entries cannot be reversed through this endpoint.
- Reversal respects fiscal lock dates.
- Audit log records actor, timestamp, original entry, reversal, and reason.

### P0.6 Vendor bills can overbill partial receipts

`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_gl.py:548` uses
`line.qty_received or line.product_qty`. A zero received quantity therefore
falls back to the full ordered quantity.

The generated bill also uses today's date at `bayaan_gl.py:565` and does not
carry all supplier-invoice metadata into `account.move`. Invoice attachments
are attached to the PO in `controllers/api.py:901`, but are not preserved on
the bill. A backend payment route exists at `controllers/api.py:4769`, while the
frontend gateway and aged-payables UI have no complete payment action.

#### Required implementation

- Bill only the eligible quantity:
  `max(qty_received - qty_invoiced, 0)` or the Odoo-native invoice quantity
  workflow. Never replace zero received with ordered quantity.
- Support partial receipt, second receipt, partial billing, and multiple bills.
- Preserve supplier invoice number/reference, invoice date, due date/payment
  terms, currency, attachment, supplier, PO origin, and received products.
- Do not auto-pay unless the user explicitly confirms a payment.
- Add `registerPayment` to the source-of-truth interface and live gateway.
- Add payment from bill detail or aged payables, with payment date, journal,
  amount, memo/reference, and residual validation.
- Select the intended bank/cash journal explicitly. Do not silently use the
  first journal found.

#### Acceptance

- PO for 10 units, receipt of 4 units: no bill line exceeds 4.
- Second receipt of 6 units: cumulative billed quantity never exceeds 10.
- An omitted or zero-received line is not billed.
- Supplier reference, date, terms, and attachment are visible on the real bill.
- Full payment reduces residual to zero and removes the bill from open aging.
- Partial payment updates residual and aging correctly.
- Duplicate payment requests are idempotent.

## Required Accounting Completeness

The items below are required for the "accountant never opens Odoo" promise.
Treat them as P0 for the client demo unless the product owner explicitly narrows
that promise.

### Recurring and opening postings

The methods for opening inventory, depreciation, and expense backfill exist at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_gl.py:334`, `:365`,
and `:464`, but there are no callers outside that file. The addon data currently
defines only alert evaluation and stale-session auto-close crons at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/data/bayaan_alert_data.xml:24`.

Implement:

- A controlled, auditable, one-time opening-balance workflow per company.
- Monthly depreciation scheduling with retry-safe source-based idempotency.
- A deliberate migration/backfill command for historical expenses.
- Lock-date enforcement and clear failure reporting.
- Tests with a frozen date or dates derived from the test context. Do not depend
  on the real calendar month.

### Cash flow statement

The current report at
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4460` groups a
cash line under only the first non-cash counterpart at `api.py:4473`. It does
not classify operating, investing, and financing cash flows.

Implement a deterministic cash-flow statement with:

- operating, investing, and financing sections;
- explicit account or transaction classification;
- opening cash, section subtotals, net movement, and closing cash;
- multi-line entry allocation that does not choose `others[:1]`;
- reconciliation to all cash/bank account closing balances.

### Bank reconciliation

The Settings screen currently says bank reconciliation remains in Odoo at
`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:20090`. That contradicts the
stated product goal.

Implement a Bayaan workflow for:

- selecting the bank journal/account;
- importing or entering statement lines;
- matching, partial matching, and unmatching ledger items;
- posting fees, interest, or adjustments through governed journal entries;
- displaying statement opening, movement, closing, ledger balance, and
  unreconciled difference;
- audit logging all reconciliation actions.

If bank reconciliation will not be implemented before the demo, remove the
"no Odoo at all" promise. Do not hide this gap in copy.

### Period close

Keep the existing company lock integration, but add an accountant workflow:

- period review checklist;
- unresolved POS sessions, missing recipes, failed consumption, unposted bills,
  unreconciled bank items, and unapproved closes must be visible blockers;
- lock date preview;
- manager/owner approval if separation of duties is required;
- reopening requires a reason and audit event.

### Reports and exports

For every accounting report:

- date range and company scope must be visible;
- branch selection must clearly state whether the report is branch analytic or
  company-wide;
- totals must reconcile to drill-down lines;
- CSV and PDF exports must use the same deterministic rows as the UI;
- Arabic RTL output and IQD formatting must be verified;
- empty, loading, permission-denied, and backend-error states must be explicit.

Add the missing top-bar titles for `cashFlow`, `agedPayable`,
`agedReceivable`, and `taxReport`. The title map currently falls back to the
overview title at `ExactKioskApp.jsx:20889`.

## Mandatory End-to-End Scenarios

Automate these where possible and also execute them in the browser against the
live Odoo-backed app.

1. **Cash sale, 0% VAT**
   - Open session, sell a recipe item, take cash, close shift/session.
   - Verify order, payment, recipe ledger, stock deduction, session move, cash,
     sales, COGS, inventory, and variance.
2. **Card and mixed payment**
   - Verify the intended bank/card accounts and session reconciliation.
3. **Tax-inclusive sale**
   - Sell IQD 110 at 10% inclusive VAT.
   - Verify IQD 100 revenue, IQD 10 tax liability, IQD 110 payment, and tax
     report agreement.
4. **Two same-day sessions**
   - Close two sessions for one kiosk on one day.
   - Verify both are posted once and no session is closed accidentally.
5. **Late transaction and retry**
   - Add a valid late order/waste source after an earlier posting.
   - Verify it posts once; retry creates no duplicate.
6. **Refund**
   - Verify revenue, VAT, payment, stock, recipe/consumption policy, and reports.
7. **Partial purchase**
   - Order 10, receive 4, then 6, and verify received and billed quantities.
8. **AP settlement**
   - Register partial and full payments and verify residual and aging.
9. **Manual journal reversal**
   - Reverse an eligible manual entry with a reason.
   - Prove a system-generated entry is blocked.
10. **Period lock**
    - Prove posting/reversal on or before the lock date is blocked.
11. **Depreciation**
    - Run two periods plus a retry and verify one correct cumulative expense.
12. **Role isolation**
    - Login as accountant, manager, warehouse, and cashier.
    - Verify both visible controls and direct API authorization.
13. **Company and branch reports**
    - Reconcile trial balance, P&L, balance sheet, cash flow, aging, and tax.
14. **Arabic and dark mode**
    - Walk every accounting page in Arabic RTL and dark mode.
15. **Failure visibility**
    - Force a backend validation failure and prove the UI does not report
      success or leave a half-completed business transaction.

## Verification Infrastructure To Repair

### Accountant audit script

`apps/kiosk-pos/scripts/demo-verify/accountant-audit.mjs` is stale:

- It calls nonexistent `/bayaan/api/period_lock` at line 111 instead of the
  active company-configuration route.
- It calls `register_payment` with an invalid read action at line 113.
- Its page list at lines 125-132 omits cash flow, aged payables, aged
  receivables, and tax report.

Update it to:

- use current routes and valid non-mutating probes;
- visit every accountant navigation item and every major tab/drill-down;
- collect screenshots, console errors, page errors, failed network responses,
  visible permission controls, and the logged-in role;
- run in English, Arabic RTL, light mode, and dark mode;
- fail non-zero on any missing page, wrong title, broken image, console error,
  unexpected write action, API error, or mock/demo fallback.

### Playwright installation

Install the browser expected by the repository before claiming live smoke:

```powershell
cd "C:\Users\HP\Desktop\Erbil project\Backend\apps\kiosk-pos"
npx playwright install chromium
```

Do not substitute a different browser path silently. Record the installed
Playwright version and executable used.

### Odoo addon test runner

`scripts/odoo-addon-test.sh` assumes the Python executable exists at
`$ODOO_DIR/.venv/bin/python`. The actual verified environment is:

```text
Odoo source: /home/hassan/bayaan-odoo
Python:      /home/hassan/bayaan-venv/bin/python
Config:      /home/hassan/bayaan-odoo.conf
Addon path:  /mnt/c/Users/HP/Desktop/Erbil project/Backend/backend/bayaan_odoo_addons
Database:    bayaan
```

Update the runner to accept an independent `PYTHON_BIN` and an explicit
`ADDONS_PATH`, while retaining its disposable-database guard. Never run the
test suite against the live `bayaan` database.

Example target invocation after the script is fixed:

```bash
ODOO_DIR=/home/hassan/bayaan-odoo \
PYTHON_BIN=/home/hassan/bayaan-venv/bin/python \
ADDONS_PATH=/home/hassan/bayaan-odoo/addons,/mnt/c/Users/HP/Desktop/Erbil\ project/Backend/backend/bayaan_odoo_addons \
DROP_FAILED_DB=1 \
bash scripts/odoo-addon-test.sh
```

### Time-dependent tests

Fix HR/payroll and accounting fixtures that assume May 2026 while production
queries the current month. Use one of:

- a frozen Odoo context date;
- dates derived from `fields.Date.context_today`;
- an explicit report period passed to both setup and assertion.

Do not merely change May to June.

## Required Test Coverage

Expand
`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_accounting_report_api.py`
or split focused accounting test modules. Required coverage:

- official POS session close and failure rollback;
- no duplicate revenue between Odoo and Bayaan;
- same-day multiple sessions and late sources;
- VAT sale and refund reconciliation;
- recipe, finished, hybrid, and none consumption modes;
- partial receipt and partial/multiple vendor billing;
- partial and full AP payment;
- aged payable and receivable residuals;
- cash-flow classification and reconciliation;
- opening balances and monthly depreciation;
- period lock and reopen governance;
- manual reversal eligibility and reason;
- chart-of-accounts restrictions;
- role authorization for every accounting write route;
- company-wide and branch analytic reporting;
- idempotency for every mutating route.

Frontend tests must cover:

- the capability matrix and hidden/disabled actions;
- reversal reason payload;
- AP payment payload and residual refresh;
- report titles and empty/error states;
- no mock fallback in live mode;
- Arabic labels/RTL and keyboard-accessible dialogs.

## Commands Required Before Completion

Run from `apps/kiosk-pos/`:

```powershell
npm test
npm run gate:wiring
npm run build
npm run smoke
npm run smoke:live
npm run verify
npm run verify:live
node scripts/demo-verify/accountant-audit.mjs
```

Run from repository root:

```powershell
python -m compileall backend/bayaan_odoo_addons/bayaan_fnb_kiosk
wsl bash -lc 'cd "/mnt/c/Users/HP/Desktop/Erbil project/Backend" && ODOO_DIR=/home/hassan/bayaan-odoo PYTHON_BIN=/home/hassan/bayaan-venv/bin/python ADDONS_PATH="/home/hassan/bayaan-odoo/addons,/mnt/c/Users/HP/Desktop/Erbil project/Backend/backend/bayaan_odoo_addons" DROP_FAILED_DB=1 bash scripts/odoo-addon-test.sh'
```

Also perform a full in-app Browser walkthrough at:

```text
Bayaan UI: http://127.0.0.1:5174
Odoo:     http://127.0.0.1:8069
Accountant login: noor@miza.iq
Accountant test password: test
```

Do not print or commit production credentials. The credential above is the
existing local test account only.

## Reconciliation Evidence Required

Before declaring completion, attach a point-in-time reconciliation report that
shows:

- POS order gross sales by session and day;
- posted net revenue and tax by session and day;
- cash/card payments by journal;
- COGS and inventory credits by source;
- waste expense and inventory credits by source;
- payroll and operating expense source-to-move mapping;
- vendor bill totals, residuals, and AP aging;
- trial balance total debits equal total credits;
- assets equal liabilities plus equity;
- P&L net income ties current earnings;
- cash-flow closing cash ties the cash/bank accounts;
- tax report ties tax move lines;
- no closed POS session with paid orders is missing its required accounting
  result.

Use read-only SQL/Odoo shell queries for this evidence. Do not repair the live
database manually to make the report pass.

## Definition Of Done

Accounting is complete only when all conditions below are true:

- [ ] No raw SQL changes Odoo workflow states.
- [ ] Official POS close runs successfully and atomically.
- [ ] Revenue, VAT, payments, COGS, inventory, and refunds reconcile.
- [ ] Same-day multiple sessions and late transactions cannot be lost.
- [ ] Partial receipts cannot create overstated vendor bills.
- [ ] AP payments are usable from Bayaan and update aging.
- [ ] Accountant permissions match the approved capability matrix in UI and API.
- [ ] Manual reversals require reasons and system moves remain protected.
- [ ] Opening balances and depreciation have governed, retry-safe workflows.
- [ ] Cash flow has operating/investing/financing classification and reconciles.
- [ ] Bank reconciliation is available in Bayaan, or the product promise is
      explicitly narrowed before the demo.
- [ ] Every accounting page has the correct title, loading/error state, Arabic
      RTL rendering, dark-mode rendering, and no console/page errors.
- [ ] `npm run verify` passes.
- [ ] `npm run verify:live` passes.
- [ ] Clean disposable Odoo addon tests pass with 0 failures and 0 errors.
- [ ] Accountant audit script passes and includes all pages and drill-downs.
- [ ] Final live reconciliation report passes.
- [ ] `AGENTS.md` and `CLAUDE.md` still match.
- [ ] Current docs are updated with commands, dates, screenshots, and evidence.

Do not mark this gate green based only on balanced top-level reports or passing
unit tests. Green requires official Odoo workflow integrity, role-safe browser
behavior, clean addon tests, live smoke, and source-to-ledger reconciliation.
