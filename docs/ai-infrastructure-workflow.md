# AI Infrastructure Workflow And Wakeup Protocol

Last verified: 2026-05-18 from local repo reads.

This file is the resume anchor for Bayaan AI infrastructure work. Use it when a thread heartbeat wakes up, when an automation was deleted, or when the release gate is still red or environment-blocked.

## Scope Anchors

- The AI feature is a dashboard manager, not an operator. V1 observes, analyzes, explains, and visualizes; it must not create POs, approve closes, change recipes, adjust stock, create transfers, or edit official Bayaan/Odoo records. Source: `docs/ai-dashboard-manager-component-map.md:36`.
- The runtime flow is: user question, intent router, read-only data packs, analyzer, component resolver, canvas renderer with `sourceRefs`, then a short manager narrative. Source: `docs/ai-dashboard-manager-component-map.md:51`.
- V1 guardrails forbid mutation tools and require action-looking components to render in proposal mode. Source: `docs/ai-dashboard-manager-component-map.md:61`.
- The first model/provider decision is read-only OpenAI `gpt-5.4-mini`, low temperature, compact deterministic report packs plus registry subset in, strict `AiDashboardPlan` JSON plus short manager explanation out. Source: `docs/ai-model-provider-inventory.md:120`.
- The real AI infrastructure release gate is green for live test after server-side provider execution, deterministic report-pack hydration, strict plan validation, source evidence, and live verification were proven. Source: `docs/ai-dashboard-release-gate.md:7`.

## Current Code Anchors

- The active exact-design runtime imports `resolveAiDashboardPlan`. Source: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:10`.
- The plan resolver returns `AiDashboardPlan` with intent, query, scope, required data packs, planned components, source refs, explanation style, model status, and model selection. Source: `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:35`.
- The resolver templates cover executive summary, kiosk diagnosis, waste anomaly, stock allocation, close review, recipe margin, payment reconciliation, staff coaching, warehouse topology, and catalog lookup. Source: `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:60`.
- The resolver rejects any `human-action` component before returning a plan. Source: `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:202`.
- The AI Insights screen now resolves a plan from the user question and maps plan intents to canvas scenes. Sources: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6554`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6670`.
- The read facade exposes only `readPack` and rejects forbidden mutation-like method names. Source: `apps/kiosk-pos/src/ai-dashboard/readFacade.ts:4`.
- The backend live AI route is `/bayaan/api/ai_dashboard_plan`; it builds a compact source-backed report pack and calls the OpenAI Responses API from Odoo only when server credentials are configured.
- Server-side AI credentials may be supplied through Odoo config parameter `bayaan.ai.openai.api_key` or environment variables `BAYAAN_OPENAI_API_KEY` / `OPENAI_API_KEY`. The browser must never receive those credentials.
- The backend AI route requests strict structured JSON from the OpenAI Responses API, validates the returned component plan, and refuses `human-action` modes before rendering.
- The backend AI route enforces tenant feature tiers through `bayaan.ai.feature_tier` / `BAYAAN_AI_FEATURE_TIER`. Supported tiers are `alerts-only`, `daily-only`, `daily-weekly`, and `full-chat`.
- The backend AI route enforces token budget controls through `bayaan.ai.monthly_token_budget` / `BAYAAN_AI_MONTHLY_TOKEN_BUDGET`, records monthly usage in `bayaan.ai.usage.YYYY-MM`, and returns a budget snapshot in every AI response.
- The backend AI route returns claim-level numeric evidence in `claims`; every claim has `numericValues` and source refs, with deterministic fallback claims when the live provider is unavailable.
- The AI Insights frontend displays live runtime status, provider/model, feature tier, token budget remaining, and source evidence for the returned plan.
- When an AI plan is present, the AI Insights canvas renders registry-backed plan component cards with source refs and matching evidence counts instead of relying only on static scene cards.
- The AI Insights frontend renders a `Claim proof` panel that displays numeric values with the cited source models and deterministic sample refs.
- The AI Insights plan cards render compact report-pack data for executive KPIs, stock needs/transfers, close review variance proof, waste reason/entry proof, and canvas claim/proposal summaries.
- The live Odoo smoke gate now exercises `/bayaan/api/ai_dashboard_plan`, requires `llm_called`, checks for source evidence and claim evidence, rejects provider credential leakage, and captures `verification/live-odoo-ai-insights.png`.
- The live Odoo addon gate passed in direct WSL on 2026-05-17. The live AI provider gate passed on 2026-05-18 after configuring server-side OpenAI credentials in Odoo config parameter `bayaan.ai.openai.api_key`; `npm run smoke:live` proved `llm_called`, provider/model, source evidence, claim proof, report-pack-backed AI cards, and no provider credential leakage.

## Wakeup Runbook

On every wakeup:

1. Read `AGENTS.md`, `CLAUDE.md`, this file, `docs/ai-dashboard-release-gate.md`, `docs/ai-dashboard-manager-component-map.md`, and `docs/ai-model-provider-inventory.md`.
2. Run `git diff --no-index -- AGENTS.md CLAUDE.md`. If it differs, fix the stale mirror before continuing.
3. Inspect current AI code with `rg -n "resolveAiDashboardPlan|AiDashboardPlan|SourceEvidence|sourceRefs|human-action|proposal-only|readPack|modelProvider" apps/kiosk-pos/src`.
4. Run the frontend AI gate from `apps/kiosk-pos`: `npx vitest run src/ai-dashboard --pool threads`.
5. Run the frontend release gate from `apps/kiosk-pos`: `npm run verify`.
6. Run the addon gate from repo root: `bash scripts/odoo-addon-test.sh`. If WSL/Docker is unavailable, capture the exact environment blocker and do not call the addon gate green.
7. If any gate is red and fixable in code, implement the smallest high-risk fix, then rerun the failing gate.
8. If the remaining red item is external or environment-only, update the status with the exact blocker and stop rather than looping.

## Green-Test Follow-Up Queue

Prefer this order after the live AI gate is green for testing:

1. Keep live Odoo reachable at `ODOO_URL` or the current WSL `8069` host, then run `npm run smoke:live` before any live demo.
2. Expand the current compact plan-card renderers into richer section-specific visual parity adapters where needed.
3. Add provider/model and budget administration UI or operator documentation before live pilot.
4. Re-run the Odoo addon gate in WSL/Docker after backend AI changes; the latest direct WSL run passed, but Windows `bash` launcher remains unreliable.
5. If live Odoo or AI credentials become missing again, record the exact blocker and mark the live AI gate red until `npm run smoke:live` passes again.

## Stop Conditions

- Stop as green only after the required gates pass and the dashboard verification obligations in `AGENTS.md` are satisfied.
- Stop as blocked only when the remaining issue is external or environment-only, such as unavailable WSL/Docker for the addon gate.
- Never claim production readiness from tests alone.
