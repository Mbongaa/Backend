import { describe, expect, it } from "vitest";
import { menuItems, productModifierBindings } from "../data";
import {
  buildVariantSignature,
  computePriceDelta,
  computeRecipeFactor,
  defaultSelection,
  resolveModifierGroups,
  scaledRecipe,
  selectionIsComplete,
  summarizeSelection,
} from "./modifiers";

const latte = menuItems.find((m) => m.id === "latte")!;
const orange = menuItems.find((m) => m.id === "orange")!;
const cake = menuItems.find((m) => m.id === "pistachio-cake")!;

describe("modifiers: resolveModifierGroups", () => {
  it("returns coffee groups for coffee items", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain("temp");
    expect(ids).toContain("size");
    expect(ids).toContain("milk");
    expect(ids).toContain("extras");
  });
  it("returns juice groups for juice items", () => {
    const groups = resolveModifierGroups(orange, productModifierBindings);
    expect(groups.map((g) => g.id)).toEqual(["size", "sweetness"]);
  });
  it("returns no groups for cake items", () => {
    const groups = resolveModifierGroups(cake, productModifierBindings);
    expect(groups).toEqual([]);
  });
});

describe("modifiers: defaultSelection + selectionIsComplete", () => {
  it("picks defaults for required single-select groups", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const sel = defaultSelection(groups);
    expect(sel.temp).toEqual(["hot"]);
    expect(sel.size).toEqual(["medium"]);
    expect(sel.milk).toEqual(["whole"]);
    expect(sel.extras).toEqual([]);
    expect(selectionIsComplete(groups, sel)).toBe(true);
  });
  it("flags incomplete when a required group is empty", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const sel = defaultSelection(groups);
    sel.size = [];
    expect(selectionIsComplete(groups, sel)).toBe(false);
  });
});

describe("modifiers: price + recipe scaling", () => {
  it("adds price delta from each picked value", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const sel = defaultSelection(groups);
    expect(computePriceDelta(groups, sel)).toBe(0); // hot+medium+whole = base
    sel.size = ["large"];
    sel.milk = ["almond"];
    sel.extras = ["extra-shot"];
    expect(computePriceDelta(groups, sel)).toBe(1000 + 1000 + 800);
  });
  it("multiplies recipe factor across single-select dimensions", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const sel = defaultSelection(groups);
    sel.size = ["large"];
    expect(computeRecipeFactor(groups, sel)).toBeCloseTo(1.25, 6);
    sel.size = ["small"];
    expect(computeRecipeFactor(groups, sel)).toBeCloseTo(0.8, 6);
  });
  it("scaledRecipe scales each ingredient line by the same factor", () => {
    const scaled = scaledRecipe(latte.recipe, 1.25);
    expect(scaled).toEqual([
      { ingredientId: "coffee", qty: 0.02375 },
      { ingredientId: "milk", qty: 0.275 },
      { ingredientId: "cups", qty: 1.25 },
    ]);
  });
});

describe("modifiers: variant signature", () => {
  it("is deterministic regardless of selection order", () => {
    const a = buildVariantSignature({ size: ["large"], temp: ["iced"], extras: ["extra-shot", "decaf"] });
    const b = buildVariantSignature({ extras: ["decaf", "extra-shot"], temp: ["iced"], size: ["large"] });
    expect(a).toBe(b);
  });
  it("omits empty groups", () => {
    const sig = buildVariantSignature({ size: ["medium"], milk: [], temp: ["hot"] });
    expect(sig).toBe("size:medium|temp:hot");
  });
});

describe("modifiers: summarizeSelection", () => {
  it("returns a human label in the requested language", () => {
    const groups = resolveModifierGroups(latte, productModifierBindings);
    const sel = defaultSelection(groups);
    sel.size = ["large"];
    sel.milk = ["almond"];
    sel.extras = ["extra-shot"];
    expect(summarizeSelection(groups, sel, "en")).toContain("Large");
    expect(summarizeSelection(groups, sel, "en")).toContain("Almond");
    expect(summarizeSelection(groups, sel, "ar")).toContain("كبير");
  });
});
