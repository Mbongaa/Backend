import type { StockSnapshot } from "../domain/pos";
import {
  buildBayaanSalePayload,
  type SaleRecord,
  type ShiftState,
  type WasteRecord,
} from "../domain/pos";
import { OdooClient } from "../lib/odoo";

export type ShiftCloseDraft = {
  actualCash: number;
  stockCounts: Array<{
    item: string;
    uom: string;
    expected_qty: number;
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

export type PurchaseOrderPayload = {
  supplier: string;
  items: Array<{
    itemId: string;
    qty: number;
    rate: number;
  }>;
  scheduleDate?: string;
  submit?: boolean;
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

export type SourceOfTruthGateway = {
  enabled: boolean;
  getChainBootstrap: () => Promise<unknown>;
  getWarehouseSetup: () => Promise<unknown>;
  getPaymentGateways: () => Promise<unknown>;
  createWarehouse: (payload: CreateWarehousePayload) => Promise<unknown>;
  createKiosk: (payload: CreateKioskPayload) => Promise<unknown>;
  submitSale: (sale: SaleRecord, kioskId: string) => Promise<unknown>;
  submitStockTransfer: (payload: StockTransferPayload) => Promise<unknown>;
  submitPurchaseOrder: (payload: PurchaseOrderPayload) => Promise<unknown>;
  submitRecipeVersion: (payload: RecipeVersionPayload) => Promise<unknown>;
  submitWaste: (waste: WasteRecord, kioskId: string) => Promise<unknown>;
  submitShiftClose: (payload: ShiftClosePayload) => Promise<unknown>;
  reviewShiftClose: (payload: ShiftCloseReviewPayload) => Promise<unknown>;
};

export function createSourceOfTruthGateway(): SourceOfTruthGateway {
  const baseUrl = import.meta.env.VITE_ODOO_URL || runtimeOdooUrl();
  const token = import.meta.env.VITE_ODOO_TOKEN;

  if (!baseUrl) {
    return createNoopGateway();
  }

  const client = new OdooClient({ baseUrl, token });

  return {
    enabled: true,
    async getChainBootstrap() {
      return client.json("/bayaan/api/chain_bootstrap");
    },
    async getWarehouseSetup() {
      return client.json("/bayaan/api/warehouse_setup");
    },
    async getPaymentGateways() {
      return client.json("/bayaan/api/payment_gateways");
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
    async submitSale(sale: SaleRecord, kioskId: string) {
      return client.json("/bayaan/api/pos_sale", {
        payload: buildBayaanSalePayload(sale, kioskId),
      });
    },
    async submitStockTransfer(payload: StockTransferPayload) {
      return client.json("/bayaan/api/stock_transfer", {
        payload: {
          kiosk: payload.kioskId,
          item: payload.itemId,
          qty: payload.qty,
          uom: payload.uom,
        },
      });
    },
    async submitPurchaseOrder(payload: PurchaseOrderPayload) {
      return client.json("/bayaan/api/purchase_order", {
        payload: {
          supplier: payload.supplier,
          schedule_date: payload.scheduleDate,
          submit: payload.submit,
          items: payload.items.map((item) => ({
            item: item.itemId,
            qty: item.qty,
            rate: item.rate,
          })),
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
  };
}

function runtimeOdooUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("odooUrl") || window.localStorage.getItem("BAYAAN_ODOO_URL") || "";
}

function createNoopGateway() {
  return {
    enabled: false,
    async getChainBootstrap() {
      return { skipped: true };
    },
    async getWarehouseSetup() {
      return { skipped: true };
    },
    async getPaymentGateways() {
      return { skipped: true };
    },
    async createWarehouse(_payload: CreateWarehousePayload) {
      return { skipped: true };
    },
    async createKiosk(_payload: CreateKioskPayload) {
      return { skipped: true };
    },
    async submitSale(_sale: SaleRecord, _kioskId: string) {
      return { skipped: true };
    },
    async submitStockTransfer(_payload: StockTransferPayload) {
      return { skipped: true };
    },
    async submitPurchaseOrder(_payload: PurchaseOrderPayload) {
      return { skipped: true };
    },
    async submitRecipeVersion(_payload: RecipeVersionPayload) {
      return { skipped: true };
    },
    async submitWaste(_waste: WasteRecord, _kioskId: string) {
      return { skipped: true };
    },
    async submitShiftClose(_payload: ShiftClosePayload) {
      return { skipped: true };
    },
    async reviewShiftClose(_payload: ShiftCloseReviewPayload) {
      return { skipped: true };
    },
  };
}
