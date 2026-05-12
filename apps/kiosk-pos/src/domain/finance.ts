import { ingredients, kiosks, menuItems, staff, suppliers, type IngredientStock, type MenuItem } from "../data";
import { getChainMetrics, getInventoryControlRows, getKioskRows, type ChainState } from "./chain";

export type RecipeCostLine = {
  ingredient: IngredientStock;
  qty: number;
  cost: number;
};

export type RecipeCostRow = {
  item: MenuItem;
  ingredientCost: number;
  grossMargin: number;
  marginPct: number;
  status: "strong" | "watch" | "review";
  lines: RecipeCostLine[];
};

export type PurchaseRecommendation = {
  item: IngredientStock;
  supplier: string;
  currentQty: number;
  requiredQty: number;
  orderQty: number;
  estimatedCost: number;
  targetStandCount: number;
  priority: "normal" | "watch" | "critical";
};

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

export type FinancialReport = {
  period: ReportPeriod;
  multiplier: number;
  revenue: number;
  materialCost: number;
  purchaseCost: number;
  salaryExpense: number;
  operatingExpense: number;
  wasteLoss: number;
  netProfit: number;
  netMargin: number;
  bestKiosk: string;
  forecastRevenue: number;
};

export type DecisionInsight = {
  kind: "forecast" | "anomaly" | "margin" | "cash";
  title: string;
  body: string;
  confidence: number;
};

const supplierByIngredient: Record<string, string> = {
  oranges: "Baghdad Fresh",
  mango: "Dijla Fruits",
  coffee: "Roast House IQ",
  milk: "Al Safi Dairy",
  sugar: "Baghdad Fresh",
  ice: "Al Safi Dairy",
  cups: "Pack Iraq",
  straws: "Pack Iraq",
  cakeBox: "Pack Iraq",
  strawberry: "Dijla Fruits",
};

const periodMultiplier: Record<ReportPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

export function getRecipeCostRows(): RecipeCostRow[] {
  return menuItems.map((item) => {
    const lines = item.recipe.map((line) => {
      const ingredient = ingredients.find((entry) => entry.id === line.ingredientId);
      if (!ingredient) {
        throw new Error(`Missing ingredient ${line.ingredientId} for ${item.id}`);
      }
      return {
        ingredient,
        qty: line.qty,
        cost: roundMoney(ingredient.cost * line.qty),
      };
    });
    const ingredientCost = roundMoney(lines.reduce((sum, line) => sum + line.cost, 0));
    const grossMargin = roundMoney(item.price - ingredientCost);
    const marginPct = item.price ? roundQty((grossMargin / item.price) * 100) : 0;
    return {
      item,
      ingredientCost,
      grossMargin,
      marginPct,
      status: marginPct < 55 ? "review" : marginPct < 68 ? "watch" : "strong",
      lines,
    };
  });
}

export function getPurchaseRecommendations(state: ChainState, targetStandCount = 20): PurchaseRecommendation[] {
  const inventory = getInventoryControlRows(state);
  return inventory
    .map((row) => {
      const currentQty = roundQty(row.warehouseQty + row.remainingAtKiosks);
      const requiredQty = roundQty(row.opening * targetStandCount);
      const orderQty = roundQty(Math.max(0, requiredQty - currentQty));
      return {
        item: row,
        supplier: supplierByIngredient[row.id] ?? suppliers[0]?.name ?? "Default Supplier",
        currentQty,
        requiredQty,
        orderQty,
        estimatedCost: roundMoney(orderQty * row.cost),
        targetStandCount,
        priority: orderQty > row.opening * 8 ? "critical" : orderQty > 0 ? "watch" : "normal",
      } satisfies PurchaseRecommendation;
    })
    .sort((a, b) => b.estimatedCost - a.estimatedCost);
}

export function getFinancialReport(state: ChainState, period: ReportPeriod): FinancialReport {
  const metrics = getChainMetrics(state);
  const multiplier = periodMultiplier[period];
  const purchasePlan = getPurchaseRecommendations(state, 20);
  const dailyRevenue = metrics.revenueToday;
  const revenue = roundMoney(dailyRevenue * multiplier);
  const materialCost = roundMoney(dailyRevenue * 0.36 * multiplier);
  const salaryExpense = roundMoney(monthlyPayroll() / 30 * multiplier);
  const operatingExpense = roundMoney(kiosks.length * 25_000 * multiplier);
  const wasteLoss = roundMoney(metrics.wasteCost * multiplier);
  const purchaseCost = period === "daily"
    ? purchasePlan.reduce((sum, row) => sum + row.estimatedCost, 0)
    : roundMoney(purchasePlan.reduce((sum, row) => sum + row.estimatedCost, 0) * Math.min(multiplier / 7, 12));
  const netProfit = roundMoney(revenue - materialCost - salaryExpense - operatingExpense - wasteLoss);
  const bestKiosk = getKioskRows(state)[0]?.name.en ?? "No kiosk";

  return {
    period,
    multiplier,
    revenue,
    materialCost,
    purchaseCost,
    salaryExpense,
    operatingExpense,
    wasteLoss,
    netProfit,
    netMargin: revenue ? roundQty((netProfit / revenue) * 100) : 0,
    bestKiosk,
    forecastRevenue: roundMoney(revenue * 1.08),
  };
}

export function getDecisionInsights(state: ChainState): DecisionInsight[] {
  const report = getFinancialReport(state, "daily");
  const purchase20 = getPurchaseRecommendations(state, 20).filter((row) => row.orderQty > 0);
  const recipeRows = getRecipeCostRows();
  const lowMargin = recipeRows.filter((row) => row.status !== "strong").sort((a, b) => a.marginPct - b.marginPct)[0];
  const metrics = getChainMetrics(state);
  const topPurchase = purchase20[0];

  return [
    {
      kind: "forecast",
      title: topPurchase
        ? `20-stand rollout needs ${roundQty(topPurchase.orderQty)} ${topPurchase.item.unit} ${topPurchase.item.name.en}`
        : "20-stand rollout is covered by current warehouse stock",
      body: topPurchase
        ? `Expected supplier cost is ${roundMoney(topPurchase.estimatedCost).toLocaleString("en-US")} IQD from ${topPurchase.supplier}.`
        : "No immediate purchase order is needed for the 20-stand plan.",
      confidence: 89,
    },
    {
      kind: "anomaly",
      title: `${metrics.criticalKiosks + metrics.lowKiosks} kiosks need stock or loss review`,
      body: "The alert is based on expected stock after POS recipe consumption, waste entries, and kiosk reorder thresholds.",
      confidence: 86,
    },
    {
      kind: "margin",
      title: lowMargin ? `${lowMargin.item.name.en} margin needs review` : "Menu margins are healthy",
      body: lowMargin
        ? `Recipe cost is ${roundMoney(lowMargin.ingredientCost).toLocaleString("en-US")} IQD against a ${roundMoney(lowMargin.item.price).toLocaleString("en-US")} IQD price.`
        : "All recipes are above the margin watch threshold.",
      confidence: 82,
    },
    {
      kind: "cash",
      title: `Estimated daily net profit is ${roundMoney(report.netProfit).toLocaleString("en-US")} IQD`,
      body: "This uses posted sales, recipe COGS assumptions, payroll, operating expense, and waste loss. Accounting remains deterministic.",
      confidence: 78,
    },
  ];
}

export function monthlyPayroll() {
  return staff.reduce((sum, person) => sum + person.salary, 0);
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}
