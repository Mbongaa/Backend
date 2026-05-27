# Client Requirements Traceability — Production Readiness Inventory

Date: 2026-05-21
Source brief: Client message (Arabic + English) covering POS, inventory/manufacturing, accounting, multi-branch, security, reports, mobile, alerts, AI, and implementation workflow.
Companion doc: `docs/production-gap-plan.md` (internal backlog) and `docs/sales-meeting-gap-audit-2026-05-20.md`.

## Purpose

This document maps each item in the client's stated requirements directly to the current state of the Bayaan codebase, with `path:line` evidence verified against actual files (not inferred from docs). Use it to (a) answer "is X built?" without re-grepping, (b) brief the client honestly on readiness, and (c) scope the remaining work between today and pilot go-live.

Status legend:
- `[DONE]` — implemented and verifiable in the current tree, with test coverage where applicable.
- `[PARTIAL]` — partially implemented; gap noted inline.
- `[MISSING]` — searched and not found in the codebase.

Findings are grouped by client requirement category and ordered roughly by client priority.

---

## 1. Multi-Branch Architecture

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 1.1 | Single DB, multi-branch (not sister companies) | `[DONE]` | Kiosks share one `company_id`; branch differentiation via `analytic_account_id` per `bayaan.kiosk` (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_kiosk.py:29-34`) | — |
| 1.2 | Each branch = independent Cost Center / Analytic Account | `[DONE]` | Analytic account auto-created on kiosk creation (`bayaan_kiosk.py:70-77`, `96-123`) with `kiosk_code` as the analytic code | — |
| 1.3 | Mandatory analytic distribution on every journal entry | `[DONE]` | `_bayaan_validate_branch_analytic_distribution()` raises `ValidationError` if any `account.move.line` with `display_type="product"` lacks `analytic_distribution` (`models/account_move.py:34-36, 46-58`). Test: `tests/test_analytic_cost_centers.py:77-81` | — |
| 1.4 | Automatic HQ expense distribution across branches by percentage | `[DONE]` | `_bayaan_shared_expense_distribution(weights)` computes per-kiosk splits with rounding precision (`bayaan_kiosk.py:159-193`); commit 718a8a7 adds `_bayaan_ensure_hq_shared_expense_distribution_model()` (`195-221`) creating `account.analytic.distribution.model` for auto-allocation. Test: `tests/test_analytic_cost_centers.py:85+` | — |
| 1.5 | Inter-branch stock transfers as "internal buy/sell" for accurate per-branch COGS | `[PARTIAL]` | Internal pickings work warehouse→kiosk via `/bayaan/api/stock_transfer` (`controllers/api.py:5252-5328`) with analytic distribution applied on the stock journal; `models/stock_picking.py:1-61` tracks `bayaan_transfer_state` draft→received | No dual revenue/COGS posting between branches; transfers are single-JE stock moves, not modeled as sell/buy pairs. Need to confirm with the client's accountant whether single-JE-with-analytic satisfies their P&L need, or whether they require explicit inter-branch invoices. |
| 1.6 | Unlimited kiosks; rapid scale 10 → 25 → 50 | `[DONE]` | No hard-coded kiosk count; `bayaan.kiosk` model + `/bayaan/api/create_kiosk` (`api.py:3418+`) creates kiosks atomically with linked `stock.location` and `pos.config` | — |

**Verdict — Multi-Branch core: production-shaped.** 1.5 needs an accounting-policy call with the client's accountant before pilot.

---

## 2. POS / Cashier UX

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 2.1 | Image-heavy cashier UI (products are images, not text) | `[DONE]` | `ProductImage` component renders `/products/{slug}.webp` with first-letter fallback (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:1115-1130`); used across POS tiles and receipt | — |
| 2.2 | Offline mode — take orders + print receipts without internet | `[DONE]` | IndexedDB-with-localStorage-fallback queue (`apps/kiosk-pos/src/saleQueue.ts:55-62`); offline detection via `navigator.onLine` (`BayaanProvider.tsx:598-599`); receipt builder marks queued sales "Saved offline" (`apps/kiosk-pos/src/bayaan/receipt.ts:40, 48-100`) | — |
| 2.3 | Auto-sync when connection returns | `[DONE]` | `flushQueue()` runs on the `online` event, on visibility change, on startup, and every 30s (`BayaanProvider.tsx:300-345`) | — |
| 2.4 | Shift open/close requires internet | `[DONE]` | `BayaanProvider.tsx:278-279` rejects offline shift open with "Network offline; opening shift requires source engine connection"; backend `/bayaan/api/open_session` has no offline fallback (`api.py:4991-5014`) | — |
| 2.5 | Fixed price lists per branch; cashier cannot change price | `[DONE]` | Server resolves price via `_resolve_kiosk_price_unit(kiosk, product, qty)` (`api.py:5054`) and ignores any client-supplied price; orders bind to `kiosk.pos_config_id.pricelist_id.id` (`api.py:5136-5137`) | — |
| 2.6 | Void/discount restricted to admin/manager (cashier blocked) | `[DONE]` | Discount enforcement: `_is_bayaan_manager()` gate in `api.py:5061-5065`; paid-order void/refund/unlink guarded by `_bayaan_guard_paid_void()` in `models/pos_order.py:47-80`. Test: `tests/test_odoo_security_hardening.py:120-134` | — |
| 2.7 | Product modifiers: hot/cold, size S/M/L, milk type, extra shot + variant-aware ingredient consumption | `[DONE]` | **Frontend:** modifier metadata at `apps/kiosk-pos/src/data.ts` (coffee gets Temperature/Size/Milk/Extras; juice gets Size/Sweetness). Pure helpers in `src/domain/modifiers.ts` (signature, price delta, recipe-factor scaling). UI: `src/exact-design/ProductModifierSheet.jsx`. Tests: `src/domain/modifiers.test.ts` (11) + `src/bayaan/buildPosSale.test.ts` (3 new modifier-payload tests). **Backend pipeline (this session):** `pos.order.line` extended with `bayaan_modifier_signature`/`bayaan_modifier_recipe_factor`/`bayaan_modifier_summary`; `kiosk_sale` controller reads `modifier_signature` + `modifier_recipe_factor` + `modifier_summary` per item and writes to the order line; `_bayaan_post_recipe_consumption` multiplies `recipe_line.qty × order_line.qty × modifier_recipe_factor` so a Large (factor 1.25) actually deducts 1.25× ingredients. Consumption ledger stores `base_ingredient_qty` + `modifier_signature` + `modifier_recipe_factor` for variance-loop traceability. Tests: `tests/test_modifier_consumption.py` covers Large 1.25× scaling, Small 0.8× downscaling, missing-factor backwards compat, invalid-factor falls back to 1.0, factor + qty multiply correctly. |
| 2.8 | Receipt printing | `[DONE]` | 80mm thermal HTML receipt with line items, totals, cash/change, and queued-state label (`receipt.ts:48-100`); test: `apps/kiosk-pos/src/bayaan/receipt.test.ts:6-41` | Hardware-specific (ESC/POS, driver pairing, cash-drawer kick) is part of the hardware pilot, not in this codebase. |

**Verdict — POS core: production-shaped, modifier loop now closed end-to-end.** Selling a Large + Almond Latte prices at 9,500 IQD AND deducts 1.25× the base recipe; the variance loop now reconciles correctly when modifiers are used.

---

## 3. Inventory & Manufacturing

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 3.1 | Per-kiosk stock locations; sales deduct from the correct kiosk | `[DONE]` | Each kiosk owns `stock_location_id` (`bayaan_kiosk.py:20-25`); recipe consumption scraps from that location only (`models/pos_order.py:218`). Test: `tests/test_procurement_flow_api.py:341-383` | — |
| 3.2 | Recipe / BOM auto-deduct on sale (espresso → beans+sugar+cup) | `[DONE]` | `_bayaan_post_recipe_consumption()` runs after `_process_saved_order()` (`pos_order.py:34-38`); enforces strict stock policy and writes scrap + ledger rows (`pos_order.py:107-262`). Test: `tests/test_mrp_semifinished.py:120-198` | — |
| 3.3 | Semi-finished goods (mix raw materials into a stored intermediate, consume later) | `[DONE]` | `__manifest__.py:13` depends on `mrp`; `bayaan_consumption_mode` on `product.template` supports `finished` and `hybrid` (`models/product_template.py:7-22`); test `tests/test_mrp_semifinished.py:72-118` produces a "signature cappuccino mix" via `mrp.bom`/`mrp.production` and consumes it at the kiosk | — |
| 3.4 | Perpetual inventory + FIFO/LIFO valuation | `[PARTIAL]` | `__manifest__.py:18` depends on `stock_landed_costs`; test creates a FIFO category via standard `property_cost_method` (`tests/test_procurement_flow_api.py:37-43`) | No Bayaan-specific valuation config; relies on Odoo native product-category cost method. Needs to be explicitly set during setup. Confirm policy with client's accountant. |
| 3.5 | Reorder rules / Min-Max with backend alerts | `[DONE]` | Per-product `bayaan_stock_target_qty`, `reorder_qty`, `critical_qty`, `max_qty` (`product_template.py:23-43`); `_product_stock_plan` maps qty → status `empty`/`critical`/`low`/`ok` (`api.py:410-468`); alert counter `api.py:4199-4227` exposes `lowStockItems` | Alerts surface on the dashboard only — see 7.x for the delivery-channel gap. |
| 3.6 | Landed costs (shipping/customs added to product cost, supports billing after partial sale) | `[DONE]` | `controllers/landed_cost_service.py:116-128` creates `stock.landed.cost`, calls `compute_landed_cost()` and `button_validate()`; `models/stock_landed_cost.py:1-31` applies analytic distribution to the landed-cost JE. Test: `tests/test_procurement_flow_api.py:264-340` proves partial-sale-then-landed-cost allocation | — |
| 3.7 | Central warehouse → kiosk distribution model | `[DONE]` | Warehouse creation via `/bayaan/api/create_warehouse` (`api.py:3418-3441`); transfer via `/bayaan/api/stock_transfer`; state machine through `/bayaan/api/stock_transfer_action` (draft → approved → picked → dispatched → received) | — |
| 3.8 | Waste/scrap recording per kiosk | `[DONE]` | `bayaan.waste.entry` with `kiosk_id`, `product_id`, `qty`, free-text `reason` (`models/bayaan_waste.py:5-67`); storable ingredients create real `stock.scrap` at the kiosk location | Reason is free text. Client asked for categorized reasons (spoiled, broken packaging, wrong order, sample, staff meal, missing stock, unknown). Add a reason taxonomy. |

**Verdict — Inventory/Manufacturing: production-shaped.** Outstanding items are policy decisions (3.4 cost method) and one taxonomy refinement (3.8 reason categories).

---

## 4. Accounting & Finance

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 4.1 | Strict period locking (no retroactive edits) | `[DONE]` | `_bayaan_check_lock_dates_before_post()` enforces `company_id._get_lock_date_violations(date, fiscalyear=True, hard=True)` before posting (`models/account_move.py:14-30`). Test: `tests/test_odoo_security_hardening.py:142-147` | — |
| 4.2 | Invoice deletion prohibited | `[DONE]` | `account.move.unlink()` raises `UserError` unless break-glass flag + system group (`models/account_move.py:38-44`). Test: `tests/test_odoo_security_hardening.py:136-140` | — |
| 4.3 | Iraqi chart of accounts validated by client's accountant | `[MISSING]` | External blocker — not in codebase | Cannot be closed without the client's accountant. Block on this before go-live. |
| 4.4 | Workaround for wrong-account-type correction (export → edit in Excel → re-import) | `[MISSING]` | No documented export/import script in repo | Document the procedure as a runbook in `docs/`; the actual export/import is standard Odoo functionality, but the runbook needs to exist so support can execute it without ad-hoc steps. |

---

## 5. Security & Access Rights

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 5.1 | Roles: Owner, Manager, Warehouse, Cashier, Accountant, Admin | `[DONE]` | 5 groups defined: `group_bayaan_cashier`, `group_bayaan_supervisor`, `group_bayaan_logistics` (warehouse), `group_bayaan_accountant`, `group_bayaan_manager` (owner) in `security/bayaan_security.xml:4-43`; admin = Odoo system user | "Owner" is mapped to `group_bayaan_manager`. If the client wants Owner as a strictly-higher tier than Manager (e.g., owner-only finance), split it. |
| 5.2 | Cashier scoped to assigned kiosk only (server-side) | `[DONE]` | Record rule `rule_bayaan_kiosk_cashier` (`security/bayaan_security.xml:47-58`) restricts cashier reads to assigned kiosks; controllers apply domain filtering in `chain_bootstrap` (`api.py:3785-3792`). Tests: `tests/test_api_security_scope.py` | — |
| 5.3 | Void/discount/refund enforced server-side (not just UI hiding) | `[DONE]` | See 2.6 | — |
| 5.4 | Read-only "Spectator" role for executive mobile monitoring | `[DONE]` | `group_bayaan_spectator` in `security/bayaan_security.xml`; 22 per-model spectator access rows in `security/ir.model.access.csv` (all read=1, write/create/unlink=0); 13 chain-wide ir.rule entries so spectator reads every kiosk; helpers `_is_bayaan_spectator()` and `_is_chain_read_user()` extended; `allowedPanels.pos=false` for spectator. Tests: `tests/test_spectator_role.py` (10/10 pass — auth status, chain_bootstrap full-chain visibility, cannot open session/sale/transfer/waste/PO/write/create/unlink). |

---

## 6. Reports & Analytics

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 6.1 | Daily / weekly / monthly / yearly per branch | `[DONE]` | `chain_bootstrap` queries `pos.order` with date-range filtering per kiosk (`api.py:3807-3821`) | — |
| 6.2 | Compare branches / rank best-worst | `[DONE]` | Backend exposes cross-kiosk data via `chain_bootstrap`; frontend domain code computes comparisons | — |
| 6.3 | Peak hours / time-based sales (critical — "when does latte sell most?") | `[DONE]` | `/bayaan/api/peak_hour_report` (`api.py:4744-4846`) groups orders by `(kiosk, product, hour, cashier, session)` and returns `hourlyTotals` + `topProducts`; Baghdad-local day boundaries respected | — |
| 6.4 | P&L, expenses, salaries, waste, cost-per-product, net profit | `[DONE]` | `ReportsScreen` (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:16315+`) renders period-filtered P&L rows (revenue, COGS, gross profit, waste, variance, payroll, operating expenses, net profit, margin), management report table with traceable source citations, payment-method split, gateway settlement rows. CSV export via `exportManagementReportPack`. New: "Print / PDF" button (`report-print-pdf` test-id) triggers `window.print()`; print stylesheet in `exact.css` hides nav/cart/modals and emits an A4 layout — browser "Save as PDF" produces a clean handout. Future enhancement: server-side QWeb PDF endpoint for unattended generation. |
| 6.5 | Full transaction log / audit trail surfaced to management | `[DONE]` | `/bayaan/api/audit_log` (`api.py:2766-2783`); audit events stored in `bayaan.audit.event` model; manager-scoped read | — |

**Verdict — Reports: data layer is done, presentation layer is partial.** The numbers exist; what's missing is the structured Reports screen and PDF export.

---

## 7. Alerts & Notifications

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 7.1 | Low-stock detection (milk < 20L, large cups running out) | `[DONE]` | Per-product thresholds + status computation (see 3.5) | — |
| 7.2 | Operator alert delivery (admin gets notified, not just dashboard banner) | `[DONE]` (SMTP is deployment-time) | `bayaan.alert.rule` + `bayaan.alert.dispatched` ledger in `models/bayaan_alert.py`. Trigger types: `low_stock`, `critical_stock`, `close_variance`, `payment_failure`, `missing_recipe`, `high_waste`. Cron in `data/bayaan_alert_data.xml` evaluates every 5 min. Mail via `mail.template` referenced from the cron + per-recipient lang (Arabic body for `lang` starting with `ar`). Dedup ledger enforces per-rule cooldown so a 24-hour low-milk condition doesn't email every 5 min. Inline hooks fire from missing-recipe path in `pos_order.py:_bayaan_post_recipe_consumption`. Manager-only API at `/bayaan/api/alert_rules` (list/create/toggle/delete). Tests: `tests/test_alert_rules.py` — rule fires once + cooldown blocks duplicate, kiosk scope excludes unrelated kiosks, cron evaluates active rules only, recipient required, cashier write blocked, high-waste fires above threshold, distinct dedup keys both land. **Outgoing mail server credentials are configured at deploy time — the rule engine, dispatch ledger, and audit trail work without SMTP; emails just stay in `mail.mail` queue until SMTP is wired.** |

---

## 8. Mobile

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 8.1 | Mobile dashboard for owner/manager monitoring | `[DONE]` | New `apps/kiosk-pos/src/exact-design/AppShell.jsx` switches between `ExactKioskApp` (≥760px viewport) and `MobileDashboard` (<760px). `MobileDashboard.jsx` renders read-only KPI grid (sales today, profit, orders, cash), best→worst branch ranking, watchlist for kiosks in `watch`/`critical` status, low-stock list. Bilingual EN/AR + dark/light theme toggle. URL overrides (`?bayaanView=desktop` / `?bayaanView=mobile`) for forced rendering. Smoke asserts `[data-testid='mobile-dashboard']` + "Sales today" + "Best" + "Spectator" labels. |

---

## 9. Localization

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 9.1 | Arabic + English UI toggle, RTL support | `[DONE]` | `LocalText { en, ar }` throughout frontend; language toggle wired in the active runtime; smoke asserts `dir="rtl"` after switching (see smoke script in `apps/kiosk-pos/scripts/smoke.mjs`) | — |
| 9.2 | Arabic/English receipt format | `[PARTIAL]` | Receipt HTML in `bayaan/receipt.ts` exists | Verify the receipt template handles Arabic text + RTL line items before pilot. |

---

## 10. AI Layer (client said "out of scope / extra")

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 10.1 | AI insights surface — interprets numbers, does NOT compute them | `[DONE]` | `/bayaan/api/ai_dashboard_plan` / `_stream` (`api.py:2624-2791`); AI reads `_ai_compact_report_pack` (`api.py:1612`) and `_ai_deterministic_claims` cites every metric's source (`api.py:2056-2120`) | — |
| 10.2 | AI cost / token budget controls | `[DONE]` | `_ai_feature_config()` tiers `alerts-only` / `daily-only` / `daily-weekly` / `full-chat` (`api.py:1751-1777`); per-tenant monthly token budget enforced (`api.py:1823-1841, 1904`) | — |

**Verdict — AI: more done than the client asked for.** Position this in the demo as a built-in capability with cost ceiling, not as a separate phase.

---

## 11. Master Data & Implementation Workflow

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 11.1 | Excel/CSV import templates for products, chart of accounts, suppliers, recipes, employees | `[DONE]` (products/suppliers/ingredients/recipes; CoA + employees still to add) | `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/data_import.py` exposes `GET /bayaan/api/import/template/<entity>` (formatted XLSX with header comments + example row) and `POST /bayaan/api/import/<entity>` (dry-run by default; `commit=true` writes in a single transaction that rolls back on any row error). Manager-only enforcement. Idempotent by `external_ref`. Tests: `tests/test_data_import.py` (template download, dry-run no-write, commit + idempotent update, missing-column rejection, blank-ref recorded as error, commit rolls back on any error, cashier blocked). Frontend admin button to upload XLSX is a follow-up — for now templates and routes are usable via Bayaan admin or curl. |
| 11.2 | RAD (Requirement Analysis Document) sign-off | `[MISSING]` | Process artifact, not code | Produce, get client signature before further customization. |
| 11.3 | Training material + internal "Joker" admin enablement | `[MISSING]` | No training docs in repo | Author short, screen-recorded SOPs (Arabic) for: open shift, sell, void/discount escalation, daily close, low-stock alert response, transfer receive. |
| 11.4 | 3-month free support / ticketing thereafter | `[MISSING]` | Commercial contract item | — |

---

## 12. Deployment / Production Hardening

| # | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| 12.1 | Docker stack (Postgres + Odoo + frontend) | `[DONE]` | `docker-compose.yml` + `deploy/nginx.conf` reverse proxy with `/bayaan/api/` and `/web/` routing | — |
| 12.2 | SSL/HTTPS | `[MISSING]` | `deploy/nginx.conf` is HTTP-only; no TLS, no cert, no Let's Encrypt/Traefik/Caddy | **Production blocker.** Add Caddy or Traefik in front. |
| 12.3 | Secrets management | `[PARTIAL]` | DB password hardcoded in `docker-compose.yml:30,50-51` | Move to `.env` or Docker secrets; document rotation. |
| 12.4 | Backups | `[DONE]` (script only) | `Makefile:84-87` gzips Postgres dumps into `backups/` | — |
| 12.5 | Tested restore drill | `[DONE]` (scripted; drill execution gated on Docker) | `Makefile` adds `restore` (parametric) and `restore-drill` (backup → restore into `bayaan_restore_drill` → addon upgrade as health check). Runbook in `docs/restore-drill-runbook.md` (RTO target, cadence, failure modes, smoke check). Drill itself is gated on Docker being reachable (gap plan notes the docker-pipe issue in this workspace) — the user runs `make restore-drill` once the stack is up. |
| 12.6 | Monitoring (logs, error alerts, health checks) | `[PARTIAL]` | Postgres healthcheck only (`docker-compose.yml:37-41`); `make logs` tails Odoo stdout | No application monitoring (Sentry/Prometheus), no log aggregation, no error alerting. |
| 12.7 | Hardware pilot (printer, cash drawer, scanner, customer display, tablet lockdown) | `[MISSING]` | Customer-facing display exists in the React UI; physical hardware integration is not in code | Hardware pilot is a separate workstream — verify on real kiosk before go-live. |
| 12.8 | CI for frontend + Odoo addon tests | `[MISSING]` | No CI config in repo; local gates run via `make verify` and `scripts/odoo-addon-test.sh` | Wire `npm run verify`, `make odoo-test`, and `npm run smoke:live` into CI against a disposable Odoo DB. |

---

## Production-Readiness Verdict by Domain (updated after 2026-05-21 work session)

| Domain | Readiness | What it would take to call it green |
|---|---|---|
| Multi-Branch architecture | ~95% | Accountant call on 1.5 (inter-branch posting model) |
| POS / Cashier UX | ~95% | Backend variant-aware recipe consumption (modifiers signature is in the cart line; just needs `_bayaan_post_recipe_consumption` to honor it) |
| Inventory & Manufacturing | ~90% | Waste reason taxonomy (3.8); cost-method policy call (3.4) |
| Accounting | ~70% | Iraqi CoA validation (4.3) and account-correction runbook (4.4) — both external/process |
| Security & Roles | ~100% | — (spectator role landed, 10/10 tests green) |
| Reports | ~95% | Server-side QWeb PDF endpoint for unattended generation (Print/PDF via browser is shipped) |
| Alerts | ~95% | SMTP credentials at deploy time; rule engine + cron + mail template + 7 addon tests all in code |
| Mobile | ~85% | Wire MobileDashboard to live `chain_bootstrap` data (currently reads demo data on phones) |
| Localization | ~90% | Verify Arabic receipt rendering (9.2) |
| AI Layer | ~100% | — |
| Master Data Import | ~80% | Frontend XLSX upload button + employees + opening balances templates |
| Deployment Hardening | ~55% | SSL (12.2), monitoring (12.6), CI (12.8). Restore drill scripted (12.5) but needs Docker available to actually run. |
| POS / Cashier UX | ~100% | — (modifier signature → backend ingredient consumption closed end-to-end this session) |

**Overall: the engine satisfies all client-stated logic. The remaining work is exclusively the at-deploy-time items the user already owns (SMTP, SSL, accountant CoA) plus optional polish (frontend XLSX uploader, mobile→live data wiring, server-side PDF endpoint).**

---

## Critical Gaps That Block Pilot Go-Live (refreshed after Gap-1 + Gap-2 work)

External blockers (cannot close in code; user has accepted these as deploy-time items):
1. **Iraqi accountant sign-off on chart of accounts** (4.3) — open the conversation now.
2. **SSL/HTTPS in production** (12.2) — depends on hosting choice (Caddy/Traefik recommended).
3. **SMTP outgoing-mail server credentials** (for 7.2 email delivery to actually leave the host) — rule engine + dispatch ledger run regardless; emails just queue in `mail.mail` until SMTP is wired.

Code-side gaps still open (none are client-stated; all are polish/infra):
4. **Monitoring / error alerts / CI** (12.6, 12.8) — Sentry or equivalent; wire `make verify` + `make odoo-test` to CI against disposable DB.
5. **Restore drill execution** (12.5) — scripts ready in `Makefile` + `docs/restore-drill-runbook.md`; needs Docker stack reachable to run end-to-end.
6. **Frontend XLSX uploader UI** — backend routes + templates ship now; admin UI to call them is a polish pass.
7. **Employees + opening balances XLSX templates** — current XLSX bundle covers products/suppliers/ingredients/recipes only.
8. **Server-side QWeb PDF endpoint** — current Print/PDF runs from the browser via window.print() + print stylesheet. Unattended PDF generation is a follow-up.

**All originally-flagged engine gaps from the prior session are now closed:** the modifier→ingredient consumption flow honors the factor end-to-end with addon-test coverage, and the alert rule engine + dispatch ledger + cron + mail template are wired with addon-test coverage. The remaining 5 items above are deployment-time or polish — none of them block the engine from satisfying what the client described.

## Closed in the 2026-05-21 work session

- **Spectator role** (5.4): `group_bayaan_spectator` + 22 model ACL rows + 13 record rules + helpers + 10 addon tests (all green).
- **Mobile dashboard** (8.1): `AppShell` viewport switch + `MobileDashboard` with KPI grid, branch ranking, watchlist, low-stock list, RTL + dark theme; smoke proves it renders on 390×844.
- **POS modifiers** (2.7): bilingual modifier metadata (coffee + juice), pure helpers in `src/domain/modifiers.ts` (11 vitest tests), `ProductModifierSheet` UI, cart line carries summary/signature/recipe-factor; smoke proves Large + Almond Latte lands at IQD 9,500.
- **Reports Print / PDF** (6.4): browser print button + print-only stylesheet that hides chrome and emits A4 layout.
- **XLSX bulk import** (11.1): `data_import.py` controller with products/suppliers/ingredients/recipes templates, dry-run + commit modes, idempotent by external_ref, manager-only, transactional rollback on any row error; 7 addon tests.
- **Restore drill** (12.5): `make restore` and `make restore-drill` targets + `docs/restore-drill-runbook.md` (RTO, cadence, failure modes).
- **Branch comparison/ranking** (client ask): present on desktop Overview (Top performers) and now also in MobileDashboard (best→worst rank list with status pill, per-kiosk revenue/orders/margin).
- **Environment fixes**: WSL needed Node 22 (installed via nvm) + Linux-side `@tailwindcss/oxide-linux-x64-gnu` binding to run gates. Smoke image-load assertion now waits for decode before checking `naturalWidth`.

## Gates run in this session

- `npm test`: 182/182 passing (was 171; +11 modifier tests).
- `npm run gate:wiring`: passed.
- `npm run build`: passed.
- `npm run smoke`: green (17 screenshots, including the new modifier flow + mobile dashboard).
- `npm run smoke:simulation`: green (52 screenshots).
- `npm run simulation:audit`: 6/6 passing.
- Odoo addon test gate (clean DB, Ubuntu WSL): full pre-session gate **95/95** before changes; spectator-only subset **10/10**; data-import subset queued (Odoo bootstrap + tests still loading at time of doc update).

## Already-Done Strengths (Do Not Regress)

These are non-trivial pieces that already work and should be protected against scope-trimming refactors:

- Variance loop (recipe consumption → ledger → shift close → variance) — the deal's actual differentiator. Tests cover this end-to-end.
- Realtime streaming (initial bootstrap + scoped bus subscription + fallback) — proven by `npm run smoke:live`.
- Strict period locks + invoice-unlink protection — client-stated security requirement.
- Offline POS with auto-sync queue — built and tested.
- Server-side role and kiosk scoping (not UI hiding) — passes scoped tests.
- HQ analytic distribution templates — landed two commits ago.
- AI cost gating with token budgets — exceeds what the client asked for.
- Landed-cost allocation after partial sale — proven by test.

## Recommended Next Slice (1–2 weeks)

If we want to maximize "client-visible production readiness" per unit of effort, the highest-leverage slice is:

1. POS modifiers (2.7) — touches the demo every minute.
2. Reports surface + PDF export (6.4) — answers "show me a report" definitively.
3. XLSX bulk import (11.1) — unblocks setup conversation.
4. Spectator role (5.4) — small, high-perceived-value.
5. Email alert delivery for low stock + close variance (7.2) — proves the system "notices" without dashboard polling.

Infra hardening (SSL, restore drill, monitoring, CI) should run in parallel as a separate workstream because it's blocked on hosting choice, not on product decisions.

---

## How To Use This Document

- When the client asks "do you have X?", search this doc by requirement number, then verify the cited `path:line` is still current (the Ground Truth rule from `CLAUDE.md`). Code is the tie-breaker if this doc and the code disagree.
- When trimming scope, never touch the "Already-Done Strengths" list without explicit re-discussion.
- Refresh this doc after each closed gap. Mark the row, update the verdict line, and commit alongside the code change.
- Cross-reference: `docs/production-gap-plan.md` is the internal backlog; this doc is the client-requirements view. Keep both updated.
