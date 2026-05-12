# Bayaan Admin Dashboard Concept

Bayaan's admin dashboard is a custom F&B kiosk command center on top of Odoo Community. Odoo remains the hidden POS/accounting/stock engine; Bayaan is the branded operational layer the owner uses daily.

## Operating Principle

Every official number must come from deterministic records:

- Sales: `pos.order`, `pos.payment`, `pos.session`
- Ingredient consumption: `bayaan.consumption.ledger`
- Kiosk stock and allocation: Odoo `stock.location`, `stock.quant`, `stock.picking`
- Waste: `bayaan.waste.entry`
- Daily close: `bayaan.shift.close` and stock/cash variance lines
- Purchases and cost changes: `purchase.order`, product costs, recipe versions

AI is read-only. It summarizes, flags anomalies, and recommends transfers or purchases, but it does not compute official sales, stock, cash, or margin totals.

## Dashboard Surfaces

1. Today Command Center
   - Total sales today, profit estimate, cash expected, digital payments, open/closed kiosks, low stock, unresolved variances, alerts, AI summary.

2. Kiosks Overview
   - Live kiosk cards/table with city, status, sales, stock health, waste, margin, last activity, and route into kiosk detail.

3. Kiosk Detail
   - Tabs for overview, sales, current stock, stock movements, waste/loss, POS sessions, daily closings, and staff.
   - Current stock makes the variance loop explicit: opening + received - POS recipe consumption - recorded waste = expected remaining.

4. Stock & Allocation
   - Main stock, kiosk stock, pending transfers, low-stock items, and suggested transfers for tomorrow.
   - Suggested transfers are actionable: in demo mode they confirm the planned draft; when connected, the same action submits `/bayaan/api/stock_transfer` so the movement becomes an auditable internal picking into the kiosk stock location.

5. Products & Recipes
   - Product list, prices, recipe ingredients, packaging, version, product cost, and gross margin.
   - In demo mode the editor persists locally. When `VITE_ODOO_URL` is configured, saving a recipe submits a versioned recipe payload to `/bayaan/api/recipe_version`; product master-data writes remain a separate future endpoint.

6. Sales & POS Monitor
   - Odoo POS order feed, cashier, product, payment method, amount, refunds/voids/discounts, and recipe posting status.

7. Daily Close & Variance
   - Expected vs counted cash and stock, waste value, manager approval/rejection, notes, and investigation state.
   - The list view should expose investigation status beside the close status so unresolved cash or stock issues are visible without opening each row.
   - Expanded close rows should call out paid orders with `missing_recipe` or `failed` recipe posting state, because unposted consumption is a direct cause of false stock variance.

8. Waste & Loss
   - Spoiled fruit, broken packaging, wrong orders, samples, staff meals, missing stock, unknown loss, and waste value by cause.

9. Purchases & Suppliers
   - Suppliers, open purchase orders, ingredient price changes, purchase history cues, and margin impact.

10. Staff & Expenses
   - Staff roster, kiosk assignment, payroll, cashier performance, cash shortages, refunds/voids, and non-stock expenses.

11. Reports
   - Daily/weekly/monthly/yearly packs for kiosk performance, profitability, ingredient consumption, waste/loss, and cash flow.
   - Payment-method reports must keep cash, card, QR, mobile wallet, and manual digital payments separated.
   - The visible report pack exports a CSV with each KPI tied to its deterministic source model so exported management files do not become untraceable screenshots.

12. AI Insights
   - Traceable summaries and recommendations backed by source rows.

## Scale Shape

The first pilot is 10 kiosks in Baghdad, but the dashboard is designed for 20, 50, and 100+ stalls by keeping the main screen status-first, using filters for city/location, and routing detail work into drill-down pages instead of crowding the command center.

## Bootstrap Contract

`/bayaan/api/chain_bootstrap` should hydrate the dashboard with:

- `meta` for snapshot date, generation time, payload limits, and `rows_returned` so capped table payloads are explicit.
- `summary` for compact command-center totals, payment-method splits, report-period aggregates, alert counts, true source counts, and per-kiosk status rollups.
- `kiosks` for location metadata and POS/stock location mapping.
- `warehouse_stock`, `kiosk_stock`, and `kiosk_stock_rows` for stock and allocation screens.
- `transfers` for internal warehouse-to-kiosk pickings and pending allocation work.
- `suggested_transfers` for low-stock kiosk items that should be replenished from source warehouses before tomorrow.
- `products` and `recipes` for product pricing, Bayaan consumption mode, active recipe versions, ingredient lines, recipe cost, and gross margin.
- `purchase_orders` for supplier spend, open POs, ingredient cost movement, and margin-impact screens.
- `today.orders`, `today.payments`, `today.sales`, `today.consumption`, and `today.waste` for POS monitor, payment split, consumption, and waste views.
- `closings` for daily close, cash variance, expected-vs-counted stock rows, manager review state, reviewer metadata, notes, and investigation status.

This lets the admin dashboard read one source-backed snapshot instead of building another reporting database. For 100+ kiosks, the command center and AI cards should prefer aggregate `summary` values first, then drill into capped raw rows only on detail pages.

Reports should read `summary.reportPeriods.daily|weekly|monthly|yearly` for revenue, orders, COGS, waste value, net profit, cash expected, digital payments, payment-method split, and source counts. The visible report pack can still provide drill-down links, but the headline daily/weekly/monthly/yearly numbers must come from these aggregate queries.

## Frontend Verification Contract

The Vite smoke test is part of the dashboard concept, not just an engineering check. It verifies:

- The visible admin copy does not expose Odoo branding.
- The Today Command Center, AI Insights, Kiosks, Sales, Warehouses, Stock & Allocation, Products & Recipes, Daily Close, Waste, Purchases, Staff, and Reports surfaces all render.
- Products & Recipes opens the editor so recipe-line fallback bugs are caught.
- Daily Close expands a real variance row and shows manager review actions, notes/investigation status, recipe posting review, and variance input lines.
- Arabic mode switches the app to RTL, renders Arabic copy, and rejects visible mojibake markers.
- POS payment and waste flows still work after admin changes.

## Manager Review Loop

Daily close decisions are persisted on `bayaan.shift.close`, not held only in UI state:

- `manager_review_state`: pending, approved, or rejected.
- `manager_note`: the manager-facing investigation or approval note.
- `manager_reviewed_by_id` and `manager_reviewed_at`: audit metadata for who made the decision and when.
- `investigation_status`: none, open, or closed.

The dashboard writes manager decisions through `/bayaan/api/shift_close_review` with `close_id`, `decision`, and optional `note`. Approving a close closes the investigation; rejecting it leaves the investigation open. Adding a note records the manager note and opens investigation status for unresolved closes. This keeps the variance loop auditable: the cashier count remains the cashier count, and the manager decision is a separate review layer.

## Payment Method Separation

The dashboard separates payment methods at the source:

- Cash
- Card
- QR
- Mobile wallet
- Bank app
- Manual digital payment
- Other digital

Cash expected, digital totals, cashier shortages, and cash-flow reports must keep these categories visible so the owner can reconcile the physical cash drawer separately from terminal or wallet collections.
Cash and QR should use POS payment method metadata when available; payment method names are only a fallback for card, wallet, bank app, manual digital, and uncategorized bank methods.

Bayaan also tracks an agnostic gateway provider on each POS payment method. The seeded Iraq provider catalog is Zain Cash, FIB, Qi Card / SuperQi, NassWallet / NASS Pay, FastPay, AsiaHawala, bank card terminal, generic QR, manual bank transfer, and other digital. Provider totals appear separately from category totals, so a manager can answer both "how much was digital?" and "how much should settle from Zain Cash or FIB?"

This is classification and reconciliation, not a second payment engine. The paid order still comes from the POS engine, and the gateway provider is stored on the POS payment method or inferred from aliases when a method is named "Zain Cash", "FIB", "Qi Card", "NassWallet", or "FastPay".

## AI Traceability

The AI Insights screen displays the source-row counts it is reading, such as orders, payments, consumption ledger rows, waste rows, and closing rows. This keeps AI in the final reporting layer: it explains verified data and can suggest investigation or transfers, but official totals remain in deterministic Bayaan/Odoo records.

AI is also budgeted by tier. The pilot default is scheduled daily summaries fed by compact server-side snapshots. Weekly/monthly summaries can reuse the same aggregates. Full chat, alerts, or high-frequency forecasting should be an explicit paid tier with a per-tenant token budget, not an assumed always-on cost.

## Visible Product Boundary

The dashboard presents Bayaan as the product. Odoo Community remains the hidden deterministic engine behind POS sessions, payments, stock moves, purchases, and accounting. Owner-facing UI should say "engine synced" or "source engine" rather than exposing Odoo as the visible product.
