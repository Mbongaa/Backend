# Bayaan Production Gap Plan

Current date: 2026-05-17

This plan traces what is still missing before Bayaan can be called production-ready for a real F&B kiosk pilot. It is intentionally stricter than "demo-ready." Odoo Community remains the hidden source of truth. Bayaan is the branded workflow layer.

## Current Verification Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Frontend scripted gate | Green | `npm run verify` passed on 2026-05-17 after the simulation sale-balance, POS price-total, sale source-reference, sale stock/recipe, waste, close, transfer-create, purchase-create, stock-item-create, supplier-create, product-catalog-create, recipe-version-create, recurring-plan-create, recurring-run, HR/payroll payload validation, attendance worked-hours, shift-state persistence, live operating-expense gateway routing, draft cash-shortage deduction approval/rejection, terminal adjustment decision controls, duplicate adjustment retry reuse, duplicate attendance/expense retry proof, paid-period payroll adjustment locking, payroll export adjustment traceability, operating-expense P&L/export persistence, HR/payroll source-count audit/source-cite/AI-chip traceability, simulation negative report-period profit preservation, summary net-after-payroll totals, unique closed-kiosk audit checks, approved-close review locking, KPI negative money styling, finance favorable-variance reserve handling, payroll-run retry/recompute/export/paid-state hardening, and kiosk-detail/Sparkline hardening: 163 Vitest tests, wiring gate, production build, and browser smoke |
| Simulation dashboard flow gate | Green | `npm run simulation:audit` and `npm run smoke:simulation` passed on 2026-05-17. The browser smoke now proves zero-start, x2/x5/x10 speed, loop, 60-minute final state, dark mode, all 10 individual kiosk detail Sales tabs showing minute-50+ POS orders, manual POS/waste/close, transfers, purchases, suppliers, product/recipe creation, HR/payroll, Reports/export traceability, and the 30-minute final scenario. Proof includes `apps/kiosk-pos/verification/simulation-kiosk-detail-late-orders.png` plus the simulation screenshot set |
| Dashboard component parity gate | Yellow | The active Vite runtime only imports Studio Admin dashboard components for Stock & Allocation and Waste & Loss. Sales & POS, Kiosk Detail, Staff, Finance/Reports, Suppliers, Products, Closing, Warehouses, Overview, and AI Insights still rely on legacy/self-made Exact dashboard sections. Those surfaces now have smoke coverage for the confirmed kiosk-detail order bug, but the Studio Admin migration/parity inventory is not complete |
| Odoo addon test gate | Green via Ubuntu WSL | `wsl.exe -d Ubuntu -- bash -lc "cd '/mnt/c/Users/hassa/OneDrive/Desktop/Bayaan.ai/bayaan POS' && DROP_FAILED_DB=1 TEST_TIMEOUT_SECONDS=1800 bash scripts/odoo-addon-test.sh"` passed on 2026-05-17 against disposable DB `bayaan_codex_20260517_150409`: 52 post-tests, 70 addon tests, 0 failed, 0 errors |
| Live Odoo realtime smoke | Green | `npm run smoke:live` passed on 2026-05-16 against WSL Odoo: authenticated session, live sync, `Stream live`, backend sale, stock transfer, purchase receipt, waste, shift close, manager close review, forced Odoo bus fallback sale, and browser WebSocket-close fallback sale appeared without manual refresh; proof screenshots are written to `apps/kiosk-pos/verification/live-odoo-*.png` |
| Odoo local runtime | Green on demand | Local Odoo 19 was started through WSL for the gate, then stopped after smoke |
| Docker local stack | Blocked locally | `make odoo-test` still depends on `docker compose`; Docker reports missing `//./pipe/dockerDesktopLinuxEngine` in this workspace session. Use `make odoo-test-local` inside WSL/Linux as the non-Docker fallback |
| Local pilot workflow gate | Yellow | Deterministic simulation/backend/frontend flows are passing, but pilot release is held open by the Dashboard component parity gate until each legacy/self-made operational surface is either migrated to the Studio Admin component stack or explicitly covered by a section-level screenshot/interaction gate |
| Full production gate | Red | Deployment, hardware, accountant validation, backups/restore, and ops hardening are incomplete or external; online payments are intentionally excluded from this slice |

Backend addon runner note:
- `scripts/odoo-addon-test.sh` was added as the non-Docker WSL/Linux path for disposable clean-db addon tests.
- The runner scopes tests to `/$ADDON` by default so it no longer runs Odoo core/base tests accidentally.
- A 2026-05-17 full Ubuntu WSL run passed when invoked explicitly through the `Ubuntu` distro. Plain `bash scripts/odoo-addon-test.sh` from PowerShell can still hit the stopped default `docker-desktop` WSL distro, so CI/local scripts should use the Ubuntu/WSL path explicitly or set Ubuntu as the default distro.

Latest production slice completed:
- Purchase orders can now be sent and received through `/bayaan/api/purchase_order_action`.
- Receiving a PO validates the Odoo receipt picking and increases warehouse stock.
- Recurring purchase plans can be saved under suppliers and run into real confirmed Odoo purchase orders.
- Stock transfers can now be approved/picked/dispatched/received through `/bayaan/api/stock_transfer_action`.
- Receiving a transfer validates the Odoo internal picking and moves stock from warehouse to kiosk.
- Frontend live-mode buttons call these backend routes and refresh from Odoo.
- Realtime dashboard/POS streaming now uses Odoo's bus/websocket layer with authenticated scoped channels, bus polling fallback, and bootstrap resync after events.
- Live smoke now forces the Odoo bus polling fallback for a real backend sale and verifies the Sales & POS surface updates without manual refresh.
- Frontend realtime unit coverage now verifies WebSocket transport, forced bus polling, and WebSocket-close fallback into Odoo bus polling.
- Simulation audit now proves custom per-kiosk target-order profiles are audited with their supplied targets instead of falling back to defaults, including 30-minute causality without double-scaling.
- Simulation source-of-truth tests now prove manual FIB/digital POS sales increase digital/bank-app reports without inflating expected cash.
- Simulation source-count traceability now reconciles purchase orders, suppliers, recurring purchase plans, product rows, warehouse stock rows, transfer rows, HR employee/shift/attendance rows, payroll adjustments/runs, and operating expenses into summary/report-period counts, deterministic audit checks, source-cite text, and the management export traceability section.
- Simulation close-review hardening now recomputes the unresolved close/variance alert count when a pending close is approved/rejected, preventing approved close rows from leaving stale unresolved-alert totals.
- Simulation close-review hardening now treats approved closes as locked terminal source facts, so a later reject/note retry cannot reopen or mutate the approved close.
- Simulation close-review replay hardening now rejects unknown close ids and replays manager review history sequentially so an approved close cannot be overwritten by a later conflicting review row during source rebuild.
- Simulation close-review gateway hardening now rejects unsupported manager decision names before appending to the replay log, so invalid decisions cannot poison future source rebuilds.
- Simulation shift-close replay hardening now enforces stale-stock/count validation in the source-row apply helper before variance rows can be created.
- Simulation stock-suggestion hardening now recomputes transfer suggestions and low-stock alert counts after POS recipe consumption, waste, and received transfers, preventing fulfilled needs from staying in the recommendation panel.
- Simulation purchase-receipt hardening now supports partial receipts by adding only the received quantity to warehouse stock, leaving the PO partial until the remaining quantity is received, and consuming duplicate-item receipt requests only once across matching PO lines.
- Simulation transfer-receipt hardening now caps received transfer quantity at source warehouse availability and records the shortage, preventing negative warehouse stock or invented kiosk stock.
- Simulation transfer state-machine hardening now blocks receipt stock movement until a transfer is dispatched.
- Simulation transfer quantity hardening now keeps requested transfer quantity separate from `doneQty`/`receivedQty`, so draft/dispatched stock cannot reconcile as received before receipt.
- Simulation transfer row totals now reconcile completed transfer `movedQty` to the received line quantities used by kiosk and warehouse stock.
- Simulation transfer action replay now applies approve -> pick -> dispatch -> receive history in order after simulated refresh instead of collapsing to the latest action.
- Simulation transfer action replay hardening now rejects actions for missing transfer source rows before stock or state can mutate.
- Simulation transfer gateway action hardening now rejects unsupported action names before appending to the replay log, preventing invented transfer states from entering source rebuilds.
- Simulation purchase action replay now respects terminal cancelled/received states, preventing cancelled POs from receiving stock and received POs from being cancelled after stock is posted.
- Simulation purchase action replay hardening now rejects actions for missing purchase orders and positive receipt lines outside the PO before warehouse stock can move.
- Simulation purchase gateway action hardening now validates receipt item lines and action names before appending to the replay log, so rejected actions cannot poison later source bootstrap rebuilds.
- Simulation retry/idempotency hardening now prevents duplicate manual POS sales, waste entries, and shift closes from double-counting stock, cash, waste, closed kiosks, or unresolved variance alerts.
- Simulation source-row retry hardening now prevents duplicate manual transfers, purchase orders, stock items, and suppliers from inflating traceability/source-count rows.
- Simulation partial-receipt and recurring-plan retry hardening now prevents duplicate partial PO receive actions from adding warehouse stock twice and duplicate recurring plans from inflating source counts.
- Simulation gateway retry hardening now prevents duplicate recurring-plan run retries from creating duplicate source purchase orders.
- Simulation gateway action hardening now returns the actual source state for blocked transfer actions and terminal duplicate purchase receipts, instead of reporting an impossible requested state.
- Simulation transfer receipt retry hardening now proves duplicate receive replays do not move warehouse/kiosk stock twice.
- Simulation partial-transfer hardening now supports receive-line quantities, keeps transfers partial until remaining quantities are received, and dedupes duplicate partial receipt retries.
- Simulation transfer receipt replay hardening now rejects received item lines that are not part of the transfer request before stock can move.
- Simulation gateway receipt-state hardening now returns partial for incomplete purchase/transfer receipts instead of prematurely reporting done/received.
- Simulation gateway operator retry hardening now returns the original POS sale, waste, and close source identities and prevents duplicate source rows on retry.
- Simulation operator replay hardening now enforces POS sale line/payment balance and waste stock/cost validation in the source-row apply helpers, preventing bad replay data from bypassing gateway validation.
- Simulation gateway setup/procurement retry hardening now returns the original transfer, purchase order, stock item, supplier, and recurring purchase identities and prevents duplicate source rows on retry.
- Simulation partial-transfer terminal-state hardening now prevents a partially received transfer from being cancelled after warehouse/kiosk stock has already moved.
- Simulation inactive recurring-plan hardening now blocks inactive plans from running into source purchase orders.
- Simulation transfer receipt-shortage hardening now records shortage during partial receipts when the requested quantity exceeds warehouse availability.
- Simulation no-op receipt hardening now prevents zero or non-matching purchase/transfer receipt actions from mutating source rows without stock movement.
- Simulation transfer-create validation now rejects gateway transfer drafts with unknown kiosks/items or non-positive quantities before source transfer rows are created.
- Simulation purchase-create validation now rejects gateway purchase orders with unknown suppliers/items or non-positive quantities/rates before source purchase rows are created.
- Simulation transfer/purchase creation replay hardening now enforces the same validation inside the source-row apply helpers, preventing bad replay rows from bypassing gateway checks.
- Simulation stock-item-create validation now rejects gateway stock items with empty names, unknown suppliers, or non-positive unit costs before source product/warehouse rows are created.
- Simulation stock-item/recurring-plan replay hardening now enforces the same setup validation inside source-row apply helpers, including supplier and rate checks.
- Simulation supplier-create validation now rejects gateway suppliers with empty names before source supplier rows are created.
- Simulation supplier replay hardening now rejects empty supplier names inside the source-row apply helper before supplier source rows are created.
- Simulation product-catalog-create validation now rejects gateway menu products with empty names, non-positive sellable prices, or negative standard costs before source product rows are created.
- Simulation recipe-version-create validation now rejects gateway recipes with unknown products, unknown ingredients, non-positive quantities, or missing units before source recipe rows are created.
- Simulation product/recipe source-row hardening now makes Product & Recipes writes real in simulation mode, with recipe versions feeding later POS consumption ledger rows instead of falling through the no-op gateway.
- Simulation product/recipe replay hardening now enforces product catalog and recipe-version validation inside source-row apply helpers before source rows are created.
- Simulation HR/payroll source-row hardening now makes Staff writes real in simulation mode: staff, roster shifts, coverage rules, attendance, payroll adjustments, and payroll runs persist into the same simulated source snapshot and report payroll expense.
- Simulation HR/payroll replay hardening now validates manual employee, shift, coverage, attendance, adjustment, payroll-run, and operating-expense source rows before they can mutate payroll/report totals.
- Simulation HR attendance hardening now records operator check-in/check-out through the source gateway, computes worked hours from the timestamps, refreshes the Staff attendance surface from the HR source snapshot, and includes attendance rows in payroll export.
- Simulation HR scheduling/expense hardening now preserves source-created shift state, records operating expenses through the simulation source gateway, includes the persisted expense rows in payroll export, and subtracts those expenses from Reports P&L and the management export.
- Simulation HR/payroll browser proof now creates source-backed staff, shift, held cash-shortage deductions, manager adjustment approval/rejection, bonus adjustment, payroll review, payroll approval, and paid-state marking in simulation mode, then captures the persisted Staff screenshot.
- Simulation HR/payroll adjustment hardening now treats approved/rejected adjustment decisions as terminal source facts, makes duplicate same-action retries idempotent, rejects opposite-action reversals, and screenshots Staff without reversal controls after decision.
- Simulation HR/payroll adjustment retry hardening now reuses the original adjustment row across duplicate draft and create-with-approve retries, including browser proof that a duplicate cash-shortage retry does not add a second Staff row.
- Simulation HR attendance and operating-expense retry hardening now browser-proves duplicate source submissions do not add duplicate Staff rows or double-count payroll/profit impact.
- Simulation HR/payroll paid-period hardening now blocks late cash-shortage adjustments after a payroll run is approved or paid in the backend route, simulation source gateway, and Staff UI proof flow.
- Simulation HR/payroll export hardening now includes individual payroll adjustment rows with signed payroll impact and cites attendance, payroll adjustment, payroll run, and operating-expense source rows in the Reports management source badge and management CSV source-cite row.
- Simulation AI Insights traceability now screenshots visible source chips for attendance, payroll adjustments, payroll runs, and operating expenses after those rows change payroll and net profit.
- Simulation HR/payroll run hardening now rejects unsupported adjustment/run actions before state mutation, requires approval before paid marking, and recomputes reviewed payroll runs after held adjustments are approved without creating a second run row.
- Simulation HR/payroll gateway hardening now validates payroll adjustment types and payroll run date ranges before appending to the replay log, so invalid payroll rows cannot poison later source rebuilds.
- Backend HR/payroll route parity now reuses same-period payroll runs, makes paid retries idempotent, prevents approval retries from downgrading paid payroll, and blocks recompute from mutating approved or paid payroll runs.
- Backend HR/payroll adjustment create now reuses duplicate same employee/date/type/amount/reason submissions, including draft-to-approved create retries, instead of double-posting payroll impact.
- Backend HR attendance create now reuses duplicate same employee/check-in/check-out/manual-hours/note submissions instead of double-posting worked hours into payroll.
- Backend HR operating expenses now persist as `bayaan.operating.expense` rows, reuse duplicate same name/category/amount/date/note submissions, appear in HR snapshots and chain source counts, and are wired through the live frontend source gateway.
- Live Odoo chain bootstrap report periods now expose payroll expense, operating expenses, net profit after payroll, and HR/payroll/expense source-count rows so Reports uses source-backed labor and expense numbers instead of simulation-only fields.
- Live Odoo chain bootstrap report periods now accrue active employee salary plus approved adjustment impact when no payroll run overlaps the period, then switch to prorated payroll-run totals once a reviewed/approved/paid run exists.
- Live Odoo chain bootstrap report periods now add accrual for days not covered by a partial payroll run, preventing monthly labor from dropping uncovered days after a mid-period run.
- Simulation payroll reports now freeze on the reviewed/approved/paid payroll-run net until an explicit recompute refreshes the run, so approved adjustments do not silently mutate a reviewed payroll report.
- Live Odoo and source-backed simulation report/export net profit after payroll now preserves negative operating results instead of clamping losses to zero.
- Peak simulation report periods now preserve negative net profit after payroll once operations begin, while keeping the minute-zero simulation snapshot at zero activity.
- Report KPI styling now treats currency-prefixed negative money values, such as `IQD -9,500`, as down/negative instead of forcing green positive styling.
- Manual simulation waste and shift-close variance rows now scale into weekly/monthly/yearly synthetic report periods consistently with manual sales, keeping report-period net profit and net profit after payroll reconciled.
- Manual simulation sales, waste, and close variance now recompute report-period net profit after payroll from the updated source-backed net profit, payroll, and operating-expense fields, so first activity after a zero-start snapshot cannot skip payroll.
- Generated and manual simulation summary totals now mirror source-backed daily net profit after payroll after sales, waste, or close variance, preventing dashboard fallback totals from diverging from Reports.
- Manual simulation close rows now update dashboard open/closed kiosk totals by unique kiosk id rather than by close-row count, preventing repeated same-kiosk closes from overstating closed kiosks.
- Generated peak simulation summaries now also count closed kiosks by unique kiosk id, keeping the base 30/60-minute simulation aligned with manual close behavior.
- Simulation HR/payroll updates now mirror source-backed payroll expense, operating expenses, and net profit after payroll onto summary totals as well as report periods, keeping dashboard fallback surfaces reconciled.
- Reports and management export now consume the source-backed `netProfitAfterPayroll` report field when present, instead of recomputing it on the client from rounded display components.
- Finance account allocation now exposes a loss shortfall row when source-backed net profit after payroll is negative, rather than hiding the loss as zero savings.
- Finance account allocation now keeps favorable variance out of the reserve cost bucket, so positive close variance is not treated like payroll/waste loss reserve.
- Live Odoo chain bootstrap report periods now include cash variance, stock variance value, and variance impact from shift-close rows in report net profit, matching the simulation variance loop.
- Simulation HR/payroll report/export proof now verifies the Reports P&L, exported management CSV, and exported payroll-run CSV pick up source-backed payroll changes; duplicate payroll compute/approve/paid retries do not create duplicate payroll run rows or downgrade paid runs.
- Simulation recurring-plan-create validation now rejects gateway recurring purchase plans with unknown suppliers/items or non-positive quantities/rates before source recurring rows are created.
- Simulation recurring-run validation now revalidates the generated source purchase-order payload and preserves supplier, item code, quantity, unit cost, and PO total.
- Simulation supplier seed data now includes Iraq Pack as the packaging supplier for cups, lids, and straws, so valid purchase flows reference a real supplier source row.
- Simulation sale-balance hardening now rejects gateway POS sales whose line total does not match payment total before source order/payment rows are created.
- Simulation sale source-reference hardening now rejects gateway POS sales with unknown products, unknown kiosks, non-positive line/payment values, or unrecognized payment methods before source order/payment/ledger rows are created.
- Simulation sale stock/recipe hardening now rejects gateway POS sales that would exceed current kiosk stock or post recipe/hybrid products without a matching active recipe version.
- POS sale payload hardening now allocates the exact cashier-displayed total into Odoo-facing line `price_unit` values so the exact UI's VAT display cannot create unbalanced order/payment rows.
- Simulation waste validation now rejects gateway waste rows with unknown kiosk/item references, non-positive or over-available quantities, or costs that do not reconcile to source stock unit cost.
- Simulation shift-close validation now rejects gateway close rows for unknown kiosks, missing stock counts, unknown items, stale expected stock, or negative counted cash/stock before close rows are created.
- Simulation close-review validation now rejects nonexistent close reviews and treats duplicate approvals as idempotent source-state reads.
- Simulation daily-close hardening now increments unresolved close/variance alert totals when a manual close is submitted, then decrements/recomputes after manager review.
- Simulation Overview now renders the minute/hour pulse bars again while simulation mode is active, so speed changes and minute-by-minute demand are visible instead of falling back to the fiscal sales-flow chart.
- Simulation smoke now verifies non-zero management-export traceability rows and uses the current Stock & Allocation transfer-card/badge UI when proving manual transfer draft -> approved -> picked -> dispatched persistence and POS kiosk receipt reconciliation.
- Full Odoo stock-loop regression now verifies: PO receipt -> warehouse stock increase -> transfer receipt -> kiosk stock increase -> POS recipe deduction -> ingredient waste scrap -> daily close expected-vs-actual variance.
- Ingredient waste for storable ingredient products now creates real `stock.scrap` instead of only recording a waste entry.
- API role checks now enforce kiosk scope server-side even where routes use `sudo()` for Odoo writes.
- Cashier/supervisor/manager tests verify assigned-kiosk sales, blocked unassigned sales, blocked cashier transfers, assigned supervisor transfers, manager-only purchase orders, and scoped `chain_bootstrap`.
- Payment gateway transaction and webhook-event models now exist for FIB/ZainCash-style reconciliation.
- Mock FIB and ZainCash transactions, credential blocking, callback-secret enforcement, and duplicate webhook idempotency are covered by Odoo HTTP tests.
- HR/payroll backend models and routes now persist employees, attendance, approved adjustments, payroll runs, approval, and paid state.
- Daily close approval is now manager-only, blocks missing/failed recipe consumption, requires notes for variance/rejection, and locks approved close records/count lines.
- Odoo 19 `_read_group` is used in the touched variance/reporting aggregation paths, removing the previous local deprecation warnings there.

Active local pilot workflow goal:
- One source-of-truth flow for setup and operations: suppliers, purchase invoices/orders, recurring purchase plans, warehouse receipt, warehouse-to-kiosk transfer, kiosk receive confirmation, POS sale/recipe deduction, waste, daily close variance, HR/payroll, realtime audit trail.
- All operational numbers must come from Odoo/Bayaan backend models. React-only state is allowed for demo fallback and drafts, not official stock/cash/payroll facts.
- Online payments are outside this current gate by request; cash/POS/payment-method records still remain deterministic inside Odoo.

## Release Gate Definition

Bayaan is production-ready only when all of these are green:

Gate promotion rule: before any release gate is called green or changed to green, the verifier must run the required automated gates and then complete a full dashboard verification walkthrough in the active Vite app. The walkthrough must exercise every active dashboard section and major drill-down, capture/update screenshots, verify dark mode where relevant, check for browser console/page errors, and record Studio Admin vs legacy/self-made component parity status. A narrow smoke, unit test run, build, or backend test run is not enough by itself to move a gate green.

1. Odoo addon installs, updates, and tests on a clean database.
2. Frontend tests, production build, and browser smoke pass.
3. Live Bayaan dashboard talks to Odoo with authenticated session or secure server-side proxy.
4. Dashboard and POS read path is initial `/bayaan/api/chain_bootstrap` plus authenticated scoped realtime stream; manual refresh/polling is fallback only.
5. Every stock, cash, purchase, sale, waste, close, and payroll number is stored in Odoo/Bayaan backend models, not only React state.
6. Cashier sale creates real `pos.order`, `pos.payment`, and recipe ledger rows.
7. Purchase receipt increases warehouse stock.
8. Warehouse transfer and kiosk receipt move stock correctly.
9. Daily close compares expected vs counted stock and cash, then locks or escalates variance.
10. Roles, kiosk permissions, backups, monitoring, restore, and deployment are proven.
11. Online payment gateways pass their own separate activation gate when that scope is reintroduced.

## P0 Blockers

These block real production use.

### 1. Realtime Dashboard And POS Streaming

Current state:
- Local gate green.
- Dashboard live mode takes an initial `/bayaan/api/chain_bootstrap` + `/bayaan/api/warehouse_setup` snapshot, then subscribes to `/bayaan/api/realtime_config` channels.
- Backend events publish through Odoo `bus.bus` after official Odoo/Bayaan records exist; audit rows remain durable even if publishing fails.
- Sales monitor and dashboard surfaces resync from Odoo after realtime events; manual refresh is a fallback, not the normal workflow.
- POS transfer surfaces subscribe to the same stream and reload transfer state when transfer, purchase, or assigned-kiosk events arrive.
- Audit log listens to the realtime stream; `/bayaan/api/audit_log` polling is now only fallback behavior.
- `npm run smoke:live` posts real backend sale, stock transfer, purchase receipt, waste, shift close, manager close-review, forced Odoo bus fallback sale, and browser WebSocket-close fallback sale actions, verifies that the matching dashboard surfaces update without manual browser refresh, and captures live proof screenshots.

Implemented:
- Backend event publisher in the Bayaan addon using Odoo's built-in bus/websocket layer, without editing Odoo core.
- Event emission only after official backend records exist.
- Event families emitted from audit/security writes plus recipe consumption state changes; this covers sale, payment, waste, transfer, purchase, shift close, and review actions that already call `_audit_event`.
- Scoped channels by company and user with signed unguessable channel names; websocket subscriptions are filtered server-side.
- Frontend subscription service uses native websocket first and falls back to authenticated `/websocket/peek_notifications` polling when websocket transport fails.
- Release smoke proves backend sale, stock transfer, purchase receipt, waste, shift close, manager close-review, forced Odoo bus fallback sale, and browser WebSocket-close fallback sale actions appear on their matching dashboard surfaces without manual refresh.

Acceptance:
- Green locally: a sale posted at K-04 appears in the Sales & POS monitor without browser refresh.
- Green locally: a stock transfer posted and dispatched for K-04 appears in Stock & Allocation without browser refresh.
- Green locally: a purchase order posted and received appears in Purchases & Suppliers without browser refresh.
- Green locally: a waste entry posted for K-04 appears in Waste & Loss without browser refresh.
- Green locally: a shift close submitted for K-04 appears in Daily Close without browser refresh.
- Green locally: manager close approval appears in Daily Close without browser refresh.
- Green locally: WebSocket close falls back to authenticated Odoo bus polling in unit coverage, and the live browser smoke proves both forced Odoo bus fallback and browser WebSocket-close fallback for real backend sales without manual refresh.
- Green locally: unauthorized channel subscription is filtered server-side by the signed-channel guard.
- Still needed before pilot CI: wire `npm run smoke:live` into CI against a disposable Odoo database.

### 2. Auth, Roles, And Kiosk Scoping

Current state:
- Odoo session auth exists.
- Bayaan JSON routes now enforce kiosk assignment for cashier sale, waste, shift close, and stock-transfer actions.
- Manager-only purchase, warehouse setup, and kiosk setup routes are enforced server-side.

Needed:
- Owner, manager, warehouse, cashier, accountant, admin roles.
- Warehouse staff can pick/dispatch transfers but not edit recipes or finance.
- Accountant can see reports/accounting but not change stock.
- Broaden tests for warehouse/accountant read/write boundaries once those roles are added.

Acceptance:
- A cashier from K-04 cannot create sales, waste, closes, or transfers for K-07.
- Unauthorized API calls fail even if manually posted.

### 3. Purchase Receiving

Current state:
- `/bayaan/api/purchase_order` creates/confirms Odoo purchase orders.
- UI now uses structured PO lines.
- `/bayaan/api/purchase_order_action` can mark RFQ sent and receive against the Odoo receipt picking.
- Partial receipts record ordered vs received shortage/damage on `bayaan.stock.receipt.discrepancy`.

Needed:
- Dedicated receive modal: ordered qty, received qty, shortage, damaged qty, destination warehouse.
- PO states: Draft -> Sent/Confirmed -> Partially Received -> Received -> Billed/Closed.
- Partial receipt UX and shortage/damage capture.
- Supplier price catalog updates from received/billed prices.

Acceptance:
- Receiving 92 kg from a 100 kg orange PO increases warehouse stock by 92 kg and records 8 kg shortage.
- PO receipt is traceable to Odoo purchase/stock records.

### 4. Stock Transfer State Machine

Current state:
- `/bayaan/api/stock_transfer` creates an Odoo internal picking.
- Source warehouse selection is now passed through.
- `/bayaan/api/stock_transfer_action` can approve, pick, dispatch, receive, or cancel a real Odoo picking.
- Live UI actions call Odoo and refresh from the engine.
- Backend supports multi-line transfer creation and partial receipt discrepancy capture.

Needed:
- First-class Bayaan transfer state model if the pilot needs human-separated warehouse/kiosk handoff beyond Odoo picking states.
- Kiosk receive confirmation UX with discrepancy notes.

Acceptance:
- A transfer of 10 lines from Main Warehouse to K-04 decreases source availability and increases K-04 stock only when properly validated/received according to chosen policy.

### 5. Daily Close Full Operator Flow

Current state:
- Variance model and tests exist.
- Dashboard shows daily close/variance and manager actions.
- `/bayaan/api/shift_close_review` enforces manager-only approve/reject, locks approved closes, and blocks clean approval when linked POS orders have missing or failed recipe consumption.
- Approved shift closes and their stock/ingredient count lines cannot be edited or deleted through normal model writes.

Needed:
- Cashier close flow: counted cash, counted digital evidence, counted stock, notes.
- Request recount workflow.
- Difference posting policy: waste, unknown loss, cash shortage, investigation.
- UI should surface the backend lock/block reasons directly in the close review panel.

Acceptance:
- Closing K-07 with missing orange stock and cash shortage remains unresolved until a manager records decision and note.

### 6. Real Payment Gateway Layer

Current state:
- Payment methods include Zain Cash, FIB, Qi Card/SuperQi, NassWallet, FastPay, AsiaHawala, card, QR, manual digital.
- Odoo POS payment methods classify gateway providers.
- Bayaan now has `bayaan.payment.transaction` and `bayaan.payment.webhook.event` records.
- `/bayaan/api/payment_transaction` creates mock/sandbox-safe FIB and ZainCash-style transactions and blocks live mode when server-side credentials are missing.
- `/bayaan/payment/webhook/<provider>` records idempotent callbacks and requires the transaction callback secret.

Needed:
- Real Zain Cash live adapter after merchant sandbox/production credentials are provided.
- Real FIB live adapter after merchant sandbox/production credentials are provided.
- Payment status polling/reconciliation.
- Refund/cancel handling where provider supports it.
- No merchant secret in browser code.

Acceptance:
- Sale payment can be reconciled by provider transaction id.
- Duplicate webhook does not double-count payment.
- Missing merchant credentials are a documented external blocker, not hidden in UI.

## P1 Operational Gaps

These are required for a serious pilot, even if not all block a controlled demo.

### 7. Product And Recipe Master Data

Needed:
- Backend product create/update endpoints.
- Product consumption mode required before sale: `recipe`, `finished`, `hybrid`, `none`.
- Recipe versioning UI must show effective date, author, status, and historical usage.
- Packaging items included in recipes.
- Import/export for product catalog.
- Validation for missing recipe before allowing sale of recipe-mode products.

Acceptance:
- Changing orange juice recipe today does not alter yesterday's variance report.

### 8. Supplier Price Catalog

Needed:
- Supplier item catalog: supplier, item, unit, last price, tax, MOQ, lead time.
- PO line price auto-fill from supplier catalog.
- Price change history feeds margin reports.
- Supplier reliability and late-delivery stats from real receipts.

Acceptance:
- Draft PO for Baghdad Dairy milk auto-fills current unit cost and lead time.

### 9. Warehouse And Location Setup

Needed:
- One setup flow for warehouses, kiosk stock locations, POS configs, and kiosk records.
- City/area warehouse support only when expansion needs it.
- Location topology screen showing central warehouse -> area warehouse -> kiosks.
- Prevent deleting/renaming locations with stock/history.

Acceptance:
- Creating K-11 creates `bayaan.kiosk`, `stock.location`, and `pos.config` atomically.

### 10. Waste And Inventory Adjustment

Current state:
- Kiosk waste creates Bayaan waste entries.
- Storable ingredient waste now creates real Odoo `stock.scrap` and feeds daily close variance.

Needed:
- Kiosk waste is separate from warehouse adjustment.
- Waste reasons: spoiled fruit, broken packaging, wrong order, sample, staff meal, missing stock, unknown loss.
- Warehouse adjustment flow for damaged supplier delivery or count correction.
- Approval threshold for high-value waste/adjustments.

Acceptance:
- Warehouse loss does not appear as kiosk waste, and kiosk waste feeds daily variance.

### 11. HR, Kiosk Scheduling, And Payroll Backend

Current state:
- Backend models and HTTP routes exist for employees, attendance, payroll adjustments, payroll runs, payroll lines, approval, and paid state.
- Payroll approval blocks draft adjustments, and cash-shortage deductions require approval before they affect net pay.

Needed:
- Odoo HR bridge: create/link `hr.employee` and `hr.attendance` records from Bayaan staff/attendance actions without exposing Odoo as the product UI.
- Kiosk coverage rules: per kiosk, weekday, role, start/end time, and required headcount.
- Dated staff schedule: assign employees to actual kiosk shifts for the current week and next week.
- Coverage gaps: compare required slots to assigned shifts and flag missing people by kiosk/day/time/role.
- Live UI wiring for staff create/edit, weekly shift planning, coverage gap review, attendance, adjustments, payroll run review, approval, and paid state.
- Final salary rules by role/month/hour with accountant/client validation.
- Payroll export/report.
- Audit trail for payroll changes.

Acceptance:
- In live mode, Staff shows Odoo-loaded kiosks and staff instead of "No live kiosks loaded."
- A manager can create a weekly coverage rule and assign a person to a dated kiosk shift.
- If K-04 needs two cashiers from 08:00-16:00 and only one is assigned, Staff shows one missing person for that exact slot.
- Adding staff, recording attendance, applying approved shortage, and running payroll persists in backend/Odoo-linked records.

### 12. Reports And Finance

Needed:
- Deterministic report endpoints for daily/weekly/monthly/yearly.
- PDF export, not JSON pretending to be PDF.
- Payment split by cash, card, QR, wallet, FIB, Zain Cash, manual digital.
- Product profitability from actual ingredient costs.
- Ingredient consumption and waste reports.
- Cash flow and supplier payable reports.
- Accountant validates Iraqi chart of accounts, taxes, invoice/report format.

Acceptance:
- Daily report can be regenerated from Odoo data and matches underlying records.

### 13. AI Insights Layer

Needed:
- AI only reads pre-aggregated verified metrics.
- Every numeric claim includes source references.
- Configurable AI frequency tiers and token budget.
- Scheduled daily summary before chat.
- AI recommendations require manager approval before action.

Acceptance:
- AI cannot invent a stock number and cannot create a PO/transfer without traceable source data and approval.

## P2 Production Hardening

### 14. Offline And Sync

Needed:
- Decide production sale path: customized Odoo POS or Bayaan UI through `/kiosk_sale`.
- Weak-internet tests for session open, queued sale, duplicate submit, failed payment, and recipe posting.
- Network errors can queue; Odoo validation errors cannot be hidden or queued.
- Conflict reconciliation screen.

Acceptance:
- Duplicate offline sale replay is idempotent by external id.

### 15. Hardware

Needed:
- Receipt printers.
- Cash drawers.
- Barcode scanner if used.
- Customer display pairing.
- Tablet/kiosk browser lockdown.
- Arabic/English print formats.

Acceptance:
- A real kiosk can open shift, sell, print, take payment, record waste, and close shift on actual hardware.

### 16. Deployment, Backups, And Monitoring

Needed:
- Choose hosting route: Cloudpepper/managed Odoo, VPS, or internal server.
- Staging and production environments.
- Backups with restore drill.
- Log retention.
- Error alerts.
- SSL/domain/reverse proxy.
- Secrets management.
- Update/rollback process.

Acceptance:
- Restore from backup to staging and verify Bayaan routes within a defined recovery time.

### 17. CI And Test Automation

Needed:
- CI for frontend tests/build.
- CI or scheduled WSL/Docker Odoo addon tests.
- Live Odoo smoke script against authenticated local/staging Odoo.
- Payment provider mock tests.
- Edge-case regression suite.

Acceptance:
- A pull request cannot be considered release-ready unless frontend and Odoo gates pass.

## Recommended Execution Order

### Phase 1: Truthful Core Operations

1. Wire the current sale/transfer/purchase/waste/close/review/fallback realtime proof into CI against a disposable Odoo database.
2. Add PO receive modal and partial receipt/damage capture.
3. Add multi-line transfer UI and discrepancy capture.
4. Complete daily close operator flow.
5. Add role/kiosk scoping.

### Phase 2: Money And Accountability

1. Add payment gateway abstraction and mocked Zain Cash/FIB/FastPay/etc tests.
2. Add real payment reconciliation model/fields.
3. Add HR kiosk scheduling, coverage gaps, and remaining payroll UI wiring.
4. Add deterministic finance/report endpoints.
5. Add PDF export.

### Phase 3: Production Deployment

1. Move repo/deployment work out of OneDrive for speed/stability.
2. Set up staging and production Odoo.
3. Configure backups and restore drill.
4. Configure monitoring/logs/alerts.
5. Validate accounting with client accountant.
6. Run hardware pilot at one kiosk.

## Known Environment Note

The current workspace is inside OneDrive:

```text
C:\Users\hassa\OneDrive\Desktop\Bayaan.ai\bayaan POS
```

Odoo tests work there, but asset generation was slow. Do not disable OneDrive system-wide as a first move. Prefer copying/cloning this repo to:

```text
C:\dev\bayaan-pos
```

or a WSL-native path:

```text
~/dev/bayaan-pos
```

This should make Odoo installs/tests faster and reduce file-lock/sync weirdness.

## Current Verdict

Bayaan is green for the frontend, simulation, Odoo addon, and live Odoo realtime local pilot workflow gates: frontend verify passes, simulation audit/smoke passes, the Ubuntu WSL addon runner passes, and live Odoo smoke proves backend sale, stock transfer, purchase receipt, waste, shift close, manager close review, forced Odoo bus fallback sale, and browser WebSocket-close fallback sale updates without manual refresh. It is not yet green for real production release because deployment, backups/restore, hardware, accountant validation, and ops hardening are incomplete or external. Online payments are intentionally outside this slice. The stock loop has clean-DB Odoo coverage, role/kiosk scoping is enforced server-side, daily close approval is locked and manager-controlled, HR/payroll persists in backend models, recurring purchases create confirmed Odoo purchase orders, and realtime streaming is locally proven.
