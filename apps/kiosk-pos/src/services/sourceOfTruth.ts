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
  type BayaanRealtimeOptions,
  type BayaanRealtimeSubscription,
} from "./realtime";

export type ShiftCloseDraft = {
  actualCash: number;
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

type ShiftClosePayload = {
  kioskId: string;
  cashier: string;
  shift: ShiftState;
  stock: StockSnapshot[];
  draft: ShiftCloseDraft;
};

export type StockTransferPayload = {
  kioskId: string;
  itemId: string;
  qty: number;
  fromWarehouse?: string;
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
  frequency?: "weekly" | "biweekly" | "monthly";
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

export type PayrollRunPayload = {
  id?: string | number;
  name?: string;
  dateFrom?: string;
  dateTo?: string;
  compute?: boolean;
  action?: "compute" | "approve" | "paid" | "cancel";
};

export type AuditLogPayload = {
  limit?: number;
  afterId?: number;
  eventType?: string;
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
  createHrCoverageRule: (payload: HrCoverageRulePayload) => Promise<unknown>;
  submitHrAttendance: (payload: HrAttendancePayload) => Promise<unknown>;
  submitPayrollAdjustment: (payload: PayrollAdjustmentPayload) => Promise<unknown>;
  payrollRunAction: (payload: PayrollRunPayload) => Promise<unknown>;
};

export function createSourceOfTruthGateway(): SourceOfTruthGateway {
  const runtimeUrl = runtimeOdooUrl();
  const baseUrl = runtimeDemoMode() && !runtimeUrl ? "" : import.meta.env.VITE_ODOO_URL || runtimeUrl;
  const token = import.meta.env.VITE_ODOO_TOKEN;
  const db = import.meta.env.VITE_ODOO_DB || runtimeOdooDb();

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
    subscribeRealtime(options: BayaanRealtimeOptions) {
      return subscribeBayaanRealtime(client, options);
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
      return client.json("/bayaan/api/stock_transfer", {
        payload: {
          kiosk: payload.kioskId,
          item: payload.itemId,
          qty: payload.qty,
          uom: payload.uom,
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
      return client.json("/bayaan/api/shift_close", {
        payload: {
          kiosk: kioskId,
          cashier,
          opened_at: shift.openedAt,
          opening_cash: shift.openingCash,
          expected_cash: shift.openingCash + cashSales,
          actual_cash: draft.actualCash,
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
  };
}

function runtimeOdooUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("odooUrl") || window.localStorage.getItem("BAYAAN_ODOO_URL") || "";
}

function runtimeDemoMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("bayaanMode") === "demo" || window.localStorage.getItem("bayaan.mode.v1") === "demo";
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
      return { skipped: true, employees: [], attendance: [], adjustments: [], payrollRuns: [] };
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
    async createHrCoverageRule(_payload: HrCoverageRulePayload) {
      return { skipped: true };
    },
    async submitHrAttendance(_payload: HrAttendancePayload) {
      return { skipped: true };
    },
    async submitPayrollAdjustment(_payload: PayrollAdjustmentPayload) {
      return { skipped: true };
    },
    async payrollRunAction(_payload: PayrollRunPayload) {
      return { skipped: true };
    },
  };
}
