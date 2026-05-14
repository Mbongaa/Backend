# Backend Integration Plan

Bayaan should not expose generic Odoo screens as the product. Odoo Community is the hidden transaction engine and Bayaan owns the F&B kiosk workflow.

## Core Mapping

| Bayaan concept | Odoo/Bayaan model |
| --- | --- |
| Kiosk | `bayaan.kiosk` + `pos.config` + `stock.location` |
| Cashier POS | Odoo `point_of_sale` |
| POS sale | Odoo `pos.order` |
| Payment/session | Odoo `pos.payment` + `pos.session` |
| Ingredient allocation | Odoo `stock.picking` internal transfer |
| Purchase forecast | Odoo `purchase.order` |
| Recipe version | Bayaan `bayaan.recipe` + `bayaan.recipe.line` |
| Product stock behavior | `product.template.bayaan_consumption_mode` |
| Ingredient deduction | Bayaan `pos.order` paid-order hook + Odoo `stock.scrap` + `bayaan.consumption.ledger` |
| Waste/loss | Bayaan `bayaan.waste.entry` + Odoo `stock.scrap` |
| Shift close | Bayaan `bayaan.shift.close` + `bayaan.shift.close.line` |
| AI summary | Bayaan report/AI layer reading Odoo data |

## Sale Flow

1. Cashier uses the customized Odoo POS.
2. Odoo POS handles sessions, offline queue, payments, receipts, refunds, and order sync.
3. When a `pos.order` is paid, the Bayaan addon finds the active `bayaan.recipe` for each sold product.
4. Bayaan deducts recipe ingredients from the kiosk `stock.location` using Odoo stock scrap/move logic.
5. Bayaan writes one `bayaan.consumption.ledger` row per consumed ingredient line with recipe, cost, cashier, POS session, and kiosk references.
6. Admin/AI dashboards read sales, stock, waste, consumption, and shift data from Odoo/Bayaan models.

Product consumption modes:

- `recipe`: Bayaan consumes recipe components and skips Odoo's standard stock movement for the sellable SKU. Use this for drinks made at the kiosk.
- `finished`: Odoo POS consumes the finished product stock normally. Use this for cake slices or packed items delivered as finished goods.
- `hybrid`: Odoo consumes the finished product and Bayaan consumes recipe components. Use this for bundles that include a finished item plus prepared components.
- `none`: No stock movement for the sellable SKU.

## Admin Inventory Flow

1. Bayaan Admin reads `/bayaan/api/chain_bootstrap`.
2. Each kiosk is tied to a Bayaan `bayaan.kiosk` record that points to Odoo `pos.config` and `stock.location`.
3. The admin inventory screen compares central stock, kiosk stock, consumption, and waste.
4. When a manager approves a transfer, Bayaan calls `/bayaan/api/stock_transfer`.
5. Odoo creates an internal `stock.picking` from warehouse stock to the kiosk location.

## Purchasing Flow

1. Bayaan calculates required quantities from recipe/inventory needs per stand.
2. The supplier screen groups recommended quantities by supplier and item.
3. When a manager creates a draft PO, Bayaan calls `/bayaan/api/purchase_order`.
4. Odoo creates a `purchase.order`.

## Recipe Flow

1. Bayaan Admin shows recipe cost and margin from raw materials and current prices.
2. Publishing a recipe calls `/bayaan/api/recipe_version`.
3. The Bayaan Odoo addon stores an active `bayaan.recipe`.
4. Paid Odoo POS orders use the active recipe to deduct ingredient stock.

## Current Frontend Flow

The Vite app currently runs the exact fetched admin/POS/customer-display design from `design/exact-pos-v2/kiosk-pos`. It uses demo data from the design bundle and is useful for client-facing UI review.

For the real cashier surface, the target is Odoo POS customization through the Bayaan addon, because Odoo POS already provides sessions, offline behavior, receipts, payments, and closing flows. The React POS should not become a second production POS engine in Phase 1.

When `VITE_ODOO_URL` is configured, `apps/kiosk-pos/src/services/sourceOfTruth.ts` uses the Bayaan Odoo controller routes. Without a running Odoo server, the frontend remains in no-op demo mode.

## AI Rule

AI never calculates official accounting numbers. AI reads deterministic Odoo/Bayaan report snapshots and writes summaries, anomalies, forecasts, and recommended actions.

## Next Backend Milestones

1. Run Odoo Community locally via Python/venv or Docker.
2. Add `backend/bayaan_odoo_addons` to Odoo's addons path.
3. Install Odoo apps: POS, Inventory, Purchase, Accounting/Invoicing, and `bayaan_fnb_kiosk`.
4. Create kiosk `stock.location` records and one `bayaan.kiosk` record per stand.
5. Configure Odoo POS configs for each kiosk.
6. Validate paid `pos.order` ingredient deduction against production-like products and recipes.
7. Add real Odoo POS UI patches for the final branded cashier interface.
8. Validate missing recipe, strict stock policy, waste, shift close, and variance repair flows.
