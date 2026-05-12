import { describe, expect, it } from "vitest";
import { ingredients, menuItems, type CartLine } from "../data";
import {
  buildBayaanSalePayload,
  calculateCartTotals,
  calculateStockSnapshot,
  cartConsumption,
  canFulfillRecipe,
  createSaleRecord,
  createWasteRecord,
  getRecipeShortages,
  shiftSummary,
} from "./pos";

const orange = menuItems.find((item) => item.id === "orange")!;
const latte = menuItems.find((item) => item.id === "latte")!;

const cart: CartLine[] = [
  {
    key: "orange:M",
    id: orange.id,
    name: orange.name,
    size: "M",
    price: orange.price,
    qty: 2,
    recipe: orange.recipe,
  },
  {
    key: "latte:M",
    id: latte.id,
    name: latte.name,
    size: "M",
    price: latte.price,
    qty: 1,
    recipe: latte.recipe,
  },
];

describe("POS domain", () => {
  it("calculates cart totals without inventing tax", () => {
    expect(calculateCartTotals(cart)).toEqual({
      subtotal: 15_000,
      tax: 0,
      total: 15_000,
    });
  });

  it("deducts recipe ingredients from sold items", () => {
    const consumed = cartConsumption(cart);
    expect(consumed.get("oranges")).toBe(0.7);
    expect(consumed.get("coffee")).toBe(0.019);
    expect(consumed.get("milk")).toBe(0.22);
    expect(consumed.get("cups")).toBe(3);
  });

  it("combines sold consumption and waste into stock snapshot", () => {
    const waste = createWasteRecord({ id: "W-1", product: orange, qty: 1, reason: "Spill", createdAt: "2026-05-09T08:00:00Z" });
    const snapshot = calculateStockSnapshot(ingredients, [cart], [waste]);
    const oranges = snapshot.find((item) => item.id === "oranges")!;
    expect(oranges.consumed).toBe(0.7);
    expect(oranges.wasted).toBe(0.35);
    expect(oranges.remaining).toBe(40.95);
  });

  it("blocks recipes that cannot be fulfilled from remaining kiosk stock", () => {
    const lowStock = calculateStockSnapshot(
      [{ ...ingredients.find((item) => item.id === "oranges")!, opening: 0.2 }],
      [],
    );

    expect(canFulfillRecipe(orange.recipe, lowStock)).toBe(false);
    expect(getRecipeShortages(orange.recipe, lowStock)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: "oranges", required: 0.35, available: 0.2, shortage: 0.15 }),
      ]),
    );
  });

  it("summarizes a shift for closing cash and waste review", () => {
    const sale = createSaleRecord({
      id: "S-1",
      lines: cart,
      tender: { method: "cash", received: 20_000 },
      createdAt: "2026-05-09T08:00:00Z",
    });
    const waste = createWasteRecord({ id: "W-1", product: orange, qty: 1, reason: "Spill", createdAt: "2026-05-09T08:05:00Z" });
    expect(shiftSummary({ id: "SHIFT-1", openedAt: "2026-05-09T07:00:00Z", openingCash: 500_000, sales: [sale], waste: [waste] })).toEqual({
      orderCount: 1,
      salesTotal: 15_000,
      cashExpected: 515_000,
      wasteCost: 5_000,
      avgTicket: 15_000,
    });
  });

  it("builds the Bayaan/Odoo sale payload with expected consumption", () => {
    const sale = createSaleRecord({
      id: "S-1",
      lines: cart,
      tender: { method: "cash", received: 20_000 },
      createdAt: "2026-05-09T08:00:00Z",
    });
    expect(buildBayaanSalePayload(sale, "K-01")).toMatchObject({
      external_id: "S-1",
      kiosk: "K-01",
      posting_date: "2026-05-09",
      payments: [{ method: "cash", amount: 15_000 }],
      expected_consumption: expect.arrayContaining([
        { ingredient: "oranges", qty: 0.7 },
        { ingredient: "cups", qty: 3 },
      ]),
    });
  });
});
