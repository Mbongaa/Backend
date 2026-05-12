# Single Source Of Truth Setup

## Goal

Odoo POS, Bayaan Admin, and Bayaan AI reports must all use the same Odoo database.

```text
Customized Odoo POS
        |
        v
Odoo Community + Bayaan Odoo addon
        ^
        |
Bayaan Admin / AI Dashboard
```

Bayaan must not keep a separate accounting database. Bayaan may keep custom operational models inside Odoo, but official sales, payments, stock, purchases, suppliers, sessions, and accounting records remain in Odoo.

## What This Repo Provides

Odoo backend:

- `backend/odoo`: official Odoo Community 19.0 source.
- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk`: Bayaan custom addon.

Bayaan Odoo models:

- `bayaan.kiosk`
- `bayaan.recipe`
- `bayaan.recipe.line`
- `bayaan.consumption.ledger`
- `bayaan.waste.entry`
- `bayaan.shift.close`
- `bayaan.shift.close.line`
- `pos.order` extension for ingredient deduction.
- `product.template` extension for Bayaan consumption mode.

Bayaan API routes:

- `/bayaan/api/chain_bootstrap`
- `/bayaan/api/warehouse_setup`
- `/bayaan/api/create_warehouse`
- `/bayaan/api/create_kiosk`
- `/bayaan/api/pos_sale`
- `/bayaan/api/stock_transfer`
- `/bayaan/api/purchase_order`
- `/bayaan/api/recipe_version`
- `/bayaan/api/waste`
- `/bayaan/api/shift_close`

Frontend gateway:

- `apps/kiosk-pos/src/services/sourceOfTruth.ts`
- `apps/kiosk-pos/src/services/bootstrapAdapter.ts`
- Uses `VITE_ODOO_URL`, `VITE_ODOO_TARGET`, and optional `VITE_ODOO_TOKEN`.
- Falls back to no-op demo mode when Odoo is not running.

## Frontend Environment

Create this file when a real Odoo server is running:

```text
apps/kiosk-pos/.env.local
```

Example:

```env
VITE_ODOO_URL=/odoo
VITE_ODOO_TARGET=http://127.0.0.1:8069
VITE_ODOO_TOKEN=optional_bearer_token_for_custom_controllers
```

`/odoo` is proxied by Vite to the local Odoo server, which keeps browser calls same-origin during development. In production, configure the web server/reverse proxy to forward `/odoo/*` to the self-hosted Odoo instance.

## Odoo Setup Shape

Use Linux/WSL or Docker for the real Odoo runtime.

Manual local shape:

```bash
cd backend/odoo
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python odoo-bin \
  --addons-path=addons,../bayaan_odoo_addons \
  -d bayaan \
  -i point_of_sale,stock,purchase,account,bayaan_fnb_kiosk
```

Production shape:

- Self-host Odoo Community.
- Mount `backend/bayaan_odoo_addons` in the addons path.
- Install `bayaan_fnb_kiosk`.
- Configure one Odoo POS config and one internal stock location per kiosk.
- Or use Bayaan Admin -> Warehouses to create a central warehouse and synced kiosk setup. That flow creates `stock.location`, `stock.picking.type`, `pos.config`, payment methods/journal defaults, and `bayaan.kiosk` records in Odoo.

## Sync Rules

Odoo POS should create the official `pos.order` for cashier sales.

The custom `/bayaan/api/pos_sale` route is not the production cashier engine. It exists as a guardrail for integrations and returns `engine: odoo_pos` so all real sales stay inside Odoo POS.

Bayaan Admin should call `/bayaan/api/stock_transfer` for warehouse-to-kiosk allocations.

Bayaan Admin should call `/bayaan/api/warehouse_setup`, `/bayaan/api/create_warehouse`, and `/bayaan/api/create_kiosk` for setup so new warehouses/kiosks appear in both Bayaan and Odoo Desk.

Bayaan Admin should call `/bayaan/api/purchase_order` for supplier purchase plans.

Bayaan Admin should call `/bayaan/api/recipe_version` when publishing a recipe.

Bayaan Admin should read from:

- `/bayaan/api/chain_bootstrap`
- `pos.order`
- `stock.quant`
- `stock.picking`
- `stock.scrap`
- `bayaan.consumption.ledger`
- `bayaan.recipe`
- `bayaan.waste.entry`
- `bayaan.shift.close`
- Odoo stock/accounting reports

Odoo remains available for:

- POS sessions
- Receipt flow
- Refunds and payments
- Inventory and stock moves
- Purchase orders
- Supplier records
- Accounting/invoicing
- Audit trail

This keeps Bayaan simple for operators and keeps Odoo reliable for POS/accounting.
