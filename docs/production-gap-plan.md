# Bayaan Production Gap Plan

Current date: 2026-05-12

This plan traces what is still missing before Bayaan can be called production-ready for a real F&B kiosk pilot. It is intentionally stricter than "demo-ready." Odoo Community remains the hidden source of truth. Bayaan is the branded workflow layer.

## Current Verification Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Frontend release gate | Green | `npm run verify` passed on 2026-05-12: 36 Vitest tests, production build, Playwright smoke |
| Odoo addon test gate | Green | Temp DB `bayaan_codex_full_202605122125`, Bayaan addon post-tests: 37 tests, 0 failed, 0 errors; stats: 53 tests |
| Odoo local runtime | Green for development | Local Odoo 19 is running on `127.0.0.1:8069` through WSL |
| Docker local stack | Red | Docker Desktop Linux engine is stopped/unavailable |
| Full production gate | Red | Live payment credentials/API activation, deployment, hardware, accounting validation, backups/restore, and ops hardening are incomplete |

Latest production slice completed:
- Purchase orders can now be sent and received through `/bayaan/api/purchase_order_action`.
- Receiving a PO validates the Odoo receipt picking and increases warehouse stock.
- Stock transfers can now be approved/picked/dispatched/received through `/bayaan/api/stock_transfer_action`.
- Receiving a transfer validates the Odoo internal picking and moves stock from warehouse to kiosk.
- Frontend live-mode buttons call these backend routes and refresh from Odoo.
- Full Odoo stock-loop regression now verifies: PO receipt -> warehouse stock increase -> transfer receipt -> kiosk stock increase -> POS recipe deduction -> ingredient waste scrap -> daily close expected-vs-actual variance.
- Ingredient waste for storable ingredient products now creates real `stock.scrap` instead of only recording a waste entry.
- API role checks now enforce kiosk scope server-side even where routes use `sudo()` for Odoo writes.
- Cashier/supervisor/manager tests verify assigned-kiosk sales, blocked unassigned sales, blocked cashier transfers, assigned supervisor transfers, manager-only purchase orders, and scoped `chain_bootstrap`.
- Payment gateway transaction and webhook-event models now exist for FIB/ZainCash-style reconciliation.
- Mock FIB and ZainCash transactions, credential blocking, callback-secret enforcement, and duplicate webhook idempotency are covered by Odoo HTTP tests.
- HR/payroll backend models and routes now persist employees, attendance, approved adjustments, payroll runs, approval, and paid state.
- Daily close approval is now manager-only, blocks missing/failed recipe consumption, requires notes for variance/rejection, and locks approved close records/count lines.
- Odoo 19 `_read_group` is used in the touched variance/reporting aggregation paths, removing the previous local deprecation warnings there.

## Release Gate Definition

Bayaan is production-ready only when all of these are green:

1. Odoo addon installs, updates, and tests on a clean database.
2. Frontend tests, production build, and browser smoke pass.
3. Live Bayaan dashboard talks to Odoo with authenticated session or secure server-side proxy.
4. Every stock, cash, purchase, sale, waste, close, and payroll number is stored in Odoo/Bayaan backend models, not only React state.
5. Cashier sale creates real `pos.order`, `pos.payment`, and recipe ledger rows.
6. Purchase receipt increases warehouse stock.
7. Warehouse transfer and kiosk receipt move stock correctly.
8. Daily close compares expected vs counted stock and cash, then locks or escalates variance.
9. Payment methods and Iraqi gateways are configured without browser-exposed secrets.
10. Roles, kiosk permissions, backups, monitoring, restore, and deployment are proven.

## P0 Blockers

These block real production use.

### 1. Auth, Roles, And Kiosk Scoping

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

### 2. Purchase Receiving

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

### 3. Stock Transfer State Machine

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

### 4. Daily Close Full Operator Flow

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

### 5. Real Payment Gateway Layer

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

### 6. Product And Recipe Master Data

Needed:
- Backend product create/update endpoints.
- Product consumption mode required before sale: `recipe`, `finished`, `hybrid`, `none`.
- Recipe versioning UI must show effective date, author, status, and historical usage.
- Packaging items included in recipes.
- Import/export for product catalog.
- Validation for missing recipe before allowing sale of recipe-mode products.

Acceptance:
- Changing orange juice recipe today does not alter yesterday's variance report.

### 7. Supplier Price Catalog

Needed:
- Supplier item catalog: supplier, item, unit, last price, tax, MOQ, lead time.
- PO line price auto-fill from supplier catalog.
- Price change history feeds margin reports.
- Supplier reliability and late-delivery stats from real receipts.

Acceptance:
- Draft PO for Baghdad Dairy milk auto-fills current unit cost and lead time.

### 8. Warehouse And Location Setup

Needed:
- One setup flow for warehouses, kiosk stock locations, POS configs, and kiosk records.
- City/area warehouse support only when expansion needs it.
- Location topology screen showing central warehouse -> area warehouse -> kiosks.
- Prevent deleting/renaming locations with stock/history.

Acceptance:
- Creating K-11 creates `bayaan.kiosk`, `stock.location`, and `pos.config` atomically.

### 9. Waste And Inventory Adjustment

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

### 10. HR And Payroll Backend

Current state:
- Backend models and HTTP routes exist for employees, attendance, payroll adjustments, payroll runs, payroll lines, approval, and paid state.
- Payroll approval blocks draft adjustments, and cash-shortage deductions require approval before they affect net pay.

Needed:
- Live UI wiring for staff create/edit, attendance, adjustments, payroll run review, approval, and paid state.
- Final salary rules by role/month/hour with accountant/client validation.
- Payroll export/report.
- Audit trail for payroll changes.

Acceptance:
- Adding staff, recording attendance, applying approved shortage, and running payroll persists in backend.

### 11. Reports And Finance

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

### 12. AI Insights Layer

Needed:
- AI only reads pre-aggregated verified metrics.
- Every numeric claim includes source references.
- Configurable AI frequency tiers and token budget.
- Scheduled daily summary before chat.
- AI recommendations require manager approval before action.

Acceptance:
- AI cannot invent a stock number and cannot create a PO/transfer without traceable source data and approval.

## P2 Production Hardening

### 13. Offline And Sync

Needed:
- Decide production sale path: customized Odoo POS or Bayaan UI through `/kiosk_sale`.
- Weak-internet tests for session open, queued sale, duplicate submit, failed payment, and recipe posting.
- Network errors can queue; Odoo validation errors cannot be hidden or queued.
- Conflict reconciliation screen.

Acceptance:
- Duplicate offline sale replay is idempotent by external id.

### 14. Hardware

Needed:
- Receipt printers.
- Cash drawers.
- Barcode scanner if used.
- Customer display pairing.
- Tablet/kiosk browser lockdown.
- Arabic/English print formats.

Acceptance:
- A real kiosk can open shift, sell, print, take payment, record waste, and close shift on actual hardware.

### 15. Deployment, Backups, And Monitoring

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

### 16. CI And Test Automation

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

1. Add PO receive modal and partial receipt/damage capture.
2. Add multi-line transfer UI and discrepancy capture.
3. Complete daily close operator flow.
4. Add role/kiosk scoping.
5. Add live Odoo smoke for purchase -> receive -> transfer -> sale -> waste -> close.

### Phase 2: Money And Accountability

1. Add payment gateway abstraction and mocked Zain Cash/FIB/FastPay/etc tests.
2. Add real payment reconciliation model/fields.
3. Add HR/payroll backend persistence.
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

Bayaan is now green for the local release gate: frontend verify passes and the Bayaan Odoo addon test gate passes on a clean database. It is not yet green for real production release because deployment, backups/restore, hardware, accountant validation, and live FIB/ZainCash merchant activation are outside this local repo. The stock loop is verified end-to-end in Odoo, role/kiosk scoping is enforced server-side, daily close approval is locked and manager-controlled, HR/payroll now persists in backend models, and payment gateway reconciliation has deterministic transaction/webhook records with mocked FIB/ZainCash tests.
