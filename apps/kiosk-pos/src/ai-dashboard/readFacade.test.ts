import { describe, expect, it } from "vitest";
import { assertNoForbiddenMethodNames, createAiDashboardReadFacade } from "./readFacade";

describe("AI dashboard read-only facade", () => {
  it("does not expose forbidden mutation-like method names", () => {
    const facade = createAiDashboardReadFacade();
    expect(() => assertNoForbiddenMethodNames(facade as unknown as Record<string, unknown>)).not.toThrow();
  });

  it("returns an empty read-only pack with required evidence models", async () => {
    const facade = createAiDashboardReadFacade();
    const pack = await facade.readPack(
      "overview",
      { timeRange: "today", kioskId: "K-04" },
      ["pos.order", "report.pack"],
    );

    expect(pack.id).toBe("overview");
    expect(pack.scope.kioskId).toBe("K-04");
    expect(pack.rows.length).toBe(0);
    expect(pack.sourceEvidence.requiredModels).toEqual(["pos.order", "report.pack"]);
    expect(pack.sourceEvidence.empty).toBe(true);
    expect(Number.isNaN(Date.parse(pack.generatedAt))).toBe(false);
  });
});
