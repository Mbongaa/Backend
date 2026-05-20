# AI Dashboard Manager Release Gate

Date checked: 2026-05-18.

Scope: fully functional read-only Bayaan AI dashboard manager infrastructure. This gate includes server-side LLM provider wiring, compact deterministic Bayaan/Odoo report-pack input, strict plan JSON validation, source-evidence rendering, frontend live-backend wiring, and verification. It does not include backend mutations or human-approved execution.

## Status

Actual AI infrastructure release gate: GREEN FOR LIVE TEST.

Mock/planning architecture gate: PASSED.

Frontend demo gate: PASSED.

Addon gate: PASSED.

The passed gates above now include a real server-side OpenAI provider call through live Odoo. They do not by themselves prove full production readiness.

Wakeup automation: COMPLETE. `bayaan-ai-gate-wakeup` was only needed while the live AI provider gate was red or environment-blocked.

## What Is In Scope

- Component registry and dashboard legend are code-backed in `apps/kiosk-pos/src/ai-dashboard/componentRegistry.ts:104`.
- The plan resolver turns manager questions into strict component plans in `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:202`.
- The resolver includes the selected model in every plan at `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:231`.
- The selected v1 model is OpenAI `gpt-5.4-mini` in `DEFAULT_AI_DASHBOARD_MODEL_SELECTION` at `apps/kiosk-pos/src/ai-dashboard/modelProvider.ts:74`.
- Provider credentials are marked server-only in `apps/kiosk-pos/src/ai-dashboard/modelProvider.ts:80`.
- The read facade exposes only `readPack` and rejects mutation-like method names at `apps/kiosk-pos/src/ai-dashboard/readFacade.ts:4`.
- Data packs carry metrics, rows, limits, and source evidence at `apps/kiosk-pos/src/ai-dashboard/dataPacks.ts:22`.
- The backend AI route is `/bayaan/api/ai_dashboard_plan` in `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py`.
- The backend route builds compact source-backed report packs from the same deterministic `/bayaan/api/chain_bootstrap` source.
- The backend route calls OpenAI Responses API server-side when `bayaan.ai.openai.api_key`, `BAYAAN_OPENAI_API_KEY`, or `OPENAI_API_KEY` is configured.
- The backend route requests strict structured JSON from the OpenAI Responses API and validates the returned plan before rendering.
- The backend route enforces `bayaan.ai.feature_tier` / `BAYAAN_AI_FEATURE_TIER` and `bayaan.ai.monthly_token_budget` / `BAYAAN_AI_MONTHLY_TOKEN_BUDGET` before spending model tokens.
- The backend response includes runtime status, provider/model, feature tier, budget snapshot, source evidence, and deterministic sample refs.
- The backend response includes `claims`, a numeric claim list where each claim carries its own source refs; deterministic fallback claims are returned when the provider is unavailable, tier-limited, budget-limited, or errors.
- The frontend gateway posts AI questions to `/bayaan/api/ai_dashboard_plan` through `sourceOfTruth.resolveAiDashboardPlan`.
- `npm run smoke:live` now fails unless the live Odoo AI route returns `llm_called`, an OpenAI response id, source evidence, claim evidence, no provider credential leakage, and an AI Insights screenshot showing runtime/source/claim proof.
- The AI Insights runtime shows whether the result came from a live LLM call, missing credentials, a tier block, a budget block, provider error, or a local plan.
- When an AI plan is present, the AI Insights canvas renders registry-backed plan component cards with each component's required source refs and matching source-evidence row counts.
- The AI Insights canvas renders a `Claim proof` panel for numeric AI claims, showing numeric values plus the cited source models and sample refs.
- The AI Insights plan cards now render report-pack-backed proof content for the required layouts: executive KPIs/top performers/alerts, stock health/needs/transfers, close review/variance/recipe blockers, waste reason/entry proof, and canvas claim/action summaries.

## What Is Out Of Scope For This Gate

- Browser-side LLM API calls.
- Browser-exposed provider keys.
- Approve/create/update/delete actions from the AI canvas.
- Replacing every existing AI Insights scene renderer.
- Backend Odoo addon execution on a Windows-native environment.

## Actual AI Infrastructure Release Criteria

This release gate is green for live test because all of the following are true:

- AI data packs read compact deterministic Bayaan/Odoo report snapshots instead of empty placeholders.
- The server-side provider adapter calls the selected model without exposing credentials to the browser.
- Strict `AiDashboardPlan` JSON is validated before rendering.
- Rendered AI numeric claims show source evidence tied to deterministic source refs.
- At least five plan-driven canvases are verified end to end: executive brief, kiosk diagnosis, waste anomaly, close review, and stock allocation.
- The AI canvas cannot execute or expose backend mutation actions in v1.
- Frontend verify passes and the addon gate either passes in WSL/Docker or is explicitly recorded as an environment blocker.

## Verification Run

Latest run: 2026-05-18.

- `git diff --no-index -- AGENTS.md CLAUDE.md`: passed with no diff.
- `rg -n "[^\\x00-\\x7F]" docs/ai-infrastructure-workflow.md`: passed with no matches.
- `npx vitest run src/ai-dashboard --pool threads`: passed, 4 files and 12 tests.
- `python -m py_compile backend\bayaan_odoo_addons\bayaan_fnb_kiosk\controllers\api.py`: passed after adding the backend AI route.
- `python -m py_compile backend\bayaan_odoo_addons\bayaan_fnb_kiosk\controllers\api.py backend\bayaan_odoo_addons\bayaan_fnb_kiosk\tests\test_ai_dashboard_api.py backend\bayaan_odoo_addons\bayaan_fnb_kiosk\tests\__init__.py`: passed after adding feature-tier and budget guards.
- `npx tsc --noEmit`: passed after frontend AI route wiring.
- `npx vitest run src/services/sourceOfTruth.test.ts src/ai-dashboard --pool threads`: passed, 5 files and 110 tests, after adding claim-level source refs.
- `node --check scripts/live-odoo-smoke.mjs`: passed after adding live AI smoke assertions.
- `node scripts/wiring-gate.mjs`: passed and now protects the live AI smoke route/status/credential-leak assertions.
- `npm run verify`: passed after live provider configuration, including 15 Vitest files, 164 tests, wiring gate, production build, and Playwright smoke.
- Playwright smoke result: `{ "ok": true }`, including `verification/exact-admin-ai-insights.png`.
- Build warning remains non-blocking: main JS chunk is larger than 500 kB after minification.
- Provider credential check: configured server-side in Odoo config parameter `bayaan.ai.openai.api_key`; no browser `.env` or frontend credential was used.
- Live Odoo restart: Odoo was restarted from `backend/odoo` with the current `../bayaan_odoo_addons` path and `--update bayaan_fnb_kiosk`.
- Live Odoo AI smoke: `npm run smoke:live` passed. It proved `/bayaan/api/ai_dashboard_plan` returned `llm.status = "llm_called"` with OpenAI `gpt-5.4-mini`, provider response id `resp_0aa39a30e6cffb10006a0ae8b840c88196909ed54b92ce6c1f`, source evidence, claim proof, report-pack-backed AI cards, no provider credential leakage, and `verification/live-odoo-ai-insights.png`.

Addon gate attempt:

- Windows `bash scripts/odoo-addon-test.sh` still failed through the Windows launcher with `Bash/Service/CreateInstance/HCS_E_CONNECTION_TIMEOUT`.
- Direct WSL command passed: `wsl.exe -d Ubuntu -e bash -lc 'cd /mnt/c/Users/hassa/OneDrive/Desktop/Bayaan.ai/bayaan\ POS; bash scripts/odoo-addon-test.sh'`.
- Result: `Bayaan addon tests passed for bayaan_codex_20260517_214416`; Odoo reported `76 tests`, `56 post-tests`, and `0 failed, 0 error(s)`.

## Next Build Gate

The next implementation gate after live AI proof is pilot hardening:

- Keep Odoo running for the `bayaan` database at `ODOO_URL` / the WSL `8069` host when testing live mode.
- Add provider/model and budget administration UI or operator documentation before pilot handoff.
- Keep action-looking components in proposal mode until M2 human-approved execution exists.
- Continue production readiness work outside this AI gate: deployment, backups, monitoring, restore drill, SSL, secrets handling, and full dashboard verification obligations in `AGENTS.md`.
