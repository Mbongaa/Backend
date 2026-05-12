import { describe, expect, it } from "vitest";
import { createInitialChainState, getInventoryControlRows, getKioskRows, getKioskStock } from "../domain/chain";
import { applyChainBootstrapSnapshot } from "./bootstrapAdapter";

describe("Odoo bootstrap adapter", () => {
  it("hydrates warehouse, kiosk stock, sales, consumption, and waste into one chain state", () => {
    const next = applyChainBootstrapSnapshot(createInitialChainState(), {
      message: {
        kiosks: [
          { name: "Bayaan Kiosk 1", kiosk_code: "K-01", warehouse: "K-01 Warehouse" },
          { name: "Bayaan Kiosk 2", kiosk_code: "K-02", warehouse: "K-02 Warehouse" },
        ],
        warehouse_stock: [
          { item: "oranges", actual_qty: 500 },
          { item: "cups", actual_qty: 12000 },
        ],
        kiosk_stock: {
          "K-01 Warehouse": [
            { item: "oranges", actual_qty: 31 },
            { item: "cups", actual_qty: 690 },
          ],
        },
        today: {
          sales: [{ kiosk: "Bayaan Kiosk 1", revenue: 880000, orders: 122 }],
          consumption: [{ kiosk: "K-01", ingredient: "oranges", qty: 9 }],
          waste: [{ kiosk: "K-01 Warehouse", item: "oranges", qty: 1.5, estimated_cost: 2850 }],
        },
      },
    });

    expect(next.warehouse.oranges).toBe(500);
    expect(next.warehouse.cups).toBe(12000);
    expect(getKioskRows(next).find((row) => row.id === "K-01")?.revenue).toBe(880000);

    const oranges = getKioskStock(next, "K-01").find((item) => item.id === "oranges")!;
    expect(oranges.consumed).toBe(9);
    expect(oranges.wasted).toBe(1.5);
    expect(oranges.remaining).toBe(31);

    const inventoryRow = getInventoryControlRows(next).find((item) => item.id === "oranges")!;
    expect(inventoryRow.warehouseQty).toBe(500);
    expect(inventoryRow.consumedQty).toBe(9);
    expect(inventoryRow.wastedQty).toBe(1.5);
  });
});
