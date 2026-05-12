# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Positioning (read first)

Bayaan is sold as a custom F&B kiosk operating system for an Iraqi client (Baghdad, ~10 coffee/juice/cake stalls scaling toward 100+). **Odoo Community 19.0 is the hidden transaction/POS engine — never sell or expose it as the product.** All Bayaan logic lives in `backend/bayaan_odoo_addons/`; do not edit Odoo core under `backend/odoo/`.

The deterministic rule: accounting, stock, cash, and reports must be deterministic and auditable. AI is strictly a final-layer reporting/insights surface — it never computes official numbers.

## Commercial Posture

Pricing is **USD 22,500 one-time + USD 150–300/yr self-hosted infrastructure, no Odoo per-user subscription fees**. This is why the codebase commits to Odoo Community (LGPLv3, self-hostable) and not Frappe/ERPNext or paid Odoo. The competing proposal in the deal is an Odoo Gold Partner offering ~$25.5k + per-user subscriptions; the client explicitly rejected recurring monthly costs.

Implications for technical decisions: avoid anything that introduces per-user SaaS subscriptions or pulls the deal toward Odoo Enterprise. Don't fork Odoo core (LGPL boundary that protects the proprietary addon). Don't propose hosted/managed third-party services that add monthly billing without checking with the user first.

## The Variance Loop (Why This Product Exists)

The differentiator vs. the competitor's "implementation as-is" Odoo install is the **expected-vs-actual variance loop** at every kiosk:

```
opening stock + transfers received − recipe consumption from sales − recorded waste = expected closing stock
expected closing stock vs. counted closing stock = variance (waste / theft / cashier error / unrecorded sales / data issue)
```

Everything in the codebase exists to make that loop trustworthy: deterministic recipe deduction in `pos_order.py`'s `_bayaan_post_recipe_consumption`, the immutable `bayaan.consumption.ledger`, kiosk-scoped `stock.location`s, and the daily `bayaan.shift.close` with counted-stock variance lines. **When trimming scope or refactoring, this loop is the last thing to cut** — it is the reason for the deal.

## Repository Layout

- `apps/kiosk-pos/` — React 19 + Vite frontend. The active runtime entrypoint is `src/main.tsx` → `src/exact-design/ExactKioskApp.jsx` (the ported Anthropic design bundle). The older Bayaan admin/POS prototype in `src/App.tsx` is **kept as integration reference only** — it is not the active runtime.
- `backend/odoo/` — vendored Odoo Community 19.0 source. Treat as read-only.
- `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/` — the only place to add backend logic. Models, controllers, views, and POS asset patches live here.
- `design/exact-pos/kiosk-pos/` — fetched Anthropic design handoff bundle. The pixel reference for the exact UI; `apps/kiosk-pos/src/exact-design/` is its mechanical Vite port.
- `docs/` — authoritative integration plans (`single-source-of-truth.md`, `odoo-pos-engine-wiring.md`, `backend-integration.md`, `production-readiness.md`, `demo-script.md`).
- `HANDOFF.md` — project brief, run commands, and current readiness.

## Frontend Commands

All frontend commands run from `apps/kiosk-pos/`:

```bash
npm install
npm run dev        # vite on http://127.0.0.1:5174 (port is hardcoded)
npm run build      # tsc + vite build
npm test           # vitest run (deterministic domain tests)
npm run smoke      # Playwright browser smoke against the running/ensured dev server
npm run verify     # full release gate: test + build + smoke
```

Run a single vitest file: `npx vitest run src/domain/pos.test.ts`.

Point the smoke at a custom URL via the `KIOSK_POS_URL` env var (e.g. `KIOSK_POS_URL=http://127.0.0.1:5174 npm run smoke`). The smoke script auto-starts a Vite server if none is reachable. Screenshots land in `apps/kiosk-pos/verification/`.

The frontend optionally talks to a real Odoo backend via `VITE_ODOO_URL` and `VITE_ODOO_TOKEN` (see `.env.example`). When unset, `services/sourceOfTruth.ts` returns a no-op gateway so the demo runs without Odoo.

## Backend (Odoo) Setup

Local Odoo run shape (Linux/WSL or Docker — not Windows native):

```bash
cd backend/odoo
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python odoo-bin --addons-path=addons,../bayaan_odoo_addons -d bayaan \
  -i point_of_sale,stock,purchase,account,bayaan_fnb_kiosk
```

Addon manifest is `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py`. It depends on `account`, `point_of_sale`, `purchase`, `stock`.

## Architecture: The Single-Source-of-Truth Rule

There must be exactly one backend database. Bayaan must not run a second accounting store. Concretely:

- **Cashier sales go through customized Odoo POS** — never through the React POS in production. The `/bayaan/api/pos_sale` controller deliberately returns `engine: odoo_pos` and refuses to be a parallel sale path; this is a guardrail, not a TODO.
- The React/Vite POS in `apps/kiosk-pos/` is **demo + design-review only** for Phase 1. It must not become a second production POS engine.
- When a `pos.order` is paid, the Bayaan addon's `pos_order.py` extension hooks `_process_saved_order` to: resolve `bayaan.kiosk` from `pos.config` → look up the active `bayaan.recipe` **at sale time** (not the currently-active recipe) → create `stock.scrap` from the kiosk `stock.location` → write immutable `bayaan.consumption.ledger` rows.
- **Recipe versioning is non-negotiable.** `bayaan.recipe` has versions with effective dates because if the orange-juice recipe changes today, yesterday's variance reports must still resolve against yesterday's recipe. Don't "simplify" by removing version history or by reading live recipe lines from the consumption ledger.
- Failure must be visible: paid orders without a recipe are flagged `missing_recipe`; posting failures are flagged `failed` with the error on the chatter. Silent failure is not allowed.

Bayaan API routes (in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py`):
`/bayaan/api/chain_bootstrap`, `/pos_sale` (guardrail), `/stock_transfer`, `/purchase_order`, `/recipe_version`, `/waste`, `/shift_close`.

## Architecture: Product Consumption Modes

Every sellable product has a `product.template.bayaan_consumption_mode`. Setting this correctly is what prevents double stock deduction:

- `recipe` — kiosk-made (juice, coffee). Bayaan deducts ingredients; the addon **suppresses** Odoo's standard finished-SKU stock move.
- `finished` — packaged item (cake slice). Odoo handles stock normally; Bayaan does nothing.
- `hybrid` — both: Odoo consumes the finished item AND Bayaan consumes recipe components.
- `none` — service / non-stock.

When adding a new sellable product, picking the wrong mode silently breaks accounting. Verify the mode before assuming a stock bug is in code.

## Architecture: Frontend Data Flow

- `src/data.ts` — typed mock catalog (kiosks, ingredients, menu items, recipes, bilingual `LocalText` for EN/AR).
- `src/domain/` — deterministic, framework-free domain logic with tests: `pos.ts` (sale/waste/stock snapshot), `chain.ts` (multi-kiosk inventory state), `finance.ts` (P&L/margins). All math the UI displays should originate here so tests stay meaningful.
- `src/services/sourceOfTruth.ts` — single gateway to Bayaan Odoo API routes. No-op when `VITE_ODOO_URL` is unset.
- `src/services/bootstrapAdapter.ts` — hydrates `ChainState` from `/bayaan/api/chain_bootstrap` so the same admin/POS screens work against either mock data or live Odoo.
- `src/exact-design/ExactKioskApp.jsx` + `exact.css` — the active runtime, a mechanical port of the design HTML. Treat as the pixel-fidelity layer.

## AI Layer Rules

- AI never computes official numbers. It reads deterministic Odoo/Bayaan reports and writes summaries, anomalies, forecasts, recommendations. Every numeric claim in an AI output must trace back to a source query — a summary like "Kiosk 04 had 12% higher orange consumption" must link to the exact `bayaan.consumption.ledger` rows.
- AI usage is a recurring cost separate from the implementation fee. Features must be designed with frequency tiers (daily-only / daily+weekly / full chat / alerts-only) and a configurable per-tenant token budget — built in from day one, not bolted on. Pre-aggregate metrics server-side and feed compact JSON to the model; never paginate raw `pos.order` rows into the LLM.
- Default to scheduled non-conversational summaries before adding chat. Chat is the most expensive tier.

## Phase 1 Intentional Gaps

These are deliberate simplifications for the 10-kiosk pilot, not bugs. **Don't refactor toward them speculatively.**

- **Flat kiosk model** — no Company → City/Region → Area → Kiosk hierarchy. Add only when a multi-city deployment is committed.
- **One-shot `/bayaan/api/stock_transfer`** — creates the `stock.picking` immediately. The intended state machine is Draft → Approved → Picked → Dispatched → Received → Completed; deferred until pilot data justifies it.
- **No real auth / kiosk scoping** — cashiers are not yet restricted to their assigned kiosk. Required before live production but not before pilot demo.
- **Iraqi chart of accounts not mapped** — needs the client's accountant. Tax rules are simple; not blocking the pilot.
- **No offline POS hardening beyond what Odoo POS provides** — kiosk-internet edge cases (sync conflicts, queued sales reconciliation) are not yet tested.

## Conventions

- TypeScript is configured with `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch` (see `apps/kiosk-pos/tsconfig.json`). Builds will fail on unused names — clean as you go.
- The exact-design runtime files (`ExactKioskApp.jsx`, `exact.css`) are a port; preserve their structure and class names rather than rewriting in idiomatic React, or the design fidelity drifts.
- Bilingual UI is required: text comes through `LocalText { en, ar }` and the app supports an Arabic RTL toggle. The smoke test asserts `dir="rtl"` after switching language — don't break it.
- The smoke test verifies fixed copy strings ("Maqha", "STREAM ACTIVE", "Top performers", per-section headings including "Today's brief" on AI Insights, "Customer-facing display", "Step up when ready", "Amount due", "Payment complete", "Record waste"). Renaming user-facing text requires updating `apps/kiosk-pos/scripts/smoke.mjs`.
- Narrow-screen rendering is intentional horizontal scroll, not responsive collapse — the exact desktop/tablet canvas must not be crushed.
