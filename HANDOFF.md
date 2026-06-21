# Bayaan POS Handoff

> **Accountant internal-control gaps — ALL 13 CLOSED + verified GREEN 2026-06-15
> (re-confirmed after the Codex P0 functional re-audit, round 2 — see the gate doc).**
> The accountant's 13 formal internal-control / fraud-prevention / auditability requirements
> (7 P0 + 6 P1) are implemented and verified: POS session history + drill-down, **blind**
> end-of-shift stock count (server-derived expected), cash float + safe-deposit/retained-float,
> order-linked wrong-order workflow (no more waste double-count), AA button contrast, working
> Ctrl-K command palette + table search, stock-bar colour from stock health, kiosk→kiosk
> transfers, **close-time-frozen** variance cost, receiving discrepancy capture, waste notes,
> realtime reconnect/backoff/heartbeat + honest stream badge, and an AI assistant wired to the
> formal books (`account.move`). Hardened across 3 Codex re-audits (rounds 2–4): cashier-scoped
> wrong-order + channel-correct refund reversal, safe-deposit→drawer ledger transfer + retained-
> float carry-forward, counts frozen at submission, palette search incl. sessions/journals/
> accounts, cash float fix. **Round 5 (2026-06-16) — Codex P1 re-audit: 4 real bugs fixed, 2
> non-issues.** #6 frozen variance VALUE showed "-"/0 on seeded+auto-close closes (count line
> `unit_cost` only set by the route) → model now defaults it on create (every path freezes a cost) +
> live data backfilled; #8 waste note enforcement extended to unusual-quantity / repeated-pattern /
> manager-flagged (new `product.template.bayaan_waste_requires_note`, `-u`); #12 realtime now detects
> a half-open socket via an inbound-staleness heartbeat watchdog (~45s) + reconnects; #13 AI claim
> validator now rejects `account.move`-tagged numbers not traceable to `metrics.accounting`. Non-
> issues: #3 "completed" transfer state (aspirational, not a gate criterion — `received` is terminal),
> #7 admin bulk-receive (the kiosk receive modal is the production path). **Round 6 (2026-06-17) —
> Codex P1 UI re-audit: 4 UI/test gaps closed.** #6 recon ("Variance inputs") table gained a
> Variance-value (IQD) column (the frozen value was correct but only the lower stock table showed it
> — verified live RAW-CUP −4 → −800); #7 receive modal gained an explicit Missing column + a
> structured Reason select (new `reason` field on `bayaan.stock.receipt.discrepancy`, `-u`), and a
> shared `ReceiveDiscrepancyModal` now powers BOTH the cashier and the admin "Receive" so the admin
> path no longer force-completes without discrepancy capture; #8 cashier note-hint now mirrors the
> server rules (high-value/manager-flagged/unusual) pre-submit (`bayaan_waste_requires_note` rides on
> bootstrap products); #3 added a kiosk→kiosk regression test (source-loc→dest-loc picking + full
> lifecycle + stock conservation). #12/#13 GREEN (Codex agreed); AI ~216k-token pack noted as a
> compactness follow-up. Gates: `npm run verify`
> (**193** + wiring + build), addon suite **178/178** (disposable DB), live API spot-checks (#6 recon
> values, #7 reason column, #8 products flag), books reconcile **TIE** (assets == L+E+NI). New backend field needs
> `-u bayaan_fnb_kiosk` (migrated live). Authoritative detail + per-item evidence:
> `docs/accountant-controls-release-gate-2026-06-15.md`.
>
> **Whole demo gate — verified GREEN 2026-06-14 (incl. codex re-audit rounds 2 & 3).**
> The full role/flow browser suite `npm run demo:verify:full` (groups A–I) is **62/62
> passed, 0 failed** on freshly seeded data — admin read-paths + live math, role scoping,
> cashier POS sale/consumption/waste, manager close review, stock transfer lifecycle,
> staff/HR/payroll, realtime, card + Customer-Account tenders, Arabic RTL + dark. Every
> mutating POS group (C/G/H/I) self-closes its session, so a full run leaves **0 open
> sessions** and the books still tie; the verification closes post **0 ingredient variance**
> (clean counts). The browser launch falls back to system Chrome when bundled Chromium is
> absent. For a pristine presentation, run `~/seed-miza-demo.sh` (demo-morning reseed).
>
> **Accounting remediation — verified GREEN (incl. codex re-audit round 2).**
> Native Odoo POS close (per-day sessions, one Z-report move each, single revenue source);
> **per-day POS revenue == GL on every sale day**; TB/BS balanced. App is **live-only**
> (demo mode removed, simulation archived); Odoo is hidden from the UI — the last
> user-facing leaks (three `api.py` error/AI strings) were de-branded this round.
> Gates: addon suite on a disposable DB, `npm run verify` (vitest **192** + wiring +
> build), `npm run smoke:live` **`ok:true`** (now chained into `verify:live`), live
> reconcile (revenue+VAT == POS gross TIE, TB balanced, assets == liab+equity+net TIE,
> 0 missing moves, 0 legacy revenue moves), and the demo-verify trio
> (`verify-accounting` 12/12, `verify-finance-vs-ledger` delta-0 TIE, `accountant-audit`
> every accounting page in **EN + Arabic RTL + dark**, no console errors). The two
> mutating browser suites (group C, smoke:live) are now **tie-preserving** — they close
> the sessions they open, so a verification run no longer leaves the books untied.
> Bank reconciliation is performed in the engine, not the Bayaan UI (on roadmap), and
> the cash-flow badge/Settings copy say so honestly. See
> `docs/accounting-remediation-status-2026-06-14.md` ("Codex re-audit round 2") for the
> ground-truthed per-blocker status + commands; the original spec is
> `docs/accounting-remediation-handoff-2026-06-13.md`. Re-run every gate before trusting
> any status line below.

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

Run the live browser gate (needs the backend + dev server up). The app is live-only, so the
old demo `npm run smoke` was removed. There are two live gates:

```bash
# Accounting + ledger live gate (fast, deterministic). Runs:
#   verify (vitest + wiring + build) → verify-accounting → verify-finance-vs-ledger
#   → accountant-audit (EN + Arabic RTL + dark) → smoke:live
npm run verify:live

# Full role/flow browser sweep — groups A–I (admin read-paths, role scoping, cashier POS,
# manager close-review, staff, cross-cutting, gap-closure, edge cases). Heavier; the
# mutating groups (C/G/H/I) self-close their POS sessions so the books stay tied.
npm run demo:verify:full

npm run smoke:live                   # live Odoo browser smoke (also chained into verify:live)
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
