import { describe, expect, it } from "vitest";
import { auditPeakSimulation, createPeakSimulation } from "./peakSimulation";

describe("peak-hour organization simulation", () => {
  it("starts at zero and finishes a 60-minute, 10-kiosk target-order operating window", () => {
    const start = createPeakSimulation({ seed: 20260516, cursorMinute: 0 });
    const snapshot = createPeakSimulation({ seed: 20260516, cursorMinute: 60 });
    const totalTargetOrders = snapshot.meta.simulation.totalTargetOrders;

    expect(snapshot.engine).toBe("bayaan_peak_simulation");
    expect(snapshot.kiosks).toHaveLength(10);
    expect(snapshot.pos_configs).toHaveLength(10);
    const karradaConfig = snapshot.pos_configs.find((config) => config.name === "K-01 POS");
    expect(karradaConfig?.payment_methods.map((method) => method.name)).toContain("Cash");
    expect(karradaConfig?.payment_methods.find((method) => method.name === "Cash")?.provider.category).toBe("cash");
    expect(snapshot.warehouse_stock.find((row) => row.item === "COFFEE-BEANS")?.default_purchase_qty).toBe(25);
    expect(snapshot.meta.simulation.minutes).toBe(60);
    expect(start.today.orders).toHaveLength(0);
    expect(start.today.payments).toHaveLength(0);
    expect(start.today.consumption).toHaveLength(0);
    expect(start.summary.totals.cashExpected).toBe(0);
    expect(start.summary.reportPeriods.daily.sourceCounts.payrollRunRows).toBe(0);
    expect(start.summary.reportPeriods.daily.payrollExpense).toBe(start.hr.summary.payrollAccrued);
    expect(start.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(0);
    expect(start.summary.totals.netProfitAfterPayroll).toBe(0);
    expect(snapshot.today.orders.length).toBe(totalTargetOrders);
    expect(snapshot.today.payments).toHaveLength(snapshot.today.orders.length);
    expect(snapshot.today.consumption.length).toBeGreaterThan(snapshot.today.orders.length);
    expect(new Set(snapshot.today.orders.map((order) => order.name)).size).toBe(snapshot.today.orders.length);
    expect(new Set(snapshot.today.payments.map((payment) => payment.id)).size).toBe(snapshot.today.payments.length);
    for (const order of snapshot.today.orders) {
      const lineTotal = order.lines.reduce((sum, line) => sum + line.subtotal, 0);
      const paymentTotal = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
      expect(order.amount_total).toBe(lineTotal);
      expect(paymentTotal).toBe(order.amount_total);
      expect(order.payments.every((payment) => payment.order === order.name)).toBe(true);
      for (const line of order.lines) {
        expect(line.subtotal).toBe(line.price_unit * line.qty);
        expect(line.qty).toBeGreaterThan(0);
      }
    }
    expect(snapshot.summary.hourlySales.reduce((sum, row) => sum + row.revenue, 0)).toBe(snapshot.summary.totals.salesToday);
    expect(snapshot.summary.sourceCounts.orders).toBe(snapshot.today.orders.length);
    expect(snapshot.summary.sourceCounts.consumptionRows).toBe(snapshot.today.consumption.length);
    expect(start.summary.sourceCounts.transferRows).toBe(start.transfers.length);
    expect(snapshot.summary.sourceCounts.transferRows).toBe(snapshot.transfers.length);
    expect(start.summary.sourceCounts.purchaseOrders).toBe(start.purchase_orders.length);
    expect(snapshot.summary.sourceCounts.purchaseOrders).toBe(snapshot.purchase_orders.length);
    expect(snapshot.summary.sourceCounts.supplierRows).toBe(snapshot.suppliers.length);
    expect(snapshot.summary.sourceCounts.recurringPurchaseRows).toBe(snapshot.recurring_purchases.length);
    expect(snapshot.summary.sourceCounts.productRows).toBe(snapshot.products.length);
    expect(snapshot.summary.sourceCounts.warehouseStockRows).toBe(snapshot.warehouse_stock.length);
    expect(snapshot.summary.reportPeriods.daily.sourceCounts.purchaseOrders).toBe(snapshot.purchase_orders.length);
    const uniqueClosedKioskCount = new Set(snapshot.closings.map((close) => close.kioskId)).size;
    expect(snapshot.summary.totals.closedKiosks).toBe(uniqueClosedKioskCount);
    expect(snapshot.summary.totals.openKiosks).toBe(snapshot.kiosks.length - uniqueClosedKioskCount);
    expect(snapshot.summary.totals.netProfitAfterPayroll).toBe(snapshot.summary.reportPeriods.daily.netProfitAfterPayroll);
    expect(snapshot.transfers.some((transfer) => transfer.bayaan_state === "dispatched")).toBe(true);
    expect(createPeakSimulation({ seed: 20260516, cursorMinute: 20 }).suggested_transfers.length).toBeGreaterThan(0);
    for (const kiosk of snapshot.summary.byKiosk) {
      expect(kiosk.orders).toBe(snapshot.meta.simulation.targetOrders[kiosk.kioskId]);
      expect(kiosk.remainingOrders).toBe(0);
    }
    for (const close of snapshot.closings) {
      const kioskOrders = snapshot.today.orders.filter((order) => order.kiosk === close.kioskId);
      const kioskRevenue = kioskOrders.reduce((sum, order) => sum + order.amount_total, 0);
      const kioskDigital = kioskOrders.flatMap((order) => order.payments)
        .reduce((sum, payment) => sum + (payment.provider.category === "cash" ? 0 : payment.amount), 0);
      const kioskCash = kioskOrders.flatMap((order) => order.payments)
        .reduce((sum, payment) => sum + (payment.provider.category === "cash" ? payment.amount : 0), 0);

      expect(close.sales).toBe(kioskRevenue);
      expect(close.digitalPayments).toBe(kioskDigital);
      expect(close.expectedCash).toBe(kioskCash + 250_000);
      expect(close.actualCash).toBe(close.expectedCash + close.cashVariance);
      expect(close.orderCount).toBe(kioskOrders.length);
    }
    const zayounaClose = snapshot.closings.find((close) => close.kioskId === "K-04");
    expect(zayounaClose?.stock.find((line) => line.variance !== 0)?.value).toBe(-1_680);
    const closeCashVariance = snapshot.closings.reduce((sum, close) => sum + Number(close.cashVariance || 0), 0);
    const closeStockVariance = snapshot.closings.reduce((sum, close) => (
      sum + close.stock.reduce((stockSum, line) => stockSum + Number(line.value || 0), 0)
    ), 0);
    expect(snapshot.summary.totals.cashVariance).toBe(closeCashVariance);
    expect(snapshot.summary.totals.stockVarianceValue).toBe(closeStockVariance);
    expect(snapshot.summary.totals.varianceImpact).toBe(closeCashVariance + closeStockVariance);
    expect(snapshot.summary.totals.profitEstimate).toBe(
      snapshot.summary.totals.salesToday
      - snapshot.summary.totals.cogs
      - snapshot.summary.totals.wasteCost
      + snapshot.summary.totals.varianceImpact,
    );
    expect(snapshot.summary.totals.profitEstimate).toBe(2_772_179);
    expect(snapshot.summary.reportPeriods.daily.netProfit).toBe(snapshot.summary.totals.profitEstimate);
    expect(snapshot.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(
      snapshot.summary.totals.profitEstimate - snapshot.summary.reportPeriods.daily.payrollExpense,
    );
    expect(snapshot.summary.totals.netProfitAfterPayroll).toBe(snapshot.summary.reportPeriods.daily.netProfitAfterPayroll);
    expect(snapshot.hr.employees).toHaveLength(20);
    expect(snapshot.hr.summary.payrollAccrued).toBe(1_180_000);
    expect(snapshot.hr.employees.reduce((sum, employee) => sum + employee.monthlySalary, 0)).toBe(1_180_000);
    expect(snapshot.hr.summary.onShift).toBe(snapshot.hr.employees.length);
    expect(snapshot.hr.summary.gaps).toBe(snapshot.hr.coverageGaps.length);
    expect(snapshot.hr.coverageGaps[0]).toMatchObject({
      kiosk: "K-07",
      kioskName: "Karada Riverside",
      missingCount: 1,
    });
    expect(snapshot.summary.reportPeriods.daily.payrollExpense).toBe(snapshot.hr.summary.payrollAccrued);
    expect(snapshot.summary.reportPeriods.daily.netProfitAfterPayroll).toBe(1_592_179);
    expect(snapshot.summary.totals.cashExpected).toBe(
      snapshot.today.payments.reduce((sum, payment) => sum + (payment.provider.category === "cash" ? payment.amount : 0), 0),
    );
    expect(snapshot.summary.totals.digitalPayments).toBe(
      snapshot.today.payments.reduce((sum, payment) => sum + (payment.provider.category === "cash" ? 0 : payment.amount), 0),
    );
    expect(snapshot.today.consumption.every((row) => row.recipe_version === "v-sim-peak-2026-05-16")).toBe(true);
    const orangeOrder = snapshot.today.orders.find((order) => order.lines.some((line) => line.product_code === "MENU-ORANGE-JUICE"));
    const orangeLine = orangeOrder?.lines.find((line) => line.product_code === "MENU-ORANGE-JUICE");
    const orangeLedgerRows = snapshot.today.consumption.filter((row) => row.order === orangeOrder?.name && row.product_code === "MENU-ORANGE-JUICE");
    expect(orangeLedgerRows).toHaveLength(4);
    expect(orangeLedgerRows.find((row) => row.item_code === "ORANGES")?.qty).toBe(0.42 * (orangeLine?.qty || 0));
    expect(orangeLedgerRows.find((row) => row.item_code === "ORANGES")?.cost).toBe(1_200 * 0.42 * (orangeLine?.qty || 0));
    expect(
      snapshot.today.consumption.some((row) => row.product_code === "MENU-CROISSANT"),
    ).toBe(false);
    expect(snapshot.today.waste).toHaveLength(11);
    expect(snapshot.summary.totals.wasteCost).toBe(22_656);
    for (const waste of snapshot.today.waste) {
      expect(waste.estimated_cost).toBeGreaterThan(0);
      expect(waste.qty).toBeGreaterThan(0);
    }
    expect(snapshot.today.waste[0]).toMatchObject({
      id: "SIM-W-0001",
      kiosk: "K-08",
      item: "CAKE-SLICE",
      qty: 1,
      estimated_cost: 2_650,
      reason: "Spoiled",
    });
    const orangePo = snapshot.purchase_orders.find((order) => order.name === "PO/SIM/ORANGES-0516");
    expect(orangePo?.state).toBe("partial");
    expect(orangePo?.receipt_state).toBe("partial");
    expect(orangePo?.amount_total).toBe(1_920_000);
    expect(orangePo?.lines[0]).toMatchObject({
      product: "ORANGES",
      orderedQty: 1_600,
      receivedQty: 900,
      uom: "kg",
      priceUnit: 1_200,
    });
    expect(snapshot.warehouse_stock.find((row) => row.item === "ORANGES")?.actual_qty).toBe(2_020);
    expect(snapshot.summary.payments.total).toBe(snapshot.summary.totals.salesToday);
    expect(snapshot.summary.reportPeriods.daily.payments.total).toBe(snapshot.summary.totals.salesToday);
  });

  it("preserves a negative report net profit after payroll once simulated operations begin", () => {
    const baseline = createPeakSimulation({ seed: 20260516, cursorMinute: 0 });
    const targetOrders = Object.fromEntries(
      Object.keys(baseline.meta.simulation.targetOrders).map((kioskId) => [kioskId, 1]),
    );
    const lowDemand = createPeakSimulation({ seed: 20260516, cursorMinute: 60, targetOrders });
    const daily = lowDemand.summary.reportPeriods.daily;

    expect(lowDemand.today.orders.length).toBe(10);
    expect(daily.netProfit).toBe(lowDemand.summary.totals.profitEstimate);
    expect(daily.netProfitAfterPayroll).toBe(daily.netProfit - daily.payrollExpense);
    expect(daily.netProfitAfterPayroll).toBeLessThan(0);
  });

  it("passes 15 deterministic seeded audit iterations", () => {
    const report = auditPeakSimulation({ seed: 20260516, iterations: 15 });

    expect(report.failures, JSON.stringify(report.failures, null, 2)).toHaveLength(0);
    expect(report.ok).toBe(true);
    expect(report.iterations).toBe(15);
  }, 15_000);

  it("supports the adjustable 30-minute peak window with the same audit gates", () => {
    const report = auditPeakSimulation({ seed: 20260516, iterations: 15, minutes: 30 });
    const snapshot = createPeakSimulation({ seed: 20260516, minutes: 30, cursorMinute: 30 });

    expect(report.failures, JSON.stringify(report.failures, null, 2)).toHaveLength(0);
    expect(report.ok).toBe(true);
    expect(snapshot.meta.simulation.minutes).toBe(30);
    expect(snapshot.today.orders).toHaveLength(310);
    expect(snapshot.summary.totals.salesToday).toBe(1_805_500);
    expect(snapshot.summary.totals.cashExpected).toBe(759_500);
    expect(snapshot.summary.totals.digitalPayments).toBe(1_046_000);
    expect(snapshot.summary.totals.wasteCost).toBe(9_273);
    expect(snapshot.today.waste).toHaveLength(4);
    expect(snapshot.summary.payments.total).toBe(1_805_500);
    expect(snapshot.summary.reportPeriods.daily.cashExpected).toBe(759_500);
    expect(snapshot.summary.reportPeriods.daily.digitalPayments).toBe(1_046_000);
    expect(snapshot.summary.reportPeriods.daily.payments.total).toBe(1_805_500);
    expect(snapshot.purchase_orders.find((order) => order.name === "PO/SIM/ORANGES-0516")?.lines[0]?.receivedQty).toBe(900);
    expect(snapshot.warehouse_stock.find((row) => row.item === "ORANGES")?.actual_qty).toBe(2_020);
  }, 15_000);

  it("audits custom per-kiosk target totals instead of silently falling back to defaults", () => {
    const targetOrders = {
      "K-01": 12,
      "K-02": 14,
      "K-03": 11,
      "K-04": 10,
      "K-05": 13,
      "K-06": 9,
      "K-07": 8,
      "K-08": 12,
      "K-09": 7,
      "K-10": 10,
    };
    const report = auditPeakSimulation({ seed: 20260516, iterations: 3, minutes: 60, targetOrders });
    const snapshot = createPeakSimulation({ seed: 20260516, minutes: 60, cursorMinute: 60, targetOrders });

    expect(report.failures, JSON.stringify(report.failures, null, 2)).toHaveLength(0);
    expect(report.ok).toBe(true);
    expect(snapshot.meta.simulation.targetOrders).toEqual(targetOrders);
    expect(snapshot.today.orders).toHaveLength(Object.values(targetOrders).reduce((sum, value) => sum + value, 0));
    for (const kiosk of snapshot.summary.byKiosk) {
      expect(kiosk.orders).toBe(targetOrders[kiosk.kioskId as keyof typeof targetOrders]);
      expect(kiosk.remainingOrders).toBe(0);
    }
  });

  it("advances transfer state machine by simulation minute", () => {
    const transferAt = (minute: number, transferName: string) =>
      createPeakSimulation({ seed: 20260516, cursorMinute: minute })
        .transfers.find((transfer) => transfer.name === transferName);
    const stateAt = (minute: number, transferName: string) => transferAt(minute, transferName)?.bayaan_state;

    expect(createPeakSimulation({ seed: 20260516, cursorMinute: 7 }).transfers).toHaveLength(0);
    expect(stateAt(8, "WH/INT/PEAK-001")).toBe("draft");
    expect(stateAt(10, "WH/INT/PEAK-001")).toBe("approved");
    expect(stateAt(13, "WH/INT/PEAK-001")).toBe("picked");
    expect(stateAt(16, "WH/INT/PEAK-001")).toBe("dispatched");
    expect(transferAt(16, "WH/INT/PEAK-001")?.lines[0]?.doneQty).toBe(0);
    expect(transferAt(16, "WH/INT/PEAK-001")?.lines[0]?.receivedQty).toBe(0);
    expect(transferAt(16, "WH/INT/PEAK-001")?.movedQty).toBe(0);
    expect(stateAt(24, "WH/INT/PEAK-001")).toBe("completed");
    expect(transferAt(24, "WH/INT/PEAK-001")?.lines[0]?.doneQty).toBe(30);
    expect(transferAt(24, "WH/INT/PEAK-001")?.lines[0]?.receivedQty).toBe(30);
    expect(transferAt(24, "WH/INT/PEAK-001")?.movedQty).toBe(150);
    expect(stateAt(22, "WH/INT/PEAK-002")).toBe("dispatched");
    expect(transferAt(60, "WH/INT/PEAK-002")?.lines[0]?.doneQty).toBe(0);
    expect(transferAt(60, "WH/INT/PEAK-002")?.lines[0]?.receivedQty).toBe(0);
    expect(transferAt(60, "WH/INT/PEAK-002")?.movedQty).toBe(0);
    expect(stateAt(60, "WH/INT/PEAK-002")).toBe("dispatched");
    expect(stateAt(28, "WH/INT/PEAK-003")).toBe("completed");
  });
});
