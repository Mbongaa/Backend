# AI Model Provider Inventory for Bayaan

Date checked: 2026-05-17.

This decision is scoped to the first Bayaan AI dashboard manager release: read-only analysis, source-backed explanations, and canvas component selection. It does not cover future execute/approve workflows.

## Bayaan Requirements

Verified repo constraints:

- AI is only a final-layer reporting/insights surface; accounting, stock, cash, and reports stay deterministic and auditable in Odoo/Bayaan (`AGENTS.md:28`).
- The core product loop is expected-vs-counted variance at kiosk close (`AGENTS.md:40`).
- Every AI numeric claim must trace back to deterministic source rows (`AGENTS.md:135`).
- AI cost is separate from the implementation fee, so we need frequency tiers and tenant token budgets (`AGENTS.md:136`).
- The first AI dashboard manager must observe, analyze, explain, and visualize, but not mutate records (`docs/ai-dashboard-manager-component-map.md:20`).
- The current model boundary selects the recommended primary model in code, keeps provider credentials server-only, and lets the plan resolver carry the selected model into every `AiDashboardPlan` (`apps/kiosk-pos/src/ai-dashboard/modelProvider.ts:74`, `apps/kiosk-pos/src/ai-dashboard/planResolver.ts:35`).

Functional needs:

- Reliable structured JSON for `AiDashboardPlan`.
- Strong source-grounded summarization over compact report packs.
- Good English and Arabic output.
- Low hallucination when explaining stock, waste, cash, payment, and close variance.
- Predictable latency for dashboard chat.
- Controllable cost for daily summaries and limited owner chat.
- No browser-exposed provider API keys.

## Current Provider Facts

### OpenAI

Official docs checked:

- Model guide says start with `gpt-5.5` for complex reasoning/coding, and use `gpt-5.4-mini` or `gpt-5.4-nano` for lower-latency/lower-cost workloads: https://platform.openai.com/docs/models
- Current pricing lists standard short-context prices per 1M tokens:
  - `gpt-5.5`: $5 input / $30 output
  - `gpt-5.4`: $2.50 input / $15 output
  - `gpt-5.4-mini`: $0.75 input / $4.50 output
  - `gpt-5.4-nano`: $0.20 input / $1.25 output
  Source: https://platform.openai.com/docs/pricing
- OpenAI API data is not used to train or improve models by default unless explicitly opted in. Default abuse monitoring logs may retain customer content up to 30 days; Zero Data Retention and Modified Abuse Monitoring are approval-based controls. Source: https://platform.openai.com/docs/models/how-we-use-your-data
- OpenAI data residency controls exist by project, with regional endpoints and a 10% uplift for some newer models. Source: https://platform.openai.com/docs/models/how-we-use-your-data

Assessment for Bayaan:

- Best first default for production v1: `gpt-5.4-mini`.
- Best escalation model for hard audit/diagnosis: `gpt-5.4` or `gpt-5.5`.
- Strengths: strong structured planning, good multilingual support, large context options, predictable API integration, strong cost/performance at mini tier.
- Risk: recurring API cost and external processing. Mitigation: compact report packs, token budgets, no raw `pos.order` pagination, backend-only provider adapter.

### Anthropic

Official docs checked:

- Latest Claude model comparison lists:
  - Claude Opus 4.7: most capable generally available model, $5 input / $25 output per 1M tokens, 1M context.
  - Claude Sonnet 4.6: best speed/intelligence mix, $3 input / $15 output per 1M tokens, 1M context.
  - Claude Haiku 4.5: fastest, $1 input / $5 output per 1M tokens, 200k context.
  Source: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic pricing page gives the same model price bands and prompt-cache pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic commercial products, including Anthropic API, do not use inputs or outputs for training by default. Source: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
- Anthropic API has ZDR options for supported APIs; retained data is not used for model training without express permission. Source: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention

Assessment for Bayaan:

- Best Anthropic default: Claude Sonnet 4.6.
- Best high-end option: Claude Opus 4.7.
- Strengths: excellent long-context reasoning, strong natural explanations, good for "manager assistant" tone, strong source synthesis.
- Risk: Sonnet 4.6 is materially more expensive than `gpt-5.4-mini` for routine calls. It may be worth using as an escalation/fallback rather than primary default.

### Ollama / Open Source

Official docs checked:

- Ollama supports local large language models such as gpt-oss, Gemma, DeepSeek-R1, and Qwen: https://docs.ollama.com/
- Ollama local mode says prompts/data are not sent back to ollama.com when running locally. Cloud-hosted models are processed by Ollama but not stored/logged/trained on, per the FAQ: https://docs.ollama.com/faq
- Ollama has partial OpenAI API compatibility, including `/v1/chat/completions` and `/v1/responses`: https://docs.ollama.com/api/openai-compatibility
- Ollama's Qwen3 library includes local models from 0.6B through 235B, with examples such as `qwen3:8b` at 5.2GB/40K context and `qwen3:30b` at 19GB/256K context: https://registry.ollama.ai/library/qwen3
- Ollama evaluates required VRAM and can spread models over GPUs if one GPU cannot fit the model. Source: https://docs.ollama.com/faq

Assessment for Bayaan:

- Best role: development fallback, offline demo mode, privacy-sensitive experiments, and local regression tests.
- Not recommended as production default for v1 unless we provision and benchmark dedicated GPU hardware.
- Strengths: no per-token provider bill, local privacy, controllable deployment, useful for simple summaries and intent-routing tests.
- Risks: hardware/ops burden, variable structured-output reliability, weaker audit-grade reasoning on smaller models, slower latency on CPU, harder support for a nontechnical client.

## Cost Sketch

Approximate per-answer cost for a compact dashboard query with 10k input tokens and 1k output tokens:

- `gpt-5.4-mini`: about $0.012.
- `gpt-5.4`: about $0.040.
- `gpt-5.5`: about $0.080.
- Claude Haiku 4.5: about $0.015.
- Claude Sonnet 4.6: about $0.045.
- Claude Opus 4.7: about $0.075.
- Local Ollama: no token bill, but hardware and ops cost replace token billing.

The real lever is not only model choice. The main lever is keeping prompts compact: pre-aggregate server-side, send only report packs, component registry entries, and source refs.

## Recommendation

Use a provider adapter, not a one-provider lock-in.

Default production v1:

```txt
Primary: OpenAI gpt-5.4-mini
Escalation: OpenAI gpt-5.4 or Claude Sonnet 4.6
Optional local dev/offline fallback: Ollama qwen3:8b or qwen3:30b, depending on hardware
```

Why:

- `gpt-5.4-mini` is the best default cost/performance fit for routine canvas planning and short source-grounded summaries.
- `gpt-5.4` or Claude Sonnet 4.6 should handle harder audit explanations: close variance, recipe-cost diagnosis, fraud/waste anomaly synthesis, and Arabic/English executive writeups.
- Ollama is worth supporting behind the same adapter, but not as the first production default. It is excellent for local demos and cost-free testing, but the client should not depend on local GPU operations for the pilot release.

## Release-Gate Model Choice

For the first functional architectural design release gate, choose:

```txt
Model: gpt-5.4-mini
Provider: OpenAI
Mode: read-only
Temperature: low
Input: compact deterministic report packs + component registry subset
Output: strict AiDashboardPlan JSON + short manager explanation
Fallback: gpt-5.4 for failed JSON validation or high-risk audit questions
Local dev optional: Ollama via OpenAI-compatible base URL
```

Status in code: selected as the default release-gate model in `DEFAULT_AI_DASHBOARD_MODEL_SELECTION`.

Gate status and verification are tracked in `docs/ai-dashboard-release-gate.md`.

Before pilot go-live, add:

- Tenant token budget.
- Per-feature frequency tiers: daily-only, daily+weekly, alerts-only, full chat.
- Provider/model config stored server-side.
- JSON schema validation for every AI plan.
- Source evidence requirement: no numeric claim renders without source refs.
- Redaction layer for personally sensitive staff/cashier details where possible.
- Provider evaluation harness: run the same 25 dashboard questions across `gpt-5.4-mini`, `gpt-5.4`, Claude Sonnet 4.6, and one Ollama model, then compare JSON validity, source correctness, latency, and cost.
