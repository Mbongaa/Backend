import {
  assertAiRenderable,
  getDashboardComponent,
  type AiDashboardIntent,
  type CanvasSize,
  type DashboardComponentId,
  type DataPackId,
  type InteractionMode,
  type SourceRefRequirement,
} from "./componentRegistry";
import {
  DEFAULT_AI_DASHBOARD_MODEL_SELECTION,
  type AiDashboardModelSelection,
  type AiModelStatus,
} from "./modelProvider";

export type { AiModelStatus } from "./modelProvider";

export type DashboardScope = {
  readonly kioskId?: string;
  readonly sectionId?: string;
  readonly timeRange: "today" | "week" | "month" | "custom";
};

export type ExplanationStyle = "brief" | "diagnostic" | "audit";

export type PlannedComponent = {
  readonly componentId: DashboardComponentId;
  readonly size: CanvasSize;
  readonly mode: Exclude<InteractionMode, "human-action">;
  readonly dataBinding: DataPackId;
  readonly title?: string;
};

export type AiDashboardPlan = {
  readonly intent: AiDashboardIntent;
  readonly query: string;
  readonly scope: DashboardScope;
  readonly requiredDataPacks: readonly DataPackId[];
  readonly components: readonly PlannedComponent[];
  readonly sourceRefsRequired: readonly SourceRefRequirement[];
  readonly explanationStyle: ExplanationStyle;
  readonly modelStatus: AiModelStatus;
  readonly modelSelection: AiDashboardModelSelection;
};

type PlanComponentTemplate = {
  readonly componentId: DashboardComponentId;
  readonly size: CanvasSize;
  readonly dataBinding: DataPackId;
  readonly title?: string;
};

type PlanTemplate = {
  readonly dataPacks: readonly DataPackId[];
  readonly components: readonly PlanComponentTemplate[];
  readonly explanationStyle: ExplanationStyle;
};

const planTemplates = {
  "executive-summary": {
    dataPacks: ["overview", "sales", "kiosks", "finance", "reports"],
    components: [
      { componentId: "overview.kpi_panel", size: "wide", dataBinding: "overview", title: "Today command metrics" },
      { componentId: "overview.top_performers_rank", size: "medium", dataBinding: "kiosks", title: "Top performers" },
      { componentId: "overview.alerts", size: "medium", dataBinding: "overview", title: "Signals needing attention" },
      { componentId: "overview.ai_summary", size: "wide", dataBinding: "reports", title: "Traceable summary" },
    ],
    explanationStyle: "brief",
  },
  "kiosk-diagnosis": {
    dataPacks: ["kiosks", "sales", "inventory", "closing"],
    components: [
      { componentId: "canvas.headline", size: "wide", dataBinding: "kiosks", title: "Kiosk diagnosis" },
      { componentId: "canvas.stack", size: "wide", dataBinding: "sales", title: "Variance breakdown" },
      { componentId: "canvas.hourly", size: "full", dataBinding: "sales", title: "Hourly pattern" },
      { componentId: "inventory.studio_stock_needs_panel", size: "medium", dataBinding: "inventory", title: "Stock proof" },
    ],
    explanationStyle: "diagnostic",
  },
  "waste-anomaly-review": {
    dataPacks: ["waste", "closing", "sales"],
    components: [
      { componentId: "canvas.wastegrid", size: "wide", dataBinding: "waste", title: "Waste heatmap" },
      { componentId: "waste.reason_bar_chart", size: "wide", dataBinding: "waste", title: "Reason control" },
      { componentId: "waste.entries_flag_table", size: "full", dataBinding: "waste", title: "Flagged entries" },
      { componentId: "canvas.actions", size: "medium", dataBinding: "waste", title: "Recommended next steps" },
    ],
    explanationStyle: "diagnostic",
  },
  "stock-allocation": {
    dataPacks: ["inventory", "warehouses", "items"],
    components: [
      { componentId: "inventory.studio_health_donut", size: "medium", dataBinding: "inventory", title: "Inventory health" },
      { componentId: "inventory.studio_stock_needs_panel", size: "wide", dataBinding: "inventory", title: "Kiosk live stock needs" },
      { componentId: "inventory.studio_transfers_panel", size: "wide", dataBinding: "inventory", title: "Transfer queue" },
      { componentId: "canvas.actions", size: "medium", dataBinding: "inventory", title: "Proposal only" },
    ],
    explanationStyle: "diagnostic",
  },
  "close-review": {
    dataPacks: ["closing", "waste", "inventory", "products", "staff"],
    components: [
      { componentId: "closing.today_closes_table", size: "full", dataBinding: "closing", title: "Closes needing review" },
      { componentId: "closing.variance_inputs_expanded", size: "full", dataBinding: "closing", title: "Variance inputs" },
      { componentId: "closing.recipe_posting_review", size: "wide", dataBinding: "products", title: "Recipe posting blockers" },
      { componentId: "staff.cashier_performance_table", size: "wide", dataBinding: "staff", title: "Cashier overlap" },
    ],
    explanationStyle: "audit",
  },
  "recipe-margin-review": {
    dataPacks: ["products", "suppliers", "sales", "finance"],
    components: [
      { componentId: "products.recipe_margin_table", size: "full", dataBinding: "products", title: "Recipe margin proof" },
      { componentId: "suppliers.item_catalog_table", size: "wide", dataBinding: "suppliers", title: "Supplier cost driver" },
      { componentId: "canvas.bars", size: "medium", dataBinding: "sales", title: "Trend comparison" },
      { componentId: "reports.pnl_table", size: "wide", dataBinding: "finance", title: "P&L impact" },
    ],
    explanationStyle: "diagnostic",
  },
  "payment-reconciliation": {
    dataPacks: ["sales", "finance", "reports"],
    components: [
      { componentId: "sales.payment_split", size: "medium", dataBinding: "sales", title: "Payment split" },
      { componentId: "reports.payment_methods_table", size: "medium", dataBinding: "reports", title: "Payment methods" },
      { componentId: "reports.gateway_settlement_table", size: "wide", dataBinding: "finance", title: "Gateway settlement" },
      { componentId: "sales.live_orders_table", size: "full", dataBinding: "sales", title: "Order-level proof" },
    ],
    explanationStyle: "audit",
  },
  "staff-coaching": {
    dataPacks: ["staff", "closing", "sales"],
    components: [
      { componentId: "staff.cashier_performance_table", size: "full", dataBinding: "staff", title: "Cashier performance" },
      { componentId: "closing.today_closes_table", size: "wide", dataBinding: "closing", title: "Close variance overlap" },
      { componentId: "canvas.rank", size: "medium", dataBinding: "staff", title: "Peer comparison" },
    ],
    explanationStyle: "diagnostic",
  },
  "warehouse-topology": {
    dataPacks: ["warehouses", "inventory"],
    components: [
      { componentId: "warehouses.realtime_card", size: "wide", dataBinding: "warehouses", title: "Stock source cards" },
      { componentId: "warehouses.topology_table", size: "full", dataBinding: "warehouses", title: "Topology table" },
      { componentId: "inventory.studio_transfers_panel", size: "wide", dataBinding: "inventory", title: "Transfer queue" },
    ],
    explanationStyle: "audit",
  },
  "catalog-lookup": {
    dataPacks: ["items", "products", "inventory"],
    components: [
      { componentId: "items.catalog_table", size: "full", dataBinding: "items", title: "Stock item catalog" },
      { componentId: "products.product_list_table", size: "full", dataBinding: "products", title: "Menu product catalog" },
      { componentId: "inventory.studio_ledger_table", size: "wide", dataBinding: "inventory", title: "Inventory ledger" },
    ],
    explanationStyle: "brief",
  },
} as const satisfies Record<AiDashboardIntent, PlanTemplate>;

export function inferAiDashboardIntent(query: string): AiDashboardIntent {
  const text = normalizeQuery(query);

  if (matchesAny(text, ["close", "closing", "variance", "approve", "approval", "counted", "expected", "drawer", "إغلاق", "اغلاق", "فرق", "فروقات", "اعتماد", "معدود", "متوقع", "درج"])) {
    return "close-review";
  }

  if (matchesAny(text, ["waste", "loss", "spoil", "spoiled", "anomaly", "anomalies", "tossed", "هدر", "خسارة", "شذوذ", "تالف"])) {
    return "waste-anomaly-review";
  }

  if (matchesAny(text, ["catalog", "uom", "ingredient", "ingredients", "menu", "كتالوج", "صنف", "أصناف", "مكون", "مكونات", "قائمة"])) {
    return "catalog-lookup";
  }

  if (matchesAny(text, ["transfer", "allocate", "allocation", "stock", "inventory", "reorder", "runout", "cover", "تحويل", "مخزون", "إرسال", "ارسال", "أرسل", "ارسل", "نرسل", "تزويد", "نفاد", "تغطية"])) {
    return "stock-allocation";
  }

  if (matchesAny(text, ["recipe", "margin", "product", "profitability", "pistachio", "price", "supplier cost", "وصفة", "هامش", "منتج", "ربحية", "فستق", "سعر", "تكلفة المورد"])) {
    return "recipe-margin-review";
  }

  if (matchesAny(text, ["cashier", "staff", "employee", "coach", "training", "payroll", "shortage", "كاشير", "موظف", "موظفين", "تدريب", "رواتب", "عجز"])) {
    return "staff-coaching";
  }

  if (matchesAny(text, ["payment", "cash", "card", "online", "electronic", "e-payment", "epayment", "gateway", "settlement", "fib", "zain", "qi", "wallet", "دفع", "مدفوعات", "نقد", "بطاقة", "بوابة", "تسوية", "محفظة", "زين"])) {
    return "payment-reconciliation";
  }

  if (matchesAny(text, ["warehouse", "topology", "location", "source", "reserved", "مستودع", "موقع", "مصدر", "محجوز", "هيكل"])) {
    return "warehouse-topology";
  }

  if (matchesAny(text, ["kiosk", "zayouna", "mansour", "karrada", "majidi", "behind", "underperform", "why", "كشك", "زيونة", "زايونة", "منصور", "كرادة", "مجيدي", "متأخر", "متاخر", "لماذا", "ليش"])) {
    return "kiosk-diagnosis";
  }

  return "executive-summary";
}

export function resolveAiDashboardPlan(
  query: string,
  modelSelection: AiDashboardModelSelection = DEFAULT_AI_DASHBOARD_MODEL_SELECTION,
): AiDashboardPlan {
  const intent = inferAiDashboardIntent(query);
  const template = planTemplates[intent];
  const componentIds = template.components.map((component) => component.componentId);
  assertAiRenderable(componentIds);

  const components = template.components.map((component): PlannedComponent => {
    const registryEntry = getDashboardComponent(component.componentId);
    if (registryEntry.interactionMode === "human-action") {
      throw new Error(`AI plan cannot render human-action component: ${component.componentId}`);
    }

    const mode = registryEntry.interactionMode;
    return {
      ...component,
      mode,
    };
  });

  return {
    intent,
    query,
    scope: {
      kioskId: extractKioskId(query),
      timeRange: inferTimeRange(query),
    },
    requiredDataPacks: unique(template.dataPacks),
    components,
    sourceRefsRequired: sourceRefsForComponents(componentIds),
    explanationStyle: template.explanationStyle,
    modelStatus: modelSelection.status,
    modelSelection,
  };
}

export function sourceRefsForComponents(componentIds: readonly DashboardComponentId[]): SourceRefRequirement[] {
  return unique(componentIds.flatMap((id) => getDashboardComponent(id).sourceRefsRequired));
}

function normalizeQuery(query: string) {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function inferTimeRange(query: string): DashboardScope["timeRange"] {
  const text = normalizeQuery(query);
  if (matchesAny(text, ["month", "monthly", "april", "شهر", "شهري", "أبريل", "ابريل"])) return "month";
  if (matchesAny(text, ["week", "weekly", "7 day", "7-day", "أسبوع", "اسبوع", "أسبوعي", "اسبوعي"])) return "week";
  return "today";
}

function extractKioskId(query: string) {
  const match = query.match(/\bK-?\d{1,3}\b/i);
  return match?.[0].toUpperCase().replace(/^K(\d)/, "K-$1");
}
