# Bayaan POS Handoff

## Active Workspace

Use this folder as the active project workspace:

```text
C:\Users\hassa\OneDrive\Desktop\Bayaan.ai\bayaan POS
```

For a new Codex/ChatGPT chat, paste this instruction first:

```text
Use this as the active workspace:
C:\Users\hassa\OneDrive\Desktop\Bayaan.ai\bayaan POS

This is the Bayaan POS project. Continue work from there.
```

## Original Client Brief

Build a custom AI-powered accounting and operations platform for a food and beverage kiosk business in Iraq. The client will start with around 10 coffee, juice, and cake kiosks, then may scale to 100+ kiosks.

The system should manage:

- Kiosk POS sales.
- Product recipes for coffee, juices, cakes, and packaging.
- Automatic raw-material deduction from each sold item.
- Ingredient allocation per kiosk.
- Remaining stock per kiosk from POS activity.
- Purchases, suppliers, raw-material costs, and product margins.
- Salaries, employee payments, shifts, and cash accountability.
- Waste, spoilage, losses, missing stock, and variance review.
- Daily, weekly, monthly, and yearly reports.
- AI summaries, forecasting, unusual-spend/loss detection, and purchasing recommendations.

Core product position:

```text
Do not sell Odoo as the product.
Sell Bayaan as a custom F&B kiosk operating system.
Odoo Community is only the hidden transaction/POS engine underneath.
```

AI rule:

```text
Accounting, stock, cash, and reports must be deterministic and auditable.
AI comes at the end as a report/insight layer that explains, forecasts, and flags anomalies.
```

## What Is Built

- `backend/odoo`: official Odoo Community 19.0 foundation.
- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk`: custom Bayaan Odoo addon for kiosks, recipe versioning, product consumption mode, POS ingredient ledger, waste/loss, shift close, stock-count variance, and API routes.
- `apps/kiosk-pos`: React/Vite frontend for the exact design demo/admin review. Production cashier transactions should use the customized Odoo POS engine, not this demo POS engine.
- `design/exact-pos-v2/kiosk-pos`: fetched Anthropic design handoff bundle for the exact admin/POS/customer-display UI.
- `docs/backend-integration.md`: backend mapping and integration plan.
- `docs/single-source-of-truth.md`: how Odoo POS, Bayaan Admin, and Bayaan API routes share one backend.
- `docs/production-readiness.md`: honest launch-readiness checklist.

Current frontend runtime includes:

- Exact Vite port of `design/exact-pos-v2/kiosk-pos/project/Kiosk POS.html` and its imported JSX/CSS.
- Minimal admin shell with overview, AI insights, kiosks, inventory, waste/loss, suppliers, staff, and reports.
- Admin Warehouses section for source-of-truth setup. It reads Odoo `stock.warehouse`, `stock.location`, `pos.config`, and `bayaan.kiosk` records, and can create central warehouses plus synced kiosk locations/POS configs through Bayaan Odoo controllers.
- Kiosk POS with staff selection, PIN entry, product sale, payment choice, payment completion, and waste entry.
- Dual-screen POS mode: cashier landscape tablet plus customer-facing vertical display.
- Customer-facing display states: standby branding, live order mirror, payment prompt, and thank-you screen.
- Local `public/uploads/Juice.lottie` asset copied from the design bundle and rendered through the production `@lottiefiles/dotlottie-wc` package.
- Arabic/English language toggle with RTL mode.
- Narrow-screen guardrails so the exact desktop/tablet UI scrolls horizontally instead of crushing text.

Still present for backend/domain integration work:

- Deterministic recipe/stock/finance domain logic and tests under `apps/kiosk-pos/src/domain`.
- Previous Bayaan admin/POS prototype retained in `apps/kiosk-pos/src/App.tsx` as integration reference, but it is not the active runtime entrypoint.
- Optional Odoo sync gateway using `VITE_ODOO_URL`, `VITE_ODOO_TARGET`, and `VITE_ODOO_TOKEN`. For local development, prefer `VITE_ODOO_URL=/odoo` so Vite proxies same-origin browser calls to Odoo.
- Bootstrap adapter that can hydrate the frontend chain state from `get_chain_bootstrap`, so live backend stock/sales/waste snapshots feed the same admin and POS screens.
- Production release gate now requires initial `chain_bootstrap` plus scoped realtime streaming for dashboard/POS updates. Manual refresh and polling are fallback/recovery paths, not the normal production workflow.

Bayaan Odoo API routes now include:

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

Production POS wiring now works like this:

```text
Customized Odoo POS validates the cashier sale
-> Odoo creates the official pos.order, session, payment, receipt, and stock records
-> Bayaan addon resolves the kiosk from the POS config
-> Bayaan resolves the active recipe version at the sale timestamp
-> Bayaan scraps recipe ingredients from that kiosk stock location
-> Bayaan stores immutable bayaan.consumption.ledger rows for reporting and variance
```

The old custom sale endpoint is intentionally not the live cashier engine. `/bayaan/api/pos_sale` now returns `engine: odoo_pos` and points callers back to Odoo POS so the backend cannot split into two competing sources of truth.

## Run Locally

From this folder:

```powershell
cd "C:\Users\hassa\OneDrive\Desktop\Bayaan.ai\bayaan POS\apps\kiosk-pos"
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5174
```

To connect the admin to a real Odoo database, create `apps/kiosk-pos/.env.local`:

```env
VITE_ODOO_URL=/odoo
VITE_ODOO_TARGET=http://127.0.0.1:8069
```

Login to Odoo in the same browser host, then refresh Bayaan. The Warehouses page writes real Odoo warehouses, stock locations, POS configs, and Bayaan kiosk records, so Odoo Desk and Bayaan stay in sync.

## Verification

Run the frontend release gate:

```powershell
cd "C:\Users\hassa\OneDrive\Desktop\Bayaan.ai\bayaan POS\apps\kiosk-pos"
npm run verify
```

Run the full local release gate from the repository root:

```powershell
make verify
```

Run smoke against a specific local port:

```powershell
$env:KIOSK_POS_URL="http://127.0.0.1:5174"
npm run smoke
Remove-Item Env:\KIOSK_POS_URL
```

The current smoke flow verifies the exact admin overview and sections, including Warehouses, POS login, paired customer-facing display, product sale, payment prompt, payment completion, waste entry, Arabic RTL, and narrow-screen rendering.

Client demo script:

```text
docs/demo-script.md
```

## Current Readiness

Ready for a serious client demo and pilot planning.

Not ready for live business production until:

- Odoo Community is installed and configured.
- Production authentication users, roles, and kiosk permissions are provisioned for the actual client org.
- The real pilot Odoo database is connected to the existing `chain_bootstrap` adapter and validated against production-like data.
- Broader live smoke covers transfer, waste, and close realtime updates in addition to the sale no-refresh proof.
- Offline sync, receipt printers, cash drawers, backups, monitoring, and deployment are validated.
- Iraqi accounting/reporting format is confirmed with the client's accountant.
