# Bayaan Production Gap Plan

Current date: 2026-05-13

This plan traces what is still missing before Bayaan can be called production-ready for a real F&B kiosk pilot. It is intentionally stricter than "demo-ready." Odoo Community remains the hidden source of truth. Bayaan is the branded workflow layer.

## Current Verification Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Frontend release gate | Green | `npm run verify` passed on 2026-05-13: 42 Vitest tests, stricter wiring gate, production build, Playwright smoke |
| Odoo addon test gate | Green | Temp DB `bayaan_codex_release_gate_0513`, Bayaan addon post-tests: 51 tests, 0 failed, 0 errors; stats: 69 tests |
| Live Odoo realtime smoke | Green | `npm run smoke:live` passed on 2026-05-13 against WSL Odoo: authenticated session, live sync, `Stream live`, backend sale appeared in Sales & POS without manual refresh |
| Odoo local runtime | Green on demand | Local Odoo 19 was started through WSL for the gate, then stopped after smoke |
| Docker local stack | Not part of this pass | Docker Desktop CLI is available, but this gate used the existing WSL Odoo runtime |
| Local pilot workflow gate | Green | Purchases, suppliers, recurring purchases, stock transfer receive, POS receive visibility, stock variance, HR/payroll, realtime audit/debugging, and live UI smoke are covered |
| Full production gate | Red | Deployment, hardware, accountant validation, backups/restore, and ops hardening are incomplete or external; online payments are intentionally excluded from this slice |

Latest production slice completed:
- Purchase orders can now be sent and received through `/bayaan/api/purchase_order_action`.
- Receiving a PO validates the Odoo receipt picking and increases warehouse stock.
- Recurring purchase plans can be saved under suppliers and run into real confirmed Odoo purchase orders.
- Stock transfers can now be approved/picked/dispatched/received through `/bayaan/api/stock_transfer_action`.
- Receiving a transfer validates the Odoo internal picking and moves stock from warehouse to kiosk.
- Frontend live-mode buttons call these backend routes and refresh from Odoo.
- Realtime dashboard/POS streaming now uses Odoo's bus/websocket layer with authenticated scoped channels, bus polling fallback, and bootstrap resync after events.
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
- `npm run smoke:live` posts a real backend sale and verifies that Sales & POS updates without manual browser refresh.

Implemented:
- Backend event publisher in the Bayaan addon using Odoo's built-in bus/websocket layer, without editing Odoo core.
- Event emission only after official backend records exist.
- Event families emitted from audit/security writes plus recipe consumption state changes; this covers sale, payment, waste, transfer, purchase, shift close, and review actions that already call `_audit_event`.
- Scoped channels by company and user with signed unguessable channel names; websocket subscriptions are filtered server-side.
- Frontend subscription service uses native websocket first and falls back to authenticated `/websocket/peek_notifications` polling when websocket transport fails.
- Release smoke proves a backend sale appears in the Sales & POS monitor without manual refresh.

Acceptance:
- Green locally: a sale posted at K-04 appears in the Sales & POS monitor without browser refresh.
- Green locally: stream disconnect/reconnect does not corrupt numbers; the client resyncs from Odoo/Bayaan and keeps deterministic backend state authoritative.
- Green locally: unauthorized channel subscription is filtered server-side by the signed-channel guard.
- Still broaden before pilot CI: add live smoke cases for transfer, waste, and close surfaces using the same stream path.

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

1. Broaden live Odoo smoke from sale realtime proof to purchase -> receive -> transfer -> sale -> waste -> close no-manual-refresh assertions.
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

Bayaan is now green for the local pilot workflow gate: frontend verify passes, the Bayaan Odoo addon test gate passes on a clean database, and live Odoo smoke proves a backend sale streams into the Sales & POS monitor without manual refresh. It is not yet green for real production release because deployment, backups/restore, hardware, accountant validation, and ops hardening are incomplete or outside this local repo. Online payments are intentionally outside this slice. The stock loop is verified end-to-end in Odoo, role/kiosk scoping is enforced server-side, daily close approval is locked and manager-controlled, HR/payroll persists in backend models, recurring purchases create confirmed Odoo purchase orders, and realtime streaming is locally proven.
