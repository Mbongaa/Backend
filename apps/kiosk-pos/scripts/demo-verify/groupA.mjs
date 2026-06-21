// Group A — Admin read-path & calculation verification (login: owner).
// Ground-truth numbers are fetched LIVE from chain_bootstrap so the suite stays
// correct across re-seeds (the seed re-randomizes the day).
import { makePage, adminLogin, gotoAdmin, bodyText, has, numRe, shot, api, odooLogin } from "./lib.mjs";

// Kiosk names that exist ONLY in the mock/demo chain. If any show up while we are
// logged in to live data, the screen fell back to mock instead of source.
const MOCK_ONLY = [/Majidi Mall/, /Basra Times Square/, /Zayouna Plaza/, /Empire Mall/, /Family Mall G2/, /Al Mansour Mall/];

// label, live markers expected, ground-truth numbers expected, screenshot name
const SCREENS = [
  { id: "A1", label: "Today Command", name: "Overview / Today Command",
    live: [/source kiosks|orders|closes/i], nums: [] },
  { id: "A2", label: "AI Assistant", name: "AI Assistant (live aggregate sources)",
    live: [/orders\s*63/i, /ledger\s*186/i, /closes\s*3/i], nums: [], soft: true, mockExempt: true, settle: 9000 },
  { id: "A3", label: "Kiosks", name: "Kiosks",
    live: [/Erbil Mall/, /Mansour District/, /Karrada/], nums: [] },
  { id: "A4", label: "Warehouses", name: "Warehouses",
    live: [/warehouse/i], nums: [] },
  { id: "A5", label: "Stock inventory", name: "Stock inventory",
    live: [/Cappuccino|Orange|Cheesecake|catalog|item/i], nums: [] },
  { id: "A6", label: "Sales & POS", name: "Sales & POS monitor",
    live: [/order|sale/i], nums: [] },
  { id: "A7", label: "Daily Close", name: "Daily Close",
    live: [/Erbil Mall/, /Mansour District/, /Karrada/, /-?\d+K|variance/i, /Needs review|review/i], nums: [] },
  { id: "A8", label: "Waste & Loss", name: "Waste & Loss",
    live: [/waste/i], nums: [] },
  { id: "A9", label: "Products & Recipes", name: "Products & Recipes",
    live: [/Cappuccino|Orange|recipe/i], nums: [] },
  { id: "A10", label: "Purchases & Suppliers", name: "Purchases & Suppliers",
    live: [/supplier/i], nums: [] },
  { id: "A11", label: "Stock & Allocation", name: "Stock & Allocation (inventory)",
    live: [/Erbil Mall|Mansour District|Karrada|stock/i], nums: [] },
  { id: "A12", label: "Staff", name: "Staff",
    live: [/staff|roster|cashier|payroll/i], nums: [] },
  { id: "A13", label: "Finance", name: "Finance / P&L",
    live: [/profit|revenue|finance/i], nums: [] },
  { id: "A14", label: "Reports", name: "Reports",
    live: [/report/i], nums: [] },
];

export async function runGroupA(browser, rec) {
  // Fetch live ground truth from the backend (re-seed proof).
  let gt = null;
  try {
    const { cookie } = await odooLogin("owner@koub.iq");
    const b = await api("/bayaan/api/chain_bootstrap", cookie);
    const t = b?.summary?.totals || {};
    const daily = b?.summary?.reportPeriods?.daily || {};
    gt = {
      sales: Math.round(t.salesToday || 0),
      orders: t.ordersToday || 0,
      profit: Math.round(t.profitEstimate || 0),
      cashExp: Math.round(t.cashExpected || 0),
      // The Finance P&L COGS row renders the active-period (Daily) figure, daily.cogs —
      // NOT the summary.totals.cogs aggregate. Match what the screen actually shows.
      cogs: Math.round((daily.cogs != null ? daily.cogs : t.cogs) || 0),
      netAfterPayroll: Math.round(daily.netProfitAfterPayroll || 0),
    };
    // Overview shows full numbers: sales, profit estimate, cash expected, orders. The
    // "Profit estimate" tile binds netProfitAfterPayroll (summaryTotals.profitEstimate is
    // set to the daily net-after-payroll), NOT the pre-payroll summary.totals.profitEstimate.
    SCREENS.find((s) => s.id === "A1").nums = [gt.sales, gt.netAfterPayroll, gt.cashExp, gt.orders];
    // Finance shows revenue, COGS, net-after-payroll (all full format).
    SCREENS.find((s) => s.id === "A13").nums = [gt.sales, gt.cogs, gt.netAfterPayroll];
    rec.add("A-gt", "Live ground truth fetched from chain_bootstrap", true,
      `sales=${gt.sales} orders=${gt.orders} profit=${gt.profit} cashExp=${gt.cashExp} cogs=${gt.cogs} netAfterPayroll=${gt.netAfterPayroll}`, "");
  } catch (e) {
    rec.add("A-gt", "Live ground truth fetch", false, "could not fetch ground truth: " + (e.message || e));
  }

  const page = await makePage(browser);
  try {
    await adminLogin(page, "owner@koub.iq");
  } catch (e) {
    rec.add("A0", "Owner login", false, "login failed: " + (e.message || e));
    await page._context.close();
    return;
  }
  rec.add("A0", "Owner login + live bootstrap", true, "authenticated, chain_bootstrap loaded");

  for (const s of SCREENS) {
    const errBefore = page._errors.length;
    let navOk = true;
    if (s.label !== "Today Command") {
      navOk = await gotoAdmin(page, s.label);
      if (!navOk) { await gotoAdmin(page, "Today Command"); navOk = await gotoAdmin(page, s.label); }
    } else {
      await gotoAdmin(page, "Today Command");
    }
    await page.waitForTimeout(s.settle || 1200);

    const text = await bodyText(page);
    const blank = text.length < 200;
    const liveOk = !s.live.length || s.live.every((m) => has(text, m));
    const mockLeak = MOCK_ONLY.filter((m) => m.test(text)).map((m) => m.source);
    const missingNums = s.nums.filter((n) => !numRe(n).test(text));
    const newErrs = page._errors.slice(errBefore);

    const file = await shot(page, `A-${s.id}-${s.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);

    const problems = [];
    if (!navOk) problems.push("nav not reachable");
    if (blank) problems.push("screen blank");
    if (!liveOk) problems.push("missing live marker(s)");
    if (mockLeak.length && !s.mockExempt) problems.push("MOCK LEAK: " + mockLeak.join(","));
    if (missingNums.length) problems.push("missing ground-truth #: " + missingNums.join(","));
    if (newErrs.length) problems.push(`${newErrs.length} console/page error(s)`);

    // Soft screens (AI insights depends on external OpenAI) don't fail the run on missing markers.
    const hard = s.soft ? problems.filter((p) => !p.startsWith("missing live")) : problems;
    const ok = hard.length === 0;
    rec.add(s.id, s.name, ok,
      problems.length ? problems.join("; ") : `clean (${file})`,
      `len=${text.length} errs=${newErrs.length}${newErrs.length ? " :: " + newErrs.join(" | ") : ""}`);

    // Explicit demo-polish check: AI Insights suggested-prompt chips must not reference
    // kiosks that don't exist in the live demo (mock chain: Zayouna/Majidi/Basra/etc.).
    if (s.id === "A2") {
      const promptLeak = MOCK_ONLY.filter((m) => m.test(text)).map((m) => m.source);
      rec.add("A2b", "AI suggested prompts reference only live kiosks", promptLeak.length === 0,
        promptLeak.length ? "hardcoded mock kiosk in starter prompts/demo bank: " + promptLeak.join(",") + " (demo polish: clicking it asks the live LLM about a nonexistent kiosk)" : "no mock kiosk in prompts",
        promptLeak.length ? "e.g. 'Why is Zayouna Plaza 12% behind?'" : "");
    }
  }

  await page._context.close();
}
