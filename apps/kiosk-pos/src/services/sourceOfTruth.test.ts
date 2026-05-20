import { describe, expect, it, vi } from "vitest";
import { createPeakSimulation } from "../simulation/peakSimulation";
import {
  applyManualSimulationCloseReviews,
  applyManualSimulationHr,
  applyManualSimulationProductCatalog,
  applyManualSimulationPurchaseActions,
  applyManualSimulationPurchaseOrders,
  applyManualSimulationRecurringPurchases,
  applyManualSimulationRecipeVersions,
  applyManualSimulationSales,
  applyManualSimulationShiftCloses,
  applyManualSimulationStockItems,
  applyManualSimulationSuppliers,
  applyManualSimulationTransfers,
  applyManualSimulationTransferActions,
  applyManualSimulationWaste,
  createSourceOfTruthGateway,
} from "./sourceOfTruth";

async function withSimulationWindow<T>(run: () => Promise<T>): Promise<T> {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: {
      location: { search: "?bayaanMode=simulation&bayaanSimStart=full" },
      localStorage: { getItem: () => null },
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis,
    configurable: true,
  });

  try {
    return await run();
  } finally {
    if (typeof originalWindow === "undefined") {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
    }
  }
}

async function withLiveOdooWindow<T>(fetchMock: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    value: {
      location: { search: "" },
      localStorage: {
        getItem: (key: string) => (key === "BAYAAN_ODOO_URL" ? "http://odoo.test" : null),
      },
    } as unknown as Window & typeof globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    configurable: true,
  });

  try {
    return await run();
  } finally {
    if (typeof originalWindow === "undefined") {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
    }
    if (typeof originalFetch === "undefined") {
      Reflect.deleteProperty(globalThis, "fetch");
    } else {
      Object.defineProperty(globalThis, "fetch", {
        value: originalFetch,
        configurable: true,
      });
    }
  }
}

type GatewayStockSnapshot = {
  kiosk_stock_rows: Array<{
    kiosk?: string;
    item?: string;
    uom?: string;
    actual_qty?: number;
    qty?: number;
    unit_cost?: number;
    standard_price?: number;
  }>;
};

function stockCountLine(snapshot: GatewayStockSnapshot, kiosk: string, item: string, actualOffset = 0) {
  const row = snapshot.kiosk_stock_rows.find((entry) => entry.kiosk === kiosk && entry.item === item);
  if (!row) throw new Error(`Missing ${kiosk} ${item} stock row`);
  const expectedQty = Number(row.actual_qty ?? row.qty ?? 0);
  return {
    item,
    uom: String(row.uom || "Units"),
    expected_qty: expectedQty,
    actual_qty: expectedQty + actualOffset,
  };
}

describe("simulation source-of-truth gateway helpers", () => {
  it("posts AI dashboard questions to the server-side Bayaan AI route", async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        result: {
          engine: "odoo_pos",
          readonly: true,
          plan: { intent: "executive-summary" },
          llm: { status: "llm_called", provider: "openai", model: "gpt-5.4-mini" },
          featureTier: { tier: "daily-only", allowedTimeRanges: ["today"] },
          budget: { monthlyTokenBudget: 100000, remainingTokens: 99000 },
          claims: [{
            text: "Sales today comes from official POS orders.",
            numericValues: [{ label: "salesToday", value: 1200, unit: "currency" }],
            sourceRefs: ["pos.order"],
          }],
          visualizations: [{
            id: "sales-card",
            type: "metric-card",
            title: "Sales",
            reason: "The model chose one focused metric.",
            series: [{ label: "Sales", value: 1200, unit: "currency", category: "sales" }],
            sourceRefs: ["pos.order"],
          }],
        },
      }),
    }));

    await withLiveOdooWindow(fetchSpy as unknown as typeof fetch, async () => {
      const gateway = createSourceOfTruthGateway();
      const result = await gateway.resolveAiDashboardPlan({
        query: "What happened today?",
        locale: "en",
        scope: { sectionId: "insights", timeRange: "today" },
      }) as { budget?: { remainingTokens?: number }; claims?: Array<{ sourceRefs?: string[] }>; llm?: { status?: string }; plan?: { intent?: string }; visualizations?: Array<{ type?: string }> };
      const firstCall = fetchSpy.mock.calls[0];
      if (!firstCall) throw new Error("live AI dashboard plan did not call fetch");
      const [url, init] = firstCall;
      const body = JSON.parse(String(init?.body));

      expect(result.plan?.intent).toBe("executive-summary");
      expect(result.llm?.status).toBe("llm_called");
      expect(result.budget?.remainingTokens).toBe(99000);
      expect(result.claims?.[0]?.sourceRefs).toEqual(["pos.order"]);
      expect(result.visualizations?.[0]?.type).toBe("metric-card");
      expect(String(url)).toMatch(/\/bayaan\/api\/ai_dashboard_plan$/);
      expect(body.params.payload).toMatchObject({
        query: "What happened today?",
        locale: "en",
        scope: { sectionId: "insights", timeRange: "today" },
        sectionId: "insights",
        timeRange: "today",
      });
      expect(JSON.stringify(body)).not.toMatch(/apiKey|secret|authorization/i);
    });
  });

  it("streams live AI dashboard text and returns the final source-backed payload", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: open\ndata: {\"engine\":\"odoo_pos\"}\n\n"));
        controller.enqueue(encoder.encode("event: text_delta\ndata: {\"text\":\"Cash \"}\n\n"));
        controller.enqueue(encoder.encode("event: text_delta\ndata: {\"text\":\"72K\"}\n\n"));
        controller.enqueue(encoder.encode("event: final\ndata: {\"engine\":\"odoo_pos\",\"readonly\":true,\"llm\":{\"status\":\"llm_called\"},\"plan\":{\"intent\":\"payment-reconciliation\"},\"visualizations\":[{\"id\":\"payment-split\",\"type\":\"pie-chart\",\"title\":\"Payment split\",\"reason\":\"Cash versus online\",\"series\":[{\"label\":\"Cash\",\"value\":72000,\"unit\":\"IQD\",\"category\":\"cash\"}],\"sourceRefs\":[\"pos.payment\"]}]}\n\n"));
        controller.close();
      },
    });
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      body: stream,
    }));
    const deltas: string[] = [];

    await withLiveOdooWindow(fetchSpy as unknown as typeof fetch, async () => {
      const gateway = createSourceOfTruthGateway();
      const result = await gateway.streamAiDashboardPlan({
        query: "cash and online payments",
        locale: "en",
        scope: { sectionId: "insights", timeRange: "today" },
      }, {
        onTextDelta: (text) => deltas.push(text),
      }) as { llm?: { status?: string }; plan?: { intent?: string }; visualizations?: Array<{ type?: string }> };
      const [url, init] = fetchSpy.mock.calls[0] || [];
      const body = JSON.parse(String(init?.body));

      expect(String(url)).toMatch(/\/bayaan\/api\/ai_dashboard_stream$/);
      expect(init?.headers).toMatchObject({ Accept: "text/event-stream" });
      expect(body.payload).toMatchObject({
        query: "cash and online payments",
        locale: "en",
        sectionId: "insights",
        timeRange: "today",
      });
      expect(deltas.join("")).toBe("Cash 72K");
      expect(result.llm?.status).toBe("llm_called");
      expect(result.plan?.intent).toBe("payment-reconciliation");
      expect(result.visualizations?.[0]?.type).toBe("pie-chart");
    });
  });

  it("parses split UTF-8 SSE chunks and mixed newline separators", async () => {
    const encoder = new TextEncoder();
    const arabicDelta = encoder.encode("event: text_delta\ndata: {\"text\":\"مرحبا\"}\n\r\n");
    const finalPayload = "event: final\r\ndata: {\"engine\":\"odoo_pos\",\"readonly\":true,\"llm\":{\"status\":\"llm_called\"},\"plan\":{\"intent\":\"executive-summary\"}}\r\n\r\n";
    const finalBytes = encoder.encode(finalPayload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(arabicDelta.slice(0, 31));
        controller.enqueue(arabicDelta.slice(31));
        controller.enqueue(finalBytes.slice(0, finalBytes.length - 1));
        controller.enqueue(finalBytes.slice(finalBytes.length - 1));
        controller.close();
      },
    });
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      body: stream,
    }));
    const deltas: string[] = [];

    await withLiveOdooWindow(fetchSpy as unknown as typeof fetch, async () => {
      const gateway = createSourceOfTruthGateway();
      const result = await gateway.streamAiDashboardPlan({
        query: "مرحبا",
        locale: "ar",
        scope: { sectionId: "insights", timeRange: "today" },
      }, {
        onTextDelta: (text) => deltas.push(text),
      }) as { llm?: { status?: string }; plan?: { intent?: string } };

      expect(deltas.join("")).toBe("مرحبا");
      expect(result.llm?.status).toBe("llm_called");
      expect(result.plan?.intent).toBe("executive-summary");
    });
  });

  it("posts live Odoo operating expenses through the source gateway", async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        result: {
          id: 99,
          name: "Generator top-up",
          category: "Utilities",
          amount: 44_000,
        },
      }),
    }));

    await withLiveOdooWindow(fetchSpy as unknown as typeof fetch, async () => {
      const gateway = createSourceOfTruthGateway();
      const result = await gateway.submitOperatingExpense({
        name: "Generator top-up",
        category: "Utilities",
        amount: 44_000,
        date: "2026-05-10",
        note: "Payroll-adjacent store operating cost",
      }) as { id: number; amount: number };
      const firstCall = fetchSpy.mock.calls[0];
      if (!firstCall) throw new Error("live operating expense did not call fetch");
      const [url, init] = firstCall;
      const body = JSON.parse(String(init?.body));

      expect(gateway.enabled).toBe(true);
      expect(result).toMatchObject({ id: 99, amount: 44_000 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(url)).toMatch(/\/bayaan\/api\/operating_expense$/);
      expect(body.params.payload).toMatchObject({
        name: "Generator top-up",
        category: "Utilities",
        amount: 44_000,
        date: "2026-05-10",
        note: "Payroll-adjacent store operating cost",
      });
    });
  });

  it("posts a manual POS sale into orders, payments, stock, and accounting totals", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const beforeStock = base.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");

    const next = applyManualSimulationSales(base, [{
      external_id: "BAY-K-01-TEST",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      posting_date: "2026-05-16",
      name: "SIM-MANUAL-0001",
      recorded_at: "2026-05-16T14:00:00.000Z",
      sequence: 1,
      items: [
        { product: "MENU-LATTE", name: "Latte", qty: 2, price_unit: 4500 },
      ],
      payments: [
        { method: "cash", amount: 9000 },
      ],
    }]);

    const afterStock = next.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");
    const karradaSales = next.today.sales.find((row) => row.kiosk === "K-01");

    expect(next.today.orders).toHaveLength(1);
    expect(next.today.payments).toHaveLength(1);
    expect(next.today.consumption).toHaveLength(3);
    expect(next.today.orders[0]?.name).toBe("SIM-MANUAL-0001");
    expect(next.today.orders[0]?.consumption_state).toBe("posted");
    expect(next.summary.totals.ordersToday).toBe(1);
    expect(next.summary.totals.salesToday).toBe(9000);
    expect(next.summary.totals.cashExpected).toBe(9000);
    expect(next.summary.totals.profitEstimate).toBe(7240);
    expect(next.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(-1_172_760);
    expect(next.summary.totals.netProfitAfterPayroll).toBe(next.summary.reportPeriods.daily.netProfitAfterPayroll);
    expect(next.summary.reportPeriods.weekly.netProfitAfterPayroll).toBe(-8_209_320);
    expect(next.summary.payments.cash).toBe(9000);
    expect(karradaSales?.revenue).toBe(9000);
    expect(karradaSales?.orders).toBe(1);
    expect(Number(afterStock?.actual_qty)).toBeCloseTo(Number(beforeStock?.actual_qty) - 0.036, 3);
    expect(next.summary.sourceCounts.orders).toBe(next.today.orders.length);
    expect(next.summary.sourceCounts.payments).toBe(next.today.payments.length);
    expect(next.summary.sourceCounts.consumptionRows).toBe(next.today.consumption.length);
  });

  it("is idempotent for duplicate manual POS sale external ids", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const beforeStock = base.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");
    const sale = {
      external_id: "BAY-K-01-DUPLICATE",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      posting_date: "2026-05-16",
      name: "SIM-DUPLICATE-0001",
      recorded_at: "2026-05-16T14:00:00.000Z",
      sequence: 1,
      items: [
        { product: "MENU-LATTE", name: "Latte", qty: 2, price_unit: 4500 },
      ],
      payments: [
        { method: "cash", amount: 9000 },
      ],
    };

    const first = applyManualSimulationSales(base, [sale, { ...sale, sequence: 2 }]);
    const second = applyManualSimulationSales(first, [sale]);
    const afterStock = second.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");

    expect(first.today.orders).toHaveLength(1);
    expect(second.today.orders).toHaveLength(1);
    expect(second.summary.totals.salesToday).toBe(9000);
    expect(second.summary.totals.ordersToday).toBe(1);
    expect(second.summary.totals.cashExpected).toBe(9000);
    expect(second.summary.sourceCounts.orders).toBe(1);
    expect(Number(afterStock?.actual_qty)).toBeCloseTo(Number(beforeStock?.actual_qty) - 0.036, 3);
  });

  it("rejects imbalanced manual POS sale replays before accounting rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });

    expect(() => applyManualSimulationSales(base, [{
      external_id: "BAY-K-01-IMBALANCED",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      posting_date: "2026-05-16",
      name: "SIM-IMBALANCED-0001",
      recorded_at: "2026-05-16T14:00:00.000Z",
      sequence: 1,
      items: [
        { product: "MENU-LATTE", name: "Latte", qty: 2, price_unit: 4500 },
      ],
      payments: [
        { method: "cash", amount: 8000 },
      ],
    }])).toThrow(/not balanced: lines 9000, payments 8000/);
  });

  it("recomputes transfer suggestions after manual POS consumption changes stock cover", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });

    const next = applyManualSimulationSales(base, [{
      external_id: "BAY-K-01-LOW-ORANGES",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      posting_date: "2026-05-16",
      name: "SIM-LOW-STOCK-0001",
      recorded_at: "2026-05-16T14:12:00.000Z",
      sequence: 1,
      items: [
        { product: "MENU-ORANGE-JUICE", name: "Fresh orange juice", qty: 190, price_unit: 4000 },
      ],
      payments: [
        { method: "cash", amount: 760000 },
      ],
    }]);

    expect(next.suggested_transfers.some((row) => row.kiosk === "K-01" && row.item === "ORANGES")).toBe(true);
    expect(next.summary.alerts.lowStockItems).toBe(next.suggested_transfers.length);
  });

  it("posts a manual digital POS sale without inflating expected cash", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const beforeOranges = base.kiosk_stock_rows.find((row) => row.kiosk === "K-02" && row.item === "ORANGES");

    const next = applyManualSimulationSales(base, [{
      external_id: "BAY-K-02-FIB-TEST",
      kiosk: "K-02",
      cashier: "Ali Hassan",
      posting_date: "2026-05-16",
      name: "SIM-DIGITAL-0001",
      recorded_at: "2026-05-16T14:05:00.000Z",
      sequence: 1,
      items: [
        { product: "MENU-ORANGE-JUICE", name: "Fresh orange juice", qty: 1, price_unit: 4000 },
      ],
      payments: [
        { method: "fib", amount: 4000 },
      ],
    }]);
    const afterOranges = next.kiosk_stock_rows.find((row) => row.kiosk === "K-02" && row.item === "ORANGES");
    const mansourSales = next.today.sales.find((row) => row.kiosk === "K-02");

    expect(next.today.orders).toHaveLength(1);
    expect(next.today.payments[0]?.provider).toMatchObject({ id: "fib", category: "bank_app" });
    expect(next.today.consumption).toHaveLength(4);
    expect(next.summary.totals.salesToday).toBe(4000);
    expect(next.summary.totals.cashExpected).toBe(0);
    expect(next.summary.totals.digitalPayments).toBe(4000);
    expect(next.summary.payments.cash).toBe(0);
    expect(next.summary.payments.bank_app).toBe(4000);
    expect(next.summary.payments.digital).toBe(4000);
    expect(next.summary.reportPeriods.daily.cashExpected).toBe(0);
    expect(next.summary.reportPeriods.daily.digitalPayments).toBe(4000);
    expect(next.summary.reportPeriods.weekly.payments.bank_app).toBe(28_000);
    expect(mansourSales?.revenue).toBe(4000);
    expect(mansourSales?.orders).toBe(1);
    expect(next.summary.minutePulse[5]?.revenue).toBe(4000);
    expect(next.summary.minutePulse[5]?.orders).toBe(1);
    expect(Number(afterOranges?.actual_qty)).toBeCloseTo(Number(beforeOranges?.actual_qty) - 0.42, 3);
    expect(next.summary.sourceCounts.orders).toBe(next.today.orders.length);
    expect(next.summary.sourceCounts.payments).toBe(next.today.payments.length);
    expect(next.summary.sourceCounts.consumptionRows).toBe(next.today.consumption.length);
  });

  it("is idempotent for duplicate manual waste external ids", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const beforeStock = base.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");
    const waste = {
      external_id: "WASTE-K-01-DUPLICATE",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      item: "COFFEE-BEANS",
      name: "Coffee beans spill",
      qty: 1,
      reason: "Spill / drop",
      estimated_cost: 18000,
      recorded_at: "2026-05-16T14:08:00.000Z",
    };

    const first = applyManualSimulationWaste(base, [waste, waste]);
    const second = applyManualSimulationWaste(first, [waste]);
    const afterStock = second.kiosk_stock_rows.find((row) => row.kiosk === "K-01" && row.item === "COFFEE-BEANS");

    expect(first.today.waste).toHaveLength(1);
    expect(second.today.waste).toHaveLength(1);
    expect(second.summary.totals.wasteCost).toBe(18000);
    expect(second.summary.reportPeriods.daily.wasteCost).toBe(18000);
    expect(second.summary.reportPeriods.weekly.wasteCost).toBe(126000);
    expect(second.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(-1_198_000);
    expect(second.summary.totals.netProfitAfterPayroll).toBe(second.summary.reportPeriods.daily.netProfitAfterPayroll);
    expect(second.summary.reportPeriods.weekly.netProfitAfterPayroll).toBe(-8_386_000);
    expect(second.summary.sourceCounts.wasteRows).toBe(1);
    expect(second.meta.rows_returned.waste).toBe(1);
    expect(Number(afterStock?.actual_qty)).toBeCloseTo(Number(beforeStock?.actual_qty) - 1, 3);
  });

  it("rejects invalid manual waste replays before stock is reduced", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });

    expect(() => applyManualSimulationWaste(base, [{
      external_id: "WASTE-K-01-BAD-COST",
      kiosk: "K-01",
      cashier: "Maya Ahmed",
      item: "COFFEE-BEANS",
      name: "Coffee beans spill",
      qty: 1,
      reason: "Spill / drop",
      estimated_cost: 1,
      recorded_at: "2026-05-16T14:08:00.000Z",
    }])).toThrow(/cost 1 does not match 18000/);
  });

  it("persists a manual POS shift close into close rows and kiosk status totals", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const next = applyManualSimulationShiftCloses(base, [{
      kioskId: "K-01",
      cashier: "Maya Ahmed",
      name: "SIM-CLOSE-K-01",
      submitted_at: "2026-05-16T14:30:00.000Z",
      stock: [],
      shift: {
        id: "SIM-SESSION-K-01",
        openedAt: "2026-05-16T14:00:00.000Z",
        openingCash: 250000,
        sales: [{
          id: "SIM-MANUAL-0001",
          lines: [],
          subtotal: 4725,
          tax: 0,
          total: 4725,
          tender: { method: "cash" as const },
          createdAt: "2026-05-16T14:00:00.000Z",
        }],
        waste: [],
      },
      draft: {
        actualCash: 254725,
        stockCounts: [stockCountLine(base, "K-01", "COFFEE-BEANS")],
      },
    }]);

    const close = next.closings.find((row) => row.id === "SIM-CLOSE-K-01");

    expect(close?.expectedCash).toBe(254725);
    expect(close?.actualCash).toBe(254725);
    expect(close?.cashVariance).toBe(0);
    expect(close?.status).toBe("pending");
    expect(close?.stock?.[0]?.variance).toBe(0);
    expect(next.summary.totals.closedKiosks).toBe(1);
    expect(next.summary.totals.openKiosks).toBe(9);
    expect(next.summary.alerts.unresolvedVariances).toBe(1);
    expect(next.summary.sourceCounts.closingRows).toBe(1);
    expect(next.meta.rows_returned.closings).toBe(1);
  });

  it("is idempotent for duplicate manual shift close submissions", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const close = {
      kioskId: "K-01",
      cashier: "Maya Ahmed",
      name: "SIM-CLOSE-K-01",
      submitted_at: "2026-05-16T14:30:00.000Z",
      stock: [],
      shift: {
        id: "SIM-SESSION-K-01",
        openedAt: "2026-05-16T14:00:00.000Z",
        openingCash: 250000,
        sales: [{
          id: "SIM-MANUAL-0001",
          lines: [],
          subtotal: 4725,
          tax: 0,
          total: 4725,
          tender: { method: "cash" as const },
          createdAt: "2026-05-16T14:00:00.000Z",
        }],
        waste: [],
      },
      draft: {
        actualCash: 254725,
        stockCounts: [stockCountLine(base, "K-01", "COFFEE-BEANS")],
      },
    };

    const first = applyManualSimulationShiftCloses(base, [close, close]);
    const second = applyManualSimulationShiftCloses(first, [close]);

    expect(first.closings.filter((row) => row.id === "SIM-CLOSE-K-01")).toHaveLength(1);
    expect(second.closings.filter((row) => row.id === "SIM-CLOSE-K-01")).toHaveLength(1);
    expect(second.summary.totals.closedKiosks).toBe(1);
    expect(second.summary.totals.openKiosks).toBe(9);
    expect(second.summary.alerts.unresolvedVariances).toBe(1);
    expect(second.summary.sourceCounts.closingRows).toBe(1);
  });

  it("rejects stale manual shift close replay stock counts before variance rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const staleCount = stockCountLine(base, "K-01", "COFFEE-BEANS");

    expect(() => applyManualSimulationShiftCloses(base, [{
      kioskId: "K-01",
      cashier: "Maya Ahmed",
      name: "SIM-CLOSE-K-01-STALE",
      submitted_at: "2026-05-16T14:30:00.000Z",
      stock: [],
      shift: {
        id: "SIM-SESSION-K-01-STALE",
        openedAt: "2026-05-16T14:00:00.000Z",
        openingCash: 250000,
        sales: [],
        waste: [],
      },
      draft: {
        actualCash: 250000,
        stockCounts: [{ ...staleCount, expected_qty: staleCount.expected_qty + 1 }],
      },
    }])).toThrow(/expected stock COFFEE-BEANS is stale/);
  });

  it("scales manual close variance into synthetic report periods", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 0 });
    const next = applyManualSimulationShiftCloses(base, [{
      kioskId: "K-01",
      cashier: "Maya Ahmed",
      name: "SIM-CLOSE-K-01-SHORT",
      submitted_at: "2026-05-16T14:30:00.000Z",
      stock: [],
      shift: {
        id: "SIM-SESSION-K-01-SHORT",
        openedAt: "2026-05-16T14:00:00.000Z",
        openingCash: 250000,
        sales: [],
        waste: [],
      },
      draft: {
        actualCash: 245000,
        stockCounts: [stockCountLine(base, "K-01", "COFFEE-BEANS")],
      },
    }]);

    expect(next.summary.totals.cashVariance).toBe(-5000);
    expect(next.summary.reportPeriods.daily.cashVariance).toBe(-5000);
    expect(next.summary.reportPeriods.weekly.cashVariance).toBe(-35000);
    expect(next.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(-1_185_000);
    expect(next.summary.totals.netProfitAfterPayroll).toBe(next.summary.reportPeriods.daily.netProfitAfterPayroll);
    expect(next.summary.reportPeriods.weekly.netProfitAfterPayroll).toBe(-8_295_000);
  });

  it("counts closed kiosks by unique kiosk id when additional close rows are recorded", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const alreadyClosed = base.closings[0];
    const next = applyManualSimulationShiftCloses(base, [{
      kioskId: alreadyClosed.kioskId,
      cashier: "Second Session Cashier",
      name: `${alreadyClosed.id}-SECOND-SESSION`,
      submitted_at: "2026-05-16T16:30:00.000Z",
      stock: [],
      shift: {
        id: `${alreadyClosed.id}-SESSION-2`,
        openedAt: "2026-05-16T16:00:00.000Z",
        openingCash: 250000,
        sales: [],
        waste: [],
      },
      draft: {
        actualCash: 250000,
        stockCounts: [stockCountLine(base, String(alreadyClosed.kioskId), "COFFEE-BEANS")],
      },
    }]);
    const uniqueClosedKiosks = new Set(next.closings.map((close) => close.kioskId)).size;

    expect(next.closings.length).toBe(base.closings.length + 1);
    expect(next.summary.sourceCounts.closingRows).toBe(base.summary.sourceCounts.closingRows + 1);
    expect(next.summary.totals.closedKiosks).toBe(uniqueClosedKiosks);
    expect(next.summary.totals.openKiosks).toBe(next.kiosks.length - uniqueClosedKiosks);
  });

  it("is idempotent at the simulation gateway for POS sale, waste, and close retries", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; wasteRows: number; closingRows: number } };
      };
      const salePayload = {
        external_id: "BAY-GATEWAY-RETRY-SALE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-LATTE", name: "Latte", qty: 1, price_unit: 4500 }],
        payments: [{ method: "cash", amount: 4500 }],
      };
      const firstSale = await gateway.submitKioskSale(salePayload) as { name: string };
      const secondSale = await gateway.submitKioskSale(salePayload) as { name: string };
      const wastePayload = {
        external_id: "BAY-GATEWAY-RETRY-WASTE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        item: "COFFEE-BEANS",
        name: "Coffee beans retry spill",
        qty: 1,
        reason: "Retry test",
        estimated_cost: 18000,
        recorded_at: "2026-05-16T15:20:00.000Z",
      };

      await gateway.submitKioskWaste(wastePayload);
      await gateway.submitKioskWaste(wastePayload);
      const afterOps = await gateway.getChainBootstrap() as GatewayStockSnapshot;
      const closePayload = {
        kioskId: "K-01",
        cashier: "Retry Cashier",
        stock: [],
        shift: {
          id: "SIM-SESSION-K-01-RETRY",
          openedAt: "2026-05-16T15:00:00.000Z",
          openingCash: 100000,
          sales: [{
            id: "SIM-GATEWAY-CLOSE-SALE",
            lines: [],
            subtotal: 4500,
            tax: 0,
            total: 4500,
            tender: { method: "cash" as const },
            createdAt: "2026-05-16T15:10:00.000Z",
          }],
          waste: [],
        },
        draft: {
          actualCash: 104500,
          stockCounts: [stockCountLine(afterOps, "K-01", "COFFEE-BEANS")],
        },
      };
      const firstClose = await gateway.submitShiftClose(closePayload) as { name: string };
      const secondClose = await gateway.submitShiftClose(closePayload) as { name: string };
      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; wasteRows: number; closingRows: number } };
      };

      expect(secondSale.name).toBe(firstSale.name);
      expect(secondClose.name).toBe(firstClose.name);
      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders + 1);
      expect(after.summary.sourceCounts.wasteRows).toBe(before.summary.sourceCounts.wasteRows + 1);
      expect(after.summary.sourceCounts.closingRows).toBe(before.summary.sourceCounts.closingRows + 1);
    });
  });

  it("rejects unbalanced simulation gateway POS sales before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number } };
      };

      await expect(gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-UNBALANCED-SALE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-LATTE", name: "Latte", qty: 1, price_unit: 4500 }],
        payments: [{ method: "cash", amount: 4000 }],
      })).rejects.toThrow(/not balanced/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number } };
      };

      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders);
      expect(after.summary.sourceCounts.payments).toBe(before.summary.sourceCounts.payments);
    });
  });

  it("rejects unknown simulation gateway POS sale products before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      await expect(gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-UNKNOWN-PRODUCT",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-DOES-NOT-EXIST", name: "Unknown latte", qty: 1, price_unit: 4500 }],
        payments: [{ method: "cash", amount: 4500 }],
      })).rejects.toThrow(/unknown product/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders);
      expect(after.summary.sourceCounts.payments).toBe(before.summary.sourceCounts.payments);
      expect(after.summary.sourceCounts.consumptionRows).toBe(before.summary.sourceCounts.consumptionRows);
    });
  });

  it("rejects unknown simulation gateway POS payment methods before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number } };
      };

      await expect(gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-UNKNOWN-PAYMENT",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-LATTE", name: "Latte", qty: 1, price_unit: 4500 }],
        payments: [{ method: "crypto token", amount: 4500 }],
      })).rejects.toThrow(/unknown payment method/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number } };
      };

      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders);
      expect(after.summary.sourceCounts.payments).toBe(before.summary.sourceCounts.payments);
    });
  });

  it("rejects simulation gateway POS sales that exceed kiosk recipe stock", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      await expect(gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-STOCK-SHORTAGE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-LATTE", name: "Latte", qty: 10_000, price_unit: 4500 }],
        payments: [{ method: "cash", amount: 45_000_000 }],
      })).rejects.toThrow(/exceeds available stock/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders);
      expect(after.summary.sourceCounts.payments).toBe(before.summary.sourceCounts.payments);
      expect(after.summary.sourceCounts.consumptionRows).toBe(before.summary.sourceCounts.consumptionRows);
    });
  });

  it("rejects simulation gateway recipe products without a recipe version", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.createStockItem({
        name: "No recipe smoothie",
        code: "MENU-NO-RECIPE-SMOOTHIE",
        category: "Juice",
        uom: "Units",
        unitCost: 1200,
        listPrice: 6000,
        consumptionMode: "recipe",
        availableInPos: true,
      }) as { product: { default_code?: string } };
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      await expect(gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-MISSING-RECIPE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: created.product.default_code || "MENU-NO-RECIPE-SMOOTHIE", name: "No recipe smoothie", qty: 1, price_unit: 6000 }],
        payments: [{ method: "cash", amount: 6000 }],
      })).rejects.toThrow(/missing recipe/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };

      expect(after.summary.sourceCounts.orders).toBe(before.summary.sourceCounts.orders);
      expect(after.summary.sourceCounts.payments).toBe(before.summary.sourceCounts.payments);
      expect(after.summary.sourceCounts.consumptionRows).toBe(before.summary.sourceCounts.consumptionRows);
    });
  });

  it("persists simulation gateway product catalog and recipe versions into sale consumption", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        products: Array<{ default_code?: string; name?: string; list_price?: number; consumption_mode?: string }>;
        recipes: Array<{ product_code?: string; lines?: Array<{ item?: string; qty?: number; cost?: number }> }>;
        summary: { sourceCounts: { productRows: number; orders: number; payments: number; consumptionRows: number } };
      };

      const created = await gateway.upsertProductCatalog({
        name: "Simulation Pomegranate Juice",
        code: "MENU-POMEGRANATE-JUICE",
        category: "Juice",
        listPrice: 7000,
        standardPrice: 0,
        consumptionMode: "recipe",
        availableInPos: true,
      }) as { product: { id?: string | number; default_code?: string } };
      await gateway.submitRecipeVersion({
        itemId: created.product.default_code || "MENU-POMEGRANATE-JUICE",
        effectiveFrom: "2026-05-16T15:00:00.000Z",
        ingredients: [
          { ingredientId: "ORANGES", qty: 0.2, uom: "kg" },
          { ingredientId: "CUP-12OZ", qty: 1, uom: "Units" },
        ],
        submit: true,
      });
      const afterRecipe = await gateway.getChainBootstrap() as typeof before;
      const product = afterRecipe.products.find((row) => row.default_code === "MENU-POMEGRANATE-JUICE");
      const recipe = afterRecipe.recipes.find((row) => row.product_code === "MENU-POMEGRANATE-JUICE");

      expect(product?.name).toBe("Simulation Pomegranate Juice");
      expect(product?.list_price).toBe(7000);
      expect(product?.consumption_mode).toBe("recipe");
      expect(recipe?.lines?.map((line) => line.item)).toEqual(["ORANGES", "CUP-12OZ"]);
      expect(recipe?.lines?.[0]?.cost).toBe(240);
      expect(afterRecipe.summary.sourceCounts.productRows).toBe(before.summary.sourceCounts.productRows + 1);

      await gateway.submitKioskSale({
        external_id: "BAY-GATEWAY-POMEGRANATE-RECIPE",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        posting_date: "2026-05-16",
        items: [{ product: "MENU-POMEGRANATE-JUICE", name: "Simulation Pomegranate Juice", qty: 1, price_unit: 7000 }],
        payments: [{ method: "cash", amount: 7000 }],
      });
      const afterSale = await gateway.getChainBootstrap() as {
        today: { consumption: Array<{ order?: string; product_code?: string; item?: string; qty?: number }> };
        summary: { sourceCounts: { orders: number; payments: number; consumptionRows: number } };
      };
      const ledgerRows = afterSale.today.consumption.filter((row) => row.order === "SIM-MANUAL-0001" && row.product_code === "MENU-POMEGRANATE-JUICE");

      expect(ledgerRows.map((row) => row.item)).toEqual(["ORANGES", "CUP-12OZ"]);
      expect(ledgerRows.map((row) => row.qty)).toEqual([0.2, 1]);
      expect(afterSale.summary.sourceCounts.orders).toBe(afterRecipe.summary.sourceCounts.orders + 1);
      expect(afterSale.summary.sourceCounts.payments).toBe(afterRecipe.summary.sourceCounts.payments + 1);
      expect(afterSale.summary.sourceCounts.consumptionRows).toBe(afterRecipe.summary.sourceCounts.consumptionRows + 2);
    });
  });

  it("rejects invalid simulation gateway product catalog rows before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { productRows: number } };
      };

      await expect(gateway.upsertProductCatalog({
        name: "  ",
        listPrice: 7000,
        consumptionMode: "recipe",
        availableInPos: true,
      })).rejects.toThrow(/must include a name/);
      await expect(gateway.upsertProductCatalog({
        name: "Zero price menu item",
        code: "MENU-ZERO-PRICE",
        listPrice: 0,
        consumptionMode: "finished",
        availableInPos: true,
      })).rejects.toThrow(/positive sellable price/);
      await expect(gateway.upsertProductCatalog({
        name: "Negative cost menu item",
        code: "MENU-NEGATIVE-COST",
        listPrice: 7000,
        standardPrice: -1,
        consumptionMode: "finished",
        availableInPos: true,
      })).rejects.toThrow(/non-negative standard cost/);

      const after = await gateway.getChainBootstrap() as typeof before;

      expect(after.summary.sourceCounts.productRows).toBe(before.summary.sourceCounts.productRows);
    });
  });

  it("rejects invalid manual product catalog replays before source rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationProductCatalog(base, [{
      id: "bad-product-empty-name",
      default_code: "MENU-BAD-EMPTY-NAME",
      name: "  ",
      listPrice: 7000,
      standardPrice: 0,
      consumptionMode: "recipe",
      availableInPos: true,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }])).toThrow(/must include a name/);

    expect(() => applyManualSimulationProductCatalog(base, [{
      id: "bad-product-price",
      default_code: "MENU-BAD-ZERO-PRICE",
      name: "Bad zero price",
      listPrice: 0,
      standardPrice: 0,
      consumptionMode: "finished",
      availableInPos: true,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
    }])).toThrow(/positive sellable price/);
  });

  it("rejects invalid simulation gateway recipe versions before recipe rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.upsertProductCatalog({
        name: "Simulation Bad Recipe Juice",
        code: "MENU-BAD-RECIPE-JUICE",
        category: "Juice",
        listPrice: 7000,
        standardPrice: 0,
        consumptionMode: "recipe",
        availableInPos: true,
      }) as { product: { default_code?: string } };
      const before = await gateway.getChainBootstrap() as {
        recipes: Array<{ product_code?: string }>;
      };

      await expect(gateway.submitRecipeVersion({
        itemId: "MENU-UNKNOWN-RECIPE-PRODUCT",
        ingredients: [{ ingredientId: "ORANGES", qty: 0.2, uom: "kg" }],
        submit: true,
      })).rejects.toThrow(/unknown product/);
      await expect(gateway.submitRecipeVersion({
        itemId: created.product.default_code || "MENU-BAD-RECIPE-JUICE",
        ingredients: [{ ingredientId: "NO-SUCH-INGREDIENT", qty: 0.2, uom: "kg" }],
        submit: true,
      })).rejects.toThrow(/unknown ingredient/);
      await expect(gateway.submitRecipeVersion({
        itemId: created.product.default_code || "MENU-BAD-RECIPE-JUICE",
        ingredients: [{ ingredientId: "ORANGES", qty: 0, uom: "kg" }],
        submit: true,
      })).rejects.toThrow(/non-positive quantity/);
      await expect(gateway.submitRecipeVersion({
        itemId: created.product.default_code || "MENU-BAD-RECIPE-JUICE",
        ingredients: [{ ingredientId: "ORANGES", qty: 0.2, uom: "" }],
        submit: true,
      })).rejects.toThrow(/must include a unit/);

      const after = await gateway.getChainBootstrap() as typeof before;

      expect(after.recipes.filter((row) => row.product_code === "MENU-BAD-RECIPE-JUICE")).toHaveLength(
        before.recipes.filter((row) => row.product_code === "MENU-BAD-RECIPE-JUICE").length,
      );
    });
  });

  it("rejects invalid manual recipe version replays before recipe rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationRecipeVersions(base, [{
      id: 970101,
      itemId: "MENU-UNKNOWN-RECIPE-PRODUCT",
      product_code: "MENU-UNKNOWN-RECIPE-PRODUCT",
      effectiveFrom: "2026-05-16T15:00:00.000Z",
      ingredients: [{ ingredientId: "ORANGES", qty: 0.2, uom: "kg" }],
      submit: true,
      version: "manual-bad-product",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
      state: "active",
    }])).toThrow(/unknown product/);

    expect(() => applyManualSimulationRecipeVersions(base, [{
      id: 970102,
      itemId: "MENU-ORANGE-JUICE",
      product_code: "MENU-ORANGE-JUICE",
      effectiveFrom: "2026-05-16T15:00:00.000Z",
      ingredients: [{ ingredientId: "NO-SUCH-INGREDIENT", qty: 0.2, uom: "kg" }],
      submit: true,
      version: "manual-bad-ingredient",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
      state: "active",
    }])).toThrow(/unknown ingredient/);
  });

  it("rejects invalid simulation gateway waste before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { wasteRows: number } };
      };

      await expect(gateway.submitKioskWaste({
        external_id: "BAY-GATEWAY-BAD-WASTE-COST",
        kiosk: "K-01",
        cashier: "Maya Ahmed",
        item: "COFFEE-BEANS",
        name: "Coffee beans bad cost",
        qty: 1,
        reason: "Cost tamper",
        estimated_cost: 1,
        recorded_at: "2026-05-16T15:24:00.000Z",
      })).rejects.toThrow(/does not match/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { wasteRows: number } };
      };

      expect(after.summary.sourceCounts.wasteRows).toBe(before.summary.sourceCounts.wasteRows);
    });
  });

  it("rejects stale simulation gateway shift-close stock counts before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as GatewayStockSnapshot & {
        summary: { sourceCounts: { closingRows: number } };
      };
      const staleCount = stockCountLine(before, "K-01", "COFFEE-BEANS", -1);

      await expect(gateway.submitShiftClose({
        kioskId: "K-01",
        cashier: "Maya Ahmed",
        stock: [],
        shift: {
          id: "SIM-SESSION-K-01-STALE",
          openedAt: "2026-05-16T15:00:00.000Z",
          openingCash: 100000,
          sales: [],
          waste: [],
        },
        draft: {
          actualCash: 100000,
          stockCounts: [
            { ...staleCount, expected_qty: staleCount.expected_qty + 1 },
          ],
        },
      })).rejects.toThrow(/expected stock/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { closingRows: number } };
      };

      expect(after.summary.sourceCounts.closingRows).toBe(before.summary.sourceCounts.closingRows);
    });
  });

  it("persists manager review decisions for simulated close rows", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const next = applyManualSimulationCloseReviews(base, [{
      closeId: "SIM-CLOSE-K-04",
      decision: "approved",
      note: "Approved by manager after variance review.",
      reviewed_at: "2026-05-16T15:00:00.000Z",
    }]);
    const close = next.closings.find((row) => row.id === "SIM-CLOSE-K-04") as Record<string, unknown> | undefined;

    expect(close?.status).toBe("approved");
    expect(close?.investigationStatus).toBe("Approved by manager");
    expect(close?.notes).toBe("Approved by manager after variance review.");
    expect(next.summary.alerts.unresolvedVariances).toBe(base.summary.alerts.unresolvedVariances - 1);
  });

  it("rejects close-review replays for missing close rows before alert totals change", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationCloseReviews(base, [{
      closeId: "SIM-CLOSE-DOES-NOT-EXIST",
      decision: "approved",
      note: "Should not be accepted during replay.",
      reviewed_at: "2026-05-16T15:05:00.000Z",
    }])).toThrow(/not found for review/);
  });

  it("replays close-review history sequentially so approved closes stay terminal", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const next = applyManualSimulationCloseReviews(base, [
      {
        closeId: "SIM-CLOSE-K-04",
        decision: "approved",
        note: "Approved after recount.",
        reviewed_at: "2026-05-16T15:00:00.000Z",
      },
      {
        closeId: "SIM-CLOSE-K-04",
        decision: "rejected",
        note: "Late conflicting replay should not reopen.",
        reviewed_at: "2026-05-16T15:10:00.000Z",
      },
    ]);
    const close = next.closings.find((row) => row.id === "SIM-CLOSE-K-04") as Record<string, unknown> | undefined;

    expect(close?.status).toBe("approved");
    expect(close?.managerReviewState).toBe("approved");
    expect(close?.notes).toBe("Approved after recount.");
    expect(next.summary.alerts.unresolvedVariances).toBe(base.summary.alerts.unresolvedVariances - 1);
  });

  it("validates and idempotently reviews simulation gateway close decisions", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const beforeClose = await gateway.getChainBootstrap() as GatewayStockSnapshot;
      const closePayload = {
        kioskId: "K-03",
        cashier: "Review Cashier",
        stock: [],
        shift: {
          id: "SIM-SESSION-K-03-REVIEW",
          openedAt: "2026-05-16T15:00:00.000Z",
          openingCash: 100000,
          sales: [{
            id: "SIM-GATEWAY-REVIEW-SALE",
            lines: [],
            subtotal: 4500,
            tax: 0,
            total: 4500,
            tender: { method: "cash" as const },
            createdAt: "2026-05-16T15:10:00.000Z",
          }],
          waste: [],
        },
        draft: {
          actualCash: 104500,
          stockCounts: [stockCountLine(beforeClose, "K-03", "COFFEE-BEANS")],
        },
      };
      const close = await gateway.submitShiftClose(closePayload) as { name: string };
      const first = await gateway.reviewShiftClose({
        closeId: close.name,
        decision: "approved",
        note: "Approved after recount.",
      }) as { status: string };
      const second = await gateway.reviewShiftClose({
        closeId: close.name,
        decision: "approved",
        note: "Approved after recount.",
      }) as { status: string };
      const after = await gateway.getChainBootstrap() as {
        closings: Array<{ id: string; status?: string; notes?: string }>;
      };
      const reviewedClose = after.closings.find((row) => row.id === close.name);

      await expect(gateway.reviewShiftClose({
        closeId: "SIM-CLOSE-DOES-NOT-EXIST",
        decision: "approved",
      })).rejects.toThrow(/not found/);
      expect(first.status).toBe("approved");
      expect(second.status).toBe("approved");
      expect(reviewedClose?.status).toBe("approved");
      expect(reviewedClose?.notes).toBe("Approved after recount.");
    });
  });

  it("locks approved simulation gateway close reviews against opposite decisions", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const beforeClose = await gateway.getChainBootstrap() as GatewayStockSnapshot;
      const closePayload = {
        kioskId: "K-04",
        cashier: "Review Lock Cashier",
        stock: [],
        shift: {
          id: "SIM-SESSION-K-04-LOCK",
          openedAt: "2026-05-16T15:00:00.000Z",
          openingCash: 100000,
          sales: [],
          waste: [],
        },
        draft: {
          actualCash: 100000,
          stockCounts: [stockCountLine(beforeClose, "K-04", "COFFEE-BEANS")],
        },
      };
      const close = await gateway.submitShiftClose(closePayload) as { name: string };

      await gateway.reviewShiftClose({
        closeId: close.name,
        decision: "approved",
        note: "Approved and locked.",
      });
      await expect(gateway.reviewShiftClose({
        closeId: close.name,
        decision: "rejected",
        note: "Try to reopen after approval.",
      })).rejects.toThrow(/locked/);

      const after = await gateway.getChainBootstrap() as {
        closings: Array<{ id: string; status?: string; managerReviewState?: string; notes?: string }>;
      };
      const reviewedClose = after.closings.find((row) => row.id === close.name);

      expect(reviewedClose?.status).toBe("approved");
      expect(reviewedClose?.managerReviewState).toBe("approved");
      expect(reviewedClose?.notes).toBe("Approved and locked.");
    });
  });

  it("rejects unsupported simulation gateway close-review decisions before replay state changes", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const beforeClose = await gateway.getChainBootstrap() as GatewayStockSnapshot;
      const closePayload = {
        kioskId: "K-05",
        cashier: "Review Invalid Cashier",
        stock: [],
        shift: {
          id: "SIM-SESSION-K-05-INVALID-REVIEW",
          openedAt: "2026-05-16T15:00:00.000Z",
          openingCash: 100000,
          sales: [],
          waste: [],
        },
        draft: {
          actualCash: 100000,
          stockCounts: [stockCountLine(beforeClose, "K-05", "COFFEE-BEANS")],
        },
      };
      const close = await gateway.submitShiftClose(closePayload) as { name: string };

      await expect(gateway.reviewShiftClose({
        closeId: close.name,
        decision: "reopen" as never,
        note: "Unsupported close review action.",
      })).rejects.toThrow(/Unsupported simulation close review decision/);

      const after = await gateway.getChainBootstrap() as {
        closings: Array<{ id: string; status?: string; managerReviewState?: string }>;
      };
      const reviewedClose = after.closings.find((row) => row.id === close.name);

      expect(reviewedClose?.status).toBe("pending");
      expect(reviewedClose?.managerReviewState).toBeUndefined();
    });
  });

  it("rejects invalid simulation gateway transfer drafts before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { transferRows: number } };
      };

      await expect(gateway.submitStockTransfer({
        kioskId: "K-01",
        itemId: "DOES-NOT-EXIST",
        qty: 25,
      })).rejects.toThrow(/unknown stock item/);

      await expect(gateway.submitStockTransfer({
        kioskId: "K-99",
        itemId: "CUP-12OZ",
        qty: 25,
      })).rejects.toThrow(/unknown kiosk/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { transferRows: number } };
      };

      expect(after.summary.sourceCounts.transferRows).toBe(before.summary.sourceCounts.transferRows);
    });
  });

  it("rejects invalid simulation gateway purchase orders before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { purchaseOrders: number } };
      };

      await expect(gateway.submitPurchaseOrder({
        supplier: "Unknown Supplier",
        warehouse: "Baghdad Area Warehouse",
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 80 }],
      })).rejects.toThrow(/unknown supplier/);

      await expect(gateway.submitPurchaseOrder({
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 0 }],
      })).rejects.toThrow(/non-positive rate/);

      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { purchaseOrders: number } };
      };

      expect(after.summary.sourceCounts.purchaseOrders).toBe(before.summary.sourceCounts.purchaseOrders);
    });
  });

  it("moves received transfer stock from warehouse into the destination kiosk", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const beforeDetail = base.kioskStockDetails["K-07"]?.find((row) => row.item === "CUP-12OZ");

    const next = applyManualSimulationTransferActions(base, [{
      transfer: "WH/INT/PEAK-002",
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:00:00.000Z",
    }]);
    const afterTransfer = next.transfers.find((row) => row.name === "WH/INT/PEAK-002");
    const afterKiosk = next.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = next.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const afterDetail = next.kioskStockDetails["K-07"]?.find((row) => row.item === "CUP-12OZ");

    expect(afterTransfer?.bayaan_state).toBe("received");
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + 160, 3);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - 160, 3);
    expect(Number(afterDetail?.received)).toBeCloseTo(Number(beforeDetail?.received || 0) + 160, 3);
    expect(Number(afterDetail?.actual_qty)).toBeCloseTo(Number(afterKiosk?.actual_qty), 3);
    expect(next.suggested_transfers.some((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ")).toBe(false);
    expect(next.summary.alerts.lowStockItems).toBe(next.suggested_transfers.length);
  });

  it("persists manually created transfer rows through source snapshot actions", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-K-07-CUP-12OZ",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }]);
    const withApprove = applyManualSimulationTransferActions(withDraft, [{
      transfer: "SIM-DRAFT-K-07-CUP-12OZ",
      action: "approve",
      bayaan_state: "approved",
      acted_at: "2026-05-16T15:02:00.000Z",
    }]);
    const withPick = applyManualSimulationTransferActions(withApprove, [{
      transfer: "SIM-DRAFT-K-07-CUP-12OZ",
      action: "pick",
      bayaan_state: "picked",
      acted_at: "2026-05-16T15:04:00.000Z",
    }]);
    const withDispatch = applyManualSimulationTransferActions(withPick, [{
      transfer: "SIM-DRAFT-K-07-CUP-12OZ",
      action: "dispatch",
      bayaan_state: "dispatched",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const draftTransfer = withDraft.transfers.find((row) => row.name === "SIM-DRAFT-K-07-CUP-12OZ");
    const transfer = withDispatch.transfers.find((row) => row.name === "SIM-DRAFT-K-07-CUP-12OZ");

    expect(withDraft.summary.sourceCounts.transferRows).toBe(base.summary.sourceCounts.transferRows + 1);
    expect(withDraft.summary.reportPeriods.daily.sourceCounts.transferRows).toBe(withDraft.transfers.length);
    expect(draftTransfer?.movedQty).toBe(0);
    expect(draftTransfer?.lines[0]?.qty).toBe(260);
    expect(draftTransfer?.lines[0]?.doneQty).toBe(0);
    expect(draftTransfer?.lines[0]?.receivedQty).toBe(0);
    expect(transfer?.bayaan_state).toBe("dispatched");
    expect(transfer?.lines[0]?.product).toBe("CUP-12OZ");
    expect(transfer?.lines[0]?.qty).toBe(260);
    expect(transfer?.lines[0]?.doneQty).toBe(0);
    expect(transfer?.lines[0]?.receivedQty).toBe(0);
  });

  it("persists one manual kiosk transfer with multiple item lines", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      items: [
        { itemId: "CUP-12OZ", qty: 260 },
        { itemId: "MILK-WHOLE", qty: 12 },
      ],
      name: "SIM-DRAFT-K-07-MULTI",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
    }]);

    const draftTransfer = withDraft.transfers.find((row) => row.name === "SIM-DRAFT-K-07-MULTI");

    expect(withDraft.summary.sourceCounts.transferRows).toBe(base.summary.sourceCounts.transferRows + 1);
    expect(draftTransfer?.toKioskId).toBe("K-07");
    expect(draftTransfer?.lines).toHaveLength(2);
    expect(draftTransfer?.lines.map((line) => line.product)).toEqual(["CUP-12OZ", "MILK-WHOLE"]);
  });

  it("is idempotent for duplicate manual transfer draft names", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const transfer = {
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-DUPLICATE-CUP-12OZ",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 12,
    };

    const first = applyManualSimulationTransfers(base, [transfer, { ...transfer, sequence: 13 }]);
    const second = applyManualSimulationTransfers(first, [transfer]);

    expect(first.transfers.filter((row) => row.name === transfer.name)).toHaveLength(1);
    expect(second.transfers.filter((row) => row.name === transfer.name)).toHaveLength(1);
    expect(second.summary.sourceCounts.transferRows).toBe(base.summary.sourceCounts.transferRows + 1);
    expect(second.meta.rows_returned.transfers).toBe(Number(base.meta.rows_returned.transfers || 0) + 1);
  });

  it("rejects invalid manual transfer create replays before source rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationTransfers(base, [{
      kioskId: "K-99",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-BAD-KIOSK",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 16,
    }])).toThrow(/unknown kiosk K-99/);

    expect(() => applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "NOT-A-STOCK-ITEM",
      qty: 260,
      name: "SIM-DRAFT-BAD-ITEM",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 17,
    }])).toThrow(/unknown stock item NOT-A-STOCK-ITEM/);
  });

  it("rejects transfer action replays for missing transfer rows before source state changes", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationTransferActions(base, [{
      transfer: "SIM-TRANSFER-DOES-NOT-EXIST",
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:05:00.000Z",
    }])).toThrow(/not found for action replay/);
  });

  it("blocks transfer action jumps that skip approve and pick states", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-DISPATCH-BLOCKED",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 5,
    }]);

    const attemptedDispatch = applyManualSimulationTransferActions(withDraft, [{
      transfer: "SIM-DRAFT-DISPATCH-BLOCKED",
      action: "dispatch",
      bayaan_state: "dispatched",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const transfer = attemptedDispatch.transfers.find((row) => row.name === "SIM-DRAFT-DISPATCH-BLOCKED");

    expect(transfer?.bayaan_state).toBe("draft");
  });

  it("returns the actual transfer state for blocked simulation gateway actions", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.submitStockTransfer({
        kioskId: "K-07",
        itemId: "CUP-12OZ",
        qty: 160,
      }) as { name: string };
      const attemptedDispatch = await gateway.stockTransferAction({
        transfer: created.name,
        action: "dispatch",
      }) as { bayaan_state: string };
      const after = await gateway.getChainBootstrap() as {
        transfers: Array<{ name: string; bayaan_state?: string }>;
      };
      const transfer = after.transfers.find((row) => row.name === created.name);

      expect(attemptedDispatch.bayaan_state).toBe("draft");
      expect(transfer?.bayaan_state).toBe("draft");
    });
  });

  it("rejects unsupported simulation gateway transfer actions before replay state changes", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.submitStockTransfer({
        kioskId: "K-07",
        itemId: "CUP-12OZ",
        qty: 160,
      }) as { name: string };

      await expect(gateway.stockTransferAction({
        transfer: created.name,
        action: "reverse" as never,
      })).rejects.toThrow(/Unsupported simulation transfer action/);

      const after = await gateway.getChainBootstrap() as {
        transfers: Array<{ name: string; bayaan_state?: string }>;
      };
      const transfer = after.transfers.find((row) => row.name === created.name);

      expect(transfer?.bayaan_state).toBe("draft");
    });
  });

  it("replays transfer action history in order during simulated refresh", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-SEQUENTIAL-DISPATCH",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 10,
    }]);

    const withHistory = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: "SIM-DRAFT-SEQUENTIAL-DISPATCH",
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: "SIM-DRAFT-SEQUENTIAL-DISPATCH",
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: "SIM-DRAFT-SEQUENTIAL-DISPATCH",
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
    ]);
    const transfer = withHistory.transfers.find((row) => row.name === "SIM-DRAFT-SEQUENTIAL-DISPATCH");

    expect(transfer?.bayaan_state).toBe("dispatched");
  });

  it("rejects transfer receipt replay items outside the transfer lines", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const transferName = "SIM-DRAFT-BAD-RECEIPT-LINE";
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 14,
    }]);
    const dispatched = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
    ]);

    expect(() => applyManualSimulationTransferActions(dispatched, [{
      transfer: transferName,
      action: "receive",
      bayaan_state: "received",
      items: [{ itemId: "ORANGES", qty: 10 }],
      acted_at: "2026-05-16T15:05:00.000Z",
    }])).toThrow(/receipt references item ORANGES outside transfer lines/);
  });

  it("does not receive transfer stock before the transfer is dispatched", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 260,
      name: "SIM-DRAFT-RECEIVE-BLOCKED",
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 6,
    }]);

    const attemptedReceive = applyManualSimulationTransferActions(withDraft, [{
      transfer: "SIM-DRAFT-RECEIVE-BLOCKED",
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const transfer = attemptedReceive.transfers.find((row) => row.name === "SIM-DRAFT-RECEIVE-BLOCKED");
    const afterKiosk = attemptedReceive.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = attemptedReceive.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(transfer?.bayaan_state).toBe("draft");
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty), 3);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
  });

  it("caps received transfer quantity at warehouse availability so stock cannot go negative", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const availableQty = Number(beforeWarehouse?.actual_qty || 0);
    const requestedQty = availableQty + 500;
    const transferName = "SIM-OVERDRAW-K-07-CUP-12OZ";

    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: requestedQty,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 7,
    }]);
    const approved = applyManualSimulationTransferActions(withDraft, [{
      transfer: transferName,
      action: "approve",
      bayaan_state: "approved",
      acted_at: "2026-05-16T15:01:00.000Z",
    }]);
    const picked = applyManualSimulationTransferActions(approved, [{
      transfer: transferName,
      action: "pick",
      bayaan_state: "picked",
      acted_at: "2026-05-16T15:02:00.000Z",
    }]);
    const dispatched = applyManualSimulationTransferActions(picked, [{
      transfer: transferName,
      action: "dispatch",
      bayaan_state: "dispatched",
      acted_at: "2026-05-16T15:03:00.000Z",
    }]);
    const received = applyManualSimulationTransferActions(dispatched, [{
      transfer: transferName,
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const transfer = received.transfers.find((row) => row.name === transferName);
    const afterKiosk = received.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = received.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(Number(afterWarehouse?.actual_qty)).toBe(0);
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + availableQty, 3);
    expect(transfer?.movedQty).toBe(availableQty);
    expect(transfer?.receiptShortageQty).toBe(500);
    expect(received.warehouse_stock.every((row) => Number(row.actual_qty || 0) >= 0)).toBe(true);
  });

  it("is idempotent for duplicate transfer receive retries", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const transferName = "SIM-DUP-RECEIVE-K-07-CUP-12OZ";
    const requestedQty = 160;

    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: requestedQty,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 8,
    }]);
    const received = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        acted_at: "2026-05-16T15:04:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        acted_at: "2026-05-16T15:04:00.000Z",
      },
    ]);
    const retried = applyManualSimulationTransferActions(received, [{
      transfer: transferName,
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:04:00.000Z",
    }]);
    const transfer = retried.transfers.find((row) => row.name === transferName);
    const afterKiosk = retried.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = retried.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(transfer?.bayaan_state).toBe("received");
    expect(transfer?.movedQty).toBe(requestedQty);
    expect(transfer?.receiptShortageQty).toBe(0);
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + requestedQty, 3);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - requestedQty, 3);
  });

  it("supports partial transfer receipts and follow-up completion without double-moving stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const transferName = "SIM-PARTIAL-RECEIVE-K-07-CUP-12OZ";

    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 160,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 9,
    }]);
    const partial = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        items: [{ itemId: "CUP-12OZ", qty: 60 }],
        acted_at: "2026-05-16T15:04:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        items: [{ itemId: "CUP-12OZ", qty: 60 }],
        acted_at: "2026-05-16T15:04:00.000Z",
      },
    ]);
    const partialTransfer = partial.transfers.find((row) => row.name === transferName);
    const afterPartialKiosk = partial.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterPartialWarehouse = partial.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(partialTransfer?.bayaan_state).toBe("partial");
    expect(partialTransfer?.movedQty).toBe(60);
    expect(partialTransfer?.lines[0]?.doneQty).toBe(60);
    expect(Number(afterPartialKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + 60, 3);
    expect(Number(afterPartialWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - 60, 3);

    const completed = applyManualSimulationTransferActions(partial, [{
      transfer: transferName,
      action: "receive",
      bayaan_state: "received",
      acted_at: "2026-05-16T15:08:00.000Z",
    }]);
    const completedTransfer = completed.transfers.find((row) => row.name === transferName);
    const afterCompleteKiosk = completed.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterCompleteWarehouse = completed.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(completedTransfer?.bayaan_state).toBe("received");
    expect(completedTransfer?.movedQty).toBe(160);
    expect(completedTransfer?.receiptShortageQty).toBe(0);
    expect(completedTransfer?.lines[0]?.doneQty).toBe(160);
    expect(Number(afterCompleteKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + 160, 3);
    expect(Number(afterCompleteWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - 160, 3);
  });

  it("records partial transfer receipt shortage when warehouse cannot satisfy the requested quantity", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const availableQty = Number(beforeWarehouse?.actual_qty || 0);
    const transferName = "SIM-PARTIAL-SHORTAGE-K-07-CUP-12OZ";

    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: availableQty + 500,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 10,
    }]);
    const partial = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        items: [{ itemId: "CUP-12OZ", qty: availableQty + 100 }],
        acted_at: "2026-05-16T15:04:00.000Z",
      },
    ]);
    const transfer = partial.transfers.find((row) => row.name === transferName);
    const afterKiosk = partial.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = partial.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(transfer?.bayaan_state).toBe("partial");
    expect(transfer?.movedQty).toBe(availableQty);
    expect(transfer?.receiptShortageQty).toBe(100);
    expect(Number(afterWarehouse?.actual_qty)).toBe(0);
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + availableQty, 3);
  });

  it("ignores transfer receive actions that contain no matching positive quantity", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const transferName = "SIM-NOOP-RECEIVE-K-07-CUP-12OZ";
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 160,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 11,
    }]);
    const afterNoop = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        items: [{ itemId: "MILK-WHOLE", qty: 0 }],
        acted_at: "2026-05-16T15:04:00.000Z",
      },
    ]);
    const transfer = afterNoop.transfers.find((row) => row.name === transferName);
    const afterKiosk = afterNoop.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = afterNoop.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(transfer?.bayaan_state).toBe("dispatched");
    expect(transfer?.movedQty).toBe(0);
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty), 3);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
  });

  it("does not cancel a partially received transfer after stock has moved", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeKiosk = base.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "CUP-12OZ");
    const transferName = "SIM-PARTIAL-CANCEL-BLOCKED";
    const withDraft = applyManualSimulationTransfers(base, [{
      kioskId: "K-07",
      itemId: "CUP-12OZ",
      qty: 160,
      name: transferName,
      bayaan_state: "draft",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 10,
    }]);
    const partial = applyManualSimulationTransferActions(withDraft, [
      {
        transfer: transferName,
        action: "approve",
        bayaan_state: "approved",
        acted_at: "2026-05-16T15:01:00.000Z",
      },
      {
        transfer: transferName,
        action: "pick",
        bayaan_state: "picked",
        acted_at: "2026-05-16T15:02:00.000Z",
      },
      {
        transfer: transferName,
        action: "dispatch",
        bayaan_state: "dispatched",
        acted_at: "2026-05-16T15:03:00.000Z",
      },
      {
        transfer: transferName,
        action: "receive",
        bayaan_state: "received",
        items: [{ itemId: "CUP-12OZ", qty: 60 }],
        acted_at: "2026-05-16T15:04:00.000Z",
      },
    ]);
    const attemptedCancel = applyManualSimulationTransferActions(partial, [{
      transfer: transferName,
      action: "cancel",
      bayaan_state: "cancelled",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const transfer = attemptedCancel.transfers.find((row) => row.name === transferName);
    const afterKiosk = attemptedCancel.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
    const afterWarehouse = attemptedCancel.warehouse_stock.find((row) => row.item === "CUP-12OZ");

    expect(transfer?.bayaan_state).toBe("partial");
    expect(transfer?.movedQty).toBe(60);
    expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + 60, 3);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - 60, 3);
  });

  it("returns partial transfer state from simulation gateway receipt actions", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        kiosk_stock_rows: Array<{ kiosk: string; item: string; actual_qty?: number }>;
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const beforeKiosk = before.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
      const beforeWarehouse = before.warehouse_stock.find((row) => row.item === "CUP-12OZ");
      const created = await gateway.submitStockTransfer({
        kioskId: "K-07",
        itemId: "CUP-12OZ",
        qty: 160,
      }) as { name: string };

      await gateway.stockTransferAction({ transfer: created.name, action: "approve" });
      await gateway.stockTransferAction({ transfer: created.name, action: "pick" });
      await gateway.stockTransferAction({ transfer: created.name, action: "dispatch" });
      const partial = await gateway.stockTransferAction({
        transfer: created.name,
        action: "receive",
        items: [{ itemId: "CUP-12OZ", qty: 60 }],
      }) as { bayaan_state: string };
      const duplicate = await gateway.stockTransferAction({
        transfer: created.name,
        action: "receive",
        items: [{ itemId: "CUP-12OZ", qty: 60 }],
      }) as { bayaan_state: string };
      const afterPartial = await gateway.getChainBootstrap() as {
        transfers: Array<{ name: string; bayaan_state?: string; movedQty?: number }>;
        kiosk_stock_rows: Array<{ kiosk: string; item: string; actual_qty?: number }>;
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const transfer = afterPartial.transfers.find((row) => row.name === created.name);
      const afterKiosk = afterPartial.kiosk_stock_rows.find((row) => row.kiosk === "K-07" && row.item === "CUP-12OZ");
      const afterWarehouse = afterPartial.warehouse_stock.find((row) => row.item === "CUP-12OZ");

      expect(partial.bayaan_state).toBe("partial");
      expect(duplicate.bayaan_state).toBe("partial");
      expect(transfer?.movedQty).toBe(60);
      expect(Number(afterKiosk?.actual_qty)).toBeCloseTo(Number(beforeKiosk?.actual_qty) + 60, 3);
      expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) - 60, 3);

      const completed = await gateway.stockTransferAction({ transfer: created.name, action: "receive" }) as {
        bayaan_state: string;
      };

      expect(completed.bayaan_state).toBe("received");
    });
  });

  it("moves completed purchase receipts into warehouse stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "ORANGES");

    const next = applyManualSimulationPurchaseActions(base, [{
      po: "PO/SIM/ORANGES-0516",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:00:00.000Z",
    }]);
    const afterPo = next.purchase_orders.find((row) => row.name === "PO/SIM/ORANGES-0516");
    const afterWarehouse = next.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(afterPo?.receipt_state).toBe("done");
    expect(afterPo?.lines[0]?.receivedQty).toBe(1600);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 700, 3);
  });

  it("supports partial purchase receipts without posting the full remaining quantity", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "ORANGES");

    const partial = applyManualSimulationPurchaseActions(base, [{
      po: "PO/SIM/ORANGES-0516",
      action: "receive",
      items: [{ itemId: "ORANGES", qty: 300 }],
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:00:00.000Z",
    }]);
    const partialPo = partial.purchase_orders.find((row) => row.name === "PO/SIM/ORANGES-0516");
    const afterPartialWarehouse = partial.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(partialPo?.state).toBe("partial");
    expect(partialPo?.receipt_state).toBe("partial");
    expect(partialPo?.lines[0]?.receivedQty).toBe(1200);
    expect(Number(afterPartialWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 300, 3);

    const complete = applyManualSimulationPurchaseActions(partial, [{
      po: "PO/SIM/ORANGES-0516",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:10:00.000Z",
    }]);
    const completePo = complete.purchase_orders.find((row) => row.name === "PO/SIM/ORANGES-0516");
    const afterCompleteWarehouse = complete.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(completePo?.receipt_state).toBe("done");
    expect(completePo?.lines[0]?.receivedQty).toBe(1600);
    expect(Number(afterCompleteWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 700, 3);
  });

  it("is idempotent for duplicate partial purchase receive actions", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "ORANGES");
    const action = {
      po: "PO/SIM/ORANGES-0516",
      action: "receive" as const,
      items: [{ itemId: "ORANGES", qty: 300 }],
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:00:00.000Z",
    };

    const next = applyManualSimulationPurchaseActions(base, [action, action]);
    const po = next.purchase_orders.find((row) => row.name === "PO/SIM/ORANGES-0516");
    const afterWarehouse = next.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(po?.receipt_state).toBe("partial");
    expect(po?.lines[0]?.receivedQty).toBe(1200);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 300, 3);
  });

  it("ignores purchase receive actions that contain no matching positive quantity", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "MILK-WHOLE");
    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/NOOP-MILK",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 12,
    }]);

    const afterNoop = applyManualSimulationPurchaseActions(withPo, [{
      po: "PO/SIM/NOOP-MILK",
      action: "receive",
      items: [{ itemId: "ORANGES", qty: 0 }],
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const po = afterNoop.purchase_orders.find((row) => row.name === "PO/SIM/NOOP-MILK");
    const afterWarehouse = afterNoop.warehouse_stock.find((row) => row.item === "MILK-WHOLE");

    expect(po?.receipt_state).toBe("none");
    expect(po?.lines[0]?.receivedQty).toBe(0);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
  });

  it("rejects purchase action replays for missing purchase orders before warehouse stock changes", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationPurchaseActions(base, [{
      po: "PO/SIM/DOES-NOT-EXIST",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:05:00.000Z",
    }])).toThrow(/not found for action replay/);
  });

  it("rejects purchase receipt replay items outside the purchase lines", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/BAD-RECEIPT-LINE",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 13,
    }]);

    expect(() => applyManualSimulationPurchaseActions(withPo, [{
      po: "PO/SIM/BAD-RECEIPT-LINE",
      action: "receive",
      items: [{ itemId: "ORANGES", qty: 3 }],
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:05:00.000Z",
    }])).toThrow(/receipt references item ORANGES outside purchase lines/);
  });

  it("returns partial purchase state from simulation gateway receipt actions", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.submitPurchaseOrder({
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        scheduleDate: "2026-05-16",
        submit: true,
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 80 }],
      }) as { name: string };
      const partial = await gateway.purchaseOrderAction({
        po: created.name,
        action: "receive",
        items: [{ itemId: "CUP-12OZ", qty: 40 }],
      }) as { state: string; receipt_state: string };
      const after = await gateway.getChainBootstrap() as {
        purchase_orders: Array<{ name: string; receipt_state?: string; lines: Array<{ receivedQty?: number }> }>;
      };
      const po = after.purchase_orders.find((row) => row.name === created.name);

      expect(partial.state).toBe("partial");
      expect(partial.receipt_state).toBe("partial");
      expect(po?.receipt_state).toBe("partial");
      expect(po?.lines[0]?.receivedQty).toBe(40);
    });
  });

  it("rejects invalid simulation gateway purchase receipt items before poisoning replay state", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const beforeWarehouse = before.warehouse_stock.find((row) => row.item === "CUP-12OZ");
      const created = await gateway.submitPurchaseOrder({
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        scheduleDate: "2026-05-16",
        submit: true,
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 80 }],
      }) as { name: string };

      await expect(gateway.purchaseOrderAction({
        po: created.name,
        action: "receive",
        items: [{ itemId: "ORANGES", qty: 5 }],
      })).rejects.toThrow(/outside purchase lines/);

      const after = await gateway.getChainBootstrap() as {
        purchase_orders: Array<{ name: string; receipt_state?: string; lines: Array<{ receivedQty?: number }> }>;
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const po = after.purchase_orders.find((row) => row.name === created.name);
      const afterWarehouse = after.warehouse_stock.find((row) => row.item === "CUP-12OZ");

      expect(po?.receipt_state).toBe("none");
      expect(po?.lines[0]?.receivedQty).toBe(0);
      expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
    });
  });

  it("rejects unsupported simulation gateway purchase actions before source state changes", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.submitPurchaseOrder({
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        scheduleDate: "2026-05-16",
        submit: true,
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 80 }],
      }) as { name: string };

      await expect(gateway.purchaseOrderAction({
        po: created.name,
        action: "reverse" as never,
      })).rejects.toThrow(/Unsupported simulation purchase action/);

      const after = await gateway.getChainBootstrap() as {
        purchase_orders: Array<{ name: string; state?: string; receipt_state?: string }>;
      };
      const po = after.purchase_orders.find((row) => row.name === created.name);

      expect(po?.state).toBe("purchase");
      expect(po?.receipt_state).toBe("none");
    });
  });

  it("returns the actual purchase state for duplicate simulation gateway receipt retries", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const beforeWarehouse = before.warehouse_stock.find((row) => row.item === "CUP-12OZ");
      const created = await gateway.submitPurchaseOrder({
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        scheduleDate: "2026-05-16",
        submit: true,
        items: [{ itemId: "CUP-12OZ", qty: 100, rate: 80 }],
      }) as { name: string };

      await gateway.purchaseOrderAction({ po: created.name, action: "receive" });
      const second = await gateway.purchaseOrderAction({ po: created.name, action: "receive" }) as {
        state: string;
        receipt_state: string;
      };
      const after = await gateway.getChainBootstrap() as {
        purchase_orders: Array<{ name: string; receipt_state?: string }>;
        warehouse_stock: Array<{ item: string; actual_qty?: number }>;
      };
      const afterPo = after.purchase_orders.find((row) => row.name === created.name);
      const afterWarehouse = after.warehouse_stock.find((row) => row.item === "CUP-12OZ");

      expect(second.state).toBe("done");
      expect(second.receipt_state).toBe("done");
      expect(afterPo?.receipt_state).toBe("done");
      expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 100, 3);
    });
  });

  it("does not double-apply a partial receipt request across duplicate PO item lines", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "ORANGES");
    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Mesopotamia Fresh",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [
        { itemId: "ORANGES", qty: 200, rate: 1200 },
        { itemId: "ORANGES", qty: 200, rate: 1200 },
      ],
      name: "PO/SIM/DUP-ORANGES",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 8,
    }]);

    const partial = applyManualSimulationPurchaseActions(withPo, [{
      po: "PO/SIM/DUP-ORANGES",
      action: "receive",
      items: [{ itemId: "ORANGES", qty: 300 }],
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const partialPo = partial.purchase_orders.find((row) => row.name === "PO/SIM/DUP-ORANGES");
    const afterPartialWarehouse = partial.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(partialPo?.receipt_state).toBe("partial");
    expect(partialPo?.lines[0]?.receivedQty).toBe(200);
    expect(partialPo?.lines[1]?.receivedQty).toBe(100);
    expect(Number(afterPartialWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 300, 3);
  });

  it("does not cancel an already received purchase order or reverse warehouse stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const received = applyManualSimulationPurchaseActions(base, [{
      po: "PO/SIM/ORANGES-0516",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:00:00.000Z",
    }]);
    const afterReceiveWarehouse = received.warehouse_stock.find((row) => row.item === "ORANGES");

    const attemptedCancel = applyManualSimulationPurchaseActions(received, [{
      po: "PO/SIM/ORANGES-0516",
      action: "cancel",
      state: "cancelled",
      receipt_state: "cancelled",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);
    const po = attemptedCancel.purchase_orders.find((row) => row.name === "PO/SIM/ORANGES-0516");
    const afterCancelWarehouse = attemptedCancel.warehouse_stock.find((row) => row.item === "ORANGES");

    expect(po?.receipt_state).toBe("done");
    expect(Number(afterCancelWarehouse?.actual_qty)).toBeCloseTo(Number(afterReceiveWarehouse?.actual_qty), 3);
  });

  it("does not receive a cancelled purchase order into warehouse stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "MILK-WHOLE");
    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/CANCELLED-MILK",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 9,
    }]);
    const cancelled = applyManualSimulationPurchaseActions(withPo, [{
      po: "PO/SIM/CANCELLED-MILK",
      action: "cancel",
      state: "cancelled",
      receipt_state: "cancelled",
      acted_at: "2026-05-16T15:05:00.000Z",
    }]);

    const attemptedReceive = applyManualSimulationPurchaseActions(cancelled, [{
      po: "PO/SIM/CANCELLED-MILK",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:10:00.000Z",
    }]);
    const po = attemptedReceive.purchase_orders.find((row) => row.name === "PO/SIM/CANCELLED-MILK");
    const afterWarehouse = attemptedReceive.warehouse_stock.find((row) => row.item === "MILK-WHOLE");

    expect(po?.receipt_state).toBe("cancelled");
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
  });

  it("replays purchase action history in order so cancel blocks a later receive", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "MILK-WHOLE");
    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/HISTORY-CANCELLED-MILK",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 11,
    }]);

    const withHistory = applyManualSimulationPurchaseActions(withPo, [
      {
        po: "PO/SIM/HISTORY-CANCELLED-MILK",
        action: "cancel",
        state: "cancelled",
        receipt_state: "cancelled",
        acted_at: "2026-05-16T15:05:00.000Z",
      },
      {
        po: "PO/SIM/HISTORY-CANCELLED-MILK",
        action: "receive",
        state: "done",
        receipt_state: "done",
        acted_at: "2026-05-16T15:10:00.000Z",
      },
    ]);
    const po = withHistory.purchase_orders.find((row) => row.name === "PO/SIM/HISTORY-CANCELLED-MILK");
    const afterWarehouse = withHistory.warehouse_stock.find((row) => row.item === "MILK-WHOLE");

    expect(po?.receipt_state).toBe("cancelled");
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty), 3);
  });

  it("persists manually created purchase orders and receives them into warehouse stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const beforeWarehouse = base.warehouse_stock.find((row) => row.item === "MILK-WHOLE");

    const withPo = applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "Whole milk", qty: 20, rate: 1500 }],
      name: "PO/SIM/MANUAL-0001",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }]);
    const createdPo = withPo.purchase_orders.find((row) => row.name === "PO/SIM/MANUAL-0001");

    expect(createdPo?.amount_total).toBe(30000);
    expect(createdPo?.lines[0]?.product).toBe("MILK-WHOLE");
    expect(createdPo?.lines[0]?.receivedQty).toBe(0);
    expect(createdPo?.lines[0]?.uom).toBe("L");
    expect(withPo.meta.rows_returned.purchaseOrders).toBe(Number(base.meta.rows_returned.purchaseOrders || 0) + 1);
    expect(withPo.summary.sourceCounts.purchaseOrders).toBe(withPo.purchase_orders.length);
    expect(withPo.summary.reportPeriods.daily.sourceCounts.purchaseOrders).toBe(withPo.purchase_orders.length);

    const received = applyManualSimulationPurchaseActions(withPo, [{
      po: "PO/SIM/MANUAL-0001",
      action: "receive",
      state: "done",
      receipt_state: "done",
      acted_at: "2026-05-16T15:10:00.000Z",
    }]);
    const receivedPo = received.purchase_orders.find((row) => row.name === "PO/SIM/MANUAL-0001");
    const afterWarehouse = received.warehouse_stock.find((row) => row.item === "MILK-WHOLE");

    expect(receivedPo?.receipt_state).toBe("done");
    expect(receivedPo?.lines[0]?.receivedQty).toBe(20);
    expect(Number(afterWarehouse?.actual_qty)).toBeCloseTo(Number(beforeWarehouse?.actual_qty) + 20, 3);
  });

  it("is idempotent for duplicate manual purchase order names", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const po = {
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/DUPLICATE-MILK",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 14,
    };

    const first = applyManualSimulationPurchaseOrders(base, [po, { ...po, sequence: 15 }]);
    const second = applyManualSimulationPurchaseOrders(first, [po]);

    expect(first.purchase_orders.filter((row) => row.name === po.name)).toHaveLength(1);
    expect(second.purchase_orders.filter((row) => row.name === po.name)).toHaveLength(1);
    expect(second.summary.sourceCounts.purchaseOrders).toBe(base.summary.sourceCounts.purchaseOrders + 1);
    expect(second.meta.rows_returned.purchaseOrders).toBe(Number(base.meta.rows_returned.purchaseOrders || 0) + 1);
  });

  it("rejects invalid manual purchase order create replays before source rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationPurchaseOrders(base, [{
      supplier: "Unknown Supplier",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 1500 }],
      name: "PO/SIM/BAD-SUPPLIER",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 16,
    }])).toThrow(/unknown supplier Unknown Supplier/);

    expect(() => applyManualSimulationPurchaseOrders(base, [{
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      scheduleDate: "2026-05-16",
      submit: true,
      items: [{ itemId: "MILK-WHOLE", qty: 20, rate: 0 }],
      name: "PO/SIM/BAD-RATE",
      state: "purchase",
      receipt_state: "none",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 17,
    }])).toThrow(/non-positive rate/);
  });

  it("persists manually created recurring purchase plans with source item codes", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    const next = applyManualSimulationRecurringPurchases(base, [{
      id: 970001,
      name: "Daily cup replenishment",
      supplier: "Iraq Pack",
      warehouse: "Baghdad Area Warehouse",
      frequency: "daily",
      weekday: "0",
      nextDate: "2026-05-17",
      active: true,
      items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }]);
    const plan = next.recurring_purchases.find((row) => row.id === 970001);

    expect(plan?.name).toBe("Daily cup replenishment");
    expect(plan?.lines[0]?.product).toBe("CUP-12OZ");
    expect(plan?.lines[0]?.qty).toBe(500);
    expect(plan?.lines[0]?.uom).toBe("Units");
    expect(next.meta.rows_returned.recurringPurchases).toBe(Number(base.meta.rows_returned.recurringPurchases || 0) + 1);
    expect(next.summary.sourceCounts.recurringPurchaseRows).toBe(next.recurring_purchases.length);
    expect(next.summary.reportPeriods.daily.sourceCounts.recurringPurchaseRows).toBe(next.recurring_purchases.length);
  });

  it("is idempotent for duplicate manual recurring purchase plans", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const plan = {
      id: 970002,
      name: "Daily duplicate cup replenishment",
      supplier: "Iraq Pack",
      warehouse: "Baghdad Area Warehouse",
      frequency: "daily" as const,
      weekday: "0",
      nextDate: "2026-05-17",
      active: true,
      items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
    };

    const first = applyManualSimulationRecurringPurchases(base, [plan, { ...plan, id: 970003, sequence: 3 }]);
    const second = applyManualSimulationRecurringPurchases(first, [plan]);

    expect(first.recurring_purchases.filter((row) => row.name === plan.name)).toHaveLength(1);
    expect(second.recurring_purchases.filter((row) => row.name === plan.name)).toHaveLength(1);
    expect(second.summary.sourceCounts.recurringPurchaseRows).toBe(base.summary.sourceCounts.recurringPurchaseRows + 1);
    expect(second.meta.rows_returned.recurringPurchases).toBe(Number(base.meta.rows_returned.recurringPurchases || 0) + 1);
  });

  it("rejects invalid manual recurring purchase replays before source rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const validPlan = {
      id: 970004,
      name: "Invalid replay cup replenishment",
      supplier: "Iraq Pack",
      warehouse: "Baghdad Area Warehouse",
      frequency: "daily" as const,
      weekday: "0",
      nextDate: "2026-05-17",
      active: true,
      items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 4,
    };

    expect(() => applyManualSimulationRecurringPurchases(base, [{
      ...validPlan,
      supplier: "Missing Supplier Co",
    }])).toThrow(/unknown supplier/);

    expect(() => applyManualSimulationRecurringPurchases(base, [{
      ...validPlan,
      id: 970005,
      name: "Invalid replay bad rate",
      items: [{ itemId: "CUP-12OZ", qty: 500, rate: 0, uom: "Units" }],
      sequence: 5,
    }])).toThrow(/non-positive rate/);
  });

  it("is idempotent for duplicate recurring purchase run retries", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.createRecurringPurchase({
        name: "Retry-safe daily cup replenishment",
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        frequency: "daily",
        nextDate: "2026-05-17",
        active: true,
        items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      }) as { recurring_purchase: { id: string | number } };
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { purchaseOrders: number } };
      };
      const first = await gateway.recurringPurchaseAction({ id: created.recurring_purchase.id, action: "run" }) as {
        purchase_order: { name: string };
      };
      const second = await gateway.recurringPurchaseAction({ id: created.recurring_purchase.id, action: "run" }) as {
        purchase_order: { name: string };
      };
      const after = await gateway.getChainBootstrap() as {
        purchase_orders: Array<{
          name: string;
          supplier?: string;
          amount_total?: number;
          lines?: Array<{ product?: string; orderedQty?: number; priceUnit?: number }>;
        }>;
        summary: { sourceCounts: { purchaseOrders: number } };
      };
      const purchaseOrder = after.purchase_orders.find((row) => row.name === first.purchase_order.name);

      expect(second.purchase_order.name).toBe(first.purchase_order.name);
      expect(after.purchase_orders.filter((row) => row.name === first.purchase_order.name)).toHaveLength(1);
      expect(purchaseOrder?.supplier).toBe("Iraq Pack");
      expect(purchaseOrder?.amount_total).toBe(40000);
      expect(purchaseOrder?.lines?.[0]?.product).toBe("CUP-12OZ");
      expect(purchaseOrder?.lines?.[0]?.orderedQty).toBe(500);
      expect(purchaseOrder?.lines?.[0]?.priceUnit).toBe(80);
      expect(after.summary.sourceCounts.purchaseOrders).toBe(before.summary.sourceCounts.purchaseOrders + 1);
    });
  });

  it("does not run inactive recurring purchase plans into source purchase orders", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const created = await gateway.createRecurringPurchase({
        name: "Inactive retry cup replenishment",
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        frequency: "daily",
        nextDate: "2026-05-17",
        active: false,
        items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      }) as { recurring_purchase: { id: string | number } };
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { purchaseOrders: number } };
      };
      const result = await gateway.recurringPurchaseAction({ id: created.recurring_purchase.id, action: "run" }) as {
        skipped?: boolean;
        reason?: string;
      };
      const after = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { purchaseOrders: number } };
      };

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("inactive");
      expect(after.summary.sourceCounts.purchaseOrders).toBe(before.summary.sourceCounts.purchaseOrders);
    });
  });

  it("rejects invalid simulation gateway stock items before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { productRows: number; warehouseStockRows: number } };
      };

      await expect(gateway.createStockItem({
        name: "   ",
        unitCost: 65000,
      })).rejects.toThrow(/must include a name/);
      await expect(gateway.createStockItem({
        name: "Bad zero cost ingredient",
        code: "BAD-ZERO-COST-INGREDIENT",
        unitCost: 0,
      })).rejects.toThrow(/positive unit cost/);
      await expect(gateway.createStockItem({
        name: "Unknown supplier ingredient",
        code: "UNKNOWN-SUPPLIER-INGREDIENT",
        supplier: "Missing Supplier Co",
        unitCost: 1200,
      })).rejects.toThrow(/unknown supplier/);

      const after = await gateway.getChainBootstrap() as typeof before;

      expect(after.summary.sourceCounts.productRows).toBe(before.summary.sourceCounts.productRows);
      expect(after.summary.sourceCounts.warehouseStockRows).toBe(before.summary.sourceCounts.warehouseStockRows);
    });
  });

  it("rejects invalid simulation gateway recurring purchase plans before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { recurringPurchaseRows: number; purchaseOrders: number } };
      };
      const basePlan = {
        name: "Invalid daily cup replenishment",
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        frequency: "daily" as const,
        nextDate: "2026-05-17",
        active: true,
      };

      await expect(gateway.createRecurringPurchase({
        ...basePlan,
        supplier: "Missing Supplier Co",
        items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      })).rejects.toThrow(/unknown supplier/);
      await expect(gateway.createRecurringPurchase({
        ...basePlan,
        items: [{ itemId: "NO-SUCH-ITEM", qty: 500, rate: 80, uom: "Units" }],
      })).rejects.toThrow(/unknown stock item/);
      await expect(gateway.createRecurringPurchase({
        ...basePlan,
        items: [{ itemId: "CUP-12OZ", qty: 0, rate: 80, uom: "Units" }],
      })).rejects.toThrow(/non-positive quantity/);
      await expect(gateway.createRecurringPurchase({
        ...basePlan,
        items: [{ itemId: "CUP-12OZ", qty: 500, rate: 0, uom: "Units" }],
      })).rejects.toThrow(/non-positive rate/);

      const after = await gateway.getChainBootstrap() as typeof before;

      expect(after.summary.sourceCounts.recurringPurchaseRows).toBe(before.summary.sourceCounts.recurringPurchaseRows);
      expect(after.summary.sourceCounts.purchaseOrders).toBe(before.summary.sourceCounts.purchaseOrders);
    });
  });

  it("persists manually created stock items into products and warehouse stock", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    const next = applyManualSimulationStockItems(base, [{
      id: 960001,
      name: "Cardamom pods",
      code: "CARDAMOM-PODS",
      default_code: "CARDAMOM-PODS",
      category: "Spices",
      uom: "kg",
      supplier: "Baghdad Roasters",
      unitCost: 65000,
      purchasePrice: 65000,
      consumptionMode: "finished" as const,
      availableInPos: false,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }]);
    const product = next.products.find((row) => row.default_code === "CARDAMOM-PODS");
    const warehouseRow = next.warehouse_stock.find((row) => row.item === "CARDAMOM-PODS");

    expect(product?.name).toBe("Cardamom pods");
    expect(product?.standard_price).toBe(65000);
    expect(warehouseRow?.actual_qty).toBe(0);
    expect(warehouseRow?.uom).toBe("kg");
    expect(next.meta.rows_returned.products).toBe(Number(base.meta.rows_returned.products || 0) + 1);
    expect(next.meta.rows_returned.warehouseStock).toBe(Number(base.meta.rows_returned.warehouseStock || 0) + 1);
    expect(next.summary.sourceCounts.productRows).toBe(next.products.length);
    expect(next.summary.sourceCounts.warehouseStockRows).toBe(next.warehouse_stock.length);
    expect(next.summary.reportPeriods.daily.sourceCounts.productRows).toBe(next.products.length);
  });

  it("is idempotent for duplicate manual stock item codes", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const item = {
      id: 960002,
      name: "Cardamom pods",
      code: "CARDAMOM-PODS",
      default_code: "CARDAMOM-PODS",
      category: "Spices",
      uom: "kg",
      supplier: "Baghdad Roasters",
      unitCost: 65000,
      purchasePrice: 65000,
      consumptionMode: "finished" as const,
      availableInPos: false,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
    };

    const first = applyManualSimulationStockItems(base, [item, { ...item, id: 960003, sequence: 3 }]);
    const second = applyManualSimulationStockItems(first, [item]);

    expect(first.products.filter((row) => row.default_code === "CARDAMOM-PODS")).toHaveLength(1);
    expect(first.warehouse_stock.filter((row) => row.item === "CARDAMOM-PODS")).toHaveLength(1);
    expect(second.products.filter((row) => row.default_code === "CARDAMOM-PODS")).toHaveLength(1);
    expect(second.summary.sourceCounts.productRows).toBe(base.summary.sourceCounts.productRows + 1);
    expect(second.summary.sourceCounts.warehouseStockRows).toBe(base.summary.sourceCounts.warehouseStockRows + 1);
  });

  it("rejects invalid manual stock item replays before product and warehouse rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationStockItems(base, [{
      id: 960004,
      name: "Unknown supplier ingredient",
      code: "UNKNOWN-SUPPLIER-INGREDIENT",
      default_code: "UNKNOWN-SUPPLIER-INGREDIENT",
      category: "Ingredients",
      uom: "kg",
      supplier: "Missing Supplier Co",
      unitCost: 1200,
      purchasePrice: 1200,
      consumptionMode: "finished" as const,
      availableInPos: false,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 4,
    }])).toThrow(/unknown supplier/);

    expect(() => applyManualSimulationStockItems(base, [{
      id: 960005,
      name: "Bad zero cost ingredient",
      code: "BAD-ZERO-COST-INGREDIENT",
      default_code: "BAD-ZERO-COST-INGREDIENT",
      category: "Ingredients",
      uom: "kg",
      supplier: "Baghdad Roasters",
      unitCost: 0,
      purchasePrice: 0,
      consumptionMode: "finished" as const,
      availableInPos: false,
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 5,
    }])).toThrow(/positive unit cost/);
  });

  it("persists manually created suppliers into the supplier source rows", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    const next = applyManualSimulationSuppliers(base, [{
      id: 950001,
      name: "Simulation Spice Co",
      category: "Spices",
      address: "Karrada wholesale market",
      deliveryCategory: "Weekly",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 1,
    }]);
    const supplier = next.suppliers.find((row) => row.name === "Simulation Spice Co");

    expect(supplier?.category).toBe("Spices");
    expect(supplier?.address).toBe("Karrada wholesale market");
    expect(supplier?.deliveryCategory).toBe("Weekly");
    expect(next.meta.rows_returned.suppliers).toBe(Number(base.meta.rows_returned.suppliers || 0) + 1);
    expect(next.summary.sourceCounts.supplierRows).toBe(next.suppliers.length);
    expect(next.summary.reportPeriods.daily.sourceCounts.supplierRows).toBe(next.suppliers.length);
  });

  it("is idempotent for duplicate manual supplier names", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });
    const supplier = {
      id: 950002,
      name: "Simulation Spice Co",
      category: "Spices",
      address: "Karrada wholesale market",
      deliveryCategory: "Weekly",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 2,
    };

    const first = applyManualSimulationSuppliers(base, [supplier, { ...supplier, id: 950003, sequence: 3 }]);
    const second = applyManualSimulationSuppliers(first, [supplier]);

    expect(first.suppliers.filter((row) => row.name === "Simulation Spice Co")).toHaveLength(1);
    expect(second.suppliers.filter((row) => row.name === "Simulation Spice Co")).toHaveLength(1);
    expect(second.summary.sourceCounts.supplierRows).toBe(base.summary.sourceCounts.supplierRows + 1);
    expect(second.meta.rows_returned.suppliers).toBe(Number(base.meta.rows_returned.suppliers || 0) + 1);
  });

  it("rejects invalid manual supplier replays before source rows are created", () => {
    const base = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60 });

    expect(() => applyManualSimulationSuppliers(base, [{
      id: 950004,
      name: "   ",
      category: "Packaging",
      deliveryCategory: "Weekly",
      created_at: "2026-05-16T15:00:00.000Z",
      sequence: 4,
    }])).toThrow(/must include a name/);
  });

  it("rejects invalid simulation gateway suppliers before source rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { supplierRows: number } };
      };

      await expect(gateway.createSupplier({
        name: "  ",
        category: "Packaging",
        deliveryCategory: "Weekly",
      })).rejects.toThrow(/must include a name/);

      const after = await gateway.getChainBootstrap() as typeof before;

      expect(after.summary.sourceCounts.supplierRows).toBe(before.summary.sourceCounts.supplierRows);
    });
  });

  it("reconciles manual simulation HR rows into payroll reports", () => {
    const base = createPeakSimulation({ cursorMinute: 60, minutes: 60 });
    const next = applyManualSimulationHr(
      base,
      [{
        id: "SIM-HR-EMP-TEST",
        name: "Simulation Payroll Runner",
        role: "runner",
        kiosk: "K-07",
        monthlySalary: 42_000,
        expectedMonthlyHours: 120,
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
      [{
        id: "SIM-HR-SHIFT-TEST",
        employee: "SIM-HR-EMP-TEST",
        kiosk: "K-07",
        date: "2026-05-16",
        role: "runner",
        startHour: 16,
        endHour: 20,
        state: "planned",
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
      [{
        id: "SIM-HR-COVERAGE-TEST",
        kiosk: "K-07",
        dayOfWeek: "6",
        role: "runner",
        startHour: 16,
        endHour: 20,
        requiredCount: 1,
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
      [],
      [{
        id: "SIM-PAY-ADJ-TEST",
        employee: "SIM-HR-EMP-TEST",
        employeeName: "Simulation Payroll Runner",
        type: "bonus",
        amount: 5_000,
        reason: "Peak runner coverage",
        approve: true,
        state: "approved",
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
      [{
        id: "SIM-PAY-RUN-TEST",
        name: "Simulation payroll test",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        state: "reviewed",
        gross: 1_222_000,
        net: 1_227_000,
        adjustments: 5_000,
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
    );

    expect(next.hr.employees.some((employee) => employee.name === "Simulation Payroll Runner")).toBe(true);
    expect(next.hr.shifts.some((shift) => shift.id === "SIM-HR-SHIFT-TEST" && shift.plannedHours === 4)).toBe(true);
    expect(next.hr.summary.payrollAccrued).toBe(base.hr.summary.payrollAccrued + 42_000 + 5_000);
    expect(next.summary.reportPeriods.daily.payrollExpense).toBe(next.hr.summary.payrollAccrued);
    expect(next.summary.reportPeriods.monthly.payrollExpense).toBe(next.hr.summary.payrollAccrued * 30);
  });

  it("rejects invalid manual HR and expense replay rows before report totals change", () => {
    const base = createPeakSimulation({ cursorMinute: 60, minutes: 60 });

    expect(() => applyManualSimulationHr(
      base,
      [{
        id: "SIM-HR-EMP-BAD",
        name: "  ",
        role: "runner",
        kiosk: "K-07",
        monthlySalary: 42_000,
        expectedMonthlyHours: 120,
        created_at: base.meta.simulation.current,
        sequence: 2,
      }],
      [],
      [],
      [],
      [],
      [],
    )).toThrow(/requires a name/);

    expect(() => applyManualSimulationHr(
      base,
      [],
      [],
      [],
      [],
      [],
      [],
      [{
        id: "SIM-EXP-BAD",
        name: "Generator top-up",
        category: "Utilities",
        amount: 0,
        date: "2026-05-16",
        created_at: base.meta.simulation.current,
        sequence: 1,
      }],
    )).toThrow(/operating expense requires name and positive amount/);
  });

  it("persists simulation gateway HR employees, schedules, and payroll adjustments into source snapshots", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getHrSnapshot() as {
        employees: Array<{ id: string; name: string }>;
        summary: { payrollAccrued: number };
      };

      const employeeResult = await gateway.createHrEmployee({
        name: "Gateway Payroll Runner",
        role: "runner",
        kiosk: "K-07",
        monthlySalary: 42_000,
        expectedMonthlyHours: 120,
      }) as { employee: { id: string; name: string } };
      await gateway.createHrShift({
        employee: employeeResult.employee.id,
        kiosk: "K-07",
        date: "2026-05-16",
        role: "runner",
        startHour: 16,
        endHour: 20,
        state: "confirmed",
      });
      const attendance = await gateway.submitHrAttendance({
        employee: employeeResult.employee.id,
        checkIn: "2026-05-16T17:00:00",
        checkOut: "2026-05-16T21:00:00",
        note: "Peak runner attendance",
      }) as { attendance: { id: string; workedHours: number; state: string } };
      const attendanceRetry = await gateway.submitHrAttendance({
        employee: employeeResult.employee.id,
        checkIn: "2026-05-16T17:00:00",
        checkOut: "2026-05-16T21:00:00",
        note: "Peak runner attendance",
      }) as { attendance: { id: string; workedHours: number; state: string } };
      await gateway.createHrCoverageRule({
        kiosk: "K-07",
        dayOfWeek: "6",
        role: "runner",
        startHour: 16,
        endHour: 20,
        requiredCount: 1,
      });
      const adjustment = await gateway.submitPayrollAdjustment({
        employee: employeeResult.employee.id,
        type: "bonus",
        amount: 5_000,
        reason: "Peak runner coverage",
        approve: true,
      }) as { adjustment: { id: string; state: string } };
      const expense = await gateway.submitOperatingExpense({
        name: "Generator top-up",
        category: "Utilities",
        amount: 44_000,
        date: "2026-05-16",
      }) as { expense: { id: string; amount: number } };
      const expenseRetry = await gateway.submitOperatingExpense({
        name: "Generator top-up",
        category: "Utilities",
        amount: 44_000,
        date: "2026-05-16",
      }) as { expense: { id: string; amount: number } };
      const after = await gateway.getHrSnapshot() as {
        employees: Array<{ id: string; name: string }>;
        shifts: Array<{ employeeId: string; kiosk: string; plannedHours: number; state: string }>;
        attendance: Array<{ id: string; employeeId: string; workedHours: number; state: string }>;
        expenses: Array<{ id: string; name: string; amount: number; category: string }>;
        coverageRules: Array<{ kiosk: string; role: string; requiredCount: number }>;
        adjustments: Array<{ id: string; employee: string; amount: number; state: string }>;
        summary: { payrollAccrued: number; payrollAdjustmentImpact: number; operatingExpenses: number };
      };
      const chain = await gateway.getChainBootstrap() as {
        summary: {
          sourceCounts: {
            hrEmployeeRows: number;
            hrShiftRows: number;
            hrCoverageRuleRows: number;
            hrAttendanceRows: number;
            payrollAdjustmentRows: number;
            payrollRunRows: number;
            operatingExpenseRows: number;
          };
          reportPeriods: {
            daily: {
              netProfit: number;
              payrollExpense: number;
              operatingExpenses: number;
              netProfitAfterPayroll: number;
              sourceCounts: { operatingExpenseRows: number; payrollAdjustmentRows: number };
            };
            weekly: { netProfit: number; payrollExpense: number; operatingExpenses: number; netProfitAfterPayroll: number };
          };
          totals: { payrollExpense: number; operatingExpenses: number; netProfitAfterPayroll: number };
        };
      };

      expect(employeeResult.employee.name).toBe("Gateway Payroll Runner");
      expect(after.employees.some((employee) => employee.id === employeeResult.employee.id)).toBe(true);
      expect(after.shifts.some((shift) => shift.employeeId === employeeResult.employee.id && shift.plannedHours === 4 && shift.state === "confirmed")).toBe(true);
      expect(attendanceRetry.attendance.id).toBe(attendance.attendance.id);
      expect(after.attendance.filter((row) => row.id === attendance.attendance.id)).toHaveLength(1);
      expect(after.attendance.find((row) => row.id === attendance.attendance.id)).toMatchObject({ employeeId: employeeResult.employee.id, workedHours: 4, state: "checked_out" });
      expect(expenseRetry.expense.id).toBe(expense.expense.id);
      expect(after.expenses.filter((row) => row.id === expense.expense.id)).toHaveLength(1);
      expect(after.expenses.find((row) => row.id === expense.expense.id)).toMatchObject({ name: "Generator top-up", category: "Utilities", amount: 44_000 });
      expect(after.summary.operatingExpenses).toBe(44_000);
      expect(after.coverageRules.some((rule) => rule.kiosk === "K-07" && rule.role === "runner" && rule.requiredCount === 1)).toBe(true);
      expect(after.adjustments.find((row) => row.id === adjustment.adjustment.id)?.state).toBe("approved");
      expect(after.summary.payrollAdjustmentImpact).toBe(5_000);
      expect(after.summary.payrollAccrued).toBe(before.summary.payrollAccrued + 42_000 + 5_000);
      expect(chain.summary.sourceCounts.hrEmployeeRows).toBe(after.employees.length);
      expect(chain.summary.sourceCounts.hrShiftRows).toBe(after.shifts.length);
      expect(chain.summary.sourceCounts.hrCoverageRuleRows).toBe(after.coverageRules.length);
      expect(chain.summary.sourceCounts.hrAttendanceRows).toBe(after.attendance.length);
      expect(chain.summary.sourceCounts.payrollAdjustmentRows).toBe(after.adjustments.length);
      expect(chain.summary.sourceCounts.operatingExpenseRows).toBe(after.expenses.length);
      expect(chain.summary.totals.payrollExpense).toBe(after.summary.payrollAccrued);
      expect(chain.summary.totals.operatingExpenses).toBe(44_000);
      expect(chain.summary.totals.netProfitAfterPayroll).toBe(chain.summary.reportPeriods.daily.netProfitAfterPayroll);
      expect(chain.summary.reportPeriods.daily.payrollExpense).toBe(after.summary.payrollAccrued);
      expect(chain.summary.reportPeriods.daily.operatingExpenses).toBe(44_000);
      expect(chain.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(chain.summary.reportPeriods.daily.netProfit - after.summary.payrollAccrued - 44_000);
      expect(chain.summary.reportPeriods.daily.sourceCounts.operatingExpenseRows).toBe(after.expenses.length);
      expect(chain.summary.reportPeriods.daily.sourceCounts.payrollAdjustmentRows).toBe(after.adjustments.length);
      expect(chain.summary.reportPeriods.weekly.payrollExpense).toBe(after.summary.payrollAccrued * 7);
      expect(chain.summary.reportPeriods.weekly.operatingExpenses).toBe(44_000 * 7);
      expect(chain.summary.reportPeriods.weekly.netProfitAfterPayroll).toBe(chain.summary.reportPeriods.weekly.netProfit - (after.summary.payrollAccrued * 7) - (44_000 * 7));
    });
  });

  it("keeps source-backed operating losses negative instead of clamping report profit to zero", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      await gateway.submitOperatingExpense({
        name: "Emergency generator replacement",
        category: "Repairs",
        amount: 9_500_000,
        date: "2026-05-16",
      });
      const chain = await gateway.getChainBootstrap() as {
        summary: {
          reportPeriods: {
            daily: {
              netProfit: number;
              payrollExpense: number;
              operatingExpenses: number;
              netProfitAfterPayroll: number;
            };
          };
        };
      };
      const daily = chain.summary.reportPeriods.daily;

      expect(daily.operatingExpenses).toBeGreaterThan(9_000_000);
      expect(daily.netProfitAfterPayroll).toBe(daily.netProfit - daily.payrollExpense - daily.operatingExpenses);
      expect(daily.netProfitAfterPayroll).toBeLessThan(0);
    });
  });

  it("computes and approves simulation gateway payroll runs without dropping payroll rows", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "bonus",
        amount: 7_500,
        reason: "Peak close overtime",
        approve: true,
      });
      const reviewed = await gateway.payrollRunAction({
        name: "Simulation May Payroll",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        compute: true,
      }) as { id: string; state: string; net: number; adjustments: number };
      const approved = await gateway.payrollRunAction({
        id: reviewed.id,
        action: "approve",
      }) as { id: string; state: string; net: number; adjustments: number };
      const snapshot = await gateway.getHrSnapshot() as {
        adjustments: Array<{ reason: string; amount: number }>;
        payrollRuns: Array<{ id: string; state: string; net: number; adjustments: number }>;
      };

      expect(reviewed.state).toBe("reviewed");
      expect(reviewed.adjustments).toBe(7_500);
      expect(approved.state).toBe("approved");
      expect(snapshot.adjustments.some((row) => row.reason === "Peak close overtime" && row.amount === 7_500)).toBe(true);
      expect(snapshot.payrollRuns[0]).toMatchObject({ id: reviewed.id, state: "approved", net: reviewed.net, adjustments: 7_500 });
    });
  });

  it("dedupes repeated simulation gateway payroll compute and approval retries", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const payload = {
        name: "Simulation Retry Payroll",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        compute: true,
      };

      const first = await gateway.payrollRunAction(payload) as { id: string; state: string };
      const second = await gateway.payrollRunAction(payload) as { id: string; state: string };
      const approved = await gateway.payrollRunAction({
        id: first.id,
        action: "approve",
      }) as { id: string; state: string };
      const approvedAgain = await gateway.payrollRunAction({
        id: first.id,
        action: "approve",
      }) as { id: string; state: string };
      const paid = await gateway.payrollRunAction({
        id: first.id,
        action: "paid",
      }) as { id: string; state: string };
      const paidAgain = await gateway.payrollRunAction({
        id: first.id,
        action: "paid",
      }) as { id: string; state: string };
      const downgradeAttempt = await gateway.payrollRunAction({
        id: first.id,
        action: "approve",
      }) as { id: string; state: string };
      const snapshot = await gateway.getHrSnapshot() as {
        payrollRuns: Array<{ id: string; state: string }>;
      };
      const matchingRuns = snapshot.payrollRuns.filter((run) => run.id === first.id);

      expect(first.state).toBe("reviewed");
      expect(second).toMatchObject({ id: first.id, state: "reviewed" });
      expect(approved).toMatchObject({ id: first.id, state: "approved" });
      expect(approvedAgain).toMatchObject({ id: first.id, state: "approved" });
      expect(paid).toMatchObject({ id: first.id, state: "paid" });
      expect(paidAgain).toMatchObject({ id: first.id, state: "paid" });
      expect(downgradeAttempt).toMatchObject({ id: first.id, state: "paid" });
      expect(matchingRuns).toHaveLength(1);
      expect(matchingRuns[0]).toMatchObject({ id: first.id, state: "paid" });
      await expect(gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 1_000,
        reason: "Late shortage after paid payroll",
        date: "2026-05-16",
      })).rejects.toThrow(/approved or paid/);
    });
  });

  it("recomputes a reviewed simulation payroll run after held adjustments are approved", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        hr: { summary: { payrollAccrued: number } };
      };
      const payload = {
        name: "Simulation Recomputed Payroll",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        compute: true,
      };
      const adjustment = await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 3_000,
        reason: "Approved after first review",
        date: "2026-05-16",
      }) as { adjustment: { id: string; state: string } };

      const reviewed = await gateway.payrollRunAction(payload) as { id: string; state: string; net: number; adjustments: number };
      const approvedAdjustment = await gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "approve",
      }) as { adjustment: { id: string; state: string } };
      const recomputed = await gateway.payrollRunAction(payload) as { id: string; state: string; net: number; adjustments: number };
      const recomputedById = await gateway.payrollRunAction({
        id: reviewed.id,
        action: "recompute",
      }) as { id: string; state: string; net: number; adjustments: number };
      const snapshot = await gateway.getHrSnapshot() as {
        payrollRuns: Array<{ id: string; state: string; net: number; adjustments: number }>;
      };
      const matchingRuns = snapshot.payrollRuns.filter((run) => run.id === reviewed.id);

      expect(adjustment.adjustment.state).toBe("draft");
      expect(reviewed).toMatchObject({ state: "reviewed", adjustments: 0, net: before.hr.summary.payrollAccrued });
      expect(approvedAdjustment.adjustment.state).toBe("approved");
      expect(recomputed).toMatchObject({
        id: reviewed.id,
        state: "reviewed",
        adjustments: -3_000,
        net: before.hr.summary.payrollAccrued - 3_000,
      });
      expect(recomputedById).toMatchObject({
        id: reviewed.id,
        state: "reviewed",
        adjustments: -3_000,
        net: before.hr.summary.payrollAccrued - 3_000,
      });
      expect(matchingRuns).toHaveLength(1);
      expect(matchingRuns[0]).toMatchObject({ id: reviewed.id, state: "reviewed", adjustments: -3_000 });
    });
  });

  it("keeps simulation report payroll on the reviewed run total until recompute refreshes it", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const reviewed = await gateway.payrollRunAction({
        name: "Simulation Locked Review Payroll",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        compute: true,
      }) as { id: string; state: string; net: number };

      await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "bonus",
        amount: 9_000,
        reason: "Approved after reviewed run",
        date: "2026-05-16",
        approve: true,
      });
      const staleReport = await gateway.getChainBootstrap() as {
        hr: { summary: { payrollAccrued: number } };
        summary: { reportPeriods: { daily: { payrollExpense: number } } };
      };
      const recomputed = await gateway.payrollRunAction({
        id: reviewed.id,
        action: "recompute",
      }) as { id: string; state: string; net: number };
      const refreshedReport = await gateway.getChainBootstrap() as typeof staleReport;

      expect(reviewed.state).toBe("reviewed");
      expect(staleReport.hr.summary.payrollAccrued).toBe(reviewed.net + 9_000);
      expect(staleReport.summary.reportPeriods.daily.payrollExpense).toBe(reviewed.net);
      expect(recomputed.net).toBe(reviewed.net + 9_000);
      expect(refreshedReport.hr.summary.payrollAccrued).toBe(recomputed.net);
      expect(refreshedReport.summary.reportPeriods.daily.payrollExpense).toBe(recomputed.net);
    });
  });

  it("keeps draft simulation gateway payroll adjustments out of accrued payroll until approved", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        hr: { summary: { payrollAccrued: number } };
        summary: { reportPeriods: { daily: { payrollExpense: number } } };
      };

      const adjustment = await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 3_000,
        reason: "Cash shortage under review",
      }) as { adjustment: { id: string; state: string; amount: number } };
      const duplicateDraft = await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 3_000,
        reason: "Cash shortage under review",
      }) as { adjustment: { id: string; state: string; amount: number } };
      const after = await gateway.getChainBootstrap() as {
        hr: {
          adjustments: Array<{ id: string; reason: string; state: string; amount: number }>;
          summary: { payrollAccrued: number; payrollAdjustmentImpact?: number };
        };
        summary: { reportPeriods: { daily: { payrollExpense: number } } };
      };

      expect(adjustment.adjustment.state).toBe("draft");
      expect(duplicateDraft.adjustment).toMatchObject({ id: adjustment.adjustment.id, state: "draft", amount: 3_000 });
      expect(after.hr.adjustments.filter((row) => row.reason === "Cash shortage under review")).toHaveLength(1);
      expect(after.hr.adjustments.some((row) => row.reason === "Cash shortage under review" && row.state === "draft" && row.amount === 3_000)).toBe(true);
      expect(after.hr.summary.payrollAdjustmentImpact || 0).toBe(0);
      expect(after.hr.summary.payrollAccrued).toBe(before.hr.summary.payrollAccrued);
      expect(after.summary.reportPeriods.daily.payrollExpense).toBe(before.summary.reportPeriods.daily.payrollExpense);

      const approved = await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 3_000,
        reason: "Cash shortage under review",
        approve: true,
      }) as { adjustment: { id: string; state: string; amount: number } };
      const approvedSnapshot = await gateway.getChainBootstrap() as {
        hr: {
          adjustments: Array<{ id: string; reason: string; state: string; amount: number }>;
          summary: { payrollAccrued: number; payrollAdjustmentImpact?: number };
        };
        summary: {
          sourceCounts: { payrollAdjustmentRows: number };
          reportPeriods: { daily: { payrollExpense: number } };
        };
      };

      expect(approved.adjustment).toMatchObject({ id: adjustment.adjustment.id, state: "approved", amount: 3_000 });
      expect(approvedSnapshot.hr.adjustments.filter((row) => row.reason === "Cash shortage under review")).toHaveLength(1);
      expect(approvedSnapshot.hr.summary.payrollAdjustmentImpact).toBe(-3_000);
      expect(approvedSnapshot.hr.summary.payrollAccrued).toBe(before.hr.summary.payrollAccrued - 3_000);
      expect(approvedSnapshot.summary.reportPeriods.daily.payrollExpense).toBe(before.summary.reportPeriods.daily.payrollExpense - 3_000);
      expect(approvedSnapshot.summary.sourceCounts.payrollAdjustmentRows).toBe(approvedSnapshot.hr.adjustments.length);
      const approvedAgain = await gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "approve",
      }) as { adjustment: { id: string; state: string; amount: number } };
      await expect(gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "reject",
      })).rejects.toThrow(/already approved/i);
      const terminalSnapshot = await gateway.getChainBootstrap() as typeof approvedSnapshot;
      expect(approvedAgain.adjustment).toMatchObject({ id: adjustment.adjustment.id, state: "approved", amount: 3_000 });
      expect(terminalSnapshot.hr.adjustments.filter((row) => row.reason === "Cash shortage under review")).toHaveLength(1);
      expect(terminalSnapshot.hr.summary.payrollAdjustmentImpact).toBe(-3_000);
    });
  });

  it("rejects unsupported simulation gateway payroll adjustment types before replay state changes", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { payrollAdjustmentRows: number } };
      };

      await expect(gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "refund" as never,
        amount: 1_000,
        reason: "Unsupported adjustment type",
        approve: true,
      })).rejects.toThrow(/Unsupported simulation payroll adjustment type/);

      const after = await gateway.getChainBootstrap() as {
        hr: { adjustments: Array<{ reason: string }> };
        summary: { sourceCounts: { payrollAdjustmentRows: number } };
      };

      expect(after.summary.sourceCounts.payrollAdjustmentRows).toBe(before.summary.sourceCounts.payrollAdjustmentRows);
      expect(after.hr.adjustments.some((row) => row.reason === "Unsupported adjustment type")).toBe(false);
    });
  });

  it("rejects invalid simulation gateway payroll run date ranges before replay state changes", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: { sourceCounts: { payrollRunRows: number } };
      };

      await expect(gateway.payrollRunAction({
        name: "Simulation Invalid Date Payroll",
        dateFrom: "2026-05-17",
        dateTo: "2026-05-01",
        compute: true,
      })).rejects.toThrow(/valid date range/);

      const after = await gateway.getChainBootstrap() as {
        hr: { payrollRuns: Array<{ name: string }> };
        summary: { sourceCounts: { payrollRunRows: number } };
      };

      expect(after.summary.sourceCounts.payrollRunRows).toBe(before.summary.sourceCounts.payrollRunRows);
      expect(after.hr.payrollRuns.some((row) => row.name === "Simulation Invalid Date Payroll")).toBe(false);
    });
  });

  it("keeps rejected simulation gateway payroll adjustments out of accrued payroll", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        hr: { summary: { payrollAccrued: number; payrollAdjustmentImpact?: number } };
        summary: { reportPeriods: { daily: { payrollExpense: number } } };
      };

      const adjustment = await gateway.submitPayrollAdjustment({
        employee: "K-07-cashier",
        type: "cash_shortage",
        amount: 4_000,
        reason: "Mistaken shortage rejected",
      }) as { adjustment: { id: string; state: string; amount: number } };
      const rejected = await gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "reject",
      }) as { adjustment: { id: string; state: string; amount: number } };
      const after = await gateway.getChainBootstrap() as {
        hr: {
          adjustments: Array<{ id: string; reason: string; state: string; amount: number }>;
          summary: { payrollAccrued: number; payrollAdjustmentImpact?: number };
        };
        summary: {
          sourceCounts: { payrollAdjustmentRows: number };
          reportPeriods: { daily: { payrollExpense: number } };
        };
      };

      expect(rejected.adjustment).toMatchObject({ id: adjustment.adjustment.id, state: "rejected", amount: 4_000 });
      expect(after.hr.adjustments).toEqual([
        expect.objectContaining({ reason: "Mistaken shortage rejected", state: "rejected", amount: 4_000 }),
      ]);
      expect(after.hr.summary.payrollAdjustmentImpact || 0).toBe(before.hr.summary.payrollAdjustmentImpact || 0);
      expect(after.hr.summary.payrollAccrued).toBe(before.hr.summary.payrollAccrued);
      expect(after.summary.reportPeriods.daily.payrollExpense).toBe(before.summary.reportPeriods.daily.payrollExpense);
      expect(after.summary.sourceCounts.payrollAdjustmentRows).toBe(after.hr.adjustments.length);
      const rejectedAgain = await gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "reject",
      }) as { adjustment: { id: string; state: string; amount: number } };
      await expect(gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "approve",
      })).rejects.toThrow(/already rejected/i);
      const terminalSnapshot = await gateway.getChainBootstrap() as typeof after;
      expect(rejectedAgain.adjustment).toMatchObject({ id: adjustment.adjustment.id, state: "rejected", amount: 4_000 });
      expect(terminalSnapshot.hr.adjustments).toHaveLength(1);
      expect(terminalSnapshot.hr.summary.payrollAccrued).toBe(before.hr.summary.payrollAccrued);
    });
  });

  it("rejects invalid simulation gateway HR and payroll writes before accounting rows are created", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getHrSnapshot() as {
        employees: Array<{ id: string }>;
        adjustments?: Array<unknown>;
        summary: { payrollAccrued: number };
      };

      await expect(gateway.createHrEmployee({
        name: "Bad Kiosk Staff",
        role: "runner",
        kiosk: "K-404",
        monthlySalary: 42_000,
        expectedMonthlyHours: 120,
      })).rejects.toThrow(/kiosk K-404/i);
      await expect(gateway.submitPayrollAdjustment({
        employee: "missing-employee",
        type: "bonus",
        amount: 5_000,
        reason: "Should not post",
      })).rejects.toThrow(/employee missing-employee/i);
      await expect(gateway.submitHrAttendance({
        employee: before.employees[0]?.id || "K-01-cashier",
        checkIn: "2026-05-16T21:00:00",
        checkOut: "2026-05-16T17:00:00",
      })).rejects.toThrow(/check-out must be after check-in/i);
      await expect(gateway.submitOperatingExpense({
        name: "",
        category: "Utilities",
        amount: 10_000,
      })).rejects.toThrow(/expense requires name and positive amount/i);
      await expect(gateway.payrollRunAction({
        name: "Bad payroll",
        compute: true,
      })).rejects.toThrow(/requires name, dateFrom, and dateTo/i);
      const adjustment = await gateway.submitPayrollAdjustment({
        employee: before.employees[0]?.id || "K-01-cashier",
        type: "cash_shortage",
        amount: 1_000,
        reason: "Invalid action should stay draft",
      }) as { adjustment: { id: string } };
      await expect(gateway.payrollAdjustmentAction({
        id: adjustment.adjustment.id,
        action: "void" as "approve",
      })).rejects.toThrow(/Unsupported simulation payroll adjustment action/i);
      const reviewed = await gateway.payrollRunAction({
        name: "Invalid action payroll",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-16",
        compute: true,
      }) as { id: string; state: string };
      await expect(gateway.payrollRunAction({
        id: reviewed.id,
        action: "void" as "approve",
      })).rejects.toThrow(/Unsupported simulation payroll run action/i);
      await expect(gateway.payrollRunAction({
        id: reviewed.id,
        action: "paid",
      })).rejects.toThrow(/Approve simulation payroll before marking it paid/i);

      const after = await gateway.getHrSnapshot() as {
        employees: Array<{ id: string }>;
        payrollRuns: Array<{ id: string; state: string }>;
        adjustments: Array<{ id: string; state: string }>;
        summary: { payrollAccrued: number };
      };
      expect(after.employees.length).toBe(before.employees.length);
      expect(after.adjustments.find((row) => row.id === adjustment.adjustment.id)?.state).toBe("draft");
      expect(after.payrollRuns.find((row) => row.id === reviewed.id)?.state).toBe("reviewed");
      expect(after.summary.payrollAccrued).toBe(before.summary.payrollAccrued);
    });
  });

  it("is idempotent at the simulation gateway for setup and procurement create retries", async () => {
    await withSimulationWindow(async () => {
      const gateway = createSourceOfTruthGateway();
      const before = await gateway.getChainBootstrap() as {
        summary: {
          sourceCounts: {
            transferRows: number;
            purchaseOrders: number;
            productRows: number;
            warehouseStockRows: number;
            supplierRows: number;
            recurringPurchaseRows: number;
          };
        };
      };

      const firstTransfer = await gateway.submitStockTransfer({ kioskId: "K-07", itemId: "CUP-12OZ", qty: 99 }) as { name: string };
      const secondTransfer = await gateway.submitStockTransfer({ kioskId: "K-07", itemId: "CUP-12OZ", qty: 99 }) as { name: string };
      const poPayload = {
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        scheduleDate: "2026-05-16",
        submit: true,
        items: [{ itemId: "CUP-12OZ", qty: 50, rate: 80 }],
      };
      const firstPo = await gateway.submitPurchaseOrder(poPayload) as { name: string };
      const secondPo = await gateway.submitPurchaseOrder(poPayload) as { name: string };
      const stockPayload = {
        name: "Gateway Retry Cardamom",
        code: "GATEWAY-RETRY-CARDAMOM",
        category: "Spices",
        uom: "kg",
        unitCost: 65000,
      };
      const firstStock = await gateway.createStockItem(stockPayload) as { product: { id?: number; default_code?: string } };
      const secondStock = await gateway.createStockItem(stockPayload) as { product: { id?: number; default_code?: string } };
      const supplierPayload = {
        name: "Gateway Retry Supply Co",
        category: "Packaging",
        deliveryCategory: "Dry goods",
      };
      const firstSupplier = await gateway.createSupplier(supplierPayload) as { supplier: { id?: number; name: string } };
      const secondSupplier = await gateway.createSupplier(supplierPayload) as { supplier: { id?: number; name: string } };
      const recurringPayload = {
        name: "Gateway retry cup replenishment",
        supplier: "Iraq Pack",
        warehouse: "Baghdad Area Warehouse",
        frequency: "daily" as const,
        nextDate: "2026-05-17",
        active: true,
        items: [{ itemId: "CUP-12OZ", qty: 500, rate: 80, uom: "Units" }],
      };
      const firstRecurring = await gateway.createRecurringPurchase(recurringPayload) as { recurring_purchase: { id: string | number } };
      const secondRecurring = await gateway.createRecurringPurchase(recurringPayload) as { recurring_purchase: { id: string | number } };
      const after = await gateway.getChainBootstrap() as typeof before;

      expect(secondTransfer.name).toBe(firstTransfer.name);
      expect(secondPo.name).toBe(firstPo.name);
      expect(secondStock.product.id).toBe(firstStock.product.id);
      expect(secondStock.product.default_code).toBe(firstStock.product.default_code);
      expect(secondSupplier.supplier.id).toBe(firstSupplier.supplier.id);
      expect(secondRecurring.recurring_purchase.id).toBe(firstRecurring.recurring_purchase.id);
      expect(after.summary.sourceCounts.transferRows).toBe(before.summary.sourceCounts.transferRows + 1);
      expect(after.summary.sourceCounts.purchaseOrders).toBe(before.summary.sourceCounts.purchaseOrders + 1);
      expect(after.summary.sourceCounts.productRows).toBe(before.summary.sourceCounts.productRows + 1);
      expect(after.summary.sourceCounts.warehouseStockRows).toBe(before.summary.sourceCounts.warehouseStockRows + 1);
      expect(after.summary.sourceCounts.supplierRows).toBe(before.summary.sourceCounts.supplierRows + 1);
      expect(after.summary.sourceCounts.recurringPurchaseRows).toBe(before.summary.sourceCounts.recurringPurchaseRows + 1);
    });
  });
});
