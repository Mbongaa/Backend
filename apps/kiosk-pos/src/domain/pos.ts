import type { CartLine, IngredientStock, MenuItem, RecipeLine } from "../data";

export type ConsumptionLine = {
  ingredientId: string;
  qty: number;
};

export type StockSnapshot = IngredientStock & {
  consumed: number;
  wasted: number;
  remaining: number;
  status: "ok" | "low" | "empty";
};

export type StockShortage = {
  ingredientId: string;
  required: number;
  available: number;
  shortage: number;
};

export type WasteLine = {
  product: MenuItem;
  qty: number;
};

export type TenderMethod = "cash" | "card" | "wallet";

export type Tender = {
  method: TenderMethod;
  received?: number;
};

export type SaleRecord = {
  id: string;
  lines: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  tender: Tender;
  createdAt: string;
};

export type WasteRecord = {
  id: string;
  product: MenuItem;
  qty: number;
  reason: string;
  cost: number;
  createdAt: string;
};

export type ShiftState = {
  id: string;
  openedAt: string;
  openingCash: number;
  sales: SaleRecord[];
  waste: WasteRecord[];
};

export const TAX_RATE = 0;

export function calculateCartTotals(lines: CartLine[], taxRate = TAX_RATE) {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  return {
    subtotal,
    tax,
    total: subtotal + tax,
  };
}

export function mergeConsumption(lines: ConsumptionLine[]) {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.ingredientId, roundQty((merged.get(line.ingredientId) ?? 0) + line.qty));
  }
  return merged;
}

export function recipeConsumption(recipe: RecipeLine[], multiplier = 1) {
  return recipe.map((line) => ({
    ingredientId: line.ingredientId,
    qty: roundQty(line.qty * multiplier),
  }));
}

export function cartConsumption(lines: CartLine[]) {
  return mergeConsumption(lines.flatMap((line) => recipeConsumption(line.recipe, line.qty)));
}

export function wasteConsumption(lines: WasteLine[]) {
  return mergeConsumption(lines.flatMap((line) => recipeConsumption(line.product.recipe, line.qty)));
}

export function calculateStockSnapshot(
  ingredients: IngredientStock[],
  carts: CartLine[][],
  wasteLines: WasteLine[] = [],
): StockSnapshot[] {
  const consumed = mergeConsumption(carts.flatMap((cart) => Array.from(cartConsumption(cart), ([ingredientId, qty]) => ({ ingredientId, qty }))));
  const wasted = wasteConsumption(wasteLines);

  return ingredients.map((ingredient) => {
    const consumedQty = consumed.get(ingredient.id) ?? 0;
    const wastedQty = wasted.get(ingredient.id) ?? 0;
    const remaining = roundQty(Math.max(0, ingredient.opening - consumedQty - wastedQty));
    return {
      ...ingredient,
      consumed: consumedQty,
      wasted: wastedQty,
      remaining,
      status: remaining <= 0 ? "empty" : remaining < ingredient.reorderAt ? "low" : "ok",
    };
  });
}

export function getRecipeShortages(
  recipe: RecipeLine[],
  stock: Array<Pick<StockSnapshot, "id" | "remaining">>,
  multiplier = 1,
): StockShortage[] {
  const availableByIngredient = new Map(stock.map((item) => [item.id, item.remaining]));
  return recipeConsumption(recipe, multiplier).flatMap((line) => {
    const available = availableByIngredient.get(line.ingredientId) ?? 0;
    const shortage = roundQty(line.qty - available);
    return shortage > 0
      ? [{
          ingredientId: line.ingredientId,
          required: line.qty,
          available,
          shortage,
        }]
      : [];
  });
}

export function canFulfillRecipe(
  recipe: RecipeLine[],
  stock: Array<Pick<StockSnapshot, "id" | "remaining">>,
  multiplier = 1,
) {
  return getRecipeShortages(recipe, stock, multiplier).length === 0;
}

export function createSaleRecord(params: {
  id: string;
  lines: CartLine[];
  tender: Tender;
  createdAt?: string;
}) {
  const totals = calculateCartTotals(params.lines);
  return {
    id: params.id,
    lines: structuredClone(params.lines),
    tender: params.tender,
    createdAt: params.createdAt ?? new Date().toISOString(),
    ...totals,
  } satisfies SaleRecord;
}

export function createWasteRecord(params: {
  id: string;
  product: MenuItem;
  qty: number;
  reason: string;
  createdAt?: string;
}) {
  return {
    id: params.id,
    product: params.product,
    qty: params.qty,
    reason: params.reason,
    cost: params.product.price * params.qty,
    createdAt: params.createdAt ?? new Date().toISOString(),
  } satisfies WasteRecord;
}

export function shiftSummary(shift: ShiftState) {
  const salesTotal = shift.sales.reduce((sum, sale) => sum + sale.total, 0);
  const cashSales = shift.sales
    .filter((sale) => sale.tender.method === "cash")
    .reduce((sum, sale) => sum + sale.total, 0);
  const wasteCost = shift.waste.reduce((sum, waste) => sum + waste.cost, 0);
  const orderCount = shift.sales.length;
  return {
    orderCount,
    salesTotal,
    cashExpected: shift.openingCash + cashSales,
    wasteCost,
    avgTicket: orderCount ? Math.round(salesTotal / orderCount) : 0,
  };
}

export function buildBayaanSalePayload(sale: SaleRecord, kioskId: string) {
  return {
    external_id: sale.id,
    kiosk: kioskId,
    posting_date: sale.createdAt.slice(0, 10),
    items: sale.lines.map((line) => ({
      product: line.id,
      name: line.name.en,
      qty: line.qty,
      price_unit: line.price,
    })),
    payments: [
      {
        method: sale.tender.method,
        amount: sale.total,
      },
    ],
    expected_consumption: Array.from(cartConsumption(sale.lines), ([ingredientId, qty]) => ({
      ingredient: ingredientId,
      qty,
    })),
  };
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}
