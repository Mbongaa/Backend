# Bayaan AI Kiosk Platform

This workspace contains the F&B kiosk operating system discussed for the Iraq client.

Bayaan is the product. Odoo Community is now the hidden backend engine, with Odoo POS used for the cashier/POS engine and Bayaan owning the F&B recipe, kiosk, reporting, and AI workflow.

Start with `HANDOFF.md` for the project brief, active workspace path, run commands, and production-readiness notes.

## Structure

- `backend/odoo` contains the official Odoo Community 19.0 source.
- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk` contains the Bayaan-specific Odoo addon.
- `apps/kiosk-pos` contains the React/Vite frontend now running the exact fetched admin + POS + customer-facing display design.
- `design/exact-pos-v2/kiosk-pos` contains the fetched Anthropic design handoff bundle used as the current pixel reference.
- `docs/backend-integration.md` describes the Odoo backend mapping.
- `docs/odoo-pos-engine-wiring.md` describes the production POS transaction flow.
- `docs/single-source-of-truth.md` describes how Odoo POS, Bayaan Admin, and Bayaan APIs share one backend.
- `docs/demo-script.md` gives the recommended client demo walkthrough.

## Backend Positioning

Use Odoo Community as the self-hosted transaction engine:

- Cashier POS engine: Odoo `point_of_sale`
- Kiosk stock: Odoo `stock.location`
- Product and ingredient catalog: Odoo `product.product`
- Recipe layer: Bayaan `bayaan.recipe`
- Product stock behavior: Bayaan `product.template.bayaan_consumption_mode`
- Ingredient deduction: Bayaan hook on paid `pos.order` + `bayaan.consumption.ledger`
- Waste/loss: Bayaan `bayaan.waste.entry` + Odoo `stock.scrap`
- Shift close: Bayaan `bayaan.shift.close` + counted stock variance lines
- Purchases: Odoo `purchase.order`
- Accounting: Odoo accounting/invoicing records
- Admin setup: Bayaan controller routes create real Odoo warehouses, kiosk stock locations, POS configs, and Bayaan kiosk records.

Do not edit Odoo core. Put all Bayaan logic in `backend/bayaan_odoo_addons`.

## Frontend

Run the frontend demo:

```bash
cd apps/kiosk-pos
npm install
npm run dev
```

Connect the demo admin to local Odoo through the Vite proxy:

```env
VITE_ODOO_URL=/odoo
VITE_ODOO_TARGET=http://127.0.0.1:8069
```

With that env and an active Odoo browser session, the Warehouses page reads/writes Odoo records directly, so Odoo Desk and Bayaan Admin reflect the same backend state.

Build for production:

```bash
npm run build
```

Run deterministic domain tests:

```bash
npm test
```

Run the browser smoke test:

```bash
npm run smoke
```

The smoke flow verifies the exact admin shell, admin sections, POS login, cashier sale flow, paired customer-facing display, payment prompt, payment completion, waste entry, Arabic RTL, and narrow-screen rendering.

Run the frontend release gate:

```bash
npm run verify
```

Run the full local release gate from the repository root:

```bash
make verify
```
