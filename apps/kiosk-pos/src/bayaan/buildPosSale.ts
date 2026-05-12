/**
 * Convert ExactKioskApp's cart shape into the payload that
 * /bayaan/api/kiosk_sale expects on the Odoo backend.
 *
 * The React POS does NOT pre-compute recipe consumption — the addon's
 * `_bayaan_post_recipe_consumption` hook resolves the active recipe at
 * sale time and writes the immutable consumption ledger. We just send
 * what the cashier rang up and the payment they took.
 */

export type CartItem = {
  key: string;
  id: string | number;
  name: string;
  image?: string;
  size?: string;
  price: number;
  qty: number;
};

export type TenderId =
  | "cash"
  | "card"
  | "zain cash"
  | "fib"
  | "qi card"
  | "fastpay";

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
    method: TenderId | string;
    amount: number;
  }>;
};

const ODOO_PRODUCT_CODE_BY_UI_KEY: Record<string, string> = {
  espresso: "MENU-ESPRESSO",
  latte: "MENU-LATTE",
  "iced-coffee": "MENU-ICED-COFFEE",
  "juice-orange": "MENU-OJ",
  orange: "MENU-OJ",
  "croissant-plain": "MENU-CROISSANT",
  "menu-croissant-plain": "MENU-CROISSANT",
  "menu-latte": "MENU-LATTE",
  "menu-iced-latte": "MENU-ICED-COFFEE",
  "ing-milk-whole": "ING-MILK-1L",
};

const ODOO_PRODUCT_CODE_BY_NAME: Record<string, string> = {
  espresso: "MENU-ESPRESSO",
  latte: "MENU-LATTE",
  orange: "MENU-OJ",
  "orange juice": "MENU-OJ",
  "iced coffee": "MENU-ICED-COFFEE",
  "iced latte": "MENU-ICED-COFFEE",
  "croissant - plain": "MENU-CROISSANT",
  "croissant plain": "MENU-CROISSANT",
  "croissant — plain": "MENU-CROISSANT",
  "milk (whole) 1l": "ING-MILK-1L",
  "whole milk 1l": "ING-MILK-1L",
};

export type BuildPosSaleInput = {
  cart: CartItem[];
  tender: TenderId | string;
  kiosk: string;
  cashier: string;
  total: number;
  externalId?: string;
  sessionId?: number | string;
  postingDate?: string;
};

export function buildKioskSalePayload(input: BuildPosSaleInput): KioskSalePayload {
  if (!input.cart.length) {
    throw new Error("Cannot build sale payload: cart is empty");
  }
  if (!input.kiosk) {
    throw new Error("Cannot build sale payload: kiosk is required");
  }
  if (!input.cashier) {
    throw new Error("Cannot build sale payload: cashier is required");
  }
  if (!input.tender) {
    throw new Error("Cannot build sale payload: tender is required");
  }

  const externalId = input.externalId ?? generateExternalId(input.kiosk);
  const postingDate = input.postingDate ?? new Date().toISOString().slice(0, 10);

  return {
    external_id: externalId,
    kiosk: input.kiosk,
    cashier: input.cashier,
    posting_date: postingDate,
    session_id: input.sessionId,
    items: input.cart.map((line) => ({
      product: odooProductRef(line),
      name: line.name,
      qty: line.qty,
      price_unit: line.price,
    })),
    payments: [
      {
        method: input.tender,
        amount: input.total,
      },
    ],
  };
}

export function odooProductRef(line: Pick<CartItem, "id" | "name" | "image">): string | number {
  if (typeof line.id === "string" && line.id.toUpperCase().startsWith("MENU-")) {
    return line.id.toUpperCase();
  }
  const imageCode = line.image ? ODOO_PRODUCT_CODE_BY_UI_KEY[line.image] : undefined;
  if (imageCode) return imageCode;
  const idCode = typeof line.id === "string" ? ODOO_PRODUCT_CODE_BY_UI_KEY[line.id] : undefined;
  if (idCode) return idCode;
  const nameCode = ODOO_PRODUCT_CODE_BY_NAME[line.name.trim().toLowerCase()];
  if (nameCode) return nameCode;
  return line.name || line.id;
}

export function generateExternalId(kiosk: string): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `BAY-${kiosk}-${ts}-${rand}`;
}

export type WastePayload = {
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

export type BuildWasteInput = {
  kiosk: string;
  cashier: string;
  item: { id?: string | number; name: string; price: number };
  qty: number;
  reason: string;
};

export function buildWastePayload(input: BuildWasteInput): WastePayload {
  if (!input.kiosk) throw new Error("Cannot build waste payload: kiosk is required");
  if (!input.cashier) throw new Error("Cannot build waste payload: cashier is required");
  if (!input.item) throw new Error("Cannot build waste payload: item is required");
  if (!input.reason) throw new Error("Cannot build waste payload: reason is required");
  if (input.qty <= 0) throw new Error("Cannot build waste payload: qty must be > 0");

  return {
    external_id: generateExternalId(input.kiosk).replace("BAY-", "WST-"),
    kiosk: input.kiosk,
    cashier: input.cashier,
    item: odooProductRef({
      id: input.item.id ?? input.item.name,
      name: input.item.name,
    }),
    name: input.item.name,
    qty: input.qty,
    reason: input.reason,
    estimated_cost: input.item.price * input.qty,
    recorded_at: new Date().toISOString(),
  };
}
