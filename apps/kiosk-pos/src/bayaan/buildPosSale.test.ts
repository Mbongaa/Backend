import { describe, it, expect } from "vitest";
import { buildKioskSalePayload, buildWastePayload, generateExternalId } from "./buildPosSale";

describe("buildKioskSalePayload", () => {
  const baseInput = {
    cart: [
      { key: "latte:Reg", id: 4, image: "latte", name: "Latte", price: 4500, qty: 2 },
      { key: "oj:Lg", id: 21, image: "juice-orange", name: "Orange", price: 5500, qty: 1 },
    ],
    tender: "cash" as const,
    kiosk: "K-01",
    cashier: "Maya Ahmed",
    total: 14500,
    externalId: "BAY-K-01-20260512000000-000001",
    postingDate: "2026-05-12",
  };

  it("builds a payload with kiosk + cashier + posting_date + items + payments", () => {
    const payload = buildKioskSalePayload(baseInput);
    expect(payload.kiosk).toBe("K-01");
    expect(payload.cashier).toBe("Maya Ahmed");
    expect(payload.posting_date).toBe("2026-05-12");
    expect(payload.external_id).toBe("BAY-K-01-20260512000000-000001");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toEqual({
      product: "MENU-LATTE",
      name: "Latte",
      qty: 2,
      price_unit: 4500,
    });
    expect(payload.items[1].product).toBe("MENU-OJ");
    expect(payload.payments).toEqual([{ method: "cash", amount: 14500 }]);
  });

  it("auto-generates external_id when not provided", () => {
    const { externalId, ...input } = baseInput;
    void externalId;
    const payload = buildKioskSalePayload(input);
    expect(payload.external_id).toMatch(/^BAY-K-01-\d{14}-\d{6}$/);
  });

  it("auto-generates posting_date when not provided", () => {
    const { postingDate, ...input } = baseInput;
    void postingDate;
    const payload = buildKioskSalePayload(input);
    expect(payload.posting_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects empty cart", () => {
    expect(() => buildKioskSalePayload({ ...baseInput, cart: [] })).toThrow(/cart is empty/i);
  });

  it("rejects missing kiosk", () => {
    expect(() => buildKioskSalePayload({ ...baseInput, kiosk: "" })).toThrow(/kiosk is required/i);
  });

  it("rejects missing cashier", () => {
    expect(() => buildKioskSalePayload({ ...baseInput, cashier: "" })).toThrow(/cashier is required/i);
  });

  it("rejects missing tender", () => {
    expect(() => buildKioskSalePayload({ ...baseInput, tender: "" })).toThrow(/tender is required/i);
  });

  it("preserves session_id when provided", () => {
    const payload = buildKioskSalePayload({ ...baseInput, sessionId: 42 });
    expect(payload.session_id).toBe(42);
  });

  it("allocates tax-inclusive cashier totals into Odoo line prices", () => {
    const payload = buildKioskSalePayload({
      ...baseInput,
      cart: [
        { key: "latte:Reg", id: 4, image: "latte", name: "Latte", price: 4500, qty: 1 },
      ],
      total: 4725,
    });

    expect(payload.items[0].price_unit).toBe(4725);
    expect(payload.payments[0].amount).toBe(4725);
  });
});

describe("generateExternalId", () => {
  it("includes the kiosk code", () => {
    expect(generateExternalId("K-07")).toMatch(/^BAY-K-07-/);
  });

  it("yields different ids on subsequent calls", () => {
    const a = generateExternalId("K-01");
    const b = generateExternalId("K-01");
    expect(a).not.toBe(b);
  });
});

describe("buildWastePayload", () => {
  const baseInput = {
    kiosk: "K-02",
    cashier: "Yusuf Saleh",
    item: { id: "ing-milk-whole", name: "Milk (whole) 1L", price: 12000 },
    qty: 3,
    reason: "Spillage",
  };

  it("computes estimated_cost from item.price * qty", () => {
    const payload = buildWastePayload(baseInput);
    expect(payload.estimated_cost).toBe(36000);
    expect(payload.kiosk).toBe("K-02");
    expect(payload.cashier).toBe("Yusuf Saleh");
    expect(payload.item).toBe("ING-MILK-1L");
    expect(payload.name).toBe("Milk (whole) 1L");
    expect(payload.qty).toBe(3);
    expect(payload.reason).toBe("Spillage");
    expect(payload.external_id).toMatch(/^WST-K-02-/);
    expect(payload.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to item.name when item.id is absent", () => {
    const payload = buildWastePayload({
      ...baseInput,
      item: { name: "Croissant", price: 1500 },
    });
    expect(payload.item).toBe("Croissant");
  });

  it("preserves live stock item codes for ingredient waste", () => {
    const payload = buildWastePayload({
      ...baseInput,
      item: { id: "COFFEE-BEANS", name: "Coffee beans", price: 18000 },
    });
    expect(payload.item).toBe("COFFEE-BEANS");
    expect(payload.name).toBe("Coffee beans");
  });

  it("rejects qty <= 0", () => {
    expect(() => buildWastePayload({ ...baseInput, qty: 0 })).toThrow(/qty must be/);
    expect(() => buildWastePayload({ ...baseInput, qty: -1 })).toThrow(/qty must be/);
  });
});
