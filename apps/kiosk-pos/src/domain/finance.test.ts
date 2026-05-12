import { describe, expect, it } from "vitest";
import { createInitialChainState } from "./chain";
import {
  getDecisionInsights,
  getFinancialReport,
  getPurchaseRecommendations,
  getRecipeCostRows,
  monthlyPayroll,
} from "./finance";

describe("finance and costing domain", () => {
  it("calculates deterministic product cost and margin from recipe ingredients", () => {
    const latte = getRecipeCostRows().find((row) => row.item.id === "latte")!;

    expect(latte.ingredientCost).toBe(712);
    expect(latte.grossMargin).toBe(4288);
    expect(latte.marginPct).toBe(85.76);
  });

  it("forecasts purchase quantities for the 20-stand rollout", () => {
    const recommendations = getPurchaseRecommendations(createInitialChainState(), 20);
    const oranges = recommendations.find((row) => row.item.id === "oranges")!;

    expect(oranges.requiredQty).toBe(840);
    expect(oranges.orderQty).toBeGreaterThan(0);
    expect(oranges.estimatedCost).toBe(oranges.orderQty * 1900);
  });

  it("builds a financial report with payroll, materials, and operating expenses", () => {
    const report = getFinancialReport(createInitialChainState(), "weekly");

    expect(report.multiplier).toBe(7);
    expect(report.revenue).toBeGreaterThan(0);
    expect(report.salaryExpense).toBe(Math.round((monthlyPayroll() / 30) * 7));
    expect(report.netProfit).toBeLessThan(report.revenue);
  });

  it("produces decision insights from deterministic reports", () => {
    const insights = getDecisionInsights(createInitialChainState());

    expect(insights).toHaveLength(4);
    expect(insights.map((insight) => insight.kind)).toEqual(["forecast", "anomaly", "margin", "cash"]);
  });
});
