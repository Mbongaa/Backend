export type AccountAllocationMetrics = {
  cash?: number;
  digital?: number;
  netProfit?: number;
  netProfitAfterPayroll?: number;
  cogs?: number;
  payroll?: number;
  waste?: number;
  varianceImpact?: number;
};

export type AccountAllocationRow = {
  account: string;
  amount: number;
  key: string;
  fill: string;
};

export function buildAccountAllocationRows(
  metrics: AccountAllocationMetrics = {},
  netAfterPayroll?: number | null,
  ar = false,
): AccountAllocationRow[] {
  const mainWallet = Math.max(0, Number(metrics.cash || 0) + Number(metrics.digital || 0));
  const sourceNet = Number(netAfterPayroll ?? metrics.netProfitAfterPayroll ?? metrics.netProfit ?? 0);
  const savings = Math.max(0, sourceNet);
  const shortfall = Math.max(0, -sourceNet);
  const investment = Math.max(0, Number(metrics.cogs || 0));
  const varianceLossReserve = Math.max(0, -Number(metrics.varianceImpact || 0));
  const reserve = Math.max(
    0,
    Number(metrics.payroll || 0) + Number(metrics.waste || 0) + varianceLossReserve,
  );

  const allocationRows: AccountAllocationRow[] = [
    { account: ar ? "المحفظة الرئيسية" : "Main Wallet", amount: mainWallet, key: "main", fill: "var(--chart-2)" },
    { account: ar ? "حساب التوفير" : "Savings Account", amount: savings, key: "savings", fill: "var(--chart-4)" },
    { account: ar ? "حساب الاستثمار" : "Investment Account", amount: investment, key: "investment", fill: "var(--chart-1)" },
    { account: ar ? "حساب الاحتياطي" : "Reserve Account", amount: reserve, key: "reserve", fill: "var(--chart-3)" },
  ];
  if (shortfall) {
    allocationRows.push({ account: ar ? "عجز الخسائر" : "Loss Shortfall", amount: shortfall, key: "shortfall", fill: "var(--crit)" });
  }
  return allocationRows;
}
