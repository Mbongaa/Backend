# Sales Meeting Gap Audit - 2026-05-20

Source context: client sales meeting transcript and executive brief provided in the chat on 2026-05-20.

Purpose: preserve the meeting requirements against the current Bayaan/Odoo codebase, then turn the gaps into a workflow-ready backlog. This document records the Stage 2 release-gate evidence and links the later Stage 3 refactor verification, but it is still not a full production sign-off.

Ground rule for future agents: before marking any item covered, re-read or re-grep the cited code in the current checkout. Do not rely on this document as stale truth.

## Executive Conclusion

Bayaan is well covered for the custom kiosk/POS variance loop: Odoo POS is the official sales engine, recipes are versioned, paid sales create consumption ledger rows, waste and transfers feed daily close variance, and manager review locks approved closes. Evidence: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4842`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:129`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recipe.py:47`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:113`.

Bayaan now has code, automated tests, and a browser release walkthrough for the Stage 2 classic ERP commitments from the meeting: landed costs, offline opening/receipt semantics, product image persistence in Odoo, live product-by-hour reporting, analytic cost centers, server-side pricelist/discount enforcement, Odoo-level void/invoice/period locks, and manufacturing/semi-finished goods. Stage 2 is green as a local release gate. Accountant validation, hardware/physical printer proof, deployment/backup/restore, production secrets/SSL/monitoring, and client RAD sign-off remain outside Stage 2 code closure and must still be completed before production release sign-off.

## Stage 2 Release Gate - 2026-05-20

| Gate | Status | Evidence |
| --- | --- | --- |
| Frontend release walkthrough | Green | `npm run verify` passed from `apps/kiosk-pos` on 2026-05-20: 171 Vitest tests, wiring gate, production build, and Playwright smoke. The smoke checks console/page errors, active admin sections, stock-transfer drill-down, kiosk stock drill-down, POS login/sale/payment/waste, Arabic RTL, mobile render, and dark mode screenshots: `apps/kiosk-pos/scripts/smoke.mjs:35`, `apps/kiosk-pos/scripts/smoke.mjs:79`, `apps/kiosk-pos/scripts/smoke.mjs:87`, `apps/kiosk-pos/scripts/smoke.mjs:136`, `apps/kiosk-pos/scripts/smoke.mjs:166`, `apps/kiosk-pos/scripts/smoke.mjs:171`, `apps/kiosk-pos/scripts/smoke.mjs:230`, `apps/kiosk-pos/scripts/smoke.mjs:235`, `apps/kiosk-pos/scripts/smoke.mjs:246`, `apps/kiosk-pos/scripts/smoke.mjs:252`. |
| Source image wiring | Green | The wiring gate now requires source-mode uploads to persist `imageBase64` and label the upload as a source image: `apps/kiosk-pos/scripts/wiring-gate.mjs:131`, `apps/kiosk-pos/scripts/wiring-gate.mjs:132`. |
| Backend addon gate | Green | Full Ubuntu WSL addon run passed again on DB `bayaan_codex_20260520_231722`: `84 post-tests`, `bayaan_fnb_kiosk: 110 tests`, `0 failed, 0 error(s)`. |
| Targeted Stage 2 backend gates | Green | Landed cost, source image persistence, and peak-hour report targeted test passed on DB `bayaan_codex_20260520_220649`; MRP semi-finished targeted test passed on DB `bayaan_codex_20260520_223009`; Baghdad-local peak-hour boundary targeted test passed on DB `bayaan_codex_20260520_225718`. |
| Mirror and formatting sanity | Green | `git diff --no-index -- AGENTS.md CLAUDE.md` and `git diff --check` passed after the Stage 2 changes. |
| Studio Admin vs legacy/self-made parity | Green for Stage 2 release gate by screenshot/interaction coverage | The active runtime still contains legacy/self-made Exact dashboard sections, but the Stage 2 release walkthrough covers every active section and major drill-down by smoke screenshot. Component migration remains a refactor concern, not a Stage 2 blocker. |

## Stage 3 Refactor Gate - 2026-05-21

| Gate | Status | Evidence |
| --- | --- | --- |
| Landed-cost controller extraction | Green | `/bayaan/api/landed_cost` now delegates to `BayaanLandedCostService`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5580`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5584`. The service owns expense-account lookup, landed-cost product setup, receipt picking selection, cost-line validation, Odoo landed-cost creation/validation, and response serialization: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:10`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:19`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:48`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:78`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:116`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/landed_cost_service.py:130`. Stage 3 passed two full post-refactor gates on 2026-05-21: `npm run verify` twice, plus clean-db Ubuntu WSL addon gates on DBs `bayaan_codex_20260521_031600` and `bayaan_codex_20260521_032943`; the final addon pass reported 85 post-tests, 111 addon tests, 0 failed, 0 errors. |

## Meeting Requirements Extracted

- One database, centrally managed branches, no independent franchise administration.
- Each branch/location must behave as a cost center / analytic account.
- POS must be simple, image-heavy, bilingual, and cashier-safe.
- POS must work offline for sales and receipt printing, then auto-sync; shift open/close requires internet.
- Prices must be fixed by branch pricelist; cashier manual price edits/discounts must be blocked unless explicitly authorized.
- Inventory should support perpetual valuation for branch P&L, with FIFO/LIFO decision made during requirements.
- Sales must deduct components for recipe/kit items.
- Semi-finished goods are required: warehouse/manufacturing can produce a stored intermediate product that is later consumed or sold.
- Min/max reorder notifications should alert back office.
- Landed costs should allocate shipping/customs costs even after part of a batch has been sold.
- Journal entries must require a cost center, including HQ.
- HQ expenses should support analytic distribution across branches.
- Transfers from warehouse to branches may need internal buy/sell accounting to preserve branch COGS and P&L.
- Cashiers must not void orders.
- Invoices must not be deleted.
- Financial periods must be lockable.
- Senior management needs read-only spectator/mobile access.
- Reports must include standard financials, branch analytic reports, and peak-hour/item-by-time analysis.
- AI report prompting is extra/out of base scope.
- RAD/sign-off, testing/training, go-live opening balances, and support workflow must be explicit.

## Coverage Matrix

| Area | Status | Evidence | Gap / Workflow Action |
| --- | --- | --- | --- |
| One official POS engine | Covered | `/bayaan/api/kiosk_sale` creates Odoo `pos.order`, creates `pos.payment`, marks paid, and calls `_process_saved_order`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4842`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4948`. Legacy `/pos_sale` is a guardrail: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4746`. | Keep this invariant. All future cashier flows must end in Odoo `pos.order` and Bayaan addon hooks. |
| Kiosk stock and branch identity | Covered for stock/POS/branch analytics | `bayaan.kiosk` links POS config, stock location, and branch cost center: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:10`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:29`. It validates POS source location: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:130`, auto-creates kiosk analytic accounts: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:67`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:96`, and exposes the field in the kiosk UI: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/views/bayaan_kiosk_views.xml:19`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/views/bayaan_kiosk_views.xml:45`. | Keep accountant validation around the final branch chart and reporting presentation. |
| Recipe/component deduction | Covered for sale-time consumption | Product consumption modes exist: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/product_template.py:7`. Paid orders post recipe/hybrid consumption: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:129`. Ledger rows are immutable by unique order line + recipe line: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_consumption.py:45`. | Keep tests around recipe, hybrid, finished, and none modes. |
| Recipe versioning | Covered | Active recipe lookup uses effective date and includes archived recipes for historical resolution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recipe.py:47`. Activation archives other active recipes: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recipe.py:58`. | Non-negotiable. Do not simplify to live-only recipe lines. |
| Daily close variance loop | Covered | Formula is encoded in shift close docstring: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:113`. It reads consumption ledger and waste entries: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:123`. Received transfers are counted from stock moves: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:156`. | Keep the variance-loop smoke and live Odoo realtime smoke in future gates. |
| Manager close review and lock | Covered | Approved/locked closes cannot be written or deleted: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:89`. Manager approval blocks missing/failed recipe orders: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5463`. | Keep approval/rejection tests. |
| Role and kiosk scoping | Covered for Bayaan APIs | Cashier/supervisor/logistics/accountant/manager groups exist: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:4`. API scope guard enforces assigned kiosk even when using sudo: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:258`. | Extend hardening to Odoo-native POS/accounting actions, not only Bayaan JSON routes. |
| Realtime dashboard/POS updates | Covered architecturally | Realtime config returns scoped channels: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_realtime.py:91`. Events publish through Odoo bus to target users: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_realtime.py:102`. Websocket filtering checks allowed channels: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/ir_websocket.py:7`. | Keep the live Odoo realtime smoke as a recurring pilot gate. |
| Offline sale queue | Covered for Stage 2 code semantics | Live `startShift` now refuses source-only/no-backend mode, refuses offline open, calls `/open_session`, and sets local shift only after a returned session id: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:266`, `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:282`. Already-open live sales keep an external receipt id and queue offline/retryable failures: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:392`, `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:408`. Shift close still refuses pending queues/live missing source: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:492`. | Hardware/offline network testing remains pilot ops work. |
| Receipt printing | Covered for Stage 2 code semantics | Receipt HTML is generated from local sale data: `apps/kiosk-pos/src/bayaan/receipt.ts:48`. Printing opens a receipt window and falls back to current-window print if blocked: `apps/kiosk-pos/src/bayaan/receipt.ts:103`. The payment complete modal prints the submitted or queued external id: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18189`. Unit tests cover escaped receipt content and queued status rendering: `apps/kiosk-pos/src/bayaan/receipt.test.ts:7`, `apps/kiosk-pos/src/bayaan/receipt.test.ts:32`. | Physical receipt printer/cash drawer validation remains hardware readiness, not Stage 2 code closure. |
| Image-heavy POS UI | Covered for source-data image persistence | Product seed data includes images and fixed displayed prices: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:570`. Odoo product serialization now returns `image_128` and `image_data_url`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:538`. Source product uploads are accepted as `image_base64`/`imageBase64`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:563`. Frontend source payloads send image fields: `apps/kiosk-pos/src/services/sourceOfTruth.ts:620`, `apps/kiosk-pos/src/services/sourceOfTruth.ts:642`. Source-mode product editor uploads and saves source images: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13559`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13606`. | Keep source-image wiring and browser smoke in future UI refactors. |
| Bilingual/RTL | Covered in UI | EN/AR controls exist: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18776`. App frame applies `dir` and `lang`: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18889`. | Keep smoke assertion for Arabic RTL. |
| Fixed branch prices / discounts | Covered for Bayaan `/kiosk_sale` | The sale endpoint resolves authoritative unit price from the kiosk POS config pricelist and writes it to the Odoo order line: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4785`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4909`. It stores the applied pricelist on `pos.order`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4991`. Underpaid browser price tampering is blocked by the server-computed payment total check: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4976`. Manager discounts require manager rights plus a reason and write audit events: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4918`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4920`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5021`. Tests cover tamper rejection, stale client price using server pricelist, cashier discount blocking, and manager discount audit: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:72`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:85`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:102`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:122`. | Keep the frontend price as display-only. Extend the same commercial-control stance to any future native Odoo POS customization before pilot. |
| Odoo payment methods | Covered for validation | Sale payment methods must be configured on the POS config: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4771`, with unconfigured methods rejected: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4780`. | Keep validation next to pricelist and discount authorization. |
| Iraqi payment gateway catalog | Partial | Gateway catalog includes Zain Cash, FIB, Qi Card, NassWallet, FastPay, and AsiaHawala: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:35`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:43`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:51`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:59`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:67`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:75`. Live API calls are blocked pending credentials/sandbox: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2783`. Webhooks are idempotent: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2937`. | Production adapter work remains: real provider credentials, sandbox contracts, settlement reconciliation, and no browser-exposed secrets. |
| Stock transfer state machine | Mostly covered | Backend creates internal pickings with move lines: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5024`. Transfer states include draft, approved, picked, dispatched, received, cancelled: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_picking.py:7`. Receive validates picking and discrepancies: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5098`. | Meeting also raised financial treatment as internal buy/sell. Current transfer flow is stock-picking oriented, not proven accounting/internal sale-purchase. |
| Purchase receiving | Mostly covered | PO creation/confirmation exists: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5150`. Receive action validates incoming pickings: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5300`. Landed-cost allocation is now covered separately below. | Supplier price catalog remains P1/RAD-dependent. |
| Reordering | Partial | Products have custom reorder/target/critical/max fields: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/product_template.py:23`. Bootstrap derives status and suggested transfers below reorder target: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:449`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4144`. | Meeting asked for Odoo min/max reordering notifications. Decide whether custom suggestions are enough or implement `stock.warehouse.orderpoint` rules. |
| Manufacturing / semi-finished goods | Covered for operational MRP/BOM workflow | The addon now depends on Odoo MRP: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:13`. The semi-finished test creates a 10-line `mrp.bom`, completes an `mrp.production`, moves the produced mix to a kiosk, sells a product whose Bayaan recipe consumes that mix, and proves historical recipe resolution still selects the sale-time recipe: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:73`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:90`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:137`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:151`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:168`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:184`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:192`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:204`. | Accountant still needs to sign off final valuation method and chart/account mappings, but the operational semi-finished workflow is no longer a code gap. |
| Landed costs | Covered for Stage 2 | The addon depends on Odoo `stock_landed_costs`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:14`. `/bayaan/api/landed_cost` creates a landed cost, computes allocation, validates by default, audits the action, and serializes the result: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5707`. Landed-cost adjustment move lines receive kiosk/HQ analytic distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_landed_cost.py:4`. The test receives a FIFO batch, sells part of it, posts landed cost, and verifies remaining stock value is adjusted: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:264`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:330`. | Accountant must confirm final valuation method and reporting presentation. |
| Analytic accounts / mandatory cost centers | Code covered, accountant sign-off pending | Kiosks now carry a company-checked branch cost center: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:29`, create/use a mandatory branch analytic plan: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:79`, auto-provision analytic accounts: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:96`, and expose a 100% kiosk distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:125`. HQ/shared expenses get an HQ analytic account plus Odoo analytic distribution model from configured branch weights: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:131`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:160`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:196`. POS sale/invoice accounting values receive the distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:63`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:242`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:259`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:268`. Recipe scrap stock moves can derive the kiosk distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_scrap.py:7`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_scrap.py:28`. Posting product journal lines without analytic distribution is blocked: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:8`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:13`. Tests cover these paths, including HQ shared-expense posting: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:77`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:83`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:91`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:103`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:111`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:153`. | Accountant must validate the final chart of accounts, branch analytic reporting, and configured HQ distribution percentages before client sign-off. |
| Standard financial reports | Partial / Odoo configuration dependent | Addon depends on `account`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:8`. Bayaan dashboard calculates operational summary values: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4460`. | Need accountant-validated Odoo chart, valuation method, fiscal locks, analytic reports, and P&L proof. |
| Void, invoice deletion, period locks | Covered for Bayaan/Odoo guards | Paid kiosk POS orders are protected from cancel/refund/delete unless a system-admin break-glass context is used: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:47`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:70`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:74`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:78`. Paid order lines are protected from deletion: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:278`. Accounting posting checks company lock dates before post and account moves cannot be deleted outside break-glass: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:14`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:38`. Tests cover paid POS cancel/refund/delete, order-line delete, invoice/journal delete, and locked-period posting rejection: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:120`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:130`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:136`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:142`. | Keep break-glass contexts restricted to system admins, documented as exceptional support operations, and apply the same guard stance to any future native POS customizations. |
| Spectator/read-only management | Partial | Accountant group implies Odoo account read-only: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:26`. Chain read role payload exposes allowed panels and assigned kiosks: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:155`. | Define a top-management spectator group with no write/action rights and test mobile/Odoo access if the client expects native Odoo app use. |
| Peak-hour item reporting | Covered for Stage 2 backend report | `/bayaan/api/peak_hour_report` filters by date range, kiosk, and product and groups Odoo POS lines by kiosk, product, hour, cashier, and session: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4875`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4913`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4974`. The test posts three real `/kiosk_sale` orders across two hours and verifies hourly totals/top product output: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:131`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:153`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:162`. | Dashboard/export polish can be handled in the report UI slice if the RAD asks for a dedicated screen; deterministic source API is covered. |
| AI report prompting | Extra scope, partially built | AI dashboard plan/read endpoints are read-only and scoped: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2575`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2592`. | Keep AI as optional/paid tier. Do not let AI compute official numbers. |
| RAD, training, support workflow | Process gap | Meeting requires Excel data templates, RAD sign-off, training, opening balances, and support terms. | Create RAD/checklist artifacts before implementation. Code alone cannot close this item. |

## P0 Workflow Backlog

These are the items that should be closed before telling the client the meeting scope is covered.

### 1. RAD and Scope Baseline

Goal: convert the meeting into a signable requirements document before coding more ERP features.

Acceptance criteria:
- Create/update a RAD document that lists every requirement in this audit.
- Mark each item as included, extra, excluded, or external dependency.
- Resolve the scope difference between current product positioning and this meeting target count.
- Record the final decisions for valuation method, FIFO/LIFO, internal buy/sell transfers, MRP, landed costs, AI tier, and support workflow.

### 2. Analytic Cost Centers and Mandatory Journal Enforcement

Goal: each branch must be an analytic account/cost center and accounting entries must not bypass allocation.

Status as of 2026-05-20: code-covered for branch/kiosk analytics, manual product journal enforcement, and HQ shared-expense distribution. Earlier targeted gates passed for the branch/manual guard and HQ distribution tests; the final Stage 2 full addon gate is recorded above with `bayaan_fnb_kiosk: 110 tests` and `0 failed, 0 error(s)`. Remaining work is external accountant validation.

Implementation shape:
- Add/derive an analytic account for each `bayaan.kiosk`. Done for kiosk creation/write.
- Propagate kiosk analytic account to POS/accounting outputs where Odoo creates journal lines. Done for POS sale grouping, invoice lines, and recipe scrap stock moves.
- Add HQ analytic account and analytic distribution templates for shared expenses. Done through Bayaan helpers over Odoo `account.analytic.distribution.model`.
- Add server-side validation or Odoo configuration that blocks journal lines without an analytic allocation except an explicit whitelist. Done for posting product journal lines.

Acceptance criteria:
- [x] Tests prove POS sale accounting values and recipe stock-move analytic distribution use the kiosk analytic account.
- [x] Tests prove manual product journal entry without analytic account is blocked.
- [x] Tests prove HQ expense distribution posts to configured branch percentages.
- [ ] Accountant validates chart of accounts and analytic reporting. External sign-off.

### 3. Server-Side Pricelist, Discount, and Cashier Commercial Controls

Goal: cashier cannot alter price or discount from the browser.

Status as of 2026-05-20: code-covered for the Bayaan `/kiosk_sale` route. The backend now computes unit price from `pos.config.pricelist_id`, ignores stale browser `price_unit` for official pricing, blocks underpayment against the server total, requires manager rights plus reason for discounts, and audits each approved discount. Earlier targeted gates passed for this slice; the final Stage 2 frontend/backend gates are recorded above with `171` Vitest tests, the release smoke, `bayaan_fnb_kiosk: 110 tests`, and `0 failed, 0 error(s)`.

Implementation shape:
- Resolve sale prices from Odoo pricelist assigned to kiosk/POS config. Done in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4785`.
- Reject economically effective `price_unit` tampering in `/bayaan/api/kiosk_sale`. Done by computing totals server-side and comparing payments at `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4976`.
- Add a manager-authorized discount override path if the RAD allows discounts. Done in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4918`.
- Audit every discount/override with manager identity and reason. Done in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5021`.

Acceptance criteria:
- [x] Browser-tampered `price_unit` underpayment is rejected: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:72`.
- [x] Normal sale uses server price even if client sends stale price: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:85`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:114`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:116`.
- [x] Cashier cannot discount: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:102`.
- [x] Manager discount, if enabled, requires authorization and appears in audit log: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:122`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:163`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py:164`.

### 4. Odoo-Level Void, Invoice Delete, and Period-Lock Hardening

Goal: security must survive direct Odoo/mobile access, not only Bayaan UI.

Status as of 2026-05-20: code-covered in the Bayaan addon for paid kiosk POS order cancel/refund/delete, paid order-line deletion, invoice/journal-entry deletion, and locked-period posting rejection. Earlier targeted verification passed for this slice; the final Stage 2 full addon gate is recorded above with `bayaan_fnb_kiosk: 110 tests` and `0 failed, 0 error(s)`.

Implementation shape:
- Identify Odoo POS void/refund/delete capabilities available to `point_of_sale.group_pos_user`. Done against Odoo POS cancel/refund/unlink entry points.
- Remove or guard cashier void/refund actions. Done in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:70` and `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:74`.
- Add explicit invoice/account move delete protection where Odoo configuration is insufficient. Done in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:38`.
- Configure and test fiscal period locks. Done with a Bayaan pre-post lock-date guard in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:14`.

Acceptance criteria:
- [x] Cashier cannot void/refund/cancel a paid order: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:120`.
- [x] Cashier cannot delete paid POS order lines: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:130`.
- [x] Cashier cannot delete invoices or accounting entries: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:136`.
- [x] Admin/superuser operational policy is documented in code as break-glass only and restricted to `base.group_system`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:47`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:8`.
- [x] Locked period rejects retroactive changes: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_odoo_security_hardening.py:142`.

### 5. Manufacturing / Semi-Finished Goods

Goal: support the client's "signature mix" requirement.

Status as of 2026-05-20: code-covered for the operational semi-finished workflow. The addon now installs Odoo MRP, the targeted MRP gate passed with `0 failed, 0 error(s)` for `TestMrpSemiFinishedGoods.test_mrp_produces_stored_mix_then_bayaan_recipe_consumes_it` on database `bayaan_codex_20260520_223009`, and the full addon gate passed on `bayaan_codex_20260520_230426`.

Implementation shape:
- Use standard Odoo MRP directly for manufacturing orders/BOMs. Done by dependency in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:13`.
- Add MRP dependency/configuration if included. Done.
- Model semi-finished goods as storable products produced from BOMs. Covered in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:73` and `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:90`.
- Allow recipes to consume semi-finished goods later at sale time. Covered in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:168`.
- Test manufacturing order, inventory increase, later sale consumption, and variance impact. Covered by the targeted Odoo test.

Acceptance criteria:
- [x] Produce a semi-finished mix from 10 ingredients into stock: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:137`.
- [x] Sell a product that consumes that mix: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:168` and `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:184`.
- [x] Variance and COGS remain deterministic through Bayaan's immutable sale-time consumption ledger and unit cost: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:190`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:192`.
- [x] Historical recipe versioning still works: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_mrp_semifinished.py:204`.

### 6. Landed Costs

Goal: support shipping/customs cost allocation even after partial sale.

Implementation shape:
- [x] Use standard Odoo landed costs through `stock_landed_costs`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:14`.
- [x] Add `/bayaan/api/landed_cost` to create, compute, validate, audit, and serialize landed costs: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5707`.
- [x] Test landed cost allocation against received stock with partial sale already posted: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:264`.
- [ ] Confirm accounting treatment with accountant.

Acceptance criteria:
- [x] Customs/shipping cost can be allocated to a received batch: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:311`.
- [x] Already-sold portion is accounted for before allocation: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:304`.
- [x] Remaining stock valuation is updated correctly: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:330`.
- [x] Cost adjustment trail returns the posted landed cost, valuation adjustments, and journal entry id: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:811`.

### 7. Offline Open Shift and Receipt Printing

Goal: match the meeting statement: sales can continue offline after a shift is open, but shift open/close requires internet.

Implementation shape:
- [x] Require successful backend `/open_session` before local shift becomes active in live mode: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:266`, `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:282`.
- [x] Keep offline sale queue for already-open sessions: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:392`.
- [x] Implement receipt printing from local sale data and synced sale data: `apps/kiosk-pos/src/bayaan/receipt.ts:48`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18189`.
- [x] Add unit coverage for receipt rendering and include POS sale/payment/waste in the release walkthrough: `apps/kiosk-pos/src/bayaan/receipt.test.ts:7`, `apps/kiosk-pos/scripts/smoke.mjs:171`, `apps/kiosk-pos/scripts/smoke.mjs:218`, `apps/kiosk-pos/scripts/smoke.mjs:227`.

Acceptance criteria:
- [x] Live mode cannot open a shift while offline or when backend rejects open session: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:278`, `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:289`.
- [x] Already-open session can queue sales offline: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:392`.
- [x] Close shift is blocked until queue is flushed: `apps/kiosk-pos/src/bayaan/BayaanProvider.tsx:492`.
- [x] Receipt can render from queued local sale id and status: `apps/kiosk-pos/src/bayaan/receipt.test.ts:32`.

### 8. Product Images as Source Data

Goal: Odoo product catalog should carry item images, not just local browser overrides.

Implementation shape:
- [x] Add image upload/persistence to `/product_catalog` and `/create_stock_item`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:563`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:3739`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:3817`.
- [x] Store images on Odoo product image fields: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:3775`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:3855`.
- [x] Hydrate POS catalog images from Odoo: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:538`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:3328`.

Acceptance criteria:
- [x] Admin uploads image once from source mode: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13559`.
- [x] Another browser/device sees the same item image after bootstrap: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:197`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py:226`.
- [x] Source-mode image changes are sent to Odoo, not hidden/local only: `apps/kiosk-pos/src/services/sourceOfTruth.ts:620`, `apps/kiosk-pos/src/services/sourceOfTruth.ts:642`.

### 9. Peak-Hour Product Report

Goal: answer the client's question: "At which hours does this branch sell the most Lattes?"

Implementation shape:
- [x] Add backend aggregation by company, kiosk/branch, product, date range, hour bucket, shift, and cashier: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4875`.
- [x] Return quantity, revenue, order counts, hourly totals, and top products from deterministic POS lines: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4934`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4974`.
- [ ] Dedicated dashboard/export polish is optional report UI work after the deterministic API is accepted in the RAD.

Acceptance criteria:
- [x] Report can filter one branch and one product: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:153`.
- [x] Report shows hourly buckets for selected period: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:162`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:167`.
- [x] Data traces back to Odoo `pos.order` / `pos.order.line`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4889`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4913`.
- [x] Tests cover Baghdad-local timezone/day-boundary behavior: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:501`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:512`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:132`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:137`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_kiosk_sale_api.py:169`.

## P1 Workflow Backlog

- Convert custom reorder suggestions into Odoo min/max orderpoints if the RAD requires native procurement automation.
- Implement or document internal buy/sell accounting for warehouse-to-branch transfers.
- Create spectator/mobile access role and test it against Odoo mobile expectations.
- Add supplier price catalog and recurring purchase refinement if required.
- Build deterministic finance/PDF exports after accountant validates chart and branch accounting flow.
- Finalize production deployment, backups, monitoring, SSL, restore drill, and secrets process.
- Keep AI reporting as an extra commercial tier with per-tenant token budget and traceable source references.

## Suggested Long-Running Workflow Prompt

Use this if starting an automated/long workflow:

```text
Read AGENTS.md, CLAUDE.md, and docs/sales-meeting-gap-audit-2026-05-20.md.
First diff AGENTS.md and CLAUDE.md.
Re-verify every claim before acting.
Close P0 items in order:
1. RAD/scope baseline
2. analytic cost centers and mandatory journal enforcement
3. server-side pricelist/discount controls
4. Odoo-level void/delete/period locks
5. MRP/semi-finished goods
6. landed costs
7. offline open shift and receipt printing
8. product images as source data
9. peak-hour product report

For each item:
- cite current evidence as path:line before implementation
- implement the smallest code/config change that closes the gap
- add backend/frontend tests proportional to risk
- run the relevant gate
- update this document or the production gap plan with evidence and remaining risk

Do not mark release green from tests alone. A full browser/dashboard walkthrough is required.
```

## Verification Commands for Future Runs

Re-run these before changing status:

```bash
diff AGENTS.md CLAUDE.md
cd apps/kiosk-pos && npm run verify
wsl.exe -d Ubuntu -- bash -lc "cd '/mnt/c/Users/hassa/OneDrive/Desktop/Bayaan.ai/bayaan POS' && DROP_FAILED_DB=1 TEST_TIMEOUT_SECONDS=1800 bash scripts/odoo-addon-test.sh"
```

For backend work, run the Bayaan addon test gate used by the current branch. Re-read the repository instructions before executing because the exact command can change.

## Notes

- This document deliberately does not change product scope by itself. The RAD must decide whether MRP, landed costs, AI prompting, internal buy/sell transfers, and post-warranty support terms are included in base delivery or priced separately.
- The codebase already does more than the meeting's basic Odoo discussion in some areas, especially realtime, variance, payment event idempotency, AI read facades, and scoped kiosk APIs. Do not remove those strengths while closing ERP gaps.
