export type AiProviderId = "openai" | "anthropic" | "ollama";

export type AiModelStatus = "model-not-selected" | "selected";

export type AiModelRole = "primary" | "escalation" | "local-dev";

export type AiModelRuntime = "server-api" | "local-openai-compatible";

export type AiTemperaturePolicy = "low";

export type AiDashboardModelConfig = {
  readonly provider: AiProviderId;
  readonly modelId: string;
  readonly label: string;
  readonly role: AiModelRole;
  readonly runtime: AiModelRuntime;
  readonly defaultForReleaseGate: boolean;
  readonly serverCredentialRequired: boolean;
  readonly notes: string;
};

export type AiDashboardModelSelection = {
  readonly status: AiModelStatus;
  readonly primary: AiDashboardModelConfig;
  readonly fallbacks: readonly AiDashboardModelConfig[];
  readonly temperature: AiTemperaturePolicy;
  readonly outputContract: "strict-ai-dashboard-plan-json";
  readonly credentialLocation: "server-only";
};

export const AI_DASHBOARD_MODEL_CATALOG = [
  {
    provider: "openai",
    modelId: "gpt-5.4-mini",
    label: "OpenAI gpt-5.4-mini",
    role: "primary",
    runtime: "server-api",
    defaultForReleaseGate: true,
    serverCredentialRequired: true,
    notes: "Default v1 production model for low-cost read-only canvas planning and short source-grounded summaries.",
  },
  {
    provider: "openai",
    modelId: "gpt-5.4",
    label: "OpenAI gpt-5.4",
    role: "escalation",
    runtime: "server-api",
    defaultForReleaseGate: false,
    serverCredentialRequired: true,
    notes: "Escalation model for failed JSON validation or high-risk audit questions.",
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    role: "escalation",
    runtime: "server-api",
    defaultForReleaseGate: false,
    serverCredentialRequired: true,
    notes: "Alternative escalation model for long-form manager explanations and source synthesis.",
  },
  {
    provider: "ollama",
    modelId: "qwen3:8b",
    label: "Ollama Qwen3 8B",
    role: "local-dev",
    runtime: "local-openai-compatible",
    defaultForReleaseGate: false,
    serverCredentialRequired: false,
    notes: "Optional local development and offline demo fallback behind the same adapter shape.",
  },
] as const satisfies readonly AiDashboardModelConfig[];

export const DEFAULT_AI_DASHBOARD_MODEL_SELECTION = {
  status: "selected",
  primary: AI_DASHBOARD_MODEL_CATALOG[0],
  fallbacks: [AI_DASHBOARD_MODEL_CATALOG[1], AI_DASHBOARD_MODEL_CATALOG[2], AI_DASHBOARD_MODEL_CATALOG[3]],
  temperature: "low",
  outputContract: "strict-ai-dashboard-plan-json",
  credentialLocation: "server-only",
} as const satisfies AiDashboardModelSelection;

const FORBIDDEN_CLIENT_CREDENTIAL_KEYS = new Set([
  "apikey",
  "accesskey",
  "secretkey",
  "bearertoken",
  "authorization",
  "password",
]);

export function getAiDashboardModelsByRole(role: AiModelRole): readonly AiDashboardModelConfig[] {
  return AI_DASHBOARD_MODEL_CATALOG.filter((model) => model.role === role);
}

export function assertNoClientCredentialFields(value: unknown) {
  visitCredentialObject(value, []);
}

function visitCredentialObject(value: unknown, path: readonly string[]) {
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_CLIENT_CREDENTIAL_KEYS.has(normalizedKey)) {
      throw new Error(`AI model provider config exposes client credential field: ${[...path, key].join(".")}`);
    }
    visitCredentialObject(child, [...path, key]);
  }
}
