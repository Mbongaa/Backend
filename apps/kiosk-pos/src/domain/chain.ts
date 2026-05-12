import { ingredients, kiosks, menuItems, type CartLine, type IngredientStock, type Kiosk } from "../data";
import {
  calculateStockSnapshot,
  type SaleRecord,
  type StockSnapshot,
  type WasteRecord,
} from "./pos";

export type StockMap = Record<string, number>;

export type KioskInventoryState = {
  allocation: StockMap;
  sales: SaleRecord[];
  waste: WasteRecord[];
  externalConsumed?: StockMap;
  externalWasted?: StockMap;
  externalWasteCost?: number;
  postedRevenue: number;
  postedOrders: number;
  postedWasteCost: number;
};

export type TransferRecord = {
  id: string;
  itemId: string;
  from: "MAIN-WAREHOUSE";
  to: string;
  qty: number;
  createdAt: string;
};

export type ChainState = {
  warehouse: StockMap;
  kiosks: Record<string, KioskInventoryState>;
  transfers: TransferRecord[];
};

export type ChainMetrics = {
  activeKiosks: number;
  revenueToday: number;
  ordersToday: number;
  avgTicket: number;
  grossProfit: number;
  profitMargin: number;
  cashOnHand: number;
  warehouseValue: number;
  allocatedValue: number;
  lowKiosks: number;
  criticalKiosks: number;
  wasteCost: number;
};

export type InventoryControlRow = IngredientStock & {
  warehouseQty: number;
  allocatedQty: number;
  consumedQty: number;
  wastedQty: number;
  remainingAtKiosks: number;
  lowKiosks: number;
  criticalKiosks: number;
  totalValue: number;
  daysCover: number;
  targetKioskId: string;
  suggestedQty: number;
  status: "ok" | "low" | "critical";
};

export type WasteActivityRow = {
  id: string;
  kioskId: string;
  kioskName: string;
  itemName: string;
  qty: number;
  unit: string;
  cost: number;
  reason: string;
  time: string;
  flagged: boolean;
};

const warehouseOpening: StockMap = {
  oranges: 620,
  mango: 260,
  coffee: 120,
  milk: 520,
  sugar: 170,
  ice: 920,
  cups: 16_000,
  straws: 16_000,
  cakeBox: 2_800,
  strawberry: 230,
};

export function createInitialChainState(): ChainState {
  const kioskState = Object.fromEntries(
    kiosks.map((kiosk, index) => [
      kiosk.id,
      {
        allocation: createInitialAllocation(index),
        sales: [],
        waste: [],
        postedRevenue: kiosk.revenue,
        postedOrders: kiosk.orders,
        postedWasteCost: Math.round(kiosk.revenue * kiosk.waste / 100),
      } satisfies KioskInventoryState,
    ]),
  );

  const warehouse = { ...warehouseOpening };
  for (const state of Object.values(kioskState)) {
    for (const ingredient of ingredients) {
      warehouse[ingredient.id] = roundQty((warehouse[ingredient.id] ?? 0) - (state.allocation[ingredient.id] ?? 0));
    }
  }

  return {
    warehouse,
    kiosks: kioskState,
    transfers: [],
  };
}

export function recordKioskSale(state: ChainState, kioskId: string, sale: SaleRecord): ChainState {
  const current = state.kiosks[kioskId];
  if (!current) return state;

  return {
    ...state,
    kiosks: {
      ...state.kiosks,
      [kioskId]: {
        ...current,
        sales: [...current.sales, sale],
      },
    },
  };
}

export function recordKioskWaste(state: ChainState, kioskId: string, waste: WasteRecord): ChainState {
  const current = state.kiosks[kioskId];
  if (!current) return state;

  return {
    ...state,
    kiosks: {
      ...state.kiosks,
      [kioskId]: {
        ...current,
        waste: [...current.waste, waste],
      },
    },
  };
}

export function transferStockToKiosk(
  state: ChainState,
  kioskId: string,
  itemId: string,
  qty: number,
  createdAt = new Date().toISOString(),
): ChainState {
  const kioskState = state.kiosks[kioskId];
  const available = state.warehouse[itemId] ?? 0;
  const postedQty = roundQty(Math.max(0, Math.min(qty, available)));

  if (!kioskState || postedQty <= 0) return state;

  return {
    ...state,
    warehouse: {
      ...state.warehouse,
      [itemId]: roundQty(available - postedQty),
    },
    kiosks: {
      ...state.kiosks,
      [kioskId]: {
        ...kioskState,
        allocation: {
          ...kioskState.allocation,
          [itemId]: roundQty((kioskState.allocation[itemId] ?? 0) + postedQty),
        },
      },
    },
    transfers: [
      {
        id: `TR-${String(state.transfers.length + 1).padStart(4, "0")}`,
        from: "MAIN-WAREHOUSE",
        to: kioskId,
        itemId,
        qty: postedQty,
        createdAt,
      },
      ...state.transfers,
    ],
  };
}

export function getKioskStock(state: ChainState, kioskId: string, extraCarts: CartLine[][] = []): StockSnapshot[] {
  const kioskState = state.kiosks[kioskId];
  const allocation = kioskState?.allocation ?? {};
  const allocatedIngredients = ingredients.map((ingredient) => ({
    ...ingredient,
    opening: allocation[ingredient.id] ?? 0,
  }));

  return calculateStockSnapshot(
    allocatedIngredients,
    [...(kioskState?.sales ?? []).map((sale) => sale.lines), ...extraCarts],
    (kioskState?.waste ?? []).map((waste) => ({ product: waste.product, qty: waste.qty })),
  ).map((stock) => {
    const externalConsumed = kioskState?.externalConsumed?.[stock.id] ?? 0;
    const externalWasted = kioskState?.externalWasted?.[stock.id] ?? 0;
    const consumed = roundQty(stock.consumed + externalConsumed);
    const wasted = roundQty(stock.wasted + externalWasted);
    const remaining = roundQty(Math.max(0, stock.opening - consumed - wasted));

    return {
      ...stock,
      consumed,
      wasted,
      remaining,
      status: remaining <= 0 ? "empty" : remaining < stock.reorderAt ? "low" : "ok",
    };
  });
}

export function getKioskRows(state: ChainState): Kiosk[] {
  return kiosks.map((kiosk) => {
    const metrics = getSingleKioskMetrics(state, kiosk.id);
    return {
      ...kiosk,
      revenue: metrics.revenue,
      orders: metrics.orders,
      margin: metrics.margin,
      waste: metrics.wastePercent,
      status: metrics.status,
      trend: [...kiosk.trend.slice(0, -1), Math.max(1, Math.round(metrics.revenue / 14_000))],
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function getChainMetrics(state: ChainState): ChainMetrics {
  const rows = getKioskRows(state);
  const revenueToday = rows.reduce((sum, kiosk) => sum + kiosk.revenue, 0);
  const ordersToday = rows.reduce((sum, kiosk) => sum + kiosk.orders, 0);
  const wasteCost = Object.values(state.kiosks).reduce(
    (sum, kiosk) => sum + kiosk.postedWasteCost + (kiosk.externalWasteCost ?? 0) + kiosk.waste.reduce((inner, waste) => inner + waste.cost, 0),
    0,
  );
  const inventoryRows = getInventoryControlRows(state);
  const warehouseValue = ingredients.reduce((sum, item) => sum + (state.warehouse[item.id] ?? 0) * item.cost, 0);
  const allocatedValue = inventoryRows.reduce((sum, row) => sum + row.remainingAtKiosks * row.cost, 0);
  const estimatedCogs = revenueToday * 0.36 + wasteCost;
  const grossProfit = Math.max(0, Math.round(revenueToday - estimatedCogs));

  return {
    activeKiosks: rows.length,
    revenueToday,
    ordersToday,
    avgTicket: ordersToday ? Math.round(revenueToday / ordersToday) : 0,
    grossProfit,
    profitMargin: revenueToday ? roundQty((grossProfit / revenueToday) * 100) : 0,
    cashOnHand: Math.round(revenueToday * 0.82),
    warehouseValue,
    allocatedValue,
    lowKiosks: rows.filter((kiosk) => kiosk.status === "watch").length,
    criticalKiosks: rows.filter((kiosk) => kiosk.status === "critical").length,
    wasteCost,
  };
}

export function getInventoryControlRows(state: ChainState): InventoryControlRow[] {
  return ingredients.map((ingredient) => {
    const kioskStocks = kiosks.map((kiosk) => getKioskStock(state, kiosk.id).find((stock) => stock.id === ingredient.id)!);
    const warehouseQty = state.warehouse[ingredient.id] ?? 0;
    const allocatedQty = kiosks.reduce((sum, kiosk) => sum + (state.kiosks[kiosk.id]?.allocation[ingredient.id] ?? 0), 0);
    const consumedQty = kioskStocks.reduce((sum, stock) => sum + stock.consumed, 0);
    const wastedQty = kioskStocks.reduce((sum, stock) => sum + stock.wasted, 0);
    const remainingAtKiosks = kioskStocks.reduce((sum, stock) => sum + stock.remaining, 0);
    const lowKiosks = kioskStocks.filter((stock) => stock.status === "low").length;
    const criticalKiosks = kioskStocks.filter((stock) => stock.status === "empty").length;
    const target = findNeediestKiosk(state, ingredient.id);
    const totalDailyUsage = consumedQty + wastedQty + ingredient.reorderAt;
    const daysCover = totalDailyUsage > 0 ? roundQty((warehouseQty + remainingAtKiosks) / totalDailyUsage) : 0;
    const status = criticalKiosks > 0 || warehouseQty < ingredient.reorderAt * 0.35
      ? "critical"
      : lowKiosks > 0 || warehouseQty < ingredient.reorderAt
        ? "low"
        : "ok";

    return {
      ...ingredient,
      warehouseQty,
      allocatedQty,
      consumedQty,
      wastedQty,
      remainingAtKiosks,
      lowKiosks,
      criticalKiosks,
      totalValue: Math.round((warehouseQty + remainingAtKiosks) * ingredient.cost),
      daysCover,
      targetKioskId: target.kioskId,
      suggestedQty: target.qty,
      status,
    };
  });
}

export function getWasteActivityRows(state: ChainState): WasteActivityRow[] {
  const rows = Object.entries(state.kiosks).flatMap(([kioskId, kioskState]) => {
    const kiosk = kiosks.find((entry) => entry.id === kioskId);
    return kioskState.waste.map((waste) => {
      const firstIngredient = waste.product.recipe[0];
      const ingredient = firstIngredient ? ingredients.find((entry) => entry.id === firstIngredient.ingredientId) : undefined;
      return {
        id: waste.id,
        kioskId,
        kioskName: kiosk ? `${kiosk.id} ${kiosk.name.en}` : kioskId,
        itemName: waste.product.name.en,
        qty: waste.qty,
        unit: ingredient?.unit ?? "pc",
        cost: waste.cost,
        reason: waste.reason,
        time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(waste.createdAt)),
        flagged: waste.cost > 10_000 || waste.qty >= 4,
      };
    });
  });

  return rows.sort((a, b) => b.id.localeCompare(a.id));
}

export function getTopItemsForKiosk(state: ChainState, kioskId: string) {
  const kioskState = state.kiosks[kioskId];
  const totals = new Map<string, { name: string; qty: number; revenue: number }>();

  for (const sale of kioskState?.sales ?? []) {
    for (const line of sale.lines) {
      const current = totals.get(line.id) ?? { name: line.name.en, qty: 0, revenue: 0 };
      totals.set(line.id, {
        name: current.name,
        qty: current.qty + line.qty,
        revenue: current.revenue + line.price * line.qty,
      });
    }
  }

  if (totals.size === 0) {
    return menuItems.slice(0, 4).map((item, index) => ({
      name: item.name.en,
      qty: [86, 74, 61, 38][index] ?? 20,
      revenue: item.price * ([86, 74, 61, 38][index] ?? 20),
    }));
  }

  return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 4);
}

function getSingleKioskMetrics(state: ChainState, kioskId: string) {
  const source = kiosks.find((kiosk) => kiosk.id === kioskId);
  const kioskState = state.kiosks[kioskId];
  const stock = getKioskStock(state, kioskId);
  const revenue = (kioskState?.postedRevenue ?? 0) + (kioskState?.sales ?? []).reduce((sum, sale) => sum + sale.total, 0);
  const orders = (kioskState?.postedOrders ?? 0) + (kioskState?.sales.length ?? 0);
  const wasteCost = (kioskState?.postedWasteCost ?? 0) + (kioskState?.waste ?? []).reduce((sum, waste) => sum + waste.cost, 0);
  const externalWasteCost = kioskState?.externalWasteCost ?? 0;
  const lowCount = stock.filter((item) => item.status === "low").length;
  const emptyCount = stock.filter((item) => item.status === "empty").length;
  const totalWasteCost = wasteCost + externalWasteCost;
  const status: Kiosk["status"] = emptyCount > 0 || totalWasteCost / Math.max(revenue, 1) > 0.055
    ? "critical"
    : lowCount > 0 || totalWasteCost / Math.max(revenue, 1) > 0.035
      ? "watch"
      : "good";
  const estimatedCogs = revenue * 0.36 + totalWasteCost;

  return {
    revenue,
    orders,
    margin: revenue ? roundQty(((revenue - estimatedCogs) / revenue) * 100) : source?.margin ?? 0,
    wastePercent: revenue ? roundQty((totalWasteCost / revenue) * 100) : source?.waste ?? 0,
    status,
  };
}

function findNeediestKiosk(state: ChainState, ingredientId: string) {
  const rows = kiosks.map((kiosk) => {
    const stock = getKioskStock(state, kiosk.id).find((item) => item.id === ingredientId);
    return {
      kioskId: kiosk.id,
      remaining: stock?.remaining ?? 0,
      reorderAt: stock?.reorderAt ?? 0,
      unit: stock?.unit ?? "pc",
    };
  });
  const neediest = rows.sort((a, b) => (a.remaining / Math.max(a.reorderAt, 1)) - (b.remaining / Math.max(b.reorderAt, 1)))[0];

  return {
    kioskId: neediest.kioskId,
    qty: suggestedTransferQty(neediest.unit),
  };
}

function createInitialAllocation(kioskIndex: number): StockMap {
  const multiplier = kioskIndex === 0 ? 1 : 0.56 + ((kioskIndex + 2) % 5) * 0.08;
  return Object.fromEntries(
    ingredients.map((ingredient) => {
      const pressure = ingredient.id === "cakeBox" && kioskIndex === 6 ? 0.18 : 1;
      return [ingredient.id, roundQty(ingredient.opening * multiplier * pressure)];
    }),
  );
}

function suggestedTransferQty(unit: string) {
  if (unit === "pc") return 250;
  if (unit === "L") return 8;
  return 10;
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}
