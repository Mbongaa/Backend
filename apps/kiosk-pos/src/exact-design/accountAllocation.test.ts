import { describe, expect, it } from "vitest";
import { buildAccountAllocationRows } from "./accountAllocation";

function rowAmount(rows: ReturnType<typeof buildAccountAllocationRows>, key: string) {
  return rows.find((row) => row.key === key)?.amount;
}

describe("account allocation rows", () => {
  it("does not reserve favorable variance as a cost", () => {
    const rows = buildAccountAllocationRows({
      cash: 1_000,
      digital: 500,
      netProfitAfterPayroll: 300,
      cogs: 200,
      payroll: 100,
      waste: 20,
      varianceImpact: 75,
    });

    expect(rowAmount(rows, "main")).toBe(1_500);
    expect(rowAmount(rows, "savings")).toBe(300);
    expect(rowAmount(rows, "investment")).toBe(200);
    expect(rowAmount(rows, "reserve")).toBe(120);
    expect(rows.some((row) => row.key === "shortfall")).toBe(false);
  });

  it("reserves unfavorable variance and exposes operating loss shortfall", () => {
    const rows = buildAccountAllocationRows({
      cash: 1_000,
      digital: 500,
      netProfitAfterPayroll: -90,
      cogs: 200,
      payroll: 100,
      waste: 20,
      varianceImpact: -75,
    });

    expect(rowAmount(rows, "savings")).toBe(0);
    expect(rowAmount(rows, "reserve")).toBe(195);
    expect(rowAmount(rows, "shortfall")).toBe(90);
  });
});
