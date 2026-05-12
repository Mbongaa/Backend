import { ingredients, kiosks } from "../data";
import type { ChainState, KioskInventoryState, StockMap } from "../domain/chain";

type OdooStockRow = {
  item?: string;
  item_code?: string;
  ingredient?: string;
  actual_qty?: number;
  qty?: number;
};

type OdooKioskRow = {
  name?: string;
  kiosk_code?: string;
  kiosk_name?: string;
  warehouse?: string;
};

type OdooSalesRow = {
  kiosk?: string;
  revenue?: number;
  orders?: number;
};

type OdooConsumptionRow = {
  kiosk?: string;
  ingredient?: string;
  item?: string;
  item_code?: string;
  qty?: number;
};

type OdooWasteRow = OdooConsumptionRow & {
  estimated_cost?: number;
};

type ChainBootstrapSnapshot = {
  kiosks?: OdooKioskRow[];
  warehouse_stock?: OdooStockRow[];
  kiosk_stock?: Record<string, OdooStockRow[]>;
  today?: {
    sales?: OdooSalesRow[];
    consumption?: OdooConsumptionRow[];
    waste?: OdooWasteRow[];
  };
};

const ingredientAliases = new Map(
  ingredients.flatMap((ingredient) => [
    [normalizeKey(ingredient.id), ingredient.id],
    [normalizeKey(ingredient.name.en), ingredient.id],
  ]),
);

const localKioskAliases = new Map(
  kiosks.flatMap((kiosk) => [
    [normalizeKey(kiosk.id), kiosk.id],
    [normalizeKey(kiosk.name.en), kiosk.id],
  ]),
);

export function applyChainBootstrapSnapshot(current: ChainState, payload: unknown): ChainState {
  const snapshot = unwrapOdooMessage(payload);
  if (!isBootstrapSnapshot(snapshot)) return current;

  const kioskAliases = buildKioskAliases(snapshot.kiosks ?? []);
  const salesByKiosk = groupSales(snapshot.today?.sales ?? [], kioskAliases);
  const consumedByKiosk = groupQuantities(snapshot.today?.consumption ?? [], kioskAliases);
  const wastedByKiosk = groupWaste(snapshot.today?.waste ?? [], kioskAliases);
  const warehouse = toStockMap(snapshot.warehouse_stock ?? currentStockRows(current.warehouse));

  return {
    ...current,
    warehouse: {
      ...current.warehouse,
      ...warehouse,
    },
    kiosks: Object.fromEntries(
      kiosks.map((kiosk) => {
        const currentKiosk = current.kiosks[kiosk.id];
        const actualStock = toStockMap(findKioskStockRows(snapshot, kiosk.id, kioskAliases));
        const externalConsumed = consumedByKiosk[kiosk.id] ?? {};
        const externalWasted = wastedByKiosk[kiosk.id]?.qty ?? {};
        const sales = salesByKiosk[kiosk.id];
        const nextKiosk: KioskInventoryState = {
          ...currentKiosk,
          allocation: openingAllocationFromSnapshot(actualStock, externalConsumed, externalWasted, currentKiosk?.allocation ?? {}),
          sales: currentKiosk?.sales ?? [],
          waste: currentKiosk?.waste ?? [],
          externalConsumed,
          externalWasted,
          externalWasteCost: wastedByKiosk[kiosk.id]?.cost ?? 0,
          postedRevenue: sales?.revenue ?? currentKiosk?.postedRevenue ?? 0,
          postedOrders: sales?.orders ?? currentKiosk?.postedOrders ?? 0,
          postedWasteCost: 0,
        };
        return [kiosk.id, nextKiosk];
      }),
    ),
  };
}

function unwrapOdooMessage(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const body = payload as { message?: unknown; data?: unknown };
  return body.message ?? body.data ?? payload;
}

function isBootstrapSnapshot(value: unknown): value is ChainBootstrapSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as ChainBootstrapSnapshot;
  return Boolean(candidate.warehouse_stock || candidate.kiosk_stock || candidate.today || candidate.kiosks);
}

function buildKioskAliases(rows: OdooKioskRow[]) {
  const aliases = new Map(localKioskAliases);
  rows.forEach((row, index) => {
    const fallback = kiosks[index]?.id;
    const kioskId = resolveKioskId(row.kiosk_code) ?? fallback;
    if (!kioskId) return;
    [row.name, row.kiosk_code, row.kiosk_name, row.warehouse].forEach((value) => {
      if (value) aliases.set(normalizeKey(value), kioskId);
    });
  });
  return aliases;
}

function groupSales(rows: OdooSalesRow[], aliases: Map<string, string>) {
  const grouped: Record<string, { revenue: number; orders: number }> = {};
  for (const row of rows) {
    const kioskId = resolveKioskId(row.kiosk, aliases);
    if (!kioskId) continue;
    const current = grouped[kioskId] ?? { revenue: 0, orders: 0 };
    grouped[kioskId] = {
      revenue: current.revenue + Number(row.revenue ?? 0),
      orders: current.orders + Number(row.orders ?? 0),
    };
  }
  return grouped;
}

function groupQuantities(rows: OdooConsumptionRow[], aliases: Map<string, string>) {
  const grouped: Record<string, StockMap> = {};
  for (const row of rows) {
    const kioskId = resolveKioskId(row.kiosk, aliases);
    const ingredientId = resolveIngredientId(row.ingredient ?? row.item ?? row.item_code);
    const qty = Number(row.qty ?? 0);
    if (!kioskId || !ingredientId || qty <= 0) continue;
    grouped[kioskId] = grouped[kioskId] ?? {};
    grouped[kioskId][ingredientId] = roundQty((grouped[kioskId][ingredientId] ?? 0) + qty);
  }
  return grouped;
}

function groupWaste(rows: OdooWasteRow[], aliases: Map<string, string>) {
  const grouped: Record<string, { qty: StockMap; cost: number }> = {};
  for (const row of rows) {
    const kioskId = resolveKioskId(row.kiosk, aliases);
    const ingredientId = resolveIngredientId(row.ingredient ?? row.item ?? row.item_code);
    if (!kioskId) continue;
    grouped[kioskId] = grouped[kioskId] ?? { qty: {}, cost: 0 };
    grouped[kioskId].cost += Number(row.estimated_cost ?? 0);
    if (!ingredientId) continue;
    grouped[kioskId].qty[ingredientId] = roundQty((grouped[kioskId].qty[ingredientId] ?? 0) + Number(row.qty ?? 0));
  }
  return grouped;
}

function findKioskStockRows(snapshot: ChainBootstrapSnapshot, kioskId: string, aliases: Map<string, string>) {
  const kioskStock = snapshot.kiosk_stock ?? {};
  for (const [key, rows] of Object.entries(kioskStock)) {
    if (resolveKioskId(key, aliases) === kioskId) return rows;
  }
  return [];
}

function toStockMap(rows: OdooStockRow[]) {
  const stock: StockMap = {};
  for (const row of rows) {
    const ingredientId = resolveIngredientId(row.item ?? row.item_code ?? row.ingredient);
    if (!ingredientId) continue;
    stock[ingredientId] = roundQty(Number(row.actual_qty ?? row.qty ?? 0));
  }
  return stock;
}

function openingAllocationFromSnapshot(actual: StockMap, consumed: StockMap, wasted: StockMap, fallback: StockMap) {
  const hasActual = Object.keys(actual).length > 0;
  return Object.fromEntries(
    ingredients.map((ingredient) => {
      const actualQty = hasActual ? actual[ingredient.id] ?? 0 : fallback[ingredient.id] ?? 0;
      return [
        ingredient.id,
        roundQty(actualQty + (consumed[ingredient.id] ?? 0) + (wasted[ingredient.id] ?? 0)),
      ];
    }),
  );
}

function currentStockRows(stock: StockMap): OdooStockRow[] {
  return Object.entries(stock).map(([item, actual_qty]) => ({ item, actual_qty }));
}

function resolveKioskId(value?: string, aliases = localKioskAliases) {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  return aliases.get(normalized) ?? kiosks.find((kiosk) => normalized.includes(normalizeKey(kiosk.id)))?.id;
}

function resolveIngredientId(value?: string) {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  return ingredientAliases.get(normalized) ?? ingredients.find((ingredient) => normalized.includes(normalizeKey(ingredient.id)))?.id;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}
