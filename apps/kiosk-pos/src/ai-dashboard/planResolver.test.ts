import { describe, expect, it } from "vitest";
import { assertAiRenderable, componentRegistry, getDashboardComponent, type InteractionMode } from "./componentRegistry";
import { inferAiDashboardIntent, resolveAiDashboardPlan } from "./planResolver";

const sampleQueries = [
  "What happened today?",
  "Why is K-04 Zayouna behind?",
  "Show waste anomalies",
  "What should we transfer today?",
  "Can I approve closes?",
  "Which products are hurting margin?",
  "How are payments split?",
  "Which cashier needs coaching?",
  "Show warehouse topology",
  "Find stock item catalog entries for milk",
];

describe("AI dashboard plan resolver", () => {
  it("routes common manager questions to the intended dashboard intent", () => {
    expect(inferAiDashboardIntent("What happened today?")).toBe("executive-summary");
    expect(inferAiDashboardIntent("Why is K-04 Zayouna behind?")).toBe("kiosk-diagnosis");
    expect(inferAiDashboardIntent("Show waste anomalies")).toBe("waste-anomaly-review");
    expect(inferAiDashboardIntent("What should we transfer today?")).toBe("stock-allocation");
    expect(inferAiDashboardIntent("Can I approve closes?")).toBe("close-review");
    expect(inferAiDashboardIntent("Which products are hurting margin?")).toBe("recipe-margin-review");
    expect(inferAiDashboardIntent("How are payments split?")).toBe("payment-reconciliation");
    expect(inferAiDashboardIntent("How much cash and online payments did we have?")).toBe("payment-reconciliation");
    expect(inferAiDashboardIntent("Which cashier needs coaching?")).toBe("staff-coaching");
    expect(inferAiDashboardIntent("Show warehouse topology")).toBe("warehouse-topology");
    expect(inferAiDashboardIntent("Find stock item catalog entries for milk")).toBe("catalog-lookup");
  });

  it("routes Arabic quick prompts to the same dashboard intents", () => {
    expect(inferAiDashboardIntent("لماذا ساحة زيونة متأخرة 12%؟")).toBe("kiosk-diagnosis");
    expect(inferAiDashboardIntent("اعرض شذوذ الهدر")).toBe("waste-anomaly-review");
    expect(inferAiDashboardIntent("ما المخزون الذي يجب إرساله لـ K-07 غداً؟")).toBe("stock-allocation");
    expect(inferAiDashboardIntent("هل أستطيع اعتماد الإغلاق؟")).toBe("close-review");
  });

  it("routes explicit product-creation requests to catalog-create, ahead of lookup/margin", () => {
    expect(inferAiDashboardIntent("Create a Mango Smoothie with sizes S/M/L")).toBe("catalog-create");
    expect(inferAiDashboardIntent("Add a new product")).toBe("catalog-create");
    expect(inferAiDashboardIntent("create a recipe for orange juice")).toBe("catalog-create");
    expect(inferAiDashboardIntent("new menu item: iced latte")).toBe("catalog-create");
    expect(inferAiDashboardIntent("أضف منتج جديد")).toBe("catalog-create");
    expect(inferAiDashboardIntent("منتج جديد: عصير مانجو")).toBe("catalog-create");
    // Must not swallow non-creation catalog/margin questions.
    expect(inferAiDashboardIntent("Find stock item catalog entries for milk")).toBe("catalog-lookup");
    expect(inferAiDashboardIntent("Which products are hurting margin?")).toBe("recipe-margin-review");
  });

  it("renders the product draft as a human-confirm card the AI is allowed to surface", () => {
    const draft = getDashboardComponent("catalog.product_draft");
    expect(draft.interactionMode).toBe("human-confirm");
    // human-confirm is AI-renderable (unlike human-action), so the plan validates.
    expect(() => assertAiRenderable(["catalog.product_draft"])).not.toThrow();
    // human-action surfaces remain forbidden to the AI.
    expect(() => assertAiRenderable(["items.new_item_modal"])).toThrow();

    const plan = resolveAiDashboardPlan("Create a Mango Smoothie, 200g mango + 100ml milk");
    expect(plan.intent).toBe("catalog-create");
    const draftComponent = plan.components.find((component) => component.componentId === "catalog.product_draft");
    expect(draftComponent?.mode).toBe("human-confirm");
  });

  it("keeps every generated v1 plan read-only or proposal-only", () => {
    const allowedModes: InteractionMode[] = ["read-only", "proposal-only"];

    for (const query of sampleQueries) {
      const plan = resolveAiDashboardPlan(query);

      expect(plan.modelStatus).toBe("selected");
      expect(plan.modelSelection.primary.provider).toBe("openai");
      expect(plan.modelSelection.primary.modelId).toBe("gpt-5.4-mini");
      expect(plan.modelSelection.credentialLocation).toBe("server-only");
      expect(plan.components.length).toBeGreaterThan(0);
      expect(plan.components.every((component) => allowedModes.includes(component.mode))).toBe(true);
      expect(plan.components.every((component) => getDashboardComponent(component.componentId).interactionMode !== "human-action")).toBe(true);
    }
  });

  it("returns stock allocation as proposal-only where dashboard actions would normally create transfers", () => {
    const plan = resolveAiDashboardPlan("What should we transfer today?");
    const proposalIds = plan.components
      .filter((component) => component.mode === "proposal-only")
      .map((component) => component.componentId);

    expect(plan.intent).toBe("stock-allocation");
    expect(proposalIds).toEqual([
      "inventory.studio_stock_needs_panel",
      "inventory.studio_transfers_panel",
      "canvas.actions",
    ]);
  });

  it("keeps component data bindings inside the plan data pack boundary", () => {
    for (const query of sampleQueries) {
      const plan = resolveAiDashboardPlan(query);

      for (const component of plan.components) {
        expect(plan.requiredDataPacks).toContain(component.dataBinding);
      }
    }
  });

  it("carries source references for audit-style answers", () => {
    const closePlan = resolveAiDashboardPlan("Can I approve closes?");
    const paymentPlan = resolveAiDashboardPlan("How are payments split?");

    expect(closePlan.explanationStyle).toBe("audit");
    expect(closePlan.sourceRefsRequired).toContain("bayaan.shift.close");
    expect(closePlan.sourceRefsRequired).toContain("bayaan.shift.close.line");
    expect(paymentPlan.sourceRefsRequired).toContain("pos.payment");
  });

  it("keeps registry entries grounded to source locations", () => {
    for (const entry of componentRegistry) {
      expect(entry.sourcePath).toMatch(/apps\//);
      expect(entry.sourceLines).toMatch(/^\d+-\d+$/);
      expect(entry.sourceRefsRequired.length).toBeGreaterThan(0);
    }
  });
});
