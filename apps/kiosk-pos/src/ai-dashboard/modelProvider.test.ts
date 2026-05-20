import { describe, expect, it } from "vitest";
import {
  AI_DASHBOARD_MODEL_CATALOG,
  DEFAULT_AI_DASHBOARD_MODEL_SELECTION,
  assertNoClientCredentialFields,
  getAiDashboardModelsByRole,
} from "./modelProvider";

describe("AI dashboard model provider selection", () => {
  it("selects OpenAI gpt-5.4-mini as the release-gate default", () => {
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.status).toBe("selected");
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.primary.provider).toBe("openai");
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.primary.modelId).toBe("gpt-5.4-mini");
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.primary.defaultForReleaseGate).toBe(true);
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.temperature).toBe("low");
    expect(DEFAULT_AI_DASHBOARD_MODEL_SELECTION.outputContract).toBe("strict-ai-dashboard-plan-json");
  });

  it("keeps provider credentials outside the client config shape", () => {
    expect(() => assertNoClientCredentialFields(DEFAULT_AI_DASHBOARD_MODEL_SELECTION)).not.toThrow();
    expect(() => assertNoClientCredentialFields({ provider: "openai", apiKey: "should-not-exist" })).toThrow(
      /credential field/,
    );
  });

  it("keeps escalation and local fallback models behind the same catalog", () => {
    expect(getAiDashboardModelsByRole("primary").map((model) => model.modelId)).toEqual(["gpt-5.4-mini"]);
    expect(getAiDashboardModelsByRole("escalation").map((model) => model.provider)).toEqual(["openai", "anthropic"]);
    expect(getAiDashboardModelsByRole("local-dev").map((model) => model.provider)).toEqual(["ollama"]);
    expect(AI_DASHBOARD_MODEL_CATALOG.every((model) => model.runtime === "server-api" || model.provider === "ollama")).toBe(
      true,
    );
  });
});
