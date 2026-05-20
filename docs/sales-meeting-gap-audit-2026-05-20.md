# Sales Meeting Gap Audit - 2026-05-20

Source context: client sales meeting transcript and executive brief provided in the chat on 2026-05-20.

Purpose: preserve today's trace of the meeting requirements against the current Bayaan/Odoo codebase, then turn the gaps into a workflow-ready backlog. This document is not a release sign-off. The initial source audit did not run the frontend verify gate or Odoo addon test gate; later point-specific updates record their own verification.

Ground rule for future agents: before marking any item covered, re-read or re-grep the cited code in the current checkout. Do not rely on this document as stale truth.

## Executive Conclusion

Bayaan is well covered for the custom kiosk/POS variance loop: Odoo POS is the official sales engine, recipes are versioned, paid sales create consumption ledger rows, waste and transfers feed daily close variance, and manager review locks approved closes. Evidence: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4842`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:129`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recipe.py:47`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:113`.

Bayaan is not yet fully covered for the classic ERP commitments from the meeting: manufacturing/semi-finished goods, landed costs, server-side pricelist enforcement, Odoo-level void/invoice/period locks, and live product-by-hour reporting still need explicit implementation or configuration proof. Analytic cost centers are now partially closed: branch/kiosk analytic allocation and the manual journal guard are implemented, while HQ expense distribution templates and accountant validation remain open. Evidence anchors for these gaps are listed below.

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
| Daily close variance loop | Covered | Formula is encoded in shift close docstring: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:113`. It reads consumption ledger and waste entries: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:123`. Received transfers are counted from stock moves: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:156`. | Add end-to-end smoke proving sale/waste/transfer appears without manual dashboard refresh. |
| Manager close review and lock | Covered | Approved/locked closes cannot be written or deleted: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_shift_close.py:89`. Manager approval blocks missing/failed recipe orders: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5463`. | Keep approval/rejection tests. |
| Role and kiosk scoping | Covered for Bayaan APIs | Cashier/supervisor/logistics/accountant/manager groups exist: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:4`. API scope guard enforces assigned kiosk even when using sudo: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:258`. | Extend hardening to Odoo-native POS/accounting actions, not only Bayaan JSON routes. |
| Realtime dashboard/POS updates | Covered architecturally | Realtime config returns scoped channels: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_realtime.py:91`. Events publish through Odoo bus to target users: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_realtime.py:102`. Websocket filtering checks allowed channels: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/ir_websocket.py:7`. | Release gate still needs a real browser walkthrough proving no manual refresh for sale/transfer/waste/close. |
| Offline sale queue | Partial | Durable queue intent is documented in code: `apps/kiosk-pos/src/bayaan/saleQueue.ts:1`. Auto-flush listens online/visibility and retries: `apps/kiosk-pos/src/bridge/BayaanProvider.tsx:303`. Shift close refuses pending queue/live missing source: `apps/kiosk-pos/src/bridge/BayaanProvider.tsx:492`. | Opening shift is weaker: local shift state is set before backend `openSession` succeeds: `apps/kiosk-pos/src/bridge/BayaanProvider.tsx:260`. Enforce online open-session success before local active shift. |
| Receipt printing | Gap | The payment complete modal has a Print button: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18208`. No verified print handler was found in the current trace. | Implement and smoke test receipt printing, including offline/local queued sale mode. |
| Image-heavy POS UI | Partial | Product seed data includes images and fixed displayed prices: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:570`. POS grid renders price: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:17789`. | Odoo master-data image persistence is missing: source mode hides browser image overrides while posting names/prices/recipes: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13268`; backend `/product_catalog` upsert writes product fields but no image field: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:3636`. |
| Bilingual/RTL | Covered in UI | EN/AR controls exist: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18776`. App frame applies `dir` and `lang`: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:18889`. | Keep smoke assertion for Arabic RTL. |
| Fixed branch prices / discounts | Gap | Backend sale payload accepts browser `price_unit`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4879`. It only checks payment total equals computed order total: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4918`. Frontend builds `price_unit` from UI cart math: `apps/kiosk-pos/src/bayaan/buildPosSale.ts:101`. | Resolve authoritative price server-side from Odoo pricelist/POS config/kiosk. Reject payload price mismatches except manager-authorized discount flow. |
| Odoo payment methods | Covered for validation | Sale payment methods must be configured on the POS config: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4762`. | Keep validation; add pricelist and discount authorization next to it. |
| Iraqi payment gateway catalog | Partial | Gateway catalog includes Zain Cash, FIB, Qi Card, NassWallet, FastPay, and AsiaHawala: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:35`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:43`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:51`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:59`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:67`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/payment_gateways.py:75`. Live API calls are blocked pending credentials/sandbox: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2783`. Webhooks are idempotent: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:2937`. | Production adapter work remains: real provider credentials, sandbox contracts, settlement reconciliation, and no browser-exposed secrets. |
| Stock transfer state machine | Mostly covered | Backend creates internal pickings with move lines: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5024`. Transfer states include draft, approved, picked, dispatched, received, cancelled: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_picking.py:7`. Receive validates picking and discrepancies: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5098`. | Meeting also raised financial treatment as internal buy/sell. Current transfer flow is stock-picking oriented, not proven accounting/internal sale-purchase. |
| Purchase receiving | Mostly covered | PO creation/confirmation exists: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5150`. Receive action validates incoming pickings: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5300`. | Add landed cost support and supplier price catalog if the RAD requires it. |
| Reordering | Partial | Products have custom reorder/target/critical/max fields: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/product_template.py:23`. Bootstrap derives status and suggested transfers below reorder target: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:449`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4144`. | Meeting asked for Odoo min/max reordering notifications. Decide whether custom suggestions are enough or implement `stock.warehouse.orderpoint` rules. |
| Manufacturing / semi-finished goods | Gap | Addon manifest dependencies include account, bus, hr, POS, purchase, stock, but not manufacturing/MRP: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:8`. Recipes currently model ingredient consumption lines, not manufacturing orders/BOM production: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recipe.py:70`. | Add MRP/BOM/semi-finished workflow or explicitly exclude from base scope in RAD. This was a critical client requirement. |
| Landed costs | Gap | Manifest does not include a landed-cost dependency in the current dependency list: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:8`. Current PO workflow creates/receives POs, not landed-cost allocations: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:5150`. | Implement/configure Odoo landed costs and test allocation after partial sale, or mark as out of scope with client sign-off. |
| Analytic accounts / mandatory cost centers | Partial, backend branch enforcement covered | Kiosks now carry a company-checked branch cost center: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:29`, create/use a mandatory branch analytic plan: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:79`, auto-provision analytic accounts: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:96`, and expose a 100% kiosk distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:125`. POS sale/invoice accounting values receive the distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:63`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:242`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:259`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/pos_order.py:268`. Recipe scrap stock moves can derive the kiosk distribution: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_scrap.py:7`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/stock_scrap.py:28`. Posting product journal lines without analytic distribution is blocked: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:8`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/account_move.py:13`. Tests cover all of those paths: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:53`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:59`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:67`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:79`, `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_analytic_cost_centers.py:87`. | Add HQ analytic account/distribution templates for shared expenses and get accountant validation of the chart/reporting outputs. |
| Standard financial reports | Partial / Odoo configuration dependent | Addon depends on `account`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py:8`. Bayaan dashboard calculates operational summary values: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4460`. | Need accountant-validated Odoo chart, valuation method, fiscal locks, analytic reports, and P&L proof. |
| Void, invoice deletion, period locks | Gap / configuration proof missing | Bayaan cashier group implies Odoo POS user: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:7`. No custom Bayaan sale void endpoint was part of the verified official sale path; legacy `/pos_sale` rejects real sales: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4746`. | Add explicit tests/config guards proving cashiers cannot void/refund, invoices cannot be deleted, and past periods cannot be modified. Do not rely on UI hiding alone. |
| Spectator/read-only management | Partial | Accountant group implies Odoo account read-only: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/bayaan_security.xml:26`. Chain read role payload exposes allowed panels and assigned kiosks: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:155`. | Define a top-management spectator group with no write/action rights and test mobile/Odoo access if the client expects native Odoo app use. |
| Peak-hour item reporting | Gap / partial data only | Chain bootstrap serializes sale lines with `date_order`: `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py:4635`. Frontend has hourly aggregation logic for pulse data: `apps/kiosk-pos/src/services/sourceOfTruth.ts:2210`. | Add backend report/API grouped by branch, product, hour, shift, and cashier. This is explicitly requested for pricing/promotions. |
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

Status as of 2026-05-20: partially closed for branch/kiosk analytics and manual product journal enforcement. The Bayaan addon test gate passed after this implementation with `0 failed, 0 error(s) of 70 tests` and `bayaan_fnb_kiosk: 92 tests`. Remaining work is HQ shared-expense distribution and accountant validation.

Implementation shape:
- Add/derive an analytic account for each `bayaan.kiosk`. Done for kiosk creation/write.
- Propagate kiosk analytic account to POS/accounting outputs where Odoo creates journal lines. Done for POS sale grouping, invoice lines, and recipe scrap stock moves.
- Add HQ analytic account and analytic distribution templates for shared expenses.
- Add server-side validation or Odoo configuration that blocks journal lines without an analytic allocation except an explicit whitelist. Done for posting product journal lines.

Acceptance criteria:
- [x] Tests prove POS sale accounting values and recipe stock-move analytic distribution use the kiosk analytic account.
- [x] Tests prove manual product journal entry without analytic account is blocked.
- [ ] Tests prove HQ expense distribution posts to configured branch percentages.
- [ ] Accountant validates chart of accounts and analytic reporting.

### 3. Server-Side Pricelist, Discount, and Cashier Commercial Controls

Goal: cashier cannot alter price or discount from the browser.

Implementation shape:
- Resolve sale prices from Odoo pricelist assigned to kiosk/POS config.
- Reject `price_unit` mismatches in `/bayaan/api/kiosk_sale`.
- Add a manager-authorized discount override path if the RAD allows discounts.
- Audit every discount/override with manager identity and reason.

Acceptance criteria:
- Browser-tampered `price_unit` is rejected.
- Normal sale uses server price even if client sends stale price.
- Cashier cannot discount.
- Manager discount, if enabled, requires authorization and appears in audit log.

### 4. Odoo-Level Void, Invoice Delete, and Period-Lock Hardening

Goal: security must survive direct Odoo/mobile access, not only Bayaan UI.

Implementation shape:
- Identify Odoo POS void/refund/delete capabilities available to `point_of_sale.group_pos_user`.
- Remove or guard cashier void/refund actions.
- Add explicit invoice/account move delete protection where Odoo configuration is insufficient.
- Configure and test fiscal period locks.

Acceptance criteria:
- Cashier cannot void/refund/cancel a paid order.
- Cashier cannot delete invoices or accounting entries.
- Admin/superuser operational policy is documented: either disabled entirely or restricted to break-glass flow.
- Locked period rejects retroactive changes.

### 5. Manufacturing / Semi-Finished Goods

Goal: support the client's "signature mix" requirement.

Implementation shape:
- Decide whether to use Odoo MRP directly or a Bayaan wrapper around MRP.
- Add MRP dependency/configuration if included.
- Model semi-finished goods as storable products produced from BOMs.
- Allow recipes to consume semi-finished goods later at sale time.
- Test manufacturing order, inventory increase, later sale consumption, and variance impact.

Acceptance criteria:
- Produce a semi-finished mix from 10 ingredients into stock.
- Sell a product that consumes that mix.
- Variance and COGS remain deterministic.
- Historical recipe versioning still works.

### 6. Landed Costs

Goal: support shipping/customs cost allocation even after partial sale.

Implementation shape:
- Decide whether standard Odoo landed costs are in scope.
- Add required module/configuration.
- Test landed cost allocation against received stock with partial consumption already posted.
- Confirm accounting treatment with accountant.

Acceptance criteria:
- Customs/shipping cost can be allocated to a received batch.
- Already-sold portion is accounted for correctly.
- Remaining stock valuation is updated correctly.
- Reports explain the cost adjustment trail.

### 7. Offline Open Shift and Receipt Printing

Goal: match the meeting statement: sales can continue offline after a shift is open, but shift open/close requires internet.

Implementation shape:
- Require successful backend `/open_session` before local shift becomes active in live mode.
- Keep offline sale queue for already-open sessions.
- Implement receipt printing from local sale data and synced sale data.
- Add smoke test for offline queued sale and receipt.

Acceptance criteria:
- Live mode cannot open a shift while offline or when backend rejects open session.
- Already-open session can queue sales offline.
- Close shift is blocked until queue is flushed.
- Receipt prints while offline from the local queued sale.

### 8. Product Images as Source Data

Goal: Odoo product catalog should carry item images, not just local browser overrides.

Implementation shape:
- Add image upload/persistence to `/product_catalog`.
- Store images on `product.template`/`product.product` using Odoo image fields.
- Hydrate POS catalog images from Odoo.

Acceptance criteria:
- Admin uploads image once.
- Another browser/device sees the same item image after bootstrap.
- Source-mode image changes are not hidden/local only.

### 9. Peak-Hour Product Report

Goal: answer the client's question: "At which hours does this branch sell the most Lattes?"

Implementation shape:
- Add backend aggregation by company, kiosk/branch, product, date range, hour bucket, shift, and cashier.
- Return quantity, revenue, average ticket contribution, and optional margin/cost if deterministic source exists.
- Add dashboard view/export.

Acceptance criteria:
- Report can filter one branch and one product.
- Report shows hourly buckets for selected period.
- Data traces back to Odoo `pos.order` / `pos.order.line`.
- Tests cover timezone/day-boundary behavior.

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
```

For backend work, run the Bayaan addon test gate used by the current branch. Re-read the repository instructions before executing because the exact command can change.

## Notes

- This document deliberately does not change product scope by itself. The RAD must decide whether MRP, landed costs, AI prompting, internal buy/sell transfers, and post-warranty support terms are included in base delivery or priced separately.
- The codebase already does more than the meeting's basic Odoo discussion in some areas, especially realtime, variance, payment event idempotency, AI read facades, and scoped kiosk APIs. Do not remove those strengths while closing ERP gaps.
