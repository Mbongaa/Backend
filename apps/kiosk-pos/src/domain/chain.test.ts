import { describe, expect, it } from "vitest";
import { menuItems, type CartLine } from "../data";
import { createSaleRecord, createWasteRecord } from "./pos";
import {
  createInitialChainState,
  getInventoryControlRows,
  getKioskStock,
  recordKioskSale,
  recordKioskWaste,
  transferStockToKiosk,
} from "./chain";

const orange = menuItems.find((item) => item.id === "orange")!;

const orangeCart: CartLine[] = [{
  key: "orange:M",
  id: orange.id,
  name: orange.name,
  size: "M",
  price: orange.price,
  qty: 10,
  recipe: orange.recipe,
}];

describe("chain operations", () => {
  it("moves stock from the central warehouse into a kiosk allocation", () => {
    const state = createInitialChainState();
    const beforeWarehouse = state.warehouse.oranges;
    const beforeKiosk = getKioskStock(state, "K-02").find((item) => item.id === "oranges")!.remaining;

    const next = transferStockToKiosk(state, "K-02", "oranges", 10, "2026-05-09T08:00:00Z");

    expect(next.warehouse.oranges).toBe(beforeWarehouse - 10);
    expect(getKioskStock(next, "K-02").find((item) => item.id === "oranges")!.remaining).toBe(beforeKiosk + 10);
    expect(next.transfers[0]).toMatchObject({ from: "MAIN-WAREHOUSE", to: "K-02", itemId: "oranges", qty: 10 });
  });

  it("deducts POS sales from the selling kiosk without touching warehouse balance", () => {
    const state = createInitialChainState();
    const beforeWarehouse = state.warehouse.oranges;
    const beforeKiosk = getKioskStock(state, "K-01").find((item) => item.id === "oranges")!.remaining;
    const sale = createSaleRecord({
      id: "S-TEST",
      lines: orangeCart,
      tender: { method: "cash", received: 50_000 },
      createdAt: "2026-05-09T08:00:00Z",
    });

    const next = recordKioskSale(state, "K-01", sale);

    expect(next.warehouse.oranges).toBe(beforeWarehouse);
    expect(getKioskStock(next, "K-01").find((item) => item.id === "oranges")!.remaining).toBe(beforeKiosk - 3.5);
  });

  it("records waste against the kiosk stock snapshot", () => {
    const state = createInitialChainState();
    const waste = createWasteRecord({
      id: "W-TEST",
      product: orange,
      qty: 2,
      reason: "Spoilage",
      createdAt: "2026-05-09T08:00:00Z",
    });

    const next = recordKioskWaste(state, "K-01", waste);
    const oranges = getKioskStock(next, "K-01").find((item) => item.id === "oranges")!;

    expect(oranges.wasted).toBe(0.7);
    expect(getInventoryControlRows(next).find((item) => item.id === "oranges")!.wastedQty).toBe(0.7);
  });
});
