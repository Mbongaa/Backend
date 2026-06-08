import type { StockSnapshot } from "../domain/pos";
import {
  buildBayaanSalePayload,
  type SaleRecord,
  type ShiftState,
  type WasteRecord,
} from "../domain/pos";
import { OdooClient } from "../lib/odoo";
import {
  subscribeBayaanRealtime,
  type BayaanRealtimeEvent,
  type BayaanRealtimeOptions,
  type BayaanRealtimeSubscription,
  type BayaanRealtimeTransport,
} from "./realtime";
import { buildSimulationTransferSuggestions, createPeakSimulation } from "../simulation/peakSimulation";

export type ShiftCloseDraft = {
  actualCash: number;
  actualCard?: number;
  stockCounts: Array<{
    item: string;
    uom: string;
    expected_qty: number;
    actual_qty: number;
  }>;
  ingredientCounts?: Array<{
    ingredient: string;
    actual_qty: number;
  }>;
};

export type ShiftClosePayload = {
  kioskId: string;
  cashier: string;
  shift: ShiftState;
  stock: StockSnapshot[];
  draft: ShiftCloseDraft;
};

export type StockTransferPayload = {
  kioskId: string;
  fromWarehouse?: string;
  items?: Array<{
    itemId: string;
    qty: number;
    uom?: string;
  }>;
  itemId?: string;
  qty?: number;
  uom?: string;
};

export type StockTransferActionPayload = {
  transfer: string | number;
  action: "approve" | "pick" | "dispatch" | "receive" | "cancel";
  items?: Array<{
    itemId: string;
    qty: number;
  }>;
};

// A cashier's low-stock request to the warehouse (creates a draft transfer to approve).
export type StockRequestPayload = {
  kioskId: string;
  items: Array<{
    itemId: string;
    qty: number;
    uom?: string;
  }>;
  note?: string;
};

function stockTransferPayloadLines(payload: StockTransferPayload) {
  return (payload.items?.length
    ? payload.items
    : [{ itemId: payload.itemId || "", qty: Number(payload.qty || 0), uom: payload.uom }]
  ).map((line) => ({
    itemId: String(line.itemId || ""),
    qty: Number(line.qty || 0),
    uom: line.uom,
  }));
}

export type PurchaseOrderPayload = {
  supplier: string;
  warehouse?: string | number;
  items: Array<{
    itemId: string;
    qty: number;
    rate: number;
  }>;
  scheduleDate?: string;
  submit?: boolean;
  invoiceRef?: string;
  invoiceName?: string;
  invoiceFileBase64?: string;
  invoiceMimeType?: string;
};

export type CreateStockItemPayload = {
  name: string;
  code?: string;
  category?: string;
  uom?: string;
  supplier?: string;
  unitCost?: number;
  purchasePrice?: number;
  listPrice?: number;
  consumptionMode?: "recipe" | "finished" | "hybrid" | "none";
  availableInPos?: boolean;
  targetQty?: number;
  reorderQty?: number;
  criticalQty?: number;
  maxQty?: number;
  priorityWeight?: number;
  imageBase64?: string;
  imageMimeType?: string;
};

export type ProductCatalogPayload = {
  id?: string | number;
  name: string;
  code?: string;
  category?: string;
  uom?: string;
  listPrice?: number;
  standardPrice?: number;
  consumptionMode?: "recipe" | "finished" | "hybrid" | "none";
  availableInPos?: boolean;
  targetQty?: number;
  reorderQty?: number;
  criticalQty?: number;
  maxQty?: number;
  priorityWeight?: number;
  imageBase64?: string;
  imageMimeType?: string;
  sizes?: string[];
  modifierGroups?: unknown[];
  posOptions?: { sizes?: string[]; modifier_groups?: unknown[] };
};

export type CreateSupplierPayload = {
  name: string;
  address?: string;
  category?: string;
  deliveryCategory?: string;
};

export type PurchaseOrderActionPayload = {
  po: string | number;
  action: "confirm" | "receive" | "cancel";
  items?: Array<{
    itemId: string;
    qty: number;
  }>;
};

export type RecurringPurchasePayload = {
  id?: string | number;
  name?: string;
  supplier: string;
  warehouse?: string | number;
  frequency?: "daily" | "weekly" | "biweekly" | "monthly";
  weekday?: string | number;
  nextDate?: string;
  active?: boolean;
  items: Array<{
    itemId: string;
    qty: number;
    rate: number;
    uom?: string;
  }>;
};

export type RecipeVersionPayload = {
  itemId: string;
  effectiveFrom?: string;
  wasteAllowancePercent?: number;
  ingredients: Array<{
    ingredientId: string;
    qty: number;
    uom: string;
  }>;
  submit?: boolean;
};

export type ShiftCloseReviewPayload = {
  closeId: string | number;
  decision: "approved" | "rejected" | "note";
  note?: string;
};

export type HrEmployeePayload = {
  name: string;
  role?: string;
  kiosk?: string;
  monthlySalary?: number;
  expectedMonthlyHours?: number;
};

export type HrAttendancePayload = {
  employee: string | number;
  checkIn?: string;
  checkOut?: string;
  manualHours?: number;
  note?: string;
};

export type HrSchedulePayload = {
  dateFrom?: string;
  dateTo?: string;
  kiosk?: string;
};

export type HrShiftPayload = {
  employee: string | number;
  kiosk: string;
  date: string;
  role: string;
  startHour: number;
  endHour: number;
  note?: string;
  state?: string;
};

export type HrShiftUpdatePayload = HrShiftPayload & {
  id: string | number;
  state?: string;
};

export type HrCoverageRulePayload = {
  kiosk: string;
  dayOfWeek: string;
  role: string;
  startHour: number;
  endHour: number;
  requiredCount: number;
};

export type PayrollAdjustmentPayload = {
  employee: string | number;
  type: "bonus" | "deduction" | "advance" | "cash_shortage";
  amount: number;
  reason: string;
  date?: string;
  approve?: boolean;
};

export type PayrollAdjustmentActionPayload = {
  id: string | number;
  action: "approve" | "reject";
};

export type PayrollRunPayload = {
  id?: string | number;
  name?: string;
  dateFrom?: string;
  dateTo?: string;
  compute?: boolean;
  action?: "compute" | "recompute" | "approve" | "approved" | "paid" | "mark_paid" | "cancel";
};

export type OperatingExpensePayload = {
  name: string;
  category: string;
  amount: number;
  date?: string;
  note?: string;
};

export type AuditLogPayload = {
  limit?: number;
  afterId?: number;
  eventType?: string;
};

export type AiDashboardPlanPayload = {
  query: string;
  locale?: "en" | "ar";
  scope?: {
    kioskId?: string;
    sectionId?: string;
    timeRange?: "today" | "week" | "month" | "custom";
  };
  /** Manual override: true = force deep reasoning model, false = force fast model, null/undefined = auto-detect. */
  reasoning?: boolean | null;
};

export type AiDashboardStreamHandlers = {
  onOpen?: (payload: unknown) => void;
  onArtifact?: (payload: unknown) => void;
  onTextDelta?: (text: string) => void;
  onFinal?: (payload: unknown) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

export type CreateWarehousePayload = {
  name: string;
  code?: string;
};

export type CreateKioskPayload = {
  kioskCode: string;
  name: string;
  city?: string;
  area?: string;
  street?: string;
  warehouse?: string | number;
  stockDeductionPolicy?: "warning" | "strict" | "soft";
};

export type KioskSalePayload = {
  external_id: string;
  kiosk: string;
  cashier: string;
  posting_date: string;
  session_id?: number | string;
  items: Array<{
    product: string | number;
    name: string;
    qty: number;
    price_unit: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
};

export type KioskWastePayload = {
  external_id: string;
  kiosk: string;
  cashier: string;
  item: string | number;
  name: string;
  qty: number;
  reason: string;
  estimated_cost: number;
  recorded_at: string;
};

export type OpenSessionPayload = {
  kiosk: string;
  opening_cash: number;
};

export type BayaanUserRole =
  | "superadmin"
  | "manager"
  | "logistics"
  | "accountant"
  | "supervisor"
  | "cashier";

export type BayaanAuthUser = {
  id: number | false;
  name: string;
  login: string;
  roles: BayaanUserRole[];
  primaryRole: BayaanUserRole | null;
  allowedNav: string[];
  allowedPanels: {
    admin: boolean;
    pos: boolean;
  };
  assignedKiosks: Array<{
    id: number;
    kioskCode: string;
    name: string;
    city?: string;
    area?: string;
  }>;
};

export type BayaanAuthStatus = {
  authenticated: boolean;
  user: BayaanAuthUser;
};

export type LoginPayload = {
  login: string;
  password: string;
};

export type SourceOfTruthGateway = {
  enabled: boolean;
  getAuthStatus: () => Promise<BayaanAuthStatus>;
  login: (payload: LoginPayload) => Promise<BayaanAuthStatus>;
  logout: () => Promise<unknown>;
  getChainBootstrap: () => Promise<unknown>;
  getWarehouseSetup: () => Promise<unknown>;
  getPaymentGateways: () => Promise<unknown>;
  getAuditLog: (payload?: AuditLogPayload) => Promise<unknown>;
  resolveAiDashboardPlan: (payload: AiDashboardPlanPayload) => Promise<unknown>;
  streamAiDashboardPlan: (payload: AiDashboardPlanPayload, handlers?: AiDashboardStreamHandlers) => Promise<unknown>;
  subscribeRealtime: (options: BayaanRealtimeOptions) => BayaanRealtimeSubscription;
  openSession: (payload: OpenSessionPayload) => Promise<{ id?: number | string; state?: string }>;
  createWarehouse: (payload: CreateWarehousePayload) => Promise<unknown>;
  createKiosk: (payload: CreateKioskPayload) => Promise<unknown>;
  createStockItem: (payload: CreateStockItemPayload) => Promise<unknown>;
  upsertProductCatalog: (payload: ProductCatalogPayload) => Promise<unknown>;
  createSupplier: (payload: CreateSupplierPayload) => Promise<unknown>;
  submitSale: (sale: SaleRecord, kioskId: string) => Promise<unknown>;
  submitKioskSale: (payload: KioskSalePayload) => Promise<unknown>;
  submitStockTransfer: (payload: StockTransferPayload) => Promise<unknown>;
  stockTransferAction: (payload: StockTransferActionPayload) => Promise<unknown>;
  requestStock: (payload: StockRequestPayload) => Promise<unknown>;
  submitPurchaseOrder: (payload: PurchaseOrderPayload) => Promise<unknown>;
  purchaseOrderAction: (payload: PurchaseOrderActionPayload) => Promise<unknown>;
  createRecurringPurchase: (payload: RecurringPurchasePayload) => Promise<unknown>;
  recurringPurchaseAction: (payload: { id: string | number; action: "run" }) => Promise<unknown>;
  submitRecipeVersion: (payload: RecipeVersionPayload) => Promise<unknown>;
  submitWaste: (waste: WasteRecord, kioskId: string) => Promise<unknown>;
  submitKioskWaste: (payload: KioskWastePayload) => Promise<unknown>;
  submitShiftClose: (payload: ShiftClosePayload) => Promise<unknown>;
  reviewShiftClose: (payload: ShiftCloseReviewPayload) => Promise<unknown>;
  getHrSnapshot: () => Promise<unknown>;
  getHrSchedule: (payload?: HrSchedulePayload) => Promise<unknown>;
  createHrEmployee: (payload: HrEmployeePayload) => Promise<unknown>;
  createHrShift: (payload: HrShiftPayload) => Promise<unknown>;
  updateHrShift: (payload: HrShiftUpdatePayload) => Promise<unknown>;
  createHrCoverageRule: (payload: HrCoverageRulePayload) => Promise<unknown>;
  submitHrAttendance: (payload: HrAttendancePayload) => Promise<unknown>;
  submitPayrollAdjustment: (payload: PayrollAdjustmentPayload) => Promise<unknown>;
  payrollAdjustmentAction: (payload: PayrollAdjustmentActionPayload) => Promise<unknown>;
  payrollRunAction: (payload: PayrollRunPayload) => Promise<unknown>;
  submitOperatingExpense: (payload: OperatingExpensePayload) => Promise<unknown>;
};

function dispatchAiDashboardStreamEvent(eventName: string, dataText: string, handlers: AiDashboardStreamHandlers) {
  const payload = dataText ? JSON.parse(dataText) : {};
  if (eventName === "open") {
    handlers.onOpen?.(payload);
    return payload;
  }
  if (eventName === "artifact") {
    handlers.onArtifact?.(payload);
    return payload;
  }
  if (eventName === "text_delta") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text) handlers.onTextDelta?.(text);
    return payload;
  }
  if (eventName === "final") {
    handlers.onFinal?.(payload);
    return payload;
  }
  if (eventName === "error") {
    const message = String(payload.error || payload.message || "AI stream failed");
    handlers.onError?.(message);
    throw new Error(message);
  }
  return payload;
}

async function readAiDashboardSse(response: Response, handlers: AiDashboardStreamHandlers = {}) {
  if (!response.body) {
    throw new Error("AI stream response did not include a readable body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: unknown = null;

  const consumeBlock = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    const payload = dispatchAiDashboardStreamEvent(eventName, dataLines.join("\n"), handlers);
    if (eventName === "final") finalPayload = payload;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();
    let separatorMatch = buffer.match(/\r?\n\r?\n/);
    while (separatorMatch?.index !== undefined) {
      const separator = separatorMatch.index;
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + separatorMatch[0].length);
      if (block.trim()) consumeBlock(block);
      separatorMatch = buffer.match(/\r?\n\r?\n/);
    }
    if (done) break;
  }
  const tail = buffer.trim();
  if (tail) consumeBlock(tail);
  return finalPayload;
}

export function createSourceOfTruthGateway(): SourceOfTruthGateway {
  if (runtimeSimulationMode()) {
    return createSimulationGateway();
  }

  const runtimeUrl = runtimeOdooUrl();
  const baseUrl = import.meta.env.VITE_ODOO_URL || runtimeUrl;
  const token = import.meta.env.VITE_ODOO_TOKEN;
  const db = import.meta.env.VITE_ODOO_DB || runtimeOdooDb();
  const realtimeTransport = runtimeRealtimeTransport();

  if (!baseUrl) {
    return createNoopGateway();
  }

  const client = new OdooClient({ baseUrl, token, db });

  return {
    enabled: true,
    async getAuthStatus() {
      return client.json<BayaanAuthStatus>("/bayaan/api/auth_status");
    },
    async login(payload: LoginPayload) {
      await client.authenticate(payload.login, payload.password);
      return client.json<BayaanAuthStatus>("/bayaan/api/auth_status");
    },
    async logout() {
      return client.json("/bayaan/api/auth_logout");
    },
    async getChainBootstrap() {
      return client.json("/bayaan/api/chain_bootstrap");
    },
    async getWarehouseSetup() {
      return client.json("/bayaan/api/warehouse_setup");
    },
    async getPaymentGateways() {
      return client.json("/bayaan/api/payment_gateways");
    },
    async getAuditLog(payload: AuditLogPayload = {}) {
      return client.json("/bayaan/api/audit_log", {
        payload: {
          limit: payload.limit,
          after_id: payload.afterId,
          event_type: payload.eventType,
        },
      });
    },
    async resolveAiDashboardPlan(payload: AiDashboardPlanPayload) {
      return client.json("/bayaan/api/ai_dashboard_plan", {
        payload: {
          query: payload.query,
          locale: payload.locale,
          scope: payload.scope,
          kioskId: payload.scope?.kioskId,
          sectionId: payload.scope?.sectionId,
          timeRange: payload.scope?.timeRange,
          reasoning: payload.reasoning,
        },
      });
    },
    async streamAiDashboardPlan(payload: AiDashboardPlanPayload, handlers: AiDashboardStreamHandlers = {}) {
      const response = await fetch(client.routeUrl("/bayaan/api/ai_dashboard_stream"), {
        method: "POST",
        credentials: "include",
        signal: handlers.signal,
        headers: {
          "Accept": "text/event-stream",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          payload: {
            query: payload.query,
            locale: payload.locale,
            scope: payload.scope,
            kioskId: payload.scope?.kioskId,
            sectionId: payload.scope?.sectionId,
            timeRange: payload.scope?.timeRange,
            reasoning: payload.reasoning,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Bayaan AI stream failed: ${response.status} ${response.statusText}`);
      }

      const finalPayload = await readAiDashboardSse(response, handlers);
      if (!finalPayload) {
        throw new Error("Bayaan AI stream ended before a final event");
      }
      return finalPayload;
    },
    subscribeRealtime(options: BayaanRealtimeOptions) {
      return subscribeBayaanRealtime(client, { ...options, transport: realtimeTransport });
    },
    async openSession(payload: OpenSessionPayload) {
      return client.json("/bayaan/api/open_session", { payload });
    },
    async createWarehouse(payload: CreateWarehousePayload) {
      return client.json("/bayaan/api/create_warehouse", {
        payload: {
          name: payload.name,
          code: payload.code,
        },
      });
    },
    async createKiosk(payload: CreateKioskPayload) {
      return client.json("/bayaan/api/create_kiosk", {
        payload: {
          kiosk_code: payload.kioskCode,
          name: payload.name,
          city: payload.city,
          area: payload.area,
          street: payload.street,
          warehouse: payload.warehouse,
          stock_deduction_policy: payload.stockDeductionPolicy,
        },
      });
    },
    async createStockItem(payload: CreateStockItemPayload) {
      return client.json("/bayaan/api/create_stock_item", {
        payload: {
          name: payload.name,
          code: payload.code,
          category: payload.category,
          uom: payload.uom,
          supplier: payload.supplier,
          unit_cost: payload.unitCost,
          purchase_price: payload.purchasePrice,
          list_price: payload.listPrice,
          consumption_mode: payload.consumptionMode,
          available_in_pos: payload.availableInPos,
          target_qty: payload.targetQty,
          reorder_qty: payload.reorderQty,
          critical_qty: payload.criticalQty,
          max_qty: payload.maxQty,
          priority_weight: payload.priorityWeight,
          image_base64: payload.imageBase64,
          image_mimetype: payload.imageMimeType,
        },
      });
    },
    async upsertProductCatalog(payload: ProductCatalogPayload) {
      return client.json("/bayaan/api/product_catalog", {
        payload: {
          id: payload.id,
          name: payload.name,
          code: payload.code,
          category: payload.category,
          uom: payload.uom,
          list_price: payload.listPrice,
          standard_price: payload.standardPrice,
          consumption_mode: payload.consumptionMode,
          available_in_pos: payload.availableInPos,
          target_qty: payload.targetQty,
          reorder_qty: payload.reorderQty,
          critical_qty: payload.criticalQty,
          max_qty: payload.maxQty,
          priority_weight: payload.priorityWeight,
          image_base64: payload.imageBase64,
          image_mimetype: payload.imageMimeType,
          sizes: payload.sizes,
          modifier_groups: payload.modifierGroups,
          pos_options: payload.posOptions,
        },
      });
    },
    async createSupplier(payload: CreateSupplierPayload) {
      return client.json("/bayaan/api/create_supplier", {
        payload: {
          name: payload.name,
          address: payload.address,
          category: payload.category,
          delivery_category: payload.deliveryCategory,
        },
      });
    },
    async submitSale(sale: SaleRecord, kioskId: string) {
      return client.json("/bayaan/api/pos_sale", {
        payload: buildBayaanSalePayload(sale, kioskId),
      });
    },
    async submitKioskSale(payload: KioskSalePayload) {
      return client.json("/bayaan/api/kiosk_sale", { payload });
    },
    async submitStockTransfer(payload: StockTransferPayload) {
      const items = stockTransferPayloadLines(payload);
      return client.json("/bayaan/api/stock_transfer", {
        payload: {
          kiosk: payload.kioskId,
          items: items.map((item) => ({
            item: item.itemId,
            qty: item.qty,
            uom: item.uom,
          })),
          from_warehouse: payload.fromWarehouse,
        },
      });
    },
    async stockTransferAction(payload: StockTransferActionPayload) {
      return client.json("/bayaan/api/stock_transfer_action", {
        payload: {
          transfer: payload.transfer,
          action: payload.action,
          items: payload.items?.map((item) => ({
            item: item.itemId,
            qty: item.qty,
          })),
        },
      });
    },
    async requestStock(payload: StockRequestPayload) {
      return client.json("/bayaan/api/stock_request", {
        payload: {
          kiosk: payload.kioskId,
          items: (payload.items || []).map((item) => ({
            item: item.itemId,
            qty: item.qty,
            uom: item.uom,
          })),
          note: payload.note,
        },
      });
    },
    async submitPurchaseOrder(payload: PurchaseOrderPayload) {
      return client.json("/bayaan/api/purchase_order", {
        payload: {
          supplier: payload.supplier,
          warehouse: payload.warehouse,
          schedule_date: payload.scheduleDate,
          submit: payload.submit,
          invoice_ref: payload.invoiceRef,
          invoice_name: payload.invoiceName,
          invoice_file: payload.invoiceFileBase64,
          invoice_mimetype: payload.invoiceMimeType,
          items: payload.items.map((item) => ({
            item: item.itemId,
            qty: item.qty,
            rate: item.rate,
          })),
        },
      });
    },
    async purchaseOrderAction(payload: PurchaseOrderActionPayload) {
      return client.json("/bayaan/api/purchase_order_action", {
        payload: {
          po: payload.po,
          action: payload.action,
          items: payload.items?.map((item) => ({
            item: item.itemId,
            qty: item.qty,
          })),
        },
      });
    },
    async createRecurringPurchase(payload: RecurringPurchasePayload) {
      return client.json("/bayaan/api/recurring_purchase", {
        payload: {
          id: payload.id,
          name: payload.name,
          supplier: payload.supplier,
          warehouse: payload.warehouse,
          frequency: payload.frequency,
          weekday: payload.weekday,
          next_date: payload.nextDate,
          active: payload.active,
          items: payload.items.map((item) => ({
            item: item.itemId,
            qty: item.qty,
            rate: item.rate,
            uom: item.uom,
          })),
        },
      });
    },
    async recurringPurchaseAction(payload: { id: string | number; action: "run" }) {
      return client.json("/bayaan/api/recurring_purchase", {
        payload: {
          id: payload.id,
          action: payload.action,
        },
      });
    },
    async submitRecipeVersion(payload: RecipeVersionPayload) {
      return client.json("/bayaan/api/recipe_version", {
        payload: {
          item: payload.itemId,
          effective_from: payload.effectiveFrom,
          waste_allowance_percent: payload.wasteAllowancePercent,
          submit: payload.submit ?? true,
          ingredients: payload.ingredients.map((item) => ({
            ingredient: item.ingredientId,
            qty: item.qty,
            uom: item.uom,
          })),
        },
      });
    },
    async submitWaste(waste: WasteRecord, kioskId: string) {
      return client.json("/bayaan/api/waste", {
        payload: {
          kiosk: kioskId,
          item: waste.product.id,
          qty: waste.qty,
          reason: waste.reason,
          estimated_cost: waste.cost,
        },
      });
    },
    async submitKioskWaste(payload: KioskWastePayload) {
      return client.json("/bayaan/api/waste", { payload });
    },
    async submitShiftClose({ kioskId, cashier, shift, draft }: ShiftClosePayload) {
      const posOrders = shift.sales.map((sale) => sale.id);
      const cashSales = shift.sales
        .filter((sale) => sale.tender.method === "cash")
        .reduce((sum, sale) => sum + sale.total, 0);
      const cardSales = shift.sales
        .filter((sale) => sale.tender.method === "card")
        .reduce((sum, sale) => sum + sale.total, 0);
      return client.json("/bayaan/api/shift_close", {
        payload: {
          kiosk: kioskId,
          cashier,
          opened_at: shift.openedAt,
          opening_cash: shift.openingCash,
          expected_cash: shift.openingCash + cashSales,
          actual_cash: draft.actualCash,
          expected_card: cardSales,
          actual_card: draft.actualCard ?? cardSales,
          stock_counts: draft.stockCounts,
          ingredient_counts: draft.ingredientCounts,
          pos_invoices: posOrders,
        },
      });
    },
    async reviewShiftClose(payload: ShiftCloseReviewPayload) {
      return client.json("/bayaan/api/shift_close_review", {
        payload: {
          close_id: payload.closeId,
          decision: payload.decision,
          note: payload.note,
        },
      });
    },
    async getHrSnapshot() {
      return client.json("/bayaan/api/hr_snapshot");
    },
    async getHrSchedule(payload: HrSchedulePayload = {}) {
      return client.json("/bayaan/api/hr_schedule", {
        payload: {
          action: "read",
          date_from: payload.dateFrom,
          date_to: payload.dateTo,
          kiosk: payload.kiosk,
        },
      });
    },
    async createHrEmployee(payload: HrEmployeePayload) {
      return client.json("/bayaan/api/hr_employee", {
        payload: {
          name: payload.name,
          role: payload.role,
          kiosk: payload.kiosk,
          monthly_salary: payload.monthlySalary,
          expected_monthly_hours: payload.expectedMonthlyHours,
        },
      });
    },
    async createHrShift(payload: HrShiftPayload) {
      return client.json("/bayaan/api/hr_schedule", {
        payload: {
          action: "create_shift",
          employee: payload.employee,
          kiosk: payload.kiosk,
          date: payload.date,
          role: payload.role,
          start_hour: payload.startHour,
          end_hour: payload.endHour,
          state: payload.state,
          note: payload.note,
        },
      });
    },
    async updateHrShift(payload: HrShiftUpdatePayload) {
      return client.json("/bayaan/api/hr_schedule", {
        payload: {
          action: "update_shift",
          id: payload.id,
          employee: payload.employee,
          kiosk: payload.kiosk,
          date: payload.date,
          role: payload.role,
          start_hour: payload.startHour,
          end_hour: payload.endHour,
          state: payload.state,
          note: payload.note,
        },
      });
    },
    async createHrCoverageRule(payload: HrCoverageRulePayload) {
      return client.json("/bayaan/api/hr_schedule", {
        payload: {
          action: "create_coverage_rule",
          kiosk: payload.kiosk,
          day_of_week: payload.dayOfWeek,
          role: payload.role,
          start_hour: payload.startHour,
          end_hour: payload.endHour,
          required_count: payload.requiredCount,
        },
      });
    },
    async submitHrAttendance(payload: HrAttendancePayload) {
      return client.json("/bayaan/api/hr_attendance", {
        payload: {
          employee: payload.employee,
          check_in: payload.checkIn,
          check_out: payload.checkOut,
          manual_hours: payload.manualHours,
          note: payload.note,
        },
      });
    },
    async submitPayrollAdjustment(payload: PayrollAdjustmentPayload) {
      return client.json("/bayaan/api/payroll_adjustment", {
        payload: {
          employee: payload.employee,
          type: payload.type,
          amount: payload.amount,
          reason: payload.reason,
          date: payload.date,
          approve: payload.approve,
        },
      });
    },
    async payrollAdjustmentAction(payload: PayrollAdjustmentActionPayload) {
      return client.json("/bayaan/api/payroll_adjustment_action", {
        payload: {
          adjustment: payload.id,
          action: payload.action,
        },
      });
    },
    async payrollRunAction(payload: PayrollRunPayload) {
      if (payload.id && payload.action) {
        return client.json("/bayaan/api/payroll_run_action", {
          payload: {
            run: payload.id,
            action: payload.action,
          },
        });
      }
      return client.json("/bayaan/api/payroll_run", {
        payload: {
          name: payload.name,
          date_from: payload.dateFrom,
          date_to: payload.dateTo,
          compute: payload.compute,
        },
      });
    },
    async submitOperatingExpense(payload: OperatingExpensePayload) {
      return client.json("/bayaan/api/operating_expense", {
        payload: {
          name: payload.name,
          category: payload.category,
          amount: payload.amount,
          date: payload.date,
          note: payload.note,
        },
      });
    },
  };
}

function runtimeOdooUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("odooUrl") || window.localStorage.getItem("BAYAAN_ODOO_URL") || "";
}

function runtimeRealtimeTransport(): BayaanRealtimeTransport {
  if (import.meta.env.VITE_BAYAAN_REALTIME_TRANSPORT === "polling") return "polling";
  if (typeof window === "undefined") return "auto";
  const params = new URLSearchParams(window.location.search);
  return params.get("bayaanRealtime") === "polling" ? "polling" : "auto";
}

function runtimeSimulationMode() {
  if (import.meta.env.VITE_BAYAAN_SIMULATION === "true") return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("bayaanSimulation") === "peak"
    || params.get("bayaanSimulation") === "peak-full"
    || params.get("bayaanMode") === "simulation"
    || window.localStorage.getItem("BAYAAN_SIMULATION") === "peak"
  );
}

function runtimeSimulationSeed() {
  if (typeof window === "undefined") return 20260516;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("bayaanSeed") || window.localStorage.getItem("BAYAAN_SIMULATION_SEED") || "";
  const seed = Number(raw);
  return Number.isFinite(seed) && seed > 0 ? Math.trunc(seed) : 20260516;
}

function runtimeSimulationStartsFull() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("bayaanSimStart") === "full";
}

function runtimeSimulationMinutes() {
  if (typeof window === "undefined") return 60;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("bayaanSimMinutes") || window.localStorage.getItem("BAYAAN_SIMULATION_MINUTES") || "";
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes >= 30 ? Math.min(120, Math.trunc(minutes)) : 60;
}

function runtimeSimulationSpeed() {
  if (typeof window === "undefined") return 1;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("bayaanSimSpeed") || window.localStorage.getItem("BAYAAN_SIMULATION_SPEED") || "";
  const speed = Number(raw);
  return [1, 2, 5, 10].includes(speed) ? speed : 1;
}

function runtimeSimulationTickMs() {
  const speed = runtimeSimulationSpeed();
  return Math.max(150, Math.round(2_000 / speed));
}

function runtimeSimulationLoop() {
  if (typeof window === "undefined") return true;
  const params = new URLSearchParams(window.location.search);
  return params.get("bayaanSimLoop") !== "0";
}

function runtimeOdooDb() {
  if (typeof window === "undefined") return "bayaan";
  const params = new URLSearchParams(window.location.search);
  return params.get("odooDb") || window.localStorage.getItem("BAYAAN_ODOO_DB") || "bayaan";
}

const DEMO_AUTH: BayaanAuthStatus = {
  authenticated: true,
  user: {
    id: false,
    name: "Demo Owner",
    login: "demo",
    roles: ["superadmin"],
    primaryRole: "superadmin",
    allowedNav: [
      "overview", "insights", "kiosks", "warehouses", "items", "sales", "closing",
      "waste", "products", "suppliers", "inventory", "staff", "finance", "reports",
    ],
    allowedPanels: { admin: true, pos: true },
    assignedKiosks: [],
  },
};

const SIMULATION_ASSIGNED_KIOSKS: NonNullable<BayaanAuthStatus["user"]>["assignedKiosks"] = [
  { id: 1, kioskCode: "K-01", name: "Karrada Center", city: "Baghdad", area: "Karrada" },
  { id: 2, kioskCode: "K-02", name: "Mansour District", city: "Baghdad", area: "Mansour" },
  { id: 3, kioskCode: "K-03", name: "Baghdad Mall", city: "Baghdad", area: "Harthiya" },
  { id: 4, kioskCode: "K-04", name: "Zayouna Plaza", city: "Baghdad", area: "Zayouna" },
  { id: 5, kioskCode: "K-05", name: "Al Mansour Mall", city: "Baghdad", area: "Mansour" },
  { id: 6, kioskCode: "K-06", name: "University Street", city: "Baghdad", area: "Jadriya" },
  { id: 7, kioskCode: "K-07", name: "Karada Riverside", city: "Baghdad", area: "Abu Nuwas" },
  { id: 8, kioskCode: "K-08", name: "Palestine Street", city: "Baghdad", area: "Palestine" },
  { id: 9, kioskCode: "K-09", name: "Yarmouk Hospital", city: "Baghdad", area: "Yarmouk" },
  { id: 10, kioskCode: "K-10", name: "Adhamiya Walk", city: "Baghdad", area: "Adhamiya" },
];

const SIMULATION_AUTH: BayaanAuthStatus = {
  authenticated: true,
  user: {
    id: 1,
    name: "Simulation Owner",
    login: "simulation",
    roles: ["superadmin"],
    primaryRole: "superadmin",
    allowedNav: [
      "overview", "insights", "kiosks", "warehouses", "items", "sales", "closing",
      "waste", "products", "suppliers", "inventory", "staff", "finance", "reports",
    ],
    allowedPanels: { admin: true, pos: true },
    assignedKiosks: SIMULATION_ASSIGNED_KIOSKS,
  },
};

type SimulationSnapshot = ReturnType<typeof createPeakSimulation>;
type SimulationManualSale = KioskSalePayload & {
  name: string;
  recorded_at: string;
  sequence: number;
};
type SimulationManualShiftClose = ShiftClosePayload & {
  name: string;
  submitted_at: string;
};
type SimulationCloseReview = ShiftCloseReviewPayload & {
  reviewed_at: string;
};
type SimulationManualTransfer = StockTransferPayload & {
  name: string;
  bayaan_state: string;
  created_at: string;
  sequence: number;
};
type SimulationTransferAction = StockTransferActionPayload & {
  bayaan_state: string;
  acted_at: string;
};
type SimulationPurchaseAction = PurchaseOrderActionPayload & {
  state: string;
  receipt_state: string;
  acted_at: string;
};
type SimulationManualPurchaseOrder = PurchaseOrderPayload & {
  name: string;
  state: string;
  receipt_state: string;
  created_at: string;
  sequence: number;
};
type SimulationManualRecurringPurchase = RecurringPurchasePayload & {
  id: number;
  created_at: string;
  sequence: number;
  active: boolean;
};
type SimulationManualStockItem = CreateStockItemPayload & {
  id: number;
  default_code: string;
  created_at: string;
  sequence: number;
};
type SimulationManualSupplier = CreateSupplierPayload & {
  id: number;
  created_at: string;
  sequence: number;
};
type SimulationManualProductCatalog = ProductCatalogPayload & {
  id: string | number;
  default_code: string;
  created_at: string;
  sequence: number;
};
type SimulationManualRecipeVersion = RecipeVersionPayload & {
  id: number;
  product_code: string;
  version: string;
  created_at: string;
  sequence: number;
  state: "active" | "draft";
};
type SimulationManualHrEmployee = HrEmployeePayload & {
  id: string;
  created_at: string;
  sequence: number;
};
type SimulationManualHrShift = HrShiftPayload & {
  id: string;
  state: string;
  created_at: string;
  sequence: number;
};
type SimulationManualHrCoverageRule = HrCoverageRulePayload & {
  id: string;
  created_at: string;
  sequence: number;
};
type SimulationManualHrAttendance = HrAttendancePayload & {
  id: string;
  employeeName: string;
  kiosk?: string;
  workedHours: number;
  state: string;
  created_at: string;
  sequence: number;
};
type SimulationManualPayrollAdjustment = PayrollAdjustmentPayload & {
  id: string;
  employeeName: string;
  state: "approved" | "draft" | "rejected";
  created_at: string;
  sequence: number;
};
type SimulationManualPayrollRun = {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  state: "reviewed" | "approved" | "paid" | "cancelled";
  gross: number;
  net: number;
  adjustments: number;
  created_at: string;
  sequence: number;
};
type SimulationManualOperatingExpense = OperatingExpensePayload & {
  id: string;
  created_at: string;
  sequence: number;
};

function simulationRoundMoney(value: number) {
  return Math.round(Number(value || 0));
}

function simulationRoundQty(value: number) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function simulationKioskName(snapshot: SimulationSnapshot, kioskCode: string) {
  const kiosk = snapshot.kiosks.find((row) => row.kiosk_code === kioskCode || String(row.id) === kioskCode);
  return kiosk?.name || kioskCode;
}

function simulationKioskRow(snapshot: SimulationSnapshot, kioskCode: string | number | undefined) {
  const target = String(kioskCode || "");
  return snapshot.kiosks.find((row) => row.kiosk_code === target || String(row.id) === target);
}

function simulationStockKey(value: unknown) {
  return String(value || "").toLowerCase().replace(/^\[[^\]]+\]\s*/, "").replace(/[^a-z0-9]+/g, "");
}

function simulationStockItemCode(payload: CreateStockItemPayload) {
  const defaultCode = String(payload.code || payload.name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return defaultCode || "SIM-ITEM";
}

function simulationProductCatalogCode(payload: ProductCatalogPayload) {
  const defaultCode = String(payload.code || payload.name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return defaultCode || "SIM-PRODUCT";
}

function simulationManualStockItemProduct(item: SimulationManualStockItem) {
  return {
    id: item.id,
    default_code: item.default_code,
    name: item.name,
    category: item.category,
    standard_price: item.unitCost || item.purchasePrice || 0,
    consumption_mode: item.consumptionMode || "finished",
    target_qty: Number(item.targetQty || 0),
    reorder_qty: Number(item.reorderQty || 0),
    critical_qty: Number(item.criticalQty || 0),
    max_qty: Number(item.maxQty || 0),
    stock_priority_weight: Number(item.priorityWeight || 1),
  };
}

function simulationManualProductCatalogRow(item: SimulationManualProductCatalog) {
  const consumptionMode: "recipe" | "finished" | "hybrid" = item.consumptionMode === "recipe" || item.consumptionMode === "hybrid"
    ? item.consumptionMode
    : "finished";
  return {
    default_code: item.default_code,
    name: item.name,
    category: item.category || "Menu",
    list_price: Number(item.listPrice || 0),
    standard_price: Number(item.standardPrice || 0),
    consumption_mode: consumptionMode,
    available_in_pos: item.availableInPos ?? true,
  };
}

function simulationHrEmployee(snapshot: SimulationSnapshot, employee: string | number) {
  const target = simulationStockKey(employee);
  return (snapshot.hr?.employees || []).find((row) => (
    simulationStockKey(row.id) === target
    || simulationStockKey(row.name) === target
    || simulationStockKey((row as { odooEmployeeId?: unknown }).odooEmployeeId) === target
  ));
}

function simulationHrRows<T extends Record<string, unknown>>(snapshot: SimulationSnapshot, key: string): T[] {
  const rows = (snapshot.hr as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(rows) ? rows as T[] : [];
}

function simulationHrSummary(snapshot: SimulationSnapshot) {
  return (snapshot.hr?.summary || {}) as Record<string, unknown>;
}

function simulationAttendanceWorkedHours(payload: HrAttendancePayload) {
  const manualHours = Number(payload.manualHours || 0);
  if (manualHours > 0) return simulationRoundQty(manualHours);
  if (!payload.checkIn || !payload.checkOut) return 0;
  const checkIn = Date.parse(String(payload.checkIn));
  const checkOut = Date.parse(String(payload.checkOut));
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) return 0;
  return simulationRoundQty((checkOut - checkIn) / 3_600_000);
}

function simulationManualHrEmployeeRow(snapshot: SimulationSnapshot, entry: SimulationManualHrEmployee) {
  const kiosk = simulationKioskRow(snapshot, entry.kiosk);
  const monthlySalary = simulationRoundMoney(Number(entry.monthlySalary || 0));
  const expectedMonthlyHours = Number(entry.expectedMonthlyHours || 168);
  return {
    id: entry.id,
    name: entry.name.trim(),
    role: entry.role || "cashier",
    kiosk: kiosk?.kiosk_code || entry.kiosk || "Central",
    kioskName: kiosk?.name || entry.kiosk || "Central",
    status: "ready",
    active: true,
    monthlySalary,
    expectedMonthlyHours,
    hourlyRate: expectedMonthlyHours ? simulationRoundMoney(monthlySalary / expectedMonthlyHours) : 0,
    created_at: entry.created_at,
  };
}

function simulationManualHrShiftRow(snapshot: SimulationSnapshot, entry: SimulationManualHrShift) {
  const employee = simulationHrEmployee(snapshot, entry.employee);
  return {
    id: entry.id,
    employee: employee?.name || String(entry.employee),
    employeeId: employee?.id || entry.employee,
    kiosk: entry.kiosk,
    kioskName: simulationKioskName(snapshot, entry.kiosk),
    date: entry.date,
    startHour: Number(entry.startHour || 0),
    endHour: Number(entry.endHour || 0),
    role: entry.role,
    plannedHours: Math.max(0, Number(entry.endHour || 0) - Number(entry.startHour || 0)),
    state: entry.state || "planned",
    note: entry.note,
    created_at: entry.created_at,
  };
}

function simulationManualCoverageRuleRow(snapshot: SimulationSnapshot, entry: SimulationManualHrCoverageRule) {
  return {
    id: entry.id,
    ruleId: entry.id,
    kiosk: entry.kiosk,
    kioskName: simulationKioskName(snapshot, entry.kiosk),
    dayOfWeek: entry.dayOfWeek,
    role: entry.role,
    startHour: Number(entry.startHour || 0),
    endHour: Number(entry.endHour || 0),
    requiredCount: Number(entry.requiredCount || 0),
    created_at: entry.created_at,
  };
}

function simulationPayrollAdjustmentImpact(adjustments: SimulationManualPayrollAdjustment[]) {
  return adjustments.reduce((sum, adjustment) => {
    if (adjustment.state !== "approved") return sum;
    const amount = simulationRoundMoney(Number(adjustment.amount || 0));
    return adjustment.type === "bonus" ? sum + amount : sum - amount;
  }, 0);
}

function simulationLineItemsKey(items: Array<{ itemId: string | number; qty: number; rate?: number; uom?: string }>) {
  return items
    .map((item) => [
      simulationStockKey(item.itemId),
      simulationRoundQty(Number(item.qty || 0)),
      simulationRoundMoney(Number(item.rate || 0)),
      String(item.uom || ""),
    ].join(":"))
    .sort()
    .join("|");
}

function simulationPurchaseOrderCreateKey(payload: PurchaseOrderPayload) {
  return [
    simulationStockKey(payload.supplier),
    simulationStockKey(payload.warehouse || "Baghdad Area Warehouse"),
    payload.scheduleDate || "",
    payload.submit ? "submit" : "draft",
    payload.invoiceRef || payload.invoiceName || "",
    simulationLineItemsKey(payload.items),
  ].join("::");
}

function simulationRecurringPurchaseCreateKey(payload: RecurringPurchasePayload) {
  return [
    payload.id || "",
    simulationStockKey(payload.name || ""),
    simulationStockKey(payload.supplier),
    simulationStockKey(payload.warehouse || "Baghdad Area Warehouse"),
    payload.frequency || "",
    payload.weekday || "",
    payload.nextDate || "",
    payload.active ?? true,
    simulationLineItemsKey(payload.items),
  ].join("::");
}

function simulationStockRow(snapshot: SimulationSnapshot, item: string | number) {
  const target = simulationStockKey(item);
  return [...snapshot.warehouse_stock, ...snapshot.kiosk_stock_rows].find((row) => (
    simulationStockKey(row.item) === target
    || simulationStockKey(row.name) === target
  ));
}

function addSimulationSourceCounts(
  sourceCounts: SimulationSnapshot["summary"]["sourceCounts"],
  deltas: Partial<Record<keyof SimulationSnapshot["summary"]["sourceCounts"], number>>,
) {
  const next = { ...sourceCounts };
  Object.entries(deltas).forEach(([key, delta]) => {
    const typedKey = key as keyof typeof next;
    next[typedKey] = Number(next[typedKey] || 0) + Number(delta || 0);
  });
  return next;
}

function simulationReportPeriodsWithSourceCounts(
  reportPeriods: SimulationSnapshot["summary"]["reportPeriods"],
  sourceCounts: SimulationSnapshot["summary"]["sourceCounts"],
): SimulationSnapshot["summary"]["reportPeriods"] {
  return {
    daily: { ...reportPeriods.daily, sourceCounts },
    weekly: { ...reportPeriods.weekly, sourceCounts },
    monthly: { ...reportPeriods.monthly, sourceCounts },
    yearly: { ...reportPeriods.yearly, sourceCounts },
  };
}

type SimulationReportPeriod = SimulationSnapshot["summary"]["reportPeriods"]["daily"] & {
  operatingExpenses?: number;
};

function simulationReportPeriodHasActivity(period: SimulationReportPeriod) {
  const payments = period.payments || {};
  return Boolean(
    Number(period.revenue || 0)
    || Number(period.cogs || 0)
    || Number(period.wasteCost || 0)
    || Number(period.varianceImpact || 0)
    || Number(period.operatingExpenses || 0)
    || Number(period.cashExpected || 0)
    || Number(period.digitalPayments || 0)
    || Number(payments.total || 0)
  );
}

function simulationNetAfterPayroll(period: SimulationReportPeriod) {
  if (!simulationReportPeriodHasActivity(period)) return 0;
  return simulationRoundMoney(
    Number(period.netProfit || 0)
    - Number(period.payrollExpense || 0)
    - Number(period.operatingExpenses || 0),
  );
}

function simulationStockAlerts(kioskStockRows: SimulationSnapshot["kiosk_stock_rows"]) {
  const suggestedTransfers = buildSimulationTransferSuggestions(kioskStockRows);
  return {
    suggestedTransfers,
    lowStockItems: suggestedTransfers.length,
  };
}

function simulationProduct(snapshot: SimulationSnapshot, product: string | number, name?: string) {
  const productKey = String(product || "");
  const nameKey = String(name || "");
  return (snapshot.products || []).find((row) => (
    String(row.default_code || "") === productKey
    || String(row.name || "") === productKey
    || String(row.name || "") === nameKey
    || String(row.default_code || "") === nameKey
  ));
}

function simulationRecipe(snapshot: SimulationSnapshot, productCode: string, productName?: string) {
  return snapshot.recipes.find((row) => (
    String(row.product_code || "") === productCode
    || String(row.product || "") === String(productName || "")
  ));
}

function simulationFinishedStockItem(productCode: string) {
  const finishedItemByProduct: Record<string, string> = {
    "MENU-CROISSANT": "CROISSANT-PLAIN",
    "MENU-PISTACHIO-CAKE": "CAKE-SLICE",
  };
  return finishedItemByProduct[productCode];
}

function simulationPaymentProvider(method: string) {
  const normalized = String(method || "").toLowerCase();
  if (normalized.includes("cash") && !normalized.includes("zain")) {
    return { id: "cash", label: "Cash", category: "cash" };
  }
  if (normalized.includes("fib")) {
    return { id: "fib", label: "FIB", category: "bank_app" };
  }
  if (normalized.includes("zain")) {
    return { id: "zain_cash", label: "Zain Cash", category: "mobile_wallet" };
  }
  if (normalized.includes("nass")) {
    return { id: "nass_wallet", label: "NassWallet", category: "mobile_wallet" };
  }
  if (normalized.includes("asia")) {
    return { id: "asia_hawala", label: "AsiaHawala", category: "mobile_wallet" };
  }
  if (normalized.includes("fastpay")) {
    return { id: "fastpay", label: "FastPay", category: "mobile_wallet" };
  }
  if (normalized.includes("qi")) {
    return { id: "qi_card", label: "Qi Card", category: "card" };
  }
  if (normalized.includes("qr")) {
    return { id: "qr", label: "QR", category: "qr" };
  }
  if (normalized.includes("card")) {
    return { id: "bank_card", label: "Bank card terminal", category: "card" };
  }
  if (normalized.includes("manual") || normalized.includes("bank transfer") || normalized.includes("bank deposit")) {
    return { id: "manual_bank_transfer", label: "Manual bank transfer", category: "manual_digital" };
  }
  return { id: "digital_other", label: method || "Digital", category: "digital_other" };
}

function simulationPaymentProviderIsAllowed(method: string) {
  const normalized = String(method || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return false;
  if (simulationPaymentProvider(method).id !== "digital_other") return true;
  return ["digital", "online", "epayment", "otherdigital"].includes(normalized);
}

function simulationPaymentSplit(payments: Array<Record<string, unknown>>) {
  const split = {
    cash: 0,
    card: 0,
    qr: 0,
    mobile_wallet: 0,
    bank_app: 0,
    manual_digital: 0,
    digital_other: 0,
    digital: 0,
    total: 0,
  };
  payments.forEach((payment) => {
    const amount = Number(payment.amount || 0);
    const provider = payment.provider as Record<string, unknown> | undefined;
    const category = String(provider?.category || simulationPaymentProvider(String(payment.method || "")).category);
    if (category === "cash") split.cash += amount;
    else if (category === "card") split.card += amount;
    else if (category === "qr") split.qr += amount;
    else if (category === "mobile_wallet") split.mobile_wallet += amount;
    else if (category === "bank_app") split.bank_app += amount;
    else if (category === "manual_digital") split.manual_digital += amount;
    else split.digital_other += amount;
  });
  split.digital = split.card + split.qr + split.mobile_wallet + split.bank_app + split.manual_digital + split.digital_other;
  split.total = split.cash + split.digital;
  Object.keys(split).forEach((key) => {
    split[key as keyof typeof split] = simulationRoundMoney(split[key as keyof typeof split]);
  });
  return split;
}

function simulationSaleLineTotal(payload: KioskSalePayload) {
  return simulationRoundMoney(payload.items.reduce((sum, line) => (
    sum + Number(line.qty || 0) * Number(line.price_unit || 0)
  ), 0));
}

function simulationSalePaymentTotal(payload: KioskSalePayload) {
  return simulationRoundMoney(payload.payments.reduce((sum, payment) => (
    sum + Number(payment.amount || 0)
  ), 0));
}

function simulationKioskExists(snapshot: SimulationSnapshot, kioskId: string) {
  return snapshot.kiosks.some((row) => (
    String(row.kiosk_code || row.id) === String(kioskId)
  ));
}

function simulationKioskStockRow(snapshot: SimulationSnapshot, kioskId: string, item: string | number, name?: string) {
  const itemKey = String(item || "");
  const nameKey = String(name || "");
  return snapshot.kiosk_stock_rows.find((row) => (
    String(row.kiosk) === String(kioskId)
    && (
      String(row.item || "") === itemKey
      || (!!nameKey && String(row.name || "") === nameKey)
    )
  ));
}

function addSimulationRequiredStock(usage: Map<string, number>, item: string, qty: number) {
  usage.set(item, simulationRoundQty((usage.get(item) || 0) + qty));
}

function simulationRequiredStockForSale(snapshot: SimulationSnapshot, payload: KioskSalePayload) {
  const usage = new Map<string, number>();
  payload.items.forEach((line) => {
    const product = simulationProduct(snapshot, line.product, line.name);
    const productCode = String(product?.default_code || line.product);
    const productName = String(product?.name || line.name);
    const mode = String(product?.consumption_mode || "");
    const qty = Number(line.qty || 0);
    if (mode !== "finished" && mode !== "none") {
      const recipe = simulationRecipe(snapshot, productCode, productName);
      if (!recipe || !Array.isArray(recipe.lines) || !recipe.lines.length) {
        throw new Error(`Simulation sale ${payload.external_id} is missing recipe for ${productCode}`);
      }
      recipe.lines.forEach((recipeLine) => {
        addSimulationRequiredStock(
          usage,
          String(recipeLine.item || recipeLine.ingredient),
          Number(recipeLine.qty || 0) * qty,
        );
      });
    }
    if (mode === "finished" || mode === "hybrid") {
      const finishedItem = simulationFinishedStockItem(productCode);
      if (!finishedItem) {
        throw new Error(`Simulation sale ${payload.external_id} is missing finished stock mapping for ${productCode}`);
      }
      addSimulationRequiredStock(usage, finishedItem, qty);
    }
  });
  return usage;
}

function assertSimulationSalePayload(snapshot: SimulationSnapshot, payload: KioskSalePayload) {
  if (!simulationKioskExists(snapshot, payload.kiosk)) {
    throw new Error(`Simulation sale ${payload.external_id} references unknown kiosk ${payload.kiosk}`);
  }
  if (!payload.items.length) {
    throw new Error(`Simulation sale ${payload.external_id} must include at least one item`);
  }
  if (!payload.payments.length) {
    throw new Error(`Simulation sale ${payload.external_id} must include at least one payment`);
  }
  payload.items.forEach((line) => {
    if (!simulationProduct(snapshot, line.product, line.name)) {
      throw new Error(`Simulation sale ${payload.external_id} references unknown product ${String(line.product || line.name)}`);
    }
    if (Number(line.qty || 0) <= 0) {
      throw new Error(`Simulation sale ${payload.external_id} has non-positive quantity for ${line.name}`);
    }
    if (Number(line.price_unit || 0) <= 0) {
      throw new Error(`Simulation sale ${payload.external_id} has non-positive price for ${line.name}`);
    }
  });
  payload.payments.forEach((payment) => {
    if (Number(payment.amount || 0) <= 0) {
      throw new Error(`Simulation sale ${payload.external_id} has non-positive payment amount`);
    }
    if (!simulationPaymentProviderIsAllowed(payment.method)) {
      throw new Error(`Simulation sale ${payload.external_id} references unknown payment method ${payment.method}`);
    }
  });
  const requiredStock = simulationRequiredStockForSale(snapshot, payload);
  requiredStock.forEach((qty, item) => {
    const stockRow = simulationKioskStockRow(snapshot, payload.kiosk, item);
    if (!stockRow) {
      throw new Error(`Simulation sale ${payload.external_id} requires missing stock item ${item}`);
    }
    const available = Number(stockRow.actual_qty ?? stockRow.qty ?? 0);
    if (qty > available + 0.001) {
      throw new Error(`Simulation sale ${payload.external_id} exceeds available stock for ${item}`);
    }
  });
}

function assertSimulationWastePayload(snapshot: SimulationSnapshot, payload: KioskWastePayload) {
  if (!simulationKioskExists(snapshot, payload.kiosk)) {
    throw new Error(`Simulation waste ${payload.external_id} references unknown kiosk ${payload.kiosk}`);
  }
  const qty = Number(payload.qty || 0);
  if (qty <= 0) {
    throw new Error(`Simulation waste ${payload.external_id} must have positive quantity`);
  }
  if (!payload.reason) {
    throw new Error(`Simulation waste ${payload.external_id} must include a reason`);
  }
  const stockRow = simulationKioskStockRow(snapshot, payload.kiosk, payload.item, payload.name);
  if (!stockRow) {
    throw new Error(`Simulation waste ${payload.external_id} references unknown stock item ${String(payload.item || payload.name)}`);
  }
  const available = Number(stockRow.actual_qty ?? stockRow.qty ?? 0);
  if (qty > available + 0.001) {
    throw new Error(`Simulation waste ${payload.external_id} exceeds available stock for ${String(stockRow.item || payload.item)}`);
  }
  const expectedCost = simulationRoundMoney(qty * Number(stockRow.unit_cost || stockRow.standard_price || 0));
  const actualCost = simulationRoundMoney(Number(payload.estimated_cost || 0));
  if (actualCost !== expectedCost) {
    throw new Error(`Simulation waste ${payload.external_id} cost ${actualCost} does not match ${expectedCost}`);
  }
}

function assertSimulationShiftClosePayload(snapshot: SimulationSnapshot, payload: ShiftClosePayload) {
  if (!simulationKioskExists(snapshot, payload.kioskId)) {
    throw new Error(`Shift close for ${payload.kioskId} references unknown simulation kiosk`);
  }
  if (Number(payload.draft.actualCash || 0) < 0) {
    throw new Error(`Shift close for ${payload.kioskId} must have non-negative counted cash`);
  }
  const stockCounts = payload.draft.stockCounts || [];
  if (!stockCounts.length) {
    throw new Error(`Shift close for ${payload.kioskId} must include counted stock lines`);
  }
  stockCounts.forEach((line) => {
    const stockRow = simulationKioskStockRow(snapshot, payload.kioskId, line.item);
    if (!stockRow) {
      throw new Error(`Shift close for ${payload.kioskId} references unknown stock item ${line.item}`);
    }
    const expectedQty = simulationRoundQty(Number(line.expected_qty || 0));
    const currentQty = simulationRoundQty(Number(stockRow.actual_qty ?? stockRow.qty ?? 0));
    if (Math.abs(expectedQty - currentQty) > 0.001) {
      throw new Error(`Shift close for ${payload.kioskId} expected stock ${line.item} is stale: ${expectedQty} != ${currentQty}`);
    }
    if (Number(line.actual_qty || 0) < 0) {
      throw new Error(`Shift close for ${payload.kioskId} has negative count for ${line.item}`);
    }
  });
}

function assertSimulationCloseReviewPayload(snapshot: SimulationSnapshot, payload: SimulationCloseReview) {
  if (!["approved", "rejected", "note"].includes(String(payload.decision || ""))) {
    throw new Error(`Unsupported simulation close review decision: ${payload.decision || "empty value"}`);
  }
  const close = snapshot.closings.find((row) => (
    String(row.id) === String(payload.closeId)
    || String(row.name) === String(payload.closeId)
  ));
  if (!close) {
    throw new Error(`Simulation shift close ${payload.closeId} was not found for review`);
  }
}

function assertSimulationTransferPayload(snapshot: SimulationSnapshot, payload: StockTransferPayload) {
  if (!simulationKioskExists(snapshot, payload.kioskId)) {
    throw new Error(`Simulation transfer references unknown kiosk ${payload.kioskId}`);
  }
  const lines = stockTransferPayloadLines(payload);
  if (!lines.length) {
    throw new Error("Simulation transfer must include at least one item");
  }
  lines.forEach((line) => {
    if (Number(line.qty || 0) <= 0) {
      throw new Error(`Simulation transfer for ${line.itemId} must have positive quantity`);
    }
    const stockRow = simulationStockRow(snapshot, line.itemId);
    if (!stockRow) {
      throw new Error(`Simulation transfer references unknown stock item ${line.itemId}`);
    }
  });
}

function assertSimulationTransferActionPayload(snapshot: SimulationSnapshot, payload: SimulationTransferAction) {
  if (!["approve", "pick", "dispatch", "receive", "cancel"].includes(String(payload.action || ""))) {
    throw new Error(`Unsupported simulation transfer action: ${payload.action || "empty value"}`);
  }
  const transfer = snapshot.transfers.find((row) => (
    String(row.id) === String(payload.transfer)
    || String(row.name) === String(payload.transfer)
  ));
  if (!transfer) {
    throw new Error(`Simulation transfer ${payload.transfer} was not found for action replay`);
  }
}

function assertSimulationTransferReceiptAction(transfer: Record<string, unknown>, payload: StockTransferActionPayload) {
  if (payload.action !== "receive" || !payload.items?.length) return;
  const transferLines = Array.isArray(transfer.lines) ? transfer.lines as Array<Record<string, unknown>> : [];
  const transferItems = new Set(transferLines.map((line) => simulationStockKey(line.product)));
  payload.items.forEach((line) => {
    if (Number(line.qty || 0) <= 0) return;
    if (!transferItems.has(simulationStockKey(line.itemId))) {
      throw new Error(`Simulation transfer ${String(transfer.name || transfer.id || payload.transfer)} receipt references item ${line.itemId} outside transfer lines`);
    }
  });
}

function assertSimulationPurchaseActionPayload(snapshot: SimulationSnapshot, payload: SimulationPurchaseAction) {
  if (!["confirm", "receive", "cancel"].includes(String(payload.action || ""))) {
    throw new Error(`Unsupported simulation purchase action: ${payload.action || "empty value"}`);
  }
  const purchaseOrder = snapshot.purchase_orders.find((row) => (
    String(row.id) === String(payload.po)
    || String(row.name) === String(payload.po)
  ));
  if (!purchaseOrder) {
    throw new Error(`Simulation purchase order ${payload.po} was not found for action replay`);
  }
  if (payload.action !== "receive" || !payload.items?.length) return;
  const purchaseLines = Array.isArray(purchaseOrder.lines) ? purchaseOrder.lines as Array<Record<string, unknown>> : [];
  const purchaseItems = new Set(purchaseLines.map((line) => simulationStockKey(line.product || line.item)));
  payload.items.forEach((line) => {
    if (Number(line.qty || 0) <= 0) return;
    if (!purchaseItems.has(simulationStockKey(line.itemId))) {
      throw new Error(`Simulation purchase order ${String(purchaseOrder.name || purchaseOrder.id || payload.po)} receipt references item ${line.itemId} outside purchase lines`);
    }
  });
}

function simulationSupplierExists(snapshot: SimulationSnapshot, supplier: string) {
  const supplierKey = simulationStockKey(supplier);
  return snapshot.suppliers.some((row) => simulationStockKey(row.name) === supplierKey || simulationStockKey(row.id) === supplierKey);
}

function assertSimulationPurchaseOrderPayload(snapshot: SimulationSnapshot, payload: PurchaseOrderPayload) {
  if (!simulationSupplierExists(snapshot, payload.supplier)) {
    throw new Error(`Simulation purchase order references unknown supplier ${payload.supplier}`);
  }
  if (!payload.items.length) {
    throw new Error("Simulation purchase order must include at least one item");
  }
  payload.items.forEach((line) => {
    if (!simulationStockRow(snapshot, line.itemId)) {
      throw new Error(`Simulation purchase order references unknown stock item ${line.itemId}`);
    }
    if (Number(line.qty || 0) <= 0) {
      throw new Error(`Simulation purchase order ${payload.supplier} has non-positive quantity for ${line.itemId}`);
    }
    if (Number(line.rate || 0) <= 0) {
      throw new Error(`Simulation purchase order ${payload.supplier} has non-positive rate for ${line.itemId}`);
    }
  });
}

function assertSimulationStockItemPayload(snapshot: SimulationSnapshot, payload: CreateStockItemPayload) {
  if (!String(payload.name || "").trim()) {
    throw new Error("Simulation stock item must include a name");
  }
  if (payload.supplier && !simulationSupplierExists(snapshot, payload.supplier)) {
    throw new Error(`Simulation stock item references unknown supplier ${payload.supplier}`);
  }
  const unitCost = Number(payload.unitCost ?? payload.purchasePrice ?? 0);
  if (unitCost <= 0) {
    throw new Error(`Simulation stock item ${payload.name} must have a positive unit cost`);
  }
  if (payload.listPrice != null && Number(payload.listPrice) < 0) {
    throw new Error(`Simulation stock item ${payload.name} must have a non-negative list price`);
  }
}

function assertSimulationRecurringPurchasePayload(snapshot: SimulationSnapshot, payload: RecurringPurchasePayload) {
  if (!simulationSupplierExists(snapshot, payload.supplier)) {
    throw new Error(`Simulation recurring purchase references unknown supplier ${payload.supplier}`);
  }
  if (!payload.items.length) {
    throw new Error("Simulation recurring purchase must include at least one item");
  }
  payload.items.forEach((line) => {
    if (!simulationStockRow(snapshot, line.itemId)) {
      throw new Error(`Simulation recurring purchase references unknown stock item ${line.itemId}`);
    }
    if (Number(line.qty || 0) <= 0) {
      throw new Error(`Simulation recurring purchase ${payload.supplier} has non-positive quantity for ${line.itemId}`);
    }
    if (Number(line.rate || 0) <= 0) {
      throw new Error(`Simulation recurring purchase ${payload.supplier} has non-positive rate for ${line.itemId}`);
    }
  });
}

function assertSimulationSupplierPayload(payload: CreateSupplierPayload) {
  if (!String(payload.name || "").trim()) {
    throw new Error("Simulation supplier must include a name");
  }
}

function assertSimulationHrEmployeePayload(snapshot: SimulationSnapshot, payload: SimulationManualHrEmployee) {
  const name = String(payload.name || "").trim();
  const monthlySalary = simulationRoundMoney(Number(payload.monthlySalary || 0));
  const expectedMonthlyHours = Number(payload.expectedMonthlyHours || 0);
  if (!name) {
    throw new Error("Simulation HR employee requires a name");
  }
  if (payload.kiosk && !simulationKioskRow(snapshot, payload.kiosk)) {
    throw new Error(`Simulation kiosk ${payload.kiosk} was not found for HR employee`);
  }
  if (monthlySalary <= 0 || expectedMonthlyHours <= 0) {
    throw new Error("Simulation HR employee requires positive salary and expected hours");
  }
}

function assertSimulationHrShiftPayload(snapshot: SimulationSnapshot, payload: SimulationManualHrShift) {
  if (!simulationHrEmployee(snapshot, payload.employee)) {
    throw new Error(`Simulation employee ${payload.employee} was not found for shift`);
  }
  if (!simulationKioskRow(snapshot, payload.kiosk)) {
    throw new Error(`Simulation kiosk ${payload.kiosk} was not found for shift`);
  }
  if (!payload.date || !payload.role) {
    throw new Error("Simulation HR shift requires date and role");
  }
  if (Number(payload.endHour || 0) <= Number(payload.startHour || 0)) {
    throw new Error("Simulation HR shift end must be after start");
  }
}

function assertSimulationHrCoverageRulePayload(snapshot: SimulationSnapshot, payload: SimulationManualHrCoverageRule) {
  if (!simulationKioskRow(snapshot, payload.kiosk)) {
    throw new Error(`Simulation kiosk ${payload.kiosk} was not found for coverage`);
  }
  if (!payload.role || !payload.dayOfWeek) {
    throw new Error("Simulation coverage rule requires role and day");
  }
  if (Number(payload.endHour || 0) <= Number(payload.startHour || 0) || Number(payload.requiredCount || 0) <= 0) {
    throw new Error("Simulation coverage rule requires valid time and headcount");
  }
}

function assertSimulationHrAttendancePayload(snapshot: SimulationSnapshot, payload: SimulationManualHrAttendance) {
  if (!simulationHrEmployee(snapshot, payload.employee)) {
    throw new Error(`Simulation employee ${payload.employee} was not found for attendance`);
  }
  const manualHours = Number(payload.manualHours || 0);
  const workedHours = simulationAttendanceWorkedHours(payload) || Number(payload.workedHours || 0);
  if (manualHours < 0 || (!payload.checkIn && !payload.checkOut && workedHours <= 0)) {
    throw new Error("Simulation attendance requires a check-in, check-out, or manual hours");
  }
  if (payload.checkIn && payload.checkOut && workedHours <= 0) {
    throw new Error("Simulation attendance check-out must be after check-in");
  }
}

function assertSimulationPayrollAdjustmentPayload(snapshot: SimulationSnapshot, payload: SimulationManualPayrollAdjustment) {
  if (!simulationHrEmployee(snapshot, payload.employee)) {
    throw new Error(`Simulation employee ${payload.employee} was not found for payroll adjustment`);
  }
  const amount = simulationRoundMoney(Number(payload.amount || 0));
  const reason = String(payload.reason || "").trim();
  if (amount <= 0 || !reason) {
    throw new Error("Simulation payroll adjustment requires amount and reason");
  }
  if (!["bonus", "deduction", "advance", "cash_shortage"].includes(String(payload.type || ""))) {
    throw new Error(`Unsupported simulation payroll adjustment type: ${payload.type || "empty value"}`);
  }
  if (!["approved", "draft", "rejected"].includes(String(payload.state || ""))) {
    throw new Error(`Unsupported simulation payroll adjustment state: ${payload.state || "empty value"}`);
  }
}

function assertSimulationPayrollRunPayload(payload: SimulationManualPayrollRun) {
  if (!payload.name || !payload.dateFrom || !payload.dateTo) {
    throw new Error("Simulation payroll run requires name, dateFrom, and dateTo");
  }
  const dateFrom = Date.parse(String(payload.dateFrom));
  const dateTo = Date.parse(String(payload.dateTo));
  if (!Number.isFinite(dateFrom) || !Number.isFinite(dateTo) || dateTo < dateFrom) {
    throw new Error("Simulation payroll run requires a valid date range");
  }
  if (!["reviewed", "approved", "paid", "cancelled"].includes(String(payload.state || ""))) {
    throw new Error(`Unsupported simulation payroll run state: ${payload.state || "empty value"}`);
  }
  if (Number(payload.gross || 0) < 0 || Number(payload.net || 0) < 0) {
    throw new Error("Simulation payroll run requires non-negative gross and net pay");
  }
}

function assertSimulationOperatingExpensePayload(payload: SimulationManualOperatingExpense) {
  const name = String(payload.name || "").trim();
  const amount = simulationRoundMoney(Number(payload.amount || 0));
  if (!name || amount <= 0) {
    throw new Error("Simulation operating expense requires name and positive amount");
  }
}

function assertSimulationProductCatalogPayload(payload: ProductCatalogPayload) {
  if (!String(payload.name || "").trim()) {
    throw new Error("Simulation product catalog row must include a name");
  }
  if (payload.availableInPos !== false && Number(payload.listPrice || 0) <= 0) {
    throw new Error(`Simulation product ${payload.name} must have a positive sellable price`);
  }
  if (payload.standardPrice != null && Number(payload.standardPrice) < 0) {
    throw new Error(`Simulation product ${payload.name} must have a non-negative standard cost`);
  }
}

function assertSimulationRecipeVersionPayload(snapshot: SimulationSnapshot, payload: RecipeVersionPayload) {
  const product = simulationProduct(snapshot, payload.itemId);
  if (!product) {
    throw new Error(`Simulation recipe version references unknown product ${payload.itemId}`);
  }
  if (!payload.ingredients.length) {
    throw new Error(`Simulation recipe version for ${payload.itemId} must include at least one ingredient`);
  }
  payload.ingredients.forEach((line) => {
    if (!simulationStockRow(snapshot, line.ingredientId)) {
      throw new Error(`Simulation recipe version for ${payload.itemId} references unknown ingredient ${line.ingredientId}`);
    }
    if (Number(line.qty || 0) <= 0) {
      throw new Error(`Simulation recipe version for ${payload.itemId} has non-positive quantity for ${line.ingredientId}`);
    }
    if (!String(line.uom || "").trim()) {
      throw new Error(`Simulation recipe version for ${payload.itemId} must include a unit for ${line.ingredientId}`);
    }
  });
}

function addSimulationUsage(usage: Map<string, number>, kiosk: string, item: string, qty: number) {
  const key = `${kiosk}::${item}`;
  usage.set(key, simulationRoundQty((usage.get(key) || 0) + qty));
}

function applySimulationUsageToStock(
  snapshot: SimulationSnapshot,
  usageByKioskItem: Map<string, number>,
) {
  const adjustStockRow = (row: Record<string, unknown>) => {
    const kiosk = String(row.kiosk || "");
    const item = String(row.item || "");
    const qty = usageByKioskItem.get(`${kiosk}::${item}`) || 0;
    if (!qty) return row;
    const nextQty = Math.max(0, simulationRoundQty(Number(row.actual_qty ?? row.qty ?? 0) - qty));
    return simulationStockTargetPatch({ ...row, actual_qty: nextQty, qty: nextQty });
  };
  const adjustDetailRow = (kiosk: string, row: Record<string, unknown>) => {
    const item = String(row.item || "");
    const qty = usageByKioskItem.get(`${kiosk}::${item}`) || 0;
    if (!qty) return row;
    const consumed = simulationRoundQty(Number(row.consumed || 0) + qty);
    const nextQty = Math.max(0, simulationRoundQty(Number(row.actual_qty ?? row.actual ?? 0) - qty));
    return simulationStockTargetPatch({
      ...row,
      consumed,
      expected: nextQty,
      actual: nextQty,
      actual_qty: nextQty,
      qty: nextQty,
      status: nextQty <= 0 ? "issue" : row.status,
    });
  };
  return {
    kiosk_stock: Object.fromEntries(Object.entries(snapshot.kiosk_stock).map(([kiosk, rows]) => [
      kiosk,
      rows.map((row) => adjustStockRow({ ...row, kiosk })),
    ])) as typeof snapshot.kiosk_stock,
    kiosk_stock_rows: snapshot.kiosk_stock_rows.map(adjustStockRow) as typeof snapshot.kiosk_stock_rows,
    kioskStockDetails: Object.fromEntries(Object.entries(snapshot.kioskStockDetails).map(([kiosk, rows]) => [
      kiosk,
      rows.map((row) => adjustDetailRow(kiosk, row)),
    ])) as typeof snapshot.kioskStockDetails,
  };
}

export function applyManualSimulationSales(snapshot: SimulationSnapshot, manualSales: SimulationManualSale[]): SimulationSnapshot {
  if (!manualSales.length) return snapshot;

  const seenSaleKeys = new Set<string>();
  (snapshot.today.orders || []).forEach((order) => {
    const orderRecord = order as Record<string, unknown>;
    [orderRecord.external_id, orderRecord.name].filter(Boolean).forEach((key) => seenSaleKeys.add(String(key)));
  });
  const uniqueManualSales = manualSales.filter((entry) => {
    const keys = [entry.external_id, entry.name].filter(Boolean).map(String);
    if (keys.some((key) => seenSaleKeys.has(key))) return false;
    keys.forEach((key) => seenSaleKeys.add(key));
    return true;
  });
  if (!uniqueManualSales.length) return snapshot;
  uniqueManualSales.forEach((entry) => {
    const lineTotal = simulationSaleLineTotal(entry);
    const paymentTotal = simulationSalePaymentTotal(entry);
    if (lineTotal <= 0 || paymentTotal <= 0 || lineTotal !== paymentTotal) {
      throw new Error(`Simulation sale ${entry.external_id} is not balanced: lines ${lineTotal}, payments ${paymentTotal}`);
    }
    assertSimulationSalePayload(snapshot, entry);
  });

  const usageByKioskItem = new Map<string, number>();
  let ledgerSequence = snapshot.today.consumption.length + 1;
  const manualOrders = uniqueManualSales.map((entry) => {
    const amount = simulationRoundMoney(
      entry.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      || entry.items.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price_unit || 0), 0),
    );
    const orderLines = entry.items.map((line) => {
      const product = simulationProduct(snapshot, line.product, line.name);
      const productCode = String(product?.default_code || line.product);
      return {
        product: product?.name || line.name,
        product_code: productCode,
        qty: Number(line.qty || 0),
        price_unit: Number(line.price_unit || 0),
        subtotal: simulationRoundMoney(Number(line.qty || 0) * Number(line.price_unit || 0)),
      };
    });
    const payments = entry.payments.map((payment, index) => {
      const provider = simulationPaymentProvider(payment.method);
      return {
        id: `${entry.name}-PAY-${index + 1}`,
        order: entry.name,
        method: provider.label,
        amount: Number(payment.amount || amount),
        provider,
      };
    });
    return {
      id: 1_000_000 + entry.sequence,
      name: entry.name,
      external_id: entry.external_id,
      kiosk: entry.kiosk,
      kioskName: simulationKioskName(snapshot, entry.kiosk),
      cashier: entry.cashier,
      date_order: entry.recorded_at,
      amount_total: amount,
      state: "paid" as const,
      consumption_state: "posted" as const,
      lines: orderLines,
      payments,
      source: "pos_manual_sale",
    };
  });
  const manualPayments = manualOrders.flatMap((order) => order.payments);
  const manualConsumption = manualOrders.flatMap((order) => (
    order.lines.flatMap((line) => {
      const recipe = snapshot.recipes.find((row) => (
        String(row.product_code || "") === String(line.product_code)
        || String(row.product || "") === String(line.product)
      ));
      const product = simulationProduct(snapshot, line.product_code, line.product);
      const rows = (recipe?.lines || []).map((recipeLine) => {
        const qty = simulationRoundQty(Number(recipeLine.qty || 0) * Number(line.qty || 0));
        addSimulationUsage(usageByKioskItem, order.kiosk, String(recipeLine.item || recipeLine.ingredient), qty);
        return {
          id: `manual-ledger-${ledgerSequence++}`,
          order: order.name,
          kiosk: order.kiosk,
          kioskName: order.kioskName,
          sold_product: line.product,
          product: line.product,
          product_code: line.product_code,
          ingredient: recipeLine.ingredient,
          item: recipeLine.item || recipeLine.ingredient,
          item_code: recipeLine.item || recipeLine.ingredient,
          qty,
          uom: recipeLine.uom,
          cost: simulationRoundMoney(Number(recipeLine.cost || 0) * Number(line.qty || 0)),
          recipe_version: recipe?.version || "manual-simulation",
          consumed_at: order.date_order,
          create_date: order.date_order,
          source: "pos_manual_sale",
        };
      });
      if (String(product?.consumption_mode || "") === "finished" || String(product?.consumption_mode || "") === "hybrid") {
        const finishedItem = simulationFinishedStockItem(String(line.product_code));
        if (finishedItem) addSimulationUsage(usageByKioskItem, order.kiosk, finishedItem, Number(line.qty || 0));
      }
      return rows;
    })
  ));
  const manualRevenue = simulationRoundMoney(manualOrders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0));
  const manualCogs = simulationRoundMoney(manualOrders.reduce((sum, order) => (
    sum + order.lines.reduce((lineSum, line) => {
      const product = simulationProduct(snapshot, line.product_code, line.product);
      return lineSum + Number(line.qty || 0) * Number(product?.standard_price || 0);
    }, 0)
  ), 0));
  const paymentSplit = simulationPaymentSplit(manualPayments);
  const sourceCounts = {
    ...snapshot.summary.sourceCounts,
    orders: Number(snapshot.summary.sourceCounts.orders || 0) + manualOrders.length,
    payments: Number(snapshot.summary.sourceCounts.payments || 0) + manualPayments.length,
    consumptionRows: Number(snapshot.summary.sourceCounts.consumptionRows || 0) + manualConsumption.length,
  };
  const totals = {
    ...snapshot.summary.totals,
    salesToday: simulationRoundMoney(Number(snapshot.summary.totals.salesToday || 0) + manualRevenue),
    ordersToday: Number(snapshot.summary.totals.ordersToday || 0) + manualOrders.length,
    cogs: simulationRoundMoney(Number(snapshot.summary.totals.cogs || 0) + manualCogs),
    cashExpected: simulationRoundMoney(Number(snapshot.summary.totals.cashExpected || 0) + paymentSplit.cash),
    digitalPayments: simulationRoundMoney(Number(snapshot.summary.totals.digitalPayments || 0) + paymentSplit.digital),
    profitEstimate: simulationRoundMoney(Number(snapshot.summary.totals.profitEstimate || 0) + manualRevenue - manualCogs),
  };
  totals.avgTicket = totals.ordersToday ? Math.round(Number(totals.salesToday || 0) / Number(totals.ordersToday || 1)) : 0;
  totals.margin = Number(totals.salesToday || 0)
    ? Number(((Number(totals.profitEstimate || 0) / Number(totals.salesToday || 1)) * 100).toFixed(1))
    : 0;
  const payments = {
    ...snapshot.summary.payments,
    cash: simulationRoundMoney(Number(snapshot.summary.payments.cash || 0) + paymentSplit.cash),
    card: simulationRoundMoney(Number(snapshot.summary.payments.card || 0) + paymentSplit.card),
    qr: simulationRoundMoney(Number(snapshot.summary.payments.qr || 0) + paymentSplit.qr),
    mobile_wallet: simulationRoundMoney(Number(snapshot.summary.payments.mobile_wallet || 0) + paymentSplit.mobile_wallet),
    bank_app: simulationRoundMoney(Number(snapshot.summary.payments.bank_app || 0) + paymentSplit.bank_app),
    manual_digital: simulationRoundMoney(Number(snapshot.summary.payments.manual_digital || 0) + paymentSplit.manual_digital),
    digital_other: simulationRoundMoney(Number(snapshot.summary.payments.digital_other || 0) + paymentSplit.digital_other),
    digital: simulationRoundMoney(Number(snapshot.summary.payments.digital || 0) + paymentSplit.digital),
    total: simulationRoundMoney(Number(snapshot.summary.payments.total || 0) + paymentSplit.total),
  };
  const adjustPeriod = (period: typeof snapshot.summary.reportPeriods.daily, multiplier: number) => {
    const nextPeriod = {
      ...period,
      revenue: simulationRoundMoney(Number(period.revenue || 0) + manualRevenue * multiplier),
      cogs: simulationRoundMoney(Number(period.cogs || 0) + manualCogs * multiplier),
      cashExpected: simulationRoundMoney(Number(period.cashExpected || 0) + paymentSplit.cash * multiplier),
      digitalPayments: simulationRoundMoney(Number(period.digitalPayments || 0) + paymentSplit.digital * multiplier),
      netProfit: simulationRoundMoney(Number(period.netProfit || 0) + (manualRevenue - manualCogs) * multiplier),
      payments: Object.fromEntries(Object.entries(period.payments || {}).map(([key, value]) => [
        key,
        simulationRoundMoney(Number(value || 0) + Number(paymentSplit[key as keyof typeof paymentSplit] || 0) * multiplier),
      ])),
      sourceCounts,
    };
    return {
      ...nextPeriod,
      netProfitAfterPayroll: simulationNetAfterPayroll(nextPeriod),
    };
  };
  const reportPeriods: typeof snapshot.summary.reportPeriods = {
    daily: adjustPeriod(snapshot.summary.reportPeriods.daily, 1),
    weekly: adjustPeriod(snapshot.summary.reportPeriods.weekly, 7),
    monthly: adjustPeriod(snapshot.summary.reportPeriods.monthly, 30),
    yearly: adjustPeriod(snapshot.summary.reportPeriods.yearly, 365),
  };
  const reconciledTotals = {
    ...totals,
    netProfitAfterPayroll: reportPeriods.daily.netProfitAfterPayroll,
  };
  const byKiosk = snapshot.summary.byKiosk.map((row) => {
    const kioskOrders = manualOrders.filter((entry) => entry.kiosk === row.kioskId);
    if (!kioskOrders.length) return row;
    const sales = simulationRoundMoney(kioskOrders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0));
    const cashExpected = simulationPaymentSplit(kioskOrders.flatMap((order) => order.payments)).cash;
    const orders = Number(row.orders || 0) + kioskOrders.length;
    return {
      ...row,
      sales: simulationRoundMoney(Number(row.sales || row.revenue || 0) + sales),
      revenue: simulationRoundMoney(Number(row.revenue || row.sales || 0) + sales),
      orders,
      remainingOrders: Math.max(0, Number(row.remainingOrders || 0) - kioskOrders.length),
      avgTicket: orders ? Math.round((Number(row.revenue || row.sales || 0) + sales) / orders) : 0,
      cashExpected: simulationRoundMoney(Number(row.cashExpected || 0) + cashExpected),
    };
  });
  const salesByKiosk = new Map((snapshot.today.sales || []).map((row) => [String(row.kiosk || row.pos_config), { ...row }]));
  manualOrders.forEach((order) => {
    const current = salesByKiosk.get(order.kiosk) || { kiosk: order.kiosk, pos_config: `${order.kiosk} POS`, revenue: 0, orders: 0 };
    current.revenue = simulationRoundMoney(Number(current.revenue || 0) + Number(order.amount_total || 0));
    current.orders = Number(current.orders || 0) + 1;
    salesByKiosk.set(order.kiosk, current);
  });
  const hourlySales = (snapshot.summary.hourlySales || []).map((row) => ({ ...row }));
  const minutePulse = (snapshot.summary.minutePulse || []).map((row) => ({ ...row }));
  manualOrders.forEach((order) => {
    const hour = Number(String(order.date_order || "").slice(11, 13));
    if (hourlySales[hour]) {
      hourlySales[hour].revenue = simulationRoundMoney(Number(hourlySales[hour].revenue || 0) + Number(order.amount_total || 0));
      hourlySales[hour].orders = Number(hourlySales[hour].orders || 0) + 1;
    }
    const minute = Math.max(0, Math.min(minutePulse.length - 1, Math.floor((Date.parse(order.date_order) - Date.parse(`${String(order.date_order).slice(0, 10)}T14:00:00.000Z`)) / 60_000)));
    if (minutePulse[minute]) {
      minutePulse[minute].revenue = simulationRoundMoney(Number(minutePulse[minute].revenue || 0) + Number(order.amount_total || 0));
      minutePulse[minute].orders = Number(minutePulse[minute].orders || 0) + 1;
    }
  });
  const stock = applySimulationUsageToStock(snapshot, usageByKioskItem);
  const stockAlerts = simulationStockAlerts(stock.kiosk_stock_rows);

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        orders: (snapshot.meta.rows_returned.orders || 0) + manualOrders.length,
        payments: (snapshot.meta.rows_returned.payments || 0) + manualPayments.length,
        consumption: (snapshot.meta.rows_returned.consumption || 0) + manualConsumption.length,
      },
    },
    ...stock,
    suggested_transfers: stockAlerts.suggestedTransfers,
    today: {
      ...snapshot.today,
      orders: [...manualOrders, ...snapshot.today.orders],
      payments: [...manualPayments, ...snapshot.today.payments],
      sales: Array.from(salesByKiosk.values()),
      consumption: [...manualConsumption, ...snapshot.today.consumption],
    },
    summary: {
      ...snapshot.summary,
      totals: reconciledTotals,
      payments,
      byKiosk,
      alerts: {
        ...snapshot.summary.alerts,
        lowStockItems: stockAlerts.lowStockItems,
      },
      hourlySales,
      hourlyPulse: hourlySales,
      minutePulse,
      simulation: {
        ...snapshot.summary.simulation,
        completedOrders: Number(snapshot.summary.simulation.completedOrders || 0) + manualOrders.length,
        progress: Number(snapshot.summary.simulation.totalTargetOrders || 0)
          ? Number(((Number(snapshot.summary.simulation.completedOrders || 0) + manualOrders.length) / Number(snapshot.summary.simulation.totalTargetOrders || 1)).toFixed(4))
          : snapshot.summary.simulation.progress,
      },
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationWaste(snapshot: SimulationSnapshot, manualWaste: KioskWastePayload[]): SimulationSnapshot {
  if (!manualWaste.length) return snapshot;

  const seenWasteKeys = new Set<string>();
  (snapshot.today.waste || []).forEach((row) => {
    const wasteRecord = row as Record<string, unknown>;
    [wasteRecord.external_id, wasteRecord.id].filter(Boolean).forEach((key) => seenWasteKeys.add(String(key)));
  });
  const uniqueManualWaste = manualWaste.filter((entry) => {
    const keys = [entry.external_id].filter(Boolean).map(String);
    if (keys.some((key) => seenWasteKeys.has(key))) return false;
    keys.forEach((key) => seenWasteKeys.add(key));
    return true;
  });
  if (!uniqueManualWaste.length) return snapshot;
  uniqueManualWaste.forEach((entry) => assertSimulationWastePayload(snapshot, entry));

  const manualRows = uniqueManualWaste.map((entry) => {
    const item = String(entry.item || entry.name);
    const stockRow = snapshot.kiosk_stock_rows.find((row) => row.kiosk === entry.kiosk && row.item === item);
    return {
      id: entry.external_id,
      external_id: entry.external_id,
      kiosk: entry.kiosk,
      kioskName: simulationKioskName(snapshot, entry.kiosk),
      kiosk_name: simulationKioskName(snapshot, entry.kiosk),
      product: entry.name,
      item,
      qty: entry.qty,
      uom: String(stockRow?.uom || "Units"),
      reason: entry.reason,
      estimated_cost: entry.estimated_cost,
      create_date: entry.recorded_at,
      recorded_at: entry.recorded_at,
      cashier: entry.cashier,
      state: "posted",
      source: "pos_manual_waste",
    };
  });
  const extraWasteCost = simulationRoundMoney(manualRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0));
  const wasteByKioskItem = new Map<string, number>();
  manualRows.forEach((row) => {
    const key = `${row.kiosk}::${row.item}`;
    wasteByKioskItem.set(key, (wasteByKioskItem.get(key) || 0) + Number(row.qty || 0));
  });
  const adjustStockRow = (row: Record<string, unknown>) => {
    const item = String(row.item || "");
    const kiosk = String(row.kiosk || "");
    const wasteQty = wasteByKioskItem.get(`${kiosk}::${item}`) || 0;
    if (!wasteQty) return row;
    const nextQty = Math.max(0, Number(row.actual_qty ?? row.qty ?? 0) - wasteQty);
    return { ...row, actual_qty: nextQty, qty: nextQty };
  };
  const adjustDetailRow = (kiosk: string, row: Record<string, unknown>) => {
    const item = String(row.item || "");
    const wasteQty = wasteByKioskItem.get(`${kiosk}::${item}`) || 0;
    if (!wasteQty) return row;
    const nextWaste = Number(row.waste || 0) + wasteQty;
    const nextActual = Math.max(0, Number(row.actual_qty ?? row.actual ?? 0) - wasteQty);
    return {
      ...row,
      waste: nextWaste,
      expected: nextActual,
      actual: nextActual,
      actual_qty: nextActual,
      qty: nextActual,
    };
  };
  const sourceCounts = {
    ...snapshot.summary.sourceCounts,
    wasteRows: Number(snapshot.summary.sourceCounts.wasteRows || 0) + manualRows.length,
  };
  const totals = {
    ...snapshot.summary.totals,
    wasteCost: simulationRoundMoney(Number(snapshot.summary.totals.wasteCost || 0) + extraWasteCost),
    profitEstimate: simulationRoundMoney(Number(snapshot.summary.totals.profitEstimate || 0) - extraWasteCost),
  };
  totals.margin = Number(totals.salesToday || 0)
    ? Number(((Number(totals.profitEstimate || 0) / Number(totals.salesToday || 1)) * 100).toFixed(1))
    : 0;
  const adjustPeriod = (period: typeof snapshot.summary.reportPeriods.daily, multiplier: number) => {
    const nextPeriod = {
      ...period,
      wasteCost: simulationRoundMoney(Number(period.wasteCost || 0) + extraWasteCost * multiplier),
      netProfit: simulationRoundMoney(Number(period.netProfit || 0) - extraWasteCost * multiplier),
      sourceCounts,
    };
    return {
      ...nextPeriod,
      netProfitAfterPayroll: simulationNetAfterPayroll(nextPeriod),
    };
  };
  const reportPeriods: typeof snapshot.summary.reportPeriods = {
    daily: adjustPeriod(snapshot.summary.reportPeriods.daily, 1),
    weekly: adjustPeriod(snapshot.summary.reportPeriods.weekly, 7),
    monthly: adjustPeriod(snapshot.summary.reportPeriods.monthly, 30),
    yearly: adjustPeriod(snapshot.summary.reportPeriods.yearly, 365),
  };
  const reconciledTotals = {
    ...totals,
    netProfitAfterPayroll: reportPeriods.daily.netProfitAfterPayroll,
  };
  const byKiosk = snapshot.summary.byKiosk.map((row) => {
    const extra = manualRows
      .filter((entry) => entry.kiosk === row.kioskId)
      .reduce((sum, entry) => sum + Number(entry.estimated_cost || 0), 0);
    return extra ? { ...row, wasteCost: simulationRoundMoney(Number(row.wasteCost || 0) + extra) } : row;
  });
  const kioskStock = Object.fromEntries(Object.entries(snapshot.kiosk_stock).map(([kiosk, rows]) => [
    kiosk,
    rows.map((row) => adjustStockRow({ ...row, kiosk })),
  ])) as typeof snapshot.kiosk_stock;
  const kioskStockRows = snapshot.kiosk_stock_rows.map(adjustStockRow);
  const kioskStockDetails = Object.fromEntries(Object.entries(snapshot.kioskStockDetails).map(([kiosk, rows]) => [
    kiosk,
    rows.map((row) => adjustDetailRow(kiosk, row)),
  ])) as typeof snapshot.kioskStockDetails;
  const stockAlerts = simulationStockAlerts(kioskStockRows);

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        waste: (snapshot.meta.rows_returned.waste || 0) + manualRows.length,
      },
    },
    kiosk_stock: kioskStock,
    kiosk_stock_rows: kioskStockRows,
    kioskStockDetails,
    suggested_transfers: stockAlerts.suggestedTransfers,
    today: {
      ...snapshot.today,
      waste: [...snapshot.today.waste, ...manualRows],
    },
    summary: {
      ...snapshot.summary,
      totals: reconciledTotals,
      byKiosk,
      alerts: {
        ...snapshot.summary.alerts,
        lowStockItems: stockAlerts.lowStockItems,
      },
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationShiftCloses(snapshot: SimulationSnapshot, manualCloses: SimulationManualShiftClose[]): SimulationSnapshot {
  if (!manualCloses.length) return snapshot;

  const seenCloseKeys = new Set<string>();
  (snapshot.closings || []).forEach((close) => {
    [close.id, close.name].filter(Boolean).forEach((key) => seenCloseKeys.add(String(key)));
  });
  const uniqueManualCloses = manualCloses.filter((entry) => {
    const keys = [entry.name, entry.shift?.id].filter(Boolean).map(String);
    if (keys.some((key) => seenCloseKeys.has(key))) return false;
    keys.forEach((key) => seenCloseKeys.add(key));
    return true;
  });
  if (!uniqueManualCloses.length) return snapshot;
  uniqueManualCloses.forEach((entry) => assertSimulationShiftClosePayload(snapshot, entry));

  const manualRows = uniqueManualCloses.map((entry) => {
    const stockRows = (entry.draft.stockCounts || []).map((line) => {
      const stockRow = snapshot.kiosk_stock_rows.find((row) => row.kiosk === entry.kioskId && row.item === line.item);
      const expected = Number(line.expected_qty || 0);
      const actual = Number(line.actual_qty || 0);
      const variance = simulationRoundQty(actual - expected);
      const value = simulationRoundMoney(variance * Number(stockRow?.unit_cost || stockRow?.standard_price || 0));
      return {
        item: line.item,
        unit: line.uom,
        expected,
        actual,
        variance,
        value,
        varianceValue: value,
        status: variance ? "issue" : "ok",
      };
    });
    const cashSales = (entry.shift.sales || [])
      .filter((sale) => sale.tender?.method === "cash")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const digitalPayments = (entry.shift.sales || [])
      .filter((sale) => sale.tender?.method !== "cash")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const expectedCash = simulationRoundMoney(Number(entry.shift.openingCash || 0) + cashSales);
    const actualCash = simulationRoundMoney(Number(entry.draft.actualCash || 0));
    const cashVariance = simulationRoundMoney(actualCash - expectedCash);
    const stockVarianceValue = simulationRoundMoney(stockRows.reduce((sum, line) => sum + Number(line.value || 0), 0));
    return {
      id: entry.name,
      name: entry.name,
      kioskId: entry.kioskId,
      kioskName: simulationKioskName(snapshot, entry.kioskId),
      city: String(snapshot.kiosks.find((row) => row.kiosk_code === entry.kioskId)?.city || ""),
      cashier: entry.cashier,
      openedAt: entry.shift.openedAt,
      closedAt: entry.submitted_at,
      sales: simulationRoundMoney((entry.shift.sales || []).reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
      expectedCash,
      actualCash,
      cashVariance,
      digitalPayments,
      status: cashVariance || stockVarianceValue ? "pending" : "pending",
      notes: cashVariance || stockVarianceValue ? "Manager review required for submitted close." : "Submitted by cashier for manager review.",
      stock: stockRows,
      recipePostingIssues: 0,
      recipePostingIssueOrders: [],
      wasteCost: simulationRoundMoney(snapshot.today.waste
        .filter((row) => row.kiosk === entry.kioskId)
        .reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0)),
      orderCount: (entry.shift.sales || []).length,
      source: "pos_manual_shift_close",
    };
  });
  const cashVariance = simulationRoundMoney(manualRows.reduce((sum, close) => sum + Number(close.cashVariance || 0), 0));
  const stockVarianceValue = simulationRoundMoney(manualRows.reduce((sum, close) => (
    sum + (Array.isArray(close.stock) ? close.stock.reduce((stockSum, line) => stockSum + Number(line.value || 0), 0) : 0)
  ), 0));
  const varianceImpact = simulationRoundMoney(cashVariance + stockVarianceValue);
  const closedKioskIds = new Set([
    ...snapshot.closings.map((close) => String(close.kioskId || "")),
    ...manualRows.map((close) => String(close.kioskId || "")),
  ].filter(Boolean));
  const sourceCounts = {
    ...snapshot.summary.sourceCounts,
    closingRows: Number(snapshot.summary.sourceCounts.closingRows || 0) + manualRows.length,
  };
  const totals = {
    ...snapshot.summary.totals,
    cashVariance: simulationRoundMoney(Number(snapshot.summary.totals.cashVariance || 0) + cashVariance),
    stockVarianceValue: simulationRoundMoney(Number(snapshot.summary.totals.stockVarianceValue || 0) + stockVarianceValue),
    varianceImpact: simulationRoundMoney(Number(snapshot.summary.totals.varianceImpact || 0) + varianceImpact),
    profitEstimate: simulationRoundMoney(Number(snapshot.summary.totals.profitEstimate || 0) + varianceImpact),
    openKiosks: Math.max(0, snapshot.kiosks.length - closedKioskIds.size),
    closedKiosks: closedKioskIds.size,
  };
  totals.margin = Number(totals.salesToday || 0)
    ? Number(((Number(totals.profitEstimate || 0) / Number(totals.salesToday || 1)) * 100).toFixed(1))
    : 0;
  const adjustPeriod = (period: typeof snapshot.summary.reportPeriods.daily, multiplier: number) => {
    const nextPeriod = {
      ...period,
      cashVariance: simulationRoundMoney(Number(period.cashVariance || 0) + cashVariance * multiplier),
      stockVarianceValue: simulationRoundMoney(Number(period.stockVarianceValue || 0) + stockVarianceValue * multiplier),
      varianceImpact: simulationRoundMoney(Number(period.varianceImpact || 0) + varianceImpact * multiplier),
      netProfit: simulationRoundMoney(Number(period.netProfit || 0) + varianceImpact * multiplier),
      sourceCounts,
    };
    return {
      ...nextPeriod,
      netProfitAfterPayroll: simulationNetAfterPayroll(nextPeriod),
    };
  };
  const reportPeriods: typeof snapshot.summary.reportPeriods = {
    daily: adjustPeriod(snapshot.summary.reportPeriods.daily, 1),
    weekly: adjustPeriod(snapshot.summary.reportPeriods.weekly, 7),
    monthly: adjustPeriod(snapshot.summary.reportPeriods.monthly, 30),
    yearly: adjustPeriod(snapshot.summary.reportPeriods.yearly, 365),
  };
  const reconciledTotals = {
    ...totals,
    netProfitAfterPayroll: reportPeriods.daily.netProfitAfterPayroll,
  };
  const unresolvedVariances = manualRows.filter((close) => (
    ["pending", "issue"].includes(String(close.status || ""))
  )).length;

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        closings: (snapshot.meta.rows_returned.closings || 0) + manualRows.length,
      },
    },
    closings: [...snapshot.closings, ...manualRows],
    summary: {
      ...snapshot.summary,
      totals: reconciledTotals,
      alerts: {
        ...snapshot.summary.alerts,
        unresolvedVariances: Number(snapshot.summary.alerts.unresolvedVariances || 0) + unresolvedVariances,
      },
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationCloseReviews(snapshot: SimulationSnapshot, reviews: SimulationCloseReview[]): SimulationSnapshot {
  if (!reviews.length) return snapshot;

  reviews.forEach((review) => assertSimulationCloseReviewPayload(snapshot, review));

  const closings = reviews.reduce((currentClosings, review) => (
    currentClosings.map((close) => {
      const matchesReview = String(close.id) === String(review.closeId) || String(close.name) === String(review.closeId);
      if (!matchesReview) return close;
      if (String((close as Record<string, unknown>).managerReviewState || close.status || "") === "approved") {
        return close;
      }
      if (review.decision === "approved") {
        return {
          ...close,
          status: "approved",
          managerReviewState: "approved",
          investigationStatus: "Approved by manager",
          reviewedAt: review.reviewed_at,
          reviewed_by: "Simulation manager",
          notes: review.note || close.notes || "Approved by manager after variance review.",
        };
      }
      if (review.decision === "rejected") {
        return {
          ...close,
          status: "issue",
          managerReviewState: "rejected",
          investigationStatus: "Rejected - investigation open",
          reviewedAt: review.reviewed_at,
          reviewed_by: "Simulation manager",
          notes: review.note || "Rejected by manager: variance requires cashier explanation.",
        };
      }
      return {
        ...close,
        managerReviewState: (close as Record<string, unknown>).managerReviewState || "noted",
        reviewedAt: review.reviewed_at,
        reviewed_by: "Simulation manager",
        notes: review.note || close.notes,
      };
    })
  ), snapshot.closings);
  const unresolvedVariances = closings.filter((close) => (
    ["pending", "issue"].includes(String(close.status || ""))
  )).length;
  return {
    ...snapshot,
    closings,
    summary: {
      ...snapshot.summary,
      alerts: {
        ...snapshot.summary.alerts,
        unresolvedVariances,
      },
    },
  };
}

export function applyManualSimulationTransfers(snapshot: SimulationSnapshot, manualTransfers: SimulationManualTransfer[]): SimulationSnapshot {
  if (!manualTransfers.length) return snapshot;

  const seenTransferKeys = new Set<string>();
  (snapshot.transfers || []).forEach((transfer) => {
    [transfer.id, transfer.name].filter(Boolean).forEach((key) => seenTransferKeys.add(String(key)));
  });
  const uniqueManualTransfers = manualTransfers.filter((entry) => {
    const keys = [entry.name].filter(Boolean).map(String);
    if (keys.some((key) => seenTransferKeys.has(key))) return false;
    keys.forEach((key) => seenTransferKeys.add(key));
    return true;
  });
  if (!uniqueManualTransfers.length) return snapshot;
  uniqueManualTransfers.forEach((entry) => assertSimulationTransferPayload(snapshot, entry));

  const manualRows = uniqueManualTransfers.map((entry) => {
    const lines = stockTransferPayloadLines(entry).map((line) => {
      const stockRow = snapshot.warehouse_stock.find((row) => row.item === line.itemId)
        || snapshot.kiosk_stock_rows.find((row) => row.item === line.itemId);
      return {
        product: line.itemId,
        qty: Number(line.qty || 0),
        doneQty: 0,
        receivedQty: 0,
        uom: line.uom || String(stockRow?.uom || "Units"),
      };
    });
    const kioskName = simulationKioskName(snapshot, entry.kioskId);
    return {
      id: 990000 + entry.sequence,
      name: entry.name,
      from: entry.fromWarehouse || "Central Warehouse",
      to: kioskName,
      toKioskId: entry.kioskId,
      location_src: entry.fromWarehouse || "Central Warehouse",
      location_dest: kioskName,
      bayaan_state: entry.bayaan_state || "draft",
      state: "assigned",
      scheduledAt: entry.created_at,
      createdAt: entry.created_at,
      doneAt: null,
      movedQty: 0,
      receiptShortageQty: 0,
      source: "manual_simulation_transfer",
      lines,
    };
  });
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, { transferRows: manualRows.length });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        transfers: (snapshot.meta.rows_returned.transfers || 0) + manualRows.length,
      },
    },
    transfers: [...snapshot.transfers, ...manualRows],
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationPurchaseOrders(snapshot: SimulationSnapshot, manualPurchaseOrders: SimulationManualPurchaseOrder[]): SimulationSnapshot {
  if (!manualPurchaseOrders.length) return snapshot;

  const seenPurchaseKeys = new Set<string>();
  (snapshot.purchase_orders || []).forEach((purchaseOrder) => {
    [purchaseOrder.id, purchaseOrder.name].filter(Boolean).forEach((key) => seenPurchaseKeys.add(String(key)));
  });
  const uniqueManualPurchaseOrders = manualPurchaseOrders.filter((entry) => {
    const keys = [entry.name].filter(Boolean).map(String);
    if (keys.some((key) => seenPurchaseKeys.has(key))) return false;
    keys.forEach((key) => seenPurchaseKeys.add(key));
    return true;
  });
  if (!uniqueManualPurchaseOrders.length) return snapshot;
  uniqueManualPurchaseOrders.forEach((entry) => assertSimulationPurchaseOrderPayload(snapshot, entry));

  const manualRows = uniqueManualPurchaseOrders.map((entry) => {
    const lines = entry.items.map((line) => {
      const stockRow = simulationStockRow(snapshot, line.itemId);
      const product = String(stockRow?.item || line.itemId);
      return {
        product,
        orderedQty: Number(line.qty || 0),
        receivedQty: 0,
        uom: String(stockRow?.uom || "Units"),
        priceUnit: Number(line.rate || 0),
      };
    });
    return {
      id: 980000 + entry.sequence,
      name: entry.name,
      supplier: entry.supplier,
      state: entry.state,
      receipt_state: entry.receipt_state,
      amount_total: simulationRoundMoney(lines.reduce((sum, line) => sum + Number(line.orderedQty || 0) * Number(line.priceUnit || 0), 0)),
      expected_date: entry.scheduleDate || snapshot.meta.simulation.current.slice(0, 10),
      warehouse: String(entry.warehouse || "Baghdad Area Warehouse"),
      invoice: entry.invoiceRef || entry.invoiceName || "-",
      createdAt: entry.created_at,
      source: "manual_simulation_purchase_order",
      lines,
    };
  });
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, { purchaseOrders: manualRows.length });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        purchaseOrders: (snapshot.meta.rows_returned.purchaseOrders || 0) + manualRows.length,
      },
    },
    purchase_orders: [...manualRows, ...snapshot.purchase_orders],
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationStockItems(snapshot: SimulationSnapshot, manualStockItems: SimulationManualStockItem[]): SimulationSnapshot {
  if (!manualStockItems.length) return snapshot;

  const seenStockItemKeys = new Set<string>();
  (snapshot.products || []).forEach((product) => {
    [product.default_code, product.name].filter(Boolean).forEach((key) => seenStockItemKeys.add(String(key).toLowerCase()));
  });
  (snapshot.warehouse_stock || []).forEach((row) => {
    [row.item, row.name].filter(Boolean).forEach((key) => seenStockItemKeys.add(String(key).toLowerCase()));
  });
  const uniqueManualStockItems = manualStockItems.filter((entry) => {
    const keys = [entry.default_code, entry.code, entry.name].filter(Boolean).map((key) => String(key).toLowerCase());
    if (keys.some((key) => seenStockItemKeys.has(key))) return false;
    keys.forEach((key) => seenStockItemKeys.add(key));
    return true;
  });
  if (!uniqueManualStockItems.length) return snapshot;
  uniqueManualStockItems.forEach((entry) => assertSimulationStockItemPayload(snapshot, entry));

  const productRows = uniqueManualStockItems.map((entry) => {
    const consumptionMode: "recipe" | "finished" | "hybrid" = entry.consumptionMode === "recipe" || entry.consumptionMode === "hybrid"
      ? entry.consumptionMode
      : "finished";
    return {
      default_code: entry.default_code,
      name: entry.name,
      category: entry.category || "Ingredients",
      list_price: Number(entry.listPrice || 0),
      standard_price: Number(entry.unitCost || entry.purchasePrice || 0),
      consumption_mode: consumptionMode,
      available_in_pos: Boolean(entry.availableInPos),
      target_qty: Number(entry.targetQty || 0),
      reorder_qty: Number(entry.reorderQty || 0),
      critical_qty: Number(entry.criticalQty || 0),
      max_qty: Number(entry.maxQty || 0),
      stock_priority_weight: Number(entry.priorityWeight || 1),
    };
  });
  const warehouseRows = uniqueManualStockItems.map((entry) => ({
    item: entry.default_code,
    name: entry.name,
    actual_qty: 0,
    qty: 0,
    uom: entry.uom || "Units",
    category: entry.category || "Ingredients",
    unit_cost: Number(entry.unitCost || entry.purchasePrice || 0),
    standard_price: Number(entry.unitCost || entry.purchasePrice || 0),
    default_purchase_qty: String(entry.uom || "").toLowerCase() === "kg" ? 25 : String(entry.uom || "").toLowerCase() === "l" ? 50 : 100,
    supplier: entry.supplier || "",
    target_qty: Number(entry.targetQty || 0),
    reorder_qty: Number(entry.reorderQty || 0),
    critical_qty: Number(entry.criticalQty || 0),
    max_qty: Number(entry.maxQty || 0),
  }));
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, {
    productRows: productRows.length,
    warehouseStockRows: warehouseRows.length,
  });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        products: (snapshot.meta.rows_returned.products || 0) + productRows.length,
        warehouseStock: (snapshot.meta.rows_returned.warehouseStock || 0) + warehouseRows.length,
      },
    },
    products: [...productRows, ...snapshot.products],
    warehouse_stock: [...warehouseRows, ...snapshot.warehouse_stock],
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationProductCatalog(snapshot: SimulationSnapshot, manualProducts: SimulationManualProductCatalog[]): SimulationSnapshot {
  if (!manualProducts.length) return snapshot;

  const uniqueManualProducts: SimulationManualProductCatalog[] = [];
  const seenManualKeys = new Set<string>();
  manualProducts.forEach((entry) => {
    const keys = [entry.id, entry.default_code, entry.code, entry.name].filter(Boolean).map((key) => simulationStockKey(key));
    if (keys.some((key) => seenManualKeys.has(key))) return;
    keys.forEach((key) => seenManualKeys.add(key));
    uniqueManualProducts.push(entry);
  });
  if (!uniqueManualProducts.length) return snapshot;
  uniqueManualProducts.forEach((entry) => assertSimulationProductCatalogPayload(entry));

  let createdRows = 0;
  const products = [...snapshot.products];
  uniqueManualProducts.forEach((entry) => {
    const row = simulationManualProductCatalogRow(entry);
    const entryKeys = [entry.id, entry.default_code, entry.code, entry.name].filter(Boolean).map((key) => simulationStockKey(key));
    const existingIndex = products.findIndex((product) => (
      [(product as Record<string, unknown>).id, product.default_code, product.name]
        .filter(Boolean)
        .some((key) => entryKeys.includes(simulationStockKey(key)))
    ));
    if (existingIndex >= 0) {
      products[existingIndex] = {
        ...products[existingIndex],
        ...row,
        default_code: products[existingIndex]?.default_code || row.default_code,
      };
    } else {
      products.unshift(row);
      createdRows += 1;
    }
  });

  if (!createdRows) {
    return {
      ...snapshot,
      products,
    };
  }
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, { productRows: createdRows });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        products: (snapshot.meta.rows_returned.products || 0) + createdRows,
      },
    },
    products,
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

export function applyManualSimulationSuppliers(snapshot: SimulationSnapshot, manualSuppliers: SimulationManualSupplier[]): SimulationSnapshot {
  if (!manualSuppliers.length) return snapshot;

  manualSuppliers.forEach((entry) => assertSimulationSupplierPayload(entry));

  const seenSupplierKeys = new Set<string>();
  (snapshot.suppliers || []).forEach((supplier) => {
    [supplier.id, supplier.name].filter(Boolean).forEach((key) => seenSupplierKeys.add(String(key).toLowerCase()));
  });
  const uniqueManualSuppliers = manualSuppliers.filter((entry) => {
    const keys = [entry.id, entry.name].filter(Boolean).map((key) => String(key).toLowerCase());
    if (keys.some((key) => seenSupplierKeys.has(key))) return false;
    keys.forEach((key) => seenSupplierKeys.add(key));
    return true;
  });
  if (!uniqueManualSuppliers.length) return snapshot;

  const supplierRows = uniqueManualSuppliers.map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category || "Supplier",
    address: entry.address || "",
    deliveryCategory: entry.deliveryCategory || "Review",
    delivery_category: entry.deliveryCategory || "Review",
    spend30: 0,
    lastOrder: "New",
    last_order: "New",
    status: "good",
    products: [],
    lead_time_days: 1,
    source: "manual_simulation_supplier",
  }));
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, { supplierRows: supplierRows.length });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        suppliers: (snapshot.meta.rows_returned.suppliers || 0) + supplierRows.length,
      },
    },
    suppliers: [...supplierRows, ...snapshot.suppliers],
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

function simulationRecipeVersionRow(snapshot: SimulationSnapshot, entry: SimulationManualRecipeVersion) {
  const product = simulationProduct(snapshot, entry.product_code, entry.itemId);
  const productCode = String(product?.default_code || entry.product_code || entry.itemId);
  const productName = String(product?.name || entry.itemId);
  const lines = entry.ingredients.map((line) => {
    const stockRow = simulationStockRow(snapshot, line.ingredientId);
    const qty = Number(line.qty || 0);
    const unitCost = Number(stockRow?.unit_cost || stockRow?.standard_price || 0);
    return {
      ingredient: String(stockRow?.name || line.ingredientId),
      item: String(stockRow?.item || line.ingredientId),
      qty,
      uom: line.uom || String(stockRow?.uom || "Units"),
      cost: simulationRoundMoney(unitCost * qty),
    };
  });
  return {
    id: entry.id,
    product: productName,
    product_code: productCode,
    version: entry.version,
    effective_from: entry.effectiveFrom || entry.created_at.slice(0, 10),
    state: entry.state,
    estimated_unit_cost: simulationRoundMoney(lines.reduce((sum, line) => sum + Number(line.cost || 0), 0)),
    source: "manual_simulation_recipe_version",
    lines,
  };
}

export function applyManualSimulationRecipeVersions(snapshot: SimulationSnapshot, manualRecipeVersions: SimulationManualRecipeVersion[]): SimulationSnapshot {
  if (!manualRecipeVersions.length) return snapshot;

  const latestByProductKey = new Map<string, SimulationManualRecipeVersion>();
  manualRecipeVersions.forEach((entry) => {
    latestByProductKey.set(simulationStockKey(entry.product_code || entry.itemId), entry);
  });
  const latestRecipeVersions = Array.from(latestByProductKey.values());
  latestRecipeVersions.forEach((entry) => assertSimulationRecipeVersionPayload(snapshot, entry));
  const manualRows = latestRecipeVersions.map((entry) => simulationRecipeVersionRow(snapshot, entry));
  const manualRecipeKeys = new Set(manualRows.flatMap((row) => [
    simulationStockKey(row.product_code),
    simulationStockKey(row.product),
  ]));
  return {
    ...snapshot,
    recipes: [
      ...manualRows,
      ...snapshot.recipes.filter((recipe) => !manualRecipeKeys.has(simulationStockKey(recipe.product_code || recipe.product))),
    ],
  };
}

function simulationRecurringPurchaseRow(snapshot: SimulationSnapshot, entry: SimulationManualRecurringPurchase) {
  const lines = entry.items.map((line) => {
    const stockRow = simulationStockRow(snapshot, line.itemId);
    return {
      product: String(stockRow?.item || line.itemId),
      qty: Number(line.qty || 0),
      uom: line.uom || String(stockRow?.uom || "Units"),
      rate: Number(line.rate || stockRow?.unit_cost || stockRow?.standard_price || 0),
    };
  });
  const firstLine = lines[0] || { product: "", qty: 0, uom: "Units" };
  const frequency = entry.frequency || "weekly";
  const weekday = Number(entry.weekday || 0);
  const nextDate = entry.nextDate || snapshot.meta.simulation.current.slice(0, 10);
  return {
    id: entry.id,
    name: entry.name || `Recurring purchase ${entry.sequence}`,
    supplier: entry.supplier,
    warehouse: String(entry.warehouse || "Baghdad Area Warehouse"),
    cadence: frequency,
    frequency,
    weekday,
    next_run: nextDate,
    nextDate,
    product: firstLine.product,
    qty: firstLine.qty,
    uom: firstLine.uom,
    active: entry.active,
    createdAt: entry.created_at,
    source: "manual_simulation_recurring_purchase",
    lines,
  };
}

export function applyManualSimulationRecurringPurchases(snapshot: SimulationSnapshot, manualRecurringPurchases: SimulationManualRecurringPurchase[]): SimulationSnapshot {
  if (!manualRecurringPurchases.length) return snapshot;

  const seenRecurringKeys = new Set<string>();
  (snapshot.recurring_purchases || []).forEach((plan) => {
    [plan.id, plan.name].filter(Boolean).forEach((key) => seenRecurringKeys.add(String(key).toLowerCase()));
  });
  const uniqueManualRecurringPurchases = manualRecurringPurchases.filter((entry) => {
    const keys = [entry.id, entry.name].filter(Boolean).map((key) => String(key).toLowerCase());
    if (keys.some((key) => seenRecurringKeys.has(key))) return false;
    keys.forEach((key) => seenRecurringKeys.add(key));
    return true;
  });
  if (!uniqueManualRecurringPurchases.length) return snapshot;
  uniqueManualRecurringPurchases.forEach((entry) => assertSimulationRecurringPurchasePayload(snapshot, entry));

  const manualRows = uniqueManualRecurringPurchases.map((entry) => simulationRecurringPurchaseRow(snapshot, entry));
  const sourceCounts = addSimulationSourceCounts(snapshot.summary.sourceCounts, { recurringPurchaseRows: manualRows.length });
  const reportPeriods = simulationReportPeriodsWithSourceCounts(snapshot.summary.reportPeriods, sourceCounts);
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      rows_returned: {
        ...snapshot.meta.rows_returned,
        recurringPurchases: (snapshot.meta.rows_returned.recurringPurchases || 0) + manualRows.length,
      },
    },
    recurring_purchases: [...manualRows, ...snapshot.recurring_purchases],
    summary: {
      ...snapshot.summary,
      sourceCounts,
      reportPeriods,
    },
  };
}

function simulationReportPeriodsWithPayroll(
  reportPeriods: SimulationSnapshot["summary"]["reportPeriods"],
  payrollExpense: number,
  operatingExpenses = 0,
  sourceCounts?: SimulationSnapshot["summary"]["sourceCounts"],
): SimulationSnapshot["summary"]["reportPeriods"] {
  const adjustPeriod = (period: typeof reportPeriods.daily, multiplier: number) => {
    const periodPayroll = simulationRoundMoney(payrollExpense * multiplier);
    const periodOperatingExpenses = simulationRoundMoney(operatingExpenses * multiplier);
    const netProfit = Number(period.netProfit || 0);
    const nextPeriod = {
      ...period,
      ...(sourceCounts ? { sourceCounts } : {}),
      payrollExpense: periodPayroll,
      operatingExpenses: periodOperatingExpenses,
      netProfit,
    };
    return {
      ...nextPeriod,
      netProfitAfterPayroll: simulationNetAfterPayroll(nextPeriod),
    };
  };
  return {
    daily: adjustPeriod(reportPeriods.daily, 1),
    weekly: adjustPeriod(reportPeriods.weekly, 7),
    monthly: adjustPeriod(reportPeriods.monthly, 30),
    yearly: adjustPeriod(reportPeriods.yearly, 365),
  };
}

export function applyManualSimulationHr(
  snapshot: SimulationSnapshot,
  manualEmployees: SimulationManualHrEmployee[],
  manualShifts: SimulationManualHrShift[],
  manualCoverageRules: SimulationManualHrCoverageRule[],
  manualAttendance: SimulationManualHrAttendance[],
  manualAdjustments: SimulationManualPayrollAdjustment[],
  manualPayrollRuns: SimulationManualPayrollRun[],
  manualOperatingExpenses: SimulationManualOperatingExpense[] = [],
): SimulationSnapshot {
  if (
    !manualEmployees.length
    && !manualShifts.length
    && !manualCoverageRules.length
    && !manualAttendance.length
    && !manualAdjustments.length
    && !manualPayrollRuns.length
    && !manualOperatingExpenses.length
  ) {
    return snapshot;
  }

  manualEmployees.forEach((employee) => assertSimulationHrEmployeePayload(snapshot, employee));
  manualCoverageRules.forEach((rule) => assertSimulationHrCoverageRulePayload(snapshot, rule));
  manualPayrollRuns.forEach((run) => assertSimulationPayrollRunPayload(run));
  manualOperatingExpenses.forEach((expense) => assertSimulationOperatingExpensePayload(expense));

  const existingEmployeeKeys = new Set((snapshot.hr?.employees || []).flatMap((employee) => [
    simulationStockKey(employee.id),
    simulationStockKey(employee.name),
  ]));
  const employeeRows = manualEmployees
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .filter((employee) => {
      const keys = [employee.id, employee.name].map((value) => simulationStockKey(value));
      if (keys.some((key) => existingEmployeeKeys.has(key))) return false;
      keys.forEach((key) => existingEmployeeKeys.add(key));
      return true;
    })
    .map((employee) => simulationManualHrEmployeeRow(snapshot, employee));
  const employees = [...employeeRows, ...(snapshot.hr?.employees || [])];
  const employeeSnapshot = {
    ...snapshot,
    hr: {
      ...snapshot.hr,
      employees,
    },
  };
  manualShifts.forEach((shift) => assertSimulationHrShiftPayload(employeeSnapshot, shift));
  manualAttendance.forEach((attendance) => assertSimulationHrAttendancePayload(employeeSnapshot, attendance));
  manualAdjustments.forEach((adjustment) => assertSimulationPayrollAdjustmentPayload(employeeSnapshot, adjustment));

  const shiftById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "shifts").map((shift) => [String(shift.id), shift]));
  manualShifts
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((shift) => {
      shiftById.set(String(shift.id), simulationManualHrShiftRow(employeeSnapshot, shift));
    });

  const coverageRuleById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "coverageRules").map((rule) => [String(rule.id || rule.ruleId), rule]));
  manualCoverageRules
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((rule) => {
      coverageRuleById.set(String(rule.id), simulationManualCoverageRuleRow(snapshot, rule));
    });

  const attendanceById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "attendance").map((row) => [String(row.id), row]));
  manualAttendance
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((attendance) => {
      attendanceById.set(String(attendance.id), {
        id: attendance.id,
        employee: attendance.employeeName,
        employeeId: attendance.employee,
        kiosk: attendance.kiosk || "",
        checkIn: attendance.checkIn || "",
        checkOut: attendance.checkOut || "",
        manualHours: attendance.manualHours,
        workedHours: attendance.workedHours || attendance.manualHours || 0,
        note: attendance.note,
        state: attendance.state,
        created_at: attendance.created_at,
      });
    });

  const adjustmentById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "adjustments").map((adjustment) => [String(adjustment.id), adjustment]));
  manualAdjustments
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((adjustment) => {
      adjustmentById.set(String(adjustment.id), {
        id: adjustment.id,
        employee: adjustment.employeeName,
        employeeId: adjustment.employee,
        type: adjustment.type,
        amount: simulationRoundMoney(Number(adjustment.amount || 0)),
        reason: adjustment.reason,
        date: adjustment.date,
        state: adjustment.state,
        created_at: adjustment.created_at,
      });
    });

  const payrollRunById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "payrollRuns").map((run) => [String(run.id), run]));
  manualPayrollRuns
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((run) => {
      payrollRunById.set(String(run.id), {
        id: run.id,
        name: run.name,
        dateFrom: run.dateFrom,
        dateTo: run.dateTo,
        state: run.state,
        gross: run.gross,
        net: run.net,
        adjustments: run.adjustments,
        created_at: run.created_at,
      });
    });

  const expenseById = new Map<string, Record<string, unknown>>(simulationHrRows(snapshot, "expenses").map((expense) => [String(expense.id), expense]));
  manualOperatingExpenses
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((expense) => {
      expenseById.set(String(expense.id), {
        id: expense.id,
        name: expense.name,
        category: expense.category,
        amount: simulationRoundMoney(Number(expense.amount || 0)),
        date: expense.date || "",
        note: expense.note || "",
        created_at: expense.created_at,
      });
    });

  const approvedManualAdjustments = manualAdjustments.filter((adjustment) => adjustment.state === "approved");
  const basePayroll = simulationRoundMoney(employees.reduce((sum, employee) => sum + Number(employee.monthlySalary || 0), 0));
  const payrollRuns = Array.from(payrollRunById.values());
  const officialPayrollRuns = payrollRuns
    .filter((run) => ["reviewed", "approved", "paid"].includes(String(run.state || "").toLowerCase()))
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const latestOfficialPayrollRun = officialPayrollRuns[officialPayrollRuns.length - 1];
  const adjustmentImpact = simulationPayrollAdjustmentImpact(manualAdjustments);
  const payrollExpense = Math.max(0, simulationRoundMoney(basePayroll + adjustmentImpact));
  const reportPayrollExpense = Math.max(0, simulationRoundMoney(
    latestOfficialPayrollRun
      ? Number(latestOfficialPayrollRun.net || 0)
      : payrollExpense,
  ));
  const operatingExpenseTotal = simulationRoundMoney(Array.from(expenseById.values()).reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
  const sourceCounts = {
    ...snapshot.summary.sourceCounts,
    hrEmployeeRows: employees.length,
    hrShiftRows: shiftById.size,
    hrCoverageRuleRows: coverageRuleById.size,
    hrAttendanceRows: attendanceById.size,
    payrollAdjustmentRows: adjustmentById.size,
    payrollRunRows: payrollRunById.size,
    operatingExpenseRows: expenseById.size,
  };
  const reportPeriods = simulationReportPeriodsWithPayroll(snapshot.summary.reportPeriods, reportPayrollExpense, operatingExpenseTotal, sourceCounts);
  const totals = {
    ...snapshot.summary.totals,
    payrollExpense: reportPayrollExpense,
    operatingExpenses: operatingExpenseTotal,
    netProfitAfterPayroll: reportPeriods.daily.netProfitAfterPayroll,
  };
  return {
    ...snapshot,
    hr: {
      ...snapshot.hr,
      employees,
      shifts: Array.from(shiftById.values()),
      coverageRules: Array.from(coverageRuleById.values()),
      attendance: Array.from(attendanceById.values()),
      adjustments: Array.from(adjustmentById.values()),
      payrollRuns: Array.from(payrollRunById.values()).reverse(),
      expenses: Array.from(expenseById.values()).reverse(),
      summary: {
        ...(snapshot.hr?.summary || {}),
        onShift: employees.filter((employee) => employee.status !== "leave" && (employee as Record<string, unknown>).active !== false).length,
        gaps: (snapshot.hr?.coverageGaps || []).length,
        payrollAccrued: payrollExpense,
        payrollBase: basePayroll,
        payrollAdjustmentImpact: adjustmentImpact,
        approvedAdjustments: approvedManualAdjustments.length,
        operatingExpenses: operatingExpenseTotal,
      },
    },
    summary: {
      ...snapshot.summary,
      totals,
      sourceCounts,
      reportPeriods,
    },
  } as unknown as SimulationSnapshot;
}

function transferActionState(action: StockTransferActionPayload["action"]) {
  const stateByAction: Record<StockTransferActionPayload["action"], string> = {
    approve: "approved",
    pick: "picked",
    dispatch: "dispatched",
    receive: "received",
    cancel: "cancelled",
  };
  const state = stateByAction[action];
  if (!state) throw new Error(`Unsupported simulation transfer action: ${action || "empty value"}`);
  return state;
}

function purchaseActionState(action: PurchaseOrderActionPayload["action"]) {
  if (action === "receive") return { state: "done", receipt_state: "done" };
  if (action === "confirm") return { state: "purchase", receipt_state: "none" };
  if (action === "cancel") return { state: "cancelled", receipt_state: "cancelled" };
  throw new Error(`Unsupported simulation purchase action: ${action || "empty value"}`);
}

function isReceivedTransferState(state: unknown) {
  return ["received", "completed", "done"].includes(String(state || "").toLowerCase());
}

function canReceiveSimulationTransfer(state: unknown) {
  return ["dispatched", "partial"].includes(String(state || "").toLowerCase());
}

function canApplySimulationTransferAction(action: StockTransferActionPayload["action"], state: unknown) {
  const currentState = String(state || "").toLowerCase();
  if (isReceivedTransferState(currentState)) return false;
  if (currentState === "cancelled" || currentState === "cancel") return false;
  if (currentState === "partial") return action === "receive";
  if (action === "approve") return ["draft", "assigned"].includes(currentState);
  if (action === "pick") return currentState === "approved";
  if (action === "dispatch") return currentState === "picked";
  if (action === "receive") return canReceiveSimulationTransfer(currentState);
  if (action === "cancel") return true;
  return true;
}

function isDonePurchaseOrder(purchaseOrder: Record<string, unknown>) {
  return ["done", "received"].includes(String(purchaseOrder.receipt_state || purchaseOrder.state || "").toLowerCase());
}

function isCancelledPurchaseOrder(purchaseOrder: Record<string, unknown>) {
  return ["cancelled", "cancel"].includes(String(purchaseOrder.receipt_state || purchaseOrder.state || "").toLowerCase());
}

function canApplySimulationPurchaseAction(action: PurchaseOrderActionPayload["action"], purchaseOrder: Record<string, unknown>) {
  if (isCancelledPurchaseOrder(purchaseOrder)) return false;
  if (isDonePurchaseOrder(purchaseOrder)) return false;
  if (action === "receive") return true;
  if (action === "confirm") return ["draft", "sent", "created", "rfq"].includes(String(purchaseOrder.state || "").toLowerCase());
  if (action === "cancel") return true;
  return true;
}

function simulationPurchaseActionKey(action: SimulationPurchaseAction) {
  const items = (action.items || [])
    .map((item) => `${simulationStockKey(item.itemId)}:${Number(item.qty || 0)}`)
    .sort()
    .join("|");
  return [
    action.po,
    action.action,
    action.state,
    action.receipt_state,
    action.acted_at,
    items,
  ].map((value) => String(value ?? "")).join("::");
}

function simulationTransferActionKey(action: SimulationTransferAction) {
  const items = (action.items || [])
    .map((item) => `${simulationStockKey(item.itemId)}:${Number(item.qty || 0)}`)
    .sort()
    .join("|");
  return [
    action.transfer,
    action.action,
    action.bayaan_state,
    action.acted_at,
    items,
  ].map((value) => String(value ?? "")).join("::");
}

function simulationStockTargetPatch<T extends Record<string, unknown>>(row: T): T {
  const actual = Number(row.actual_qty ?? row.qty ?? row.actual ?? 0);
  const target = Number(row.target_qty ?? row.target ?? 0);
  const reorder = Number(row.reorder_qty ?? row.reorder ?? 0);
  const critical = Number(row.critical_qty ?? row.critical ?? 0);
  const next: Record<string, unknown> = { ...row };
  if (target > 0) {
    next.stock_percent = Math.max(0, Math.min(100, simulationRoundQty((actual / target) * 100)));
  }
  if (target > 0 || reorder > 0 || critical > 0) {
    next.stock_status = actual <= 0
      ? "empty"
      : critical > 0 && actual <= critical
        ? "critical"
        : reorder > 0 && actual <= reorder
          ? "low"
          : "ok";
  }
  return next as T;
}

function adjustSimulationStockRow<T extends Record<string, unknown>>(row: T, delta: number): T {
  const nextQty = simulationRoundQty(Number(row.actual_qty ?? row.qty ?? 0) + delta);
  return simulationStockTargetPatch({ ...row, actual_qty: nextQty, qty: nextQty } as T);
}

function adjustSimulationDetailRow<T extends Record<string, unknown>>(row: T, delta: number): T {
  const nextActual = simulationRoundQty(Number(row.actual_qty ?? row.actual ?? 0) + delta);
  return simulationStockTargetPatch({
    ...row,
    received: simulationRoundQty(Number(row.received || 0) + Math.max(0, delta)),
    expected: nextActual,
    actual: nextActual,
    actual_qty: nextActual,
    qty: nextActual,
  } as T);
}

export function applyManualSimulationTransferActions(snapshot: SimulationSnapshot, actions: SimulationTransferAction[]): SimulationSnapshot {
  if (!actions.length) return snapshot;

  actions.forEach((action) => assertSimulationTransferActionPayload(snapshot, action));

  const receivedDeltasByKioskItem = new Map<string, number>();
  const warehouseDeltasByItem = new Map<string, number>();
  const warehouseAvailableByItem = new Map(snapshot.warehouse_stock.map((row) => [
    String(row.item || ""),
    Number(row.actual_qty ?? row.qty ?? 0),
  ]));

  const transfers = snapshot.transfers.map((transfer) => {
    const seenActionKeys = new Set<string>();
    const orderedActions = actions
      .filter((action) => String(action.transfer) === String(transfer.id) || String(action.transfer) === String(transfer.name))
      .filter((action) => {
        const key = simulationTransferActionKey(action);
        if (seenActionKeys.has(key)) return false;
        seenActionKeys.add(key);
        return true;
      });
    return orderedActions
      .reduce((currentTransfer, action) => {
        const nextState = action.bayaan_state;
        const wasReceived = isReceivedTransferState(currentTransfer.bayaan_state || currentTransfer.state);
        const nowReceived = isReceivedTransferState(nextState);
        const currentState = currentTransfer.bayaan_state || currentTransfer.state;
        const actionAllowed = canApplySimulationTransferAction(action.action, currentState);
        if (actionAllowed && nowReceived) {
          assertSimulationTransferReceiptAction(currentTransfer, action);
        }
        let receiptShortageQty = 0;
        let movedQtyTotal = 0;
        let receiptComplete = nowReceived;
        let nextLines = currentTransfer.lines;

        if (!wasReceived && nowReceived && actionAllowed) {
          const requestedByItem = new Map((action.items || []).map((item) => [
            simulationStockKey(item.itemId),
            Number(item.qty || 0),
          ]));
          let requestedEveryRemainingLine = true;
          let orderedQtyTotal = 0;
          let receivedQtyTotal = 0;
          let receiptAttempted = false;
          let actionShortageQtyTotal = 0;
          nextLines = currentTransfer.lines?.map((line) => {
            const lineRecord = line as Record<string, unknown>;
            const qty = Number(lineRecord.qty ?? lineRecord.doneQty ?? 0);
            const item = String(line.product || "");
            if (!qty || !item) return line;
            const itemKey = simulationStockKey(item);
            const alreadyReceivedQty = Number(lineRecord.receivedQty || 0);
            const remainingQty = simulationRoundQty(Math.max(0, qty - alreadyReceivedQty));
            const requestedQty = requestedByItem.size
              ? Number(requestedByItem.get(itemKey) || 0)
              : remainingQty;
            if (requestedByItem.size && requestedQty < remainingQty) {
              requestedEveryRemainingLine = false;
            }
            const receiptQty = simulationRoundQty(Math.min(remainingQty, Math.max(0, requestedQty)));
            if (receiptQty > 0) receiptAttempted = true;
            orderedQtyTotal = simulationRoundQty(orderedQtyTotal + qty);
            const available = Math.max(0, Number(warehouseAvailableByItem.get(item) || 0));
            const movedQty = simulationRoundQty(Math.min(receiptQty, available));
            actionShortageQtyTotal = simulationRoundQty(actionShortageQtyTotal + Math.max(0, receiptQty - movedQty));
            warehouseAvailableByItem.set(item, simulationRoundQty(available - movedQty));
            const lineReceivedQty = simulationRoundQty(alreadyReceivedQty + movedQty);
            receivedQtyTotal = simulationRoundQty(receivedQtyTotal + lineReceivedQty);
            if (movedQty) {
              const kioskKey = `${currentTransfer.toKioskId}::${item}`;
              receivedDeltasByKioskItem.set(kioskKey, simulationRoundQty((receivedDeltasByKioskItem.get(kioskKey) || 0) + movedQty));
              warehouseDeltasByItem.set(item, simulationRoundQty((warehouseDeltasByItem.get(item) || 0) - movedQty));
            }
            return {
              ...line,
              doneQty: lineReceivedQty,
              receivedQty: lineReceivedQty,
            };
          });
          if (!receiptAttempted) return currentTransfer;
          receiptComplete = requestedEveryRemainingLine || receivedQtyTotal >= orderedQtyTotal;
          movedQtyTotal = receivedQtyTotal;
          receiptShortageQty = receiptComplete
            ? simulationRoundQty(Math.max(0, orderedQtyTotal - receivedQtyTotal))
            : simulationRoundQty(Number(currentTransfer.receiptShortageQty || 0) + actionShortageQtyTotal);
        }
        const resultingState = actionAllowed && nowReceived && !receiptComplete ? "partial" : nextState;

        return {
          ...currentTransfer,
          lines: nextLines,
          bayaan_state: actionAllowed ? resultingState : currentTransfer.bayaan_state,
          state: actionAllowed ? (nowReceived && receiptComplete ? "done" : nextState === "cancelled" ? "cancel" : "assigned") : currentTransfer.state,
          doneAt: actionAllowed && nowReceived && receiptComplete ? action.acted_at : currentTransfer.doneAt,
          receiptShortageQty: actionAllowed && nowReceived ? receiptShortageQty : currentTransfer.receiptShortageQty,
          movedQty: actionAllowed && nowReceived ? movedQtyTotal : currentTransfer.movedQty,
        };
      }, transfer);
  });

  if (!receivedDeltasByKioskItem.size && !warehouseDeltasByItem.size) {
    return { ...snapshot, transfers };
  }

  const adjustKioskRow = <T extends Record<string, unknown>>(row: T) => {
    const delta = receivedDeltasByKioskItem.get(`${row.kiosk}::${row.item}`) || 0;
    return delta ? adjustSimulationStockRow(row, delta) : row;
  };
  const adjustWarehouseRow = <T extends typeof snapshot.warehouse_stock[number]>(row: T) => {
    const delta = warehouseDeltasByItem.get(String(row.item || "")) || 0;
    return delta ? adjustSimulationStockRow(row, delta) : row;
  };
  const kioskStock = Object.fromEntries(Object.entries(snapshot.kiosk_stock).map(([kiosk, rows]) => [
    kiosk,
    rows.map((row) => {
      const delta = receivedDeltasByKioskItem.get(`${kiosk}::${row.item}`) || 0;
      return delta ? adjustSimulationStockRow(row, delta) : row;
    }),
  ])) as typeof snapshot.kiosk_stock;
  const kioskStockDetails = Object.fromEntries(Object.entries(snapshot.kioskStockDetails).map(([kiosk, rows]) => [
    kiosk,
    rows.map((row) => {
      const delta = receivedDeltasByKioskItem.get(`${kiosk}::${row.item}`) || 0;
      return delta ? adjustSimulationDetailRow(row, delta) : row;
    }),
  ])) as typeof snapshot.kioskStockDetails;
  const kioskStockRows = snapshot.kiosk_stock_rows.map(adjustKioskRow);
  const stockAlerts = simulationStockAlerts(kioskStockRows);

  return {
    ...snapshot,
    warehouse_stock: snapshot.warehouse_stock.map(adjustWarehouseRow),
    kiosk_stock: kioskStock,
    kiosk_stock_rows: kioskStockRows,
    kioskStockDetails,
    suggested_transfers: stockAlerts.suggestedTransfers,
    summary: {
      ...snapshot.summary,
      alerts: {
        ...snapshot.summary.alerts,
        lowStockItems: stockAlerts.lowStockItems,
      },
    },
    transfers,
  };
}

export function applyManualSimulationPurchaseActions(snapshot: SimulationSnapshot, actions: SimulationPurchaseAction[]): SimulationSnapshot {
  if (!actions.length) return snapshot;

  actions.forEach((action) => assertSimulationPurchaseActionPayload(snapshot, action));

  const warehouseDeltasByItem = new Map<string, number>();
  const purchase_orders = snapshot.purchase_orders.map((purchaseOrder) => {
    const seenActionKeys = new Set<string>();
    const orderedActions = actions
      .filter((action) => String(action.po) === String(purchaseOrder.id) || String(action.po) === String(purchaseOrder.name))
      .filter((action) => {
        const key = simulationPurchaseActionKey(action);
        if (seenActionKeys.has(key)) return false;
        seenActionKeys.add(key);
        return true;
      });
    return orderedActions
      .reduce((currentPurchaseOrder, action) => {
        if (!canApplySimulationPurchaseAction(action.action, currentPurchaseOrder)) return currentPurchaseOrder;
        if (action.action === "receive") {
          const requestedByItem = new Map((action.items || []).map((item) => [
            simulationStockKey(item.itemId),
            Number(item.qty || 0),
          ]));
          let receivedDeltaTotal = 0;
          const lines = currentPurchaseOrder.lines.map((line) => {
            const lineRecord = line as Record<string, unknown>;
            const orderedQty = Number(lineRecord.orderedQty ?? lineRecord.ordered_qty ?? lineRecord.qty ?? 0);
            const receivedQty = Number(lineRecord.receivedQty ?? lineRecord.received_qty ?? 0);
            const remainingQty = Math.max(0, orderedQty - receivedQty);
            const itemKey = simulationStockKey(line.product);
            const requestedQty = requestedByItem.size
              ? Number(requestedByItem.get(itemKey) || 0)
              : remainingQty;
            const delta = simulationRoundQty(Math.min(remainingQty, Math.max(0, requestedQty)));
            if (requestedByItem.size) {
              requestedByItem.set(itemKey, simulationRoundQty(Math.max(0, requestedQty - delta)));
            }
            receivedDeltaTotal = simulationRoundQty(receivedDeltaTotal + delta);
            if (delta > 0) {
              const item = String(line.product || "");
              warehouseDeltasByItem.set(item, simulationRoundQty((warehouseDeltasByItem.get(item) || 0) + delta));
            }
            return { ...line, receivedQty: simulationRoundQty(receivedQty + delta) };
          });
          if (!receivedDeltaTotal) return currentPurchaseOrder;
          const allDone = lines.every((line) => {
            const lineRecord = line as Record<string, unknown>;
            const orderedQty = Number(lineRecord.orderedQty ?? lineRecord.ordered_qty ?? lineRecord.qty ?? 0);
            const receivedQty = Number(lineRecord.receivedQty ?? lineRecord.received_qty ?? 0);
            return receivedQty >= orderedQty;
          });
          return {
            ...currentPurchaseOrder,
            state: allDone ? action.state : "partial",
            receipt_state: allDone ? action.receipt_state : "partial",
            receivedAt: action.acted_at,
            lines,
          };
        }
        return {
          ...currentPurchaseOrder,
          state: action.state,
          receipt_state: action.receipt_state,
        };
      }, purchaseOrder);
  });

  const warehouse_stock = warehouseDeltasByItem.size
    ? snapshot.warehouse_stock.map((row) => {
        const delta = warehouseDeltasByItem.get(String(row.item || "")) || 0;
        return delta ? adjustSimulationStockRow(row, delta) : row;
      })
    : snapshot.warehouse_stock;

  return {
    ...snapshot,
    warehouse_stock,
    purchase_orders,
  };
}

function createSimulationGateway(): SourceOfTruthGateway {
  const fallback = createNoopGateway();
  const seed = runtimeSimulationSeed();
  const minutes = runtimeSimulationMinutes();
  const loop = runtimeSimulationLoop();
  const speed = runtimeSimulationSpeed();
  let cursorMinute = runtimeSimulationStartsFull() ? minutes : 0;
  let loopCount = 0;
  let submittedSales = 0;
  let recurringRuns = 0;
  const subscribers = new Set<BayaanRealtimeOptions>();
  const manualSales: SimulationManualSale[] = [];
  const manualWaste: KioskWastePayload[] = [];
  const manualShiftCloses: SimulationManualShiftClose[] = [];
  const manualCloseReviews: SimulationCloseReview[] = [];
  const manualTransfers: SimulationManualTransfer[] = [];
  const manualTransferActions: SimulationTransferAction[] = [];
  const manualStockItems: SimulationManualStockItem[] = [];
  const manualProductCatalog: SimulationManualProductCatalog[] = [];
  const manualRecipeVersions: SimulationManualRecipeVersion[] = [];
  const manualSuppliers: SimulationManualSupplier[] = [];
  const manualRecurringPurchases: SimulationManualRecurringPurchase[] = [];
  const manualPurchaseOrders: SimulationManualPurchaseOrder[] = [];
  const manualPurchaseActions: SimulationPurchaseAction[] = [];
  const manualHrEmployees: SimulationManualHrEmployee[] = [];
  const manualHrShifts: SimulationManualHrShift[] = [];
  const manualHrCoverageRules: SimulationManualHrCoverageRule[] = [];
  const manualHrAttendance: SimulationManualHrAttendance[] = [];
  const manualPayrollAdjustments: SimulationManualPayrollAdjustment[] = [];
  const manualPayrollRuns: SimulationManualPayrollRun[] = [];
  const manualOperatingExpenses: SimulationManualOperatingExpense[] = [];
  const submittedSaleByExternalId = new Map<string, string>();
  const submittedWasteByExternalId = new Set<string>();
  const submittedCloseByName = new Map<string, { expectedCash: number; actualCash: number }>();
  const transferDraftByKey = new Map<string, string>();
  const purchaseOrderByKey = new Map<string, string>();
  const stockItemByKey = new Map<string, SimulationManualStockItem>();
  const productCatalogByKey = new Map<string, SimulationManualProductCatalog>();
  const recipeVersionByProductKey = new Map<string, SimulationManualRecipeVersion>();
  const supplierByKey = new Map<string, SimulationManualSupplier>();
  const recurringPurchaseByKey = new Map<string, SimulationManualRecurringPurchase>();
  const recurringRunPurchaseByKey = new Map<string, string>();
  const hrEmployeeByKey = new Map<string, SimulationManualHrEmployee>();
  const hrShiftByKey = new Map<string, string>();
  const hrCoverageRuleByKey = new Map<string, string>();
  const hrAttendanceByKey = new Map<string, string>();
  const payrollAdjustmentByKey = new Map<string, string>();
  const payrollRunById = new Map<string, SimulationManualPayrollRun>();
  const payrollRunByKey = new Map<string, string>();
  const operatingExpenseByKey = new Map<string, string>();

  const simulationAdjustmentDate = (value?: string) => String(value || snapshot().meta.simulation.current).slice(0, 10);
  const lockedPayrollRunForDate = (date: string) => simulationHrRows<SimulationManualPayrollRun>(snapshot(), "payrollRuns")
    .find((run) => (
      ["approved", "paid"].includes(String(run.state || "").toLowerCase())
      && String(run.dateFrom || "") <= date
      && String(run.dateTo || "") >= date
    ));
  const assertPayrollAdjustmentPeriodOpen = (date: string) => {
    if (lockedPayrollRunForDate(date)) {
      throw new Error("Payroll period is already approved or paid; create an adjustment for the next payroll run.");
    }
  };

  const baseSnapshot = () => applyManualSimulationRecipeVersions(
    applyManualSimulationProductCatalog(
      applyManualSimulationStockItems(
        applyManualSimulationSuppliers(
          createPeakSimulation({ seed, minutes, cursorMinute }),
          manualSuppliers,
        ),
        manualStockItems,
      ),
      manualProductCatalog,
    ),
    manualRecipeVersions,
  );
  const snapshot = () => applyManualSimulationHr(
    applyManualSimulationCloseReviews(
      applyManualSimulationShiftCloses(
        applyManualSimulationPurchaseActions(
          applyManualSimulationPurchaseOrders(
            applyManualSimulationRecurringPurchases(
              applyManualSimulationTransferActions(
                applyManualSimulationTransfers(
                  applyManualSimulationWaste(
                    applyManualSimulationSales(baseSnapshot(), manualSales),
                    manualWaste,
                  ),
                  manualTransfers,
                ),
                manualTransferActions,
              ),
              manualRecurringPurchases,
            ),
            manualPurchaseOrders,
          ),
          manualPurchaseActions,
        ),
        manualShiftCloses,
      ),
      manualCloseReviews,
    ),
    manualHrEmployees,
    manualHrShifts,
    manualHrCoverageRules,
    manualHrAttendance,
    manualPayrollAdjustments,
    manualPayrollRuns,
    manualOperatingExpenses,
  );
  const mutablePayrollSummary = () => {
    const current = snapshot();
    const employees = simulationHrRows<Record<string, unknown>>(current, "employees");
    const payrollBase = simulationRoundMoney(employees.reduce((sum, employee) => sum + Number(employee.monthlySalary || 0), 0));
    const payrollAdjustmentImpact = simulationPayrollAdjustmentImpact(manualPayrollAdjustments);
    return {
      payrollBase,
      payrollAdjustmentImpact,
      payrollAccrued: Math.max(0, simulationRoundMoney(payrollBase + payrollAdjustmentImpact)),
    };
  };
  const emitManualEvent = (event: BayaanRealtimeEvent) => {
    subscribers.forEach((subscriber) => {
      subscriber.onStatus?.("live");
      subscriber.onEvent({
        severity: "success",
        occurredAt: snapshot().meta.simulation.current,
        ...event,
      });
    });
  };

  return {
    ...fallback,
    enabled: true,
    async getAuthStatus() {
      return SIMULATION_AUTH;
    },
    async login(_payload: LoginPayload) {
      return SIMULATION_AUTH;
    },
    async logout() {
      return { simulation: true, loggedOut: true };
    },
    async getChainBootstrap() {
      return snapshot();
    },
    async getWarehouseSetup() {
      const current = snapshot();
      return {
        engine: current.engine,
        company: current.company,
        warehouses: [{ id: 1, name: "Central Warehouse", code: "WH-CENTRAL" }],
        locations: [
          { id: 1, name: "Central Warehouse", usage: "internal" },
          ...current.kiosks.map((kiosk) => ({ id: kiosk.id, name: `${kiosk.kiosk_code} Stock Location`, usage: "internal" })),
        ],
        kiosks: current.kiosks,
        pos_configs: current.kiosks.map((kiosk) => ({
          id: kiosk.id,
          name: `${kiosk.kiosk_code} POS`,
          kiosk: kiosk.kiosk_code,
          active: true,
        })),
      };
    },
    async getPaymentGateways() {
      return {
        engine: "bayaan_peak_simulation",
        providers: [
          { id: "cash", label: "Cash", category: "cash", active: true },
          { id: "bank_card", label: "Bank card terminal", category: "card", active: true },
          { id: "fib", label: "FIB", category: "bank_app", active: true },
          { id: "zain_cash", label: "Zain Cash", category: "mobile_wallet", active: true },
          { id: "fastpay", label: "FastPay", category: "mobile_wallet", active: true },
        ],
      };
    },
    async getAuditLog(payload: AuditLogPayload = {}) {
      const current = snapshot();
      const events = [
        ...current.today.orders.slice(0, 8).map((order) => ({
          id: order.id,
          type: "pos.order.paid",
          title: order.name,
          detail: `${order.kiosk} paid order ${order.amount_total}`,
          occurredAt: order.date_order,
        })),
        ...current.transfers.map((transfer) => ({
          id: transfer.id,
          type: "stock.transfer.state",
          title: transfer.name,
          detail: `${transfer.toKioskId} transfer ${transfer.bayaan_state}`,
          occurredAt: transfer.scheduledAt,
        })),
      ];
      return {
        engine: current.engine,
        events: events.slice(0, payload.limit || 25),
      };
    },
    subscribeRealtime(options: BayaanRealtimeOptions) {
      let closed = false;
      let timer: ReturnType<typeof setInterval> | null = null;
      const tickMs = runtimeSimulationTickMs();
      subscribers.add(options);
      options.onStatus?.("connecting");
      const emit = () => {
        if (closed) return;
        if (cursorMinute >= minutes) {
          if (!loop) return;
          cursorMinute = 0;
          loopCount += 1;
        } else {
          cursorMinute += 1;
        }
        const current = snapshot();
        options.onStatus?.("live");
        options.onEvent({
          id: `SIM-${seed}-${loopCount}-${cursorMinute}`,
          type: "simulation.minute",
          action: "simulation.minute",
          severity: cursorMinute >= minutes ? "success" : "info",
          title: `Simulation minute ${cursorMinute}/${minutes} x${speed}`,
          detail: `${current.summary.sourceCounts.orders} paid orders, ${current.summary.sourceCounts.consumptionRows} ledger rows`,
          occurredAt: current.meta.simulation.current,
          payload: {
            seed,
            cursorMinute,
            minutes,
            speed,
            loopCount,
            orders: current.summary.sourceCounts.orders,
            transfers: current.summary.sourceCounts.transferRows,
          },
        });
        if (cursorMinute >= minutes && !loop && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
      timer = setInterval(emit, tickMs);
      window.setTimeout(() => {
        if (!closed) {
          const current = snapshot();
          options.onStatus?.("live");
          options.onEvent({
            id: `SIM-${seed}-${loopCount}-0`,
            type: "simulation.start",
            action: "simulation.start",
            severity: "info",
            title: `Simulation ready 0/${minutes} x${speed}`,
            detail: `${current.summary.sourceCounts.orders} paid orders at start`,
            occurredAt: current.meta.simulation.current,
            payload: { seed, cursorMinute, minutes, speed, loopCount, orders: 0 },
          });
        }
      }, 80);
      return {
        close: () => {
          closed = true;
          subscribers.delete(options);
          if (timer) clearInterval(timer);
          options.onStatus?.("closed");
        },
      };
    },
    async openSession(payload: OpenSessionPayload) {
      return { id: `SIM-SESSION-${payload.kiosk}`, state: "opened" };
    },
    async submitKioskSale(payload: KioskSalePayload) {
      const existingName = submittedSaleByExternalId.get(payload.external_id);
      if (existingName) {
        return {
          simulation: true,
          external_id: payload.external_id,
          name: existingName,
          state: "paid",
          consumption_state: "posted",
        };
      }
      const lineTotal = simulationSaleLineTotal(payload);
      const paymentTotal = simulationSalePaymentTotal(payload);
      if (lineTotal <= 0 || paymentTotal <= 0 || lineTotal !== paymentTotal) {
        throw new Error(`Simulation sale ${payload.external_id} is not balanced: lines ${lineTotal}, payments ${paymentTotal}`);
      }
      assertSimulationSalePayload(snapshot(), payload);
      submittedSales += 1;
      const name = `SIM-MANUAL-${String(submittedSales).padStart(4, "0")}`;
      const recordedAt = snapshot().meta.simulation.current;
      const amount = paymentTotal;
      manualSales.push({
        ...payload,
        name,
        recorded_at: recordedAt,
        sequence: submittedSales,
      });
      submittedSaleByExternalId.set(payload.external_id, name);
      emitManualEvent({
        id: `${name}-EVENT`,
        type: "pos.order.paid",
        action: "pos.order.paid",
        title: `${name} paid`,
        detail: `${payload.kiosk} cashier sale posted for IQD ${amount.toLocaleString("en")}`,
        kiosk: payload.kiosk,
        reference: name,
        payload: { external_id: payload.external_id, amount, kiosk: payload.kiosk },
      });
      return {
        simulation: true,
        external_id: payload.external_id,
        name,
        state: "paid",
        consumption_state: "posted",
      };
    },
    async submitStockTransfer(payload: StockTransferPayload) {
      assertSimulationTransferPayload(snapshot(), payload);
      const createdAt = snapshot().meta.simulation.current;
      const items = stockTransferPayloadLines(payload);
      const itemKey = simulationLineItemsKey(items);
      const transferKey = [
        payload.kioskId,
        itemKey,
        payload.fromWarehouse || "",
      ].join("::");
      const existingName = transferDraftByKey.get(transferKey);
      if (existingName) {
        const existingTransfer = snapshot().transfers.find((row) => row.name === existingName);
        return {
          simulation: true,
          name: existingName,
          bayaan_state: existingTransfer?.bayaan_state || "draft",
        };
      }
      const baseName = `SIM-DRAFT-${payload.kioskId}-${items[0]?.itemId || "TRANSFER"}`;
      const name = snapshot().transfers.some((row) => row.name === baseName)
        ? `${baseName}-${String(manualTransfers.length + 1).padStart(4, "0")}`
        : baseName;
      manualTransfers.push({
        ...payload,
        name,
        bayaan_state: "draft",
        created_at: createdAt,
        sequence: manualTransfers.length + 1,
      });
      transferDraftByKey.set(transferKey, name);
      emitManualEvent({
        id: `${name}-EVENT`,
        type: "transfer.created",
        action: "transfer.created",
        title: `${name} created`,
        detail: `${items.length} item(s) drafted for ${payload.kioskId}`,
        kiosk: payload.kioskId,
        reference: name,
        payload: { transfer: name, kiosk: payload.kioskId, items },
      });
      return {
        simulation: true,
        name,
        bayaan_state: "draft",
      };
    },
    async stockTransferAction(payload: StockTransferActionPayload) {
      const bayaanState = transferActionState(payload.action);
      const current = snapshot();
      const transfer = current.transfers.find((row) => (
        String(row.id) === String(payload.transfer)
        || String(row.name) === String(payload.transfer)
      ));
      if (!transfer) {
        throw new Error(`Transfer ${payload.transfer} not found in simulation`);
      }
      const actionRecord: SimulationTransferAction = {
        ...payload,
        bayaan_state: bayaanState,
        acted_at: current.meta.simulation.current,
      };
      assertSimulationTransferActionPayload(current, actionRecord);
      const currentState = transfer.bayaan_state || transfer.state || "draft";
      if (!canApplySimulationTransferAction(payload.action, currentState)) {
        return {
          simulation: true,
          id: payload.transfer,
          bayaan_state: currentState,
        };
      }
      assertSimulationTransferReceiptAction(transfer, payload);
      manualTransferActions.push(actionRecord);
      const nextTransfer = snapshot().transfers.find((row) => (
        String(row.id) === String(payload.transfer)
        || String(row.name) === String(payload.transfer)
      ));
      const actualState = nextTransfer?.bayaan_state || bayaanState;
      emitManualEvent({
        id: `SIM-TRANSFER-ACTION-${payload.transfer}-${manualTransferActions.length}`,
        type: "transfer.state.changed",
        action: "transfer.state.changed",
        title: `Transfer ${actualState}`,
        detail: `${payload.transfer} moved to ${actualState}`,
        reference: String(payload.transfer),
        payload: { transfer: payload.transfer, bayaan_state: actualState },
      });
      return {
        simulation: true,
        id: payload.transfer,
        bayaan_state: actualState,
      };
    },
    async requestStock(payload: StockRequestPayload) {
      // Stock requests are a live-backend feature; simulation just acknowledges.
      return { simulation: true, requested: true, kiosk: payload.kioskId };
    },
    async submitPurchaseOrder(payload: PurchaseOrderPayload) {
      assertSimulationPurchaseOrderPayload(snapshot(), payload);
      const createdAt = snapshot().meta.simulation.current;
      const purchaseKey = simulationPurchaseOrderCreateKey(payload);
      const existingName = purchaseOrderByKey.get(purchaseKey);
      if (existingName) {
        const existingPo = snapshot().purchase_orders.find((row) => row.name === existingName);
        return {
          simulation: true,
          name: existingName,
          state: existingPo?.state || (payload.submit ? "purchase" : "draft"),
          receipt_state: existingPo?.receipt_state || "none",
        };
      }
      const name = `PO/SIM/MANUAL-${String(manualPurchaseOrders.length + 1).padStart(4, "0")}`;
      const state = payload.submit ? "purchase" : "draft";
      manualPurchaseOrders.push({
        ...payload,
        name,
        state,
        receipt_state: "none",
        created_at: createdAt,
        sequence: manualPurchaseOrders.length + 1,
      });
      purchaseOrderByKey.set(purchaseKey, name);
      emitManualEvent({
        id: `${name}-EVENT`,
        type: "purchase.order.created",
        action: "purchase.order.created",
        title: `${name} created`,
        detail: `${payload.supplier} purchase order created for ${payload.items.length} line(s)`,
        reference: name,
        payload: { po: name, supplier: payload.supplier, warehouse: payload.warehouse, lines: payload.items.length },
      });
      return {
        simulation: true,
        name,
        state,
        receipt_state: "none",
      };
    },
    async createStockItem(payload: CreateStockItemPayload) {
      assertSimulationStockItemPayload(snapshot(), payload);
      const defaultCode = simulationStockItemCode(payload);
      const stockKey = simulationStockKey(defaultCode || payload.name);
      const existingItem = stockItemByKey.get(stockKey);
      if (existingItem) {
        return {
          simulation: true,
          product: simulationManualStockItemProduct(existingItem),
        };
      }
      const current = snapshot();
      const existingProduct = current.products.find((product) => (
        simulationStockKey(product.default_code) === stockKey
        || simulationStockKey(product.name) === stockKey
      ));
      if (existingProduct) {
        return {
          simulation: true,
          product: existingProduct,
        };
      }
      const sequence = manualStockItems.length + 1;
      const id = 960000 + sequence;
      const item: SimulationManualStockItem = {
        ...payload,
        id,
        default_code: defaultCode || `SIM-ITEM-${String(sequence).padStart(4, "0")}`,
        created_at: snapshot().meta.simulation.current,
        sequence,
      };
      manualStockItems.push(item);
      stockItemByKey.set(stockKey, item);
      stockItemByKey.set(simulationStockKey(item.name), item);
      emitManualEvent({
        id: `SIM-STOCK-ITEM-${item.default_code}`,
        type: "stock.item.created",
        action: "stock.item.created",
        title: `${item.default_code} created`,
        detail: `${item.name} added to simulated stock catalog`,
        reference: item.default_code,
        payload: { item: item.default_code, name: item.name, uom: item.uom },
      });
      return {
        simulation: true,
        product: simulationManualStockItemProduct(item),
      };
    },
    async upsertProductCatalog(payload: ProductCatalogPayload) {
      assertSimulationProductCatalogPayload(payload);
      const defaultCode = simulationProductCatalogCode(payload);
      const productKey = simulationStockKey(payload.id || defaultCode || payload.name);
      const existingManual = productCatalogByKey.get(productKey)
        || productCatalogByKey.get(simulationStockKey(defaultCode))
        || productCatalogByKey.get(simulationStockKey(payload.name));
      const current = snapshot();
      const existingProduct = current.products.find((product) => (
        (payload.id != null && simulationStockKey((product as Record<string, unknown>).id) === simulationStockKey(payload.id))
        || simulationStockKey(product.default_code) === simulationStockKey(defaultCode)
        || simulationStockKey(product.name) === simulationStockKey(payload.name)
      ));
      const sequence = existingManual?.sequence || manualProductCatalog.length + 1;
      const entry: SimulationManualProductCatalog = {
        ...existingManual,
        ...payload,
        id: existingManual?.id || (existingProduct as Record<string, unknown> | undefined)?.id as string | number | undefined || payload.id || 940000 + sequence,
        default_code: existingManual?.default_code || existingProduct?.default_code || defaultCode,
        created_at: existingManual?.created_at || current.meta.simulation.current,
        sequence,
      };
      if (!existingManual) manualProductCatalog.push(entry);
      const keys = [entry.id, entry.default_code, entry.code, entry.name].filter(Boolean).map((key) => simulationStockKey(key));
      keys.forEach((key) => productCatalogByKey.set(key, entry));
      const product = applyManualSimulationProductCatalog(snapshot(), [entry]).products.find((row) => (
        simulationStockKey(row.default_code) === simulationStockKey(entry.default_code)
        || simulationStockKey(row.name) === simulationStockKey(entry.name)
      )) || simulationManualProductCatalogRow(entry);
      emitManualEvent({
        id: `SIM-PRODUCT-${entry.default_code}`,
        type: "product.catalog.saved",
        action: "product.catalog.saved",
        title: `${entry.default_code} saved`,
        detail: `${entry.name} saved to simulated product catalog`,
        reference: entry.default_code,
        payload: { product: entry.default_code, name: entry.name, mode: entry.consumptionMode },
      });
      return {
        simulation: true,
        product: { ...product, id: entry.id },
      };
    },
    async createSupplier(payload: CreateSupplierPayload) {
      assertSimulationSupplierPayload(payload);
      const supplierKey = simulationStockKey(payload.name);
      const existingSupplier = supplierByKey.get(supplierKey)
        || snapshot().suppliers.find((supplier) => simulationStockKey(supplier.name) === supplierKey);
      if (existingSupplier) {
        return {
          simulation: true,
          supplier: existingSupplier,
        };
      }
      const sequence = manualSuppliers.length + 1;
      const supplier: SimulationManualSupplier = {
        ...payload,
        id: 950000 + sequence,
        created_at: snapshot().meta.simulation.current,
        sequence,
      };
      manualSuppliers.push(supplier);
      supplierByKey.set(supplierKey, supplier);
      const supplierRow = applyManualSimulationSuppliers(snapshot(), [supplier]).suppliers[0];
      emitManualEvent({
        id: `SIM-SUPPLIER-${supplier.id}`,
        type: "supplier.created",
        action: "supplier.created",
        title: `${supplier.name} created`,
        detail: `${supplier.name} added to simulated supplier catalog`,
        reference: String(supplier.id),
        payload: { supplier: supplier.name, category: supplier.category },
      });
      return {
        simulation: true,
        supplier: supplierRow,
      };
    },
    async submitRecipeVersion(payload: RecipeVersionPayload) {
      const current = snapshot();
      assertSimulationRecipeVersionPayload(current, payload);
      const product = simulationProduct(current, payload.itemId);
      const productCode = String(product?.default_code || payload.itemId);
      const recipeKey = simulationStockKey(productCode);
      const existingRecipe = recipeVersionByProductKey.get(recipeKey);
      const sequence = existingRecipe?.sequence || manualRecipeVersions.length + 1;
      const entry: SimulationManualRecipeVersion = {
        ...existingRecipe,
        ...payload,
        id: existingRecipe?.id || 930000 + sequence,
        product_code: productCode,
        version: `manual-sim-v${sequence}`,
        created_at: existingRecipe?.created_at || current.meta.simulation.current,
        sequence,
        state: payload.submit === false ? "draft" : "active",
      };
      if (!existingRecipe) manualRecipeVersions.push(entry);
      recipeVersionByProductKey.set(recipeKey, entry);
      const recipe = simulationRecipeVersionRow(snapshot(), entry);
      emitManualEvent({
        id: `SIM-RECIPE-${entry.product_code}`,
        type: "recipe.version.saved",
        action: "recipe.version.saved",
        title: `${entry.product_code} recipe saved`,
        detail: `${entry.ingredients.length} ingredient line(s) saved to simulated recipe version`,
        reference: entry.product_code,
        payload: { product: entry.product_code, version: entry.version, state: entry.state },
      });
      return {
        simulation: true,
        recipe_version: recipe,
      };
    },
    async createRecurringPurchase(payload: RecurringPurchasePayload) {
      assertSimulationRecurringPurchasePayload(snapshot(), payload);
      const recurringKey = simulationRecurringPurchaseCreateKey(payload);
      const existingRecurring = recurringPurchaseByKey.get(recurringKey);
      if (existingRecurring) {
        return {
          simulation: true,
          recurring_purchase: simulationRecurringPurchaseRow(snapshot(), existingRecurring),
        };
      }
      const currentPlan = snapshot().recurring_purchases.find((plan) => (
        (payload.id != null && String(plan.id) === String(payload.id))
        || (payload.name && String(plan.name || "").toLowerCase() === payload.name.toLowerCase())
      ));
      if (currentPlan) {
        return { simulation: true, recurring_purchase: currentPlan };
      }
      const sequence = manualRecurringPurchases.length + 1;
      const id = 970000 + sequence;
      const createdAt = snapshot().meta.simulation.current;
      const entry: SimulationManualRecurringPurchase = {
        ...payload,
        id,
        created_at: createdAt,
        sequence,
        active: payload.active ?? true,
      };
      manualRecurringPurchases.push(entry);
      recurringPurchaseByKey.set(recurringKey, entry);
      const recurringPurchase = simulationRecurringPurchaseRow(snapshot(), entry);
      emitManualEvent({
        id: `${id}-EVENT`,
        type: "purchase.recurring.created",
        action: "purchase.recurring.created",
        title: `${recurringPurchase.name} scheduled`,
        detail: `${payload.supplier} recurring purchase saved for ${payload.items.length} line(s)`,
        reference: String(id),
        payload: { recurring_purchase: id, supplier: payload.supplier, lines: payload.items.length },
      });
      return { simulation: true, recurring_purchase: recurringPurchase };
    },
    async recurringPurchaseAction(payload: { id: string | number; action: "run" }) {
      const current = snapshot();
      const plan = current.recurring_purchases.find((row) => (
        String(row.id) === String(payload.id)
        || String(row.name) === String(payload.id)
      ));
      if (!plan) {
        throw new Error(`Recurring purchase ${payload.id} not found in simulation`);
      }
      if (plan.active === false) {
        return {
          simulation: true,
          recurring_purchase: payload.id,
          skipped: true,
          reason: "inactive",
        };
      }
      const runDate = String(plan.nextDate || plan.next_run || current.meta.simulation.current.slice(0, 10));
      const runKey = `${String(plan.id || payload.id)}::${runDate}`;
      const existingName = recurringRunPurchaseByKey.get(runKey);
      if (existingName) {
        return {
          simulation: true,
          purchase_order: {
            name: existingName,
            state: "purchase",
            receipt_state: "none",
          },
        };
      }
      recurringRuns += 1;
      const name = `PO/SIM/REC-${String(recurringRuns).padStart(4, "0")}`;
      const items = (plan.lines || []).map((line) => ({
        itemId: String((line as Record<string, unknown>).product || (line as Record<string, unknown>).item || ""),
        qty: Number(line.qty || 0),
        rate: Number((line as Record<string, unknown>).rate || (line as Record<string, unknown>).priceUnit || 0),
      }));
      const purchasePayload: PurchaseOrderPayload = {
        supplier: String(plan.supplier || ""),
        warehouse: plan.warehouse || "Baghdad Area Warehouse",
        scheduleDate: plan.nextDate || plan.next_run || current.meta.simulation.current.slice(0, 10),
        submit: true,
        items,
      };
      assertSimulationPurchaseOrderPayload(current, purchasePayload);
      manualPurchaseOrders.push({
        ...purchasePayload,
        name,
        state: "purchase",
        receipt_state: "none",
        created_at: current.meta.simulation.current,
        sequence: manualPurchaseOrders.length + 1,
      });
      recurringRunPurchaseByKey.set(runKey, name);
      emitManualEvent({
        id: `${name}-EVENT`,
        type: "purchase.recurring.ran",
        action: "purchase.recurring.ran",
        title: `${name} created from recurring plan`,
        detail: `${plan.name || payload.id} generated a purchase order`,
        reference: name,
        payload: { recurring_purchase: payload.id, purchase_order: name },
      });
      return {
        simulation: true,
        purchase_order: {
          name,
          state: "purchase",
          receipt_state: "none",
        },
      };
    },
    async purchaseOrderAction(payload: PurchaseOrderActionPayload) {
      const state = purchaseActionState(payload.action);
      const current = snapshot();
      const purchaseOrder = current.purchase_orders.find((row) => (
        String(row.id) === String(payload.po)
        || String(row.name) === String(payload.po)
      ));
      if (!purchaseOrder) {
        throw new Error(`Purchase order ${payload.po} not found in simulation`);
      }
      const actionRecord: SimulationPurchaseAction = {
        ...payload,
        ...state,
        acted_at: current.meta.simulation.current,
      };
      assertSimulationPurchaseActionPayload(current, actionRecord);
      if (!canApplySimulationPurchaseAction(payload.action, purchaseOrder)) {
        return {
          simulation: true,
          id: payload.po,
          state: purchaseOrder.state,
          receipt_state: purchaseOrder.receipt_state,
        };
      }
      manualPurchaseActions.push(actionRecord);
      const nextPurchaseOrder = snapshot().purchase_orders.find((row) => (
        String(row.id) === String(payload.po)
        || String(row.name) === String(payload.po)
      ));
      const actualState = String(nextPurchaseOrder?.state || state.state);
      const actualReceiptState = String(nextPurchaseOrder?.receipt_state || state.receipt_state);
      emitManualEvent({
        id: `SIM-PURCHASE-ACTION-${payload.po}-${manualPurchaseActions.length}`,
        type: "purchase.receipt.changed",
        action: "purchase.receipt.changed",
        title: `Purchase ${actualReceiptState}`,
        detail: `${payload.po} moved to ${actualReceiptState}`,
        reference: String(payload.po),
        payload: { po: payload.po, state: actualState, receipt_state: actualReceiptState },
      });
      return {
        simulation: true,
        id: payload.po,
        state: actualState,
        receipt_state: actualReceiptState,
      };
    },
    async submitWaste(_waste: WasteRecord, kioskId: string) {
      return { simulation: true, kiosk: kioskId, state: "posted" };
    },
    async submitKioskWaste(payload: KioskWastePayload) {
      if (submittedWasteByExternalId.has(payload.external_id)) {
        return { simulation: true, external_id: payload.external_id, state: "posted" };
      }
      assertSimulationWastePayload(snapshot(), payload);
      manualWaste.push(payload);
      submittedWasteByExternalId.add(payload.external_id);
      return { simulation: true, external_id: payload.external_id, state: "posted" };
    },
    async submitShiftClose(payload: ShiftClosePayload) {
      const current = snapshot();
      assertSimulationShiftClosePayload(current, payload);
      const submittedAt = current.meta.simulation.current;
      const name = `SIM-CLOSE-${payload.kioskId}`;
      const existingClose = submittedCloseByName.get(name);
      if (existingClose) {
        return {
          simulation: true,
          name,
          status: "pending",
          expected_cash: existingClose.expectedCash,
          actual_cash: existingClose.actualCash,
        };
      }
      manualShiftCloses.push({
        ...payload,
        name,
        submitted_at: submittedAt,
      });
      const expectedCash = payload.shift.openingCash + payload.shift.sales
        .filter((sale) => sale.tender.method === "cash")
        .reduce((sum, sale) => sum + sale.total, 0);
      submittedCloseByName.set(name, { expectedCash, actualCash: payload.draft.actualCash });
      emitManualEvent({
        id: `${name}-EVENT`,
        type: "shift.close.submitted",
        action: "shift.close.submitted",
        title: `${name} submitted`,
        detail: `${payload.kioskId} close submitted with expected cash IQD ${simulationRoundMoney(expectedCash).toLocaleString("en")}`,
        kiosk: payload.kioskId,
        reference: name,
        payload: { expectedCash, actualCash: payload.draft.actualCash },
      });
      return {
        simulation: true,
        name,
        status: "pending",
        expected_cash: expectedCash,
        actual_cash: payload.draft.actualCash,
      };
    },
    async reviewShiftClose(payload: ShiftCloseReviewPayload) {
      const current = snapshot();
      const close = current.closings.find((row) => (
        String(row.id) === String(payload.closeId)
        || String(row.name) === String(payload.closeId)
      ));
      if (!close) {
        throw new Error(`Shift close ${payload.closeId} not found in simulation`);
      }
      const reviewRecord: SimulationCloseReview = {
        ...payload,
        reviewed_at: current.meta.simulation.current,
      };
      assertSimulationCloseReviewPayload(current, reviewRecord);
      const closeRecord = close as Record<string, unknown>;
      if (
        (payload.decision === "approved" && String(close.status || "") === "approved")
        || (payload.decision === "rejected" && String(closeRecord.managerReviewState || "") === "rejected")
      ) {
        return { simulation: true, id: payload.closeId, status: close.status };
      }
      if (String(closeRecord.managerReviewState || close.status || "") === "approved") {
        throw new Error(`Approved shift close ${payload.closeId} is locked`);
      }
      manualCloseReviews.push(reviewRecord);
      emitManualEvent({
        id: `SIM-CLOSE-REVIEW-${payload.closeId}-${manualCloseReviews.length}`,
        type: "shift.close.reviewed",
        action: "shift.close.reviewed",
        title: `Close ${payload.decision}`,
        detail: `${payload.closeId} manager review saved`,
        reference: String(payload.closeId),
        payload: { closeId: payload.closeId, decision: payload.decision },
      });
      return { simulation: true, id: payload.closeId, status: payload.decision };
    },
    async getHrSnapshot() {
      return snapshot().hr;
    },
    async getHrSchedule() {
      const hr = snapshot().hr;
      return {
        employees: hr.employees,
        coverageRules: hr.coverageRules,
        shifts: hr.shifts,
        coverageGaps: hr.coverageGaps,
      };
    },
    async createHrEmployee(payload: HrEmployeePayload) {
      const current = snapshot();
      const name = String(payload.name || "").trim();
      const monthlySalary = simulationRoundMoney(Number(payload.monthlySalary || 0));
      const expectedMonthlyHours = Number(payload.expectedMonthlyHours || 0);
      if (!name) throw new Error("Simulation HR employee requires a name");
      if (payload.kiosk && !simulationKioskRow(current, payload.kiosk)) {
        throw new Error(`Simulation kiosk ${payload.kiosk} was not found for HR employee`);
      }
      if (monthlySalary <= 0 || expectedMonthlyHours <= 0) {
        throw new Error("Simulation HR employee requires positive salary and expected hours");
      }

      const key = [
        simulationStockKey(name),
        simulationStockKey(payload.kiosk || ""),
        simulationStockKey(payload.role || "cashier"),
      ].join("::");
      const existing = simulationHrEmployee(current, name) || hrEmployeeByKey.get(key);
      if (existing) {
        const existingId = "id" in existing ? existing.id : name;
        return { simulation: true, employee: simulationHrEmployee(snapshot(), existingId) || existing };
      }

      const entry: SimulationManualHrEmployee = {
        ...payload,
        name,
        monthlySalary,
        expectedMonthlyHours,
        role: payload.role || "cashier",
        id: `SIM-HR-EMP-${manualHrEmployees.length + 1}`,
        created_at: current.meta.simulation.current,
        sequence: manualHrEmployees.length + 1,
      };
      manualHrEmployees.push(entry);
      hrEmployeeByKey.set(key, entry);
      emitManualEvent({
        id: `SIM-HR-EMPLOYEE-${entry.id}`,
        type: "hr.employee.created",
        action: "hr.employee.created",
        title: "HR employee created",
        detail: `${entry.name} added to simulation payroll`,
        reference: entry.id,
        payload: { employee: entry.id, kiosk: entry.kiosk },
      });
      return { simulation: true, employee: simulationHrEmployee(snapshot(), entry.id) };
    },
    async createHrShift(payload: HrShiftPayload) {
      const current = snapshot();
      const employee = simulationHrEmployee(current, payload.employee);
      if (!employee) throw new Error(`Simulation employee ${payload.employee} was not found for shift`);
      if (!simulationKioskRow(current, payload.kiosk)) throw new Error(`Simulation kiosk ${payload.kiosk} was not found for shift`);
      if (!payload.date || !payload.role) throw new Error("Simulation HR shift requires date and role");
      if (Number(payload.endHour || 0) <= Number(payload.startHour || 0)) {
        throw new Error("Simulation HR shift end must be after start");
      }
      const key = [
        simulationStockKey(employee.id),
        payload.kiosk,
        payload.date,
        payload.role,
        payload.startHour,
        payload.endHour,
      ].join("::");
      const existingId = hrShiftByKey.get(key);
      if (existingId) {
        return { simulation: true, shift: snapshot().hr.shifts.find((row) => String(row.id) === existingId) };
      }
      const entry: SimulationManualHrShift = {
        ...payload,
        id: `SIM-HR-SHIFT-${manualHrShifts.length + 1}`,
        employee: employee.id,
        state: payload.state || "planned",
        created_at: current.meta.simulation.current,
        sequence: manualHrShifts.length + 1,
      };
      manualHrShifts.push(entry);
      hrShiftByKey.set(key, entry.id);
      emitManualEvent({
        id: `SIM-HR-SHIFT-${entry.id}`,
        type: "hr.shift.created",
        action: "hr.shift.created",
        title: "Roster shift created",
        detail: `${employee.name} scheduled at ${entry.kiosk}`,
        reference: entry.id,
        payload: { shift: entry.id, employee: entry.employee, kiosk: entry.kiosk },
      });
      return { simulation: true, shift: snapshot().hr.shifts.find((row) => String(row.id) === entry.id) };
    },
    async updateHrShift(payload: HrShiftUpdatePayload) {
      const current = snapshot();
      const existing = current.hr.shifts.find((row) => String(row.id) === String(payload.id));
      if (!existing) throw new Error(`Simulation shift ${payload.id} was not found`);
      const employee = simulationHrEmployee(current, payload.employee);
      if (!employee) throw new Error(`Simulation employee ${payload.employee} was not found for shift update`);
      if (!simulationKioskRow(current, payload.kiosk)) throw new Error(`Simulation kiosk ${payload.kiosk} was not found for shift update`);
      if (Number(payload.endHour || 0) <= Number(payload.startHour || 0)) {
        throw new Error("Simulation HR shift end must be after start");
      }
      const entry: SimulationManualHrShift = {
        ...payload,
        id: String(payload.id),
        employee: employee.id,
        state: payload.state || "planned",
        created_at: current.meta.simulation.current,
        sequence: manualHrShifts.length + 1,
      };
      manualHrShifts.push(entry);
      emitManualEvent({
        id: `SIM-HR-SHIFT-UPDATE-${entry.id}-${entry.sequence}`,
        type: "hr.shift.updated",
        action: "hr.shift.updated",
        title: "Roster shift updated",
        detail: `${employee.name} shift saved`,
        reference: entry.id,
        payload: { shift: entry.id, employee: entry.employee, kiosk: entry.kiosk },
      });
      return { simulation: true, shift: snapshot().hr.shifts.find((row) => String(row.id) === entry.id) };
    },
    async createHrCoverageRule(payload: HrCoverageRulePayload) {
      const current = snapshot();
      if (!simulationKioskRow(current, payload.kiosk)) throw new Error(`Simulation kiosk ${payload.kiosk} was not found for coverage`);
      if (!payload.role || !payload.dayOfWeek) throw new Error("Simulation coverage rule requires role and day");
      if (Number(payload.endHour || 0) <= Number(payload.startHour || 0) || Number(payload.requiredCount || 0) <= 0) {
        throw new Error("Simulation coverage rule requires valid time and headcount");
      }
      const key = [
        payload.kiosk,
        payload.dayOfWeek,
        payload.role,
        payload.startHour,
        payload.endHour,
        payload.requiredCount,
      ].join("::");
      const existingId = hrCoverageRuleByKey.get(key);
      if (existingId) {
        const currentCoverageRules = simulationHrRows(snapshot(), "coverageRules");
        return { simulation: true, coverageRule: currentCoverageRules.find((row) => String(row.id || row.ruleId) === existingId) };
      }
      const entry: SimulationManualHrCoverageRule = {
        ...payload,
        id: `SIM-HR-COVERAGE-${manualHrCoverageRules.length + 1}`,
        created_at: current.meta.simulation.current,
        sequence: manualHrCoverageRules.length + 1,
      };
      manualHrCoverageRules.push(entry);
      hrCoverageRuleByKey.set(key, entry.id);
      emitManualEvent({
        id: `SIM-HR-COVERAGE-${entry.id}`,
        type: "hr.coverage.created",
        action: "hr.coverage.created",
        title: "Coverage rule created",
        detail: `${entry.kiosk} ${entry.role} coverage saved`,
        reference: entry.id,
        payload: { coverageRule: entry.id, kiosk: entry.kiosk },
      });
      return { simulation: true, coverageRule: simulationHrRows(snapshot(), "coverageRules").find((row) => String(row.id || row.ruleId) === entry.id) };
    },
    async submitHrAttendance(payload: HrAttendancePayload) {
      const current = snapshot();
      const employee = simulationHrEmployee(current, payload.employee);
      if (!employee) throw new Error(`Simulation employee ${payload.employee} was not found for attendance`);
      const manualHours = Number(payload.manualHours || 0);
      const workedHours = simulationAttendanceWorkedHours(payload);
      if (manualHours < 0 || (!payload.checkIn && !payload.checkOut && workedHours <= 0)) {
        throw new Error("Simulation attendance requires a check-in, check-out, or manual hours");
      }
      if (payload.checkIn && payload.checkOut && workedHours <= 0) {
        throw new Error("Simulation attendance check-out must be after check-in");
      }
      const key = [
        simulationStockKey(employee.id),
        payload.checkIn || "",
        payload.checkOut || "",
        payload.manualHours || "",
        payload.note || "",
      ].join("::");
      const existingId = hrAttendanceByKey.get(key);
      if (existingId) {
        return { simulation: true, attendance: snapshot().hr.attendance.find((row) => String(row.id) === existingId) };
      }
      const entry: SimulationManualHrAttendance = {
        ...payload,
        id: `SIM-HR-ATT-${manualHrAttendance.length + 1}`,
        employee: employee.id,
        employeeName: employee.name,
        kiosk: employee.kiosk,
        workedHours,
        state: payload.checkOut ? "checked_out" : "checked_in",
        created_at: current.meta.simulation.current,
        sequence: manualHrAttendance.length + 1,
      };
      manualHrAttendance.push(entry);
      hrAttendanceByKey.set(key, entry.id);
      emitManualEvent({
        id: `SIM-HR-ATTENDANCE-${entry.id}`,
        type: "hr.attendance.posted",
        action: "hr.attendance.posted",
        title: "Attendance posted",
        detail: `${entry.employeeName} attendance saved`,
        reference: entry.id,
        payload: { attendance: entry.id, employee: entry.employee },
      });
      return { simulation: true, attendance: snapshot().hr.attendance.find((row) => String(row.id) === entry.id) };
    },
    async submitPayrollAdjustment(payload: PayrollAdjustmentPayload) {
      const current = snapshot();
      const employee = simulationHrEmployee(current, payload.employee);
      const amount = simulationRoundMoney(Number(payload.amount || 0));
      const reason = String(payload.reason || "").trim();
      const date = simulationAdjustmentDate(payload.date);
      if (!employee) throw new Error(`Simulation employee ${payload.employee} was not found for payroll adjustment`);
      if (amount <= 0 || !reason) throw new Error("Simulation payroll adjustment requires amount and reason");
      assertPayrollAdjustmentPeriodOpen(date);
      const key = [
        simulationStockKey(employee.id),
        payload.type,
        amount,
        reason,
        date,
      ].join("::");
      const existingId = payrollAdjustmentByKey.get(key);
      if (existingId) {
        const existing = simulationHrRows<Record<string, unknown>>(snapshot(), "adjustments").find((row) => String(row.id) === existingId);
        const existingState = String(existing?.state || "").toLowerCase();
        if (!payload.approve || existingState === "approved") {
          return { simulation: true, adjustment: existing };
        }
        if (existingState === "rejected") {
          throw new Error(`Simulation payroll adjustment ${existingId} is already rejected`);
        }
        const entry: SimulationManualPayrollAdjustment = {
          id: existingId,
          employee: employee.id,
          employeeName: employee.name,
          type: payload.type,
          amount,
          reason,
          date,
          state: "approved",
          created_at: current.meta.simulation.current,
          sequence: manualPayrollAdjustments.length + 1,
        };
        assertSimulationPayrollAdjustmentPayload(current, entry);
        manualPayrollAdjustments.push(entry);
        emitManualEvent({
          id: `SIM-PAYROLL-ADJUSTMENT-${entry.id}-approved`,
          type: "payroll.adjustment.state",
          action: "payroll.adjustment.state",
          title: "Payroll adjustment updated",
          detail: `${entry.employeeName} ${entry.type} ${entry.state}`,
          reference: entry.id,
          payload: { adjustment: entry.id, employee: entry.employee, state: entry.state },
        });
        return { simulation: true, adjustment: simulationHrRows(snapshot(), "adjustments").find((row) => String(row.id) === entry.id) };
      }
      const entry: SimulationManualPayrollAdjustment = {
        ...payload,
        employee: employee.id,
        employeeName: employee.name,
        amount,
        reason,
        date,
        id: `SIM-PAY-ADJ-${manualPayrollAdjustments.length + 1}`,
        state: payload.approve ? "approved" : "draft",
        created_at: current.meta.simulation.current,
        sequence: manualPayrollAdjustments.length + 1,
      };
      assertSimulationPayrollAdjustmentPayload(current, entry);
      manualPayrollAdjustments.push(entry);
      payrollAdjustmentByKey.set(key, entry.id);
      emitManualEvent({
        id: `SIM-PAYROLL-ADJUSTMENT-${entry.id}`,
        type: "payroll.adjustment.posted",
        action: "payroll.adjustment.posted",
        title: "Payroll adjustment posted",
        detail: `${entry.employeeName} ${entry.type} ${entry.amount}`,
        reference: entry.id,
        payload: { adjustment: entry.id, employee: entry.employee, state: entry.state },
      });
      return { simulation: true, adjustment: simulationHrRows(snapshot(), "adjustments").find((row) => String(row.id) === entry.id) };
    },
    async payrollAdjustmentAction(payload: PayrollAdjustmentActionPayload) {
      const current = snapshot();
      const existing = simulationHrRows<Record<string, unknown>>(current, "adjustments")
        .find((row) => String(row.id) === String(payload.id));
      if (!existing) throw new Error(`Simulation payroll adjustment ${payload.id} was not found`);
      const action = String(payload.action || "").toLowerCase();
      if (!["approve", "reject"].includes(action)) {
        throw new Error(`Unsupported simulation payroll adjustment action: ${action || "empty value"}`);
      }
      const nextState = action === "approve" ? "approved" : "rejected";
      const existingState = String(existing.state || "").toLowerCase();
      if (existingState === nextState) {
        return { simulation: true, adjustment: existing };
      }
      if (["approved", "rejected"].includes(existingState)) {
        throw new Error(`Simulation payroll adjustment ${payload.id} is already ${existingState}`);
      }
      const date = simulationAdjustmentDate(String(existing.date || ""));
      assertPayrollAdjustmentPeriodOpen(date);
      const employeeRef = String(existing.employeeId || existing.employee || "");
      const employee = simulationHrEmployee(current, employeeRef);
      const entry: SimulationManualPayrollAdjustment = {
        id: String(existing.id),
        employee: employee?.id || employeeRef,
        employeeName: employee?.name || String(existing.employee || existing.employeeName || ""),
        type: String(existing.type || "deduction") as PayrollAdjustmentPayload["type"],
        amount: simulationRoundMoney(Number(existing.amount || 0)),
        reason: String(existing.reason || "Payroll adjustment"),
        date,
        state: nextState,
        created_at: current.meta.simulation.current,
        sequence: manualPayrollAdjustments.length + 1,
      };
      assertSimulationPayrollAdjustmentPayload(current, entry);
      manualPayrollAdjustments.push(entry);
      emitManualEvent({
        id: `SIM-PAYROLL-ADJUSTMENT-${entry.id}-${entry.state}`,
        type: "payroll.adjustment.state",
        action: "payroll.adjustment.state",
        title: "Payroll adjustment updated",
        detail: `${entry.employeeName} ${entry.type} ${entry.state}`,
        reference: entry.id,
        payload: { adjustment: entry.id, employee: entry.employee, state: entry.state },
      });
      return { simulation: true, adjustment: simulationHrRows(snapshot(), "adjustments").find((row) => String(row.id) === entry.id) };
    },
    async payrollRunAction(payload: PayrollRunPayload) {
      const current = snapshot();
      const normalizeRunAction = (value?: string) => {
        const action = String(value || "").toLowerCase();
        if (action === "recompute") return "compute";
        if (action === "approved") return "approve";
        if (action === "mark_paid") return "paid";
        return action;
      };
      const runKeyFor = (name?: unknown, dateFrom?: unknown, dateTo?: unknown) => [
        name,
        dateFrom,
        dateTo,
      ].map((value) => String(value || "").toLowerCase()).join("::");
      const recomputePayrollRun = (existing: SimulationManualPayrollRun | Record<string, unknown>) => {
        const summary = mutablePayrollSummary();
        const entry: SimulationManualPayrollRun = {
          id: String(existing.id),
          name: String(existing.name || payload.name || `Payroll ${existing.id}`),
          dateFrom: String(existing.dateFrom || payload.dateFrom || ""),
          dateTo: String(existing.dateTo || payload.dateTo || ""),
          state: "reviewed",
          gross: simulationRoundMoney(Number(summary.payrollBase || summary.payrollAccrued || 0)),
          net: simulationRoundMoney(Number(summary.payrollAccrued || 0)),
          adjustments: simulationRoundMoney(Number(summary.payrollAdjustmentImpact || 0)),
          created_at: snapshot().meta.simulation.current,
          sequence: manualPayrollRuns.length + 1,
        };
        assertSimulationPayrollRunPayload(entry);
        manualPayrollRuns.push(entry);
        payrollRunById.set(entry.id, entry);
        payrollRunByKey.set(runKeyFor(entry.name, entry.dateFrom, entry.dateTo), entry.id);
        emitManualEvent({
          id: `SIM-PAYROLL-RUN-${entry.id}-recomputed`,
          type: "payroll.run.computed",
          action: "payroll.run.computed",
          title: "Payroll run recomputed",
          detail: `${entry.name} net ${entry.net}`,
          reference: entry.id,
          payload: { payrollRun: entry.id, state: entry.state },
        });
        return entry;
      };
      const action = normalizeRunAction(payload.action || (payload.compute ? "compute" : ""));
      if (payload.id && action) {
        const existing = payrollRunById.get(String(payload.id))
          || simulationHrRows<SimulationManualPayrollRun>(current, "payrollRuns").find((run) => String(run.id) === String(payload.id));
        if (!existing) throw new Error(`Simulation payroll run ${payload.id} was not found`);
        const stateByAction = {
          approve: "approved",
          paid: "paid",
          cancel: "cancelled",
        } as const;
        const existingState = String(existing.state || "").toLowerCase();
        if (action === "compute") {
          if (["approved", "paid", "cancelled"].includes(existingState)) {
            return { simulation: true, ...existing };
          }
          return { simulation: true, ...recomputePayrollRun(existing) };
        }
        const nextState = stateByAction[action as keyof typeof stateByAction];
        if (!nextState) {
          throw new Error(`Unsupported simulation payroll run action: ${action || "empty value"}`);
        }
        if (action === "paid" && existingState !== "approved" && existingState !== "paid") {
          throw new Error("Approve simulation payroll before marking it paid");
        }
        if ((existingState === "paid" || existingState === "cancelled") && existingState !== nextState) {
          return { simulation: true, ...existing };
        }
        if (existingState === nextState) {
          return { simulation: true, ...existing };
        }
        const summary = simulationHrSummary(current);
        const entry: SimulationManualPayrollRun = {
          id: String(payload.id),
          name: String(existing.name || payload.name || `Payroll ${payload.id}`),
          dateFrom: String(existing.dateFrom || payload.dateFrom || ""),
          dateTo: String(existing.dateTo || payload.dateTo || ""),
          state: nextState,
          gross: simulationRoundMoney(Number(existing.gross || summary.payrollBase || summary.payrollAccrued || 0)),
          net: simulationRoundMoney(Number(existing.net || summary.payrollAccrued || 0)),
          adjustments: simulationRoundMoney(Number(existing.adjustments || summary.payrollAdjustmentImpact || 0)),
          created_at: current.meta.simulation.current,
          sequence: manualPayrollRuns.length + 1,
        };
        assertSimulationPayrollRunPayload(entry);
        manualPayrollRuns.push(entry);
        payrollRunById.set(entry.id, entry);
        payrollRunByKey.set(runKeyFor(entry.name, entry.dateFrom, entry.dateTo), entry.id);
        emitManualEvent({
          id: `SIM-PAYROLL-RUN-${entry.id}-${entry.state}`,
          type: "payroll.run.state",
          action: "payroll.run.state",
          title: "Payroll run updated",
          detail: `${entry.name} ${entry.state}`,
          reference: entry.id,
          payload: { payrollRun: entry.id, state: entry.state },
        });
        return { simulation: true, ...entry };
      }

      if (!payload.name || !payload.dateFrom || !payload.dateTo) {
        throw new Error("Simulation payroll run requires name, dateFrom, and dateTo");
      }
      if (action && action !== "compute") {
        throw new Error(`Simulation payroll run ${action} action requires an existing run id`);
      }
      const runKey = runKeyFor(payload.name, payload.dateFrom, payload.dateTo);
      const existingRunId = payrollRunByKey.get(runKey);
      const existingRun = existingRunId
        ? payrollRunById.get(existingRunId)
          || simulationHrRows<SimulationManualPayrollRun>(current, "payrollRuns").find((run) => String(run.id) === existingRunId)
        : null;
      if (existingRun) {
        const existingState = String(existingRun.state || "").toLowerCase();
        if (payload.compute && !["approved", "paid", "cancelled"].includes(existingState)) {
          return { simulation: true, ...recomputePayrollRun(existingRun) };
        }
        return { simulation: true, ...existingRun };
      }
      const summary = mutablePayrollSummary();
      const gross = simulationRoundMoney(Number(summary.payrollBase || summary.payrollAccrued || 0));
      const adjustments = simulationRoundMoney(Number(summary.payrollAdjustmentImpact || 0));
      const net = simulationRoundMoney(Number(summary.payrollAccrued || 0));
      const entry: SimulationManualPayrollRun = {
        id: `SIM-PAY-RUN-${manualPayrollRuns.length + 1}`,
        name: payload.name,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
        state: "reviewed",
        gross,
        net,
        adjustments,
        created_at: current.meta.simulation.current,
        sequence: manualPayrollRuns.length + 1,
      };
      assertSimulationPayrollRunPayload(entry);
      manualPayrollRuns.push(entry);
      payrollRunById.set(entry.id, entry);
      payrollRunByKey.set(runKey, entry.id);
      emitManualEvent({
        id: `SIM-PAYROLL-RUN-${entry.id}`,
        type: "payroll.run.computed",
        action: "payroll.run.computed",
        title: "Payroll run computed",
        detail: `${entry.name} net ${entry.net}`,
        reference: entry.id,
        payload: { payrollRun: entry.id, state: entry.state },
      });
      return { simulation: true, ...entry };
    },
    async submitOperatingExpense(payload: OperatingExpensePayload) {
      const current = snapshot();
      const name = String(payload.name || "").trim();
      const category = String(payload.category || "Operations").trim() || "Operations";
      const amount = simulationRoundMoney(Number(payload.amount || 0));
      if (!name || amount <= 0) {
        throw new Error("Simulation operating expense requires name and positive amount");
      }
      const key = [
        simulationStockKey(name),
        simulationStockKey(category),
        amount,
        payload.date || "",
      ].join("::");
      const existingId = operatingExpenseByKey.get(key);
      if (existingId) {
        return { simulation: true, expense: simulationHrRows(snapshot(), "expenses").find((row) => String(row.id) === existingId) };
      }
      const entry: SimulationManualOperatingExpense = {
        ...payload,
        name,
        category,
        amount,
        date: payload.date || current.meta.simulation.current.slice(0, 10),
        id: `SIM-EXP-${manualOperatingExpenses.length + 1}`,
        created_at: current.meta.simulation.current,
        sequence: manualOperatingExpenses.length + 1,
      };
      manualOperatingExpenses.push(entry);
      operatingExpenseByKey.set(key, entry.id);
      emitManualEvent({
        id: `SIM-OPERATING-EXPENSE-${entry.id}`,
        type: "hr.expense.posted",
        action: "hr.expense.posted",
        title: "Operating expense posted",
        detail: `${entry.name} ${entry.amount}`,
        reference: entry.id,
        payload: { expense: entry.id, category: entry.category, amount: entry.amount },
      });
      return { simulation: true, expense: simulationHrRows(snapshot(), "expenses").find((row) => String(row.id) === entry.id) };
    },
  };
}

function createNoopGateway() {
  return {
    enabled: false,
    async getAuthStatus() {
      return DEMO_AUTH;
    },
    async login(_payload: LoginPayload) {
      return DEMO_AUTH;
    },
    async logout() {
      return { skipped: true };
    },
    async getChainBootstrap() {
      return { skipped: true };
    },
    async getWarehouseSetup() {
      return { skipped: true };
    },
    async getPaymentGateways() {
      return { skipped: true };
    },
    async getAuditLog(_payload?: AuditLogPayload) {
      return { skipped: true, events: [] };
    },
    async resolveAiDashboardPlan(_payload: AiDashboardPlanPayload) {
      return { skipped: true };
    },
    async streamAiDashboardPlan(_payload: AiDashboardPlanPayload, handlers: AiDashboardStreamHandlers = {}) {
      const result = { skipped: true };
      handlers.onFinal?.(result);
      return result;
    },
    subscribeRealtime(_options: BayaanRealtimeOptions) {
      return { close: () => undefined };
    },
    async openSession(_payload: OpenSessionPayload) {
      return { id: undefined, state: "skipped" };
    },
    async createWarehouse(_payload: CreateWarehousePayload) {
      return { skipped: true };
    },
    async createKiosk(_payload: CreateKioskPayload) {
      return { skipped: true };
    },
    async createStockItem(_payload: CreateStockItemPayload) {
      return { skipped: true };
    },
    async upsertProductCatalog(_payload: ProductCatalogPayload) {
      return { skipped: true };
    },
    async createSupplier(_payload: CreateSupplierPayload) {
      return { skipped: true };
    },
    async submitSale(_sale: SaleRecord, _kioskId: string) {
      return { skipped: true };
    },
    async submitKioskSale(_payload: KioskSalePayload) {
      return { skipped: true };
    },
    async submitStockTransfer(_payload: StockTransferPayload) {
      return { skipped: true };
    },
    async stockTransferAction(_payload: StockTransferActionPayload) {
      return { skipped: true };
    },
    async requestStock(_payload: StockRequestPayload) {
      return { skipped: true };
    },
    async submitPurchaseOrder(_payload: PurchaseOrderPayload) {
      return { skipped: true };
    },
    async purchaseOrderAction(_payload: PurchaseOrderActionPayload) {
      return { skipped: true };
    },
    async createRecurringPurchase(_payload: RecurringPurchasePayload) {
      return { skipped: true };
    },
    async recurringPurchaseAction(_payload: { id: string | number; action: "run" }) {
      return { skipped: true };
    },
    async submitRecipeVersion(_payload: RecipeVersionPayload) {
      return { skipped: true };
    },
    async submitWaste(_waste: WasteRecord, _kioskId: string) {
      return { skipped: true };
    },
    async submitKioskWaste(_payload: KioskWastePayload) {
      return { skipped: true };
    },
    async submitShiftClose(_payload: ShiftClosePayload) {
      return { skipped: true };
    },
    async reviewShiftClose(_payload: ShiftCloseReviewPayload) {
      return { skipped: true };
    },
    async getHrSnapshot() {
      return { skipped: true, employees: [], attendance: [], adjustments: [], payrollRuns: [], expenses: [] };
    },
    async getHrSchedule(_payload?: HrSchedulePayload) {
      return { skipped: true, employees: [], coverageRules: [], shifts: [], coverageGaps: [] };
    },
    async createHrEmployee(_payload: HrEmployeePayload) {
      return { skipped: true };
    },
    async createHrShift(_payload: HrShiftPayload) {
      return { skipped: true };
    },
    async updateHrShift(_payload: HrShiftUpdatePayload) {
      return { skipped: true };
    },
    async createHrCoverageRule(_payload: HrCoverageRulePayload) {
      return { skipped: true };
    },
    async submitHrAttendance(_payload: HrAttendancePayload) {
      return { skipped: true };
    },
    async submitPayrollAdjustment(_payload: PayrollAdjustmentPayload) {
      return { skipped: true };
    },
    async payrollAdjustmentAction(_payload: PayrollAdjustmentActionPayload) {
      return { skipped: true };
    },
    async payrollRunAction(_payload: PayrollRunPayload) {
      return { skipped: true };
    },
    async submitOperatingExpense(_payload: OperatingExpensePayload) {
      return { skipped: true };
    },
  };
}
