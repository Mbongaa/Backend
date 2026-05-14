import React from "react";
import { flushSync } from "react-dom";
import { JuiceLottie } from "../components/JuiceLottie";
import { SuccessLottie } from "../components/SuccessLottie";
import { createSourceOfTruthGateway } from "../services/sourceOfTruth";
import { BayaanProvider, useBayaan } from "../bayaan/BayaanProvider";
import {
  clearCatalog,
  loadCatalog,
  makeEmptyCatalog,
  nextProductId,
  reconcileCatalogWithSeed,
  resizeToWebp,
  saveCatalog,
  slugify,
} from "../services/productCatalog";

// Motion helpers - orchestrate React state updates with the View Transitions API
// where supported (Chromium 111+). Falls back to plain state updates elsewhere.
const withMotion = (callback) => {
  if (typeof document !== "undefined" && document.startViewTransition) {
    document.startViewTransition(() => flushSync(callback));
  } else {
    callback();
  }
};

// Tweens a numeric value with ease-out cubic so KPI counters feel alive.
function useTweenedNumber(value, durationMs = 700) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef(0);
  React.useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (from === to) return;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      setDisplay(Number.isInteger(from) && Number.isInteger(to) ? Math.round(next) : next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);
  return display;
}

/* This file is a mechanical Vite port of design/exact-pos-v2/kiosk-pos/project/Kiosk POS.html and its imports. */

/* ===== data.jsx ===== */

/* ============================================================
   Mock data for the prototype
   ============================================================ */

const MOCK = {
  today: { date: "Saturday, May 9, 2026" },
  brand: { name: "Maqha", arabic: "مقهى" },

  kpis: {
    revenueToday: 49_900_000,
    revenueDelta: 8.4,
    revenueSpark: [62, 78, 71, 92, 88, 110, 142],
    profitToday: 14_460_000,
    profitMargin: 28.9,
    profitSpark: [18, 22, 19, 26, 24, 32, 41],
    ordersToday: 3142,
    ordersDelta: 4.1,
    ordersSpark: [12, 14, 13, 16, 15, 18, 31],
    cashOnHand: 27_450_000,
    cashSpark: [60, 64, 68, 72, 70, 76, 78],
  },

  alerts: [
    { id: 1, level: "crit", title: "Cash variance - Karrada Branch", body: "Cashier ended shift IQD 84,000 short. Pattern: 3rd time this week.", time: "12 min ago", action: "Review shift" },
    { id: 2, level: "warn", title: "Milk stock critical at 4 kiosks", body: "Estimated runout in 6 hours at current pace. Auto-PO drafted to Baghdad Dairy.", time: "32 min ago", action: "Approve PO" },
    { id: 3, level: "warn", title: "Waste spike - Mansour Kiosk", body: "Croissant waste up 240% vs 7-day avg. Likely overproduction.", time: "1 hr ago", action: "View kiosk" },
  ],

  insights: [
    { id: 1, kind: "trend", title: "Iced drinks up 31% week-over-week",
      body: "Driven by 4 Baghdad kiosks. Heat index correlation 0.84. Suggest increasing ice milk pre-prep by 25% Thu-Sun.",
      tags: ["Trend", "Operations"], confidence: 92,
      sources: [
        { label: "pos.order - category=Iced Coffee, May 2-8", count: 1842, ref: "pos.order" },
        { label: "weather.history - Baghdad, last 14 days", count: 14, ref: "external" },
        { label: "bayaan.consumption.ledger - ice milk", count: 96, ref: "bayaan.consumption.ledger" },
      ] },
    { id: 2, kind: "anomaly", title: "Pistachio cake margin dropped 6 pts",
      body: "Supplier cost up 18% since Apr 22. Recipe uses 12g - peers average 9g. Reformulation could recover 4.5 pts.",
      tags: ["Anomaly", "Margin"], confidence: 88,
      sources: [
        { label: "purchase.order - Mesopotamia Foods, Apr 22 to today", count: 4, ref: "purchase.order" },
        { label: "bayaan.recipe v3 - cake-pistachio", count: 1, ref: "bayaan.recipe" },
        { label: "pos.order line - pistachio cake, last 30 days", count: 312, ref: "pos.order.line" },
      ] },
    { id: 3, kind: "forecast", title: "Friday forecast: IQD 70M (+/-6%)",
      body: "Based on weather, last 90 days, and Eid holiday pull-forward effect. Stock 3 kiosks above plan.",
      tags: ["Forecast"], confidence: 81,
      sources: [
        { label: "pos.order - last 90 days, by weekday", count: 28140, ref: "pos.order" },
        { label: "weather.forecast - Baghdad/Erbil/Basra, May 9-10", count: 6, ref: "external" },
      ] },
    { id: 4, kind: "action", title: "Cup consumption at K-03 and K-05 ran 9% above sales",
      body: "Cups dispensed exceeded paid-order count by 9% over the last 7 days. Likely free samples, voids without restock, or shift-change miscounts. Recommend reviewing the K-03 morning shift and K-05 closing flow.",
      tags: ["Anomaly", "Action"], confidence: 84,
      sources: [
        { label: "bayaan.consumption.ledger - cups 12oz, K-03 K-05", count: 5826, ref: "bayaan.consumption.ledger" },
        { label: "pos.order - K-03 K-05, last 7 days", count: 5341, ref: "pos.order" },
      ] },
  ],

  kiosks: [
    { id: "K-01", name: "Karrada Center", city: "Baghdad", revenue: 6_447_000, orders: 412, margin: 31.2, waste: 2.1, wasteLoad: 34, stockHealth: 88, variance: -0.4, criticalStock: "Cups 12oz", issue: "Healthy stock cover", staff: 4, status: "good", trend: [22, 24, 23, 28, 26, 30, 32] },
    { id: "K-02", name: "Mansour District", city: "Baghdad", revenue: 7_469_000, orders: 488, margin: 29.8, waste: 4.6, wasteLoad: 76, stockHealth: 63, variance: -1.7, criticalStock: "Mint, lemons", issue: "Waste above daily target", staff: 4, status: "warn", trend: [18, 20, 22, 19, 24, 26, 28] },
    { id: "K-03", name: "Baghdad Mall", city: "Baghdad", revenue: 5_698_000, orders: 374, margin: 32.1, waste: 1.8, wasteLoad: 29, stockHealth: 91, variance: 0.2, criticalStock: "None", issue: "On plan", staff: 3, status: "good", trend: [14, 15, 17, 16, 18, 20, 22] },
    { id: "K-04", name: "Zayouna Plaza", city: "Baghdad", revenue: 4_239_000, orders: 298, margin: 24.4, waste: 3.2, wasteLoad: 61, stockHealth: 57, variance: -2.2, criticalStock: "Oat milk", issue: "Low stock and weak margin", staff: 3, status: "warn", trend: [16, 14, 13, 15, 12, 14, 12] },
    { id: "K-05", name: "Al Mansour Mall", city: "Baghdad", revenue: 5_222_000, orders: 342, margin: 30.5, waste: 2.4, wasteLoad: 38, stockHealth: 79, variance: -0.8, criticalStock: "Croissants", issue: "Stable", staff: 3, status: "good", trend: [12, 14, 15, 16, 17, 16, 18] },
    { id: "K-06", name: "Family Mall G2", city: "Erbil", revenue: 4_788_000, orders: 318, margin: 28.7, waste: 2.9, wasteLoad: 46, stockHealth: 73, variance: -1.1, criticalStock: "Coffee beans", issue: "Watch evening transfer", staff: 3, status: "good", trend: [10, 12, 13, 14, 15, 14, 16] },
    { id: "K-07", name: "Majidi Mall", city: "Erbil", revenue: 3_934_000, orders: 267, margin: 26.1, waste: 5.8, wasteLoad: 92, stockHealth: 42, variance: -4.9, criticalStock: "Milk, cups, oranges", issue: "Critical variance at close", staff: 3, status: "crit", trend: [16, 15, 14, 12, 11, 9, 8] },
    { id: "K-08", name: "Empire Mall", city: "Erbil", revenue: 5_289_000, orders: 351, margin: 30.9, waste: 2.0, wasteLoad: 31, stockHealth: 84, variance: -0.3, criticalStock: "None", issue: "On plan", staff: 3, status: "good", trend: [12, 14, 15, 17, 18, 17, 19] },
    { id: "K-09", name: "Basra Times Square", city: "Basra", revenue: 3_353_000, orders: 234, margin: 22.8, waste: 4.1, wasteLoad: 69, stockHealth: 52, variance: -3.0, criticalStock: "Pistachio paste", issue: "Low margin, stock risk", staff: 3, status: "warn", trend: [12, 11, 10, 9, 11, 10, 9] },
    { id: "K-10", name: "Basra Mall", city: "Basra", revenue: 3_500_000, orders: 258, margin: 27.4, waste: 2.7, wasteLoad: 43, stockHealth: 76, variance: -0.9, criticalStock: "Vanilla syrup", issue: "Stable", staff: 3, status: "good", trend: [9, 10, 11, 10, 12, 11, 13] },
  ],

  inventory: [
    { item: "Milk (whole) 1L", category: "Dairy", stock: 504, unit: "L", reorder: 720, days: 1.2, supplier: "Baghdad Dairy", status: "low" },
    { item: "Oat milk 1L", category: "Dairy", stock: 336, unit: "L", reorder: 288, days: 3.1, supplier: "Baghdad Dairy", status: "ok" },
    { item: "Condensed milk", category: "Dairy", stock: 7.2, unit: "kg", reorder: 9.6, days: 1.9, supplier: "Baghdad Dairy", status: "low" },
    { item: "Espresso beans - house", category: "Coffee", stock: 86, unit: "kg", reorder: 50, days: 9.4, supplier: "Babel Roasters", status: "ok" },
    { item: "Cold brew concentrate", category: "Coffee", stock: 18, unit: "L", reorder: 16, days: 4.1, supplier: "Babel Roasters", status: "ok" },
    { item: "Pistachio paste", category: "Bakery", stock: 4, unit: "kg", reorder: 12, days: 0.8, supplier: "Mesopotamia Foods", status: "crit" },
    { item: "Chocolate - 70%", category: "Bakery", stock: 22, unit: "kg", reorder: 18, days: 6.4, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Chocolate sauce 1L", category: "Syrups", stock: 14, unit: "L", reorder: 12, days: 5.2, supplier: "Erbil Syrups", status: "ok" },
    { item: "Vanilla syrup 750ml", category: "Syrups", stock: 8.25, unit: "L", reorder: 13.5, days: 2.0, supplier: "Erbil Syrups", status: "low" },
    { item: "Sugar", category: "Pantry", stock: 68, unit: "kg", reorder: 40, days: 12.8, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Ice", category: "Prep", stock: 180, unit: "kg", reorder: 120, days: 3.4, supplier: "Baghdad Dairy", status: "ok" },
    { item: "Oranges", category: "Produce", stock: 92, unit: "kg", reorder: 80, days: 2.8, supplier: "Najaf Fresh", status: "ok" },
    { item: "Mango pulp", category: "Produce", stock: 30, unit: "kg", reorder: 36, days: 1.7, supplier: "Najaf Fresh", status: "low" },
    { item: "Strawberry puree", category: "Produce", stock: 26, unit: "kg", reorder: 30, days: 1.9, supplier: "Najaf Fresh", status: "low" },
    { item: "Avocado", category: "Produce", stock: 34, unit: "kg", reorder: 28, days: 2.6, supplier: "Najaf Fresh", status: "ok" },
    { item: "Lemons", category: "Produce", stock: 38, unit: "kg", reorder: 30, days: 4.2, supplier: "Najaf Fresh", status: "ok" },
    { item: "Mint - fresh", category: "Produce", stock: 6, unit: "kg", reorder: 10, days: 1.4, supplier: "Najaf Fresh", status: "low" },
    { item: "Honey", category: "Pantry", stock: 12, unit: "kg", reorder: 10, days: 5.8, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Cups 12oz", category: "Packaging", stock: 4200, unit: "pc", reorder: 3000, days: 11.0, supplier: "Iraq Pack", status: "ok" },
    { item: "Cups 16oz", category: "Packaging", stock: 3600, unit: "pc", reorder: 3000, days: 8.7, supplier: "Iraq Pack", status: "ok" },
    { item: "Straws", category: "Packaging", stock: 5200, unit: "pc", reorder: 3500, days: 10.2, supplier: "Iraq Pack", status: "ok" },
    { item: "Croissant - frozen", category: "Bakery", stock: 124, unit: "pc", reorder: 100, days: 2.8, supplier: "Tigris Bakery", status: "ok" },
    { item: "Croissant - chocolate frozen", category: "Bakery", stock: 96, unit: "pc", reorder: 90, days: 2.4, supplier: "Tigris Bakery", status: "ok" },
    { item: "Croissant - almond frozen", category: "Bakery", stock: 74, unit: "pc", reorder: 80, days: 1.8, supplier: "Tigris Bakery", status: "low" },
    { item: "Cinnamon roll - frozen", category: "Bakery", stock: 88, unit: "pc", reorder: 70, days: 3.0, supplier: "Tigris Bakery", status: "ok" },
    { item: "Za'atar manakeesh - frozen", category: "Bakery", stock: 64, unit: "pc", reorder: 60, days: 2.2, supplier: "Tigris Bakery", status: "ok" },
    { item: "Pistachio cake base", category: "Cake", stock: 46, unit: "slice", reorder: 40, days: 2.1, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Chocolate fondant base", category: "Cake", stock: 38, unit: "slice", reorder: 36, days: 2.0, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Cheesecake base", category: "Cake", stock: 42, unit: "slice", reorder: 36, days: 2.3, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Carrot cake base", category: "Cake", stock: 30, unit: "slice", reorder: 30, days: 1.9, supplier: "Mesopotamia Foods", status: "low" },
    { item: "Tiramisu cup", category: "Cake", stock: 34, unit: "pc", reorder: 32, days: 2.1, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Lotus cake base", category: "Cake", stock: 36, unit: "slice", reorder: 32, days: 2.4, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Lotus biscuit spread", category: "Cake", stock: 10, unit: "kg", reorder: 8, days: 4.5, supplier: "Mesopotamia Foods", status: "ok" },
    { item: "Cream cheese", category: "Cake", stock: 16, unit: "kg", reorder: 14, days: 4.0, supplier: "Mesopotamia Foods", status: "ok" },
  ],

  waste: [
    { id: 1, kiosk: "K-02 Mansour", item: "Croissant - chocolate", qty: 14, cost: 29_400, reason: "Overproduction", time: "11:42", flagged: true },
    { id: 2, kiosk: "K-04 Zayouna", item: "Iced latte", qty: 3, cost: 12_600, reason: "Wrong order", time: "11:18", flagged: false },
    { id: 3, kiosk: "K-07 Majidi", item: "Pistachio cake slice", qty: 6, cost: 58_800, reason: "End-of-day", time: "10:55", flagged: true },
    { id: 4, kiosk: "K-01 Karrada", item: "Milk (whole)", qty: 2, cost: 8_400, reason: "Spillage", time: "10:30", flagged: false },
    { id: 5, kiosk: "K-09 Basra TS", item: "Croissant - plain", qty: 9, cost: 15_750, reason: "Stale", time: "10:12", flagged: true },
    { id: 6, kiosk: "K-02 Mansour", item: "Espresso shot", qty: 4, cost: 4_200, reason: "Quality reject", time: "09:48", flagged: false },
  ],

  suppliers: [
    { name: "Baghdad Dairy", category: "Dairy", address: "Karrada, Baghdad", deliveryCategory: "Same day", spend30: 13_447_000, ontime: 98, lastOrder: "2 days ago", status: "good" },
    { name: "Mesopotamia Foods", category: "Bakery / Nuts", address: "Mansour, Baghdad", deliveryCategory: "2-3 days", spend30: 9_835_000, ontime: 91, lastOrder: "Today", status: "good" },
    { name: "Tigris Bakery", category: "Bakery", address: "Al Jadriya, Baghdad", deliveryCategory: "Next morning", spend30: 7_469_000, ontime: 88, lastOrder: "Yesterday", status: "warn" },
    { name: "Babel Roasters", category: "Coffee", address: "Erbil industrial zone", deliveryCategory: "Weekly", spend30: 6_622_000, ontime: 100, lastOrder: "5 days ago", status: "good" },
    { name: "Najaf Fresh", category: "Produce", address: "Najaf wholesale market", deliveryCategory: "Next morning", spend30: 4_973_000, ontime: 82, lastOrder: "Today", status: "warn" },
    { name: "Erbil Syrups", category: "Syrups", address: "Erbil", deliveryCategory: "2-3 days", spend30: 2_247_000, ontime: 95, lastOrder: "8 days ago", status: "good" },
    { name: "Iraq Pack", category: "Packaging", address: "Baghdad industrial area", deliveryCategory: "Weekly", spend30: 3_213_000, ontime: 99, lastOrder: "12 days ago", status: "good" },
  ],

  staff: [
    { name: "Layla Hassan", role: "Operations Mgr", kiosk: "-", hours: 168, salary: 4_970_000, status: "active" },
    { name: "Omar Khaled", role: "Supervisor", kiosk: "K-01,02", hours: 176, salary: 3_010_000, status: "active" },
    { name: "Maya Ahmed", role: "Cashier", kiosk: "K-01", hours: 162, salary: 1_680_000, status: "active" },
    { name: "Yusuf Saleh", role: "Barista", kiosk: "K-02", hours: 174, salary: 1_785_000, status: "active" },
    { name: "Nour Ibrahim", role: "Cashier", kiosk: "K-03", hours: 158, salary: 1_680_000, status: "active" },
    { name: "Rashid Al-Tikriti", role: "Warehouse", kiosk: "Central", hours: 184, salary: 2_170_000, status: "active" },
    { name: "Sara Younis", role: "Barista", kiosk: "K-04", hours: 88, salary: 945_000, status: "leave" },
    { name: "Karim Fahmy", role: "Cashier", kiosk: "K-07", hours: 168, salary: 1_680_000, status: "review" },
  ],

  // ---- AI Module ----
  // Module 1 (Basic) = read-only reporting. Module 2 (Plus) adds live alerts + approve-to-execute actions + audit log.
  // Every numeric claim has a `sources` array pointing to verified report rows so AI never invents numbers.
  ai: {
    moduleActive: "M1",
    lastUpdated: "Sat 9 May - 14:42",
    summaries: {
      today: {
        en: "Today's network revenue is IQD 49.9M (+8.4% vs the 7-day average), led by Karrada Center (+11%) and Mansour District (+9%). Pistachio cake margin remains 6 pts below benchmark - the Mesopotamia Foods price increase from Apr 22 is still flowing through. 9 of 10 kiosks opened on time; Zayouna Plaza is still mid-shift. Estimated daily profit: IQD 14.5M (28.9% margin). One signal needs attention: Majidi Mall closed with an unexplained 1.4 kg orange variance - roughly 4 missing juice sales or unrecorded waste.",
        ar: "إيرادات اليوم على مستوى الشبكة د.ع ٤٩٫٩ مليون (+٨٫٤٪ مقارنة بمتوسط ٧ أيام)، تقوده الكرادة (+١١٪) والمنصور (+٩٪). هامش كعكة الفستق لا يزال أقل من المعيار بـ ٦ نقاط. ٩ من ١٠ أكشاك فُتحت في الموعد. الربح اليومي المقدر: د.ع ١٤٫٥ مليون (هامش ٢٨٫٩٪). إشارة تحتاج اهتمامك: المجيدي أُغلق بفارق برتقال غير مفسر ١٫٤ كغ — ما يعادل ٤ مبيعات عصير مفقودة أو هدراً غير مسجل.",
        sources: [
          { label: "pos.order - all kiosks, today", count: 3142, ref: "pos.order" },
          { label: "bayaan.consumption.ledger - today", count: 11420, ref: "bayaan.consumption.ledger" },
          { label: "bayaan.shift.close - today, all kiosks", count: 5, ref: "bayaan.shift.close" },
          { label: "purchase.order - Mesopotamia Foods, Apr 22 onward", count: 4, ref: "purchase.order" },
        ],
      },
      week: {
        en: "Week to date: IQD 322M revenue, 6.1% above the same week of April. Iced drinks +31% week-over-week - driven by 4 Baghdad kiosks during a heat wave (correlation 0.84). Mansour District: croissant waste up 240% on Thu/Fri afternoons - overproduction pattern. Recommended: trim evening bake by 25% to save ~IQD 84,000/day with no measured sales impact. Two underperformers: Majidi Mall (-12% vs same week) and Basra Times Square (-8%) - both correlate with weak afternoon juice attach rates.",
        ar: "الأسبوع حتى الآن: د.ع ٣٢٢ مليون، +٦٫١٪ عن نفس الأسبوع من أبريل. المشروبات الباردة +٣١٪ أسبوعياً. المنصور: هدر الكرواسون +٢٤٠٪ خميس/جمعة بعد الظهر. توصية: خفض الخبز المسائي ٢٥٪ لتوفير ~٨٤٬٠٠٠ د.ع يومياً.",
        sources: [
          { label: "pos.order - all kiosks, last 7 days", count: 22094, ref: "pos.order" },
          { label: "bayaan.waste.entry - last 7 days", count: 178, ref: "bayaan.waste.entry" },
          { label: "weather.history - last 7 days", count: 21, ref: "external" },
        ],
      },
      month: {
        en: "April closed at IQD 1.34B revenue (+12% MoM) and IQD 343M net profit (25.6% margin). Largest cost mover: supplier costs +1.4 pts, driven entirely by Mesopotamia Foods (+18% on pistachio paste). Largest opportunity: 4 kiosks underperforming on afternoon juice - capacity exists for ~IQD 60M additional weekly revenue if matched to peer median. Cash variance month total: -IQD 1.6M (0.12% of revenue), within tolerance but trending upward at K-07 (Majidi Mall).",
        ar: "أبريل أُغلق بإيرادات د.ع ١٫٣٤ مليار (+١٢٪ شهرياً) وصافي ربح د.ع ٣٤٣ مليون (هامش ٢٥٫٦٪). أكبر تحرك في التكلفة: تكاليف المورد +١٫٤ نقطة. أكبر فرصة: ٤ أكشاك دون المتوسط في عصائر العصر.",
        sources: [
          { label: "pos.order - April 2026", count: 94328, ref: "pos.order" },
          { label: "bayaan.shift.close - April 2026", count: 287, ref: "bayaan.shift.close" },
          { label: "purchase.order - April 2026", count: 42, ref: "purchase.order" },
          { label: "account.move - April 2026 GL", count: 1840, ref: "account.move" },
        ],
      },
    },
    varianceLead: {
      kioskId: "K-07",
      kioskName: "Majidi Mall",
      city: "Erbil",
      headlineEn: "Unexplained orange variance: 1.4 kg ~ 4 unrecorded juices",
      headlineAr: "فارق برتقال غير مفسر: ١٫٤ كغ ≈ ٤ عصائر غير مسجلة",
      detailEn: "Expected 28.0 kg oranges based on today's recipe consumption + recorded waste. Counted close: 26.6 kg. The gap maps almost exactly to 4 missing 350ml orange juice sales or equivalent unrecorded waste. Cash variance at the same shift was -IQD 142,000.",
      detailAr: "متوقع ٢٨٫٠ كغ برتقال بناءً على استهلاك الوصفة + الهدر المسجل. عند الإغلاق: ٢٦٫٦ كغ.",
      iqdImpact: 98_000,
    },
    alerts: [
      { id: "A-1", severity: "crit", time: "8:42 PM", ago: "12 min ago", liveDot: true,
        titleEn: "Cash count missing - Zayouna Plaza", titleAr: "عد النقد مفقود - الزيونة بلازا",
        bodyEn: "Kiosk 04 closed at 8:00 PM. Count must be submitted within 30 min. Stock also shows 0.7 kg orange unaccounted. Verification request sent to Sara Younis 11 min ago.",
        bodyAr: "كشك ٤ أُغلق ٨:٠٠ مساءً. يجب تقديم العد خلال ٣٠ دقيقة. المخزون يُظهر أيضاً ٠٫٧ كغ برتقال غير مسجل.",
        verification: { sentTo: "Sara Younis", at: "8:31 PM", status: "pending" },
        owner: { notifiedAt: "8:31 PM" },
        sources: [
          { label: "bayaan.shift.close - K-04, today", count: 1, ref: "bayaan.shift.close" },
          { label: "bayaan.consumption.ledger - K-04, today", count: 246, ref: "bayaan.consumption.ledger" },
        ] },
      { id: "A-2", severity: "warn", time: "7:14 PM", ago: "1 hr ago",
        titleEn: "Pistachio paste critical at 3 kiosks", titleAr: "معجون الفستق منخفض في ٣ أكشاك",
        bodyEn: "Below 0.5 kg minimum at K-04, K-07, K-09. Roughly 4 hours of cover at current pace. Auto-PO drafted to Mesopotamia Foods.",
        bodyAr: "تحت الحد الأدنى ٠٫٥ كغ في K-04 و K-07 و K-09.",
        sources: [{ label: "stock.quant - pistachio paste, all kiosks", count: 10, ref: "stock.quant" }] },
      { id: "A-3", severity: "warn", time: "6:48 PM", ago: "1.5 hr ago",
        titleEn: "Unusual void pattern - Basra Times", titleAr: "نمط إلغاء غير عادي - البصرة تايمز",
        bodyEn: "Karim Fahmy: 14 voids in 90 min (peer median 3). Largest single void IQD 28,000. Pattern began after 5:30 PM shift overlap.",
        bodyAr: "كريم فهمي: ١٤ إلغاء في ٩٠ دقيقة (المتوسط ٣).",
        sources: [{ label: "pos.order - voided, K-09 today", count: 14, ref: "pos.order" }] },
      { id: "A-4", severity: "warn", time: "5:22 PM", ago: "3 hr ago",
        titleEn: "Iced Spanish margin dipped 4.2 pts", titleAr: "هامش الإسباني المثلج انخفض ٤٫٢ نقطة",
        bodyEn: "Cost flow-through from condensed milk supplier increase last Friday. 5 kiosks affected. Current margin 22.4% (target 26.6%).",
        bodyAr: "تأثير زيادة تكلفة الحليب المكثف من الجمعة الماضية.",
        sources: [
          { label: "purchase.order - condensed milk, last 14 days", count: 3, ref: "purchase.order" },
          { label: "bayaan.recipe - iced-spanish v2", count: 1, ref: "bayaan.recipe" },
        ] },
    ],
    pendingActions: [
      { id: "PA-1", kind: "transfer", proposedAt: "8:18 PM",
        titleEn: "Stock transfer - Main warehouse to Majidi Mall", titleAr: "تحويل مخزون - المستودع to المجيدي",
        rationaleEn: "Pistachio paste at 0.4 kg (target 5 kg). Below safety floor; runs out in ~4h tomorrow morning at current pace.",
        rationaleAr: "معجون الفستق على ٠٫٤ كغ (الهدف ٥ كغ). تحت الحد الأدنى.",
        payload: [
          { item: "Pistachio paste", qty: 5, unit: "kg", value: 1_312_500 },
          { item: "Cups 12oz", qty: 600, unit: "pc", value: 4_200 },
        ],
        totalValue: 1_316_700, endpoint: "/bayaan/api/stock_transfer" },
      { id: "PA-2", kind: "purchase_order", proposedAt: "7:42 PM",
        titleEn: "Draft PO - Mesopotamia Foods", titleAr: "مسودة طلب شراء - Mesopotamia Foods",
        rationaleEn: "Pistachio paste below reorder threshold across the chain. 50 kg covers ~10 days at current pace, including the +18% recent supplier increase. Schedule: tomorrow 07:00.",
        rationaleAr: "معجون الفستق أقل من حد إعادة الطلب على مستوى الشبكة.",
        payload: [{ item: "Pistachio paste", qty: 50, unit: "kg", value: 11_125_000 }],
        totalValue: 11_125_000, endpoint: "/bayaan/api/purchase_order" },
      { id: "PA-3", kind: "stock_adjustment", proposedAt: "8:32 PM",
        titleEn: "Variance posting - Majidi Mall close", titleAr: "تسوية فارق - إغلاق المجيدي",
        rationaleEn: "Today's K-07 close shows -1.4 kg orange variance (-IQD 98,000). Without an explanation by tomorrow's shift open, post as today's loss and flag for cashier interview.",
        rationaleAr: "إغلاق K-07 اليوم يُظهر فارق ١٫٤ كغ برتقال (-د.ع ٩٨٬٠٠٠).",
        payload: [{ item: "Oranges", qty: -1.4, unit: "kg", value: -98_000 }],
        totalValue: -98_000, endpoint: "/bayaan/api/shift_close" },
    ],
    auditLog: [
      { id: "AL-1", at: "9 May - 14:32", actor: "AI",
        actionEn: "Created stock transfer ST-2026-0509-014", actionAr: "أنشأ تحويل مخزون ST-2026-0509-014",
        detailEn: "Main Warehouse to Mansour District - 12 kg lemons - IQD 168,000",
        approver: "Layla Hassan", approvedAt: "14:34", ref: "stock.picking" },
      { id: "AL-2", at: "9 May - 13:08", actor: "AI",
        actionEn: "Flagged anomaly - Mansour District croissant waste +240%", actionAr: "أبلغ عن شذوذ - هدر كرواسون المنصور +٢٤٠٪",
        detailEn: "Read-only insight. No action taken pending owner review.", ref: "insight" },
      { id: "AL-3", at: "9 May - 11:45", actor: "AI",
        actionEn: "Drafted PO PO-2026-0509-007", actionAr: "صاغ طلب شراء PO-2026-0509-007",
        detailEn: "Baghdad Dairy - 4 items - IQD 2,950,000 - expected delivery 10 May 07:00",
        approver: "Layla Hassan", approvedAt: "11:51", ref: "purchase.order" },
      { id: "AL-4", at: "9 May - 09:15", actor: "AI",
        actionEn: "Updated stock balance - Karrada Center cups 12oz +200", actionAr: "حدّث رصيد المخزون - أكواب الكرادة +٢٠٠",
        detailEn: "Internal transfer received. Reconciled against ST-2026-0509-002.",
        approver: "Maya Ahmed", approvedAt: "09:16", ref: "stock.move" },
    ],
    qa: [
      { qEn: "Why did Friday revenue drop 11%?", qAr: "لماذا انخفضت إيرادات الجمعة ١١٪؟",
        aEn: "Friday revenue was IQD 41.8M, 11% below the prior Friday. Two factors: (1) Majidi Mall and Basra Mall both opened ~45 min late due to a regional power cut (logged in pos.session opening times), losing roughly IQD 3.2M of typical morning revenue. (2) Iced drink sales at all kiosks were 8% below the 4-week Friday average - the weather forecast cooled 4C below baseline. Net effect explains 9.5 of the 11 percentage points; the remaining 1.5 pts is within normal day-to-day noise.",
        aAr: "إيرادات الجمعة د.ع ٤١٫٨ مليون، أقل ١١٪ من الجمعة السابقة. عاملان: تأخر فتح كشكين بسبب انقطاع كهرباء، وانخفاض مبيعات المشروبات الباردة بسبب برودة الطقس.",
        sources: ["pos.session", "pos.order", "weather.history"],
        generated: {
          type: "breakdown",
          titleEn: "Friday revenue gap - 11% vs prior Friday",
          titleAr: "فجوة إيرادات الجمعة · -١١٪ مقارنة بالجمعة السابقة",
          headlineValue: -5_200_000,
          baselineValue: 47_000_000,
          actualValue: 41_800_000,
          items: [
            { labelEn: "Late opening - K-07 + K-10 (45 min power cut)", labelAr: "تأخر فتح - K-07 و K-10 (انقطاع كهرباء ٤٥ دقيقة)", value: -3_200_000, share: 61.5, source: "pos.session" },
            { labelEn: "Iced drink softness - 8% vs 4-week avg (weather -4C)", labelAr: "ضعف المشروبات الباردة - ٨٪ (الطقس أبرد ٤C)", value: -1_700_000, share: 32.7, source: "pos.order + weather.history" },
            { labelEn: "Day-to-day noise (within tolerance)", labelAr: "تباين يومي طبيعي", value: -300_000, share: 5.8, source: "-" },
          ],
        } },
      { qEn: "Which kiosks are most affected by the pistachio price increase?", qAr: "أي الأكشاك الأكثر تأثراً بزيادة سعر الفستق؟",
        aEn: "Top three by absolute margin loss this month: Karrada Center (-IQD 412,000), Mansour District (-IQD 386,000), Empire Mall (-IQD 318,000). They're the highest-volume pistachio cake sellers. Reformulating the recipe from 12g to 9g pistachio (peer median) would recover roughly 4.5 margin points across the chain.",
        aAr: "الأعلى ثلاثة في خسارة الهامش هذا الشهر: الكرادة، المنصور، إمباير مول.",
        sources: ["bayaan.recipe", "pos.order.line", "purchase.order"],
        generated: {
          type: "kiosk-impact",
          titleEn: "Pistachio price impact by kiosk - April",
          titleAr: "تأثير ارتفاع سعر الفستق بحسب الكشك · أبريل",
          subtitleEn: "Mesopotamia Foods raised pistachio paste 18% on Apr 22 - flow-through to recipe cost",
          subtitleAr: "Mesopotamia Foods رفع سعر معجون الفستق ١٨٪ في ٢٢ أبريل",
          items: [
            { name: "Karrada Center", id: "K-01", value: -412_000, slicesSold: 1140 },
            { name: "Mansour District", id: "K-02", value: -386_000, slicesSold: 1068 },
            { name: "Empire Mall", id: "K-08", value: -318_000, slicesSold: 880 },
            { name: "Al Mansour Mall", id: "K-05", value: -274_000, slicesSold: 758 },
            { name: "Baghdad Mall", id: "K-03", value: -218_000, slicesSold: 604 },
            { name: "Family Mall G2", id: "K-06", value: -184_000, slicesSold: 510 },
          ],
          recommendationEn: "Reformulate to 9g (peer median) - recovers ~4.5 margin pts chain-wide, no measured taste impact",
          recommendationAr: "تعديل الوصفة إلى ٩غ (المتوسط) — يستعيد ~٤٫٥ نقطة هامش بدون تأثير ملموس على الطعم",
        } },
      { qEn: "What stock should I send to Kiosk 07 tomorrow?", qAr: "ما المخزون الذي يجب إرساله لـ K-07 غداً؟",
        aEn: "Based on the last 14 days at K-07 and the +6% Friday forecast: 14 kg oranges, 5 kg pistachio paste (urgent), 5 L whole milk, 600 cups 12oz, and 0.5 kg mint. The pistachio paste is already in pending action PA-1 awaiting approval.",
        aAr: "بناءً على آخر ١٤ يوماً والتوقع +٦٪ للجمعة: ١٤ كغ برتقال، ٥ كغ معجون فستق (عاجل)، ٦٠٠ كوب.",
        sources: ["bayaan.consumption.ledger", "stock.quant", "weather.forecast"],
        generated: {
          type: "transfer-list",
          titleEn: "Recommended transfer - Main Warehouse to Majidi Mall (K-07)",
          titleAr: "تحويل موصى به · المستودع الرئيسي → المجيدي (K-07)",
          subtitleEn: "Sized for 14-day average + Friday +6% forecast lift",
          subtitleAr: "محسوب على متوسط ١٤ يوماً + توقع +٦٪ ليوم الجمعة",
          lines: [
            { item: "Oranges", qty: 14, unit: "kg", value: 980_000, urgency: "normal", coverDays: 1.2 },
            { item: "Pistachio paste", qty: 5, unit: "kg", value: 1_312_500, urgency: "urgent", coverDays: 0.5, note: "in pending action PA-1" },
            { item: "Milk (whole) 1L", qty: 5, unit: "L", value: 17_500, urgency: "normal", coverDays: 2.0 },
            { item: "Cups 12oz", qty: 600, unit: "pc", value: 4_200, urgency: "normal", coverDays: 1.4 },
            { item: "Mint - fresh", qty: 0.5, unit: "kg", value: 87_500, urgency: "normal", coverDays: 1.5 },
          ],
          totalValue: 2_401_700,
          actionEn: "Create stock transfer",
          actionAr: "إنشاء تحويل مخزون",
        } },
      { qEn: "Show cashier voids by hour, last 7 days", qAr: "أرني إلغاءات الكاشير بالساعة لآخر ٧ أيام",
        aEn: "Across the chain, voids cluster between 11:00-13:00 (lunch rush) and 17:00-19:00 (shift overlap). One cashier stands out: Karim Fahmy at K-09 with 47 voids in 7 days (peer median 12). Today alone he had 14 voids in 90 min - see Alert A-3 above.",
        aAr: "الإلغاءات تتجمع بين ١١:٠٠–١٣:٠٠ و ١٧:٠٠–١٩:٠٠. كاشير بارز: كريم فهمي في K-09 بـ ٤٧ إلغاء في ٧ أيام.",
        sources: ["pos.order"],
        generated: {
          type: "hour-bars",
          titleEn: "Voids by hour - all kiosks - last 7 days",
          titleAr: "الإلغاءات بحسب الساعة · جميع الأكشاك · آخر ٧ أيام",
          subtitleEn: "Two clusters: lunch rush + evening shift overlap",
          subtitleAr: "تجمعان: ذروة الغداء + تداخل الوردية المسائية",
          bars: [
            { hour: "07", value: 4, peerMedian: 5 },
            { hour: "08", value: 7, peerMedian: 6 },
            { hour: "09", value: 9, peerMedian: 8 },
            { hour: "10", value: 11, peerMedian: 10 },
            { hour: "11", value: 23, peerMedian: 14, peak: true },
            { hour: "12", value: 31, peerMedian: 18, peak: true, label: "Lunch peak" },
            { hour: "13", value: 26, peerMedian: 16, peak: true },
            { hour: "14", value: 14, peerMedian: 12 },
            { hour: "15", value: 11, peerMedian: 10 },
            { hour: "16", value: 13, peerMedian: 11 },
            { hour: "17", value: 22, peerMedian: 14, peak: true, label: "Shift overlap" },
            { hour: "18", value: 28, peerMedian: 17, peak: true },
            { hour: "19", value: 18, peerMedian: 13 },
            { hour: "20", value: 9, peerMedian: 8 },
            { hour: "21", value: 6, peerMedian: 6 },
            { hour: "22", value: 4, peerMedian: 4 },
          ],
          standoutEn: "Karim Fahmy - K-09 - 47 voids / 7 days (peer median 12)",
          standoutAr: "كريم فهمي · K-09 · ٤٧ إلغاء / ٧ أيام (المتوسط ١٢)",
        } },
    ],
  },

  // ---- Daily Closing & Variance ----
  // Per-kiosk shift close summary. Mock-driven; structurally aligned with bayaan.shift.close + lines so a bootstrap adapter can hydrate this later.
  closings: [
    {
      id: "SC-2026-05-09-K01", kioskId: "K-01", kioskName: "Karrada Center", city: "Baghdad",
      cashier: "Maya Ahmed", openedAt: "07:00", closedAt: "23:08",
      sales: 6_447_000, expectedCash: 4_180_000, countedCash: 4_180_000, cashVariance: 0,
      wasteCost: 8_400, status: "approved", notes: "Cash and stock matched. Approved by Layla.",
      stock: [
        { item: "Espresso beans - house", unit: "kg", expected: 6.4, actual: 6.4, variance: 0, value: 0 },
        { item: "Milk (whole) 1L", unit: "L", expected: 18, actual: 18, variance: 0, value: 0 },
        { item: "Cups 12oz", unit: "pc", expected: 412, actual: 410, variance: -2, value: -1_400 },
      ],
    },
    {
      id: "SC-2026-05-09-K02", kioskId: "K-02", kioskName: "Mansour District", city: "Baghdad",
      cashier: "Yusuf Saleh", openedAt: "07:00", closedAt: "23:14",
      sales: 7_469_000, expectedCash: 4_854_000, countedCash: 4_770_000, cashVariance: -84_000,
      wasteCost: 33_600, status: "pending", notes: "Cash short by IQD 84,000. Count drawer again before approval.",
      recipePostingIssues: 1, recipePostingIssueOrders: ["POS-1249"],
      stock: [
        { item: "Mint - fresh", unit: "kg", expected: 1.8, actual: 1.5, variance: -0.3, value: -52_500 },
        { item: "Lemons", unit: "kg", expected: 6.4, actual: 6.4, variance: 0, value: 0 },
        { item: "Croissant - frozen", unit: "pc", expected: 22, actual: 8, variance: -14, value: -98_000 },
        { item: "Cups 12oz", unit: "pc", expected: 488, actual: 485, variance: -3, value: -2_100 },
      ],
    },
    {
      id: "SC-2026-05-09-K07", kioskId: "K-07", kioskName: "Majidi Mall", city: "Erbil",
      cashier: "Karim Fahmy", openedAt: "08:00", closedAt: "23:22",
      sales: 3_934_000, expectedCash: 2_557_000, countedCash: 2_415_000, cashVariance: -142_000,
      wasteCost: 58_800, status: "issue", notes: "Orange and cup variance requires cashier explanation.",
      stock: [
        { item: "Oranges", unit: "kg", expected: 28.0, actual: 26.6, variance: -1.4, value: -98_000 },
        { item: "Milk (whole) 1L", unit: "L", expected: 12, actual: 9, variance: -3, value: -10_500 },
        { item: "Cups 12oz", unit: "pc", expected: 267, actual: 251, variance: -16, value: -11_200 },
        { item: "Pistachio paste", unit: "kg", expected: 0.4, actual: 0.2, variance: -0.2, value: -52_500 },
      ],
    },
    {
      id: "SC-2026-05-09-K09", kioskId: "K-09", kioskName: "Basra Times Square", city: "Basra",
      cashier: "Nour Ibrahim", openedAt: "08:00", closedAt: "22:55",
      sales: 3_353_000, expectedCash: 2_180_000, countedCash: 2_148_000, cashVariance: -32_000,
      wasteCost: 15_750, status: "pending", notes: "Review croissant waste against closing count.",
      stock: [
        { item: "Pistachio paste", unit: "kg", expected: 0.6, actual: 0.5, variance: -0.1, value: -26_250 },
        { item: "Croissant - frozen", unit: "pc", expected: 14, actual: 5, variance: -9, value: -63_000 },
        { item: "Cups 12oz", unit: "pc", expected: 234, actual: 234, variance: 0, value: 0 },
      ],
    },
    {
      id: "SC-2026-05-09-K04", kioskId: "K-04", kioskName: "Zayouna Plaza", city: "Baghdad",
      cashier: "Sara Younis", openedAt: "07:00", closedAt: "-",
      sales: 4_239_000, expectedCash: 2_755_000, countedCash: null, cashVariance: null,
      wasteCost: 12_600, status: "open", notes: "Shift still open; closing count not submitted.",
      stock: [],
    },
  ],

  // ---- Sales & POS Monitor ----
  // These rows model the visible admin feed; paid orders still belong to the backend POS engine.
  posOrders: [
    { id: "POS-1247", time: "14:42:18", kioskId: "K-04", kiosk: "Zayouna Plaza", cashier: "Sara Younis", product: "Orange Juice 350ml", qty: 10, payment: "cash", amount: 75_000, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1248", time: "14:43:02", kioskId: "K-02", kiosk: "Mansour District", cashier: "Yusuf Saleh", product: "Croissant - Chocolate", qty: 2, payment: "card", amount: 10_000, status: "paid", recipe: "finished", sync: "live" },
    { id: "POS-1249", time: "14:43:49", kioskId: "K-07", kiosk: "Majidi Mall", cashier: "Karim Fahmy", product: "Pistachio Cake", qty: 1, payment: "Zain Cash", amount: 11_000, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1250", time: "14:44:31", kioskId: "K-09", kiosk: "Basra Times Square", cashier: "Karim Fahmy", product: "Iced Spanish", qty: 1, payment: "FIB", amount: 9_000, status: "void review", recipe: "held", sync: "needs review" },
    { id: "POS-1251", time: "14:45:06", kioskId: "K-01", kiosk: "Karrada Center", cashier: "Maya Ahmed", product: "Latte", qty: 2, payment: "QR", amount: 15_000, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1252", time: "14:45:51", kioskId: "K-05", kiosk: "Al Mansour Mall", cashier: "Nour Ibrahim", product: "Orange Juice 350ml", qty: 3, payment: "cash", amount: 22_500, status: "refund pending", recipe: "posted", sync: "live" },
    { id: "POS-1253", time: "14:46:12", kioskId: "K-03", kiosk: "Baghdad Mall", cashier: "Maya Ahmed", product: "Mint Lemonade", qty: 4, payment: "card", amount: 30_000, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1254", time: "14:46:44", kioskId: "K-06", kiosk: "Family Mall G2", cashier: "Yusuf Saleh", product: "Cold Brew", qty: 2, payment: "cash", amount: 18_000, status: "discounted", recipe: "posted", sync: "live" },
    { id: "POS-1255", time: "14:47:09", kioskId: "K-08", kiosk: "Empire Mall", cashier: "Maya Ahmed", product: "Mango Juice", qty: 2, payment: "NassWallet", amount: 16_000, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1256", time: "14:47:36", kioskId: "K-10", kiosk: "Basra Mall", cashier: "Sara Younis", product: "Cappuccino", qty: 1, payment: "FastPay", amount: 7_500, status: "paid", recipe: "posted", sync: "live" },
    { id: "POS-1257", time: "14:48:02", kioskId: "K-02", kiosk: "Mansour District", cashier: "Yusuf Saleh", product: "Iced Latte", qty: 1, payment: "Qi Card", amount: 8_000, status: "paid", recipe: "posted", sync: "live" },
  ],

  // ---- Kiosk Detail: Current Stock ----
  // opening + received - POS recipe consumption - waste = expected remaining.
  kioskStockDetails: {
    "K-01": [
      { item: "Oranges", unit: "kg", opening: 18, received: 12, consumed: 3.5, waste: 0.4, expected: 26.1, actual: 26.1, variance: 0, status: "ok" },
      { item: "Sugar", unit: "kg", opening: 7.2, received: 0, consumed: 0.1, waste: 0, expected: 7.1, actual: 7.1, variance: 0, status: "ok" },
      { item: "Cups 12oz", unit: "pc", opening: 640, received: 400, consumed: 412, waste: 4, expected: 624, actual: 622, variance: -2, status: "watch" },
      { item: "Straws", unit: "pc", opening: 720, received: 300, consumed: 118, waste: 0, expected: 902, actual: 902, variance: 0, status: "ok" },
      { item: "Espresso beans - house", unit: "kg", opening: 9.4, received: 0, consumed: 3.0, waste: 0, expected: 6.4, actual: 6.4, variance: 0, status: "ok" },
      { item: "Milk (whole) 1L", unit: "L", opening: 24, received: 12, consumed: 18, waste: 0, expected: 18, actual: 18, variance: 0, status: "ok" },
    ],
    "K-04": [
      { item: "Oranges", unit: "kg", opening: 18, received: 10, consumed: 11.9, waste: 0.7, expected: 15.4, actual: 14.7, variance: -0.7, status: "issue" },
      { item: "Sugar", unit: "kg", opening: 4.0, received: 0, consumed: 0.34, waste: 0, expected: 3.66, actual: 3.66, variance: 0, status: "ok" },
      { item: "Cups 12oz", unit: "pc", opening: 360, received: 200, consumed: 298, waste: 6, expected: 256, actual: 248, variance: -8, status: "watch" },
      { item: "Straws", unit: "pc", opening: 420, received: 0, consumed: 94, waste: 0, expected: 326, actual: 326, variance: 0, status: "ok" },
      { item: "Oat milk 1L", unit: "L", opening: 9, received: 0, consumed: 6, waste: 0, expected: 3, actual: 3, variance: 0, status: "watch" },
    ],
    "K-07": [
      { item: "Oranges", unit: "kg", opening: 40, received: 0, consumed: 10.5, waste: 1.5, expected: 28.0, actual: 26.6, variance: -1.4, status: "issue" },
      { item: "Milk (whole) 1L", unit: "L", opening: 16, received: 0, consumed: 4, waste: 0, expected: 12, actual: 9, variance: -3, status: "issue" },
      { item: "Cups 12oz", unit: "pc", opening: 640, received: 0, consumed: 267, waste: 106, expected: 267, actual: 251, variance: -16, status: "issue" },
      { item: "Pistachio paste", unit: "kg", opening: 3.0, received: 0, consumed: 2.4, waste: 0.2, expected: 0.4, actual: 0.2, variance: -0.2, status: "issue" },
    ],
  },

  pendingTransfers: [
    { id: "TR-2040", from: "Main Warehouse", to: "K-01 Karrada Center", eta: "15:10", status: "dispatched", items: "Milk 12 L, cups 400 pc", value: 782_000 },
    { id: "TR-2041", from: "Main Warehouse", to: "K-04 Zayouna Plaza", eta: "17:30", status: "picked", items: "Oat milk 12 L, cups 400 pc", value: 612_000 },
    { id: "TR-2042", from: "Main Warehouse", to: "K-07 Majidi Mall", eta: "Tomorrow 07:00", status: "approved", items: "Pistachio paste 5 kg, cups 600 pc", value: 1_316_700 },
    { id: "TR-2043", from: "Baghdad Area Warehouse", to: "K-02 Mansour District", eta: "16:45", status: "draft", items: "Mint 4 kg, lemons 12 kg", value: 356_000 },
  ],

  transferSuggestions: [
    { kiosk: "K-04 Zayouna Plaza", item: "Oat milk 1L", qty: "12 L", cover: "1.1 days", reason: "low stock before evening rush" },
    { kiosk: "K-07 Majidi Mall", item: "Pistachio paste", qty: "5 kg", cover: "0.4 days", reason: "critical plus open variance" },
    { kiosk: "K-02 Mansour District", item: "Mint - fresh", qty: "4 kg", cover: "1.4 days", reason: "lemonade mix above forecast" },
  ],

  // ---- POS ----
  posMenu: [
    { cat: "Hot Coffee", items: [
      { id: 1, name: "Espresso", image: "espresso", price: 4_000, sizes: ["S","D"] },
      { id: 2, name: "Americano", image: "americano", price: 5_500, sizes: ["S","M","L"] },
      { id: 3, name: "Flat White", image: "flat-white", price: 7_000, sizes: ["S","M"] },
      { id: 4, name: "Latte", image: "latte", price: 7_500, sizes: ["S","M","L"] },
      { id: 5, name: "Cappuccino", image: "cappuccino", price: 7_500, sizes: ["S","M","L"] },
      { id: 6, name: "Cortado", image: "cortado", price: 6_500, sizes: ["S"] },
      { id: 7, name: "Mocha", image: "mocha", price: 8_500, sizes: ["S","M","L"] },
      { id: 8, name: "Spanish Latte", image: "spanish-latte", price: 8_500, sizes: ["S","M"] },
    ]},
    { cat: "Iced Coffee", items: [
      { id: 11, name: "Iced Americano", image: "iced-americano", price: 6_500, sizes: ["M","L"] },
      { id: 12, name: "Iced Latte", image: "iced-latte", price: 8_500, sizes: ["M","L"] },
      { id: 13, name: "Iced Mocha", image: "iced-mocha", price: 9_000, sizes: ["M","L"] },
      { id: 14, name: "Cold Brew", image: "cold-brew", price: 9_000, sizes: ["M","L"] },
      { id: 15, name: "Iced Spanish", image: "iced-spanish", price: 9_000, sizes: ["M","L"] },
    ]},
    { cat: "Juice", items: [
      { id: 21, name: "Orange", image: "juice-orange", price: 7_500, sizes: ["M","L"] },
      { id: 22, name: "Mango", image: "juice-mango", price: 8_500, sizes: ["M","L"] },
      { id: 23, name: "Strawberry", image: "juice-strawberry", price: 8_500, sizes: ["M","L"] },
      { id: 24, name: "Avocado", image: "juice-avocado", price: 10_000, sizes: ["M","L"] },
      { id: 25, name: "Mint Lemonade", image: "mint-lemonade", price: 7_500, sizes: ["M","L"] },
    ]},
    { cat: "Cake", items: [
      { id: 31, name: "Pistachio Cake", image: "cake-pistachio", price: 11_000, sizes: ["slice"] },
      { id: 32, name: "Chocolate Fondant", image: "cake-chocolate-fondant", price: 10_000, sizes: ["slice"] },
      { id: 33, name: "Cheesecake", image: "cake-cheesecake", price: 10_500, sizes: ["slice"] },
      { id: 34, name: "Carrot Cake", image: "cake-carrot", price: 9_000, sizes: ["slice"] },
      { id: 35, name: "Tiramisu", image: "cake-tiramisu", price: 10_500, sizes: ["slice"] },
      { id: 36, name: "Lotus Cake", image: "cake-lotus", price: 10_000, sizes: ["slice"] },
    ]},
    { cat: "Bakery", items: [
      { id: 41, name: "Croissant - Plain", image: "croissant-plain", price: 4_000, sizes: ["pc"] },
      { id: 42, name: "Croissant - Chocolate", image: "croissant-chocolate", price: 5_000, sizes: ["pc"] },
      { id: 43, name: "Croissant - Almond", image: "croissant-almond", price: 5_500, sizes: ["pc"] },
      { id: 44, name: "Cinnamon Roll", image: "cinnamon-roll", price: 5_500, sizes: ["pc"] },
      { id: 45, name: "Za'atar Manakeesh", image: "zaatar-manakeesh", price: 5_000, sizes: ["pc"] },
    ]},
  ],
};



/* ===== Product catalog context =====
   Persists products + recipes + uploaded image overrides to localStorage so the
   Products & Recipes admin page survives soft reloads. The shape mirrors what a
   future /bayaan/api/products endpoint will return — when that lands, this
   provider's loader is the only thing that has to change.
*/

const CATEGORY_ORDER = ["Hot Coffee", "Iced Coffee", "Juice", "Cake", "Bakery"];

const flattenSeed = () =>
  MOCK.posMenu.flatMap((c) =>
    c.items.map((it) => ({
      id: it.id,
      category: c.cat,
      name: it.name,
      image: it.image,
      price: it.price,
      sizes: it.sizes,
    })),
  );

const recipeLine = (ingredient, qty, unit) => ({ ingredient, qty, unit });

const flattenSeedRecipes = () => ({
  1: { productId: 1, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  2: { productId: 2, lines: [
    recipeLine("Espresso beans - house", 0.02, "kg"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  3: { productId: 3, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.18, "L"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  4: { productId: 4, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.22, "L"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  5: { productId: 5, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.18, "L"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  6: { productId: 6, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.08, "L"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  7: { productId: 7, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.18, "L"),
    recipeLine("Chocolate sauce 1L", 0.03, "L"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  8: { productId: 8, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.16, "L"),
    recipeLine("Condensed milk", 0.025, "kg"),
    recipeLine("Cups 12oz", 1, "pc"),
  ] },
  11: { productId: 11, lines: [
    recipeLine("Espresso beans - house", 0.02, "kg"),
    recipeLine("Ice", 0.18, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
  ] },
  12: { productId: 12, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.24, "L"),
    recipeLine("Ice", 0.16, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
  ] },
  13: { productId: 13, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.2, "L"),
    recipeLine("Chocolate sauce 1L", 0.04, "L"),
    recipeLine("Ice", 0.16, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
  ] },
  14: { productId: 14, lines: [
    recipeLine("Cold brew concentrate", 0.12, "L"),
    recipeLine("Ice", 0.18, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
  ] },
  15: { productId: 15, lines: [
    recipeLine("Espresso beans - house", 0.018, "kg"),
    recipeLine("Milk (whole) 1L", 0.2, "L"),
    recipeLine("Condensed milk", 0.03, "kg"),
    recipeLine("Ice", 0.16, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
  ] },
  21: { productId: 21, lines: [
    recipeLine("Oranges", 0.35, "kg"),
    recipeLine("Sugar", 0.02, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
    recipeLine("Straws", 1, "pc"),
  ] },
  22: { productId: 22, lines: [
    recipeLine("Mango pulp", 0.25, "kg"),
    recipeLine("Sugar", 0.02, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
    recipeLine("Straws", 1, "pc"),
  ] },
  23: { productId: 23, lines: [
    recipeLine("Strawberry puree", 0.24, "kg"),
    recipeLine("Sugar", 0.02, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
    recipeLine("Straws", 1, "pc"),
  ] },
  24: { productId: 24, lines: [
    recipeLine("Avocado", 0.28, "kg"),
    recipeLine("Milk (whole) 1L", 0.2, "L"),
    recipeLine("Honey", 0.02, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
    recipeLine("Straws", 1, "pc"),
  ] },
  25: { productId: 25, lines: [
    recipeLine("Lemons", 0.18, "kg"),
    recipeLine("Mint - fresh", 0.02, "kg"),
    recipeLine("Sugar", 0.03, "kg"),
    recipeLine("Cups 16oz", 1, "pc"),
    recipeLine("Straws", 1, "pc"),
  ] },
  31: { productId: 31, lines: [
    recipeLine("Pistachio cake base", 1, "slice"),
    recipeLine("Pistachio paste", 0.012, "kg"),
    recipeLine("Cream cheese", 0.04, "kg"),
  ] },
  32: { productId: 32, lines: [
    recipeLine("Chocolate fondant base", 1, "slice"),
    recipeLine("Chocolate - 70%", 0.08, "kg"),
  ] },
  33: { productId: 33, lines: [
    recipeLine("Cheesecake base", 1, "slice"),
    recipeLine("Cream cheese", 0.06, "kg"),
  ] },
  34: { productId: 34, lines: [
    recipeLine("Carrot cake base", 1, "slice"),
  ] },
  35: { productId: 35, lines: [
    recipeLine("Tiramisu cup", 1, "pc"),
  ] },
  36: { productId: 36, lines: [
    recipeLine("Lotus cake base", 1, "slice"),
    recipeLine("Lotus biscuit spread", 0.04, "kg"),
  ] },
  41: { productId: 41, lines: [
    recipeLine("Croissant - frozen", 1, "pc"),
  ] },
  42: { productId: 42, lines: [
    recipeLine("Croissant - chocolate frozen", 1, "pc"),
  ] },
  43: { productId: 43, lines: [
    recipeLine("Croissant - almond frozen", 1, "pc"),
  ] },
  44: { productId: 44, lines: [
    recipeLine("Cinnamon roll - frozen", 1, "pc"),
  ] },
  45: { productId: 45, lines: [
    recipeLine("Za'atar manakeesh - frozen", 1, "pc"),
  ] },
});

const CatalogContext = React.createContext(null);

function CatalogProvider({ children }) {
  const [state, setState] = React.useState(
    () => reconcileCatalogWithSeed(loadCatalog(), flattenSeed(), flattenSeedRecipes()),
  );

  // Functional persist: atomically reads the *current* state, applies the
  // updater, persists to localStorage, then commits to React. This fixes a
  // bug where two API calls in one handler (e.g. upsertProduct + setRecipe)
  // would each capture stale state via closure and the second persist call
  // would overwrite the first.
  const persist = React.useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCatalog(next);
      return next;
    });
  }, []);

  const api = React.useMemo(
    () => ({
      state,
      upsertProduct: (p) => persist((prev) => {
        const exists = prev.products.some((x) => x.id === p.id);
        const products = exists
          ? prev.products.map((x) => (x.id === p.id ? p : x))
          : [...prev.products, p];
        return { ...prev, products };
      }),
      deleteProduct: (id) => persist((prev) => {
        const recipes = { ...prev.recipes };
        delete recipes[id];
        return {
          ...prev,
          products: prev.products.filter((p) => p.id !== id),
          recipes,
        };
      }),
      setRecipe: (productId, lines) => persist((prev) => {
        const recipes = { ...prev.recipes };
        if (!lines || lines.length === 0) delete recipes[productId];
        else recipes[productId] = { productId, lines };
        return { ...prev, recipes };
      }),
      setImage: (slug, dataUrl) => persist((prev) => ({
        ...prev,
        imagesBySlug: { ...prev.imagesBySlug, [slug]: dataUrl },
      })),
      clearImage: (slug) => persist((prev) => {
        const imagesBySlug = { ...prev.imagesBySlug };
        delete imagesBySlug[slug];
        return { ...prev, imagesBySlug };
      }),
      resetAll: () => {
        clearCatalog();
        setState(makeEmptyCatalog(flattenSeed(), flattenSeedRecipes()));
      },
      nextId: () => nextProductId(state.products),
      menuByCategory: () => {
        const groups = new Map();
        CATEGORY_ORDER.forEach((c) => groups.set(c, { cat: c, items: [] }));
        state.products.forEach((p) => {
          if (!groups.has(p.category)) groups.set(p.category, { cat: p.category, items: [] });
          groups.get(p.category).items.push({
            id: p.id,
            name: p.name,
            image: p.image,
            price: p.price,
            sizes: p.sizes,
          });
        });
        return Array.from(groups.values()).filter((g) => g.items.length > 0);
      },
    }),
    [state, persist],
  );

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

const useCatalog = () => {
  const ctx = React.useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog used outside CatalogProvider");
  return ctx;
};


/* ===== Toast system =====
   Lightweight transient notification. Used by demo actions (approve, reject,
   export, navigate) so clients see feedback instead of dead clicks.
*/
const ToastContext = React.createContext(null);
const useToast = () => React.useContext(ToastContext) ?? { showToast: () => {} };

function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const showToast = React.useCallback((message, kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        style={{
          position: "fixed", bottom: 22, insetInlineEnd: 22, zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
          maxWidth: 360,
        }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="ai-toast"
            role={t.kind === "crit" ? "alert" : "status"}
            aria-live={t.kind === "crit" ? "assertive" : "polite"}
            aria-atomic="true"
            style={{
            padding: "10px 14px", borderRadius: 10,
            background: t.kind === "crit" ? "#3A1A18" : "var(--terminal)",
            color: "var(--terminal-ink)", fontSize: 12.5, lineHeight: 1.45,
            boxShadow: "0 12px 32px rgba(0,0,0,0.22), 0 2px 4px rgba(0,0,0,0.08)",
            display: "flex", alignItems: "flex-start", gap: 9,
            pointerEvents: "auto",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 6,
              background: t.kind === "success" ? "#39B17A"
                : t.kind === "warn" ? "#E8B341"
                : t.kind === "crit" ? "#E26A55"
                : "#9DA8FF",
              boxShadow: t.kind === "success" ? "0 0 8px rgba(57, 177, 122, 0.6)"
                : t.kind === "warn" ? "0 0 8px rgba(232, 179, 65, 0.55)"
                : t.kind === "crit" ? "0 0 8px rgba(226, 106, 85, 0.55)"
                : "0 0 8px rgba(157, 168, 255, 0.5)",
            }}/>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}



/* ===== ui.jsx ===== */

/* ============================================================
   Shared UI primitives — exported to window
   ============================================================ */

const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

// ---------- Icons (single stroke, 14px) ----------
const Icon = ({ name, size = 14, stroke = 1.5, className = "", style }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></>,
    list: <><path d="M8 6H21"/><path d="M8 12H21"/><path d="M8 18H21"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    store: <><path d="M3 9V20H21V9"/><path d="M3 9L5 4H19L21 9"/><path d="M9 20V14H15V20"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20V13"/><path d="M22 20H2"/></>,
    box: <><path d="M21 7.5L12 3L3 7.5V16.5L12 21L21 16.5V7.5Z"/><path d="M3 7.5L12 12L21 7.5"/><path d="M12 12V21"/></>,
    trash: <><path d="M3 6H21"/><path d="M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6"/><path d="M5 6L6 20C6 21 7 22 8 22H16C17 22 18 21 18 20L19 6"/></>,
    truck: <><rect x="1" y="6" width="14" height="11"/><path d="M15 9H19L22 12V17H15"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    users: <><path d="M16 21V19C16 17 15 16 13 16H6C4 16 3 17 3 19V21"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 21V19C21 17 20 16 18 16"/><path d="M16 4C17 4 18 5 18 7C18 9 17 10 16 10"/></>,
    sparkles: <><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/><path d="M19 17L19.5 19L21 19.5L19.5 20L19 22L18.5 20L17 19.5L18.5 19L19 17Z"/></>,
    pin: <><path d="M12 22V14"/><path d="M8 14H16L15 8H9L8 14Z"/><path d="M9 8L10 3H14L15 8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21L16 16"/></>,
    bell: <><path d="M18 8C18 6 17 4 15 3C13 2 11 2 9 3C7 4 6 6 6 8C6 14 3 14 3 17H21C21 14 18 14 18 8Z"/><path d="M14 21C13 22 11 22 10 21"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2V5"/><path d="M12 19V22"/><path d="M4.93 4.93L7.05 7.05"/><path d="M16.95 16.95L19.07 19.07"/><path d="M2 12H5"/><path d="M19 12H22"/><path d="M4.93 19.07L7.05 16.95"/><path d="M16.95 7.05L19.07 4.93"/></>,
    moon: <path d="M20 15.2C18.7 16 17.2 16.4 15.6 16.4C11.2 16.4 7.6 12.8 7.6 8.4C7.6 6.8 8 5.3 8.8 4C5.4 5.2 3 8.4 3 12C3 17 7 21 12 21C15.6 21 18.8 18.6 20 15.2Z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15A1.7 1.7 0 0020 17L20.1 17.1A2 2 0 1117.3 20L17.2 19.9A1.7 1.7 0 0015.5 19.6 1.7 1.7 0 0014.5 21V21.1A2 2 0 0110.5 21.1V21A1.7 1.7 0 009.5 19.6 1.7 1.7 0 007.7 19.9L7.7 20A2 2 0 114.9 17.1L5 17A1.7 1.7 0 005.4 15.5 1.7 1.7 0 003.9 14.5H3.8A2 2 0 113.8 10.5H3.9A1.7 1.7 0 005.4 9.5 1.7 1.7 0 005 7.7L4.9 7.7A2 2 0 117.7 4.9L7.7 5A1.7 1.7 0 009.5 5.4 1.7 1.7 0 0010.5 3.9V3.8A2 2 0 1114.5 3.8V3.9A1.7 1.7 0 0015.5 5.4 1.7 1.7 0 0017.2 5L17.3 4.9A2 2 0 1120.1 7.7L20 7.7A1.7 1.7 0 0019.6 9.5 1.7 1.7 0 0021 10.5H21.1A2 2 0 0121.1 14.5H21A1.7 1.7 0 0019.4 15Z"/></>,
    chevDown: <path d="M6 9L12 15L18 9"/>,
    chevRight: <path d="M9 6L15 12L9 18"/>,
    chevLeft: <path d="M15 6L9 12L15 18"/>,
    chevUp: <path d="M6 15L12 9L18 15"/>,
    arrowUp: <path d="M12 19V5M5 12L12 5L19 12"/>,
    arrowDown: <path d="M12 5V19M5 12L12 19L19 12"/>,
    arrowRight: <path d="M5 12H19M12 5L19 12L12 19"/>,
    arrowLeft: <path d="M19 12H5M12 5L5 12L12 19"/>,
    refresh: <><path d="M20 6V11H15"/><path d="M4 18V13H9"/><path d="M18 9A7 7 0 006 7L4 9"/><path d="M6 15A7 7 0 0018 17L20 15"/></>,
    plus: <path d="M12 5V19M5 12H19"/>,
    minus: <path d="M5 12H19"/>,
    x: <path d="M6 6L18 18M6 18L18 6"/>,
    check: <path d="M5 12L10 17L20 7"/>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    filter: <path d="M3 5H21L14 13V20L10 22V13L3 5Z"/>,
    download: <><path d="M12 4V16M5 11L12 18L19 11"/><path d="M4 21H20"/></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M5 9V15M19 9V15"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10H22"/></>,
    coffee: <><path d="M4 8H18V14C18 17 16 19 13 19H9C6 19 4 17 4 14V8Z"/><path d="M18 10H20C21 10 22 11 22 12V13C22 14 21 15 20 15H18"/><path d="M8 4V6M12 4V6M16 4V6"/></>,
    leaf: <><path d="M12 22C7 17 7 11 12 6C16 11 17 17 12 22Z"/><path d="M12 22V8"/></>,
    cake: <><path d="M3 12V20H21V12"/><path d="M3 12H21"/><path d="M5 12V8H19V12"/><path d="M12 8V4M9 4L12 2L15 4"/></>,
    receipt: <><path d="M5 2V22L8 20L11 22L14 20L17 22L19 20V2L17 4L14 2L11 4L8 2L5 2Z"/><path d="M9 8H15M9 12H15M9 16H13"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21V19C4 17 6 15 8 15H16C18 15 20 17 20 19V21"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7V12L15 14"/></>,
    zap: <path d="M13 2L4 14H12L11 22L20 10H12L13 2Z"/>,
    eye: <><path d="M2 12C2 12 6 5 12 5C18 5 22 12 22 12C22 12 18 19 12 19C6 19 2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    flag: <><path d="M5 22V4C5 3 6 2 7 2H17L15 6L17 10H7"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {paths[name]}
    </svg>
  );
};

// ---------- Sparkline ----------
const Spark = ({ data, width = 80, height = 26, color }) => {
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / r) * (height - 2) - 1
  ]);
  const d = "M" + pts.map(p => p.join(",")).join(" L");
  const a = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="spark">
      <path className="area" d={a} fill={color || "currentColor"} opacity="0.06"/>
      <path className="line" d={d} stroke={color || "currentColor"} fill="none" strokeWidth="1.25"/>
    </svg>
  );
};

// ---------- MiniBars ----------
const MiniBars = ({ data, width = 80, height = 26, accentIndex = -1 }) => {
  const max = Math.max(...data);
  const bw = width / data.length - 1;
  return (
    <svg width={width} height={height}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 2);
        return <rect key={i} x={i * (bw + 1)} y={height - h} width={bw} height={h}
          fill={i === accentIndex ? "var(--accent)" : "var(--ink-2)"} opacity={i === accentIndex ? 1 : 0.5} rx="0.5"/>;
      })}
    </svg>
  );
};

// ---------- KPI ----------
const KPI = ({ label, value, sub, delta, deltaDir, spark, sparkData, footer, size }) => {
  const dirClass = deltaDir === "up" ? "delta-pos" : deltaDir === "down" ? "delta-neg" : "delta-flat";
  const arrow = deltaDir === "up" ? "+" : deltaDir === "down" ? "-" : "";
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 120 }}>
      <div className="between">
        <div className="t-micro">{label}</div>
        {sparkData && <Spark data={sparkData} width={64} height={20}/>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className={size === "lg" ? "t-num-display" : "t-num-big"}>{value}</div>
        {sub && <span className="muted t-small">{sub}</span>}
      </div>
      {(delta || footer) && (
        <div className="row" style={{ gap: 10, fontSize: 12 }}>
          {delta && <span className={dirClass}>{arrow ? `${arrow} ` : ""}{delta}</span>}
          {footer && <span className="subtle">{footer}</span>}
        </div>
      )}
    </div>
  );
};

// ---------- Section header ----------
const SectionHead = ({ title, sub, right }) => (
  <div className="between" style={{ marginBottom: 12 }}>
    <div>
      <div className="t-h2">{title}</div>
      {sub && <div className="t-small subtle" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ---------- AI Tag ----------
const AITag = ({ children = "AI" }) => <span className="ai-tag">{children}</span>;

// ---------- Avatar ----------
const Avatar = ({ name, size = 24, color }) => {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("");
  const palette = ["#3A3A40", "#2342D8", "#0E7A4E", "#A66B00", "#7B3F8F", "#155E63"];
  const c = color || palette[name.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c, color: "#fff",
      display: "grid", placeItems: "center",
      fontSize: size * 0.4, fontWeight: 600,
      flexShrink: 0
    }}>{initials}</div>
  );
};

// ---------- ProductImage ----------
// Product thumbnail with first-letter fallback. Resolves /products/<slug>.webp.
// If a slug has no static file or uploaded override, the tile renders a
// first-letter fallback — no broken image icons.
const ProductImage = ({ slug, name, size = 36, radius = 8, fill = false }) => {
  const [errored, setErrored] = React.useState(false);
  const catalog = React.useContext(CatalogContext);
  const override = slug && catalog?.state.imagesBySlug?.[slug];
  // Reset error state when the source changes (override added or slug swapped).
  React.useEffect(() => { setErrored(false); }, [override, slug]);
  const baseStyle = fill
    ? { width: "100%", height: "100%", borderRadius: radius, background: "var(--surface-sunk)" }
    : { width: size, height: size, borderRadius: radius, flexShrink: 0, background: "var(--surface-sunk)" };
  if (!slug || errored) {
    const letter = (name?.trim()?.[0] ?? "#").toUpperCase();
    return (
      <div style={{
        ...baseStyle,
        display: "grid", placeItems: "center",
        color: "var(--ink-2)",
        fontSize: fill ? 36 : size * 0.42,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}>{letter}</div>
    );
  }
  const src = override || `/products/${slug}.webp`;
  return (
    <img
      src={src}
      alt=""
      {...(fill ? {} : { width: size, height: size })}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      style={{ ...baseStyle, objectFit: "cover", display: "block" }}
    />
  );
};

// ---------- Number formatters ----------
const fmtMoney = (n, currency = "IQD") => {
  const opts = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return `${currency} ${n.toLocaleString("en", opts)}`;
};
const fmtMoneyShort = (n, currency = "IQD") => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${currency} ${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${currency} ${(n / 1_000).toFixed(0)}K`;
  return `${currency} ${n.toLocaleString("en")}`;
};
const fmtNum = (n) => n.toLocaleString("en");

const unwrapOdoo = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  return payload.message || payload.data || payload;
};

const LIVE_ONLY_KEY = "__bayaanLiveOnly";

const EMPTY_ENGINE_SNAPSHOT = {
  [LIVE_ONLY_KEY]: true,
  engine: "odoo_pos",
  summary: null,
  kiosks: [],
  products: [],
  recipes: [],
  purchase_orders: [],
  transfers: [],
  suggested_transfers: [],
  closings: [],
  warehouse_stock: [],
  kiosk_stock: {},
  kiosk_stock_rows: [],
  kioskStockDetails: {},
  today: {
    orders: [],
    payments: [],
    sales: [],
    consumption: [],
    waste: [],
  },
};

const EMPTY_WAREHOUSE_SETUP = {
  [LIVE_ONLY_KEY]: true,
  engine: "odoo_pos",
  company: null,
  warehouses: [],
  locations: [],
  kiosks: [],
  pos_configs: [],
};

const markLiveOnlySnapshot = (payload) => {
  const snapshot = unwrapOdoo(payload);
  if (!snapshot || typeof snapshot !== "object") return EMPTY_ENGINE_SNAPSHOT;
  return {
    ...EMPTY_ENGINE_SNAPSHOT,
    ...snapshot,
    [LIVE_ONLY_KEY]: true,
    today: {
      ...EMPTY_ENGINE_SNAPSHOT.today,
      ...(snapshot.today || {}),
    },
  };
};

const markLiveOnlyWarehouseSetup = (payload) => {
  const setup = unwrapOdoo(payload);
  if (!setup || typeof setup !== "object") return EMPTY_WAREHOUSE_SETUP;
  return {
    ...EMPTY_WAREHOUSE_SETUP,
    ...setup,
    [LIVE_ONLY_KEY]: true,
  };
};

const isLiveOnlyPayload = (payload) => Boolean(unwrapOdoo(payload)?.[LIVE_ONLY_KEY]);
const canUseDemoFallback = (payload) => !isLiveOnlyPayload(payload);

const odooSummary = (bootstrap) => unwrapOdoo(bootstrap)?.summary || null;

const normalizeLookup = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const kioskLookupValues = (kiosk) => [
  kiosk?.id,
  kiosk?.name,
  kiosk?.kiosk_code,
  kiosk?.kioskName,
  kiosk?.pos_config,
  kiosk?.posConfig,
  kiosk?.warehouse,
  kiosk?.stockLocation,
].filter(Boolean);

const matchesKiosk = (value, kiosk) => {
  const left = normalizeLookup(value);
  if (left.length < 2) return false;
  return kioskLookupValues(kiosk).some((candidate) => {
    const right = normalizeLookup(candidate);
    if (right.length < 2) return false;
    return left === right || left.includes(right) || right.includes(left);
  });
};

const matchesItem = (value, item) => {
  const left = normalizeLookup(value);
  const right = normalizeLookup(item);
  if (left.length < 2 || right.length < 2) return false;
  return left === right || left.includes(right) || right.includes(left);
};

const cleanDisplayName = (value) => String(value || "").replace(/^\[[^\]]+\]\s*/, "");

const compactError = (error) => {
  if (!error) return "";
  const message = error.message || String(error);
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
};

const isSuperadminAuth = (auth) => (
  auth?.user?.primaryRole === "superadmin" || auth?.user?.roles?.includes("superadmin")
);

const auditSeverityClass = (severity) => {
  if (severity === "critical") return "badge-crit";
  if (severity === "warning") return "badge-warn";
  if (severity === "success") return "badge-pos";
  return "";
};

const auditDotClass = (severity) => {
  if (severity === "critical") return "crit";
  if (severity === "warning") return "warn";
  if (severity === "success") return "pos";
  return "";
};

const auditTimeLabel = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
};

const normalizeAuditEvents = (payload) => {
  const data = unwrapOdoo(payload);
  const rows = Array.isArray(data?.events) ? data.events : [];
  return rows.map((event) => ({
    id: event.id,
    title: event.title || event.action || "System event",
    detail: event.detail || event.message || "",
    actor: event.actor || "Bayaan",
    action: event.action || "",
    eventType: event.eventType || event.event_type || "",
    severity: event.severity || "info",
    reference: event.reference || event.ref || "",
    model: event.model || event.modelName || "",
    kiosk: event.kiosk || event.kioskName || "",
    occurredAt: event.occurredAt || event.occurred_at || event.at || "",
  }));
};

const normalizeRealtimeAuditEvent = (event) => ({
  id: `rt-${event.id || Date.now()}`,
  title: event.title || event.action || "Realtime event",
  detail: event.detail || "",
  actor: "Bayaan stream",
  action: event.action || event.type || "",
  eventType: event.eventType || "",
  severity: event.severity || "info",
  reference: event.reference || "",
  model: event.model || "",
  kiosk: event.kiosk || event.kioskName || "",
  occurredAt: event.occurredAt || new Date().toISOString(),
});

const demoAuditEvents = () => (MOCK.ai?.auditLog || []).map((event) => ({
  id: event.id,
  title: event.actionEn,
  detail: event.detailEn,
  actor: event.actor,
  action: "demo.audit",
  eventType: "demo",
  severity: event.approver ? "success" : "info",
  reference: event.ref,
  model: event.ref,
  kiosk: "",
  occurredAt: event.at,
}));

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) {
    resolve("");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || "");
    resolve(result.includes(",") ? result.split(",").pop() || "" : result);
  };
  reader.onerror = () => reject(reader.error || new Error("Could not read file"));
  reader.readAsDataURL(file);
});

function Modal({ open, onClose, title, sub, width = 460, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: width, background: "var(--paper)", borderRadius: 12, padding: 20, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}>
        <div className="between" style={{ marginBottom: 14, alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
            {sub && <div className="t-small muted" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost"
            aria-label="Close"
            style={{ width: 28, height: 28, padding: 0, justifyContent: "center", flexShrink: 0 }}>
            <Icon name="x" size={14}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const DEMO_WAREHOUSE_SETUP = {
  engine: "demo",
  company: { id: "demo", name: "Bayaan Demo Company" },
  warehouses: [
    { id: "WH-MAIN", name: "Central Warehouse", code: "MAIN", stock_location: "Central Warehouse / Stock" },
  ],
  locations: [
    { id: "LOC-MAIN", name: "Stock", complete_name: "Central Warehouse / Stock", kind: "central", quantity: 12340, reserved_quantity: 0 },
    ...MOCK.kiosks.map((kiosk) => ({
      id: `LOC-${kiosk.id}`,
      name: `${kiosk.id} Stock`,
      complete_name: `Central Warehouse / Stock / ${kiosk.id} ${kiosk.name}`,
      kind: "kiosk",
      quantity: Math.round(kiosk.stockHealth * 9),
      reserved_quantity: Math.round(kiosk.wasteLoad / 5),
    })),
  ],
  kiosks: MOCK.kiosks.map((kiosk) => ({
    id: kiosk.id,
    name: kiosk.name,
    kiosk_code: kiosk.id,
    active: true,
    city: kiosk.city,
    area: kiosk.city,
    stock_location: `Central Warehouse / Stock / ${kiosk.id} ${kiosk.name}`,
    pos_config: `${kiosk.id} POS`,
    picking_type: `${kiosk.id} POS Delivery`,
    stock_deduction_policy: kiosk.status === "crit" ? "strict" : "warning",
  })),
  pos_configs: MOCK.kiosks.map((kiosk) => ({
    id: `POS-${kiosk.id}`,
    name: `${kiosk.id} POS`,
    source_location: `Central Warehouse / Stock / ${kiosk.id} ${kiosk.name}`,
    active: true,
  })),
};

const odooKioskRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const useDemo = canUseDemoFallback(bootstrap);
  if (!snapshot?.kiosks?.length) return useDemo ? MOCK.kiosks : [];
  const summaryRows = snapshot?.summary?.byKiosk || [];
  const salesByKiosk = {};
  (snapshot.today?.sales || []).forEach((sale) => {
    const code = sale.kiosk || sale.pos_config;
    if (!code) return;
    salesByKiosk[code] = salesByKiosk[code] || { revenue: 0, orders: 0 };
    salesByKiosk[code].revenue += Number(sale.revenue || sale.amount_total || 0);
    salesByKiosk[code].orders += Number(sale.orders || 1);
  });

  return snapshot.kiosks.map((kiosk, index) => {
    const fallback = useDemo
      ? MOCK.kiosks[index % MOCK.kiosks.length]
      : {
          id: kiosk.kiosk_code || `K-${index + 1}`,
          name: kiosk.name || "Kiosk",
          city: kiosk.city || kiosk.area || "-",
          revenue: 0,
          orders: 0,
          margin: 0,
          waste: 0,
          wasteLoad: 0,
          stockHealth: 0,
          variance: 0,
          criticalStock: "-",
          issue: "No verified activity yet",
          staff: 0,
          status: "good",
          trend: [],
        };
    const summary = summaryRows.find((row) => matchesKiosk(row.kioskId || row.name, kiosk));
    const sales = Object.entries(salesByKiosk).find(([key]) => matchesKiosk(key, kiosk))?.[1] || {};
    const stockRows = Object.entries(snapshot.kiosk_stock || {}).find(([key]) => matchesKiosk(key, kiosk))?.[1] || [];
    const wasteRows = (snapshot.today?.waste || []).filter((row) => row.kiosk === kiosk.kiosk_code || row.kiosk === kiosk.name);
    const revenue = Math.round(Number(summary?.sales ?? sales.revenue ?? fallback.revenue));
    const orders = Math.round(Number(summary?.orders ?? sales.orders ?? fallback.orders));
    const wasteCost = Number(summary?.wasteCost ?? wasteRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0));
    const waste = revenue ? Number(((wasteCost / revenue) * 100).toFixed(1)) : fallback.waste;
    const stockHealth = summary?.stockHealth != null
      ? Number(summary.stockHealth)
      : stockRows.length
      ? Math.max(20, Math.round(100 - stockRows.filter((row) => Number(row.actual_qty || 0) <= 0).length * 22 - stockRows.filter((row) => Number(row.actual_qty || 0) < 5).length * 9))
      : fallback.stockHealth;
    const wasteLoad = Math.min(100, Math.round((waste / 6) * 100));
    const summaryStatus = String(summary?.status || "");
    const status = summaryStatus === "variance_issue"
      ? "crit"
      : ["low_stock", "needs_closing"].includes(summaryStatus)
        ? "warn"
        : stockHealth < 50 || waste > 5.5 ? "crit" : stockHealth < 70 || waste > 3.5 ? "warn" : "good";
    return {
      ...fallback,
      id: kiosk.kiosk_code || fallback.id,
      name: kiosk.name || fallback.name,
      city: kiosk.city || kiosk.area || fallback.city,
      kiosk_code: kiosk.kiosk_code,
      posConfig: kiosk.pos_config,
      stockLocation: kiosk.warehouse,
      manager: kiosk.manager,
      supervisor: kiosk.supervisor,
      revenue,
      orders,
      waste,
      wasteLoad,
      stockHealth,
      status,
      criticalStock: stockRows.find((row) => Number(row.actual_qty || 0) < 5)?.item || fallback.criticalStock,
      issue: status === "crit" ? "Stock or waste needs action" : status === "warn" ? "Watch stock levels" : "Synced from engine",
    };
  });
};

const inventoryCategoryFor = (mode, fallback = "") => {
  if (fallback) return fallback;
  if (mode === "recipe") return "Recipe product";
  if (mode === "hybrid") return "Hybrid product";
  if (mode === "none") return "Non-stock product";
  return "Stock item";
};

const inventoryStatusFor = (qty) => {
  if (qty <= 5) return "crit";
  if (qty <= 25) return "low";
  return "ok";
};

const odooInventoryRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  if (!snapshot?.warehouse_stock?.length && !snapshot?.kiosk_stock_rows?.length) {
    return canUseDemoFallback(bootstrap)
      ? MOCK.inventory.map((row) => ({ ...row, location: "Demo warehouse", locationKey: "demo-warehouse" }))
      : [];
  }
  const productMeta = new Map();
  (snapshot.products || []).forEach((product) => {
    [product.default_code, product.name, cleanDisplayName(product.name)].filter(Boolean).forEach((key) => {
      productMeta.set(String(key), product);
    });
  });
  const makeRow = (row, location, locationKey) => {
    const meta = productMeta.get(String(row.item)) || productMeta.get(cleanDisplayName(row.item)) || {};
    const qty = Number(row.actual_qty || 0);
    const status = inventoryStatusFor(qty);
    return {
      item: row.item || "Stock item",
      category: inventoryCategoryFor(row.mode || meta.consumption_mode, row.category || meta.category),
      stock: Math.round(qty * 100) / 100,
      unit: row.uom || "u",
      reorder: status === "crit" ? 10 : 25,
      days: status === "crit" ? 0.6 : status === "low" ? 1.8 : 6.4,
      supplier: "Bayaan",
      status,
      location,
      locationKey,
    };
  };
  const warehouseRows = (snapshot.warehouse_stock || []).slice(0, 500).map((row) => makeRow(row, "Company total", "company-total"));
  const kioskRows = (snapshot.kiosk_stock_rows || []).slice(0, 500).map((row) => makeRow(row, row.kiosk || "Kiosk location", row.kiosk || "kiosk"));
  return [...warehouseRows, ...kioskRows];
};

const odooPosOrderRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.today?.orders || [];
  if (!rows.length) return canUseDemoFallback(bootstrap) ? MOCK.posOrders : [];
  return rows.slice(0, 50).map((order, index) => {
    const firstLine = order.lines?.[0];
    const firstPayment = order.payments?.[0];
    const state = String(order.state || "paid");
    const recipeState = String(order.consumption_state || "");
    const paymentLabel = firstPayment?.provider?.label || firstPayment?.method || "unpaid";
    const paymentMethod = String(paymentLabel).toLowerCase() === "cash" ? "cash" : String(paymentLabel);
    return {
      id: order.name || `POS-${index + 1}`,
      time: String(order.date_order || "").slice(11, 19) || "--:--",
      kioskId: order.kiosk || order.pos_config || `K-${index + 1}`,
      kiosk: order.kiosk || order.pos_config || "POS kiosk",
      cashier: order.cashier || "Cashier",
      product: cleanDisplayName(firstLine?.product) || `${order.lines?.length || 0} lines`,
      qty: Number(firstLine?.qty || 1),
      payment: paymentMethod,
      amount: Number(order.amount_total || 0),
      status: state,
      recipe: recipeState === "posted" ? "posted" : recipeState || "held",
      sync: "live",
    };
  });
};

const closeInvestigationStatus = (close) => {
  if (close.status === "approved") return "Approved";
  if (close.status === "open") return "Waiting for count";
  if (close.status === "issue") return "Investigation open";
  if (close.status === "pending") return "Manager review";
  return "Ready for approval";
};

const odooClosingRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.closings?.length
    ? snapshot.closings
    : canUseDemoFallback(bootstrap)
      ? MOCK.closings
      : [];
  return rows.map((row) => ({
    ...row,
    stock: (row.stock || []).map((line) => ({ ...line, item: cleanDisplayName(line.item) })),
    investigationStatus: row.investigationStatus || closeInvestigationStatus(row),
    notes: row.notes || (row.status === "approved" ? "No exceptions." : "Awaiting manager note."),
    recipePostingIssues: Number(row.recipePostingIssues || 0),
    recipePostingIssueOrders: row.recipePostingIssueOrders || [],
  }));
};

const odooKioskStockReconciliationRows = (bootstrap, kiosk) => {
  const snapshot = unwrapOdoo(bootstrap);
  const base = snapshot || (canUseDemoFallback(bootstrap) ? MOCK : {});

  const detailMap = base.kioskStockDetails || base.kiosk_stock_details || null;
  if (detailMap && typeof detailMap === "object") {
    const matchKey = Object.keys(detailMap).find((key) => matchesKiosk(key, kiosk));
    const rows = matchKey ? detailMap[matchKey] : null;
    if (Array.isArray(rows) && rows.length) {
      return rows.slice(0, 12).map((row) => ({
        item: row.item || "Stock item",
        unit: row.unit || row.uom || "u",
        opening: Number(row.opening || 0),
        received: Number(row.received || 0),
        consumed: Number(row.consumed || 0),
        waste: Number(row.waste || 0),
        expected: Number(row.expected || row.expected_qty || 0),
        actual: Number(row.actual || row.actual_qty || 0),
        variance: Number(row.variance || 0),
        status: row.status || "ok",
      }));
    }
  }

  const consumptionRows = (base.today?.consumption || []).filter((row) => matchesKiosk(row.kiosk, kiosk));
  const wasteRows = (base.today?.waste || []).filter((row) => matchesKiosk(row.kiosk, kiosk));
  const closing = (base.closings || []).find((row) => matchesKiosk(row.kioskId || row.kioskName, kiosk));
  const consumedFor = (item) => consumptionRows
    .filter((row) => matchesItem(row.ingredient || row.item || row.item_code, item))
    .reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const wastedFor = (item) => wasteRows
    .filter((row) => matchesItem(row.product || row.ingredient || row.item || row.item_code, item))
    .reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const statusFor = (variance, actual) => {
    if (Math.abs(Number(variance || 0)) >= 1 || Number(actual || 0) <= 0) return "issue";
    if (Math.abs(Number(variance || 0)) > 0 || Number(actual || 0) <= 5) return "watch";
    return "ok";
  };

  if (closing?.stock?.length) {
    return closing.stock.map((line) => {
      const consumed = consumedFor(line.item);
      const waste = wastedFor(line.item);
      const expected = Number(line.expected || 0);
      const actual = Number(line.actual || 0);
      const variance = Number(line.variance || actual - expected || 0);
      return {
        item: cleanDisplayName(line.item),
        unit: line.unit || "u",
        opening: Math.max(0, expected + consumed + waste),
        received: 0,
        consumed,
        waste,
        expected,
        actual,
        variance,
        status: statusFor(variance, actual),
      };
    });
  }

  const stockRows = (base.kiosk_stock_rows || [])
    .filter((row) => matchesKiosk(row.kiosk, kiosk));
  if (!stockRows.length) return null;

  return stockRows.slice(0, 12).map((row) => {
    const item = row.item || "Stock item";
    const consumed = consumedFor(item);
    const waste = wastedFor(item);
    const actual = Number(row.actual_qty || 0);
    return {
      item,
      unit: row.uom || "u",
      opening: actual + consumed + waste,
      received: 0,
      consumed,
      waste,
      expected: actual,
      actual,
      variance: 0,
      status: statusFor(0, actual),
    };
  });
};

const movementTimeLabel = (value) => auditTimeLabel(value) || "--:--";
const movementSortValue = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
const movementQtyLabel = (qty, uom) => {
  const value = Number(qty || 0).toLocaleString("en", { maximumFractionDigits: 2 });
  return uom ? `${value} ${uom}` : value;
};
const movementLineSummary = (lines = []) => {
  const visible = lines.slice(0, 3).map((line) => {
    const qty = Number(line.doneQty || line.qty || 0).toLocaleString("en", { maximumFractionDigits: 2 });
    return `${cleanDisplayName(line.product || "Item")} x ${qty}${line.uom ? ` ${line.uom}` : ""}`;
  });
  if (lines.length > 3) visible.push(`+${lines.length - 3} more`);
  return visible.join(", ");
};
const transferMovementAction = (transfer, selectedKiosk) => {
  const status = String(transfer.bayaan_state || transfer.bayaanState || transfer.state || "draft").toLowerCase();
  const incoming = matchesKiosk(transfer.toKioskId || transfer.to || transfer.location_dest, selectedKiosk);
  if (incoming && ["received", "done", "completed"].includes(status)) return "Transfer received";
  if (incoming && status === "dispatched") return "Transfer expected";
  if (incoming) return `Transfer ${status}`;
  if (["received", "done", "completed"].includes(status)) return "Transfer completed";
  if (status === "dispatched") return "Transfer dispatched";
  return `Transfer ${status}`;
};
const odooKioskStockMovementRows = (bootstrap, kiosk) => {
  const snapshot = unwrapOdoo(bootstrap);
  if (!snapshot) return [];
  const rows = [];
  const addRow = (row) => {
    const at = row.at || "";
    rows.push({
      id: row.id || `${row.source}-${row.action}-${at}-${rows.length}`,
      time: movementTimeLabel(at),
      sortAt: movementSortValue(at),
      ...row,
    });
  };

  (snapshot.closings || [])
    .filter((close) => matchesKiosk(close.kioskId || close.kioskName, kiosk))
    .forEach((close) => {
      const lineCount = close.stock?.length || close.ingredientVariance?.length || 0;
      if (close.openedAt) {
        addRow({
          id: `${close.name || close.id}-opening`,
          at: close.openedAt,
          action: "Opening stock baseline",
          detail: `${lineCount || "Shift"} stock lines opened by ${close.cashier || "cashier"}`,
          source: "bayaan.shift.close",
        });
      }
      if (close.closedAt) {
        addRow({
          id: `${close.name || close.id}-closing`,
          at: close.closedAt,
          action: "Closing stock count",
          detail: `${lineCount || "Shift"} stock lines counted - ${close.status || "pending"}`,
          source: "bayaan.shift.close",
        });
      }
    });

  (snapshot.transfers || [])
    .filter((transfer) => (
      matchesKiosk(transfer.toKioskId || transfer.to || transfer.location_dest, kiosk)
      || matchesKiosk(transfer.from || transfer.location_src, kiosk)
    ))
    .forEach((transfer) => {
      const lines = movementLineSummary(transfer.lines || []);
      addRow({
        id: transfer.name || `transfer-${transfer.id}`,
        at: transfer.doneAt || transfer.scheduledAt || transfer.createdAt,
        action: transferMovementAction(transfer, kiosk),
        detail: `${transfer.name ? `${transfer.name} - ` : ""}${transfer.from || "Warehouse"} -> ${transfer.toKioskId || transfer.to || "Kiosk"}${lines ? ` - ${lines}` : ""}`,
        source: "stock.picking",
      });
    });

  (snapshot.today?.consumption || [])
    .filter((line) => matchesKiosk(line.kiosk, kiosk))
    .forEach((line, index) => {
      const ingredient = cleanDisplayName(line.ingredient || "Ingredient");
      const product = cleanDisplayName(line.sold_product || line.product || "POS sale");
      const order = line.order ? ` (${line.order})` : "";
      addRow({
        id: `consumption-${line.id || index}`,
        at: line.consumed_at || line.create_date,
        action: "Recipe deduction",
        detail: `${movementQtyLabel(line.qty, line.uom)} ${ingredient} for ${product}${order}`,
        source: "bayaan.consumption.ledger",
      });
    });

  (snapshot.today?.waste || [])
    .filter((entry) => matchesKiosk(entry.kiosk, kiosk))
    .forEach((entry, index) => {
      addRow({
        id: `waste-${entry.id || index}`,
        at: entry.create_date,
        action: "Waste recorded",
        detail: `${movementQtyLabel(entry.qty, entry.uom)} ${cleanDisplayName(entry.product || "Waste item")} - ${entry.reason || entry.state || "recorded"}`,
        source: "bayaan.waste.entry",
      });
    });

  return rows
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 80);
};

const PAYMENT_GATEWAY_PROVIDERS = [
  { id: "cash", label: "Cash", category: "cash", kind: "cash_drawer", settlement: "drawer_count", aliases: ["cash"] },
  { id: "bank_card", label: "Bank card terminal", category: "card", kind: "card_terminal", settlement: "bank_batch", aliases: ["card", "visa", "mastercard", "master card", "terminal", "pos terminal"] },
  { id: "generic_qr", label: "Generic QR", category: "qr", kind: "qr", settlement: "gateway_batch", aliases: ["qr", "qr code", "qrcode"] },
  { id: "zain_cash", label: "Zain Cash", category: "mobile_wallet", kind: "wallet", settlement: "gateway_batch", aliases: ["zain cash", "zaincash", "zain wallet", "zain"] },
  { id: "fib", label: "FIB", category: "bank_app", kind: "bank_app", settlement: "gateway_batch", aliases: ["fib", "first iraqi bank", "first iraqi", "fib pay", "fib qr"] },
  { id: "qi_card", label: "Qi Card / SuperQi", category: "card", kind: "card_wallet", settlement: "bank_batch", aliases: ["qi card", "qicard", "superqi", "super qi", "qi"] },
  { id: "nass_wallet", label: "NassWallet / NASS Pay", category: "mobile_wallet", kind: "wallet", settlement: "gateway_batch", aliases: ["nasswallet", "nass wallet", "nasspay", "nass pay", "nass"] },
  { id: "fastpay", label: "FastPay", category: "mobile_wallet", kind: "wallet_qr", settlement: "gateway_batch", aliases: ["fastpay", "fast pay"] },
  { id: "asia_hawala", label: "AsiaHawala", category: "mobile_wallet", kind: "wallet", settlement: "gateway_batch", aliases: ["asiahawala", "asia hawala", "asiacell hawala", "asia wallet"] },
  { id: "manual_bank_transfer", label: "Manual bank transfer", category: "manual_digital", kind: "manual_transfer", settlement: "manager_verified", aliases: ["manual digital", "manual bank", "bank transfer", "transfer", "bank deposit"] },
  { id: "other_digital", label: "Other digital", category: "digital_other", kind: "other_digital", settlement: "gateway_batch", aliases: ["digital", "online", "e-payment", "epayment"] },
];

const PAYMENT_GATEWAY_BY_ID = Object.fromEntries(PAYMENT_GATEWAY_PROVIDERS.map((provider) => [provider.id, provider]));
const PAYMENT_GATEWAY_ALIAS_ROWS = PAYMENT_GATEWAY_PROVIDERS
  .flatMap((provider) => provider.aliases.map((alias) => [alias.replace(/[^a-z0-9]+/gi, "").toLowerCase(), provider]))
  .sort(([a], [b]) => b.length - a.length);

const createPaymentSplit = () => ({
  cash: 0,
  card: 0,
  qr: 0,
  mobile_wallet: 0,
  bank_app: 0,
  manual_digital: 0,
  digital_other: 0,
  digital: 0,
  total: 0,
  _byMethod: {},
  _byProvider: {},
});

const normalizePaymentText = (value) => String(value || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();

const classifyPaymentProvider = (methodName, providerValue) => {
  const configuredId = typeof providerValue === "string"
    ? providerValue
    : providerValue?.id || providerValue?.provider;
  if (configuredId && PAYMENT_GATEWAY_BY_ID[configuredId]) return PAYMENT_GATEWAY_BY_ID[configuredId];
  const normalized = normalizePaymentText(methodName);
  if (normalized === "cash") return PAYMENT_GATEWAY_BY_ID.cash;
  const matched = PAYMENT_GATEWAY_ALIAS_ROWS.find(([alias]) => alias && normalized.includes(alias));
  return matched?.[1] || PAYMENT_GATEWAY_BY_ID.other_digital;
};

const addPaymentToSplit = (split, methodName, amountValue, providerValue) => {
  const amount = Number(amountValue || 0);
  const provider = classifyPaymentProvider(methodName, providerValue);
  const category = split[provider.category] == null ? "digital_other" : provider.category;
  const method = String(methodName || provider.label);
  split[category] += amount;
  if (category !== "cash") split.digital += amount;
  split.total += amount;
  split._byMethod[method] = split._byMethod[method] || {
    method,
    category,
    provider: provider.id,
    providerLabel: provider.label,
    amount: 0,
  };
  split._byMethod[method].amount += amount;
  split._byProvider[provider.id] = split._byProvider[provider.id] || {
    provider: provider.id,
    label: provider.label,
    category,
    kind: provider.kind,
    settlement: provider.settlement,
    amount: 0,
  };
  split._byProvider[provider.id].amount += amount;
};

const finalizePaymentSplit = (split) => {
  const byMethod = Object.values(split._byMethod || {}).sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
  const byProvider = Object.values(split._byProvider || {}).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const { _byMethod, _byProvider, ...publicSplit } = split;
  return { ...publicSplit, by_method: byMethod, by_provider: byProvider };
};

const normalizePaymentSplit = (payments) => {
  const { _byMethod, _byProvider, ...base } = createPaymentSplit();
  return {
    ...base,
    ...(payments || {}),
    bank_app: Number(payments?.bank_app || 0),
    by_method: payments?.by_method || [],
    by_provider: payments?.by_provider || [],
  };
};

const demoPaymentSplit = () => {
  const split = createPaymentSplit();
  [
    ["Cash", 718_000, "cash"],
    ["Bank card terminal", 213_000, "bank_card"],
    ["Qi Card", 45_000, "qi_card"],
    ["Generic QR", 92_000, "generic_qr"],
    ["Zain Cash", 52_000, "zain_cash"],
    ["FIB", 84_000, "fib"],
    ["NassWallet", 28_000, "nass_wallet"],
    ["FastPay", 24_000, "fastpay"],
    ["Manual bank transfer", 28_000, "manual_bank_transfer"],
  ].forEach(([method, amount, provider]) => addPaymentToSplit(split, method, amount, provider));
  return finalizePaymentSplit(split);
};

const paymentCategoryLabel = (category) => ({
  cash: "Cash",
  card: "Card",
  qr: "QR",
  mobile_wallet: "Wallet",
  bank_app: "Bank app",
  manual_digital: "Manual",
  digital_other: "Other",
}[category] || "Digital");

const paymentGatewayRows = (payments) => {
  const byProvider = new Map(PAYMENT_GATEWAY_PROVIDERS.map((provider) => [
    provider.id,
    { ...provider, provider: provider.id, amount: 0 },
  ]));
  (payments?.by_provider || []).forEach((row) => {
    const providerId = row.provider || row.id;
    if (!providerId) return;
    const provider = byProvider.get(providerId) || PAYMENT_GATEWAY_BY_ID[providerId] || {
      id: providerId,
      provider: providerId,
      label: row.label || providerId,
      category: row.category || "digital_other",
      settlement: row.settlement || "gateway_batch",
    };
    byProvider.set(providerId, {
      ...provider,
      provider: providerId,
      label: row.label || provider.label,
      category: row.category || provider.category,
      settlement: row.settlement || provider.settlement,
      amount: Number(row.amount || 0),
    });
  });
  return [
    "zain_cash",
    "fib",
    "qi_card",
    "nass_wallet",
    "fastpay",
    "asia_hawala",
    "bank_card",
    "generic_qr",
    "manual_bank_transfer",
    "other_digital",
  ].map((id) => byProvider.get(id)).filter(Boolean);
};

const odooPaymentSplit = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const summaryPayments = snapshot?.summary?.payments;
  if (summaryPayments) return normalizePaymentSplit(summaryPayments);
  const payments = snapshot?.today?.payments || [];
  if (!payments.length) return null;
  const split = createPaymentSplit();
  payments.forEach((payment) => addPaymentToSplit(split, payment.method, payment.amount, payment.provider));
  return finalizePaymentSplit(split);
};

const odooTransferRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.transfers || [];
  if (!rows.length) return canUseDemoFallback(bootstrap) ? MOCK.pendingTransfers : [];
  return rows.slice(0, 12).map((transfer) => ({
    id: transfer.name || `PICK-${transfer.id}`,
    from: transfer.from || "Central Warehouse",
    to: transfer.toKioskId || transfer.to || "Kiosk",
    toKioskId: transfer.toKioskId || transfer.to_kiosk_id || transfer.kiosk || "",
    items: transfer.lines?.length
      ? transfer.lines.slice(0, 2).map((line) => `${line.product} x ${Number(line.qty || 0).toLocaleString("en", { maximumFractionDigits: 2 })}`).join(", ")
      : `${transfer.items || 0} items`,
    lines: transfer.lines || [],
    eta: transfer.scheduledAt ? String(transfer.scheduledAt).slice(11, 16) : "--:--",
    status: transfer.bayaan_state || transfer.bayaanState || transfer.state || "draft",
    engineState: transfer.state || "draft",
  }));
};

const transferQtyValue = (qty) => Number(String(qty ?? 0).replace(/,/g, "").match(/[\d.]+/)?.[0] ?? 0);
const transferQtyUnit = (qty) => String(qty ?? "").replace(/^[\d.,\s]+/, "").trim();
const transferKioskId = (value) => String(value || "").match(/K-\d+/)?.[0] || String(value || "");

const odooTransferSuggestionRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.suggested_transfers || [];
  if (!rows.length && !canUseDemoFallback(bootstrap)) return [];
  if (!rows.length) return MOCK.transferSuggestions.map((row) => ({
    ...row,
    kioskId: transferKioskId(row.kiosk),
    itemId: row.item,
    qtyValue: transferQtyValue(row.qty),
    uom: transferQtyUnit(row.qty),
  }));
  return rows.slice(0, 12).map((row) => ({
    kiosk: row.kioskName ? `${row.kiosk} ${row.kioskName}` : row.kiosk || "Kiosk",
    kioskId: row.kiosk || "",
    item: row.item || "Stock item",
    itemId: row.item || "Stock item",
    qty: `${Number(row.qty || 0).toLocaleString("en", { maximumFractionDigits: 2 })} ${row.uom || ""}`.trim(),
    qtyValue: Number(row.qty || 0),
    uom: row.uom || "",
    cover: row.cover || "<1 day",
    reason: row.reason || "below safety stock",
  }));
};

const demoRecipeMarginRows = () => ([
  { product: "Orange Juice 350ml", version: "v4 - effective today", ingredients: "Orange 0.35kg, sugar 0.01kg, cup, straw", price: 7_500, cost: 2_180, margin: "70.9%", status: "active" },
  { product: "Iced Spanish", version: "v2 - Apr 22", ingredients: "Espresso, milk, condensed milk, cup, lid", price: 9_000, cost: 3_060, margin: "66.0%", status: "active" },
  { product: "Pistachio Cake", version: "v3 - supplier watch", ingredients: "Cake slice, pistachio paste 12g, plate, fork", price: 11_000, cost: 5_740, margin: "47.8%", status: "watch" },
  { product: "Croissant - Plain", version: "finished SKU", ingredients: "Finished stock move only", price: 4_000, cost: 1_600, margin: "60.0%", status: "finished" },
]);

const odooRecipeMarginRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const recipes = snapshot?.recipes || [];
  if (!recipes.length) return canUseDemoFallback(bootstrap) ? demoRecipeMarginRows() : [];
  const products = snapshot?.products || [];
  return recipes.slice(0, 12).map((recipe) => {
    const product = products.find((row) => matchesItem(row.default_code || row.name, recipe.product_code || recipe.product));
    const price = Number(product?.list_price || 0);
    const cost = Number(recipe.estimated_unit_cost || 0);
    const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
    return {
      product: recipe.product || "Product",
      version: `${recipe.version || "v1"} - ${recipe.state || "draft"}`,
      ingredients: recipe.lines?.length
        ? recipe.lines.map((line) => `${line.ingredient} ${Number(line.qty || 0).toLocaleString("en", { maximumFractionDigits: 3 })}${line.uom ? ` ${line.uom}` : ""}`).join(", ")
        : "No recipe lines",
      price,
      cost,
      margin: price > 0 ? `${marginPct.toFixed(1)}%` : "-",
      status: recipe.state === "active" ? "active" : "watch",
    };
  });
};

const productCategoryLabel = (category = "", mode = "") => {
  const text = String(category || "").split("/").pop()?.trim();
  if (text && text !== "All") return text;
  if (mode === "recipe") return "Recipe products";
  if (mode === "hybrid") return "Hybrid products";
  if (mode === "finished") return "Finished goods";
  return "Products";
};

const odooProductCatalogRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.products || [];
  if (!rows.length) return canUseDemoFallback(bootstrap) ? null : [];
  return rows
    .filter((product) => product.available_in_pos || ["recipe", "finished", "hybrid"].includes(product.consumption_mode))
    .map((product, index) => ({
      id: product.id || index + 1,
      odooId: product.id,
      code: product.default_code || "",
      category: productCategoryLabel(product.category, product.consumption_mode),
      name: cleanDisplayName(product.name || product.default_code || "Product"),
      image: slugify(product.default_code || product.name || `product-${product.id || index}`),
      price: Number(product.list_price || 0),
      standardPrice: Number(product.standard_price || 0),
      sizes: ["S"],
      consumptionMode: product.consumption_mode || "finished",
      availableInPos: Boolean(product.available_in_pos),
      uom: product.uom || "Units",
    }));
};

const odooIngredientOptions = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.products || [];
  if (!rows.length && canUseDemoFallback(bootstrap)) {
    return MOCK.inventory.map((it) => ({ value: it.item, label: it.item, unit: it.unit }));
  }
  return rows
    .filter((product) => !product.available_in_pos || !["recipe", "hybrid"].includes(product.consumption_mode))
    .map((product) => ({
      value: product.default_code || product.name,
      label: cleanDisplayName(product.name || product.default_code),
      unit: product.uom || "Units",
    }))
    .filter((option) => option.value);
};

const odooPosMenu = (bootstrap) => {
  const products = (odooProductCatalogRows(bootstrap) || []).filter((product) => product.availableInPos);
  const groups = new Map();
  products.forEach((product) => {
    const category = product.category || "Products";
    if (!groups.has(category)) groups.set(category, { cat: category, items: [] });
    groups.get(category).items.push({
      id: product.code || product.name,
      name: product.name,
      image: product.image,
      price: product.price,
      sizes: product.sizes?.length ? product.sizes : ["S"],
    });
  });
  return Array.from(groups.values()).filter((group) => group.items.length > 0);
};

const odooPurchaseOrderRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.purchase_orders || [];
  if (!rows.length) {
    return canUseDemoFallback(bootstrap) ? [
      { po: "PO-2026-0509-007", supplier: "Baghdad Dairy", invoice: "INV-BD-501", warehouse: DEFAULT_WAREHOUSE_NAME, items: "Milk, cream, yogurt", value: 2_950_000, status: "created" },
      { po: "PO-2026-0509-008", supplier: "Mesopotamia Foods", invoice: "INV-MF-118", warehouse: DEFAULT_WAREHOUSE_NAME, items: "Pistachio paste 50 kg", value: 11_125_000, status: "created" },
      { po: "PO-2026-0509-009", supplier: "Najaf Fresh", invoice: "INV-NF-772", warehouse: "Baghdad Area Warehouse", items: "Oranges, lemons, mint", value: 1_840_000, status: "received" },
    ] : [];
  }
  return rows.slice(0, 12).map((order) => ({
    po: order.name || `PO-${order.id}`,
    supplier: order.supplier || "Supplier",
    invoice: order.invoice || order.vendor_bill || order.vendorBill || "-",
    warehouse: order.warehouse || order.receiving_warehouse || "",
    items: order.lines?.length
      ? order.lines.slice(0, 3).map((line) => line.product).join(", ")
      : "No lines",
    value: Number(order.amount_total || 0),
    status: order.receipt_state === "done" ? "received" : "created",
    receiptState: order.receipt_state || "none",
  }));
};

const odooSupplierRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.suppliers || [];
  if (!rows.length) return canUseDemoFallback(bootstrap) ? MOCK.suppliers : [];
  return rows.slice(0, 100).map((supplier) => ({
    id: supplier.id,
    name: supplier.name || "Supplier",
    category: supplier.category || "Supplier",
    address: supplier.address || "",
    deliveryCategory: supplier.deliveryCategory || supplier.delivery_category || "Review",
    spend30: Number(supplier.spend30 || 0),
    lastOrder: supplier.lastOrder || supplier.last_order || "-",
    status: supplier.status || "good",
  }));
};

const odooRecurringPurchaseRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.recurring_purchases || [];
  if (!rows.length) return [];
  const weekdayLabel = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    supplier: row.supplier,
    warehouse: row.warehouse,
    frequency: row.frequency,
    weekday: weekdayLabel[Number(row.weekday || 0)] || row.weekday,
    nextDate: row.nextDate,
    items: row.lines?.map((line) => `${line.product} x ${line.qty}`).join(", ") || "No lines",
    active: row.active,
  }));
};

const DEFAULT_WAREHOUSE_NAME = "Main Warehouse";

const tomorrowIsoDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

const estimatePurchaseRate = (item) => {
  const name = String(item?.item || item || "").toLowerCase();
  if (name.includes("pistachio")) return 222_500;
  if (name.includes("milk")) return 14_000;
  if (name.includes("cup")) return 700;
  if (name.includes("mint")) return 175_000;
  if (name.includes("lemon")) return 14_000;
  if (name.includes("orange")) return 70_000;
  if (name.includes("bean")) return 18_000;
  if (name.includes("syrup")) return 11_000;
  if (name.includes("croissant")) return 7_000;
  return 7_500;
};

const reorderQtyFor = (item) => (
  Math.max(Number(item?.reorder || 0) * 2 - Number(item?.stock || 0), Number(item?.reorder || 0), 1)
);

const purchaseLineFromInventory = (item) => ({
  item: item?.item || "",
  qty: Math.round(reorderQtyFor(item) * 100) / 100,
  unit: item?.unit || "",
  rate: estimatePurchaseRate(item),
});

const purchaseLineTotal = (line) => Number(line.qty || 0) * Number(line.rate || 0);
const purchaseTotal = (lines) => Math.round((lines || []).reduce((sum, line) => sum + purchaseLineTotal(line), 0));
const purchaseLineSummary = (lines) => (lines || [])
  .filter((line) => line.item)
  .map((line) => `${line.item} ${Number(line.qty || 0).toLocaleString("en", { maximumFractionDigits: 2 })}${line.unit ? ` ${line.unit}` : ""}`)
  .join(", ");

const purchaseStatusClass = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (["done", "received"].includes(normalized)) return "badge-pos";
  if (["created", "draft", "receiving", "purchase", "approved"].includes(normalized)) return "badge-warn";
  if (["cancel", "cancelled", "rejected"].includes(normalized)) return "badge-crit";
  return "";
};

const nextPurchaseAction = (status) => {
  const normalized = String(status || "created").toLowerCase();
  if (["created", "draft", "approved", "purchase"].includes(normalized)) return { label: "Receive", action: "receive", next: "received" };
  if (normalized === "receiving") return { label: "Complete", action: "receive", next: "received" };
  return null;
};

const nextTransferAction = (status) => {
  const normalized = String(status || "draft").toLowerCase();
  if (normalized === "draft") return { label: "Approve", action: "approve", next: "approved" };
  if (normalized === "approved" || normalized === "confirmed" || normalized === "waiting") return { label: "Pick", action: "pick", next: "picked" };
  if (normalized === "picked") return { label: "Dispatch", action: "dispatch", next: "dispatched" };
  return null;
};

const isDispatchedTransfer = (status) => String(status || "").toLowerCase() === "dispatched";
const isReceivedTransfer = (status) => ["received", "done"].includes(String(status || "").toLowerCase());

const transferStatusClass = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (isReceivedTransfer(normalized)) return "badge-pos";
  if (["cancel", "cancelled", "rejected"].includes(normalized)) return "badge-crit";
  if (["draft", "approved", "picked", "dispatched", "confirmed", "waiting"].includes(normalized)) return "badge-warn";
  return "";
};

const odooCashierPerformanceRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const orders = snapshot?.today?.orders || [];
  if (!orders.length) {
    return canUseDemoFallback(bootstrap) ? [
      { name: "Maya Ahmed", kiosk: "K-01", sales: 6_447_000, shortage: 0, voidRefund: "3 / 1" },
      { name: "Yusuf Saleh", kiosk: "K-02", sales: 7_469_000, shortage: -84_000, voidRefund: "8 / 2" },
      { name: "Karim Fahmy", kiosk: "K-09", sales: 3_353_000, shortage: -32_000, voidRefund: "14 / 3" },
      { name: "Sara Younis", kiosk: "K-04", sales: 4_239_000, shortage: null, voidRefund: "4 / 1" },
    ] : [];
  }

  const byCashier = {};
  orders.forEach((order) => {
    const cashier = order.cashier || "Unassigned";
    byCashier[cashier] = byCashier[cashier] || { name: cashier, kiosk: order.kiosk || order.pos_config || "-", sales: 0, shortage: 0, voids: 0, refunds: 0 };
    byCashier[cashier].sales += Number(order.amount_total || 0);
    const state = String(order.state || "").toLowerCase();
    if (state.includes("void") || state.includes("cancel")) byCashier[cashier].voids += 1;
    if (state.includes("refund")) byCashier[cashier].refunds += 1;
  });

  (snapshot.closings || []).forEach((close) => {
    const cashier = close.cashier || "Unassigned";
    if (!byCashier[cashier]) return;
    byCashier[cashier].shortage += Number(close.cashVariance || 0);
  });

  return Object.values(byCashier).slice(0, 12).map((row) => ({
    ...row,
    shortage: row.shortage || 0,
    voidRefund: `${row.voids} / ${row.refunds}`,
  }));
};

const HR_ROLE_OPTIONS = ["Cashier", "Barista", "Supervisor", "Warehouse", "Manager", "Accountant", "Other"];
const HR_ROLE_LABELS = {
  any: "Any role",
  cashier: "Cashier",
  barista: "Barista",
  supervisor: "Supervisor",
  warehouse: "Warehouse",
  manager: "Manager",
  accountant: "Accountant",
  other: "Other",
};
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const normalizeHrRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "operations mgr") return "manager";
  if (normalized === "any role" || normalized === "all") return "any";
  return HR_ROLE_LABELS[normalized] ? normalized : "other";
};

const hrRoleLabel = (role) => HR_ROLE_LABELS[normalizeHrRole(role)] || "Other";

const odooHrSnapshot = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  return snapshot?.hr || { employees: [], attendance: [], coverageRules: [], shifts: [], coverageGaps: [], summary: {} };
};

const staffRowsFromHrEmployees = (employees = []) => (
  employees.map((person) => ({
    id: person.id,
    name: person.name,
    role: hrRoleLabel(person.role),
    roleValue: normalizeHrRole(person.role),
    kiosk: person.kiosk || "Central",
    kioskName: person.kioskName || person.kiosk || "Central",
    hours: Math.round(Number(person.expectedMonthlyHours || 0)),
    salary: Number(person.monthlySalary || 0),
    hourlyRate: Number(person.hourlyRate || 0),
    status: person.active === false ? "leave" : "active",
    odooEmployeeId: person.odooEmployeeId,
  }))
);

const odooStaffRows = (bootstrap) => staffRowsFromHrEmployees(odooHrSnapshot(bootstrap).employees || []);

const hourToTime = (value) => {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const timeToHour = (value) => {
  const [hours, minutes = "0"] = String(value || "0:00").split(":");
  return Number(hours || 0) + Number(minutes || 0) / 60;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const odooWasteRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.today?.waste || [];
  if (!rows.length) return canUseDemoFallback(bootstrap) ? MOCK.waste : [];
  return rows.slice(0, 50).map((row, index) => ({
    id: `${row.kiosk || "waste"}-${index}`,
    kiosk: row.kiosk || "POS kiosk",
    item: row.product || row.item || "Waste item",
    qty: Number(row.qty || 0),
    cost: Number(row.estimated_cost || 0),
    reason: row.reason || row.state || "Recorded waste",
    time: row.create_date ? String(row.create_date).slice(11, 16) : "--:--",
    flagged: Number(row.estimated_cost || 0) > 50_000 || row.reason === "unknown_loss",
  }));
};

const paymentMethodSignal = (payments) => {
  const rows = [
    ["cash", payments?.cash],
    ["card", payments?.card],
    ["QR", payments?.qr],
    ["wallet", payments?.mobile_wallet],
    ["bank app", payments?.bank_app],
    ["manual digital", payments?.manual_digital],
  ]
    .filter(([, amount]) => Number(amount || 0) > 0)
    .map(([label, amount]) => `${fmtMoneyShort(Number(amount || 0))} ${label}`);
  if (rows.length) return rows.slice(0, 4).join(" / ");
  if (payments) return `${fmtMoneyShort(Number(payments.cash || 0))} cash / ${fmtMoneyShort(Number(payments.digital || 0))} digital`;
  return "cash/digital split";
};

const paymentMethodRows = (payments) => ([
  ["Cash", Number(payments?.cash || 0)],
  ["Card", Number(payments?.card || 0)],
  ["QR", Number(payments?.qr || 0)],
  ["Mobile wallet", Number(payments?.mobile_wallet || 0)],
  ["Bank app", Number(payments?.bank_app || 0)],
  ["Manual digital", Number(payments?.manual_digital || 0)],
  ["Other digital", Number(payments?.digital_other || 0)],
]);

const insightSourceMeta = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const summary = odooSummary(bootstrap);
  const counts = summary?.sourceCounts;
  if (!counts) {
    if (isLiveOnlyPayload(bootstrap)) {
      return {
        live: true,
        empty: true,
        cite: "0 verified rows loaded",
        header: "Live engine only",
        budget: "AI disabled until verified source rows exist",
        chips: [
          ["orders", 0],
          ["stock", 0],
          ["waste", 0],
        ],
      };
    }
    return {
      live: false,
      cite: `${SCENES.default.cards.length} demo cards`,
      header: "Demo source rows",
      budget: "Daily summaries tier - 18% monthly budget used",
      chips: [
        ["orders", MOCK.posOrders.length],
        ["stock", MOCK.kioskStockDetails["K-01"]?.length || 0],
        ["waste", MOCK.waste.length],
      ],
    };
  }
  const rows = snapshot?.meta?.rows_returned;
  return {
    live: true,
    cite: `${counts.orders || 0} orders, ${counts.consumptionRows || 0} ledger rows, ${counts.closingRows || 0} closes`,
    header: "Verified aggregate sources",
    budget: "Daily summaries tier - compact aggregate snapshot",
    window: rows
      ? `Drill-down window: ${rows.orders || 0} orders, ${rows.consumption || 0} ledger, ${rows.waste || 0} waste rows returned`
      : "Drill-down window capped by server limits",
    chips: [
      ["orders", counts.orders || 0],
      ["payments", counts.payments || 0],
      ["ledger", counts.consumptionRows || 0],
      ["waste", counts.wasteRows || 0],
      ["closes", counts.closingRows || 0],
    ],
  };
};

const payrollExpenseForPeriod = (period = "Daily") => {
  const monthlyPayroll = MOCK.staff.reduce((sum, person) => sum + Number(person.salary || 0), 0);
  const key = String(period || "Daily").toLowerCase();
  if (key === "yearly") return monthlyPayroll * 12;
  if (key === "monthly") return monthlyPayroll;
  if (key === "weekly") return Math.round(monthlyPayroll / 4.33);
  return Math.round(monthlyPayroll / 30);
};

const odooReportMetrics = (bootstrap, period = "Daily") => {
  const snapshot = unwrapOdoo(bootstrap);
  const summary = odooSummary(bootstrap);
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const periodKey = String(period || "Daily").toLowerCase();
  const periodSummary = summary?.reportPeriods?.[periodKey];
  if (periodSummary) {
    const payments = periodSummary.payments || { cash: 0, digital: 0 };
    return {
      revenue: Number(periodSummary.revenue || 0),
      cogs: Number(periodSummary.cogs || 0),
      waste: Number(periodSummary.wasteCost || 0),
      payroll: Number(periodSummary.payrollExpense || (liveOnly ? 0 : payrollExpenseForPeriod(period))),
      netProfit: Math.max(0, Number(periodSummary.netProfit || 0)),
      cash: Number(periodSummary.cashExpected || payments.cash || 0),
      digital: Number(periodSummary.digitalPayments || payments.digital || 0),
      paymentSignal: paymentMethodSignal(payments),
      paymentRows: paymentMethodRows(payments),
      gatewayRows: paymentGatewayRows(payments),
      sourceCounts: periodSummary.sourceCounts || {},
    };
  }
  if (summary?.totals) {
    const payments = summary.payments || { cash: 0, digital: 0 };
    return {
      revenue: Number(summary.totals.salesToday || 0),
      cogs: Number(summary.totals.cogs || 0),
      waste: Number(summary.totals.wasteCost || 0),
      payroll: Number(summary.totals.payrollExpense || (liveOnly ? 0 : payrollExpenseForPeriod(period))),
      netProfit: Math.max(0, Number(summary.totals.profitEstimate || 0)),
      cash: Number(payments.cash || 0),
      digital: Number(payments.digital || 0),
      paymentSignal: paymentMethodSignal(payments),
      paymentRows: paymentMethodRows(payments),
      gatewayRows: paymentGatewayRows(payments),
      sourceCounts: summary.sourceCounts || {},
    };
  }
  const orders = snapshot?.today?.orders || [];
  if (!orders.length && liveOnly) {
    const emptyPayments = finalizePaymentSplit(createPaymentSplit());
    return {
      revenue: 0,
      cogs: 0,
      waste: 0,
      payroll: 0,
      netProfit: 0,
      cash: 0,
      digital: 0,
      paymentSignal: "no verified payments",
      paymentRows: paymentMethodRows(emptyPayments),
      gatewayRows: paymentGatewayRows(emptyPayments),
      sourceCounts: { orders: 0, payments: 0, consumptionRows: 0, wasteRows: 0, closingRows: 0 },
    };
  }
  if (!orders.length) {
    const demoPayments = demoPaymentSplit();
    return {
      revenue: 1_284_000,
      cogs: 489_000,
      waste: 10_240,
      payroll: payrollExpenseForPeriod(period),
      netProfit: 326_000,
      cash: demoPayments.cash,
      digital: demoPayments.digital,
      paymentSignal: paymentMethodSignal(demoPayments),
      paymentRows: paymentMethodRows(demoPayments),
      gatewayRows: paymentGatewayRows(demoPayments),
      sourceCounts: { orders: 3142, payments: 3142, consumptionRows: 11420, wasteRows: 178, closingRows: 5 },
    };
  }

  const revenue = orders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0);
  const cogs = (snapshot.today?.consumption || []).reduce((sum, row) => sum + Number(row.cost || 0), 0);
  const waste = (snapshot.today?.waste || []).reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
  const payments = odooPaymentSplit(bootstrap) || { cash: 0, digital: 0 };
  return {
    revenue,
    cogs,
    waste,
    payroll: payrollExpenseForPeriod(period),
    netProfit: Math.max(0, revenue - cogs - waste),
    cash: payments.cash,
    digital: payments.digital,
    paymentSignal: paymentMethodSignal(payments),
    paymentRows: paymentMethodRows(payments),
    gatewayRows: paymentGatewayRows(payments),
    sourceCounts: {
      orders: orders.length,
      payments: (snapshot.today?.payments || []).length,
      consumptionRows: (snapshot.today?.consumption || []).length,
      wasteRows: (snapshot.today?.waste || []).length,
      closingRows: (snapshot.closings || []).length,
    },
  };
};

// ---------- Export ----------
const csvCell = (value) => {
  const raw = value == null ? "" : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

const csvRows = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\n");

const safeFileSegment = (value) => (
  String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report"
);

const exportManagementReportPack = (period, metrics, sourceMeta) => {
  const sourceCounts = metrics.sourceCounts || {};
  const margin = metrics.revenue ? `${((metrics.netProfit / metrics.revenue) * 100).toFixed(1)}%` : "0.0%";
  const grossProfit = metrics.revenue - metrics.cogs;
  const generatedAt = new Date().toISOString();
  const rows = [
    ["Section", "Metric", "Value", "Traceable source"],
    ["Traceability", "Generated at (UTC)", generatedAt, "client timestamp"],
    ...(sourceMeta?.header ? [["Traceability", "Source snapshot", sourceMeta.header, "bayaan.api.chain_bootstrap meta"]] : []),
    ...(sourceMeta?.cite ? [["Traceability", "Source cite", sourceMeta.cite, "summary.sourceCounts"]] : []),
    ...(sourceMeta?.window ? [["Traceability", "Drill-down window", sourceMeta.window, "bootstrap.meta.rows_returned"]] : []),
    ["Summary", "Period", period, "summary.reportPeriods"],
    ["Summary", "Revenue", Math.round(metrics.revenue), "pos.order"],
    ["Summary", "COGS", Math.round(metrics.cogs), "bayaan.consumption.ledger"],
    ["Summary", "Gross profit", Math.round(grossProfit), "pos.order + bayaan.consumption.ledger"],
    ["Summary", "Waste and loss", Math.round(metrics.waste), "bayaan.waste.entry + bayaan.shift.close"],
    ["Summary", "Payroll", Math.round(metrics.payroll || 0), "HR payroll schedule"],
    ["Summary", "Net profit after payroll", Math.max(0, Math.round(Number(metrics.netProfit || 0) - Number(metrics.payroll || 0))), "deterministic report aggregate + HR payroll schedule"],
    ["Summary", "Net margin", margin, "deterministic report aggregate"],
    ["Summary", "Cash expected", Math.round(metrics.cash || 0), "pos.payment cash"],
    ["Summary", "Digital payments", Math.round(metrics.digital || 0), "pos.payment non-cash"],
    ["Payment method", "Cash", Math.round(metrics.cash || 0), "pos.payment"],
    ["Payment method", "Digital total", Math.round(metrics.digital || 0), "pos.payment"],
    ...((metrics.paymentRows || []).map(([label, amount]) => [
      "Payment method",
      label,
      Math.round(amount || 0),
      "pos.payment",
    ])),
    ...((metrics.gatewayRows || []).map((row) => [
      "Payment gateway",
      row.label,
      Math.round(row.amount || 0),
      "pos.payment.method.bayaan_gateway_provider",
    ])),
    ["Traceability", "Orders", sourceCounts.orders || 0, "pos.order"],
    ["Traceability", "Payments", sourceCounts.payments || 0, "pos.payment"],
    ["Traceability", "Consumption rows", sourceCounts.consumptionRows || 0, "bayaan.consumption.ledger"],
    ["Traceability", "Waste rows", sourceCounts.wasteRows || 0, "bayaan.waste.entry"],
    ["Traceability", "Closing rows", sourceCounts.closingRows || 0, "bayaan.shift.close"],
  ];
  const filename = `bayaan-${safeFileSegment(period)}-management-report-${new Date().toISOString().slice(0, 10)}.csv`;
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return filename;
  const blob = new Blob(["\ufeff" + csvRows(rows)], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return filename;
};


/* ===== screens/overview.jsx ===== */

/* ============================================================
   Admin screen — OVERVIEW (command center)
   ============================================================ */

// =============== OVERVIEW + AI INSIGHTS ===============
// Ports of:
//   design/exact-pos-v2/kiosk-pos/project/screens/overview.jsx
//   design/exact-pos-v2/kiosk-pos/project/screens/insights.jsx
// (Claude Design handoff bundle — see design/exact-pos-v2/kiosk-pos/README.md)
// Note: useState/useEffect/useRef/useMemo are already destructured at module scope
// up at line ~648 alongside the shared UI primitives — only add what's missing.
const { useLayoutEffect } = React;
const { useState: useStateIns, useEffect: useEffectIns, useRef: useRefIns, useMemo: useMemoIns } = React;
const { useLayoutEffect: useLayoutEffectOv, useRef: useRefOv } = React;

/* ============================================================
   Admin screen — OVERVIEW
   Always-on realtime operations terminal.
   - All rank lists animate physical swaps via FLIP technique
   - Numbers tick smoothly (no instant flashes)
   - Live activity stream prepends new events
   - Designed to be left running on a wall display
   ============================================================ */

// ---------- Currency helper — overview uses whatever data holds ----------
const fmtIQD = (n) => "IQD " + Math.round(n).toLocaleString("en");
const fmtCompact = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
};

// ---------- Smooth ticker number — interpolates value changes ----------
function TickerNum({ value, format = (v) => v.toLocaleString("en"), duration = 700, className, style }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === toRef.current) return;
    fromRef.current = display;
    toRef.current = value;
    startRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span className={className} style={style}>{format(display)}</span>;
}

// ---------- Live clock (HH:MM:SS) ----------
function LiveClock({ style }) {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <span className="t-num" style={{ fontFamily: "var(--font-mono)", ...style }}>
      {pad(t.getHours())}:{pad(t.getMinutes())}:<span style={{ opacity: 0.55 }}>{pad(t.getSeconds())}</span>
    </span>
  );
}

// ---------- Live pulse dot ----------
function PulseDot({ color = "var(--pos)", size = 6 }) {
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }}/>
      <span style={{
        position: "absolute", inset: -size * 0.6, borderRadius: "50%", background: color,
        opacity: 0.35, animation: "ovPulse 1.6s ease-out infinite",
      }}/>
    </span>
  );
}

// ============================================================
// FLIP-based animated rank list
// ============================================================
function RankList({ items, renderRow, rowHeight = 44, gap = 4, emptyHint }) {
  const containerRef = useRef(null);
  const positionsRef = useRef({}); // id -> top
  const prevRanksRef = useRef({}); // id -> idx (for direction detection)

  useLayoutEffectOv(() => {
    if (!containerRef.current) return;
    const children = containerRef.current.children;
    const newPositions = {};
    const els = {};
    Array.from(children).forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      els[id] = el;
      newPositions[id] = el.offsetTop;
    });

    // FLIP animate
    Object.keys(els).forEach((id) => {
      const el = els[id];
      const prevTop = positionsRef.current[id];
      const newTop = newPositions[id];
      if (prevTop != null && prevTop !== newTop) {
        const dy = prevTop - newTop;
        // Direction → tag for visual emphasis
        const newRank = items.findIndex((it) => it.id === id);
        const prevRank = prevRanksRef.current[id];
        const dir = prevRank != null && newRank < prevRank ? "up" : "down";

        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        el.style.zIndex = "2";
        // Apply a brief highlight class
        el.dataset.swapDir = dir;
        // force reflow
        void el.offsetHeight;
        requestAnimationFrame(() => {
          el.style.transition = "transform 720ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
          // Clear dir / zIndex after the animation
          setTimeout(() => {
            if (!el) return;
            el.style.zIndex = "";
            delete el.dataset.swapDir;
          }, 760);
        });
      }
    });

    positionsRef.current = newPositions;
    items.forEach((it, idx) => { prevRanksRef.current[it.id] = idx; });
  });

  if (!items.length) {
    return <div className="t-small subtle" style={{ padding: "12px 4px" }}>{emptyHint}</div>;
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap }}>
      {items.map((it, idx) => (
        <div key={it.id} data-id={it.id}
          style={{
            position: "relative",
            minHeight: rowHeight,
            willChange: "transform",
          }}
        >
          {renderRow(it, idx)}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Sliding live activity feed (new items push old ones down)
// ============================================================
function LiveFeed({ events, maxRows = 9, ar }) {
  const containerRef = useRef(null);
  const prevTopsRef = useRef({});
  const knownIdsRef = useRef(new Set());

  useLayoutEffectOv(() => {
    if (!containerRef.current) return;
    const children = containerRef.current.children;
    const newTops = {};
    Array.from(children).forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      newTops[id] = el.offsetTop;

      // New entry → fade + slide in
      if (!knownIdsRef.current.has(id)) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(-12px)";
        void el.offsetHeight;
        requestAnimationFrame(() => {
          el.style.transition = "opacity 420ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.opacity = "1";
          el.style.transform = "";
        });
        knownIdsRef.current.add(id);
      } else {
        // Existing entry that shifted down → FLIP
        const prev = prevTopsRef.current[id];
        const curr = newTops[id];
        if (prev != null && prev !== curr) {
          const dy = prev - curr;
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          void el.offsetHeight;
          requestAnimationFrame(() => {
            el.style.transition = "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)";
            el.style.transform = "";
          });
        }
      }
    });
    prevTopsRef.current = newTops;
  });

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={ar ? "تدفق المبيعات المباشر" : "Live sales stream"}
      style={{ position: "relative" }}
    >
      {events.slice(0, maxRows).map((e, i) => {
        const fade = Math.max(0.35, 1 - (i / maxRows) * 0.7);
        return (
          <div key={e.id} data-id={e.id} style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 12,
            padding: "9px 14px",
            borderBottom: i < Math.min(events.length, maxRows) - 1 ? "1px solid var(--line-soft)" : 0,
            opacity: fade,
            willChange: "transform, opacity",
          }}>
            <span className="t-num" style={{
              fontSize: 10.5, color: "var(--ink-3)",
              padding: "2px 6px", border: "1px solid var(--line)",
              borderRadius: 3, background: "var(--surface-2)",
              fontFamily: "var(--font-mono)", letterSpacing: "0.02em"
            }}>{e.kid}</span>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.item}
              </div>
              <div className="t-small subtle" style={{ fontSize: 10.5 }}>
                {e.kiosk} - {e.ago}
              </div>
            </div>
            <span className="t-num" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ink-1)" }}>
              {fmtIQD(e.amount).replace("IQD ", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Hourly pulse - current hour bar pulses; data ticks live
// ============================================================
function HourlyPulse({ data, currentHour }) {
  const yMax = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
      {data.map((v, i) => {
        const h = (v / yMax) * 100;
        const isCurr = i === currentHour;
        const isPast = i < currentHour;
        return (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(3, h)}%`,
            background: isCurr ? "var(--ink)" : isPast ? "var(--ink-2)" : "var(--line-strong)",
            opacity: isCurr ? 1 : isPast ? 0.7 : 1,
            borderRadius: 1,
            position: "relative",
            transition: "height 600ms ease",
          }}>
            {isCurr && (
              <span style={{
                position: "absolute", inset: 0, borderRadius: 1,
                background: "var(--ink)", opacity: 0.35,
                animation: "ovBarPulse 1.8s ease-in-out infinite",
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Status / direction marker for rank rows
// ============================================================
function RankIndicator({ rank }) {
  return (
    <span className="t-num" style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10.5, color: "var(--ink-3)",
      width: 22, textAlign: "end",
      letterSpacing: "0.02em",
    }}>#{rank + 1}</span>
  );
}

// ============================================================
// Main screen
// ============================================================
function OverviewScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const sourceKiosks = useMemo(() => odooKioskRows(bootstrap), [bootstrap]);
  const closeRows = useMemo(() => odooClosingRows(bootstrap), [bootstrap]);
  const paymentSplit = useMemo(() => odooPaymentSplit(bootstrap), [bootstrap]);
  const summary = useMemo(() => odooSummary(bootstrap), [bootstrap]);
  const liveProductRows = useMemo(() => {
    if (!liveOnly) return [];
    const snapshot = unwrapOdoo(bootstrap);
    const byProduct = new Map();
    (snapshot?.today?.orders || []).forEach((order) => {
      (order.lines || []).forEach((line) => {
        const name = cleanDisplayName(line.product || line.name || "POS item");
        const current = byProduct.get(name) || { id: `live-product-${byProduct.size}`, name, cat: "Engine", rev: 0, qty: 0 };
        current.rev += Number(line.price_subtotal_incl || line.price_subtotal || line.amount || 0);
        current.qty += Number(line.qty || 0);
        byProduct.set(name, current);
      });
    });
    return Array.from(byProduct.values()).sort((a, b) => b.rev - a.rev).slice(0, 8);
  }, [bootstrap, liveOnly]);
  const liveWasteRows = useMemo(() => {
    if (!liveOnly) return [];
    return odooWasteRows(bootstrap).map((row, index) => ({
      id: `live-waste-${index}`,
      name: cleanDisplayName(row.item || "Waste item"),
      cat: row.reason || "Waste",
      cost: Number(row.cost || 0),
      qty: Number(row.qty || 0),
    }));
  }, [bootstrap, liveOnly]);
  const liveFeedRows = useMemo(() => {
    if (!liveOnly) return [];
    const snapshot = unwrapOdoo(bootstrap);
    const kioskNames = new Map(sourceKiosks.map((kiosk) => [kiosk.id, kiosk.name]));
    const now = Date.now();
    return (snapshot?.today?.orders || []).slice(0, 14).map((order, index) => {
      const firstLine = order.lines?.[0];
      const item = firstLine
        ? cleanDisplayName(firstLine.product || firstLine.name)
        : cleanDisplayName(order.name || "POS order");
      return {
        id: order.name || `live-order-${index}`,
        kid: order.kiosk || order.pos_config || "-",
        kiosk: kioskNames.get(order.kiosk) || order.kiosk || order.pos_config || "POS kiosk",
        item,
        amount: Number(order.amount_total || firstLine?.price_subtotal_incl || 0),
        ago: order.date_order ? String(order.date_order).slice(11, 16) : "synced",
        ts: now - index * 1000,
      };
    });
  }, [bootstrap, liveOnly, sourceKiosks]);

  // ---- Live state: per-kiosk metrics (revenue + stock %) ----
  const initial = useMemo(() => {
    const baseSeed = (s) => {
      // hash-ish for deterministic init
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    return sourceKiosks.map((k) => {
      const seed = baseSeed(k.id);
      // MOCK.kiosks already stores per-kiosk daily revenue in raw IQD; just add a small
      // jitter so adjacent kiosks have natural swap headroom for the rank animation.
      const rev = k.revenue + (seed % 500000);
      // initial stock %, lower for warn/crit
      const stockBase = k.status === "crit" ? 22 + (seed % 18)
                      : k.status === "warn" ? 44 + (seed % 18)
                      : 62 + (seed % 32);
      const stockItem = ["Milk, cups, oranges","Pistachio paste","Oat milk","Mint, lemons","Coffee beans","Vanilla syrup","Chocolate","Cinnamon","Sugar","Croissants"][seed % 10];
      return { ...k, liveRev: rev, liveStock: stockBase, stockItem, liveOrders: k.orders };
    });
  }, [sourceKiosks]);

  const [kiosks, setKiosks] = useState(initial);
  useEffect(() => {
    setKiosks(initial);
    setFeed(liveOnly ? liveFeedRows : seedFeed(initial));
  }, [initial, liveOnly, liveFeedRows]);

  // Live products (revenue tickers)
  const initialProducts = useMemo(() => liveOnly ? liveProductRows : ([
    { id: "p1", name: "Iced Latte",       cat: "Iced Coffee", rev: 3_690_000, qty: 415 },
    { id: "p2", name: "Iced Americano",   cat: "Iced Coffee", rev: 2_620_000, qty: 392 },
    { id: "p3", name: "Orange Juice",     cat: "Juice",       rev: 2_330_000, qty: 301 },
    { id: "p4", name: "Latte",            cat: "Hot Coffee",  rev: 2_130_000, qty: 271 },
    { id: "p5", name: "Pistachio Cake",   cat: "Cake",        rev: 1_670_000, qty: 148 },
    { id: "p6", name: "Cold Brew",        cat: "Iced Coffee", rev: 1_630_000, qty: 172 },
    { id: "p7", name: "Cappuccino",       cat: "Hot Coffee",  rev: 1_580_000, qty: 215 },
    { id: "p8", name: "Mocha",            cat: "Hot Coffee",  rev: 1_410_000, qty: 178 },
  ]), [liveOnly, liveProductRows]);
  const [products, setProducts] = useState(initialProducts);
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  // Live waste leaderboard (cost lost per item — ticks like products)
  const initialWaste = useMemo(() => liveOnly ? liveWasteRows : ([
    { id: "w1", name: "Croissant - chocolate", cat: "Bakery",      cost: 412_000, qty: 28 },
    { id: "w2", name: "Pistachio cake slice",  cat: "Cake",        cost: 384_000, qty: 18 },
    { id: "w3", name: "Iced latte",            cat: "Iced Coffee", cost: 294_000, qty: 22 },
    { id: "w4", name: "Mango juice",           cat: "Juice",       cost: 168_000, qty: 14 },
    { id: "w5", name: "Croissant - plain",     cat: "Bakery",      cost: 142_000, qty: 19 },
    { id: "w6", name: "Espresso shot",         cat: "Coffee",      cost: 84_000,  qty: 12 },
  ]), [liveOnly, liveWasteRows]);
  const [waste, setWaste] = useState(initialWaste);
  useEffect(() => {
    setWaste(initialWaste);
  }, [initialWaste]);

  // Live activity feed (rolling event stream)
  const [feed, setFeed] = useState(() => liveOnly ? liveFeedRows : seedFeed(initial));
  const eventCounterRef = useRef(1000);

  // Hourly bars — current hour ticks up
  const [hourly, setHourly] = useState(() => liveOnly
    ? Array(24).fill(0)
    : [4,3,2,2,3,8,18,32,48,52,46,58,62,55,40,32,38,46,52,58,48,32,18,8]);
  const currentHour = 14;
  useEffect(() => {
    setHourly(liveOnly
      ? Array(24).fill(0)
      : [4,3,2,2,3,8,18,32,48,52,46,58,62,55,40,32,38,46,52,58,48,32,18,8]);
  }, [liveOnly]);

  // ---- Tick: nudge metrics, occasionally trigger rank swaps ----
  useEffect(() => {
    if (liveOnly || !initial.length) return undefined;
    let alive = true;

    // Frequent tick: small revenue/orders nudges + new feed entry
    const tickFast = setInterval(() => {
      if (!alive) return;
      // append a random transaction
      const k = initial[Math.floor(Math.random() * initial.length)];
      eventCounterRef.current += 1;
      const items = [
        { name: "Iced Latte M - Pistachio Cake", amt: 19500 },
        { name: "Mocha L - Cinnamon Roll",       amt: 14000 },
        { name: "Spanish Latte M - Tiramisu",    amt: 19000 },
        { name: "Cold Brew L - Cheesecake",      amt: 19500 },
        { name: "Mango Juice L",                  amt: 8500 },
        { name: "Orange Juice L",                 amt: 9000 },
        { name: "Cappuccino L - Croissant",       amt: 16500 },
        { name: "Americano - Plain Croissant",    amt: 11000 },
        { name: "Iced Mocha - Carrot Cake",       amt: 21500 },
      ];
      const ev = items[Math.floor(Math.random() * items.length)];
      setFeed((prev) => [
        { id: "ev-" + eventCounterRef.current, kid: k.id, kiosk: k.name, item: ev.name, amount: ev.amt, ago: "now", ts: Date.now() },
        ...prev.map((e, i) => ({ ...e, ago: i === 0 ? `${1 + (Date.now() - e.ts) / 1000 | 0}s ago` : `${(Date.now() - e.ts) / 1000 | 0}s ago` })),
      ].slice(0, 14));

      // bump kiosk metrics
      setKiosks((prev) => prev.map((kk) => {
        const isWinner = kk.id === k.id;
        return {
          ...kk,
          liveRev: kk.liveRev + (isWinner ? ev.amt + 4000 : Math.random() * 3500),
          liveOrders: kk.liveOrders + (isWinner ? 1 : 0),
          // stock slowly declines, more for top-sellers
          liveStock: Math.max(8, kk.liveStock - (isWinner ? 0.18 : 0.06) + (Math.random() * 0.04 - 0.02)),
        };
      }));

      // bump products
      setProducts((prev) => prev.map((p) => ({
        ...p,
        rev: p.rev + Math.random() * 24000,
        qty: p.qty + (Math.random() < 0.4 ? 1 : 0),
      })));

      // bump waste (smaller increments — waste accrues slowly relative to sales)
      setWaste((prev) => prev.map((w) => ({
        ...w,
        cost: w.cost + Math.random() * 2400,
        qty: w.qty + (Math.random() < 0.18 ? 1 : 0),
      })));

      // bump current hour bar
      setHourly((prev) => {
        const n = [...prev];
        n[currentHour] = n[currentHour] + Math.random() * 0.4;
        return n;
      });
    }, 1800);

    // Slower tick: targeted bumps to force a rank swap somewhere
    const tickSwap = setInterval(() => {
      if (!alive) return;
      setKiosks((prev) => {
        if (prev.length < 2) return prev;
        // sort by liveRev desc so we know current ranks
        const sorted = [...prev].sort((a, b) => b.liveRev - a.liveRev);
        // pick a random adjacent pair within top 6 to swap
        const idx = Math.floor(Math.random() * Math.min(5, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.liveRev - b.liveRev;
        // give b a sudden burst that pushes it past a
        const burst = gap + 50000 + Math.random() * 80000;
        return prev.map((kk) => kk.id === b.id ? { ...kk, liveRev: kk.liveRev + burst, liveOrders: kk.liveOrders + 4 } : kk);
      });
    }, 5500);

    // Also occasionally swap restock priority (lowest stock)
    const tickStockSwap = setInterval(() => {
      if (!alive) return;
      setKiosks((prev) => {
        const sorted = [...prev].sort((a, b) => a.liveStock - b.liveStock);
        const idx = Math.floor(Math.random() * Math.min(5, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = b.liveStock - a.liveStock;
        // push b's stock below a's (a got a delivery; b consumed faster)
        return prev.map((kk) => {
          if (kk.id === b.id) return { ...kk, liveStock: Math.max(8, kk.liveStock - gap - 1.2 - Math.random() * 2) };
          if (kk.id === a.id) return { ...kk, liveStock: Math.min(96, kk.liveStock + 0.8) };
          return kk;
        });
      });
    }, 7200);

    // Occasional product swap
    const tickProdSwap = setInterval(() => {
      if (!alive) return;
      setProducts((prev) => {
        if (prev.length < 2) return prev;
        const sorted = [...prev].sort((a, b) => b.rev - a.rev);
        const idx = Math.floor(Math.random() * Math.min(4, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.rev - b.rev;
        return prev.map((p) => p.id === b.id ? { ...p, rev: p.rev + gap + 30000 + Math.random() * 60000, qty: p.qty + 8 } : p);
      });
    }, 6400);

    // Occasional waste swap — different cadence so animations don't coincide
    const tickWasteSwap = setInterval(() => {
      if (!alive) return;
      setWaste((prev) => {
        if (prev.length < 2) return prev;
        const sorted = [...prev].sort((a, b) => b.cost - a.cost);
        const idx = Math.floor(Math.random() * Math.min(4, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.cost - b.cost;
        return prev.map((w) => w.id === b.id ? { ...w, cost: w.cost + gap + 8000 + Math.random() * 14000, qty: w.qty + 2 } : w);
      });
    }, 8100);

    return () => { alive = false; clearInterval(tickFast); clearInterval(tickSwap); clearInterval(tickStockSwap); clearInterval(tickProdSwap); clearInterval(tickWasteSwap); };
  }, [initial, liveOnly]);

  // ---- Derived sorted lists ----
  const topPerformers = useMemo(
    () => [...kiosks].sort((a, b) => b.liveRev - a.liveRev).slice(0, 5),
    [kiosks]
  );
  const restockPriority = useMemo(
    () => [...kiosks].sort((a, b) => a.liveStock - b.liveStock).slice(0, 5),
    [kiosks]
  );
  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.rev - a.rev).slice(0, 5),
    [products]
  );
  const topWaste = useMemo(
    () => [...waste].sort((a, b) => b.cost - a.cost).slice(0, 5),
    [waste]
  );

  // ---- KPI aggregates (live) ----
  const liveTotalRev = useMemo(() => kiosks.reduce((s, k) => s + k.liveRev, 0), [kiosks]);
  const liveTotalOrders = useMemo(() => kiosks.reduce((s, k) => s + k.liveOrders, 0), [kiosks]);
  const totalRev = summary?.totals ? Number(summary.totals.salesToday || 0) : liveTotalRev;
  const totalOrders = summary?.totals ? Number(summary.totals.ordersToday || 0) : liveTotalOrders;
  const grossProfit = summary?.totals ? Number(summary.totals.profitEstimate || 0) : totalRev * 0.289;
  const cashExpected = summary?.totals ? Number(summary.totals.cashExpected || 0) : paymentSplit ? paymentSplit.cash : totalRev * 0.64;
  const digitalPayments = summary?.totals ? Number(summary.totals.digitalPayments || 0) : paymentSplit ? paymentSplit.digital : totalRev * 0.36;
  const closedKiosks = summary?.totals ? Number(summary.totals.closedKiosks || 0) : closeRows.filter((close) => close.status !== "open").length;
  const openKiosks = summary?.totals ? Number(summary.totals.openKiosks || 0) : Math.max(0, kiosks.length - closedKiosks);
  const lowStockAlerts = summary?.alerts ? Number(summary.alerts.lowStockItems || 0) : kiosks.filter((k) => k.liveStock < 50).length;
  const unresolvedVariances = summary?.alerts ? Number(summary.alerts.unresolvedVariances || 0) : closeRows.filter((close) => close.status === "pending" || close.status === "issue").length;
  const wastePct = summary?.totals?.salesToday ? Number(((Number(summary.totals.wasteCost || 0) / Number(summary.totals.salesToday || 1)) * 100).toFixed(1)) : 3.1;
  const displayWastePct = liveOnly && !summary?.totals?.salesToday ? 0 : wastePct;
  const variancePct = liveOnly ? 0 : -1.3;

  // Period filter: "day" | "week" | "month". Pure display multiplier — keeps the
  // underlying live state ticking so rank-swap animations still fire.
  const [period, setPeriod] = useState("day");
  const periodMul = period === "month" ? 30 : period === "week" ? 7 : 1;
  const periodSubtitle = period === "month" ? "this month" : period === "week" ? "this week" : "today";
  const planDelta = liveOnly ? "engine only" : period === "month" ? "+11.2% vs plan" : period === "week" ? "+9.6% vs plan" : "+8.4% vs plan";
  const alertRows = liveOnly ? [] : MOCK.alerts;
  const actionRows = liveOnly ? [] : [
    { label: "Auto-PO drafted - Baghdad Dairy", sub: "Milk x 4 kiosks - IQD 1.2M", ok: true },
    { label: "Pre-prep schedule shifted", sub: "Zayouna Plaza - 7:30 to 7:45", ok: true },
    { label: "Pistachio recipe flagged", sub: "12g to 9g - awaiting approval", ok: false },
  ];

  return (
    <div className="col" style={{ gap: 12, height: "calc(100vh - 130px)", overflow: "hidden" }}>
      {/* keyframes */}
      <style>{`
        @keyframes ovPulse { 0% { transform: scale(0.8); opacity: 0.55; } 70% { transform: scale(2); opacity: 0; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes ovBarPulse { 0%, 100% { opacity: 0.0; } 50% { opacity: 0.4; } }
        @keyframes ovBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes ovScan {
          0% { transform: translateX(-30%); }
          100% { transform: translateX(130%); }
        }
        .ov-row {
          background: var(--surface);
          border: 1px solid var(--line-soft);
          border-radius: 6px;
          padding: 7px 10px;
          display: grid;
          /* rank | name (fixed width so bars line up across rows) | bar (fills) | value */
          grid-template-columns: 22px 120px 1fr auto;
          align-items: center;
          gap: 10px;
          transition: background 200ms ease, border-color 200ms ease;
        }
        .ov-row > .ov-name {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
        }
        .ov-row > .ov-name > span:first-child {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ov-row[data-swap-dir="up"] {
          background: linear-gradient(90deg, rgba(14,122,78,0.08), var(--surface) 60%);
          border-color: rgba(14,122,78,0.35);
        }
        .ov-row[data-swap-dir="down"] {
          background: linear-gradient(90deg, rgba(20,20,25,0.04), var(--surface) 60%);
        }
        .ov-row .swap-badge {
          opacity: 0;
          transition: opacity 240ms ease;
        }
        .ov-row[data-swap-dir] .swap-badge {
          opacity: 1;
        }
        .ov-section {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .ov-section-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line-soft);
          background: var(--surface-2);
        }
        .ov-section-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-1);
          font-family: var(--font-mono);
        }
        .ov-bar-track {
          height: 4px; background: var(--surface-sunk); border-radius: 2px; overflow: hidden;
          position: relative;
        }
        .ov-bar-fill {
          height: 100%; border-radius: 2px;
          transition: width 700ms cubic-bezier(0.22,1,0.36,1), background 300ms ease;
        }
        .ov-cursor::after {
          content: "_"; margin-left: 2px; animation: ovBlink 1.1s step-end infinite;
          color: var(--ink-3); font-weight: 400;
        }
        .ov-scan {
          position: relative; overflow: hidden;
        }
        .ov-scan::after {
          content: ""; position: absolute; top: 0; bottom: 0; width: 30%;
          background: linear-gradient(90deg, transparent, rgba(35,66,216,0.07), transparent);
          animation: ovScan 6s linear infinite;
          pointer-events: none;
        }
        .ov-period {
          display: inline-flex;
          border: 1px solid var(--terminal-line);
          border-radius: 4px;
          overflow: hidden;
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
        }
        .ov-period button {
          padding: 3px 9px;
          color: var(--terminal-muted);
          background: transparent;
          border: 0;
          border-inline-end: 1px solid var(--terminal-line-soft);
          cursor: pointer;
          transition: color 120ms ease, background 120ms ease;
        }
        .ov-period button:last-child { border-inline-end: 0; }
        .ov-period button:hover { color: var(--terminal-ink); }
        .ov-period button.on {
          color: var(--terminal-active-ink);
          background: var(--terminal-active-bg);
        }
        .ov-kpi-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--line-soft);
        }
        .ov-kpi-row:last-child { border-bottom: 0; }
        .ov-kpi-label {
          font-size: 9.5px;
          font-family: var(--font-mono);
          color: var(--ink-3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          line-height: 1.3;
        }
        .ov-kpi-delta {
          font-size: 10.5px;
          font-family: var(--font-mono);
          line-height: 1.3;
          margin-top: 1px;
        }
        .ov-kpi-value {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.01em;
          text-align: end;
          line-height: 1.1;
        }
      `}</style>

      {/* ============ Terminal status bar ============ */}
      <div className="ov-scan" style={{
        background: "var(--terminal)", color: "var(--terminal-ink)",
        borderRadius: 8, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 18,
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        letterSpacing: "0.04em",
      }}>
        <div className="row" style={{ gap: 8 }}>
          <PulseDot color="#48D597"/>
          <span style={{ fontWeight: 600 }}>STREAM ACTIVE</span>
        </div>
        <span style={{ color: "var(--terminal-faint)" }}>|</span>
        <span style={{ color: "var(--terminal-muted)" }}>
          <LiveClock style={{ color: "var(--terminal-ink)" }}/>
          <span style={{ marginInlineStart: 6, opacity: 0.55 }}>BAGHDAD - UTC+3</span>
        </span>
        <span style={{ color: "var(--terminal-faint)" }}>|</span>
        <span style={{ color: "var(--terminal-muted)" }}>
          <span style={{ color: "var(--terminal-ink)", fontWeight: 600 }}>{kiosks.length}/{kiosks.length}</span> KIOSKS ONLINE
        </span>
        <span style={{ color: "var(--terminal-faint)" }}>|</span>
        <span style={{ color: "var(--terminal-muted)" }}>
          <span style={{ color: "var(--terminal-ink)" }}>42</span>ms LATENCY
        </span>
        <span style={{ flex: 1 }}/>
        <span className="ov-cursor" style={{ color: "var(--terminal-muted)" }}>
          watching {kiosks.length} sites - {feed.length} events buffered
        </span>
        <span style={{ color: "var(--terminal-faint)", marginInlineStart: 14 }}>|</span>
        <div className="ov-period" role="tablist" aria-label="Time range">
          {[
            { id: "day",   label: "D", title: "Daily"   },
            { id: "week",  label: "W", title: "Weekly"  },
            { id: "month", label: "M", title: "Monthly" },
          ].map((p) => (
            <button key={p.id} type="button"
              role="tab" aria-selected={period === p.id} title={p.title}
              className={period === p.id ? "on" : ""}
              onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI ribbon moved into the center column (compact stacked card above Live activity) */}

      {/* ============ Main grid ============ */}
      <div style={{
        display: "grid",
        // Narrow rank-list column (~30% slimmer than before) + very narrow live activity.
        // The right column absorbs the freed width so the hourly chart can breathe.
        gridTemplateColumns: "minmax(190px, 0.6fr) minmax(190px, 0.45fr) minmax(380px, 1.95fr)",
        gap: 12, alignItems: "stretch",
        flex: 1, minHeight: 0,
      }}>
        {/* ---- LEFT column ---- */}
        <div className="col" style={{ gap: 10, minHeight: 0 }}>
          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "أعلى الأكشاك" : "Top performers"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                {ar ? "حسب الإيرادات" : `by revenue - ${periodSubtitle}`}
              </span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={topPerformers}
                rowHeight={32}
                renderRow={(k, idx) => {
                  const max = topPerformers[0].liveRev || 1;
                  const pct = (k.liveRev / max) * 100;
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <span className="ov-name">
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{k.name}</span>
                        <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: "var(--pos)", fontFamily: "var(--font-mono)" }}>+</span>
                      </span>
                      <div className="ov-bar-track">
                        <div className="ov-bar-fill" style={{ width: `${pct}%`, background: idx === 0 ? "var(--pos)" : "var(--ink-2)" }}/>
                      </div>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "end" }}>
                        <TickerNum value={k.liveRev * periodMul} format={(v) => fmtCompact(v)}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--crit)"/>
                {ar ? "أولوية إعادة التزويد" : "Restock priority"}
              </div>
              <span className="t-small" style={{
                fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                color: "var(--crit)", letterSpacing: "0.08em",
              }}>{ar ? "تصرف الآن" : "ACT NOW"}</span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={restockPriority}
                rowHeight={32}
                renderRow={(k, idx) => {
                  const pct = k.liveStock; // 0-100
                  const tone = pct < 30 ? "var(--crit)" : pct < 50 ? "var(--warn)" : "var(--pos)";
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <span className="ov-name">
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{k.name}</span>
                        <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: tone, fontFamily: "var(--font-mono)" }}>!</span>
                      </span>
                      <div className="ov-bar-track">
                        <div className="ov-bar-fill" style={{ width: `${pct}%`, background: tone }}/>
                      </div>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, color: tone, fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "end" }}>
                        <TickerNum value={pct} format={(v) => Math.round(v) + "%"}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "أعلى المنتجات" : "Top products"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                by revenue - {periodSubtitle}
              </span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={topProducts}
                rowHeight={32}
                renderRow={(p, idx) => {
                  const max = topProducts[0].rev || 1;
                  const pct = (p.rev / max) * 100;
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <span className="ov-name">
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</span>
                        <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: "var(--pos)", fontFamily: "var(--font-mono)" }}>+</span>
                      </span>
                      <div className="ov-bar-track">
                        <div className="ov-bar-fill" style={{ width: `${pct}%`, background: idx === 0 ? "var(--accent)" : "var(--ink-2)" }}/>
                      </div>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "end" }}>
                        <TickerNum value={p.rev * periodMul} format={(v) => fmtCompact(v)}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--warn)"/>
                {ar ? "أعلى الهدر" : "Top waste"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                by cost - {periodSubtitle}
              </span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={topWaste}
                rowHeight={32}
                renderRow={(w, idx) => {
                  const max = topWaste[0].cost || 1;
                  const pct = (w.cost / max) * 100;
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <span className="ov-name">
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{w.name}</span>
                        <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: "var(--warn)", fontFamily: "var(--font-mono)" }}>!</span>
                      </span>
                      <div className="ov-bar-track">
                        <div className="ov-bar-fill" style={{ width: `${pct}%`, background: idx === 0 ? "var(--crit)" : "var(--warn)" }}/>
                      </div>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--crit)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "end" }}>
                        <TickerNum value={w.cost * periodMul} format={(v) => fmtCompact(v)}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>

        {/* ---- CENTER column: KPI summary card stacked above Live activity ---- */}
        <div className="col" style={{ gap: 10, minHeight: 0 }}>
          {/* KPI summary — was the full-width ribbon, now a single compact card */}
          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--accent)"/>
                {ar ? "المؤشرات" : "KPIs"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                {periodSubtitle}
              </span>
            </div>
            <div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الإيرادات" : "Total sales today"}</div>
                  <div className="ov-kpi-delta" style={{ color: liveOnly ? "var(--ink-3)" : "var(--pos)" }}>{planDelta}</div>
                </div>
                <div className="ov-kpi-value">
                  <TickerNum value={totalRev * periodMul} format={(v) => fmtIQD(v)}/>
                </div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الربح الإجمالي" : "Profit estimate"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--pos)" }}>+ 28.9% margin</div>
                </div>
                <div className="ov-kpi-value">
                  <TickerNum value={grossProfit * periodMul} format={(v) => fmtIQD(v)}/>
                </div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "النقد المتوقع" : "Cash expected"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--ink-3)" }}>cash drawer total</div>
                </div>
                <div className="ov-kpi-value">
                  <TickerNum value={cashExpected * periodMul} format={(v) => fmtIQD(v)}/>
                </div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "المدفوعات الرقمية" : "Digital payments"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--ink-3)" }}>card, QR, wallet, manual</div>
                </div>
                <div className="ov-kpi-value">
                  <TickerNum value={digitalPayments * periodMul} format={(v) => fmtIQD(v)}/>
                </div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الأكشاك" : "Kiosk status"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--warn)" }}>{lowStockAlerts} low-stock alerts</div>
                </div>
                <div className="ov-kpi-value">{openKiosks} open / {closedKiosks} closed</div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الطلبات" : "Orders"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--ink-3)" }}>avg {fmtIQD(totalRev/Math.max(1,totalOrders)).replace("IQD ", "")}</div>
                </div>
                <div className="ov-kpi-value">
                  <TickerNum value={totalOrders * periodMul} format={(v) => fmtNum(Math.round(v))}/>
                </div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الهدر" : "Waste"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--pos)" }}>+ target 4%</div>
                </div>
                <div className="ov-kpi-value">{displayWastePct.toFixed(1)}%</div>
              </div>
              <div className="ov-kpi-row">
                <div>
                  <div className="ov-kpi-label">{ar ? "الفرق" : "Variance"}</div>
                  <div className="ov-kpi-delta" style={{ color: "var(--crit)" }}>{unresolvedVariances} unresolved closes</div>
                </div>
                <div className="ov-kpi-value" style={{ color: "var(--crit)" }}>{variancePct.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Live activity grows to fill the remaining height */}
          <div className="ov-section" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "النشاط المباشر" : "Live activity"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                streaming across kiosks
              </span>
            </div>
            <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
              <LiveFeed events={feed} maxRows={14} ar={ar}/>
            </div>
          </div>
        </div>

        {/* ---- RIGHT column ---- */}
        <div className="col" style={{ gap: 12 }}>
          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--ink-2)"/>
                {ar ? "نبض الساعة" : "Hourly pulse"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                <TickerNum value={totalRev * periodMul} format={(v) => fmtCompact(v)}/> {periodSubtitle}
              </span>
            </div>
            <div style={{ padding: "14px 14px 12px" }}>
              <HourlyPulse data={hourly} currentHour={currentHour}/>
              <div className="row" style={{ marginTop: 8, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                <span>00</span><span style={{ flex: 1 }}/>
                <span>06</span><span style={{ flex: 1 }}/>
                <span>12</span><span style={{ flex: 1 }}/>
                <span>18</span><span style={{ flex: 1 }}/>
                <span>23</span>
              </div>
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--warn)"/>
                {ar ? "تنبيهات" : "Alerts"}
              </div>
              <span className="badge" style={{ height: 18, fontSize: 10 }}>{alertRows.length}</span>
            </div>
            <div>
              {alertRows.length ? alertRows.map((a, i) => (
                <div key={a.id} style={{
                  padding: "11px 14px",
                  borderBottom: i < alertRows.length - 1 ? "1px solid var(--line-soft)" : 0,
                  display: "flex", gap: 10, alignItems: "flex-start"
                }}>
                  <span className={`dot ${a.level}`} style={{ marginTop: 6, flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.35 }}>{a.title}</div>
                    <div className="t-small subtle" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{a.body}</div>
                    <div className="t-small faint" style={{ fontSize: 10.5, marginTop: 5, fontFamily: "var(--font-mono)" }}>{a.time}</div>
                  </div>
                </div>
              )) : (
                <div className="t-small muted" style={{ padding: "14px", lineHeight: 1.5 }}>
                  No verified alerts from the engine yet.
                </div>
              )}
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--accent)"/>
                {ar ? "إجراءات تلقائية" : "Auto-actions"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>queue - {actionRows.length}</span>
            </div>
            <div style={{ padding: "10px 14px" }}>
              {actionRows.length ? actionRows.map((a, i) => (
                <div key={i} className="row" style={{ padding: "8px 0", gap: 8, borderBottom: i < actionRows.length - 1 ? "1px solid var(--line-soft)" : 0 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    background: a.ok ? "var(--pos-soft)" : "var(--warn-soft)",
                    color: a.ok ? "var(--pos)" : "var(--warn)",
                    display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700,
                  }}>{a.ok ? "OK" : "?"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{a.label}</div>
                    <div className="t-small subtle" style={{ fontSize: 10.5 }}>{a.sub}</div>
                  </div>
                </div>
              )) : (
                <div className="t-small muted" style={{ padding: "4px 0", lineHeight: 1.5 }}>
                  No automated actions without verified engine inputs.
                </div>
              )}
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--ai)"/>
                {ar ? "ملخص الذكاء" : "AI summary"}
              </div>
              <span className="badge badge-ai" style={{ height: 18, fontSize: 10 }}>traceable</span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div className="ai-block">
                <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>
                  {liveOnly
                    ? "No AI summary until verified engine rows are synced."
                    : ar ? MOCK.ai.varianceLead.headlineAr : MOCK.ai.varianceLead.headlineEn}
                </div>
                <div className="t-small muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
                  {ar
                    ? "الأرقام مرتبطة بإغلاق الوردية ودفتر الاستهلاك. الذكاء لا يحسب الرقم الرسمي."
                    : "Numbers link back to shift close and the consumption ledger. AI does not compute the official total."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Seed initial activity feed ----------
function seedFeed(kiosks) {
  if (!kiosks?.length) return [];
  const items = [
    { name: "Orange Juice L", amt: 9000 },
    { name: "Mocha L - Cinnamon Roll", amt: 14000 },
    { name: "Iced Latte M - Pistachio Cake", amt: 19500 },
    { name: "Spanish Latte M - Tiramisu", amt: 19000 },
    { name: "Spanish Latte M - Tiramisu", amt: 19000 },
    { name: "Cold Brew L - Cheesecake", amt: 19500 },
    { name: "Iced Latte M - Pistachio Cake", amt: 19500 },
    { name: "Cold Brew L - Cheesecake", amt: 19500 },
    { name: "Mango Juice L", amt: 8500 },
  ];
  const now = Date.now();
  return items.map((it, i) => {
    const k = kiosks[i % kiosks.length];
    return {
      id: "ev-init-" + i,
      kid: k.id,
      kiosk: k.name,
      item: it.name,
      amount: it.amt,
      ago: i === 0 ? "now" : `${i * 6}s ago`,
      ts: now - i * 6000,
    };
  });
}


/* ============================================================
   Admin screen — AI INSIGHTS
   Canvas (left) + Chat agent (right).
   - Canvas shows today's analysis cards by default
   - When the user asks a question (or taps a suggested prompt),
     the agent streams a reply AND re-renders the canvas with
     a tailored set of visualization cards
   ============================================================ */

// ============================================================
// Scene library — each scene = a set of canvas cards + a reply
// ============================================================
const SCENES = {
  default: {
    label: "Today's brief",
    labelAr: "ملخص اليوم",
    reply: "Today's brief is on the canvas. Four signals worth your time - most important: pistachio cake margin slipped 6 points since the Mesopotamia Foods price hike on Apr 22. Reformulating to peer-median 9g could recover 4.5 points. I've also pre-charted the iced-drink surge, Friday's forecast, and a cashier speed gap.",
    replyAr: "ملخص اليوم على اللوحة. أربع إشارات تستحق وقتك — الأهم: هامش كيك الفستق انخفض ٦ نقاط منذ زيادة Mesopotamia Foods بتاريخ 22 أبريل. تعديل الوصفة إلى ٩غ (متوسط الأكشاك) قد يسترجع حوالي ٤٫٥ نقاط. جهزت لك أيضاً صعود المشروبات المثلجة، توقعات الجمعة، وفجوة سرعة الكاشير.",
    cards: [
      {
        id: "headline-pistachio", type: "headline", span: "8/4",
        kind: "Anomaly - Margin",
        title: "Pistachio cake margin dropped 6 pts",
        delta: -6, deltaUnit: "pts", deltaLabel: "since Apr 22",
        body: "Mesopotamia Foods raised paste price 18%. Recipe uses 12g vs peer median 9g - reformulation could recover 4.5 pts.",
        spark: [31.4, 31.2, 30.8, 30.1, 29.6, 28.7, 27.4, 26.2, 25.9, 25.4, 25.4],
        annotation: { x: 5, label: "Apr 22 - price hike" },
        confidence: 88,
      },
      {
        id: "trend-iced", type: "bars", span: "4/4",
        kind: "Trend",
        title: "Iced drinks +31% w/w",
        bars: [
          { label: "Mon", v: 62, prev: 58 },
          { label: "Tue", v: 71, prev: 60 },
          { label: "Wed", v: 78, prev: 64 },
          { label: "Thu", v: 88, prev: 67 },
          { label: "Fri", v: 96, prev: 72 },
          { label: "Sat", v: 104, prev: 79, accent: true },
        ],
        body: "Baghdad kiosks - heat correlation 0.84",
        confidence: 92,
      },
      {
        id: "forecast-friday", type: "forecast", span: "4/3",
        kind: "Forecast",
        title: "Friday revenue",
        value: 198, unit: "K IQD",
        rangeLow: 186, rangeHigh: 210,
        note: "Eid pull-forward - weather +34C",
        confidence: 81,
      },
      {
        id: "speed-cashiers", type: "rank", span: "4/3",
        kind: "Action",
        title: "Two cashiers above peer median",
        rows: [
          { label: "Zayouna K-04 - Sara",  v: 39, target: 28 },
          { label: "Basra TS K-09 - Karim",   v: 36, target: 28 },
          { label: "Median",              v: 28, target: 28, muted: true },
        ],
        body: "Re-train on combo shortcuts -> ~40 min/day saved",
        confidence: 76,
      },
      {
        id: "stock-runway", type: "runway", span: "4/3",
        kind: "Operations",
        title: "Stock runway by category",
        rows: [
          { label: "Coffee",    days: 9.4, target: 7,  ok: true },
          { label: "Dairy",     days: 1.2, target: 5,  ok: false },
          { label: "Bakery",    days: 2.8, target: 4,  ok: false },
          { label: "Produce",   days: 3.4, target: 5,  ok: false },
          { label: "Syrups",    days: 5.1, target: 7,  ok: true },
          { label: "Packaging", days: 11,  target: 7,  ok: true },
        ],
        body: "Auto-PO drafted for dairy - awaiting approval",
      },
    ]
  },

  k04: {
    label: "Why is Zayouna Plaza 12% behind?",
    labelAr: "ليش الزيوّنة بلازا أقل ١٢٪؟",
    reply: "Pulled apart Zayouna Plaza's day. The 12% gap comes almost entirely from a 3-hour oat milk stockout this morning (08:42-11:15) - drinks per hour fell to 18 vs the usual 46. Footfall and ticket size are normal. Auto-PO is already drafted; a manual transfer from K-01 (Karrada Center) could recover the rest of today.",
    replyAr: "حللنا يوم الزيوّنة بلازا. فرق الـ١٢٪ جاء تقريباً بالكامل من نفاد حليب الشوفان لمدة ٣ ساعات هذا الصباح (08:42–11:15) — المشروبات/الساعة نزلت إلى 18 بدل المعتاد 46. الزحمة ومتوسط الفاتورة طبيعي. مسودة الشراء جاهزة؛ تحويل يدوي من K-01 (الكرادة) قد يعوّض بقية اليوم.",
    cards: [
      {
        id: "k04-headline", type: "headline", span: "12/3",
        kind: "Diagnosis - Zayouna Plaza",
        title: "Oat milk stockout cost ~IQD 410K",
        delta: -12, deltaUnit: "%", deltaLabel: "vs plan",
        body: "Stockout window 08:42-11:15. Drinks/hour fell to 18 (avg 46). Footfall and ticket size unchanged.",
        spark: [42, 44, 46, 22, 18, 19, 21, 38, 44, 47, 45],
        annotation: { x: 3, label: "stockout starts" },
      },
      {
        id: "k04-stack", type: "stack", span: "8/4",
        kind: "Variance breakdown",
        title: "Where the 12% went",
        segments: [
          { label: "Oat milk stockout", v: 8.4, color: "var(--crit)" },
          { label: "Lower iced mix", v: 2.1, color: "var(--warn)" },
          { label: "Card terminal hiccup", v: 1.5, color: "var(--ink-2)" },
        ],
        total: 12,
        body: "Stockout dominates - 70% of variance",
      },
      {
        id: "k04-fix", type: "actions", span: "4/4",
        kind: "Recovery plan",
        title: "Two actions to recover today",
        actions: [
          { label: "Approve auto-PO - Baghdad Dairy", sub: "240 L - ETA 2h", primary: true },
          { label: "Transfer 96 L from K-01 Karrada Center", sub: "Recovers ~IQD 280K today", primary: false },
        ],
      },
      {
        id: "k04-hourly", type: "hourly", span: "12/3",
        kind: "Hourly drinks served",
        data: [12, 18, 32, 44, 46, 48, 22, 18, 19, 21, 38, 44, 47, 45, 42, 38, 32, 28, 18, 12, 8, 4, 2, 0],
        currentHour: 14,
        outageStart: 6, outageEnd: 9,
      },
    ]
  },

  weekend: {
    label: "Which products to push this weekend?",
    labelAr: "شنو نروّج بالويكند؟",
    reply: "Three products have the strongest pull for Sat-Sun: Iced Latte, Cold Brew, and Pistachio Cake. Iced Latte attaches to 38% of weekend tickets and clears 73% margin. I'd staff the prep accordingly and pre-batch cold brew Friday night.",
    replyAr: "ثلاث منتجات عندها أقوى سحب للسبت/الأحد: آيس لاتيه، كولد برو، وكيك الفستق. الآيس لاتيه مرتبط بـ 38% من فواتير الويكند وهامشه 73%. أنصح تجهّزون التحضير وتسوّون دفعة كولد برو ليلة الجمعة.",
    cards: [
      {
        id: "weekend-rank", type: "rank-big", span: "8/4",
        kind: "Recommendation - Weekend",
        title: "Top push candidates",
        rows: [
          { label: "Iced Latte",      score: 92, attach: "38%", margin: "73%", reason: "Highest attach + heat-driven" },
          { label: "Cold Brew",       score: 84, attach: "21%", margin: "78%", reason: "Best margin - stock holds" },
          { label: "Pistachio Cake",  score: 76, attach: "18%", margin: "62%", reason: "Pairs with iced drinks" },
          { label: "Mango Juice",     score: 68, attach: "14%", margin: "58%", reason: "Family carts on weekends" },
        ],
      },
      {
        id: "weekend-heat", type: "heatmap", span: "4/4",
        kind: "Heat x sales",
        title: "Iced drink correlation",
        data: [
          [22, 4], [24, 7], [26, 9], [28, 14], [30, 22], [32, 31], [34, 42], [36, 58], [38, 72], [40, 81]
        ],
        body: "r = 0.84 - stronger past 32C",
      },
      {
        id: "weekend-prep", type: "actions", span: "12/3",
        kind: "Pre-shift plan",
        title: "Friday night prep",
        actions: [
          { label: "Pre-batch 12L cold brew", sub: "Across Baghdad kiosks", primary: true },
          { label: "Add 2 baristas Sat 10:00-14:00", sub: "K-01 + K-03 - peak window", primary: false },
          { label: "Increase pistachio cake bake by 20%", sub: "Sat morning", primary: false },
        ],
      },
    ]
  },

  waste: {
    label: "Show me waste anomalies",
    labelAr: "ورّيني شذوذات الهدر",
    reply: "Three anomalies stood out across the last 14 days. Mansour District's croissant waste is up 240% - almost certainly overproduction in the morning bake. Majidi Mall's pistachio cake end-of-day waste is consistent and material at IQD 168/day. Basra Times Square's plain croissant goes stale by lunch - likely a freshness window issue.",
    replyAr: "ثلاث شذوذات ظهرت خلال آخر 14 يوم. هدر الكرواسون في المنصور مرتفع 240% — غالباً إفراط إنتاج بالصباح. هدر كيك الفستق في مجيدي مول آخر اليوم ثابت ومؤثر (168 ألف دينار/يوم). كرواسون سادة في بصرة تايمز ييبس قبل الغداء — مشكلة نافذة طزاجة.",
    cards: [
      {
        id: "waste-grid", type: "wastegrid", span: "8/5",
        kind: "Last 14 days - waste % by kiosk",
        title: "Waste heatmap",
        kiosks: ["K-01 Karrada","K-02 Mansour","K-03 Baghdad Mall","K-04 Zayouna","K-05 Al Mansour Mall","K-06 Family Mall G2","K-07 Majidi Mall","K-08 Empire Mall","K-09 Basra Times","K-10 Basra Mall"],
        rows: 14,
      },
      {
        id: "waste-k02", type: "headline", span: "4/3",
        kind: "Anomaly #1 - Mansour",
        title: "Croissant waste +240%",
        delta: 240, deltaUnit: "%", deltaLabel: "vs 7-day avg",
        body: "Likely AM overproduction - peak demand shifted later by 18 min.",
        spark: [4, 5, 4, 6, 5, 7, 8, 12, 18, 24, 22, 21, 18],
        annotation: { x: 7, label: "shift in start" },
      },
      {
        id: "waste-k07", type: "headline", span: "4/3",
        kind: "Anomaly #2 - Majidi Mall",
        title: "Pistachio EOD waste consistent",
        delta: 168, deltaUnit: "IQD/d", deltaLabel: "lost",
        body: "6 slices/day at 23:00 cleanup. Reduce daily bake by 4.",
        spark: [148, 156, 162, 168, 164, 172, 168, 170, 168],
      },
      {
        id: "waste-k09", type: "headline", span: "4/3",
        kind: "Anomaly #3 - Basra Times",
        title: "Plain croissant stales by 13:00",
        delta: 9, deltaUnit: "/day", deltaLabel: "tossed",
        body: "Bake-to-sell window narrowed. Consider 2 smaller batches.",
        spark: [6, 7, 9, 8, 10, 9, 11, 9, 10],
      },
    ]
  },
};

const SUGGESTED = [
  { id: "k04",      text: "Why is Zayouna Plaza 12% behind?" },
  { id: "weekend",  text: "What should I push this weekend?" },
  { id: "waste",    text: "Show me waste anomalies" },
  { id: "default",  text: "Today's brief" },
];

// ============================================================
// Streaming-text hook — types out a string char by char
// ============================================================
function useStream(target, speed = 14) {
  const [out, setOut] = useStateIns("");
  useEffectIns(() => {
    setOut("");
    if (!target) return;
    let i = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      if (dt >= speed) {
        const advance = Math.max(1, Math.floor(dt / speed));
        i = Math.min(target.length, i + advance);
        setOut(target.slice(0, i));
        last = now;
      }
      if (i < target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return out;
}

// ============================================================
// Card visualization components
// ============================================================
function CardShell({ children, kind, title, confidence, body, accent }) {
  return (
    <div className="ins-card" style={{ position: "relative" }}>
      {accent && <div style={{
        position: "absolute", insetInlineStart: 0, top: 12, bottom: 12,
        width: 2, background: accent, borderRadius: 2,
      }}/>}
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        {kind && <span className="badge" style={{ height: 18, fontSize: 10 }}>{kind}</span>}
        <span style={{ flex: 1 }}/>
        {confidence != null && (
          <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
            {confidence}% conf
          </span>
        )}
      </div>
      {title && <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: body ? 4 : 8 }}>{title}</div>}
      {body && <div className="t-small muted" style={{ lineHeight: 1.5, marginBottom: 10 }}>{body}</div>}
      {children}
    </div>
  );
}

function HeadlineCard({ card }) {
  const positive = card.delta >= 0 && (card.deltaUnit === "%" || card.deltaUnit === "pts" ? card.delta > 0 : true);
  // For waste/anomaly cards a "+%" delta is bad. Use the explicit kind tone:
  const isAnomaly = /Anomaly/i.test(card.kind || "");
  const tone = isAnomaly ? "var(--crit)" : (card.delta < 0 ? "var(--crit)" : "var(--pos)");
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence} accent={tone}>
      <div className="row" style={{ gap: 12, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: tone,
          letterSpacing: "-0.01em",
        }}>
          {card.delta > 0 ? "+" : ""}{card.delta}{card.deltaUnit}
        </span>
        <span className="t-small subtle">{card.deltaLabel}</span>
      </div>
      {card.spark && <SparkAnnot data={card.spark} annotation={card.annotation} color={tone}/>}
    </CardShell>
  );
}

function SparkAnnot({ data, annotation, color }) {
  const W = 320, H = 70;
  const pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (W - pad * 2),
    pad + (1 - (v - min) / r) * (H - pad * 2),
  ]);
  const d = "M" + pts.map(p => p.join(",")).join(" L");
  const a = d + ` L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  // path length for draw-in
  const pathRef = useRefIns(null);
  const [drawn, setDrawn] = useStateIns(0);
  useEffectIns(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = len + "";
    pathRef.current.style.strokeDashoffset = len + "";
    requestAnimationFrame(() => {
      pathRef.current.style.transition = "stroke-dashoffset 900ms ease";
      pathRef.current.style.strokeDashoffset = "0";
    });
    const t = setTimeout(() => setDrawn(1), 900);
    return () => clearTimeout(t);
  }, [data.join(",")]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 70, display: "block" }} preserveAspectRatio="none">
      <path d={a} fill={color} opacity="0.08"/>
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      {annotation && (() => {
        const x = pts[annotation.x] ? pts[annotation.x][0] : 0;
        return (
          <g style={{ opacity: drawn, transition: "opacity 240ms ease 100ms" }}>
            <line x1={x} y1={pad} x2={x} y2={H - pad} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 2"/>
            <circle cx={x} cy={pts[annotation.x][1]} r="3" fill="var(--surface)" stroke={color} strokeWidth="1.5"/>
            <text x={x + 5} y={14} fontSize="9.5" fill="var(--ink-2)" fontFamily="var(--font-mono)">{annotation.label}</text>
          </g>
        );
      })()}
    </svg>
  );
}

function BarsCard({ card }) {
  const max = Math.max(...card.bars.flatMap(b => [b.v, b.prev]));
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 96, marginTop: 4, padding: "0 4px" }}>
        {card.bars.map((b, i) => {
          const h = (b.v / max) * 100;
          const ph = (b.prev / max) * 100;
          return (
            <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, width: "100%", justifyContent: "center" }}>
                <div style={{
                  width: "44%", background: "var(--line-strong)", height: `${ph}%`,
                  borderRadius: 1, opacity: 0.8,
                  animation: `insBarGrow 600ms cubic-bezier(0.22,1,0.36,1) ${i * 50}ms both`,
                }}/>
                <div style={{
                  width: "44%", background: b.accent ? "var(--ink)" : "var(--ink-1)", height: `${h}%`,
                  borderRadius: 1,
                  animation: `insBarGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 50 + 80}ms both`,
                }}/>
              </div>
              <span className="t-small faint" style={{ fontSize: 10 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function ForecastCard({ card }) {
  const W = 280, H = 80;
  return (
    <CardShell kind={card.kind} title={card.title} confidence={card.confidence}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {card.value}
        </span>
        <span className="t-small subtle">{card.unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 64, display: "block" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ins-fan" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.18"/>
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1="0" y1={H/2} x2={W * 0.55} y2={H/2} stroke="var(--ink-2)" strokeWidth="1.4"/>
        {/* forecast fan */}
        <path d={`M ${W*0.55} ${H/2} Q ${W*0.78} ${H/2 - 18}, ${W} 8 L ${W} ${H - 8} Q ${W*0.78} ${H/2 + 18}, ${W*0.55} ${H/2} Z`} fill="url(#ins-fan)"/>
        <line x1={W*0.55} y1={H/2} x2={W} y2={H/2 - 16} stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="3 2"/>
        <line x1={W*0.55} y1="0" x2={W*0.55} y2={H} stroke="var(--ink-3)" strokeWidth="0.8" strokeDasharray="2 2"/>
        <text x={W*0.55 + 4} y="11" fontSize="9" fill="var(--ink-2)" fontFamily="var(--font-mono)">now</text>
        <text x={W - 28} y={H - 2} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)">Fri</text>
      </svg>
      <div className="row" style={{ marginTop: 6, gap: 12, fontSize: 11, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
        <span>range {card.rangeLow}-{card.rangeHigh}</span>
        <span style={{ flex: 1 }}/>
        <span className="subtle">{card.note}</span>
      </div>
    </CardShell>
  );
}

function RankCard({ card }) {
  const max = Math.max(...card.rows.map(r => r.v));
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence}>
      <div className="col" style={{ gap: 8 }}>
        {card.rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center", opacity: r.muted ? 0.55 : 1 }}>
            <span className="t-small">{r.label}</span>
            <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.v}s</span>
            <div style={{ gridColumn: "1 / -1", height: 5, background: "var(--surface-sunk)", borderRadius: 2, position: "relative" }}>
              <div style={{
                height: "100%", width: `${(r.v / max) * 100}%`,
                background: r.muted ? "var(--ink-3)" : "var(--ink-1)",
                borderRadius: 2,
                animation: `insBarRow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`,
                transformOrigin: "left",
              }}/>
              <div style={{
                position: "absolute", insetInlineStart: `${(r.target / max) * 100}%`, top: -2, bottom: -2,
                width: 1.5, background: "var(--ink-2)",
              }}/>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function RunwayCard({ card }) {
  const max = 14;
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <div className="col" style={{ gap: 8 }}>
        {card.rows.map((r, i) => {
          const tone = r.ok ? "var(--ink-1)" : "var(--crit)";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 8, alignItems: "center" }}>
              <span className="t-small">{r.label}</span>
              <div style={{ position: "relative", height: 6, background: "var(--surface-sunk)", borderRadius: 2 }}>
                <div style={{
                  position: "absolute", height: "100%", insetInlineStart: 0,
                  width: `${(r.days / max) * 100}%`,
                  background: tone, borderRadius: 2, opacity: 0.85,
                  animation: `insBarRow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
                  transformOrigin: "left",
                }}/>
                <div style={{
                  position: "absolute", insetInlineStart: `${(r.target / max) * 100}%`, top: -2, bottom: -2,
                  width: 1.5, background: "var(--ink-2)", opacity: 0.7,
                }}/>
              </div>
              <span className="t-num" style={{ fontSize: 11, fontFamily: "var(--font-mono)", textAlign: "end", color: r.ok ? "var(--ink-2)" : "var(--crit)" }}>{r.days}d</span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function StackCard({ card }) {
  const total = card.total || card.segments.reduce((s, x) => s + x.v, 0);
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <div style={{
        display: "flex", height: 22, borderRadius: 4, overflow: "hidden",
        border: "1px solid var(--line-soft)", marginTop: 6, marginBottom: 8,
      }}>
        {card.segments.map((s, i) => (
          <div key={i} style={{
            flex: s.v, background: s.color, position: "relative",
            animation: `insStackGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms both`,
            transformOrigin: "left",
          }}/>
        ))}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {card.segments.map((s, i) => (
          <div key={i} className="row" style={{ gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2 }}/>
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className="t-num" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{s.v}%</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function ActionsCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div className="col" style={{ gap: 8, marginTop: 4 }}>
        {card.actions.map((a, i) => (
          <button key={i} className={a.primary ? "btn btn-accent" : "btn btn-ghost"} style={{
            justifyContent: "space-between", height: "auto", padding: "10px 12px",
            textAlign: "start", whiteSpace: "normal", lineHeight: 1.35,
          }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 13 }}>{a.label}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{a.sub}</span>
            </span>
            <Icon name="arrowRight" size={12}/>
          </button>
        ))}
      </div>
    </CardShell>
  );
}

function HourlyCard({ card }) {
  const max = Math.max(...card.data);
  return (
    <CardShell kind={card.kind}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, padding: "8px 0 6px" }}>
        {card.data.map((v, i) => {
          const h = (v / max) * 100;
          const inOutage = i >= card.outageStart && i <= card.outageEnd;
          const isCurr = i === card.currentHour;
          return (
            <div key={i} style={{
              flex: 1, height: `${Math.max(2, h)}%`,
              background: inOutage ? "var(--crit)" : isCurr ? "var(--ink)" : "var(--ink-2)",
              opacity: inOutage ? 0.85 : isCurr ? 1 : 0.55,
              borderRadius: 1,
              animation: `insBarGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 18}ms both`,
              transformOrigin: "bottom",
            }}/>
          );
        })}
      </div>
      <div className="row" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 4 }}>
        <span>00</span><span style={{ flex: 1 }}/>
        <span style={{ color: "var(--crit)" }}>● stockout 08:42–11:15</span>
        <span style={{ flex: 1 }}/>
        <span>23</span>
      </div>
    </CardShell>
  );
}

function HeatmapCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <svg viewBox="0 0 200 100" style={{ width: "100%", height: 100 }} preserveAspectRatio="none">
        <line x1="20" y1="90" x2="195" y2="90" stroke="var(--line-strong)"/>
        <line x1="20" y1="6" x2="20" y2="90" stroke="var(--line-strong)"/>
        {card.data.map(([x, y], i) => {
          const cx = 20 + ((x - 20) / 22) * 175;
          const cy = 90 - (y / 85) * 80;
          return <circle key={i} cx={cx} cy={cy} r="3" fill="var(--accent)" opacity="0.85"
            style={{ animation: `insDotIn 460ms cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both` }}/>;
        })}
        {/* trend line */}
        <line x1="22" y1="84" x2="190" y2="14" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="3 2" opacity="0.6"/>
        <text x="22" y="98" fontSize="8" fill="var(--ink-3)" fontFamily="var(--font-mono)">22°C</text>
        <text x="170" y="98" fontSize="8" fill="var(--ink-3)" fontFamily="var(--font-mono)">40°C</text>
      </svg>
    </CardShell>
  );
}

function RankBigCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div className="col" style={{ gap: 10, marginTop: 4 }}>
        {card.rows.map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "20px 1.4fr 60px 1fr",
            gap: 12, alignItems: "center",
            padding: "8px 10px",
            background: i === 0 ? "var(--surface-sunk)" : "transparent",
            borderRadius: 6,
            border: i === 0 ? "1px solid var(--line-soft)" : "1px solid transparent",
            animation: `insRowIn 480ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
          }}>
            <span className="t-num subtle" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>#{i+1}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
              <div className="t-small subtle" style={{ fontSize: 11 }}>{r.reason}</div>
            </div>
            <div className="col" style={{ alignItems: "flex-end", gap: 1 }}>
              <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500 }}>{r.score}</span>
              <span className="t-small faint" style={{ fontSize: 10 }}>score</span>
            </div>
            <div className="row" style={{ gap: 14, fontSize: 11 }}>
              <span><span className="subtle">attach</span> <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.attach}</span></span>
              <span><span className="subtle">margin</span> <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.margin}</span></span>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function WasteGridCard({ card }) {
  const COLS = card.kiosks.length;
  const ROWS = card.rows;
  // generate deterministic pseudo-data
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const seed = (r * 31 + c * 17) % 100;
      let v = (seed % 9) / 2; // 0-4
      // anomalies
      if (c === 1 && r >= 8) v = 8 + (seed % 3); // Mansour croissant spike
      if (c === 6) v = 4 + (seed % 3); // Majidi Mall steady
      if (c === 8 && r % 2 === 0) v = 5.5 + (seed % 2);
      cells.push({ r, c, v });
    }
  }
  const maxV = 10;
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <div className="col" style={{ justifyContent: "space-between", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-3)", paddingBottom: 18 }}>
          <span>14d ago</span>
          <span>today</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 2,
          }}>
            {cells.map(({ r, c, v }) => {
              const intensity = Math.min(1, v / maxV);
              const isHot = v > 5;
              return (
                <div key={`${r}-${c}`} style={{
                  aspectRatio: "1",
                  background: isHot ? "var(--crit)" : "var(--ink)",
                  opacity: 0.08 + intensity * 0.85,
                  borderRadius: 1,
                  animation: `insDotIn 360ms ease ${(r * COLS + c) * 6}ms both`,
                }}/>
              );
            })}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 2, marginTop: 4,
          }}>
            {card.kiosks.map((k, i) => (
              <div key={k} style={{ fontSize: 8.5, fontFamily: "var(--font-mono)", color: "var(--ink-3)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {k.split(" ")[0]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

const CARD_RENDERERS = {
  headline: HeadlineCard,
  bars: BarsCard,
  forecast: ForecastCard,
  rank: RankCard,
  runway: RunwayCard,
  stack: StackCard,
  actions: ActionsCard,
  hourly: HourlyCard,
  heatmap: HeatmapCard,
  "rank-big": RankBigCard,
  wastegrid: WasteGridCard,
};

// ============================================================
// Canvas — renders the active scene's cards in a 12-col grid,
// fades old cards out before new ones in
// ============================================================
function InsightCanvas({ sceneId, sourceMeta, lang }) {
  const scene = SCENES[sceneId] || SCENES.default;
  const ar = lang === "ar";
  const [renderId, setRenderId] = useStateIns(sceneId);

  // crossfade: when sceneId changes, keep showing old for 220ms then swap
  useEffectIns(() => {
    if (sceneId === renderId) return;
    const t = setTimeout(() => setRenderId(sceneId), 220);
    return () => clearTimeout(t);
  }, [sceneId, renderId]);

  const showing = SCENES[renderId] || SCENES.default;
  const fadingOut = sceneId !== renderId;

  if (sourceMeta?.empty) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <div className="t-h2" style={{ marginBottom: 6 }}>{ar ? "لا توجد بيانات موثقة بعد" : "No verified insight data yet"}</div>
          <div className="t-small muted" style={{ maxWidth: 420, lineHeight: 1.6 }}>
            {ar ? "وضع التشغيل فقط لا يعرض بطاقات تجريبية. اربط المحرك أو حدث المزامنة لعرض التحليلات." : "Live-only mode does not show demo insight cards. Connect the engine or refresh sync to populate this canvas."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", overflow: "auto" }}>
      <div style={{
        padding: "20px 24px 80px",
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 200ms ease, transform 240ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div className="row" style={{ marginBottom: 14, gap: 8 }}>
          <AITag>{ar ? (showing.labelAr || showing.label) : showing.label}</AITag>
          <span className="t-small subtle" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {showing.cards.length} cards - {sourceMeta?.cite || "generated just now"}
          </span>
        </div>

        <div key={renderId} style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
          alignItems: "start",
        }}>
          {showing.cards.map((card, idx) => {
            const Renderer = CARD_RENDERERS[card.type] || HeadlineCard;
            const [span, rowSpan] = (card.span || "6/3").split("/").map(Number);
            return (
              <div key={card.id} style={{
                gridColumn: `span ${span}`,
                animation: `insCardIn 520ms cubic-bezier(0.22,1,0.36,1) ${idx * 80}ms both`,
              }}>
                <Renderer card={card}/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Chat panel
// ============================================================
function ChatPanel({ messages, sendQuestion, busy, onSuggested, sourceMeta }) {
  const [text, setText] = useStateIns("");
  const scrollRef = useRefIns(null);

  useEffectIns(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, busy]);

  const submit = (q) => {
    const v = (q - text).trim();
    if (!v) return;
    sendQuestion(v);
    setText("");
  };

  return (
    <div style={{
      width: 380, flexShrink: 0,
      display: "flex", flexDirection: "column",
      borderInlineStart: "1px solid var(--line)",
      background: "var(--surface)",
      height: "100%",
    }}>
      {/* header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--line-soft)",
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--surface-2)",
      }}>
        <span style={{ position: "relative", width: 8, height: 8, display: "inline-block" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--pos)" }}/>
          <span style={{
            position: "absolute", inset: -4, borderRadius: "50%", background: "var(--pos)",
            opacity: 0.3, animation: "ovPulse 1.6s ease-out infinite",
          }}/>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Maqha Insights</div>
          <div className="t-small subtle" style={{ fontSize: 10.5 }}>{sourceMeta?.header || "Verified source rows"} - read-only</div>
        </div>
        <button className="btn btn-quiet" style={{ height: 24, fontSize: 11, padding: "0 6px" }}>
          <Icon name="dots" size={12}/>
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="scroll" style={{
        flex: 1, overflowY: "auto",
        padding: "16px 16px 8px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {messages.map((m, i) => (
          <ChatMessage key={i} message={m}/>
        ))}
        {busy && <TypingIndicator/>}
      </div>

      <div style={{ padding: "0 14px 8px", display: "flex", flexWrap: "wrap", gap: 5 }}>
        {(sourceMeta?.chips || []).map(([label, value]) => (
          <span key={label} className="badge" style={{ height: 20, fontSize: 10.5 }}>
            {label} <span className="t-num" style={{ marginInlineStart: 4 }}>{Number(value || 0).toLocaleString("en")}</span>
          </span>
        ))}
      </div>

      <div style={{ padding: "0 14px 8px" }}>
        <span className="badge badge-ai" style={{ height: 22, fontSize: 10.5 }}>{sourceMeta?.budget || "Daily summaries tier"}</span>
        {sourceMeta?.window && (
          <div className="t-small subtle" style={{ marginTop: 6, fontSize: 10.5 }}>
            {sourceMeta.window}
          </div>
        )}
      </div>

      {/* suggestions */}
      <div style={{ padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SUGGESTED.map(s => (
          <button key={s.id} onClick={() => onSuggested(s)}
            disabled={busy}
            style={{
              padding: "5px 10px", fontSize: 11.5,
              border: "1px solid var(--line)", borderRadius: 999,
              background: "var(--surface)", color: "var(--ink-1)",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.5 : 1,
              transition: "background 80ms ease",
            }}
            onMouseEnter={e => !busy && (e.currentTarget.style.background = "var(--surface-sunk)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}
          >
            {s.text}
          </button>
        ))}
      </div>

      {/* input */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 8px 8px 12px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--surface)",
        }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Ask about a kiosk, product, anomaly..."
            disabled={busy}
            style={{
              flex: 1, border: 0, outline: "none", background: "transparent",
              fontSize: 13, color: "var(--ink)",
            }}/>
          <button className="btn btn-primary" style={{ height: 28, padding: "0 10px" }}
            disabled={busy} onClick={() => submit()}>
            <Icon name="arrowUp" size={12}/>
          </button>
        </div>
        <div className="t-small faint" style={{ fontSize: 10.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>
          Powered by your operations data - {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isLive = message.streaming;
  const target = message.text || "";
  const streamed = useStream(isLive ? target : "", 12);
  const display = isLive ? streamed : target;

  if (isUser) {
    return (
      <div style={{
        alignSelf: "flex-end", maxWidth: "85%",
        padding: "8px 12px",
        background: "var(--ink)", color: "var(--ink-inverse)",
        borderRadius: "12px 12px 4px 12px",
        fontSize: 13, lineHeight: 1.45,
        animation: "insMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both",
      }}>
        {target}
      </div>
    );
  }
  return (
    <div style={{
      alignSelf: "flex-start", maxWidth: "92%",
      animation: "insMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both",
    }}>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        <AITag>AI</AITag>
        <span className="t-small subtle" style={{ fontSize: 10.5 }}>maqha</span>
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.55,
        color: "var(--ink-1)",
      }}>
        {display}
        {isLive && display.length < target.length && <span className="ins-caret"/>}
      </div>
      {!isLive && message.cite && (
        <div className="t-small subtle" style={{ fontSize: 10.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>
          rendered {message.cite} on canvas
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out infinite" }}/>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out 0.15s infinite" }}/>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out 0.3s infinite" }}/>
    </div>
  );
}

// ============================================================
// Main screen
// ============================================================
function InsightsScreen({ lang, bootstrap }) {
  const sourceMeta = useMemoIns(() => insightSourceMeta(bootstrap), [bootstrap]);
  const ar = lang === "ar";
  const [scene, setScene] = useStateIns("default");
  const [messages, setMessages] = useStateIns([
    {
      role: "ai",
      text: sourceMeta.empty
        ? (ar ? "لا توجد صفوف موثقة بعد. لن أعرض أي ملخص تجريبي." : "No verified rows are loaded yet. I will not show a demo summary in live-only mode.")
        : ar ? (SCENES.default.replyAr || SCENES.default.reply) : SCENES.default.reply,
      cite: sourceMeta.cite,
    },
  ]);
  const [busy, setBusy] = useStateIns(false);

  useEffectIns(() => {
    setMessages((items) => items.map((item, index) => (
      index === 0 && item.role === "ai"
        ? {
            ...item,
            text: sourceMeta.empty
              ? (ar ? "لا توجد صفوف موثقة بعد. لن أعرض أي ملخص تجريبي." : "No verified rows are loaded yet. I will not show a demo summary in live-only mode.")
              : item.text,
            cite: sourceMeta.cite,
          }
        : item
    )));
  }, [sourceMeta.cite, sourceMeta.empty, ar]);

  const sendQuestion = (q, sceneIdHint) => {
    if (sourceMeta.empty) {
      setMessages((m) => [
        ...m,
        { role: "user", text: q },
        {
          role: "ai",
          text: ar ? "لا توجد بيانات محرك موثقة للإجابة عليها الآن." : "There are no verified engine rows to answer from yet.",
          cite: sourceMeta.cite,
        },
      ]);
      return;
    }
    // pick the matching scene by keyword if no hint
    const guessed = sceneIdHint || guessScene(q);
    setMessages(m => [...m, { role: "user", text: q }]);
    setBusy(true);
    // after a brief "thinking", swap canvas + start streaming reply
    setTimeout(() => {
      setScene(guessed);
      const sceneObj = SCENES[guessed] || SCENES.default;
      const target = ar ? (sceneObj.replyAr || sceneObj.reply) : sceneObj.reply;
      setMessages(m => [...m, { role: "ai", text: target, streaming: true, cite: sourceMeta.cite }]);
      // mark stream complete after enough time
      const streamMs = Math.min(4500, target.length * 14 + 400);
      setTimeout(() => {
        setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, streaming: false } : x));
        setBusy(false);
      }, streamMs);
    }, 700);
  };

  const onSuggested = (s) => {
    if (busy) return;
    sendQuestion(s.text, s.id);
  };

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 100px)",
      margin: "-24px -28px",
      background: "var(--paper)",
    }}>
      {/* Inline animation rules */}
      <style>{`
        @keyframes insCardIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.98); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insBarGrow {
          0% { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes insBarRow {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes insStackGrow {
          0% { transform: scaleX(0); opacity: 0.6; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes insRowIn {
          0% { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insDotIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 0.85; }
        }
        @keyframes insMsgIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        .ins-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px 16px;
          padding-inline-start: 18px;
        }
        .ins-caret {
          display: inline-block; width: 1.5px; height: 13px;
          background: var(--ink-1); margin-left: 2px;
          vertical-align: -2px;
          animation: insBlink 0.85s steps(1) infinite;
        }
        @keyframes insBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>

      <div style={{ flex: 1, minWidth: 0 }}>
        <InsightCanvas sceneId={scene} sourceMeta={sourceMeta} lang={lang}/>
      </div>
      <ChatPanel
        messages={messages}
        sendQuestion={sendQuestion}
        busy={busy}
        onSuggested={onSuggested}
        sourceMeta={sourceMeta}
      />
    </div>
  );
}

function guessScene(q) {
  const s = q.toLowerCase();
  if (/zayouna|k-?04|behind|stockout|milk|oat|why/.test(s)) return "k04";
  if (/weekend|push|product|recommend/.test(s)) return "weekend";
  if (/waste|anomal|spoil|loss/.test(s)) return "waste";
  return "default";
}

// =============== KIOSKS ===============
const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const stockTone = (value) => value < 55 ? "crit" : value < 70 ? "warn" : "pos";
const wasteTone = (value) => value > 85 ? "crit" : value > 60 ? "warn" : "pos";
const statusTone = (status) => status === "good" ? "pos" : status === "warn" ? "warn" : "crit";

function HealthBar({ label, value, right, kind = "stock", compact = false }) {
  const safeValue = clampPercent(value);
  const tone = kind === "waste" ? wasteTone(safeValue) : stockTone(safeValue);
  const toneWord = tone === "crit" ? "critical" : tone === "warn" ? "watch" : "healthy";
  return (
    <div className={compact ? "health-bar compact" : "health-bar"}>
      <div className="between health-meta">
        <span>{label}</span>
        <span className="t-num">{right || `${safeValue}%`}</span>
      </div>
      <div
        className="health-track"
        role="progressbar"
        aria-label={`${label}: ${toneWord}, ${safeValue} percent`}
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${safeValue}% — ${toneWord}`}
      >
        <div className={`health-fill tone-${tone}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function KioskStatusBadge({ status }) {
  const label = status === "good" ? "Healthy" : status === "warn" ? "Watch" : "Critical";
  return <span className={`badge badge-${statusTone(status)}`}><span className={`dot ${statusTone(status)}`}></span>{label}</span>;
}

function WatchTile({ title, value, detail, tone, children }) {
  return (
    <div className={`card card-pad watch-tile watch-${tone}`}>
      <div className="between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="t-micro">{title}</div>
          <div className="t-num-big" style={{ marginTop: 8 }}>{value}</div>
        </div>
        <span className={`dot ${tone}`}></span>
      </div>
      <div className="t-small muted" style={{ marginTop: 8 }}>{detail}</div>
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function KioskCard({ kiosk, onPick }) {
  return (
    <button className={`card kiosk-card kiosk-${kiosk.status}`} onClick={onPick}>
      <div className="between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span className={`dot ${statusTone(kiosk.status)}`}></span>
            <div className="t-h2">{kiosk.name}</div>
          </div>
          <div className="t-small faint" style={{ marginTop: 3 }}>{kiosk.id} · {kiosk.city}</div>
        </div>
        <KioskStatusBadge status={kiosk.status} />
      </div>

      <div className="kiosk-card-metrics">
        <div>
          <div className="t-micro">Revenue</div>
          <div className="t-num">{fmtMoney(kiosk.revenue)}</div>
        </div>
        <div>
          <div className="t-micro">Orders</div>
          <div className="t-num">{kiosk.orders}</div>
        </div>
        <div>
          <div className="t-micro">Margin</div>
          <div className="t-num">{kiosk.margin}%</div>
        </div>
      </div>

      <HealthBar label="Stock health" value={kiosk.stockHealth} right={`${kiosk.stockHealth}%`} />
      <HealthBar label="Waste budget used" value={kiosk.wasteLoad} right={`${kiosk.waste}% waste`} kind="waste" />

      <div className="kiosk-issue">
        <div>
          <div className="t-small" style={{ fontWeight: 500 }}>{kiosk.issue}</div>
          <div className="t-small subtle">Risk item: {kiosk.criticalStock}</div>
        </div>
        <div className={`t-num ${kiosk.variance < -2 ? "delta-neg" : "muted"}`}>{kiosk.variance}%</div>
      </div>

      <div className="between">
        <div className="t-small subtle">7-day sales signal</div>
        <Spark data={kiosk.trend} width={84} height={22}/>
      </div>
    </button>
  );
}

function KiosksScreenPrevious({ lang, onPick, bootstrap }) {
  const [view, setView] = useState("list");
  const rows = odooKioskRows(bootstrap);
  const totalRevenue = rows.reduce((sum, k) => sum + k.revenue, 0);
  const avgMargin = rows.reduce((sum, k) => sum + k.margin, 0) / rows.length;
  const avgStock = Math.round(rows.reduce((sum, k) => sum + k.stockHealth, 0) / rows.length);
  const avgWasteLoad = Math.round(rows.reduce((sum, k) => sum + k.wasteLoad, 0) / rows.length);
  const problemCount = rows.filter(k => k.status !== "good").length;
  const stockRiskCount = rows.filter(k => k.stockHealth < 65).length;
  const wasteRiskCount = rows.filter(k => k.wasteLoad > 60).length;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="kiosk-kpi-grid">
        <KPI label="Active" value={String(rows.length)} footer="stock locations"/>
        <KPI label="Today's revenue" value={fmtMoney(totalRevenue)} delta="8.4%" deltaDir="up"/>
        <KPI label="Avg margin" value={`${avgMargin.toFixed(1)}%`} delta="0.8 pts" deltaDir="up"/>
        <KPI label="Need attention" value={String(problemCount)} footer="watch or critical"/>
      </div>

      <div className="ops-watch-grid">
        <WatchTile title="Problems now" value={String(problemCount)} detail="Kiosks with stock, waste, margin, or variance risk" tone={problemCount > 3 ? "crit" : "warn"}>
          <HealthBar compact label="Problem load" value={(problemCount / rows.length) * 100} right={`${problemCount}/${rows.length}`} kind="waste"/>
        </WatchTile>
        <WatchTile title="Stock inventory" value={`${avgStock}%`} detail={`${stockRiskCount} kiosks below the stock safety line`} tone={avgStock < 60 ? "crit" : avgStock < 75 ? "warn" : "pos"}>
          <HealthBar compact label="Average stock health" value={avgStock} right={`${avgStock}%`}/>
        </WatchTile>
        <WatchTile title="Waste tracker" value={`${avgWasteLoad}%`} detail={`${wasteRiskCount} kiosks above today's waste budget`} tone={avgWasteLoad > 75 ? "crit" : avgWasteLoad > 55 ? "warn" : "pos"}>
          <HealthBar compact label="Average waste budget used" value={avgWasteLoad} right={`${avgWasteLoad}%`} kind="waste"/>
        </WatchTile>
      </div>

      <div className="between kiosk-toolbar">
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" style={{ height: 28, fontSize: 12 }}>All cities <Icon name="chevDown" size={11}/></button>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>Status <Icon name="chevDown" size={11}/></button>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>Sort: risk first <Icon name="chevDown" size={11}/></button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="segmented" aria-label="Kiosk view">
            <button className={`seg-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}><Icon name="list" size={12}/>List</button>
            <button className={`seg-btn ${view === "cards" ? "active" : ""}`} onClick={() => setView("cards")}><Icon name="grid" size={12}/>Cards</button>
          </div>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>Add kiosk</button>
        </div>
      </div>

      {view === "list" ? (
        <div className="card kiosk-table-card">
          <div className="kiosk-table-scroll">
            <table className="tbl kiosk-health-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 32 }}></th>
                  <th scope="col">Kiosk</th>
                  <th scope="col">City</th>
                  <th scope="col" style={{ textAlign: "end" }}>Revenue</th>
                  <th scope="col" style={{ textAlign: "end" }}>Orders</th>
                  <th scope="col" style={{ textAlign: "end" }}>Margin</th>
                  <th scope="col">Stock inventory</th>
                  <th scope="col">Waste tracker</th>
                  <th scope="col">Issue</th>
                  <th scope="col">7-day</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(k => (
                  <tr
                    key={k.id}
                    className="row-click"
                    onClick={onPick}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(); } }}
                    aria-label={`${k.name}, ${k.city}, open kiosk details`}
                  >
                    <td><span className={`dot ${statusTone(k.status)}`}></span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{k.name}</div>
                      <div className="t-small faint">{k.id}</div>
                    </td>
                    <td className="muted">{k.city}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(k.revenue)}</td>
                    <td style={{ textAlign: "end" }} className="t-num muted">{k.orders}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{k.margin}%</td>
                    <td style={{ minWidth: 174 }}>
                      <HealthBar compact label="Stock" value={k.stockHealth} right={`${k.stockHealth}%`}/>
                    </td>
                    <td style={{ minWidth: 174 }}>
                      <HealthBar compact label="Waste" value={k.wasteLoad} right={`${k.waste}%`} kind="waste"/>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <div style={{ fontWeight: 500 }}>{k.issue}</div>
                      <div className="t-small subtle">{k.criticalStock} · variance <span className={`t-num ${k.variance < -2 ? "delta-neg" : "muted"}`}>{k.variance}%</span></div>
                    </td>
                    <td><Spark data={k.trend} width={70} height={20}/></td>
                    <td><Icon name="chevRight" size={13} style={{ color: "var(--ink-3)" }}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="kiosk-card-grid">
          {rows.map(k => <KioskCard key={k.id} kiosk={k} onPick={onPick}/>)}
        </div>
      )}
    </div>
  );
}

const WASTE_TARGET = 4.0;

function deriveKioskOps(k) {
  const code = String(k.id || "K-00");
  const a = code.charCodeAt(2) || code.charCodeAt(0) || 75;
  const b = code.charCodeAt(3) || code.charCodeAt(code.length - 1) || 48;
  const seed = (a * 13 + b * 7) % 24;
  let inv;
  if (k.status === "good") inv = 66 + seed;
  else if (k.status === "warn") inv = 38 + (seed % 24);
  else inv = 18 + (seed % 16);
  const slots = 24;
  const lowItems = k.status === "crit" ? 5 + (seed % 3) : k.status === "warn" ? 2 + (seed % 2) : (seed % 2);
  const critItems = k.status === "crit" ? 2 + (seed % 2) : k.status === "warn" ? (seed % 2) : 0;
  const hours = k.status === "crit" ? 2 + (seed % 4) : k.status === "warn" ? 6 + (seed % 6) : 18 + (seed % 24);
  const queue = seed % 5;
  const lastSale = (seed % 50) + 4;
  return { inv: Math.min(96, Math.max(8, k.stockHealth || inv)), lowItems, critItems, slots, hours, queue, lastSale };
}

function InventoryMeter({ pct, status }) {
  const segs = 14;
  const filled = Math.round((pct / 100) * segs);
  const color = status === "crit" ? "var(--crit)" : status === "warn" ? "var(--warn)" : "var(--pos)";
  return (
    <div style={{ display: "flex", gap: 2, height: 10 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} style={{
          flex: 1,
          background: i < filled ? color : "var(--surface-sunk)",
          borderRadius: 1.5,
          opacity: i < filled ? (i < filled - 2 ? 1 : 0.85) : 1,
          transition: "background 400ms ease",
        }}/>
      ))}
    </div>
  );
}

function WasteMeter({ pct, status }) {
  const scale = 8;
  const fillW = Math.min(100, (pct / scale) * 100);
  const targetX = (WASTE_TARGET / scale) * 100;
  const over = pct > WASTE_TARGET;
  const color = over ? (status === "crit" ? "var(--crit)" : "var(--warn)") : "var(--ink-1)";
  return (
    <div style={{ position: "relative", height: 10, marginTop: 4 }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--surface-sunk)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, width: `${fillW}%`,
          background: color, opacity: over ? 0.9 : 0.75,
          transition: "width 600ms ease, background 400ms ease",
        }}/>
      </div>
      <div style={{
        position: "absolute", top: -3, bottom: -3, left: `${targetX}%`,
        width: 1.5, marginLeft: -0.75, background: "var(--ink-1)", opacity: 0.55,
      }}/>
      <div style={{
        position: "absolute", top: -5, left: `calc(${targetX}% - 3px)`,
        width: 6, height: 4, background: "var(--ink-1)", opacity: 0.6,
        clipPath: "polygon(50% 100%, 0 0, 100% 0)",
      }}/>
    </div>
  );
}

function LivePulse({ status }) {
  const color = status === "crit" ? "var(--crit)" : status === "warn" ? "var(--warn)" : "var(--pos)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ position: "relative", width: 6, height: 6 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }}/>
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%", background: color,
          opacity: 0.35, animation: "kioskPulse 1.6s ease-out infinite",
        }}/>
      </span>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-3)" }}>LIVE</span>
    </span>
  );
}

function kioskOperationalStatus(k) {
  const issue = String(k.issue || "").toLowerCase();
  if (issue.includes("variance")) return "variance issue";
  if (issue.includes("closing")) return "needs closing";
  if (Number(k.stockHealth || 0) < 55 || Number(k.ops?.inv || 100) < 55) return "low stock";
  if (k.status === "crit") return "needs closing";
  if (k.status === "warn") return "open / watch";
  return "open";
}

function RealtimeKioskCard({ k, ops, onPick }) {
  const statusLabel = kioskOperationalStatus({ ...k, ops });
  const badgeClass = k.status === "good" ? "badge-pos" : k.status === "warn" ? "badge-warn" : "badge-crit";
  return (
    <div className="card" onClick={onPick} style={{
      display: "flex", flexDirection: "column",
      cursor: "pointer", overflow: "hidden",
      transition: "border-color 100ms ease, box-shadow 100ms ease, transform 100ms ease",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--line-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
    >
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="between" style={{ marginBottom: 4 }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <span className={`badge ${badgeClass}`} style={{ height: 18, fontSize: 10.5 }}>{statusLabel}</span>
            <span className="t-small faint t-num">{k.id}</span>
          </div>
          <LivePulse status={k.status}/>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{k.name}</div>
        <div className="t-small subtle" style={{ marginTop: 2 }}>
          {k.city} · {k.staff || 3} staff · {ops.queue > 0 ? `${ops.queue} in queue` : `sale ${ops.lastSale}s ago`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ padding: "10px 12px 10px 16px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>Revenue</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(k.revenue)}</div>
        </div>
        <div style={{ padding: "10px 12px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>Orders</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{k.orders}</div>
        </div>
        <div style={{ padding: "10px 16px 10px 12px" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>Margin</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{k.margin}%</div>
        </div>
      </div>

      <div style={{ padding: "14px 16px 8px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">Inventory</span>
          <span className="t-num" style={{ fontSize: 12.5, fontWeight: 500 }}>{ops.inv}%</span>
        </div>
        <InventoryMeter pct={ops.inv} status={k.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>
          {ops.critItems > 0
            ? <><span style={{ color: "var(--crit)" }}>{ops.critItems} critical</span> · {ops.lowItems} low · {ops.slots - ops.critItems - ops.lowItems} stocked</>
            : ops.lowItems > 0
              ? <><span style={{ color: "var(--warn)" }}>{ops.lowItems} low</span> · {ops.slots - ops.lowItems} stocked · runout ~{ops.hours}h</>
              : <>{ops.slots} items in good standing · runout {ops.hours}h+</>
          }
        </div>
      </div>

      <div style={{ padding: "10px 16px 14px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">Waste today</span>
          <div className="row" style={{ gap: 8 }}>
            <span className="t-small subtle" style={{ fontSize: 11 }}>target {WASTE_TARGET}%</span>
            <span className={"t-num " + (k.waste > WASTE_TARGET ? "delta-neg" : "")} style={{ fontSize: 12.5, fontWeight: 500 }}>{Number(k.waste).toFixed(1)}%</span>
          </div>
        </div>
        <WasteMeter pct={k.waste} status={k.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>
          IQD {Math.round(k.revenue * k.waste / 100).toLocaleString()} estimated loss
          {k.waste > WASTE_TARGET && <> · <span style={{ color: "var(--warn)" }}>{(k.waste - WASTE_TARGET).toFixed(1)} pts over</span></>}
        </div>
      </div>
    </div>
  );
}

function KiosksScreen({ lang, onPick, bootstrap, sync, sourceOfTruth, refreshOdoo }) {
  const [view, setView] = useState("cards");
  const [city, setCity] = useState("all");
  const [sortBy, setSortBy] = useState("status");
  const rows = odooKioskRows(bootstrap);
  const [tick, setTick] = useState(0);

  const setup = unwrapOdoo(sync?.warehouseSetup) || DEMO_WAREHOUSE_SETUP;
  const enabled = Boolean(sourceOfTruth?.enabled);
  const [kioskModalOpen, setKioskModalOpen] = useState(false);
  const [kioskBusy, setKioskBusy] = useState(false);
  const [kioskError, setKioskError] = useState("");
  const [kioskDraft, setKioskDraft] = useState({
    kioskCode: "K-11",
    name: "New Kiosk",
    city: "Baghdad",
    area: "Mansour",
    warehouse: "",
  });
  useEffect(() => {
    setKioskDraft((d) => d.warehouse ? d : { ...d, warehouse: setup.warehouses?.[0]?.id || setup.warehouses?.[0]?.code || "" });
  }, [setup.warehouses]);

  const submitKiosk = async (event) => {
    event.preventDefault();
    if (!enabled) return;
    setKioskBusy(true);
    setKioskError("");
    try {
      await sourceOfTruth.createKiosk(kioskDraft);
      await refreshOdoo?.();
      setKioskModalOpen(false);
    } catch (error) {
      setKioskError(compactError(error));
    } finally {
      setKioskBusy(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3200);
    return () => clearInterval(id);
  }, []);

  const live = useMemo(() => rows.map((k, i) => {
    const ops = deriveKioskOps(k);
    const phase = (tick + i) % 6;
    const revBump = phase * 4 + (i * 3) % 11;
    const ordBump = phase % 3;
    const invJitter = ((tick * (i + 1)) % 5) - 2;
    const wasteJitter = (((tick + i * 2) % 7) - 3) * 0.04;
    return {
      ...k,
      revenue: k.revenue + revBump * 6,
      orders: k.orders + ordBump,
      waste: Math.max(0.4, Number(k.waste || 0) + wasteJitter),
      ops: { ...ops, inv: Math.max(8, Math.min(96, ops.inv + invJitter)) },
    };
  }), [rows, tick]);

  const cities = ["all", ...new Set(rows.map(k => k.city))];
  const sorted = useMemo(() => {
    let arr = city === "all" ? live : live.filter(k => k.city === city);
    arr = [...arr];
    if (sortBy === "status") {
      const order = { crit: 0, warn: 1, good: 2 };
      arr.sort((a, b) => order[a.status] - order[b.status] || b.revenue - a.revenue);
    } else if (sortBy === "revenue") arr.sort((a, b) => b.revenue - a.revenue);
    else if (sortBy === "waste") arr.sort((a, b) => b.waste - a.waste);
    else if (sortBy === "inventory") arr.sort((a, b) => a.ops.inv - b.ops.inv);
    return arr;
  }, [live, city, sortBy]);

  const counts = useMemo(() => ({
    crit: live.filter(k => k.status === "crit").length,
    warn: live.filter(k => k.status === "warn").length,
    good: live.filter(k => k.status === "good").length,
    avgInv: live.length ? Math.round(live.reduce((s, k) => s + k.ops.inv, 0) / live.length) : 0,
    avgWaste: live.length ? (live.reduce((s, k) => s + k.waste, 0) / live.length).toFixed(1) : "0.0",
  }), [live]);

  return (
    <div className="col" style={{ gap: 14 }}>
      <style>{`
        @keyframes kioskPulse {
          0% { transform: scale(0.8); opacity: 0.55; }
          70% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label="Active" value={String(rows.length)} footer={`${counts.good} ok · ${counts.warn} watch · ${counts.crit} crit`}/>
        <KPI label="Today's revenue" value={fmtMoney(live.reduce((s, k) => s + k.revenue, 0))} delta="8.4%" deltaDir="up"/>
        <KPI label="Avg inventory" value={`${counts.avgInv}%`} footer="across fleet"/>
        <KPI label="Avg waste" value={`${counts.avgWaste}%`} delta={`target ${WASTE_TARGET}%`} deltaDir={parseFloat(counts.avgWaste) <= WASTE_TARGET ? "up" : "down"}/>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 2px" }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {cities.map(c => (
            <button key={c} onClick={() => setCity(c)}
              className={"btn " + (city === c ? "btn-primary" : "btn-ghost")}
              style={{ height: 28, fontSize: 12 }}>
              {c === "all" ? "All cities" : c}
              {c !== "all" && <span className="subtle" style={{ marginInlineStart: 4, fontSize: 11 }}>{rows.filter(k => k.city === c).length}</span>}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="t-small subtle" style={{ fontSize: 11.5 }}>Sort</span>
          <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", height: 28 }}>
            {[
              { id: "status", l: "Status" },
              { id: "revenue", l: "Revenue" },
              { id: "inventory", l: "Inventory" },
              { id: "waste", l: "Waste" },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                style={{
                  padding: "0 10px", fontSize: 12,
                  background: sortBy === s.id ? "var(--surface-sunk)" : "transparent",
                  color: sortBy === s.id ? "var(--ink)" : "var(--ink-2)",
                  borderInlineEnd: "1px solid var(--line-soft)",
                }}>{s.l}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", height: 28 }}>
            <button onClick={() => setView("cards")}
              title="Cards"
              style={{
                width: 32, display: "grid", placeItems: "center",
                background: view === "cards" ? "var(--surface-sunk)" : "transparent",
                color: view === "cards" ? "var(--ink)" : "var(--ink-3)",
                borderInlineEnd: "1px solid var(--line-soft)",
              }}><Icon name="grid" size={13}/></button>
            <button onClick={() => setView("table")}
              title="Table"
              style={{
                width: 32, display: "grid", placeItems: "center",
                background: view === "table" ? "var(--surface-sunk)" : "transparent",
                color: view === "table" ? "var(--ink)" : "var(--ink-3)",
              }}><Icon name="list" size={13}/></button>
          </div>
          <button type="button" className="btn btn-primary"
            onClick={() => { setKioskError(""); setKioskModalOpen(true); }}
            disabled={!enabled}
            style={{ height: 28, fontSize: 12 }}>
            <Icon name="plus" size={12}/> Create kiosk location
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {sorted.map(k => <RealtimeKioskCard key={k.id} k={k} ops={k.ops} onPick={() => onPick(k)}/>)}
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col" style={{ width: 32 }}></th>
                <th scope="col">Kiosk</th>
                <th scope="col">City</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: "end" }}>Revenue today</th>
                <th scope="col" style={{ textAlign: "end" }}>Orders</th>
                <th scope="col" style={{ width: 160 }}>Inventory</th>
                <th scope="col" style={{ width: 160 }}>Waste</th>
                <th scope="col" style={{ textAlign: "end" }}>Margin</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(k => (
                <tr
                  key={k.id}
                  className="row-click"
                  onClick={() => onPick(k)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(k); } }}
                  aria-label={`${k.name}, open kiosk details`}
                >
                  <td><span className={`dot ${statusTone(k.status)}`}></span></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{k.name}</div>
                    <div className="t-small faint">{k.id}</div>
                  </td>
                  <td className="muted">{k.city}</td>
                  <td><span className={`badge ${k.status === "good" ? "badge-pos" : k.status === "warn" ? "badge-warn" : "badge-crit"}`}>{kioskOperationalStatus(k)}</span></td>
                  <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(k.revenue)}</td>
                  <td style={{ textAlign: "end" }} className="t-num muted">{k.orders}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><InventoryMeter pct={k.ops.inv} status={k.status}/></div>
                      <span className="t-num" style={{ fontSize: 11.5, width: 28, textAlign: "end" }}>{k.ops.inv}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><WasteMeter pct={k.waste} status={k.status}/></div>
                      <span className={"t-num " + (k.waste > WASTE_TARGET ? "delta-neg" : "")} style={{ fontSize: 11.5, width: 32, textAlign: "end" }}>{k.waste.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "end" }} className="t-num">{k.margin}%</td>
                  <td><Icon name="chevRight" size={13} style={{ color: "var(--ink-3)" }}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={kioskModalOpen} onClose={() => !kioskBusy && setKioskModalOpen(false)}
        title="Create kiosk location"
        sub="Creates stock.location + POS config + Bayaan kiosk">
        <form onSubmit={submitKiosk}>
          <div className="col" style={{ gap: 10 }}>
            {!enabled && (
              <div className="t-small muted" style={{ padding: 10, background: "var(--warn-soft)", borderRadius: 8 }}>
                Backend engine is not configured in this browser session. Set the backend URL and sign in to create real records.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "0.55fr 1fr", gap: 10 }}>
              <div>
                <label className="t-small muted">Code</label>
                <input className="input" value={kioskDraft.kioskCode} onChange={(event) => setKioskDraft({ ...kioskDraft, kioskCode: event.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="t-small muted">Name</label>
                <input className="input" value={kioskDraft.name} onChange={(event) => setKioskDraft({ ...kioskDraft, name: event.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="t-small muted">City</label>
                <input className="input" value={kioskDraft.city} onChange={(event) => setKioskDraft({ ...kioskDraft, city: event.target.value })} />
              </div>
              <div>
                <label className="t-small muted">Area</label>
                <input className="input" value={kioskDraft.area} onChange={(event) => setKioskDraft({ ...kioskDraft, area: event.target.value })} />
              </div>
            </div>
            <label className="t-small muted">Parent warehouse</label>
            <select className="input" value={kioskDraft.warehouse} onChange={(event) => setKioskDraft({ ...kioskDraft, warehouse: event.target.value })}>
              {(setup.warehouses || []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
            {kioskError && <div className="t-small delta-neg">{kioskError}</div>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setKioskModalOpen(false)} disabled={kioskBusy}>Cancel</button>
              <button type="submit" className="btn btn-primary"
                disabled={!enabled || kioskBusy || !(setup.warehouses || []).length}
                style={{ justifyContent: "center" }}>
                <Icon name="plus" size={12}/> {kioskBusy ? "Creating…" : "Create synced kiosk"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function KiosksScreenLegacy({ lang, onPick }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "أكشاك نشطة" : "Active"} value="10" footer={ar ? "٣ مدن" : "3 cities"}/>
        <KPI label={ar ? "إيرادات اليوم" : "Today's revenue"} value={fmtMoney(142680)} delta="8.4%" deltaDir="up"/>
        <KPI label={ar ? "متوسط الهامش" : "Avg margin"} value="28.4%" delta="0.8 pts" deltaDir="up"/>
        <KPI label={ar ? "تحتاج اهتمام" : "Need attention"} value="3" footer={ar ? "حذرة أو حرجة" : "watch or critical"}/>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 28, fontSize: 12 }}>{ar ? "كل المدن" : "All cities"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "الحالة" : "Status"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "ترتيب: الإيرادات" : "Sort: revenue"} <Icon name="chevDown" size={11}/></button>
          </div>
          <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "إضافة" : "Add kiosk"}</button>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" style={{ width: 32 }}></th>
              <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
              <th scope="col">{ar ? "المدينة" : "City"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "إيرادات اليوم" : "Revenue today"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الطلبات" : "Orders"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "متوسط الطلب" : "Avg order"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الهامش" : "Margin"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الهدر" : "Waste"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الموظفون" : "Staff"}</th>
              <th scope="col">{ar ? "اتجاه ٧ أيام" : "7-day"}</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {MOCK.kiosks.map(k => (
              <tr
                key={k.id}
                className="row-click"
                onClick={onPick}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(); } }}
                aria-label={`${k.name}, open kiosk details`}
              >
                <td><span className={`dot ${k.status === "good" ? "pos" : k.status === "warn" ? "warn" : "crit"}`}></span></td>
                <td>
                  <div style={{ fontWeight: 500 }}>{k.name}</div>
                  <div className="t-small faint">{k.id}</div>
                </td>
                <td className="muted">{k.city}</td>
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(k.revenue)}</td>
                <td style={{ textAlign: "end" }} className="t-num muted">{k.orders}</td>
                <td style={{ textAlign: "end" }} className="t-num muted">IQD {Math.round(k.revenue/k.orders).toLocaleString("en")}</td>
                <td style={{ textAlign: "end" }} className="t-num">{k.margin}%</td>
                <td style={{ textAlign: "end" }}>
                  <span className={"t-num " + (k.waste > 4 ? "delta-neg" : "muted")}>{k.waste}%</span>
                </td>
                <td style={{ textAlign: "end" }} className="t-num muted">{k.staff}</td>
                <td><Spark data={k.trend} width={70} height={20}/></td>
                <td><Icon name="chevRight" size={13} style={{ color: "var(--ink-3)" }}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// =============== KIOSK DETAIL ===============
function KioskDetailScreenLegacy({ lang, onBack }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 16 }}>
      <button className="btn btn-quiet" style={{ width: "fit-content", fontSize: 12, height: 26 }} onClick={onBack}>
        <Icon name={ar ? "chevRight" : "chevLeft"} size={11}/> {ar ? "كل الأكشاك" : "All kiosks"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KPI label={ar ? "اليوم" : "Today"} value={fmtMoney(18420)} delta="11%" deltaDir="up" sparkData={[12,14,15,17,16,18,22]}/>
        <KPI label={ar ? "الطلبات" : "Orders"} value="412" delta="6%" deltaDir="up"/>
        <KPI label={ar ? "متوسط الانتظار" : "Avg wait"} value="2:18" sub={ar ? "دقيقة" : "min"} delta="0:12 faster" deltaDir="up"/>
        <KPI label={ar ? "الهامش" : "Margin"} value="31.2%" delta="0.4 pts" deltaDir="up"/>
        <KPI label={ar ? "تقييم العملاء" : "CSAT"} value="4.7" sub="/5" footer="42 reviews"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card card-pad">
          <SectionHead title={ar ? "أعلى المنتجات اليوم" : "Top items today"}/>
          <table className="tbl">
            <tbody>
              {[
                ["Iced Latte", 86, 2064, 24],
                ["Pistachio Cake", 42, 1344, 32],
                ["Cappuccino", 78, 1716, 22],
                ["Croissant — Plain", 64, 768, 12],
                ["Mint Lemonade", 38, 836, 22],
              ].map(([n, q, rev, p], i) => (
                <tr key={i}>
                  <td>{n}</td>
                  <td className="muted t-num" style={{ textAlign: "end" }}>×{q}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(rev)}</td>
                  <td style={{ width: 100, textAlign: "end" }}>
                    <div style={{ height: 4, background: "var(--surface-sunk)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${(q/86)*100}%`, background: "var(--ink)", borderRadius: 2 }}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad">
          <SectionHead title={ar ? "الفريق المناوب" : "Shift roster"}/>
          <div className="col" style={{ gap: 10 }}>
            {[
              { n: "Maya Ahmed", r: "Cashier", h: "07:00 — 15:00", on: true },
              { n: "Yusuf Saleh", r: "Barista", h: "07:00 — 15:00", on: true },
              { n: "Sara Younis", r: "Barista", h: "15:00 — 23:00", on: false },
              { n: "Omar Khaled", r: "Supervisor", h: "All day", on: true },
            ].map(s => (
              <div key={s.n} className="row" style={{ gap: 10 }}>
                <Avatar name={s.n} size={26}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.n}</div>
                  <div className="t-small subtle">{s.r} · {s.h}</div>
                </div>
                <span className={`badge ${s.on ? "badge-pos" : ""}`}>{s.on ? (ar ? "في الخدمة" : "On shift") : (ar ? "لاحقاً" : "Later")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <SectionHead title={ar ? "ملاحظات الذكاء" : "AI notes for this kiosk"} sub={ar ? "آخر ٧ أيام" : "Last 7 days"}/>
        <div className="col" style={{ gap: 14, marginTop: 4 }}>
          <div className="ai-block">
            <div style={{ fontWeight: 500, fontSize: 14 }}>{ar ? "وقت الذروة يبدأ متأخراً ١٥ دقيقة" : "Peak start has shifted 15 min later vs last month"}</div>
            <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
              {ar ? "حدّث جدول التحضير المسبق ليبدأ ٧:٤٥ بدلاً من ٧:٣٠. سيوفر ~٤٠ كوب يومياً من الإعداد المبكر." : "Adjust pre-prep window to start at 7:45 instead of 7:30. Saves ~40 cups of early-prep waste per day."}
            </div>
          </div>
          <div className="ai-block">
            <div style={{ fontWeight: 500, fontSize: 14 }}>{ar ? "العصائر متفوقة على المتوقع" : "Juice mix outperforming forecast by 22%"}</div>
            <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
              {ar ? "المانجو والفراولة مرتبطان بالعطلة الأسبوعية. زد طلب الفاكهة بنسبة ١٥٪ للأسبوع القادم." : "Mango and strawberry track weekend pull. Increase fruit standing order by 15% for next week."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



function KioskDetailScreen({ lang, onBack, kiosk, bootstrap }) {
  const ar = lang === "ar";
  const selected = kiosk || MOCK.kiosks[0];
  const [tab, setTab] = useState("currentStock");
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const stockRows = odooKioskStockReconciliationRows(bootstrap, selected) || (liveOnly ? [] : MOCK.kioskStockDetails[selected.id] || MOCK.kioskStockDetails["K-01"]);
  const orders = odooPosOrderRows(bootstrap).filter((order) => matchesKiosk(order.kioskId || order.kiosk, selected));
  const visibleOrders = orders.length ? orders : liveOnly ? [] : MOCK.posOrders.slice(0, 4);
  const closing = odooClosingRows(bootstrap).find((c) => matchesKiosk(c.kioskId || c.kioskName, selected));
  const movementRows = odooKioskStockMovementRows(bootstrap, selected);
  const demoMovementRows = [
    { id: "demo-open", time: "07:00", action: "Opening stock count", detail: "Posted by cashier", source: "stock.quant" },
    { id: "demo-transfer", time: "09:15", action: "Transfer received", detail: "Main Warehouse -> kiosk location", source: "stock.picking" },
    { id: "demo-consumption", time: "14:42", action: "Recipe deduction", detail: "10 x Orange Juice 350ml", source: "bayaan.consumption.ledger" },
    { id: "demo-waste", time: "15:10", action: "Waste recorded", detail: "Wrong order / spill", source: "bayaan.waste.entry" },
  ];
  const visibleMovementRows = movementRows.length ? movementRows : liveOnly ? [] : demoMovementRows;
  const fmtQty = (value, unit) => `${Number(value).toLocaleString("en", { maximumFractionDigits: 2 })} ${unit}`;
  const tabs = [
    { id: "overview", label: ar ? "نظرة عامة" : "Overview" },
    { id: "sales", label: ar ? "المبيعات" : "Sales" },
    { id: "currentStock", label: ar ? "المخزون الحالي" : "Current stock" },
    { id: "movements", label: ar ? "حركات المخزون" : "Stock movements" },
    { id: "waste", label: ar ? "الهدر" : "Waste/loss" },
    { id: "sessions", label: ar ? "جلسات POS" : "POS sessions" },
    { id: "closings", label: ar ? "الإغلاقات" : "Daily closings" },
    { id: "staff", label: ar ? "الموظفون" : "Staff" },
  ];

  const renderStatus = (status) => {
    const badge = status === "issue" ? "badge-crit" : status === "watch" ? "badge-warn" : "badge-pos";
    const label = status === "issue" ? (ar ? "مراجعة" : "Issue") : status === "watch" ? (ar ? "متابعة" : "Watch") : (ar ? "سليم" : "OK");
    return <span className={`badge ${badge}`}>{label}</span>;
  };

  const renderCurrentStock = () => (
    <div className="card">
      <div className="between" style={{ padding: "14px 18px" }}>
        <div>
          <div className="t-h2">{ar ? "حلقة المخزون اليومية" : "Daily stock reconciliation"}</div>
          <div className="t-small subtle">
            {ar
              ? "افتتاح + مستلم - استهلاك POS بالوصفة - هدر = المتبقي المتوقع"
              : "Opening + received - POS recipe consumption - recorded waste = expected remaining"}
          </div>
        </div>
        <span className="badge badge-ai">{ar ? "مصدرها bayaan.shift.close" : "bayaan.shift.close shape"}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 1120 }}>
          <thead>
            <tr>
              <th scope="col">{ar ? "المكون / البند" : "Ingredient / item"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "افتتاح" : "Opening stock"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "مستلم اليوم" : "Received today"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "استهلاك POS" : "Expected consumed from POS sales"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "هدر مسجل" : "Recorded waste"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "متبقي متوقع" : "Expected remaining"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "عد فعلي" : "Actual counted"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الفرق" : "Variance"}</th>
              <th scope="col">{ar ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {stockRows.map((row) => (
              <tr key={row.item}>
                <td>
                  <div style={{ fontWeight: 500 }}>{row.item}</div>
                  <div className="t-small faint">{row.unit}</div>
                </td>
                <td className="t-num muted" style={{ textAlign: "end" }}>{fmtQty(row.opening, row.unit)}</td>
                <td className="t-num muted" style={{ textAlign: "end" }}>{fmtQty(row.received, row.unit)}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtQty(row.consumed, row.unit)}</td>
                <td className="t-num muted" style={{ textAlign: "end" }}>{fmtQty(row.waste, row.unit)}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtQty(row.expected, row.unit)}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtQty(row.actual, row.unit)}</td>
                <td className="t-num" style={{
                  textAlign: "end",
                  color: row.variance < 0 ? "var(--crit)" : row.variance > 0 ? "var(--pos)" : "var(--ink-3)",
                }}>
                  {row.variance > 0 ? "+" : ""}{fmtQty(row.variance, row.unit)}
                </td>
                <td>{renderStatus(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="card">
      <div className="between" style={{ padding: "14px 18px" }}>
        <div className="t-h2">{ar ? "مبيعات POS المباشرة" : "Live POS orders"}</div>
        <span className="t-small subtle">{selected.id} - {selected.name}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">{ar ? "الوقت" : "Time"}</th>
            <th scope="col">{ar ? "الطلب" : "Order"}</th>
            <th scope="col">{ar ? "الكاشير" : "Cashier"}</th>
            <th scope="col">{ar ? "المنتج" : "Product sold"}</th>
            <th scope="col">{ar ? "الدفع" : "Payment method"}</th>
            <th scope="col" style={{ textAlign: "end" }}>{ar ? "المبلغ" : "Amount"}</th>
            <th scope="col">{ar ? "الحالة" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleOrders.map((order) => (
            <tr key={order.id}>
              <td className="t-num muted">{order.time}</td>
              <td>{order.id}</td>
              <td className="muted">{order.cashier}</td>
              <td>{order.qty} x {order.product}</td>
              <td className="muted">{order.payment}</td>
              <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(order.amount)}</td>
              <td><span className={`badge ${order.status === "paid" ? "badge-pos" : "badge-warn"}`}>{order.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMovements = () => (
    <div className="card card-pad">
      <SectionHead title={ar ? "حركات المخزون" : "Stock movements"} sub={ar ? "افتتاح، تحويلات، استهلاك، هدر" : "Opening counts, transfers, recipe consumption, and waste"} />
      <table className="tbl">
        <tbody>
          {visibleMovementRows.map((row) => (
            <tr key={row.id}>
              <td className="t-num muted" style={{ width: 84 }}>{row.time}</td>
              <td>{row.action}</td>
              <td className="muted">{row.detail}</td>
              <td><span className="badge">{row.source}</span></td>
            </tr>
          ))}
          {!visibleMovementRows.length && (
            <tr>
              <td colSpan={4} className="muted" style={{ padding: 18, textAlign: "center" }}>
                {ar ? "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ù…Ø®Ø²ÙˆÙ† Ù„Ù‡Ø°Ø§ Ø§Ù„ÙƒØ´Ùƒ Ø§Ù„ÙŠÙˆÙ…" : "No stock movements for this kiosk today."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderWaste = () => (
    <div className="card card-pad">
      <SectionHead title={ar ? "الهدر والخسارة" : "Waste and loss"} sub={ar ? "الأسباب التي تؤثر على الفرق" : "Reasons that feed variance investigation"} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <KPI label={ar ? "هدر اليوم" : "Waste today"} value={fmtMoney(Math.round(selected.revenue * selected.waste / 100))} footer={`${selected.waste}% of sales`} />
        <KPI label={ar ? "فرق المخزون" : "Stock variance"} value={`${selected.variance}%`} delta={selected.variance < -2 ? "review" : "within tolerance"} deltaDir={selected.variance < -2 ? "down" : "up"} />
        <KPI label={ar ? "عنصر حساس" : "Sensitive item"} value={selected.criticalStock} footer={selected.issue} />
      </div>
      <div className="ai-block">
        <div style={{ fontWeight: 500 }}>{ar ? "كل سبب هدر يجب أن يطابق بند مخزون" : "Each waste reason must tie back to a stock item"}</div>
        <div className="t-small muted" style={{ marginTop: 4 }}>
          {ar
            ? "الهدر غير المسجل يظهر كفرق بين المتوقع والمعدود عند الإغلاق."
            : "Unrecorded waste appears as the gap between expected and counted stock at close."}
        </div>
      </div>
    </div>
  );

  const renderSessions = () => (
    <div className="card card-pad">
      <SectionHead title={ar ? "جلسات POS" : "POS sessions"} sub={ar ? "جلسات نقطة البيع المرتبطة بالكشك" : "POS sessions tied to this kiosk"} />
      <table className="tbl">
        <tbody>
          {[
            ["Morning", "07:00", "15:00", "Maya Ahmed", "closed"],
            ["Evening", "15:00", "23:00", "Sara Younis", selected.status === "crit" ? "needs closing" : "open"],
          ].map(([name, open, close, cashier, status]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="t-num muted">{open}</td>
              <td className="t-num muted">{close}</td>
              <td>{cashier}</td>
              <td><span className={`badge ${status === "closed" ? "badge-pos" : status === "needs closing" ? "badge-crit" : "badge-warn"}`}>{status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderClosings = () => (
    <div className="card card-pad">
      <SectionHead title={ar ? "الإغلاق اليومي" : "Daily closing"} sub={ar ? "نقد ومخزون وموافقة المدير" : "Cash, stock, and manager approval"} />
      {closing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <KPI label={ar ? "المبيعات" : "Sales"} value={fmtMoney(closing.sales)} />
          <KPI label={ar ? "نقد متوقع" : "Expected cash"} value={fmtMoney(closing.expectedCash)} />
          <KPI label={ar ? "مدفوعات رقمية" : "Digital payments"} value={fmtMoney(closing.digitalPayments || 0)} />
          <KPI label={ar ? "نقد معدود" : "Counted cash"} value={closing.countedCash == null ? "Open" : fmtMoney(closing.countedCash)} />
          <KPI label={ar ? "فرق النقد" : "Cash variance"} value={closing.cashVariance == null ? "-" : fmtMoney(closing.cashVariance)} delta={closing.status} deltaDir={closing.cashVariance < 0 ? "down" : "up"} />
        </div>
      ) : (
        <div className="t-small muted">{ar ? "لا يوجد إغلاق لهذا الكشك اليوم." : "No close recorded for this kiosk today."}</div>
      )}
    </div>
  );

  const renderStaff = () => (
    <div className="card card-pad">
      <SectionHead title={ar ? "الفريق المناوب" : "Shift roster"} />
      <div className="col" style={{ gap: 10 }}>
        {[
          { n: "Maya Ahmed", r: "Cashier", h: "07:00 - 15:00", on: true },
          { n: "Yusuf Saleh", r: "Barista", h: "07:00 - 15:00", on: true },
          { n: "Sara Younis", r: "Barista", h: "15:00 - 23:00", on: selected.status !== "good" },
          { n: "Omar Khaled", r: "Supervisor", h: "All day", on: true },
        ].map((s) => (
          <div key={s.n} className="row" style={{ gap: 10 }}>
            <Avatar name={s.n} size={26} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{s.n}</div>
              <div className="t-small subtle">{s.r} - {s.h}</div>
            </div>
            <span className={`badge ${s.on ? "badge-pos" : ""}`}>{s.on ? (ar ? "في الخدمة" : "On shift") : (ar ? "لاحقا" : "Later")}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderOverview = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
      {renderOrders()}
      <div className="card card-pad">
        <SectionHead title={ar ? "ملاحظات الذكاء" : "AI notes for this kiosk"} sub={ar ? "آخر ٧ أيام" : "Last 7 days"} />
        <div className="ai-block">
          <div style={{ fontWeight: 500, fontSize: 14 }}>{selected.issue}</div>
          <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
            {ar
              ? "الذكاء يعرض ملخصا فقط. الأرقام الرسمية تأتي من أوامر POS، دفتر الاستهلاك، وإغلاق الوردية."
              : "AI summarizes only. Official numbers come from POS orders, the consumption ledger, and shift close rows."}
          </div>
        </div>
      </div>
    </div>
  );

  const content = {
    overview: renderOverview(),
    sales: renderOrders(),
    currentStock: renderCurrentStock(),
    movements: renderMovements(),
    waste: renderWaste(),
    sessions: renderSessions(),
    closings: renderClosings(),
    staff: renderStaff(),
  }[tab];

  return (
    <div className="col" style={{ gap: 16 }}>
      <button className="btn btn-quiet" style={{ width: "fit-content", fontSize: 12, height: 26 }} onClick={onBack}>
        <Icon name={ar ? "chevRight" : "chevLeft"} size={11}/> {ar ? "كل الأكشاك" : "All kiosks"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KPI label={ar ? "اليوم" : "Today"} value={fmtMoney(selected.revenue)} delta="live" deltaDir="up" sparkData={selected.trend}/>
        <KPI label={ar ? "الطلبات" : "Orders"} value={String(selected.orders)} delta="POS" deltaDir="up"/>
        <KPI label={ar ? "النقد المتوقع" : "Expected cash"} value={fmtMoney(Math.round(selected.revenue * 0.65))} footer={ar ? "حسب طرق الدفع" : "by payment split"}/>
        <KPI label={ar ? "صحة المخزون" : "Stock health"} value={`${selected.stockHealth}%`} delta={selected.status === "crit" ? "critical" : selected.status === "warn" ? "watch" : "ok"} deltaDir={selected.status === "crit" ? "down" : "up"}/>
        <KPI label={ar ? "الفرق" : "Variance"} value={`${selected.variance}%`} delta={selected.issue} deltaDir={selected.variance < -2 ? "down" : "up"}/>
      </div>

      <div className="card" style={{ padding: 4, overflowX: "auto" }}>
        <div className="row" style={{ gap: 4, minWidth: 760 }}>
          {tabs.map((item) => (
            <button key={item.id} className={"btn " + (tab === item.id ? "btn-primary" : "btn-quiet")}
              style={{ height: 30, fontSize: 12 }}
              onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {content}
    </div>
  );
}



/* ===== screens/admin-rest.jsx ===== */

/* ============================================================
   Admin screens — INVENTORY, WASTE, SUPPLIERS, STAFF, REPORTS
   ============================================================ */

// =============== WAREHOUSES ===============
function WarehousePressureMeter({ pct, status }) {
  const targetX = 70;
  const fillW = clampPercent(pct);
  const color = status === "crit" ? "var(--crit)" : status === "warn" ? "var(--warn)" : "var(--ink-1)";
  return (
    <div style={{ position: "relative", height: 10, marginTop: 4 }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--surface-sunk)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, width: `${fillW}%`,
          background: color, opacity: fillW > targetX ? 0.9 : 0.72,
          transition: "width 600ms ease, background 400ms ease",
        }}/>
      </div>
      <div style={{
        position: "absolute", top: -3, bottom: -3, left: `${targetX}%`,
        width: 1.5, marginLeft: -0.75, background: "var(--ink-1)", opacity: 0.48,
      }}/>
      <div style={{
        position: "absolute", top: -5, left: `calc(${targetX}% - 3px)`,
        width: 6, height: 4, background: "var(--ink-1)", opacity: 0.52,
        clipPath: "polygon(50% 100%, 0 0, 100% 0)",
      }}/>
    </div>
  );
}

function RealtimeWarehouseCard({ node }) {
  const statusLabel = node.status === "good" ? "Healthy" : node.status === "warn" ? "Watch" : "Critical";
  const badgeClass = node.status === "good" ? "badge-pos" : node.status === "warn" ? "badge-warn" : "badge-crit";
  return (
    <div className="card" style={{
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      transition: "border-color 100ms ease, box-shadow 100ms ease",
    }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="between" style={{ marginBottom: 4 }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <span className={`badge ${badgeClass}`} style={{ height: 18, fontSize: 10.5 }}>{statusLabel}</span>
            <span className="t-small faint t-num">{node.code}</span>
          </div>
          <LivePulse status={node.status}/>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{node.name}</div>
        <div className="t-small subtle" style={{ marginTop: 2 }}>{node.type} · {node.badge}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ padding: "10px 12px 10px 16px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>On hand</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500 }}>{fmtNum(Math.round(node.qty || 0))}</div>
        </div>
        <div style={{ padding: "10px 12px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>Reserved</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500 }}>{fmtNum(Math.round(node.reserved || 0))}</div>
        </div>
        <div style={{ padding: "10px 16px 10px 12px" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>Linked</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500 }}>{node.linkedCount}</div>
        </div>
      </div>

      <div style={{ padding: "14px 16px 8px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">Stock availability</span>
          <span className="t-num" style={{ fontSize: 12.5, fontWeight: 500 }}>{node.stockPct}%</span>
        </div>
        <InventoryMeter pct={node.stockPct} status={node.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>{node.location}</div>
      </div>

      <div style={{ padding: "10px 16px 14px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">Movement pressure</span>
          <div className="row" style={{ gap: 8 }}>
            <span className="t-small subtle" style={{ fontSize: 11 }}>target 70%</span>
            <span className={"t-num " + (node.pressurePct > 70 ? "delta-neg" : "")} style={{ fontSize: 12.5, fontWeight: 500 }}>{node.pressurePct}%</span>
          </div>
        </div>
        <WarehousePressureMeter pct={node.pressurePct} status={node.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>{node.note}</div>
      </div>
    </div>
  );
}

function WarehousesScreen({ lang, sync, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const setup = unwrapOdoo(sync?.warehouseSetup) || DEMO_WAREHOUSE_SETUP;
  const liveOnly = isLiveOnlyPayload(sync?.warehouseSetup);
  const [view, setView] = useState("cards");
  const [scope, setScope] = useState("all");
  const [sortBy, setSortBy] = useState("status");
  const [tick, setTick] = useState(0);
  const [warehouseDraft, setWarehouseDraft] = useState({ name: "Baghdad Central Warehouse", code: "BGD" });
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const enabled = Boolean(sourceOfTruth?.enabled);
  const kioskLocations = (setup.locations || []).filter((location) => location.kind === "kiosk");
  const centralLocations = (setup.locations || []).filter((location) => location.kind === "central");
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3600);
    return () => clearInterval(id);
  }, []);
  const warehouseCards = [
    ...(setup.warehouses || []).map((warehouse) => {
      const stockLocation = (setup.locations || []).find((location) => location.id === warehouse.stock_location_id);
      const childLocations = (setup.locations || []).filter((location) => (
        location.complete_name?.startsWith(`${warehouse.stock_location} /`) || location.parent_id === warehouse.stock_location_id
      ));
      return {
        id: `warehouse-${warehouse.id}`,
        type: "Central warehouse",
        badge: "stock.warehouse",
        tone: "pos",
        name: warehouse.name,
        code: warehouse.code,
        record: `stock.warehouse #${warehouse.id}`,
        location: warehouse.stock_location,
        metric: `${childLocations.length} stock locations`,
        kind: "central",
        linkedCount: childLocations.length,
        qty: stockLocation?.quantity || 0,
        reserved: stockLocation?.reserved_quantity || 0,
        note: `Receipts #${warehouse.receipt_type_id || "-"} · POS type #${warehouse.pos_type_id || "-"}`,
      };
    }),
    ...(setup.kiosks || []).map((kiosk) => {
      const stockLocation = (setup.locations || []).find((location) => location.id === kiosk.stock_location_id);
      return {
        id: `kiosk-${kiosk.id}`,
        type: "Kiosk stock source",
        badge: "bayaan.kiosk",
        tone: kiosk.stock_deduction_policy === "strict" ? "warn" : "accent",
        name: kiosk.name,
        code: kiosk.kiosk_code,
        record: `bayaan.kiosk #${kiosk.id}`,
        location: kiosk.stock_location,
        metric: kiosk.pos_config || "No POS config",
        kind: "kiosk",
        linkedCount: kiosk.pos_config_id ? 1 : 0,
        qty: stockLocation?.quantity || 0,
        reserved: stockLocation?.reserved_quantity || 0,
        note: `${kiosk.city || kiosk.area || "No city"} · ${kiosk.stock_deduction_policy || "warning"} policy`,
      };
    }),
  ];
  const liveWarehouseCards = warehouseCards.map((node, index) => {
    const physicalRatio = node.qty > 100
      ? Math.min(96, 62 + Math.log10(node.qty + 1) * 8)
      : Math.min(96, Math.max(18, node.qty || (node.kind === "central" ? 72 : 48)));
    const pressureBase = node.qty > 0
      ? Math.min(100, (node.reserved / Math.max(node.qty + node.reserved, 1)) * 100)
      : Math.min(100, (node.reserved || 0) * 8);
    const stockPct = clampPercent(Math.round(physicalRatio + (((tick + index) % 5) - 2)));
    const pressurePct = clampPercent(Math.round(pressureBase + ((tick + index * 2) % 7)));
    const status = stockPct < 35 ? "crit" : stockPct < 65 || pressurePct > 70 ? "warn" : "good";
    return { ...node, stockPct, pressurePct, status };
  });
  const visibleWarehouseCards = liveWarehouseCards
    .filter((node) => scope === "all" || node.kind === scope)
    .sort((a, b) => {
      if (sortBy === "stock") return a.stockPct - b.stockPct;
      if (sortBy === "pressure") return b.pressurePct - a.pressurePct;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const order = { crit: 0, warn: 1, good: 2 };
      return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
    });
  const warehouseCounts = {
    good: liveWarehouseCards.filter((node) => node.status === "good").length,
    warn: liveWarehouseCards.filter((node) => node.status === "warn").length,
    crit: liveWarehouseCards.filter((node) => node.status === "crit").length,
    avgStock: Math.round(liveWarehouseCards.reduce((sum, node) => sum + node.stockPct, 0) / Math.max(liveWarehouseCards.length, 1)),
  };

  const submitWarehouse = async (event) => {
    event.preventDefault();
    if (!enabled) return;
    setBusy(true);
    setLocalError("");
    try {
      await sourceOfTruth.createWarehouse(warehouseDraft);
      await refreshOdoo();
      setWarehouseModalOpen(false);
    } catch (error) {
      setLocalError(compactError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "مستودعات" : "Warehouses"} value={String(setup.warehouses?.length || 0)} footer={enabled || liveOnly ? "stock.warehouse" : "demo fallback"}/>
        <KPI label={ar ? "مواقع أكشاك" : "Kiosk locations"} value={String(kioskLocations.length)} footer="stock.location"/>
        <KPI label={ar ? "نقاط بيع" : "POS configs"} value={String(setup.pos_configs?.length || 0)} footer="pos.config"/>
        <KPI label={ar ? "المصدر" : "Source"} value={enabled || liveOnly ? "Engine" : "Demo"} footer={sync?.status === "error" ? "sync error" : sync?.status || "ready"}/>
      </div>

      <div className="card card-pad" style={{ background: enabled ? "var(--pos-soft)" : "var(--warn-soft)", borderColor: "transparent" }}>
        <div className="between" style={{ gap: 14, alignItems: "flex-start" }}>
          <div className="ai-block" style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{enabled ? "Bayaan is reading the source engine" : liveOnly ? "Live-only mode is hiding demo topology" : "Backend engine is not configured in this browser session"}</div>
            <div className="t-small muted" style={{ lineHeight: 1.6 }}>
              {enabled
                ? "Creating warehouses or kiosks here writes real inventory, POS, and Bayaan records in the single backend database."
                : liveOnly
                  ? "No demo warehouses or kiosk locations are shown. Configure the backend URL and refresh to load real records."
                  : "Set the backend URL and sign in to the engine in the same browser session. Until then this page shows the demo topology only."}
            </div>
            {(sync?.error || localError) && <div className="t-small delta-neg" style={{ marginTop: 8 }}>{sync?.error || localError}</div>}
          </div>
          <button className="btn btn-ghost" onClick={refreshOdoo} disabled={!enabled || busy}>{busy ? "Syncing" : "Refresh from engine"}</button>
        </div>
      </div>

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary"
          onClick={() => { setLocalError(""); setWarehouseModalOpen(true); }}
          disabled={!enabled || busy}>
          <Icon name="plus" size={12}/> Create central warehouse
        </button>
      </div>

      <Modal open={warehouseModalOpen} onClose={() => !busy && setWarehouseModalOpen(false)}
        title="Create central warehouse"
        sub="Creates stock.warehouse and its stock locations">
        <form onSubmit={submitWarehouse}>
          <div className="col" style={{ gap: 10 }}>
            <label className="t-small muted">Warehouse name</label>
            <input className="input" value={warehouseDraft.name} onChange={(event) => setWarehouseDraft({ ...warehouseDraft, name: event.target.value })} />
            <label className="t-small muted">Short code</label>
            <input className="input" value={warehouseDraft.code} onChange={(event) => setWarehouseDraft({ ...warehouseDraft, code: event.target.value.toUpperCase().slice(0, 5) })} />
            {localError && <div className="t-small delta-neg">{localError}</div>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setWarehouseModalOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!enabled || busy} style={{ justifyContent: "center" }}>
                <Icon name="plus" size={12}/> {busy ? "Creating…" : "Create in engine"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <div className="between kiosk-toolbar">
        <div>
          <div style={{ fontWeight: 500 }}>Bayaan warehouse topology</div>
          <div className="t-small muted">Every card is backed by the single backend database, not a separate Bayaan-only store.</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="row" style={{ gap: 6 }}>
            {[
              { id: "all", label: "All" },
              { id: "central", label: "Central" },
              { id: "kiosk", label: "Kiosk stock" },
            ].map((item) => (
              <button key={item.id} className={"btn " + (scope === item.id ? "btn-primary" : "btn-ghost")} style={{ height: 28, fontSize: 12 }} onClick={() => setScope(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", height: 28 }}>
            {[
              { id: "status", label: "Status" },
              { id: "stock", label: "Stock" },
              { id: "pressure", label: "Pressure" },
              { id: "name", label: "Name" },
            ].map((item) => (
              <button key={item.id} onClick={() => setSortBy(item.id)}
                style={{
                  padding: "0 10px", fontSize: 12,
                  background: sortBy === item.id ? "var(--surface-sunk)" : "transparent",
                  color: sortBy === item.id ? "var(--ink)" : "var(--ink-2)",
                  borderInlineEnd: "1px solid var(--line-soft)",
                }}>{item.label}</button>
            ))}
          </div>
          <div className="segmented" aria-label="Warehouse view">
            <button className={`seg-btn ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}><Icon name="list" size={12}/>List</button>
            <button className={`seg-btn ${view === "cards" ? "active" : ""}`} onClick={() => setView("cards")}><Icon name="grid" size={12}/>Cards</button>
          </div>
        </div>
      </div>

      {view === "cards" ? (
        <div className="kiosk-card-grid">
          {visibleWarehouseCards.map((node) => (
            <RealtimeWarehouseCard key={node.id} node={node}/>
          ))}
          {false && visibleWarehouseCards.map((node) => (
            <div className="card card-pad" key={`legacy-${node.id}`}>
              <div className="between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div className="row" style={{ gap: 7, marginBottom: 8 }}>
                    <span className={`badge ${node.status === "good" ? "badge-pos" : node.status === "warn" ? "badge-warn" : "badge-crit"}`}>
                      {node.status === "good" ? "Healthy" : node.status === "warn" ? "Watch" : "Critical"}
                    </span>
                    <LivePulse status={node.status}/>
                  </div>
                  <div style={{ fontWeight: 600 }}>{node.name}</div>
                  <div className="t-small faint">{node.code} · {node.type}</div>
                </div>
                <Icon name="box" size={16} style={{ color: "var(--ink-3)" }}/>
              </div>
              <div className="col" style={{ gap: 10, marginTop: 16 }}>
                <div className="between t-small">
                  <span className="muted">Engine record</span>
                  <span className="t-num">{node.record}</span>
                </div>
                <div className="t-small muted" style={{ lineHeight: 1.45 }}>{node.location}</div>
                <div>
                  <div className="between t-small" style={{ marginBottom: 6 }}>
                    <span className="muted">Stock availability</span>
                    <span className="t-num">{node.stockPct}%</span>
                  </div>
                  <InventoryMeter pct={node.stockPct} status={node.status}/>
                </div>
                <div className="between t-small">
                  <span className="muted">{node.metric}</span>
                  <span className="t-num muted">reserved {fmtNum(Math.round(node.reserved))}</span>
                </div>
                <div>
                  <div className="between t-small" style={{ marginBottom: 6 }}>
                    <span className="muted">Movement pressure</span>
                    <span className={"t-num " + (node.pressurePct > 70 ? "delta-neg" : "muted")}>{node.pressurePct}%</span>
                  </div>
                  <WarehousePressureMeter pct={node.pressurePct} status={node.status}/>
                </div>
                <div className="t-small subtle">{node.note}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <SectionHead title="Bayaan warehouse topology" sub="Records Bayaan reads and writes" />
          <span className="badge badge-accent">{setup.company?.name || "Company"}</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Name</th>
              <th scope="col">Engine record</th>
              <th scope="col">Stock location</th>
              <th scope="col" style={{ textAlign: "end" }}>Qty</th>
              <th scope="col" style={{ textAlign: "end" }}>Reserved / policy</th>
            </tr>
          </thead>
          <tbody>
            {centralLocations.map((location) => (
              <tr key={location.id}>
                <td><span className="badge badge-pos">Central</span></td>
                <td>{location.name}</td>
                <td className="muted">stock.location #{location.id}</td>
                <td className="muted">{location.complete_name}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtNum(Math.round(location.quantity || 0))}</td>
                <td className="t-num muted" style={{ textAlign: "end" }}>{fmtNum(Math.round(location.reserved_quantity || 0))}</td>
              </tr>
            ))}
            {(setup.kiosks || []).map((kiosk) => (
              <tr key={kiosk.id}>
                <td><span className="badge badge-accent">Kiosk</span></td>
                <td>
                  <div style={{ fontWeight: 500 }}>{kiosk.name}</div>
                  <div className="t-small faint">{kiosk.kiosk_code} · {kiosk.city || kiosk.area || "No city"}</div>
                </td>
                <td className="muted">bayaan.kiosk #{kiosk.id}</td>
                <td className="muted">{kiosk.stock_location}</td>
                <td className="muted" style={{ textAlign: "end" }}>{kiosk.pos_config}</td>
                <td style={{ textAlign: "end" }}><span className="badge">{kiosk.stock_deduction_policy}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// =============== SALES & POS MONITOR ===============
function SalesMonitorScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const rawOrders = odooPosOrderRows(bootstrap);
  const [kioskFilter, setKioskFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const kioskOptions = ["all", ...Array.from(new Set(rawOrders.map((order) => order.kioskId || order.kiosk).filter(Boolean)))];
  const paymentOptions = ["all", ...Array.from(new Set(rawOrders.map((order) => order.payment).filter(Boolean)))];
  const orders = rawOrders.filter((order) => (
    (kioskFilter === "all" || order.kioskId === kioskFilter || order.kiosk === kioskFilter)
    && (paymentFilter === "all" || order.payment === paymentFilter)
  ));
  const paymentTotals = orders.reduce((acc, order) => {
    acc[order.payment] = (acc[order.payment] || 0) + order.amount;
    return acc;
  }, {});
  const paymentSplit = finalizePaymentSplit(orders.reduce((split, order) => {
    addPaymentToSplit(split, order.payment, order.amount);
    return split;
  }, createPaymentSplit()));
  const gatewayRows = paymentGatewayRows(paymentSplit);
  const issueCount = orders.filter((order) => order.status !== "paid" || order.sync !== "live").length;
  const recipeHeld = orders.filter((order) => order.recipe === "held").length;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "طلبات POS" : "POS orders"} value={String(orders.length)} footer={ar ? "آخر دقائق" : "live feed"} />
        <KPI label={ar ? "نقد" : "Cash"} value={fmtMoney(paymentTotals.cash || 0)} footer={ar ? "متوقع في الصندوق" : "expected in drawer"} />
        <KPI label={ar ? "مدفوعات رقمية" : "Digital payments"} value={fmtMoney(paymentSplit.digital)} footer="card, QR, wallet, FIB" />
        <KPI label={ar ? "تحتاج مراجعة" : "Needs review"} value={String(issueCount)} delta={recipeHeld ? `${recipeHeld} recipe held` : "all posted"} deltaDir={issueCount ? "down" : "up"} />
      </div>

      <div className="card card-pad" style={{ display: "none", background: "var(--accent-soft)", borderColor: "transparent" }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <AITag>{ar ? "حارس واحد" : "Single source guardrail"}</AITag>
          <div className="ai-block" style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {ar ? "المبيعات المدفوعة تمر عبر محرك نقاط البيع فقط" : "Paid sales still go through the Bayaan POS engine only"}
            </div>
            <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
              {ar
                ? "هذه الشاشة تراقب أوامر POS، طرق الدفع، وحالة ترحيل الوصفة. لا تنشئ مسارا موازيا للبيع."
                : "This page monitors POS orders, payment split, and recipe posting status. It does not create a parallel sale path."}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setSessionsOpen((open) => !open)} style={{ height: 30, fontSize: 12 }}>
            <Icon name="eye" size={12}/>{ar ? "عرض جلسات مفتوحة" : "Open sessions"}
          </button>
        </div>
      </div>

      {sessionsOpen && (
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Open POS sessions" : "Open POS sessions"}</div>
              <div className="t-small subtle">{ar ? "Grouped from the live order stream" : "Grouped from the live order stream"}</div>
            </div>
            <span className="badge">{kioskOptions.length - 1} sessions</span>
          </div>
          <table className="tbl">
            <tbody>
              {kioskOptions.filter((kiosk) => kiosk !== "all").map((kiosk) => {
                const sessionOrders = rawOrders.filter((order) => order.kioskId === kiosk || order.kiosk === kiosk);
                const revenue = sessionOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
                return (
                  <tr key={kiosk}>
                    <td style={{ fontWeight: 500 }}>{kiosk}</td>
                    <td className="muted">{sessionOrders[0]?.cashier || "Cashier"}</td>
                    <td className="t-num" style={{ textAlign: "end" }}>{sessionOrders.length} orders</td>
                    <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(revenue)}</td>
                    <td style={{ textAlign: "end" }}><span className="badge badge-pos">open</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        <div className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="between" style={{ padding: "14px 18px" }}>
              <div className="t-h2">{ar ? "طرق الدفع" : "Payment split"}</div>
              <span className="t-small subtle">{ar ? "اليوم" : "today"}</span>
            </div>
            <table className="tbl">
              <tbody>
                {Object.entries(paymentTotals).map(([method, total]) => (
                  <tr key={method}>
                    <td>
                      <div className="row">
                        <Icon name={String(method).toLowerCase() === "cash" ? "cash" : "card"} size={13}/>
                        <span style={{ textTransform: "capitalize" }}>{method}</span>
                      </div>
                    </td>
                    <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="between" style={{ padding: "14px 18px" }}>
              <div className="t-h2">{ar ? "بوابات الدفع" : "Gateway providers"}</div>
              <span className="badge">Iraq</span>
            </div>
            <table className="tbl">
              <tbody>
                {gatewayRows.slice(0, 7).map((row) => (
                  <tr key={row.provider || row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.label}</div>
                      <div className="t-small faint">{paymentCategoryLabel(row.category)} - {String(row.settlement || "").replace(/_/g, " ")}</div>
                    </td>
                    <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div className="t-h2">{ar ? "المراقبة الحية" : "Live POS orders"}</div>
            <div className="row" style={{ gap: 6 }}>
              <select className="input" value={kioskFilter} onChange={(event) => setKioskFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 132 }}>
                {kioskOptions.map((kiosk) => <option key={kiosk} value={kiosk}>{kiosk === "all" ? "All kiosks" : kiosk}</option>)}
              </select>
              <select className="input" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 142 }}>
                {paymentOptions.map((payment) => <option key={payment} value={payment}>{payment === "all" ? "All payments" : payment}</option>)}
              </select>
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "الوقت" : "Time"}</th>
                <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
                <th scope="col">{ar ? "الكاشير" : "Cashier"}</th>
                <th scope="col">{ar ? "المنتج" : "Product sold"}</th>
                <th scope="col">{ar ? "الدفع" : "Payment"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "المبلغ" : "Amount"}</th>
                <th scope="col">{ar ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const statusClass = order.status === "paid" && order.sync === "live" ? "badge-pos" : String(order.status).includes("void") ? "badge-crit" : "badge-warn";
                return (
                  <tr key={order.id}>
                    <td className="t-num muted">{order.time}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{order.kiosk}</div>
                      <div className="t-small faint">{order.kioskId} - {order.id}</div>
                    </td>
                    <td className="muted">{order.cashier}</td>
                    <td>
                      <div>{order.product}</div>
                      <div className="t-small faint">{order.qty} units</div>
                    </td>
                    <td className="muted">{order.payment}</td>
                    <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(order.amount)}</td>
                    <td>
                      <span className={`badge ${statusClass}`}>{order.status}</span>
                      <div className="t-small faint" style={{ marginTop: 4 }}>{order.recipe === "posted" ? "recipe posted" : order.recipe === "finished" ? "finished SKU" : "recipe held"}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============== INVENTORY ===============
function InventoryScreen({ lang, bootstrap, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const [busyTransfer, setBusyTransfer] = React.useState("");
  const [poBusy, setPoBusy] = React.useState(false);
  const inv = odooInventoryRows(bootstrap);
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [locationFilter, setLocationFilter] = React.useState("all");
  const baseTransfers = odooTransferRows(bootstrap);
  const [draftTransfers, setDraftTransfers] = React.useState([]);
  const [transferStatusOverrides, setTransferStatusOverrides] = React.useState({});
  const [transferActionBusy, setTransferActionBusy] = React.useState("");
  const [purchaseDrafts, setPurchaseDrafts] = React.useState([]);
  const [poModalOpen, setPoModalOpen] = React.useState(false);
  const [itemModalOpen, setItemModalOpen] = React.useState(false);
  const [itemBusy, setItemBusy] = React.useState(false);
  const [itemDraft, setItemDraft] = React.useState({
    name: "",
    code: "",
    category: "Ingredients",
    uom: "Units",
    supplier: "",
    unitCost: "",
    purchasePrice: "",
    consumptionMode: "finished",
  });
  const [poDraft, setPoDraft] = React.useState({
    supplier: MOCK.suppliers[0]?.name || "",
    warehouse: DEFAULT_WAREHOUSE_NAME,
    scheduleDate: tomorrowIsoDate(),
    lines: [],
  });
  const [transferModalOpen, setTransferModalOpen] = React.useState(false);
  const [transferDraft, setTransferDraft] = React.useState({ kiosk: "", item: "", qty: "" });
  React.useEffect(() => {
    setDraftTransfers([]);
    setTransferStatusOverrides({});
    setPurchaseDrafts([]);
  }, [bootstrap]);
  React.useEffect(() => {
    if (!liveOnly) return;
    setPoDraft((draft) => draft.supplier ? { ...draft, supplier: "" } : draft);
  }, [liveOnly]);
  const transfers = [...draftTransfers, ...baseTransfers].map((transfer) => ({
    ...transfer,
    status: transferStatusOverrides[transfer.id] || transfer.status,
  }));
  const suggestions = odooTransferSuggestionRows(bootstrap);
  const kioskRows = odooKioskRows(bootstrap);
  const supplierOptions = Array.from(new Set([
    ...(liveOnly ? [] : MOCK.suppliers.map((supplier) => supplier.name)),
    poDraft.supplier,
  ].filter(Boolean)));
  React.useEffect(() => {
    setTransferDraft((draft) => ({
      kiosk: draft.kiosk || kioskRows[0]?.id || "",
      item: draft.item || inv[0]?.item || "",
      qty: draft.qty || "",
    }));
  }, [bootstrap]);
  const categoryOptions = React.useMemo(() => (
    ["all", ...Array.from(new Set(inv.map((row) => row.category).filter(Boolean))).sort()]
  ), [inv]);
  const locationOptions = React.useMemo(() => (
    [
      { key: "all", label: "All locations" },
      ...Array.from(new Map(inv.map((row) => [row.locationKey || row.location, row.location || row.locationKey]).filter(([key]) => key)).entries())
        .map(([key, label]) => ({ key, label })),
    ]
  ), [inv]);
  React.useEffect(() => {
    if (!categoryOptions.includes(categoryFilter)) setCategoryFilter("all");
  }, [categoryFilter, categoryOptions]);
  React.useEffect(() => {
    if (!locationOptions.some((option) => option.key === locationFilter)) setLocationFilter("all");
  }, [locationFilter, locationOptions]);
  const filteredInv = React.useMemo(() => inv.filter((row) => (
    (categoryFilter === "all" || row.category === categoryFilter) &&
    (locationFilter === "all" || row.locationKey === locationFilter)
  )), [inv, categoryFilter, locationFilter]);
  const filteredLowCount = filteredInv.filter((item) => item.status !== "ok").length;
  const filteredStockValue = Math.round(filteredInv.reduce((sum, item) => sum + (Number(item.stock || 0) * estimatePurchaseRate(item.item)), 0));
  const filteredAvgDays = filteredInv.length
    ? (filteredInv.reduce((sum, item) => sum + Number(item.days || 0), 0) / filteredInv.length).toFixed(1)
    : "0.0";

  const exportInventory = () => {
    const rows = [
      ["Item", "Category", "Location", "Stock", "Unit", "Reorder at", "Days of cover", "Supplier", "Status"],
      ...filteredInv.map((item) => [item.item, item.category, item.location, item.stock, item.unit, item.reorder, item.days, item.supplier, item.status]),
    ];
    const filename = `bayaan-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    if (typeof document !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined") {
      const blob = new Blob(["\ufeff" + csvRows(rows)], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    }
    showToast(ar ? "Inventory exported" : `Inventory exported as ${filename}`, "success");
  };

  const openPoModal = (lines, supplier = "") => {
    const cleanLines = (lines || []).filter((line) => line.item).map((line) => ({
      item: line.item,
      qty: line.qty || 1,
      unit: line.unit || "",
      rate: line.rate || estimatePurchaseRate(line.item),
    }));
    const firstInventoryItem = inv.find((row) => row.status !== "ok") || inv[0];
    setPoDraft({
      supplier: supplier || firstInventoryItem?.supplier || (liveOnly ? "" : MOCK.suppliers[0]?.name || ""),
      warehouse: DEFAULT_WAREHOUSE_NAME,
      scheduleDate: tomorrowIsoDate(),
      lines: cleanLines.length ? cleanLines : (firstInventoryItem ? [purchaseLineFromInventory(firstInventoryItem)] : []),
    });
    setPoModalOpen(true);
  };

  const openReorderPo = (item = inv.find((row) => row.status !== "ok") || inv[0]) => {
    if (!item) return;
    openPoModal([purchaseLineFromInventory(item)], item.supplier || "");
  };

  const openSuggestedPo = () => {
    const lowItems = inv.filter((row) => row.status !== "ok").slice(0, 4);
    if (!lowItems.length) {
      showToast(ar ? "No reorder items" : "No reorder items", "info");
      return;
    }
    openPoModal(lowItems.map(purchaseLineFromInventory), lowItems[0]?.supplier || "");
    showToast(ar ? "Review suggested PO before creating" : "Review suggested PO before creating", "info");
  };

  const updatePoLine = (index, patch) => {
    setPoDraft((draft) => ({
      ...draft,
      lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const addPoLine = () => {
    const item = inv[0];
    if (!item) return;
    setPoDraft((draft) => ({ ...draft, lines: [...draft.lines, purchaseLineFromInventory(item)] }));
  };

  const removePoLine = (index) => {
    setPoDraft((draft) => ({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }));
  };
  const submitPo = async (event, submit = false) => {
    event.preventDefault();
    const lines = poDraft.lines
      .filter((line) => line.item && Number(line.qty || 0) > 0)
      .map((line) => ({
        item: line.item,
        qty: Number(line.qty || 0),
        unit: line.unit || inv.find((item) => item.item === line.item)?.unit || "",
        rate: Number(line.rate || 0),
      }));
    if (!poDraft.supplier || !lines.length || lines.some((line) => line.rate <= 0)) {
      showToast(ar ? "PO needs supplier, item lines, quantities, and rates" : "PO needs supplier, item lines, quantities, and rates", "warn");
      return;
    }
    setPoBusy(true);
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = unwrapOdoo(await sourceOfTruth.submitPurchaseOrder({
          supplier: poDraft.supplier,
          warehouse: poDraft.warehouse,
          scheduleDate: poDraft.scheduleDate,
          submit,
          items: lines.map((line) => ({ itemId: line.item, qty: line.qty, rate: line.rate })),
        }));
        await refreshOdoo?.();
      }
      const draft = {
        id: created?.name || `PO-DRAFT-${Date.now()}`,
        supplier: poDraft.supplier,
        warehouse: poDraft.warehouse,
        items: purchaseLineSummary(lines),
        value: purchaseTotal(lines),
        status: created?.state || "created",
      };
      setPurchaseDrafts((rows) => [draft, ...rows]);
      setPoModalOpen(false);
      showToast(ar ? "Purchase order created" : `${sourceOfTruth?.enabled ? "Odoo PO" : "Demo PO"} created - ${draft.items}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create purchase order", "warn");
    } finally {
      setPoBusy(false);
    }
  };

  const submitStockItem = async (event) => {
    event.preventDefault();
    if (!itemDraft.name.trim()) {
      showToast(ar ? "Stock item needs a name" : "Stock item needs a name", "warn");
      return;
    }
    if (!sourceOfTruth?.enabled) {
      showToast(ar ? "Connect live backend first" : "Connect live backend first to create real stock items", "warn");
      return;
    }
    setItemBusy(true);
    try {
      const created = unwrapOdoo(await sourceOfTruth.createStockItem({
        name: itemDraft.name.trim(),
        code: itemDraft.code.trim() || undefined,
        category: itemDraft.category.trim() || undefined,
        uom: itemDraft.uom,
        supplier: itemDraft.supplier.trim() || undefined,
        unitCost: Number(itemDraft.unitCost || itemDraft.purchasePrice || 0),
        purchasePrice: Number(itemDraft.purchasePrice || itemDraft.unitCost || 0),
        consumptionMode: itemDraft.consumptionMode,
        availableInPos: false,
      }));
      await refreshOdoo?.();
      setItemModalOpen(false);
      setItemDraft({
        name: "",
        code: "",
        category: "Ingredients",
        uom: "Units",
        supplier: itemDraft.supplier,
        unitCost: "",
        purchasePrice: "",
        consumptionMode: "finished",
      });
      showToast(ar ? "Stock item created" : `Stock item created - ${created?.product?.default_code || created?.product?.name || itemDraft.name}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create stock item", "warn");
    } finally {
      setItemBusy(false);
    }
  };

  const createManualTransfer = async (event) => {
    event.preventDefault();
    const qty = Number(transferDraft.qty || 0);
    if (!transferDraft.kiosk || !transferDraft.item || qty <= 0) {
      showToast(ar ? "Transfer needs kiosk, item, and quantity" : "Transfer needs kiosk, item, and quantity", "warn");
      return;
    }
    setBusyTransfer("manual");
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = await sourceOfTruth.submitStockTransfer({
          kioskId: transferDraft.kiosk,
          itemId: transferDraft.item,
          qty,
          fromWarehouse: DEFAULT_WAREHOUSE_NAME,
        });
        await refreshOdoo?.();
      }
      const kioskName = kioskRows.find((row) => row.id === transferDraft.kiosk || row.kiosk_code === transferDraft.kiosk)?.name || transferDraft.kiosk;
      const draftId = created?.name || `DRAFT-${transferDraft.kiosk}-${slugify(transferDraft.item)}-${Date.now()}`;
      setDraftTransfers((rows) => [
        {
          id: draftId,
          from: "Main Warehouse",
          to: kioskName,
          items: `${transferDraft.item} ${qty}`,
          eta: created?.state ? "engine" : "draft",
          status: created?.state || "draft",
        },
        ...rows,
      ]);
      setTransferModalOpen(false);
      setTransferDraft((draft) => ({ ...draft, qty: "" }));
      showToast(ar ? "Transfer drafted" : `Draft transfer prepared - ${transferDraft.item} to ${kioskName}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create transfer", "warn");
    } finally {
      setBusyTransfer("");
    }
  };
  const createSuggestedTransfer = (suggestion) => {
    setTransferDraft({
      kiosk: suggestion.kioskId || transferKioskId(suggestion.kiosk),
      item: suggestion.itemId || suggestion.item,
      qty: suggestion.qtyValue || transferQtyValue(suggestion.qty),
    });
    setTransferModalOpen(true);
    showToast(ar ? "Review suggested transfer before creating" : "Review suggested transfer before creating", "info");
  };

  const openTransferForItem = (item) => {
    const target = suggestions.find((suggestion) => matchesItem(suggestion.itemId || suggestion.item, item.item));
    setTransferDraft({
      kiosk: target?.kioskId || transferKioskId(target?.kiosk) || kioskRows[0]?.id || "",
      item: item.item,
      qty: target?.qtyValue || Math.max(Number(item.reorder || 0) - Number(item.stock || 0), 1),
    });
    setTransferModalOpen(true);
  };

  const advanceTransferStatus = async (transfer, action) => {
    const nextStatus = action?.next || action;
    if (sourceOfTruth?.enabled) {
      setTransferActionBusy(transfer.id);
      try {
        const result = unwrapOdoo(await sourceOfTruth.stockTransferAction({
          transfer: transfer.id,
          action: action?.action || "receive",
        }));
        await refreshOdoo?.();
        const displayStatus = result?.bayaan_state || nextStatus || result?.state;
        setTransferStatusOverrides((rows) => ({ ...rows, [transfer.id]: displayStatus }));
        showToast(`Odoo transfer ${transfer.id} moved to ${displayStatus}`, "success");
      } catch (error) {
        showToast(error?.message || "Could not update transfer in Odoo", "warn");
      } finally {
        setTransferActionBusy("");
      }
      return;
    }
    setTransferStatusOverrides((rows) => ({ ...rows, [transfer.id]: nextStatus }));
    setDraftTransfers((rows) => rows.map((row) => (row.id === transfer.id ? { ...row, status: nextStatus, eta: nextStatus === "received" ? "received" : row.eta } : row)));
    showToast(ar ? "Transfer status updated" : `Transfer ${transfer.id} moved to ${nextStatus}`, "success");
  };
  return (
    <div className="col" style={{ gap: 14, height: "calc(100vh - 204px)", minHeight: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, order: 2, flex: "1 1 auto", minHeight: 0, alignItems: "stretch" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "تحويلات قيد التنفيذ" : "Warehouse transfers"}</div>
              <div className="t-small subtle">{ar ? "من المستودع إلى موقع مخزون الكشك" : "Admin creates, warehouse dispatches, kiosk receives"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setTransferModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="truck" size={12}/>{ar ? "تحويل جديد" : "New transfer"}
            </button>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <table className="tbl">
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{transfer.to}</div>
                      <div className="t-small faint">{transfer.from} - {transfer.id}</div>
                    </td>
                    <td className="muted">{transfer.items}</td>
                    <td className="t-num muted">{transfer.eta}</td>
                    <td style={{ textAlign: "end" }}>
                      <span className={`badge ${transferStatusClass(transfer.status)}`}>{transfer.status}</span>
                      {isDispatchedTransfer(transfer.status) && (
                        <span className="t-small subtle" style={{ marginInlineStart: 6 }}>waiting kiosk</span>
                      )}
                      {nextTransferAction(transfer.status) && (
                        <button className="btn btn-ghost" onClick={() => advanceTransferStatus(transfer, nextTransferAction(transfer.status))}
                          disabled={transferActionBusy === transfer.id}
                          style={{ height: 24, fontSize: 11, marginInlineStart: 6 }}>
                          {transferActionBusy === transfer.id ? "Working" : nextTransferAction(transfer.status).label}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "احتياجات الأكشاك" : "Kiosk live stock needs"}</div>
              <div className="t-small subtle">{ar ? "محسوبة من المبيعات والاستهلاك والحد الأدنى" : "Use this list to create warehouse-to-kiosk transfers"}</div>
            </div>
            <span className="badge badge-ai">AI reads verified data</span>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <table className="tbl">
              <tbody>
                {suggestions.map((s) => (
                  <tr key={`${s.kiosk}-${s.item}`}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.item}</div>
                      <div className="t-small faint">{s.kiosk}</div>
                    </td>
                    <td className="t-num" style={{ textAlign: "end" }}>{s.qty}</td>
                    <td className="muted">{s.cover}</td>
                    <td className="muted">{s.reason}</td>
                    <td style={{ textAlign: "end" }}>
                      <button className="btn btn-ghost" onClick={() => createSuggestedTransfer(s)}
                        disabled={busyTransfer === `${s.kiosk}-${s.item}`}
                        style={{ height: 24, fontSize: 11 }}>
                        <Icon name="truck" size={11}/>
                        {busyTransfer === `${s.kiosk}-${s.item}` ? (ar ? "جارٍ التجهيز" : "Drafting") : (ar ? "إنشاء تحويل" : "Create transfer")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ order: 1, flex: "0 0 240px", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="row" style={{ gap: 8 }}>
            <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 160 }}>
              {categoryOptions.map((category) => <option key={category} value={category}>{category === "all" ? (ar ? "كل الفئات" : "All categories") : category}</option>)}
            </select>
            <select className="input" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 160 }}>
              {locationOptions.map((location) => <option key={location.key} value={location.key}>{location.key === "all" ? (ar ? "كل المواقع" : "All locations") : location.label}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" onClick={exportInventory} style={{ height: 28, fontSize: 12 }}><Icon name="download" size={12}/>{ar ? "تصدير" : "Export"}</button>
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "البند" : "Item"}</th>
                <th scope="col">{ar ? "الفئة" : "Category"}</th>
                <th scope="col">{ar ? "الموقع" : "Location"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "المخزون" : "Stock"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "نقطة الطلب" : "Reorder at"}</th>
                <th scope="col" style={{ width: 140 }}>{ar ? "أيام التغطية" : "Days of cover"}</th>
                <th scope="col">{ar ? "المورد" : "Supplier"}</th>
                <th scope="col" style={{ textAlign: "end" }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredInv.map((it, i) => {
                const pct = Math.min(it.days / 14, 1);
                const tone = it.status === "crit" ? "crit" : it.status === "low" ? "warn" : "ok";
                return (
                  <tr key={i}>
                    <td><span style={{ fontWeight: 500 }}>{it.item}</span></td>
                    <td className="muted">{it.category}</td>
                    <td className="muted">{it.location}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{it.stock} <span className="faint">{it.unit}</span></td>
                    <td style={{ textAlign: "end" }} className="t-num muted">{it.reorder}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--surface-sunk)", borderRadius: 3 }}>
                          <div style={{ height: "100%", width: `${pct*100}%`,
                            background: tone === "crit" ? "var(--crit)" : tone === "warn" ? "var(--warn)" : "var(--ink-1)",
                            borderRadius: 3 }}/>
                        </div>
                        <span className={"t-num " + (tone === "crit" ? "delta-neg" : tone === "warn" ? "" : "muted")}
                          style={{ fontSize: 12, minWidth: 36, textAlign: "end", color: tone === "warn" ? "var(--warn)" : undefined }}>
                          {it.days}d
                        </span>
                      </div>
                    </td>
                    <td className="muted">{it.supplier}</td>
                    <td style={{ textAlign: "end" }}>
                      {tone !== "ok"
                        ? <button className="btn btn-ghost" onClick={() => openTransferForItem(it)} style={{ height: 24, fontSize: 11 }}>{ar ? "حوّل" : "Allocate"}</button>
                        : <Icon name="dots" size={14} style={{ color: "var(--ink-3)" }}/>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)}
        title={ar ? "بند مخزون جديد" : "New stock item"}
        sub={ar ? "ينشئ منتجاً قابلاً للشراء في المحرك" : "Creates a purchasable stock product in the engine"}
        width={640}>
        <form onSubmit={submitStockItem} className="col" style={{ gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
            <input className="input" value={itemDraft.name} onChange={(event) => setItemDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Milk whole 1L"/>
            <input className="input" value={itemDraft.code} onChange={(event) => setItemDraft((draft) => ({ ...draft, code: event.target.value }))} placeholder="MILK-WHOLE-1L"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 8 }}>
            <input className="input" value={itemDraft.category} onChange={(event) => setItemDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Ingredients"/>
            <select className="input" value={itemDraft.uom} onChange={(event) => setItemDraft((draft) => ({ ...draft, uom: event.target.value }))}>
              {["Units", "kg", "g", "l", "ml"].map((uom) => <option key={uom} value={uom}>{uom}</option>)}
            </select>
            <input className="input" value={itemDraft.supplier} onChange={(event) => setItemDraft((draft) => ({ ...draft, supplier: event.target.value }))} placeholder="Supplier"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 170px", gap: 8 }}>
            <input className="input" type="number" min="0" step="0.01" value={itemDraft.unitCost} onChange={(event) => setItemDraft((draft) => ({ ...draft, unitCost: event.target.value }))} placeholder="Unit cost"/>
            <input className="input" type="number" min="0" step="0.01" value={itemDraft.purchasePrice} onChange={(event) => setItemDraft((draft) => ({ ...draft, purchasePrice: event.target.value }))} placeholder="Purchase price"/>
            <select className="input" value={itemDraft.consumptionMode} onChange={(event) => setItemDraft((draft) => ({ ...draft, consumptionMode: event.target.value }))}>
              <option value="finished">Stock item</option>
              <option value="recipe">Sellable recipe item</option>
              <option value="hybrid">Hybrid item</option>
              <option value="none">No stock consumption</option>
            </select>
          </div>
          <div className="t-small subtle">For supplier ingredients, use Stock item. Sellable juices/coffee get their recipe on Products & Recipes after the ingredient exists.</div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setItemModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={itemBusy || !itemDraft.name.trim()}>{itemBusy ? "Creating" : "Create item"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)}
        title={ar ? "New stock transfer" : "New stock transfer"}
        sub={ar ? "Warehouse to kiosk stock location" : "Warehouse to kiosk stock location"}>
        <form onSubmit={createManualTransfer} className="col" style={{ gap: 10 }}>
          <input className="input" value={DEFAULT_WAREHOUSE_NAME} readOnly aria-label="From warehouse"/>
          <select className="input" value={transferDraft.kiosk} onChange={(event) => setTransferDraft((draft) => ({ ...draft, kiosk: event.target.value }))}>
            {kioskRows.map((kiosk) => (
              <option key={kiosk.id || kiosk.kiosk_code} value={kiosk.id || kiosk.kiosk_code}>{kiosk.id || kiosk.kiosk_code} - {kiosk.name}</option>
            ))}
          </select>
          <select className="input" value={transferDraft.item} onChange={(event) => setTransferDraft((draft) => ({ ...draft, item: event.target.value }))}>
            {inv.map((item) => <option key={item.item} value={item.item}>{item.item}</option>)}
          </select>
          <input className="input" value={transferDraft.qty} onChange={(event) => setTransferDraft((draft) => ({ ...draft, qty: event.target.value }))} placeholder="Quantity" inputMode="decimal"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setTransferModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busyTransfer === "manual"}>
              {busyTransfer === "manual" ? "Drafting..." : "Create transfer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =============== WASTE ===============
function WasteScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const wasteRows = odooWasteRows(bootstrap);
  const lossToday = wasteRows.reduce((sum, row) => sum + row.cost, 0);
  const flaggedCount = wasteRows.filter((row) => row.flagged).length;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "خسارة اليوم" : "Loss today"} value={fmtMoney(lossToday)} delta="32%" deltaDir="down" sparkData={[58,42,38,52,46,32,30]}/>
        <KPI label={ar ? "خسارة ٧ أيام" : "Loss 7-day"} value={fmtMoney(2410)} delta="vs target 2,800" deltaDir="up"/>
        <KPI label={ar ? "% من الإيرادات" : "% of revenue"} value="0.42%" delta="0.06 pts" deltaDir="up"/>
        <KPI label={ar ? "حالات شاذة" : "Anomalies flagged"} value={String(flaggedCount)} footer={ar ? "بواسطة الذكاء" : "by AI"}/>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "أسباب الهدر" : "Waste reason control"}</div>
            <div className="t-small subtle">{ar ? "تتحول إلى تحقيق عند ظهور فرق في الإغلاق" : "Turns into investigation when close variance appears"}</div>
          </div>
          <span className="badge badge-ai">variance inputs</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 0, borderTop: "1px solid var(--line-soft)" }}>
          {[
            ["Spoiled fruit", 126_000, "Produce"],
            ["Broken packaging", 18_200, "Packaging"],
            ["Wrong orders", 42_600, "POS"],
            ["Free samples", 28_000, "Marketing"],
            ["Staff meals", 64_000, "Staff"],
            ["Missing stock", 209_000, "Investigation"],
            ["Unknown loss", 98_000, "Close variance"],
          ].map(([reason, value, category], index) => (
            <div key={reason} style={{ padding: 12, borderInlineEnd: index < 6 ? "1px solid var(--line-soft)" : 0 }}>
              <div className="t-small" style={{ fontWeight: 500 }}>{reason}</div>
              <div className="t-num" style={{ marginTop: 8, color: reason === "Missing stock" || reason === "Unknown loss" ? "var(--crit)" : "var(--ink)" }}>{fmtMoney(value)}</div>
              <div className="t-small faint" style={{ marginTop: 2 }}>{category}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <AITag>{ar ? "نمط ملاحظ" : "Pattern detected"}</AITag>
        </div>
        <div className="ai-block">
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {ar ? "الكرواسون يشكل ٤٢٪ من قيمة الهدر هذا الأسبوع" : "Croissants account for 42% of waste value this week"}
          </div>
          <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
            {ar ? "كشكان (المنصور، البصرة تايمز) ينتجان أكثر من الطلب بنسبة ٣٥٪ في فترات ما بعد الظهر. خفض الإنتاج المسائي بـ ٢٥٪ يوفر ~٨٤٬٠٠٠ د.ع يومياً دون تأثير على المبيعات."
                : "Two kiosks (Mansour, Basra Times) over-bake by 35% in afternoon windows. Trimming evening bake by 25% saves ~IQD 84,000/day with no measured sales impact."}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "إدخالات الهدر — اليوم" : "Waste entries — today"}</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل الأكشاك" : "All kiosks"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "السبب" : "Reason"} <Icon name="chevDown" size={11}/></button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" style={{ width: 30 }}></th>
              <th scope="col">{ar ? "الوقت" : "Time"}</th>
              <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
              <th scope="col">{ar ? "البند" : "Item"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الكمية" : "Qty"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "التكلفة" : "Cost"}</th>
              <th scope="col">{ar ? "السبب" : "Reason"}</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {wasteRows.map(w => (
              <tr key={w.id}>
                <td>{w.flagged ? <span className="dot warn"></span> : <span className="dot" style={{ opacity: 0.3 }}></span>}</td>
                <td className="t-num muted">{w.time}</td>
                <td>{w.kiosk}</td>
                <td>{w.item}</td>
                <td style={{ textAlign: "end" }} className="t-num">×{w.qty}</td>
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(w.cost)}</td>
                <td className="muted">{w.reason}</td>
                <td style={{ textAlign: "end" }}>
                  {w.flagged && <span className="badge badge-warn">{ar ? "شاذ" : "Flagged"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function ItemsCatalogScreen({ lang, bootstrap, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const engineRows = odooInventoryRows(bootstrap);
  const [localItems, setLocalItems] = React.useState([]);
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [itemModalOpen, setItemModalOpen] = React.useState(false);
  const [itemBusy, setItemBusy] = React.useState(false);
  const [itemDraft, setItemDraft] = React.useState({
    name: "",
    code: "",
    category: "Ingredients",
    uom: "Units",
    supplier: "",
    unitCost: "",
    purchasePrice: "",
    consumptionMode: "finished",
  });

  React.useEffect(() => { setLocalItems([]); }, [bootstrap]);

  const rows = React.useMemo(() => [...localItems, ...engineRows], [localItems, engineRows]);
  const categoryOptions = React.useMemo(() => (
    ["all", ...Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort()]
  ), [rows]);
  const filteredRows = categoryFilter === "all"
    ? rows
    : rows.filter((row) => row.category === categoryFilter);

  const submitStockItem = async (event) => {
    event.preventDefault();
    if (!itemDraft.name.trim()) {
      showToast("Stock item needs a name", "warn");
      return;
    }
    setItemBusy(true);
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = unwrapOdoo(await sourceOfTruth.createStockItem({
          name: itemDraft.name.trim(),
          code: itemDraft.code.trim() || undefined,
          category: itemDraft.category.trim() || undefined,
          uom: itemDraft.uom,
          supplier: itemDraft.supplier.trim() || undefined,
          unitCost: Number(itemDraft.unitCost || itemDraft.purchasePrice || 0),
          purchasePrice: Number(itemDraft.purchasePrice || itemDraft.unitCost || 0),
          consumptionMode: itemDraft.consumptionMode,
          availableInPos: false,
        }));
        await refreshOdoo?.();
      } else {
        setLocalItems((items) => [{
          item: itemDraft.code.trim() || itemDraft.name.trim(),
          category: itemDraft.category.trim() || "Ingredients",
          location: "Item catalog",
          locationKey: "item-catalog",
          stock: 0,
          unit: itemDraft.uom,
          reorder: 0,
          days: 0,
          supplier: itemDraft.supplier.trim() || "Unassigned",
          status: "ok",
          mode: itemDraft.consumptionMode,
        }, ...items]);
      }
      setItemModalOpen(false);
      setItemDraft({
        name: "",
        code: "",
        category: "Ingredients",
        uom: "Units",
        supplier: itemDraft.supplier,
        unitCost: "",
        purchasePrice: "",
        consumptionMode: "finished",
      });
      showToast(`Stock item created - ${created?.product?.default_code || created?.product?.name || itemDraft.name}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create stock item", "warn");
    } finally {
      setItemBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "Stock items" : "Stock item catalog"}</div>
            <div className="t-small subtle">{ar ? "Master purchasable items" : "Create purchasable items once, then link them to suppliers and recipes"}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 160 }}>
              {categoryOptions.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setItemModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "New item" : "New item"}
            </button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Category</th>
              <th scope="col">UoM</th>
              <th scope="col">Default supplier</th>
              <th scope="col" style={{ textAlign: "end" }}>Unit cost</th>
              <th scope="col">Mode</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((item, index) => (
              <tr key={`${item.item}-${index}`}>
                <td><span style={{ fontWeight: 500 }}>{item.item}</span></td>
                <td className="muted">{item.category}</td>
                <td className="muted">{item.unit}</td>
                <td className="muted">{item.supplier || "Unassigned"}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(estimatePurchaseRate(item.item))}</td>
                <td><span className="badge">{item.mode || "stock"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)}
        title="New stock item"
        sub="Creates a global purchasable stock item"
        width={640}>
        <form onSubmit={submitStockItem} className="col" style={{ gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
            <input className="input" value={itemDraft.name} onChange={(event) => setItemDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Milk whole 1L"/>
            <input className="input" value={itemDraft.code} onChange={(event) => setItemDraft((draft) => ({ ...draft, code: event.target.value }))} placeholder="MILK-WHOLE-1L"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 8 }}>
            <input className="input" value={itemDraft.category} onChange={(event) => setItemDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Ingredients"/>
            <select className="input" value={itemDraft.uom} onChange={(event) => setItemDraft((draft) => ({ ...draft, uom: event.target.value }))}>
              {["Units", "kg", "g", "l", "ml"].map((uom) => <option key={uom} value={uom}>{uom}</option>)}
            </select>
            <input className="input" value={itemDraft.supplier} onChange={(event) => setItemDraft((draft) => ({ ...draft, supplier: event.target.value }))} placeholder="Default supplier"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 170px", gap: 8 }}>
            <input className="input" type="number" min="0" step="0.01" value={itemDraft.unitCost} onChange={(event) => setItemDraft((draft) => ({ ...draft, unitCost: event.target.value }))} placeholder="Unit cost"/>
            <input className="input" type="number" min="0" step="0.01" value={itemDraft.purchasePrice} onChange={(event) => setItemDraft((draft) => ({ ...draft, purchasePrice: event.target.value }))} placeholder="Purchase price"/>
            <select className="input" value={itemDraft.consumptionMode} onChange={(event) => setItemDraft((draft) => ({ ...draft, consumptionMode: event.target.value }))}>
              <option value="finished">Stock item</option>
              <option value="recipe">Recipe component</option>
              <option value="hybrid">Hybrid item</option>
              <option value="none">No stock consumption</option>
            </select>
          </div>
          <div className="t-small subtle">Stock items are global. Supplier pages link suppliers to these items; Stock & Allocation only moves existing stock.</div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setItemModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={itemBusy || !itemDraft.name.trim()}>{itemBusy ? "Creating" : "Create item"}</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

// =============== DAILY CLOSING & VARIANCE ===============
//
// This is the variance loop made visible: opening + transfers - recipe consumption from sales - recorded waste = expected closing.
// Counted closing - expected closing = variance.
// Reads the same row shape from bayaan.shift.close + bayaan.shift.close.line through /bayaan/api/chain_bootstrap.
const CLOSE_STATUS_AR = { open: "مفتوحة", pending: "بانتظار الموافقة", issue: "بحاجة مراجعة", approved: "معتمد" };
const CLOSE_STATUS_LABEL = { open: "Open", pending: "Pending approval", issue: "Needs review", approved: "Approved" };
const INVESTIGATION_STATUS_AR = {
  "Approved": "معتمد",
  "Approved by manager": "معتمد من المدير",
  "Waiting for count": "بانتظار العد",
  "Investigation open": "تحقيق مفتوح",
  "Manager review": "مراجعة المدير",
  "Ready for approval": "جاهز للاعتماد",
  "Rejected - investigation open": "مرفوض - تحقيق مفتوح",
};

function ClosingScreen({ lang, bootstrap, sourceOfTruth }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const seed = odooClosingRows(bootstrap);
  const [closings, setClosings] = useState(seed);
  const [expandedId, setExpandedId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setClosings(seed);
  }, [bootstrap]);

  const reviewClose = async (c, payload, patch, toastMessage, toastKind) => {
    setFlashId(c.id);
    setBusyId(c.id);
    try {
      if (sourceOfTruth?.enabled) {
        await sourceOfTruth.reviewShiftClose({
          closeId: c.id,
          ...payload,
        });
      }
      showToast(toastMessage, toastKind);
      setTimeout(() => withMotion(() => {
        setClosings((list) => list.map((x) => x.id === c.id ? { ...x, ...patch } : x));
      }), 200);
    } catch (error) {
      showToast(error?.message || "Could not save close review", "warn");
    } finally {
      setBusyId(null);
      setTimeout(() => setFlashId(null), 700);
    }
  };

  const onApproveClose = (c) => {
    reviewClose(
      c,
      {
        decision: "approved",
        note: c.notes || "Approved by manager after variance review.",
      },
      {
        status: "approved",
        managerReviewState: "approved",
        investigationStatus: "Approved by manager",
      },
      ar ? `تم اعتماد إغلاق ${c.kioskName}` : `Approved close - ${c.kioskName}`,
      "success",
    );
    setTimeout(() => withMotion(() => {
      setExpandedId(null);
    }), 280);
  };

  const onRejectClose = (c) => {
    const note = `Rejected by manager: variance requires cashier explanation for ${c.kioskName}.`;
    reviewClose(
      c,
      { decision: "rejected", note },
      {
        status: "issue",
        managerReviewState: "rejected",
        investigationStatus: "Rejected - investigation open",
        notes: note,
      },
      ar ? `تم رفض الإغلاق - ${c.kioskName}` : `Close rejected - ${c.kioskName} - cashier notified`,
      "warn",
    );
  };

  const onAddNote = (c) => {
    const note = `Manager note: review cash drawer, waste entries, and closing count for ${c.kioskName}.`;
    reviewClose(
      c,
      { decision: "note", note },
      {
        investigationStatus: c.status === "approved" ? c.investigationStatus : "Investigation open",
        notes: note,
      },
      ar ? `أضيفت ملاحظة على ${c.kioskName}` : `Note saved to ${c.kioskName} close`,
      "info",
    );
  };

  const totals = closings.reduce(
    (acc, c) => {
      if (c.status === "approved") acc.approved += 1;
      if (c.status === "pending" || c.status === "issue") acc.pending += 1;
      acc.cashVar += Number(c.cashVariance || 0);
      acc.stockVarValue += (c.stock || []).reduce((s, l) => s + (l.value - 0), 0);
      return acc;
    },
    { approved: 0, pending: 0, cashVar: 0, stockVarValue: 0 },
  );

  const fmtQty = (value, unit) => `${Number(value || 0).toLocaleString("en", { maximumFractionDigits: 2 })} ${unit || ""}`.trim();

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "بانتظار المراجعة" : "Pending review"} value={String(totals.pending)}
          footer={ar ? "تتطلب موافقة المدير" : "needs manager action"}/>
        <KPI label={ar ? "إغلاقات معتمدة" : "Approved closes"} value={String(totals.approved)}
          footer={ar ? "اليوم" : "today"}/>
        <KPI label={ar ? "فرق النقد" : "Cash variance"} value={fmtMoneyShort(totals.cashVar)}
          delta={totals.cashVar < 0 ? "loss" : "ok"} deltaDir={totals.cashVar < 0 ? "down" : "up"}/>
        <KPI label={ar ? "فرق المخزون (قيمة)" : "Stock variance value"} value={fmtMoneyShort(totals.stockVarValue)}
          footer={ar ? "متوقع مقابل الفعلي" : "expected vs counted"}/>
      </div>

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <AITag>{ar ? "حلقة المطابقة" : "Variance loop"}</AITag>
        </div>
        <div className="ai-block">
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {ar
              ? "كل كشك يُغلق يومياً بمقارنة المتوقع بالفعلي"
              : "Each kiosk closes daily by comparing expected to counted"}
          </div>
          <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
            {ar
              ? "افتتاح + تحويلات − استهلاك الوصفة من المبيعات − هدر مسجل = المخزون المتوقع. الفرق بين العد الفعلي والمتوقع يكشف الهدر غير المسجل أو خطأ الكاشير أو ضياع المخزون قبل تأثيره على هامش الربح."
              : "Opening + transfers - recipe consumption from sales - recorded waste = expected stock. The gap between counted and expected surfaces unrecorded waste, cashier error, or stock loss before it hits profit margin."}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "إغلاقات اليوم" : "Today's closes"}</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل المدن" : "All cities"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل الحالات" : "All statuses"} <Icon name="chevDown" size={11}/></button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" style={{ width: 24 }}></th>
              <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
              <th scope="col">{ar ? "الكاشير" : "Cashier"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "المبيعات" : "Sales"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "نقد متوقع" : "Cash expected"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "نقد فعلي" : "Cash counted"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "مدفوعات رقمية" : "Digital payments"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "فرق النقد" : "Cash variance"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "فرق المخزون" : "Stock variance"}</th>
              <th scope="col">{ar ? "الحالة" : "Status"}</th>
              <th scope="col">{ar ? "التحقيق" : "Investigation"}</th>
              <th scope="col" style={{ width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {closings.map((c) => {
              const stockVarValue = (c.stock || []).reduce((s, l) => s + (l.value - 0), 0);
              const stockVarCount = (c.stock || []).filter((l) => l.variance !== 0).length;
              const expanded = expandedId === c.id;
              const cashKnown = c.cashVariance != null;
              const investigationLabel = ar ? (INVESTIGATION_STATUS_AR[c.investigationStatus] || c.investigationStatus) : c.investigationStatus;
              const kioskProbe = { id: c.kioskId, name: c.kioskName, kioskName: c.kioskName, pos_config: c.kioskId };
              const recon = expanded ? odooKioskStockReconciliationRows(bootstrap, kioskProbe) : null;
              const statusBadge =
                c.status === "approved" ? "badge-pos"
                : c.status === "issue" ? "badge-crit"
                : c.status === "pending" ? "badge-warn"
                : "";
              const dotClass =
                c.status === "approved" ? "pos"
                : c.status === "issue" ? "crit"
                : c.status === "pending" ? "warn"
                : "";
              return (
                <React.Fragment key={c.id}>
                  <tr
                    className="row-click"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(expanded ? null : c.id); } }}
                    aria-expanded={expanded}
                    aria-label={`${c.kioskName} shift close, ${c.cashier}, expand for review`}
                    data-motion={flashId === c.id ? "approving" : undefined}
                  >
                    <td>{dotClass ? <span className={`dot ${dotClass}`}></span> : <span className="dot" style={{ opacity: 0.3 }}></span>}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{c.kioskName}</div>
                      <div className="t-small muted">{c.kioskId} - {c.city}</div>
                    </td>
                    <td className="muted">{c.cashier}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{fmtMoneyShort(c.sales)}</td>
                    <td style={{ textAlign: "end" }} className="t-num muted">{fmtMoneyShort(c.expectedCash)}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{cashKnown ? fmtMoneyShort(c.countedCash) : "-"}</td>
                    <td style={{ textAlign: "end" }} className="t-num muted">{fmtMoneyShort(c.digitalPayments || 0)}</td>
                    <td className="t-num"
                      style={{ textAlign: "end", color: cashKnown && c.cashVariance < 0 ? "var(--crit)" : cashKnown && c.cashVariance > 0 ? "var(--pos)" : "inherit" }}>
                      {cashKnown ? fmtMoneyShort(c.cashVariance) : "-"}
                    </td>
                    <td style={{ textAlign: "end", color: stockVarValue < 0 ? "var(--crit)" : "inherit" }} className="t-num">
                      {stockVarCount > 0
                        ? <>{fmtMoneyShort(stockVarValue)} <span className="muted">({stockVarCount})</span></>
                        : <span className="muted">-</span>}
                    </td>
                    <td>
                      <span className={`badge ${statusBadge}`}>
                        {ar ? CLOSE_STATUS_AR[c.status] : CLOSE_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="muted">{investigationLabel}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ width: 110, textAlign: "end" }}>
                      <div className="row" style={{ gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                        {c.status !== "approved" && c.status !== "open" && (
                          <>
                            <button
                              type="button"
                              title={ar ? "اعتماد" : "Approve"}
                              onClick={() => onApproveClose(c)}
                              disabled={busyId === c.id}
                              className="btn btn-quiet"
                              style={{ height: 24, padding: "0 6px", color: "var(--pos, #2C7C58)" }}
                            >
                              <Icon name="check" size={12}/>
                            </button>
                            <button
                              type="button"
                              title={ar ? "رفض" : "Reject"}
                              onClick={() => onRejectClose(c)}
                              disabled={busyId === c.id}
                              className="btn btn-quiet"
                              style={{ height: 24, padding: "0 6px", color: "var(--crit, #C04A38)" }}
                            >
                              <Icon name="x" size={12}/>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : c.id)}
                          className="btn btn-quiet"
                          style={{ height: 24, padding: "0 6px", color: "var(--ink-3)" }}
                          title={ar ? "تفاصيل" : "Details"}
                        >
                          <Icon name={expanded ? "chevDown" : "chevRight"} size={11}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={12} style={{ background: "var(--surface-sunk)", padding: "14px 18px" }}>
                        {(c.stock || []).length === 0 ? (
                          <div className="t-small muted" style={{ padding: "8px 0" }}>
                            {ar
                              ? "الكشك ما زال مفتوحاً. سيعرض الجرد المتوقع مقابل الفعلي عند إنهاء الوردية."
                              : "Kiosk is still open. Expected vs counted stock will appear when the shift closes."}
                          </div>
                        ) : (
                          <>
                            <div className="t-small muted" style={{ marginBottom: 8 }}>
                              {ar ? "بنود المخزون — متوقع مقابل العد الفعلي" : "Stock lines - expected vs counted"}
                            </div>
                            <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: "baseline" }}>
                              <div className="t-small muted">{ar ? "معرّف الإغلاق" : "Close id"}: <span className="t-num">{c.id}</span></div>
                              <div className="t-small muted">{ar ? "فتح" : "Opened"}: <span className="t-num">{c.openedAt || "-"}</span></div>
                              <div className="t-small muted">{ar ? "أغلق" : "Closed"}: <span className="t-num">{c.closedAt || "-"}</span></div>
                            </div>
                            <div className="ai-block" style={{ marginBottom: 10 }}>
                              <div className="t-small" style={{ fontWeight: 500 }}>{ar ? "ملاحظات" : "Notes and investigation status"}</div>
                              <div className="t-small muted" style={{ marginTop: 3 }}>
                                {investigationLabel} - {c.notes}
                              </div>
                            </div>
                            {c.recipePostingIssues > 0 && (
                              <div className="ai-block" style={{ marginBottom: 10, borderInlineStartColor: "var(--crit)" }}>
                                <div className="t-small" style={{ fontWeight: 500 }}>
                                  {ar ? "تحقق نشر الوصفة" : "Recipe posting review"}
                                </div>
                                <div className="t-small muted" style={{ marginTop: 3 }}>
                                  {c.recipePostingIssues} paid order{c.recipePostingIssues === 1 ? "" : "s"} need consumption review
                                  {c.recipePostingIssueOrders?.length ? `: ${c.recipePostingIssueOrders.join(", ")}` : "."}
                                </div>
                              </div>
                            )}
                            {recon?.length ? (
                              <>
                                <div className="t-small muted" style={{ marginBottom: 8 }}>
                                  {ar ? "مدخلات الفارق — افتتاح + مستلم − استهلاك الوصفة − هدر = المتوقع" : "Variance inputs - opening + received - recipe consumption - waste = expected"}
                                </div>
                                <table className="tbl" style={{ background: "var(--paper)", marginBottom: 12 }}>
                                  <thead>
                                    <tr>
                                      <th scope="col">{ar ? "البند" : "Item"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "افتتاح" : "Opening"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "مستلم" : "Received"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "استهلاك" : "Consumed"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "هدر" : "Waste"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "متوقع" : "Expected"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "فعلي" : "Counted"}</th>
                                      <th scope="col" style={{ textAlign: "end" }}>{ar ? "فارق" : "Variance"}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {recon.map((l, i) => (
                                      <tr key={i}>
                                        <td>{l.item}</td>
                                        <td style={{ textAlign: "end" }} className="t-num muted">{fmtQty(l.opening, l.unit)}</td>
                                        <td style={{ textAlign: "end" }} className="t-num muted">{fmtQty(l.received, l.unit)}</td>
                                        <td style={{ textAlign: "end" }} className="t-num muted">{fmtQty(l.consumed, l.unit)}</td>
                                        <td style={{ textAlign: "end" }} className="t-num muted">{fmtQty(l.waste, l.unit)}</td>
                                        <td style={{ textAlign: "end" }} className="t-num muted">{fmtQty(l.expected, l.unit)}</td>
                                        <td style={{ textAlign: "end" }} className="t-num">{fmtQty(l.actual, l.unit)}</td>
                                        <td style={{ textAlign: "end", color: l.variance < 0 ? "var(--crit)" : l.variance > 0 ? "var(--pos)" : "var(--ink-3)" }} className="t-num">
                                          {l.variance > 0 ? "+" : ""}{fmtQty(l.variance, l.unit)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            ) : null}
                            <table className="tbl" style={{ background: "var(--paper)" }}>
                              <thead>
                                <tr>
                                  <th scope="col">{ar ? "البند" : "Item"}</th>
                                  <th scope="col" style={{ textAlign: "end" }}>{ar ? "متوقع" : "Expected"}</th>
                                  <th scope="col" style={{ textAlign: "end" }}>{ar ? "فعلي" : "Counted"}</th>
                                  <th scope="col" style={{ textAlign: "end" }}>{ar ? "فرق" : "Variance"}</th>
                                  <th scope="col" style={{ textAlign: "end" }}>{ar ? "قيمة الفرق" : "Variance value"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.stock.map((l, i) => (
                                  <tr key={i}>
                                    <td>{l.item}</td>
                                    <td style={{ textAlign: "end" }} className="t-num muted">{l.expected} {l.unit}</td>
                                    <td style={{ textAlign: "end" }} className="t-num">{l.actual} {l.unit}</td>
                                    <td style={{ textAlign: "end", color: l.variance < 0 ? "var(--crit)" : l.variance > 0 ? "var(--pos)" : "var(--ink-3)" }} className="t-num">
                                      {l.variance > 0 ? "+" : ""}{l.variance} {l.unit}
                                    </td>
                                    <td style={{ textAlign: "end", color: l.value < 0 ? "var(--crit)" : "var(--ink-3)" }} className="t-num">
                                      {l.value !== 0 ? fmtMoney(l.value) : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {c.status !== "approved" && c.status !== "open" && (
                              <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                                <button className="btn btn-ghost" style={{ height: 30, fontSize: 12 }} onClick={() => onAddNote(c)} disabled={busyId === c.id}>
                                  <Icon name="flag" size={12}/>{ar ? "إضافة ملاحظة" : "Add note"}
                                </button>
                                <button className="btn btn-ghost" style={{ height: 30, fontSize: 12 }} onClick={() => onRejectClose(c)} disabled={busyId === c.id}>
                                  <Icon name="x" size={12}/>{ar ? "رفض" : "Reject"}
                                </button>
                                <button className="btn btn-accent" style={{ height: 30, fontSize: 12 }} onClick={() => onApproveClose(c)} disabled={busyId === c.id}>
                                  <Icon name="check" size={12}/>{busyId === c.id ? (ar ? "حفظ..." : "Saving...") : (ar ? "اعتماد الإغلاق" : "Approve close")}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============== PRODUCTS & RECIPES ===============
//
// Operator-facing catalog editor. Reads/writes the CatalogProvider, which persists
// to localStorage. When a real backend engine is wired in, the provider's loader
// switches from localStorage to /bayaan/api/products without changing this UI.

const RECIPE_INGREDIENTS_AR = {
  "Milk (whole) 1L": "حليب كامل ١ لتر",
  "Espresso beans — house": "حبوب إسبريسو",
  "Pistachio paste": "معجون فستق",
  "Oat milk 1L": "حليب الشوفان ١ لتر",
  "Croissant — frozen": "كرواسون مجمد",
  "Vanilla syrup 750ml": "شراب الفانيليا",
  "Lemons": "ليمون",
  "Mint — fresh": "نعناع طازج",
  "Cups 12oz": "أكواب ١٢ أونصة",
  "Chocolate — 70%": "شوكولاتة ٧٠٪",
};

const recipeProductKey = (value) => String(value || "").trim().toLowerCase();

function ProductsScreen({ lang, bootstrap, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const catalog = useCatalog();
  const { showToast } = useToast();
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [createDraft, setCreateDraft] = React.useState(null);
  const [createLines, setCreateLines] = React.useState([]);
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createError, setCreateError] = React.useState("");
  const [highlightId, setHighlightId] = React.useState(null);
  const recipeRows = odooRecipeMarginRows(bootstrap);
  const recipeCoverage = React.useMemo(
    () => new Map(recipeRows.map((row) => [recipeProductKey(row.product), row])),
    [recipeRows],
  );

  const liveProducts = odooProductCatalogRows(bootstrap);
  const products = liveProducts || catalog.state.products;
  const ingredientOptions = React.useMemo(() => odooIngredientOptions(bootstrap), [bootstrap]);
  const productHasRecipe = (product) => (
    Boolean(!liveOnly && catalog.state.recipes[product.id]?.lines?.length)
    || recipeCoverage.has(recipeProductKey(product.name))
  );
  const filtered = products
    .filter((p) => filter === "all" || p.category === filter)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  // When highlighting a freshly-created product, hoist it to the top so the user
  // sees what they just added without scrolling through 30+ rows.
  const sortedFiltered = highlightId
    ? [...filtered].sort((a, b) => (a.id === highlightId ? -1 : b.id === highlightId ? 1 : 0))
    : filtered;

  const totals = {
    total: products.length,
    withRecipe: products.filter(productHasRecipe).length,
    withImage: products.filter((p) => catalog.state.imagesBySlug[p.image] || p.image).length,
    customImages: Object.keys(catalog.state.imagesBySlug).length,
  };

  const startNew = () => {
    const id = catalog.nextId();
    const draft = { id, category: "Hot Coffee", name: "", image: "", price: 5000, sizes: ["S"] };
    setCreateDraft(draft);
    setCreateLines([]);
    setCreateError("");
  };

  const cancelCreate = () => {
    setCreateDraft(null);
    setCreateLines([]);
    setCreateError("");
    setCreateSaving(false);
  };

  const saveCreate = async () => {
    if (!createDraft) return;
    const trimmedName = (createDraft.name || "").trim();
    if (!trimmedName) {
      setCreateError(ar ? "الاسم مطلوب" : "Name is required");
      return;
    }
    if (!(createDraft.price >= 0)) {
      setCreateError(ar ? "السعر يجب أن يكون رقماً موجباً" : "Price must be a non-negative number");
      return;
    }
    const slug = (createDraft.image || slugify(trimmedName)) + (createDraft.image ? "" : "-" + createDraft.id);
    const finalProduct = {
      ...createDraft,
      name: trimmedName,
      price: Math.max(0, Number(createDraft.price) || 0),
      image: slugify(slug) || `product-${createDraft.id}`,
      sizes: (createDraft.sizes || []).filter(Boolean),
    };
    if (finalProduct.sizes.length === 0) finalProduct.sizes = ["S"];
    const validLines = createLines.filter((l) => l.ingredient && l.qty > 0);
    setCreateSaving(true);
    setCreateError("");
    try {
      let savedProduct = finalProduct;
      if (sourceOfTruth?.enabled) {
        const created = unwrapOdoo(await sourceOfTruth.upsertProductCatalog({
          name: finalProduct.name,
          code: finalProduct.code,
          category: finalProduct.category,
          listPrice: finalProduct.price,
          standardPrice: 0,
          consumptionMode: validLines.length ? "recipe" : "finished",
          availableInPos: true,
        }));
        savedProduct = {
          ...finalProduct,
          id: created?.product?.id || finalProduct.id,
          odooId: created?.product?.id,
          code: created?.product?.default_code || finalProduct.code,
          uom: created?.product?.uom || finalProduct.uom,
        };
      } else {
        catalog.upsertProduct(finalProduct);
        catalog.setRecipe(finalProduct.id, validLines);
      }
      if (sourceOfTruth?.enabled && validLines.length) {
        await sourceOfTruth.submitRecipeVersion({
          itemId: savedProduct.code || savedProduct.name,
          effectiveFrom: new Date().toISOString(),
          ingredients: validLines.map((line) => ({
            ingredientId: line.ingredient,
            qty: Number(line.qty) || 0,
            uom: line.unit,
          })),
          submit: true,
        });
        await refreshOdoo?.();
      }
      if (sourceOfTruth?.enabled && !validLines.length) await refreshOdoo?.();
      showToast(
        ar ? `تمت إضافة ${finalProduct.name}` : `Added ${finalProduct.name}`,
        "success",
      );
      // Make sure the user actually sees the new row: switch filter to its
      // category, clear search, and pin it to the top with a brief highlight.
      setSearch("");
      setFilter(finalProduct.category);
      setHighlightId(finalProduct.id);
      window.setTimeout(() => setHighlightId(null), 4000);
      cancelCreate();
    } catch (err) {
      const message = String(err?.message ?? err);
      setCreateError(message);
      showToast(message || "Could not save product", "warn");
    } finally {
      setCreateSaving(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "المنتجات" : "Products"} value={String(totals.total)}
          footer={ar ? "في القائمة" : "on the menu"}/>
        <KPI label={ar ? "بوصفة محددة" : "With recipe"} value={String(totals.withRecipe)}
          footer={`${Math.round((totals.withRecipe / Math.max(1, totals.total)) * 100)}% ${ar ? "تغطية" : "coverage"}`}/>
        <KPI label={ar ? "صور مخصصة" : "Custom images"} value={String(totals.customImages)}
          footer={ar ? "محملة محلياً" : "uploaded locally"}/>
        <KPI label={ar ? "بدون وصفة" : "Missing recipes"} value={String(totals.total - totals.withRecipe)}
          delta={totals.total - totals.withRecipe > 0 ? "needs attention" : "all set"}
          deltaDir={totals.total - totals.withRecipe > 0 ? "down" : "up"}/>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "تكلفة الوصفة والهامش" : "Recipe cost and margin control"}</div>
            <div className="t-small subtle">{ar ? "الإصدار الفعال يحكم استهلاك المكونات وقت البيع" : "Effective recipe version controls ingredient consumption at sale time"}</div>
          </div>
          <span className="badge badge-ai">versioned recipes</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "المنتج" : "Product"}</th>
              <th scope="col">{ar ? "إصدار الوصفة" : "Recipe version"}</th>
              <th scope="col">{ar ? "المكونات" : "Ingredients / packaging"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "السعر" : "Price"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "التكلفة" : "Cost"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الهامش" : "Gross margin"}</th>
            </tr>
          </thead>
          <tbody>
            {recipeRows.map((row) => (
              <tr key={`${row.product}-${row.version}`}>
                <td style={{ fontWeight: 500 }}>{row.product}</td>
                <td><span className={`badge ${row.status === "watch" ? "badge-warn" : "badge-pos"}`}>{row.version}</span></td>
                <td className="muted">{row.ingredients}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.price)}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.cost)}</td>
                <td className="t-num" style={{ textAlign: "end", color: String(row.margin).startsWith("4") || String(row.margin).startsWith("3") ? "var(--warn)" : "var(--pos)" }}>{row.margin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <AITag>{ar ? "وضع تجريبي" : "Demo persistence"}</AITag>
        </div>
        <div className="ai-block">
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {ar ? "التغييرات تُحفظ محلياً في المتصفح" : "Changes save to this browser"}
          </div>
          <div className="t-small muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
            {ar
              ? "أسماء المنتجات والأسعار والوصفات والصور المرفوعة تبقى بعد التحديث في هذا المتصفح فقط. عند توصيل محرك البيانات الفعلي، نفس الواجهة تكتب إلى /bayaan/api/products و /bayaan/api/recipe_version."
              : "Product names, prices, recipes, and uploaded images persist across reloads in this browser only. When the backend engine is connected, the same UI writes to /bayaan/api/products and /bayaan/api/recipe_version."}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px", flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className={"btn " + (filter === "all" ? "btn-primary" : "btn-ghost")}
              onClick={() => setFilter("all")} style={{ height: 28, fontSize: 12 }}>
              {ar ? "الكل" : "All"} <span className="muted" style={{ marginInlineStart: 6 }}>{products.length}</span>
            </button>
            {CATEGORY_ORDER.map((c) => {
              const count = products.filter((p) => p.category === c).length;
              return (
                <button key={c} className={"btn " + (filter === c ? "btn-primary" : "btn-ghost")}
                  onClick={() => setFilter(c)} style={{ height: 28, fontSize: 12 }}>
                  {c} <span className="muted" style={{ marginInlineStart: 6 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6, padding: "0 10px", height: 28, background: "var(--surface-sunk)", border: "1px solid var(--line)", borderRadius: 6, minWidth: 160 }}>
              <Icon name="search" size={12} style={{ color: "var(--ink-3)" }}/>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={ar ? "بحث" : "Search"}
                style={{ flex: 1, border: 0, background: "transparent", outline: "none", fontSize: 12.5 }}/>
            </div>
            <button className="btn btn-accent" onClick={startNew} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "منتج جديد" : "New product"}
            </button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" style={{ width: 56 }}></th>
              <th scope="col">{ar ? "المنتج" : "Product"}</th>
              <th scope="col">{ar ? "الفئة" : "Category"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "السعر" : "Price"}</th>
              <th scope="col">{ar ? "الأحجام" : "Sizes"}</th>
              <th scope="col">{ar ? "الوصفة" : "Recipe"}</th>
              <th scope="col" style={{ width: 100, textAlign: "end" }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((p) => {
              const recipe = catalog.state.recipes[p.id];
              const engineRecipe = recipeCoverage.get(recipeProductKey(p.name));
              const lineCount = recipe?.lines?.length ?? 0;
              const isEditing = editingId === p.id;
              const isHighlighted = highlightId === p.id;
              return (
                <React.Fragment key={p.id}>
                  <tr className="row-click" style={isHighlighted ? {
                    background: "var(--accent-soft, #FFF6E0)",
                    boxShadow: "inset 3px 0 0 var(--accent, #B88A2C)",
                    transition: "background 600ms",
                  } : undefined}>
                    <td><ProductImage slug={p.image} name={p.name} size={40} radius={6}/></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div className="t-small muted">{p.image}</div>
                    </td>
                    <td className="muted">{p.category}</td>
                    <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(p.price)}</td>
                    <td className="muted">{p.sizes.join(" · ")}</td>
                    <td>
                      {lineCount > 0
                        ? <span className="badge badge-pos">{lineCount} {ar ? "بنود" : "lines"}</span>
                        : engineRecipe
                          ? <span className={`badge ${engineRecipe.status === "watch" ? "badge-warn" : "badge-pos"}`}>{engineRecipe.version}</span>
                        : <span className="badge badge-warn">{ar ? "غير محددة" : "not set"}</span>}
                    </td>
                    <td style={{ textAlign: "end" }}>
                      <button className="btn btn-ghost" style={{ height: 24, fontSize: 11 }}
                        onClick={() => setEditingId(isEditing ? null : p.id)}>
                        {isEditing ? (ar ? "إغلاق" : "Close") : (ar ? "تحرير" : "Edit")}
                      </button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--surface-sunk)", padding: "16px 18px" }}>
                        <ProductEditor product={p} ar={ar} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo} ingredientOptions={ingredientOptions} liveOnly={liveOnly} onClose={() => setEditingId(null)}/>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>
                  {ar ? "لا توجد منتجات" : "No products"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProductCreateDialog
        ar={ar}
        open={createDraft != null}
        draft={createDraft}
        setDraft={setCreateDraft}
        lines={createLines}
        setLines={setCreateLines}
        saving={createSaving}
        error={createError}
        onCancel={cancelCreate}
        onSave={saveCreate}
        ingredientOptions={ingredientOptions}
      />
    </div>
  );
}

function ProductCreateDialog({ ar, open, draft, setDraft, lines, setLines, saving, error, onCancel, onSave, ingredientOptions = [] }) {
  if (!open || !draft) return null;

  const addLine = () => {
    const first = ingredientOptions[0];
    if (!first) return;
    setLines([...lines, { ingredient: first.value, qty: 0, unit: first.unit }]);
  };
  const updateLine = (i, patch) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  return (
    <Modal
      open={open}
      onClose={onCancel}
      width={760}
      title={ar ? "منتج جديد" : "New product"}
      sub={ar
        ? "املأ الاسم والسعر والفئة والمكونات. سيظهر المنتج فور الحفظ في القائمة أعلى."
        : "Fill in name, price, category, and ingredients. The product appears at the top of the list on save."}
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="col" style={{ flex: 2, gap: 4 }}>
            <label className="t-micro">{ar ? "الاسم" : "Name"}</label>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={ar ? "مثال: لاتيه فانيلا" : "e.g. Vanilla Latte"}
              style={editorInput}
            />
          </div>
          <div className="col" style={{ flex: 1, gap: 4 }}>
            <label className="t-micro">{ar ? "السعر (د.ع)" : "Price (IQD)"}</label>
            <input
              type="number"
              min={0}
              step={500}
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              style={editorInput}
            />
          </div>
          <div className="col" style={{ flex: 1, gap: 4 }}>
            <label className="t-micro">{ar ? "الفئة" : "Category"}</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              style={editorInput}
            >
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div className="col" style={{ flex: 2, gap: 4 }}>
            <label className="t-micro">{ar ? "الأحجام (مفصولة بفاصلة)" : "Sizes (comma-separated)"}</label>
            <input
              value={(draft.sizes || []).join(", ")}
              onChange={(e) => setDraft({ ...draft, sizes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="S, M, L"
              style={editorInput}
            />
          </div>
          <div className="col" style={{ flex: 2, gap: 4 }}>
            <label className="t-micro">{ar ? "معرف الصورة (slug)" : "Image slug (optional)"}</label>
            <input
              value={draft.image}
              onChange={(e) => setDraft({ ...draft, image: e.target.value })}
              placeholder={ar ? "تلقائي من الاسم" : "auto from name"}
              style={editorInput}
            />
          </div>
        </div>

        <div className="col" style={{ gap: 6, marginTop: 4 }}>
          <div className="between">
            <div className="t-micro">{ar ? "وصفة المكونات (اختياري)" : "Recipe ingredients (optional)"}</div>
            <button type="button" className="btn btn-ghost" onClick={addLine} style={{ height: 24, fontSize: 11 }}>
              <Icon name="plus" size={11}/>{ar ? "إضافة بند" : "Add line"}
            </button>
          </div>
          {lines.length === 0 ? (
            <div className="t-small muted" style={{ padding: "6px 0" }}>
              {ar
                ? "بدون مكونات سيتعامل النظام مع المنتج كمنتج نهائي. أضف مكونات لتفعيل خصم المخزون لكل بيع."
                : "Without ingredients the product is treated as a finished item. Add lines to enable per-sale stock deduction."}
            </div>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              {lines.map((l, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <select
                    value={l.ingredient}
                    onChange={(e) => {
                      const opt = ingredientOptions.find((o) => o.value === e.target.value);
                      updateLine(i, { ingredient: e.target.value, unit: opt?.unit ?? l.unit });
                    }}
                    style={{ ...editorInput, flex: 2 }}
                  >
                    {ingredientOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {ar ? (RECIPE_INGREDIENTS_AR[opt.value] ?? opt.label) : opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={l.qty}
                    onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                    style={{ ...editorInput, width: 90 }}
                  />
                  <input
                    value={l.unit}
                    placeholder="unit"
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    style={{ ...editorInput, width: 80 }}
                  />
                  <button type="button" className="btn btn-quiet" onClick={() => removeLine(i)} style={{ height: 30, fontSize: 11 }}>
                    <Icon name="x" size={11}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="t-small" style={{ color: "var(--crit, #C04A38)" }}>{error}</div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} style={{ height: 32, fontSize: 12 }}>
            {ar ? "إلغاء" : "Cancel"}
          </button>
          <button type="button" className="btn btn-accent" onClick={onSave} disabled={saving} style={{ height: 32, fontSize: 12 }}>
            <Icon name="check" size={12}/>{saving ? (ar ? "جارٍ الحفظ" : "Saving") : (ar ? "إضافة المنتج" : "Add product")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProductEditor({ product, ar, sourceOfTruth, refreshOdoo, ingredientOptions = [], liveOnly, onClose }) {
  const catalog = useCatalog();
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState(product);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const recipeLines = liveOnly
    ? []
    : catalog.state.recipes[product.id]?.lines ?? [];
  const [lines, setLines] = React.useState(recipeLines);

  React.useEffect(() => { setDraft(product); }, [product.id]);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const dataUrl = await resizeToWebp(file, 256, 0.82);
      catalog.setImage(draft.image, dataUrl);
    } catch (err) {
      setError(String(err?.message ?? err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const saveProduct = async () => {
    const trimmed = { ...draft, name: draft.name.trim() || "Untitled", price: Math.max(0, Number(draft.price) || 0) };
    if (!trimmed.image) trimmed.image = slugify(trimmed.name) + "-" + trimmed.id;
    const validLines = lines.filter((l) => l.ingredient && l.qty > 0);
    if (sourceOfTruth?.enabled) {
      const saved = unwrapOdoo(await sourceOfTruth.upsertProductCatalog({
        id: trimmed.odooId || trimmed.code || trimmed.id,
        name: trimmed.name,
        code: trimmed.code,
        category: trimmed.category,
        listPrice: trimmed.price,
        standardPrice: trimmed.standardPrice || 0,
        consumptionMode: validLines.length ? "recipe" : (trimmed.consumptionMode || "finished"),
        availableInPos: true,
      }));
      const productRef = saved?.product?.default_code || trimmed.code || trimmed.name;
      if (validLines.length) {
        await sourceOfTruth.submitRecipeVersion({
          itemId: productRef,
          effectiveFrom: new Date().toISOString(),
          ingredients: validLines.map((line) => ({
            ingredientId: line.ingredient,
            qty: Number(line.qty) || 0,
            uom: line.unit,
          })),
          submit: true,
        });
      }
      await refreshOdoo?.();
      showToast(ar ? "Product saved to engine" : "Product saved to engine", "success");
      return;
    }
    catalog.upsertProduct(trimmed);
    catalog.setRecipe(trimmed.id, validLines);
    if (sourceOfTruth?.enabled && validLines.length) {
      await sourceOfTruth.submitRecipeVersion({
        itemId: trimmed.name,
        effectiveFrom: new Date().toISOString(),
        ingredients: validLines.map((line) => ({
          ingredientId: line.ingredient,
          qty: Number(line.qty) || 0,
          uom: line.unit,
        })),
        submit: true,
      });
      showToast(ar ? "تم إرسال إصدار الوصفة إلى المحرك" : "Recipe version sent to engine", "success");
    } else {
      showToast(ar ? "تم الحفظ محلياً" : "Saved locally", "success");
    }
  };

  const saveAndClose = async () => {
    setSaving(true);
    setError("");
    try {
      await saveProduct();
      onClose();
    } catch (err) {
      const message = String(err?.message ?? err);
      setError(message);
      showToast(message || "Could not save recipe version", "warn");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!window.confirm(ar ? "حذف هذا المنتج؟" : "Delete this product?")) return;
    catalog.deleteProduct(product.id);
    onClose();
  };

  const addLine = () => {
    const first = ingredientOptions[0];
    if (!first) return;
    setLines([...lines, { ingredient: first.value, qty: 0, unit: first.unit }]);
  };

  const updateLine = (i, patch) => {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLine = (i) => {
    setLines(lines.filter((_, idx) => idx !== i));
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "start" }}>
        <div className="col" style={{ gap: 10 }}>
          <div style={{ width: 180, height: 180, borderRadius: 10, overflow: "hidden", background: "var(--surface-sunk)" }}>
            <ProductImage slug={draft.image} name={draft.name} fill radius={0}/>
          </div>
          <label className="btn btn-ghost" style={{ height: 30, fontSize: 12, cursor: "pointer" }}>
            <Icon name="download" size={12} style={{ transform: "rotate(180deg)" }}/>
            {uploading ? (ar ? "جارٍ الرفع…" : "Uploading…") : (ar ? "رفع صورة" : "Upload image")}
            <input type="file" accept="image/*" onChange={onPickFile} disabled={uploading}
              style={{ display: "none" }}/>
          </label>
          {catalog.state.imagesBySlug[draft.image] && (
            <button className="btn btn-quiet" style={{ height: 26, fontSize: 11 }}
              onClick={() => catalog.clearImage(draft.image)}>
              {ar ? "إعادة للصورة الأصلية" : "Revert to default"}
            </button>
          )}
          {error && <div className="t-small" style={{ color: "var(--crit)" }}>{error}</div>}
        </div>

        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 2, gap: 4 }}>
              <label className="t-micro">{ar ? "الاسم" : "Name"}</label>
              <input value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                style={editorInput}/>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "السعر (د.ع)" : "Price (IQD)"}</label>
              <input type="number" min={0} step={500} value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                style={editorInput}/>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "الفئة" : "Category"}</label>
              <select value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                style={editorInput}>
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label className="t-micro">{ar ? "الأحجام (مفصولة بفاصلة)" : "Sizes (comma-separated)"}</label>
            <input value={draft.sizes.join(", ")}
              onChange={(e) => setDraft({ ...draft, sizes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              style={editorInput}/>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label className="t-micro">{ar ? "معرف الصورة (slug)" : "Image slug"}</label>
            <input value={draft.image}
              onChange={(e) => setDraft({ ...draft, image: slugify(e.target.value) })}
              style={editorInput}/>
            <div className="t-small muted" style={{ fontSize: 11 }}>
              {ar
                ? "يحدد ملف الصورة الافتراضي في public/products/<slug>.webp والصور المرفوعة المحفوظة محلياً"
                : "Determines the static file at public/products/<slug>.webp and the localStorage override key"}
            </div>
          </div>

          <div className="col" style={{ gap: 6, marginTop: 6 }}>
            <div className="between">
              <div className="t-micro">{ar ? "وصفة المكونات" : "Recipe ingredients"}</div>
              <button className="btn btn-ghost" onClick={addLine} style={{ height: 24, fontSize: 11 }}>
                <Icon name="plus" size={11}/>{ar ? "إضافة" : "Add line"}
              </button>
            </div>
            {lines.length === 0 ? (
              <div className="t-small muted" style={{ padding: "8px 0" }}>
                {ar ? "لا توجد بنود — أضف المكونات لبدء التتبع" : "No lines — add ingredients to enable per-sale deduction"}
              </div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                {lines.map((l, i) => (
                  <div key={i} className="row" style={{ gap: 8 }}>
                    <select value={l.ingredient}
                      onChange={(e) => {
                        const opt = ingredientOptions.find((o) => o.value === e.target.value);
                        updateLine(i, { ingredient: e.target.value, unit: opt?.unit ?? l.unit });
                      }}
                      style={{ ...editorInput, flex: 2 }}>
                      {ingredientOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {ar ? (RECIPE_INGREDIENTS_AR[opt.value] ?? opt.label) : opt.label}
                        </option>
                      ))}
                    </select>
                    <input type="number" min={0} step={0.01} value={l.qty}
                      onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      style={{ ...editorInput, width: 90 }}/>
                    <input value={l.unit} placeholder="unit"
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                      style={{ ...editorInput, width: 80 }}/>
                    <button className="btn btn-quiet" onClick={() => removeLine(i)}
                      style={{ height: 30, fontSize: 11 }}>
                      <Icon name="x" size={11}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button className="btn btn-quiet" onClick={remove} style={{ height: 30, fontSize: 12, color: "var(--crit)" }}>
              <Icon name="trash" size={12}/>{ar ? "حذف" : "Delete"}
            </button>
            <button className="btn btn-ghost" onClick={onClose} style={{ height: 30, fontSize: 12 }}>
              {ar ? "إلغاء" : "Cancel"}
            </button>
            <button className="btn btn-accent" onClick={saveAndClose} disabled={saving} style={{ height: 30, fontSize: 12 }}>
              <Icon name="check" size={12}/>{saving ? (ar ? "جارٍ الحفظ" : "Saving") : (ar ? "حفظ" : "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const editorInput = {
  height: 32,
  padding: "0 10px",
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

// =============== SUPPLIERS ===============
function SuppliersScreen({ lang, bootstrap, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const enginePurchaseOrders = odooPurchaseOrderRows(bootstrap);
  const engineSuppliers = odooSupplierRows(bootstrap);
  const engineRecurringPurchases = odooRecurringPurchaseRows(bootstrap);
  const inv = odooInventoryRows(bootstrap);
  const [purchaseOrders, setPurchaseOrders] = useState(enginePurchaseOrders);
  const [supplierRows, setSupplierRows] = useState(engineSuppliers);
  const [recurringRows, setRecurringRows] = useState(engineRecurringPurchases);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [poBusy, setPoBusy] = useState(false);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [poActionBusy, setPoActionBusy] = useState("");
  const [poDraft, setPoDraft] = useState({
    supplier: MOCK.suppliers[0]?.name || "",
    warehouse: DEFAULT_WAREHOUSE_NAME,
    scheduleDate: tomorrowIsoDate(),
    invoiceRef: "",
    invoiceName: "",
    invoiceFileBase64: "",
    invoiceMimeType: "",
    lines: [purchaseLineFromInventory(MOCK.inventory[0])],
  });
  const [supplierDraft, setSupplierDraft] = useState({
    name: "",
    address: "",
    deliveryCategory: "Same day",
    category: "Produce",
  });
  const [recurringDraft, setRecurringDraft] = useState({
    name: "Weekly fresh milk",
    supplier: "",
    warehouse: DEFAULT_WAREHOUSE_NAME,
    frequency: "weekly",
    weekday: "0",
    nextDate: tomorrowIsoDate(),
    lines: [],
  });
  React.useEffect(() => { setPurchaseOrders(enginePurchaseOrders); }, [bootstrap]);
  React.useEffect(() => { setRecurringRows(engineRecurringPurchases); }, [bootstrap]);
  React.useEffect(() => {
    if (engineSuppliers.length) {
      setSupplierRows(engineSuppliers);
      return;
    }
    const bySupplier = new Map();
    enginePurchaseOrders.forEach((po) => {
      if (!po.supplier) return;
      const row = bySupplier.get(po.supplier) || {
        name: po.supplier,
        category: "From purchase orders",
        address: "From purchase records",
        deliveryCategory: "Review",
        spend30: 0,
        lastOrder: po.po || "-",
        status: "review",
      };
      row.spend30 += Number(po.value || 0);
      row.lastOrder = po.po || row.lastOrder;
      bySupplier.set(po.supplier, row);
    });
    setSupplierRows(Array.from(bySupplier.values()));
    setPoDraft((draft) => draft.supplier || draft.lines?.length ? { ...draft, supplier: "", lines: [] } : draft);
  }, [bootstrap, engineSuppliers.length, liveOnly]);
  const openPurchaseOrders = purchaseOrders.filter((po) => !["done", "received", "cancel", "cancelled"].includes(String(po.status).toLowerCase()));
  const supplierCategories = ["all", ...Array.from(new Set(supplierRows.map((supplier) => supplier.category)))];
  const filteredSuppliers = categoryFilter === "all"
    ? supplierRows
    : supplierRows.filter((supplier) => supplier.category === categoryFilter);
  const priceChangeRows = liveOnly ? [] : [
    ["Milk (whole) 1L", "L", "Baghdad Dairy", "Same day"],
    ["Oranges", "kg", "Najaf Fresh", "Next morning"],
    ["Pistachio paste", "kg", "Mesopotamia Foods", "2-3 days"],
    ["Cups 12oz", "pc", "Iraq Pack", "Weekly"],
  ];
  const openPoModal = (supplier = supplierRows[0]) => {
    setPoDraft((draft) => ({
      ...draft,
      supplier: supplier?.name || draft.supplier,
      warehouse: draft.warehouse || DEFAULT_WAREHOUSE_NAME,
      scheduleDate: draft.scheduleDate || tomorrowIsoDate(),
      invoiceRef: draft.invoiceRef || "",
      invoiceName: draft.invoiceName || "",
      invoiceFileBase64: draft.invoiceFileBase64 || "",
      invoiceMimeType: draft.invoiceMimeType || "",
      lines: draft.lines?.length ? draft.lines : [purchaseLineFromInventory(inv[0] || (liveOnly ? null : MOCK.inventory[0]))].filter((line) => line.item),
    }));
    setPoModalOpen(true);
  };
  const openRecurringModal = () => {
    const firstItem = inv[0] || (liveOnly ? null : MOCK.inventory[0]);
    setRecurringDraft((draft) => ({
      ...draft,
      supplier: draft.supplier || supplierRows[0]?.name || "",
      warehouse: draft.warehouse || DEFAULT_WAREHOUSE_NAME,
      nextDate: draft.nextDate || tomorrowIsoDate(),
      lines: draft.lines?.length ? draft.lines : [purchaseLineFromInventory(firstItem)].filter((line) => line.item),
    }));
    setRecurringModalOpen(true);
  };
  const updatePoLine = (index, patch) => {
    setPoDraft((draft) => ({
      ...draft,
      lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };
  const addPoLine = () => {
    const item = inv[0] || (liveOnly ? null : MOCK.inventory[0]);
    if (!item) {
      showToast("No live inventory items loaded for PO lines", "warn");
      return;
    }
    setPoDraft((draft) => ({ ...draft, lines: [...draft.lines, purchaseLineFromInventory(item)] }));
  };
  const removePoLine = (index) => {
    setPoDraft((draft) => ({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }));
  };
  const updateRecurringLine = (index, patch) => {
    setRecurringDraft((draft) => ({
      ...draft,
      lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };
  const addRecurringLine = () => {
    const item = inv[0] || (liveOnly ? null : MOCK.inventory[0]);
    if (!item) {
      showToast("No live inventory items loaded for recurring purchases", "warn");
      return;
    }
    setRecurringDraft((draft) => ({ ...draft, lines: [...draft.lines, purchaseLineFromInventory(item)] }));
  };
  const removeRecurringLine = (index) => {
    setRecurringDraft((draft) => ({ ...draft, lines: draft.lines.filter((_, i) => i !== index) }));
  };
  const submitRecurring = async (event) => {
    event.preventDefault();
    const lines = recurringDraft.lines
      .filter((line) => line.item && Number(line.qty || 0) > 0)
      .map((line) => ({
        item: line.item,
        qty: Number(line.qty || 0),
        unit: line.unit || inv.find((item) => item.item === line.item)?.unit || "",
        rate: Number(line.rate || 0),
      }));
    if (!recurringDraft.name.trim() || !recurringDraft.supplier || !lines.length || lines.some((line) => line.rate <= 0)) {
      showToast("Recurring purchase needs a name, supplier, item lines, quantities, and rates", "warn");
      return;
    }
    setRecurringBusy(true);
    try {
      let saved = null;
      if (sourceOfTruth?.enabled) {
        saved = unwrapOdoo(await sourceOfTruth.createRecurringPurchase({
          name: recurringDraft.name.trim(),
          supplier: recurringDraft.supplier,
          warehouse: recurringDraft.warehouse,
          frequency: recurringDraft.frequency,
          weekday: recurringDraft.weekday,
          nextDate: recurringDraft.nextDate,
          active: true,
          items: lines.map((line) => ({
            itemId: line.item,
            qty: line.qty,
            rate: line.rate,
            uom: line.unit,
          })),
        }));
        await refreshOdoo?.();
      }
      const rawPlan = saved?.recurring_purchase;
      const plan = rawPlan ? {
        id: rawPlan.id,
        name: rawPlan.name,
        supplier: rawPlan.supplier,
        warehouse: rawPlan.warehouse,
        frequency: rawPlan.frequency,
        weekday: WEEKDAY_LABELS[Number(rawPlan.weekday || 0)] || rawPlan.weekday,
        nextDate: rawPlan.nextDate,
        items: rawPlan.lines?.map((line) => `${line.product} x ${line.qty}`).join(", ") || "No lines",
        active: rawPlan.active,
      } : {
        id: `demo-recurring-${Date.now()}`,
        name: recurringDraft.name.trim(),
        supplier: recurringDraft.supplier,
        warehouse: recurringDraft.warehouse,
        frequency: recurringDraft.frequency,
        weekday: WEEKDAY_LABELS[Number(recurringDraft.weekday || 0)] || recurringDraft.weekday,
        nextDate: recurringDraft.nextDate,
        items: purchaseLineSummary(lines),
        active: true,
      };
      setRecurringRows((rows) => [plan, ...rows.filter((row) => row.id !== plan.id)]);
      setRecurringModalOpen(false);
      setRecurringDraft((draft) => ({ ...draft, name: "", lines: [] }));
      showToast(sourceOfTruth?.enabled ? "Recurring purchase saved to Odoo" : "Recurring purchase saved", "success");
    } catch (error) {
      showToast(error?.message || "Could not save recurring purchase", "warn");
    } finally {
      setRecurringBusy(false);
    }
  };
  const runRecurringPurchase = async (plan) => {
    if (!sourceOfTruth?.enabled) {
      showToast("Recurring run is available when the Odoo engine is connected", "warn");
      return;
    }
    setRecurringBusy(true);
    try {
      const result = unwrapOdoo(await sourceOfTruth.recurringPurchaseAction({ id: plan.id, action: "run" }));
      await refreshOdoo?.();
      showToast(`Created purchase order ${result?.purchase_order?.name || ""}`.trim(), "success");
    } catch (error) {
      showToast(error?.message || "Could not run recurring purchase", "warn");
    } finally {
      setRecurringBusy(false);
    }
  };
  const submitPo = async (event, submit = false) => {
    event.preventDefault();
    const lines = poDraft.lines
      .filter((line) => line.item && Number(line.qty || 0) > 0)
      .map((line) => ({
        item: line.item,
        qty: Number(line.qty || 0),
        unit: line.unit || inv.find((item) => item.item === line.item)?.unit || "",
        rate: Number(line.rate || 0),
      }));
    if (!poDraft.supplier || !lines.length || lines.some((line) => line.rate <= 0)) {
      showToast(ar ? "PO needs supplier, item lines, quantities, and rates" : "PO needs supplier, item lines, quantities, and rates", "warn");
      return;
    }
    setPoBusy(true);
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = unwrapOdoo(await sourceOfTruth.submitPurchaseOrder({
          supplier: poDraft.supplier,
          warehouse: poDraft.warehouse,
          scheduleDate: poDraft.scheduleDate,
          submit: true,
          invoiceRef: poDraft.invoiceRef,
          invoiceName: poDraft.invoiceName,
          invoiceFileBase64: poDraft.invoiceFileBase64,
          invoiceMimeType: poDraft.invoiceMimeType,
          items: lines.map((line) => ({ itemId: line.item, qty: line.qty, rate: line.rate })),
        }));
        await refreshOdoo?.();
      }
      const next = {
        po: created?.name || `PO-DRAFT-${String(purchaseOrders.length + 1).padStart(3, "0")}`,
        supplier: poDraft.supplier,
        warehouse: poDraft.warehouse,
        invoice: poDraft.invoiceRef || poDraft.invoiceName || "-",
        delivery: poDraft.scheduleDate,
        items: purchaseLineSummary(lines),
        value: purchaseTotal(lines),
        status: "created",
        lines,
      };
      setPurchaseOrders((rows) => [next, ...rows]);
      setPoDraft((draft) => ({ ...draft, invoiceRef: "", invoiceName: "", invoiceFileBase64: "", invoiceMimeType: "", lines: [] }));
      setPoModalOpen(false);
      showToast(ar ? "Purchase order created" : `${sourceOfTruth?.enabled ? "Odoo PO" : "Demo PO"} created - ${next.supplier}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create purchase order", "warn");
    } finally {
      setPoBusy(false);
    }
  };
  const advancePoStatus = async (po, action) => {
    const nextStatus = action?.next || action;
    if (sourceOfTruth?.enabled) {
      setPoActionBusy(po.po);
      try {
        const result = unwrapOdoo(await sourceOfTruth.purchaseOrderAction({
          po: po.po,
          action: action?.action || "receive",
        }));
        await refreshOdoo?.();
        const nextEngineStatus = result?.receipt_state === "done" ? "received" : result?.state || nextStatus;
        setPurchaseOrders((rows) => rows.map((row) => (row.po === po.po ? { ...row, status: nextEngineStatus } : row)));
        showToast(`Odoo PO ${po.po} moved to ${nextEngineStatus}`, "success");
      } catch (error) {
        showToast(error?.message || "Could not update purchase order in Odoo", "warn");
      } finally {
        setPoActionBusy("");
      }
      return;
    }
    setPurchaseOrders((rows) => rows.map((row) => (row.po === po.po ? { ...row, status: nextStatus } : row)));
    showToast(`PO ${po.po} moved to ${nextStatus}`, "success");
  };
  const readInvoiceFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPoDraft((draft) => ({ ...draft, invoiceName: "", invoiceFileBase64: "", invoiceMimeType: "" }));
      return;
    }
    try {
      const encoded = await readFileAsBase64(file);
      setPoDraft((draft) => ({
        ...draft,
        invoiceName: file.name,
        invoiceFileBase64: encoded,
        invoiceMimeType: file.type || "application/octet-stream",
      }));
    } catch (error) {
      showToast(error?.message || "Could not read invoice file", "warn");
    }
  };

  const submitSupplier = async (event) => {
    event.preventDefault();
    if (!supplierDraft.name.trim()) {
      showToast(ar ? "Supplier name is required" : "Supplier name is required", "warn");
      return;
    }
    const next = {
      name: supplierDraft.name.trim(),
      category: supplierDraft.category,
      address: supplierDraft.address.trim(),
      deliveryCategory: supplierDraft.deliveryCategory,
      spend30: 0,
      lastOrder: "New",
      status: "good",
    };
    setSupplierBusy(true);
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = unwrapOdoo(await sourceOfTruth.createSupplier({
          name: next.name,
          address: next.address,
          category: next.category,
          deliveryCategory: next.deliveryCategory,
        }));
        await refreshOdoo?.();
      }
      setSupplierRows((rows) => [created?.supplier || next, ...rows.filter((row) => row.name !== next.name)]);
      setSupplierDraft({ name: "", address: "", deliveryCategory: "Same day", category: "Produce" });
      setSupplierModalOpen(false);
      showToast(ar ? "Supplier added" : `Supplier added - ${next.name}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not add supplier", "warn");
    } finally {
      setSupplierBusy(false);
    }
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "none", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "موردون نشطون" : "Active suppliers"} value={String(supplierRows.length)}/>
        <KPI label={ar ? "إنفاق ٣٠ يوم" : "30-day spend"} value={fmtMoney(supplierRows.reduce((sum, supplier) => sum + Number(supplier.spend30 || 0), 0))} delta={liveOnly ? undefined : "4.2%"} deltaDir="up"/>
        <KPI label={ar ? "وصول في الموعد" : "On-time delivery"} value={liveOnly ? "0%" : "93%"} delta={liveOnly ? undefined : "2 pts"} deltaDir="down"/>
        <KPI label={ar ? "طلبات مفتوحة" : "Open POs"} value={String(openPurchaseOrders.length)} footer={ar ? "بيانات الشراء" : "purchase.order"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "طلبات الشراء المفتوحة" : "Open purchase orders"}</div>
              <div className="t-small subtle">{ar ? "المشتريات التي تغير تكلفة المنتج" : "Invoice-first purchases assigned to a receiving warehouse"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => openPoModal()} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "طلب شراء" : "Upload invoice"}
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "الطلب" : "PO"}</th>
                <th scope="col">{ar ? "المورد" : "Supplier"}</th>
                <th scope="col">{ar ? "الفاتورة" : "Invoice"}</th>
                <th scope="col">{ar ? "المستودع" : "Warehouse"}</th>
                <th scope="col">{ar ? "بنود" : "Items"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "القيمة" : "Value"}</th>
                <th scope="col">{ar ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.po}>
                  <td className="t-num">{po.po}</td>
                  <td>{po.supplier}</td>
                  <td className="muted">{po.invoice || "-"}</td>
                  <td className="muted">{po.warehouse || DEFAULT_WAREHOUSE_NAME}</td>
                  <td className="muted">{po.items}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(po.value)}</td>
                  <td style={{ textAlign: "end" }}>
                    <span className={`badge ${purchaseStatusClass(po.status)}`}>{po.status}</span>
                    {nextPurchaseAction(po.status) && (
                      <button className="btn btn-ghost" onClick={() => advancePoStatus(po, nextPurchaseAction(po.status))}
                        disabled={poActionBusy === po.po}
                        style={{ height: 24, fontSize: 11, marginInlineStart: 6 }}>
                        {poActionBusy === po.po ? "Working" : nextPurchaseAction(po.status).label}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "تغيرات سعر المكونات" : "Supplier item catalog"}</div>
              <div className="t-small subtle">{ar ? "الأثر على هامش المنتجات" : "Items must exist before invoice lines can be matched"}</div>
            </div>
            <span className="badge badge-ai">margin watch</span>
          </div>
          <table className="tbl">
            <tbody>
              {priceChangeRows.length ? priceChangeRows.map(([item, unit, supplier, delivery]) => (
                <tr key={item}>
                  <td style={{ fontWeight: 500 }}>{item}</td>
                  <td className="muted">{unit}</td>
                  <td className="muted">{supplier}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{delivery}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="muted">No verified supplier price changes loaded from the engine.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "Recurring purchases" : "Recurring purchases"}</div>
            <div className="t-small subtle">{ar ? "Plans create purchase orders; receiving stays human-confirmed" : "Plans create purchase orders; receiving stays human-confirmed"}</div>
          </div>
          <button className="btn btn-ghost" onClick={openRecurringModal} style={{ height: 28, fontSize: 12 }}>
            <Icon name="plus" size={12}/>{ar ? "Schedule" : "Schedule"}
          </button>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "Plan" : "Plan"}</th>
              <th scope="col">{ar ? "Supplier" : "Supplier"}</th>
              <th scope="col">{ar ? "Warehouse" : "Warehouse"}</th>
              <th scope="col">{ar ? "Schedule" : "Schedule"}</th>
              <th scope="col">{ar ? "Items" : "Items"}</th>
              <th scope="col" style={{ textAlign: "end" }}></th>
            </tr>
          </thead>
          <tbody>
            {recurringRows.map((plan) => (
              <tr key={plan.id || plan.name}>
                <td style={{ fontWeight: 500 }}>{plan.name}</td>
                <td className="muted">{plan.supplier}</td>
                <td className="muted">{plan.warehouse}</td>
                <td><span className="badge">{plan.frequency} {plan.weekday || ""} - {plan.nextDate || "-"}</span></td>
                <td className="muted">{plan.items}</td>
                <td style={{ textAlign: "end" }}>
                  <button className="btn btn-ghost" onClick={() => runRecurringPurchase(plan)} disabled={recurringBusy || !sourceOfTruth?.enabled} style={{ height: 24, fontSize: 11 }}>
                    {ar ? "Create PO" : "Create PO"}
                  </button>
                </td>
              </tr>
            ))}
            {!recurringRows.length && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>No recurring purchase plans yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "الموردون" : "Suppliers"}</div>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 150 }}>
              {supplierCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setSupplierModalOpen(true)} style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "مورد جديد" : "Add supplier"}</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "المورد" : "Supplier"}</th>
              <th scope="col">{ar ? "الفئة" : "Category"}</th>
              <th scope="col">{ar ? "العنوان" : "Address"}</th>
              <th scope="col">{ar ? "وقت التوصيل" : "Delivery time"}</th>
              <th scope="col">{ar ? "آخر طلب" : "Last order"}</th>
              <th scope="col" style={{ textAlign: "end" }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.map((s, i) => (
              <tr key={i} className="row-click">
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--surface-sunk)",
                      display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>
                      {s.name[0]}
                    </div>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                  </div>
                </td>
                <td className="muted">{s.category}</td>
                <td className="muted">{s.address || "Address not set"}</td>
                <td><span className="badge">{s.deliveryCategory || "Review"}</span></td>
                <td className="muted">{s.lastOrder}</td>
                <td style={{ textAlign: "end" }}>
                  <button className="btn btn-ghost" onClick={() => openPoModal(s)} style={{ height: 24, fontSize: 11 }}>{ar ? "طلب جديد" : "Upload invoice"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={poModalOpen} onClose={() => setPoModalOpen(false)}
        title={ar ? "New purchase order" : "Upload invoice"}
        sub={ar ? "Supplier to warehouse receiving" : "Invoice first, then match items and assign receiving warehouse"}
        width={700}>
        <form onSubmit={(event) => submitPo(event, false)} className="col" style={{ gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8 }}>
            <input className="input" type="file" accept="image/*,.pdf" onChange={readInvoiceFile}/>
            <input className="input" value={poDraft.invoiceRef} onChange={(event) => setPoDraft((draft) => ({ ...draft, invoiceRef: event.target.value }))} placeholder="Invoice number"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 150px", gap: 8 }}>
          <select className="input" value={poDraft.supplier} onChange={(event) => setPoDraft((draft) => ({ ...draft, supplier: event.target.value }))}>
            {supplierRows.length ? supplierRows.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>) : <option value="">No live suppliers loaded</option>}
          </select>
            <select className="input" value={poDraft.warehouse} onChange={(event) => setPoDraft((draft) => ({ ...draft, warehouse: event.target.value }))}>
              <option value={DEFAULT_WAREHOUSE_NAME}>{DEFAULT_WAREHOUSE_NAME}</option>
              <option value="Baghdad Area Warehouse">Baghdad Area Warehouse</option>
            </select>
            <input className="input" type="date" value={poDraft.scheduleDate} onChange={(event) => setPoDraft((draft) => ({ ...draft, scheduleDate: event.target.value }))}/>
          </div>
          <div className="t-small subtle">Creating the PO means the purchase has been made. Warehouse stock increases only when a human confirms receipt.</div>
          <div className="col" style={{ gap: 8 }}>
            {poDraft.lines.map((line, index) => (
              <div key={index} className="row" style={{ gap: 8 }}>
                <select className="input" value={line.item} onChange={(event) => {
                  const picked = inv.find((item) => item.item === event.target.value);
                  updatePoLine(index, {
                    item: event.target.value,
                    unit: picked?.unit || line.unit,
                    rate: estimatePurchaseRate(picked || event.target.value),
                  });
                }} style={{ flex: 1.6 }}>
                  {inv.map((item) => <option key={item.item} value={item.item}>{item.item}</option>)}
                </select>
                <input className="input" value={line.qty} onChange={(event) => updatePoLine(index, { qty: event.target.value })} placeholder="Qty" inputMode="decimal" style={{ flex: 0.55 }}/>
                <input className="input" value={line.unit} onChange={(event) => updatePoLine(index, { unit: event.target.value })} placeholder="Unit" style={{ flex: 0.5 }}/>
                <input className="input" value={line.rate} onChange={(event) => updatePoLine(index, { rate: event.target.value })} placeholder="Unit cost" inputMode="numeric" style={{ flex: 0.8 }}/>
                <div className="t-num muted" style={{ width: 110, textAlign: "end" }}>{fmtMoney(purchaseLineTotal(line))}</div>
                <button type="button" className="btn btn-ghost" onClick={() => removePoLine(index)} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}>
                  <Icon name="x" size={12}/>
                </button>
              </div>
            ))}
          </div>
          <div className="between" style={{ paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={addPoLine} style={{ height: 30, fontSize: 12 }}>
              <Icon name="plus" size={12}/>Add line
            </button>
            <div className="t-num" style={{ fontSize: 14 }}>Total {fmtMoney(purchaseTotal(poDraft.lines))}</div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPoModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={poBusy}>{poBusy ? "Creating..." : "Create purchase order"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}
        title={ar ? "Add supplier" : "Add supplier"}
        sub={ar ? "Supplier setup" : "Supplier setup"}>
        <form onSubmit={submitSupplier} className="col" style={{ gap: 10 }}>
          <input className="input" value={supplierDraft.name} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Supplier name"/>
          <input className="input" value={supplierDraft.address} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, address: event.target.value }))} placeholder="Address"/>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="input" value={supplierDraft.category} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Category"/>
            <select className="input" value={supplierDraft.deliveryCategory} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, deliveryCategory: event.target.value }))}>
              {["Same day", "Next morning", "2-3 days", "Weekly"].map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setSupplierModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={supplierBusy}>{supplierBusy ? "Adding..." : "Add supplier"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)}
        title={ar ? "Recurring purchase" : "Recurring purchase"}
        sub={ar ? "Create PO plans; receipt remains manual" : "Create PO plans; receipt remains manual"}
        width={700}>
        <form onSubmit={submitRecurring} className="col" style={{ gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 8 }}>
            <input className="input" value={recurringDraft.name} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Plan name"/>
            <select className="input" value={recurringDraft.supplier} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, supplier: event.target.value }))}>
              {supplierRows.length ? supplierRows.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>) : <option value="">No live suppliers loaded</option>}
            </select>
            <select className="input" value={recurringDraft.frequency} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, frequency: event.target.value }))}>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8 }}>
            <select className="input" value={recurringDraft.warehouse} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, warehouse: event.target.value }))}>
              <option value={DEFAULT_WAREHOUSE_NAME}>{DEFAULT_WAREHOUSE_NAME}</option>
              <option value="Baghdad Area Warehouse">Baghdad Area Warehouse</option>
            </select>
            <select className="input" value={recurringDraft.weekday} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, weekday: event.target.value }))}>
              {WEEKDAY_LABELS.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            </select>
            <input className="input" type="date" value={recurringDraft.nextDate} onChange={(event) => setRecurringDraft((draft) => ({ ...draft, nextDate: event.target.value }))}/>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {recurringDraft.lines.map((line, index) => (
              <div key={index} className="row" style={{ gap: 8 }}>
                <select className="input" value={line.item} onChange={(event) => {
                  const picked = inv.find((item) => item.item === event.target.value);
                  updateRecurringLine(index, {
                    item: event.target.value,
                    unit: picked?.unit || line.unit,
                    rate: estimatePurchaseRate(picked || event.target.value),
                  });
                }} style={{ flex: 1.6 }}>
                  {inv.map((item) => <option key={item.item} value={item.item}>{item.item}</option>)}
                </select>
                <input className="input" value={line.qty} onChange={(event) => updateRecurringLine(index, { qty: event.target.value })} placeholder="Qty" inputMode="decimal" style={{ flex: 0.55 }}/>
                <input className="input" value={line.unit} onChange={(event) => updateRecurringLine(index, { unit: event.target.value })} placeholder="Unit" style={{ flex: 0.5 }}/>
                <input className="input" value={line.rate} onChange={(event) => updateRecurringLine(index, { rate: event.target.value })} placeholder="Unit cost" inputMode="numeric" style={{ flex: 0.8 }}/>
                <button type="button" className="btn btn-ghost" onClick={() => removeRecurringLine(index)} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}>
                  <Icon name="x" size={12}/>
                </button>
              </div>
            ))}
          </div>
          <div className="between" style={{ paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={addRecurringLine} style={{ height: 30, fontSize: 12 }}>
              <Icon name="plus" size={12}/>Add line
            </button>
            <div className="t-num" style={{ fontSize: 14 }}>Planned total {fmtMoney(purchaseTotal(recurringDraft.lines))}</div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setRecurringModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={recurringBusy}>{recurringBusy ? "Saving..." : "Save plan"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =============== STAFF ===============
function StaffScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const cashierRows = odooCashierPerformanceRows(bootstrap);
  const underReview = cashierRows.filter((row) => row.shortage < 0).length;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "نشطون" : "Active staff"} value="32"/>
        <KPI label={ar ? "كشف الرواتب" : "Monthly payroll"} value={fmtMoney(186400)} footer={ar ? "خلال ٦ أيام" : "runs in 6d"}/>
        <KPI label={ar ? "متوسط ساعات الأسبوع" : "Avg weekly hrs"} value="42" delta="2h" deltaDir="up"/>
        <KPI label={ar ? "تحت المراجعة" : "Under review"} value={String(underReview)} footer={ar ? "تباين نقدي" : "cash variance"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "أداء الكاشير" : "Cashier performance"}</div>
              <div className="t-small subtle">{ar ? "النقد، الإلغاءات، المرتجعات، والسرعة" : "Cash shortages, voids, refunds, and throughput"}</div>
            </div>
            <span className="badge badge-warn">1 review</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "الكاشير" : "Cashier"}</th>
                <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "المبيعات" : "Sales"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "فرق النقد" : "Cash shortage"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "إلغاء/مرتجع" : "Void/refund"}</th>
              </tr>
            </thead>
            <tbody>
              {cashierRows.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td className="t-num muted">{row.kiosk}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.sales)}</td>
                  <td className="t-num" style={{ textAlign: "end", color: row.shortage < 0 ? "var(--crit)" : "var(--ink-3)" }}>
                    {row.shortage == null ? "pending close" : row.shortage === 0 ? "-" : fmtMoney(row.shortage)}
                  </td>
                  <td className="t-num" style={{ textAlign: "end" }}>{row.voidRefund}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "المصاريف" : "Expenses"}</div>
              <div className="t-small subtle">{ar ? "غير المخزون والرواتب" : "Non-stock and payroll-adjacent costs"}</div>
            </div>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "مصروف" : "Add expense"}
            </button>
          </div>
          <table className="tbl">
            <tbody>
              {[
                ["Cleaning supplies", "Operations", 118_000],
                ["Generator fuel", "Utilities", 242_000],
                ["Staff meal allowance", "Staff", 96_000],
                ["Kiosk repair", "Maintenance", 175_000],
              ].map(([name, category, amount]) => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{name}</td>
                  <td className="muted">{category}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "كشف الموظفين" : "Roster"}</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "الدور" : "Role"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "الكشك" : "Kiosk"} <Icon name="chevDown" size={11}/></button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "الموظف" : "Staff member"}</th>
              <th scope="col">{ar ? "الدور" : "Role"}</th>
              <th scope="col">{ar ? "الكشك" : "Kiosk"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "ساعات الشهر" : "Hours (mo)"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الراتب" : "Salary"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK.staff.map((p, i) => (
              <tr key={i} className="row-click">
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={p.name} size={28}/>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </div>
                </td>
                <td className="muted">{p.role}</td>
                <td className="t-num muted">{p.kiosk}</td>
                <td style={{ textAlign: "end" }} className="t-num">{p.hours}h</td>
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(p.salary)}</td>
                <td style={{ textAlign: "end" }}>
                  {p.status === "active" && <span className="badge badge-pos">{ar ? "نشط" : "Active"}</span>}
                  {p.status === "leave" && <span className="badge">{ar ? "إجازة" : "On leave"}</span>}
                  {p.status === "review" && <span className="badge badge-warn">{ar ? "مراجعة" : "Review"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HRPayrollScreen({ lang, bootstrap, sourceOfTruth, refreshOdoo }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const liveOnly = isLiveOnlyPayload(bootstrap);
  const chainHrSnapshot = odooHrSnapshot(bootstrap);
  const [payrollSnapshot, setPayrollSnapshot] = useState(null);
  const hrSnapshot = useMemo(() => {
    if (!payrollSnapshot) return chainHrSnapshot;
    return {
      ...chainHrSnapshot,
      employees: payrollSnapshot.employees?.length ? payrollSnapshot.employees : chainHrSnapshot.employees,
      attendance: payrollSnapshot.attendance?.length ? payrollSnapshot.attendance : chainHrSnapshot.attendance,
      adjustments: payrollSnapshot.adjustments || chainHrSnapshot.adjustments || [],
      payrollRuns: payrollSnapshot.payrollRuns || chainHrSnapshot.payrollRuns || [],
    };
  }, [chainHrSnapshot, payrollSnapshot]);
  const liveStaffRows = useMemo(() => staffRowsFromHrEmployees(hrSnapshot.employees || []), [hrSnapshot]);
  useEffect(() => {
    if (!liveOnly || !sourceOfTruth?.enabled) return undefined;
    let active = true;
    sourceOfTruth.getHrSnapshot()
      .then((result) => {
        if (active) setPayrollSnapshot(unwrapOdoo(result));
      })
      .catch((error) => {
        if (active) showToast(compactError(error) || "Could not refresh HR payroll snapshot", "warn");
      });
    return () => { active = false; };
  }, [liveOnly, sourceOfTruth, bootstrap]);
  const kioskOptions = useMemo(() => {
    const rows = odooKioskRows(bootstrap).map((kiosk) => ({
      id: kiosk.id || kiosk.kiosk_code,
      label: `${kiosk.id || kiosk.kiosk_code} ${kiosk.name || ""}`.trim(),
    })).filter((kiosk) => kiosk.id);
    if (rows.length || liveOnly) return rows;
    return MOCK.kiosks.map((kiosk) => ({ id: kiosk.id, label: `${kiosk.id} ${kiosk.name}` }));
  }, [bootstrap, liveOnly]);
  const defaultKioskId = kioskOptions[0]?.id || "";
  const cashierRows = odooCashierPerformanceRows(bootstrap);
  const underReview = cashierRows.filter((row) => row.shortage < 0).length;
  const [roleFilter, setRoleFilter] = useState("all");
  const [kioskFilter, setKioskFilter] = useState("all");
  const [payrollStatus, setPayrollStatus] = useState("draft");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [coverageModalOpen, setCoverageModalOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState({ name: "", category: "Operations", amount: "" });
  const [adjustmentDraft, setAdjustmentDraft] = useState({
    staff: liveOnly ? "" : MOCK.staff[2]?.name || "",
    type: "deduction",
    amount: "",
    reason: "",
  });
  const [expenseRows, setExpenseRows] = useState(liveOnly ? [] : [
    { name: "Cleaning supplies", category: "Operations", amount: 118_000 },
    { name: "Generator fuel", category: "Utilities", amount: 242_000 },
    { name: "Staff meal allowance", category: "Staff", amount: 96_000 },
    { name: "Kiosk repair", category: "Maintenance", amount: 175_000 },
  ]);
  const [localStaff, setLocalStaff] = useState([]);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState({
    name: "",
    role: "Cashier",
    kiosk: liveOnly ? defaultKioskId : MOCK.kiosks[0]?.id || "K-01",
    salary: "1500000",
    hours: "168",
  });
  const [shiftDraft, setShiftDraft] = useState({
    employee: "",
    kiosk: defaultKioskId,
    date: todayIsoDate(),
    role: "Cashier",
    start: "08:00",
    end: "16:00",
    note: "",
  });
  const [coverageDraft, setCoverageDraft] = useState({
    kiosk: defaultKioskId,
    dayOfWeek: "0",
    role: "cashier",
    start: "08:00",
    end: "16:00",
    requiredCount: "2",
  });
  const [adjustments, setAdjustments] = useState(liveOnly ? [] : [
    { staff: "Karim Fahmy", type: "deduction", amount: 32_000, reason: "Cash shortage pending review", status: "hold" },
    { staff: "Yusuf Saleh", type: "advance", amount: 150_000, reason: "Salary advance", status: "approved" },
    { staff: "Sara Younis", type: "deduction", amount: 110_000, reason: "Unpaid leave", status: "approved" },
    { staff: "Rashid Al-Tikriti", type: "bonus", amount: 85_000, reason: "Warehouse overtime", status: "approved" },
  ]);
  const liveAdjustmentRows = useMemo(() => (
    (hrSnapshot.adjustments || []).map((row) => ({
      id: row.id,
      staff: row.employee,
      type: row.type,
      amount: Number(row.amount || 0),
      reason: row.reason || "Payroll adjustment",
      status: row.state === "approved" ? "approved" : row.state === "rejected" ? "rejected" : "hold",
    }))
  ), [hrSnapshot]);
  const activeAdjustments = liveOnly ? liveAdjustmentRows : adjustments;
  const liveCoverageGaps = hrSnapshot.coverageGaps || [];
  const liveShiftRows = (hrSnapshot.shifts || []).map((shift) => ({
    ...shift,
    roleLabel: hrRoleLabel(shift.role),
    time: `${hourToTime(shift.startHour)}-${hourToTime(shift.endHour)}`,
    staff: shift.employee,
  }));
  const demoShiftRows = [
    { id: "demo-1", employee: "Maya Ahmed", kiosk: "K-01", kioskName: "Karrada Center", date: todayIsoDate(), roleLabel: "Cashier", time: "08:00-16:00", plannedHours: 8, state: "planned" },
    { id: "demo-2", employee: "Yusuf Saleh", kiosk: "K-02", kioskName: "Mansour District", date: todayIsoDate(), roleLabel: "Barista", time: "10:00-18:00", plannedHours: 8, state: "planned" },
  ];
  const scheduleRows = liveOnly ? liveShiftRows : demoShiftRows;
  const coverageGaps = liveOnly ? liveCoverageGaps : [
    { ruleId: "demo-gap", date: todayIsoDate(), kiosk: "K-04", kioskName: "Zayouna Plaza", role: "cashier", startHour: 8, endHour: 16, requiredCount: 2, assignedCount: 1, missingCount: 1, severity: "warning" },
  ];
  const attendanceRows = liveOnly ? [
    ...coverageGaps.slice(0, 6).map((gap) => ({
      staff: "Unassigned",
      kiosk: gap.kiosk,
      issue: `${gap.missingCount} missing ${hrRoleLabel(gap.role)} - ${hourToTime(gap.startHour)}-${hourToTime(gap.endHour)}`,
      hours: Number(gap.endHour || 0) - Number(gap.startHour || 0),
      impact: 0,
      status: "hold",
    })),
    ...(hrSnapshot.attendance || []).slice(0, 6).map((row) => ({
      staff: row.employee,
      kiosk: row.kiosk,
      issue: row.checkOut ? "Attendance logged" : "Open attendance",
      hours: Math.round(Number(row.workedHours || 0)),
      impact: 0,
      status: row.checkOut ? "approved" : "ready",
    })),
  ] : [
    { staff: "Sara Younis", kiosk: "K-04", issue: "Leave", hours: 88, impact: -110_000, status: "approved" },
    { staff: "Karim Fahmy", kiosk: "K-07", issue: "Cash shortage review", hours: 168, impact: -32_000, status: "hold" },
    { staff: "Rashid Al-Tikriti", kiosk: "Central", issue: "Overtime", hours: 184, impact: 85_000, status: "approved" },
    { staff: "Maya Ahmed", kiosk: "K-01", issue: "Normal shift", hours: 162, impact: 0, status: "ready" },
  ];
  useEffect(() => {
    if (!liveOnly) return;
    setExpenseRows([]);
    setAdjustments([]);
    setLocalStaff([]);
    setAdjustmentDraft((draft) => draft.staff ? { ...draft, staff: "" } : draft);
  }, [liveOnly]);
  const allStaff = useMemo(() => [...(liveOnly ? liveStaffRows : MOCK.staff), ...localStaff], [liveOnly, liveStaffRows, localStaff]);
  useEffect(() => {
    if (!liveOnly) return;
    const staffId = allStaff[0]?.id || "";
    setStaffDraft((draft) => ({ ...draft, kiosk: draft.kiosk || defaultKioskId }));
    setShiftDraft((draft) => ({
      ...draft,
      employee: draft.employee || staffId,
      kiosk: draft.kiosk || defaultKioskId,
    }));
    setCoverageDraft((draft) => ({ ...draft, kiosk: draft.kiosk || defaultKioskId }));
  }, [allStaff, defaultKioskId, liveOnly]);
  const roles = ["all", ...Array.from(new Set(allStaff.map((person) => person.role)))];
  const kiosks = ["all", ...Array.from(new Set([
    ...kioskOptions.map((kiosk) => kiosk.id),
    ...allStaff.map((person) => person.kiosk),
  ].filter(Boolean)))];
  const payrollRows = useMemo(() => allStaff.map((person) => {
    const personAdjustments = activeAdjustments.filter((item) => item.staff === person.name);
    const hourlyRate = person.salary / Math.max(person.hours, 1);
    const overtimeHours = Math.max(0, person.hours - 168);
    const overtimePay = Math.round(overtimeHours * hourlyRate * 1.25);
    const advance = personAdjustments
      .filter((item) => item.type === "advance")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const deduction = personAdjustments
      .filter((item) => item.type === "deduction")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const bonus = personAdjustments
      .filter((item) => item.type === "bonus")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const hold = person.status === "review" || personAdjustments.some((item) => item.status === "hold");
    return {
      ...person,
      overtimeHours,
      overtimePay,
      advance,
      deduction,
      bonus,
      netPay: Math.max(0, Math.round(person.salary + overtimePay + bonus - advance - deduction)),
      payrollStatus: hold ? "review" : person.status === "leave" ? "leave-adjusted" : "ready",
    };
  }), [activeAdjustments, allStaff]);
  const filteredRoster = payrollRows.filter((person) => (
    (roleFilter === "all" || person.role === roleFilter)
    && (kioskFilter === "all" || person.kiosk === kioskFilter)
  ));
  const activeStaff = allStaff.filter((person) => person.status !== "leave").length;
  const grossPayroll = payrollRows.reduce((sum, person) => sum + person.salary, 0);
  const netPayroll = payrollRows.reduce((sum, person) => sum + person.netPay, 0);
  const adjustmentTotal = payrollRows.reduce((sum, person) => sum + person.bonus + person.overtimePay - person.advance - person.deduction, 0);
  const payrollReviewCount = payrollRows.filter((person) => person.payrollStatus === "review").length;
  const avgWeeklyHours = Math.round(allStaff.reduce((sum, person) => sum + person.hours, 0) / Math.max(allStaff.length, 1) / 4);
  const missingPeople = coverageGaps.reduce((sum, gap) => sum + Number(gap.missingCount || 0), 0);
  const plannedWeeklyHours = Math.round(scheduleRows.reduce((sum, shift) => sum + Number(shift.plannedHours || 0), 0));
  const livePayrollRuns = liveOnly ? (hrSnapshot.payrollRuns || []) : [];
  const latestPayrollRun = livePayrollRuns[0] || null;
  useEffect(() => {
    if (!liveOnly) return;
    setPayrollStatus(latestPayrollRun?.state || "draft");
  }, [latestPayrollRun?.id, latestPayrollRun?.state, liveOnly]);
  const payrollStatusLabel = payrollStatus === "approved" ? "Approved" : payrollStatus === "reviewed" ? "Reviewed" : "Draft";
  const payrollStatusBadge = payrollStatus === "approved" ? "badge-pos" : payrollStatus === "reviewed" ? "badge-warn" : "";

  const submitExpense = (event) => {
    event.preventDefault();
    const amount = Number(expenseDraft.amount || 0);
    if (!expenseDraft.name.trim() || amount <= 0) {
      showToast("Expense needs name and amount", "warn");
      return;
    }
    setExpenseRows((rows) => [
      { name: expenseDraft.name.trim(), category: expenseDraft.category, amount },
      ...rows,
    ]);
    setExpenseDraft({ name: "", category: "Operations", amount: "" });
    setExpenseModalOpen(false);
    showToast("Expense recorded", "success");
  };

  const submitStaff = async (event) => {
    event.preventDefault();
    const name = staffDraft.name.trim();
    const salary = Number(staffDraft.salary || 0);
    const hours = Number(staffDraft.hours || 0);
    if (!name || salary <= 0 || hours <= 0) {
      showToast(ar ? "الاسم والراتب والساعات مطلوبة" : "Name, salary, and hours are required", "warn");
      return;
    }
    if (liveOnly && !staffDraft.kiosk) {
      showToast("Pick a live kiosk before adding staff", "warn");
      return;
    }
    if (liveOnly && sourceOfTruth?.enabled) {
      try {
        await sourceOfTruth.createHrEmployee({
          name,
          role: normalizeHrRole(staffDraft.role),
          kiosk: staffDraft.kiosk,
          monthlySalary: salary,
          expectedMonthlyHours: hours,
        });
        await refreshOdoo?.();
        setStaffDraft({ name: "", role: "Cashier", kiosk: staffDraft.kiosk || defaultKioskId, salary: "1500000", hours: "168" });
        setStaffModalOpen(false);
        showToast(`Added ${name} to live HR`, "success");
      } catch (error) {
        showToast(compactError(error) || "Could not add live staff", "warn");
      }
      return;
    }
    setLocalStaff((rows) => [
      ...rows,
      {
        name,
        role: staffDraft.role,
        kiosk: staffDraft.kiosk,
        salary,
        hours,
        status: "ready",
      },
    ]);
    setStaffDraft({
      name: "",
      role: "Cashier",
      kiosk: liveOnly ? defaultKioskId : MOCK.kiosks[0]?.id || "K-01",
      salary: "1500000",
      hours: "168",
    });
    setStaffModalOpen(false);
    showToast(ar ? `تمت إضافة ${name}` : `Added ${name}`, "success");
  };

  const submitShift = async (event) => {
    event.preventDefault();
    if (!shiftDraft.employee || !shiftDraft.kiosk || !shiftDraft.date) {
      showToast("Shift needs staff, kiosk, and date", "warn");
      return;
    }
    const startHour = timeToHour(shiftDraft.start);
    const endHour = timeToHour(shiftDraft.end);
    if (endHour <= startHour) {
      showToast("Shift end time must be after start time", "warn");
      return;
    }
    if (liveOnly && sourceOfTruth?.enabled) {
      try {
        await sourceOfTruth.createHrShift({
          employee: shiftDraft.employee,
          kiosk: shiftDraft.kiosk,
          date: shiftDraft.date,
          role: normalizeHrRole(shiftDraft.role),
          startHour,
          endHour,
          note: shiftDraft.note,
        });
        await refreshOdoo?.();
        setShiftModalOpen(false);
        showToast("Shift added to live work week", "success");
      } catch (error) {
        showToast(compactError(error) || "Could not add shift", "warn");
      }
      return;
    }
    setShiftModalOpen(false);
    showToast("Demo shift prepared", "success");
  };

  const submitCoverageRule = async (event) => {
    event.preventDefault();
    if (!coverageDraft.kiosk) {
      showToast("Coverage rule needs a kiosk", "warn");
      return;
    }
    const startHour = timeToHour(coverageDraft.start);
    const endHour = timeToHour(coverageDraft.end);
    const requiredCount = Number(coverageDraft.requiredCount || 0);
    if (endHour <= startHour || requiredCount <= 0) {
      showToast("Coverage needs valid time and headcount", "warn");
      return;
    }
    if (liveOnly && sourceOfTruth?.enabled) {
      try {
        await sourceOfTruth.createHrCoverageRule({
          kiosk: coverageDraft.kiosk,
          dayOfWeek: coverageDraft.dayOfWeek,
          role: coverageDraft.role,
          startHour,
          endHour,
          requiredCount,
        });
        await refreshOdoo?.();
        setCoverageModalOpen(false);
        showToast("Coverage rule added", "success");
      } catch (error) {
        showToast(compactError(error) || "Could not add coverage rule", "warn");
      }
      return;
    }
    setCoverageModalOpen(false);
    showToast("Demo coverage rule prepared", "success");
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    const amount = Number(adjustmentDraft.amount || 0);
    if (!adjustmentDraft.staff || amount <= 0) {
      showToast("Adjustment needs staff and amount", "warn");
      return;
    }
    if (liveOnly && sourceOfTruth?.enabled) {
      try {
        await sourceOfTruth.submitPayrollAdjustment({
          employee: adjustmentDraft.staff,
          type: adjustmentDraft.type,
          amount,
          reason: adjustmentDraft.reason || "Payroll adjustment",
        });
        await refreshOdoo?.();
        setPayrollStatus("draft");
        setAdjustmentDraft({ staff: allStaff[0]?.name || "", type: "deduction", amount: "", reason: "" });
        setAdjustmentModalOpen(false);
        showToast("Live payroll adjustment added", "success");
      } catch (error) {
        showToast(compactError(error) || "Could not add adjustment", "warn");
      }
      return;
    }
    setAdjustments((rows) => [
      {
        staff: adjustmentDraft.staff,
        type: adjustmentDraft.type,
        amount,
        reason: adjustmentDraft.reason || "Payroll adjustment",
        status: adjustmentDraft.type === "deduction" ? "hold" : "approved",
      },
      ...rows,
    ]);
    setPayrollStatus("draft");
    setAdjustmentDraft({ staff: liveOnly ? "" : MOCK.staff[2]?.name || "", type: "deduction", amount: "", reason: "" });
    setAdjustmentModalOpen(false);
    showToast("Payroll adjustment added", "success");
  };

  const refreshHrPayrollSnapshot = async () => {
    if (sourceOfTruth?.enabled) {
      const snapshot = unwrapOdoo(await sourceOfTruth.getHrSnapshot());
      setPayrollSnapshot(snapshot);
    }
    await refreshOdoo?.();
  };

  const reviewPayroll = async () => {
    if (liveOnly && sourceOfTruth?.enabled) {
      try {
        const today = todayIsoDate();
        const dateFrom = `${today.slice(0, 8)}01`;
        const run = unwrapOdoo(await sourceOfTruth.payrollRunAction({
          name: `Payroll ${dateFrom} - ${today}`,
          dateFrom,
          dateTo: today,
          compute: true,
        }));
        await refreshHrPayrollSnapshot();
        setPayrollStatus(run?.state || "reviewed");
        showToast("Live payroll run computed", "success");
      } catch (error) {
        showToast(compactError(error) || "Could not compute live payroll", "warn");
      }
      return;
    }
    setPayrollStatus("reviewed");
    showToast("Payroll marked reviewed", "success");
  };

  const approvePayroll = async () => {
    if (payrollReviewCount > 0) {
      showToast("Resolve held payroll rows first", "warn");
      return;
    }
    if (liveOnly && sourceOfTruth?.enabled) {
      if (!latestPayrollRun?.id) {
        showToast("Review payroll first to create a live payroll run", "warn");
        return;
      }
      try {
        const run = unwrapOdoo(await sourceOfTruth.payrollRunAction({
          id: latestPayrollRun.id,
          action: "approve",
        }));
        await refreshHrPayrollSnapshot();
        setPayrollStatus(run?.state || "approved");
        showToast("Live payroll approved", "success");
      } catch (error) {
        showToast(compactError(error) || "Could not approve live payroll", "warn");
      }
      return;
    }
    setPayrollStatus("approved");
    showToast("Payroll approved", "success");
  };

  const exportPayroll = () => {
    const rows = [
      ["Employee", "Role", "Kiosk", "Hours", "Base salary", "Overtime", "Bonus", "Advance", "Deduction", "Net pay", "Status"],
      ...payrollRows.map((person) => [
        person.name,
        person.role,
        person.kiosk,
        person.hours,
        person.salary,
        person.overtimePay,
        person.bonus,
        person.advance,
        person.deduction,
        person.netPay,
        person.payrollStatus,
      ]),
    ];
    const filename = `bayaan-payroll-run-${new Date().toISOString().slice(0, 10)}.csv`;
    if (typeof document !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined") {
      const blob = new Blob(["\ufeff" + csvRows(rows)], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    }
    showToast(`Payroll exported as ${filename}`, "success");
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <KPI label={ar ? "Active staff" : "Active staff"} value={String(activeStaff)} footer={ar ? "HR roster" : "HR roster"}/>
        <KPI label={ar ? "Monthly payroll" : "Monthly payroll"} value={fmtMoney(netPayroll)} footer={ar ? "next run in 6d" : "next run in 6d"}/>
        <KPI label={ar ? "Avg weekly hrs" : "Avg weekly hrs"} value={String(avgWeeklyHours)} footer={`${plannedWeeklyHours} planned`}/>
        <KPI label={ar ? "Coverage gaps" : "Coverage gaps"} value={String(missingPeople)} footer={ar ? "missing staff" : "missing staff"}/>
      </div>

      <div className="card card-pad">
        <div className="between" style={{ gap: 14, alignItems: "flex-start" }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <AITag>{ar ? "HR & Payroll" : "HR & Payroll"}</AITag>
              <span className={`badge ${payrollStatusBadge}`}>{payrollStatusLabel}</span>
            </div>
            <div className="ai-block" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 840 }}>
              Payroll is tracked as an operating cost, with advances, deductions, overtime, attendance exceptions, and cashier shortages separated before approval.
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setAdjustmentModalOpen(true)} style={{ height: 30, fontSize: 12 }}>
              <Icon name="plus" size={12}/>Adjustment
            </button>
            <button className="btn btn-ghost" onClick={reviewPayroll} style={{ height: 30, fontSize: 12 }}>
              <Icon name="check" size={12}/>Review payroll
            </button>
            <button className="btn btn-primary" onClick={approvePayroll} style={{ height: 30, fontSize: 12 }}>
              <Icon name="check" size={12}/>Approve payroll
            </button>
            <button className="btn btn-ghost" onClick={exportPayroll} style={{ height: 30, fontSize: 12 }}>
              <Icon name="download" size={12}/>Export payroll
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Kiosk coverage" : "Kiosk coverage"}</div>
              <div className="t-small subtle">{ar ? "Required slots and missing staff" : "Required slots and missing staff"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setCoverageModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "Slot" : "Slot"}
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "Day" : "Day"}</th>
                <th scope="col">{ar ? "Kiosk" : "Kiosk"}</th>
                <th scope="col">{ar ? "Slot" : "Slot"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Need" : "Need"}</th>
              </tr>
            </thead>
            <tbody>
              {coverageGaps.length ? coverageGaps.map((gap) => (
                <tr key={`${gap.ruleId || gap.kiosk}-${gap.date}-${gap.role}-${gap.startHour}`} className="row-click">
                  <td style={{ fontWeight: 500 }}>{gap.date || WEEKDAY_LABELS[Number(gap.dayOfWeek || 0)]}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{gap.kiosk}</div>
                    <div className="t-small muted">{gap.kioskName || gap.kiosk}</div>
                  </td>
                  <td className="muted">{hourToTime(gap.startHour)}-{hourToTime(gap.endHour)} / {hrRoleLabel(gap.role)}</td>
                  <td style={{ textAlign: "end" }}>
                    <span className="badge badge-warn">{gap.assignedCount || 0}/{gap.requiredCount || 0} staffed</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="muted">{ar ? "All planned slots covered" : "All planned slots covered"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Work week" : "Work week"}</div>
              <div className="t-small subtle">{ar ? "Dated shifts connected to kiosks" : "Dated shifts connected to kiosks"}</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShiftModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "Assign shift" : "Assign shift"}
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "Staff" : "Staff"}</th>
                <th scope="col">{ar ? "Kiosk" : "Kiosk"}</th>
                <th scope="col">{ar ? "Date" : "Date"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Hours" : "Hours"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "State" : "State"}</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.length ? scheduleRows.slice(0, 12).map((shift) => (
                <tr key={shift.id || `${shift.employee}-${shift.date}-${shift.startHour}`}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{shift.staff || shift.employee}</div>
                    <div className="t-small muted">{shift.roleLabel || hrRoleLabel(shift.role)}</div>
                  </td>
                  <td className="muted">{shift.kioskName || shift.kiosk}</td>
                  <td className="muted">{shift.date} / {shift.time}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{Number(shift.plannedHours || 0).toFixed(1)}h</td>
                  <td style={{ textAlign: "end" }}><span className="badge">{shift.state || "planned"}</span></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="muted">{ar ? "No shifts planned yet" : "No shifts planned yet"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Cashier performance" : "Cashier performance"}</div>
              <div className="t-small subtle">{ar ? "Cash shortages, voids, refunds, and throughput" : "Cash shortages, voids, refunds, and throughput"}</div>
            </div>
            <span className="badge badge-warn">{underReview} review</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "Cashier" : "Cashier"}</th>
                <th scope="col">{ar ? "Kiosk" : "Kiosk"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Sales" : "Sales"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Cash shortage" : "Cash shortage"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Void/refund" : "Void/refund"}</th>
              </tr>
            </thead>
            <tbody>
              {cashierRows.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td className="t-num muted">{row.kiosk}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.sales)}</td>
                  <td className="t-num" style={{ textAlign: "end", color: row.shortage < 0 ? "var(--crit)" : "var(--ink-3)" }}>
                    {row.shortage == null ? "pending close" : row.shortage === 0 ? "-" : fmtMoney(row.shortage)}
                  </td>
                  <td className="t-num" style={{ textAlign: "end" }}>{row.voidRefund}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Expenses" : "Expenses"}</div>
              <div className="t-small subtle">{ar ? "Non-stock and payroll-adjacent costs" : "Non-stock and payroll-adjacent costs"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setExpenseModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "Add expense" : "Add expense"}
            </button>
          </div>
          <table className="tbl">
            <tbody>
              {expenseRows.map(({ name, category, amount }) => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{name}</td>
                  <td className="muted">{category}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Payroll run" : "Payroll run"}</div>
              <div className="t-small subtle">{ar ? "Base salary, overtime, advances, deductions, and net pay" : "Base salary, overtime, advances, deductions, and net pay"}</div>
            </div>
            <span className="badge">{fmtMoney(grossPayroll)} gross</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "Staff" : "Staff"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Base" : "Base"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Adj." : "Adj."}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Net pay" : "Net pay"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {payrollRows.map((person) => {
                const rowAdj = person.bonus + person.overtimePay - person.advance - person.deduction;
                return (
                  <tr key={person.name}>
                    <td style={{ fontWeight: 500 }}>{person.name}</td>
                    <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(person.salary)}</td>
                    <td className="t-num" style={{ textAlign: "end", color: rowAdj < 0 ? "var(--crit)" : rowAdj > 0 ? "var(--pos)" : "var(--ink-3)" }}>
                      {rowAdj === 0 ? "-" : fmtMoney(rowAdj)}
                    </td>
                    <td className="t-num" style={{ textAlign: "end", fontWeight: 600 }}>{fmtMoney(person.netPay)}</td>
                    <td style={{ textAlign: "end" }}>
                      {person.payrollStatus === "ready" && <span className="badge badge-pos">Ready</span>}
                      {person.payrollStatus === "review" && <span className="badge badge-warn">Hold</span>}
                      {person.payrollStatus === "leave-adjusted" && <span className="badge">Leave adjusted</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Attendance exceptions" : "Attendance exceptions"}</div>
              <div className="t-small subtle">{ar ? "Leave, overtime, shortages, and payroll impact" : "Leave, overtime, shortages, and payroll impact"}</div>
            </div>
            <span className="badge">{fmtMoney(adjustmentTotal)} net adj.</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{ar ? "Staff" : "Staff"}</th>
                <th scope="col">{ar ? "Issue" : "Issue"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Impact" : "Impact"}</th>
                <th scope="col" style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((row) => (
                <tr key={`${row.staff}-${row.issue}`}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.staff}</div>
                    <div className="t-small muted">{row.kiosk} - {row.hours}h</div>
                  </td>
                  <td className="muted">{row.issue}</td>
                  <td className="t-num" style={{ textAlign: "end", color: row.impact < 0 ? "var(--crit)" : row.impact > 0 ? "var(--pos)" : "var(--ink-3)" }}>
                    {row.impact === 0 ? "-" : fmtMoney(row.impact)}
                  </td>
                  <td style={{ textAlign: "end" }}>
                    <span className={`badge ${row.status === "hold" ? "badge-warn" : row.status === "approved" ? "badge-pos" : ""}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "Roster" : "Roster"}</div>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 126 }}>
              {roles.map((role) => <option key={role} value={role}>{role === "all" ? "All roles" : role}</option>)}
            </select>
            <select className="input" value={kioskFilter} onChange={(event) => setKioskFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 132 }}>
              {kiosks.map((kiosk) => <option key={kiosk} value={kiosk}>{kiosk === "all" ? "All kiosks" : kiosk}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setStaffModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/> {ar ? "موظف جديد" : "Add staff"}
            </button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "Staff member" : "Staff member"}</th>
              <th scope="col">{ar ? "Role" : "Role"}</th>
              <th scope="col">{ar ? "Kiosk" : "Kiosk"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "Hours (mo)" : "Hours (mo)"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "Net payroll" : "Net payroll"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoster.map((person) => (
              <tr key={person.name} className="row-click">
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={person.name} size={28}/>
                    <span style={{ fontWeight: 500 }}>{person.name}</span>
                  </div>
                </td>
                <td className="muted">{person.role}</td>
                <td className="t-num muted">{person.kiosk}</td>
                <td style={{ textAlign: "end" }} className="t-num">{person.hours}h</td>
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(person.netPay)}</td>
                <td style={{ textAlign: "end" }}>
                  {person.payrollStatus === "ready" && <span className="badge badge-pos">{ar ? "Active" : "Active"}</span>}
                  {person.payrollStatus === "leave-adjusted" && <span className="badge">{ar ? "On leave" : "On leave"}</span>}
                  {person.payrollStatus === "review" && <span className="badge badge-warn">{ar ? "Review" : "Review"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)}
        title={ar ? "Add expense" : "Add expense"}
        sub={ar ? "Recorded against operating expenses" : "Recorded against operating expenses"}>
        <form onSubmit={submitExpense} className="col" style={{ gap: 10 }}>
          <input className="input" value={expenseDraft.name} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Expense name"/>
          <select className="input" value={expenseDraft.category} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, category: event.target.value }))}>
            {["Operations", "Utilities", "Staff", "Maintenance", "Transport"].map((category) => <option key={category}>{category}</option>)}
          </select>
          <input className="input" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="Amount IQD" inputMode="numeric"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save expense</button>
          </div>
        </form>
      </Modal>

      <Modal open={adjustmentModalOpen} onClose={() => setAdjustmentModalOpen(false)}
        title={ar ? "Payroll adjustment" : "Payroll adjustment"}
        sub={ar ? "Advances, deductions, and bonuses before approval" : "Advances, deductions, and bonuses before approval"}>
        <form onSubmit={submitAdjustment} className="col" style={{ gap: 10 }}>
          <select className="input" value={adjustmentDraft.staff} onChange={(event) => setAdjustmentDraft((draft) => ({ ...draft, staff: event.target.value }))}>
            {allStaff.length ? allStaff.map((person) => <option key={person.name} value={person.name}>{person.name}</option>) : <option value="">No live staff loaded</option>}
          </select>
          <select className="input" value={adjustmentDraft.type} onChange={(event) => setAdjustmentDraft((draft) => ({ ...draft, type: event.target.value }))}>
            <option value="deduction">Deduction</option>
            <option value="advance">Advance</option>
            <option value="bonus">Bonus</option>
          </select>
          <input className="input" value={adjustmentDraft.amount} onChange={(event) => setAdjustmentDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="Amount IQD" inputMode="numeric"/>
          <input className="input" value={adjustmentDraft.reason} onChange={(event) => setAdjustmentDraft((draft) => ({ ...draft, reason: event.target.value }))} placeholder="Reason"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAdjustmentModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save adjustment</button>
          </div>
        </form>
      </Modal>

      <Modal open={coverageModalOpen} onClose={() => setCoverageModalOpen(false)}
        width={520}
        title={ar ? "Coverage slot" : "Coverage slot"}
        sub={ar ? "Required kiosk headcount by weekday and time" : "Required kiosk headcount by weekday and time"}>
        <form onSubmit={submitCoverageRule} className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Kiosk" : "Kiosk"}</label>
              <select className="input" value={coverageDraft.kiosk}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, kiosk: event.target.value }))}>
                {kioskOptions.length
                  ? kioskOptions.map((kiosk) => <option key={kiosk.id} value={kiosk.id}>{kiosk.label}</option>)
                  : <option value="">No live kiosks loaded</option>}
              </select>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Day" : "Day"}</label>
              <select className="input" value={coverageDraft.dayOfWeek}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, dayOfWeek: event.target.value }))}>
                {WEEKDAY_LABELS.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Role" : "Role"}</label>
              <select className="input" value={coverageDraft.role}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, role: event.target.value }))}>
                <option value="any">{HR_ROLE_LABELS.any}</option>
                {HR_ROLE_OPTIONS.map((role) => {
                  const value = normalizeHrRole(role);
                  return <option key={value} value={value}>{role}</option>;
                })}
              </select>
            </div>
            <div className="col" style={{ width: 124, gap: 4 }}>
              <label className="t-micro">{ar ? "Headcount" : "Headcount"}</label>
              <input className="input" type="number" min={1} step={1} value={coverageDraft.requiredCount}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, requiredCount: event.target.value }))}/>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Start" : "Start"}</label>
              <input className="input" type="time" value={coverageDraft.start}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, start: event.target.value }))}/>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "End" : "End"}</label>
              <input className="input" type="time" value={coverageDraft.end}
                onChange={(event) => setCoverageDraft((draft) => ({ ...draft, end: event.target.value }))}/>
            </div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCoverageModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save slot</button>
          </div>
        </form>
      </Modal>

      <Modal open={shiftModalOpen} onClose={() => setShiftModalOpen(false)}
        width={560}
        title={ar ? "Assign shift" : "Assign shift"}
        sub={ar ? "Plan who works each kiosk slot" : "Plan who works each kiosk slot"}>
        <form onSubmit={submitShift} className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Staff" : "Staff"}</label>
              <select className="input" value={shiftDraft.employee}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, employee: event.target.value }))}>
                {allStaff.length
                  ? allStaff.map((person) => <option key={person.id || person.name} value={person.id || person.name}>{person.name}</option>)
                  : <option value="">No live staff loaded</option>}
              </select>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Kiosk" : "Kiosk"}</label>
              <select className="input" value={shiftDraft.kiosk}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, kiosk: event.target.value }))}>
                {kioskOptions.length
                  ? kioskOptions.map((kiosk) => <option key={kiosk.id} value={kiosk.id}>{kiosk.label}</option>)
                  : <option value="">No live kiosks loaded</option>}
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Date" : "Date"}</label>
              <input className="input" type="date" value={shiftDraft.date}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, date: event.target.value }))}/>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Role" : "Role"}</label>
              <select className="input" value={shiftDraft.role}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, role: event.target.value }))}>
                {HR_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "Start" : "Start"}</label>
              <input className="input" type="time" value={shiftDraft.start}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, start: event.target.value }))}/>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "End" : "End"}</label>
              <input className="input" type="time" value={shiftDraft.end}
                onChange={(event) => setShiftDraft((draft) => ({ ...draft, end: event.target.value }))}/>
            </div>
          </div>
          <input className="input" value={shiftDraft.note}
            onChange={(event) => setShiftDraft((draft) => ({ ...draft, note: event.target.value }))}
            placeholder="Note"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShiftModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Assign shift</button>
          </div>
        </form>
      </Modal>

      <Modal open={staffModalOpen} onClose={() => setStaffModalOpen(false)}
        width={520}
        title={ar ? "إضافة موظف" : "Add staff"}
        sub={ar
          ? "املأ التفاصيل لإضافة موظف إلى الجدول."
          : liveOnly ? "Creates a Bayaan staff record linked to Odoo HR and the selected kiosk." : "Adds a new staff member to the roster (demo: stays in this browser)."}>
        <form onSubmit={submitStaff} className="col" style={{ gap: 10 }}>
          <div className="col" style={{ gap: 4 }}>
            <label className="t-micro">{ar ? "الاسم" : "Full name"}</label>
            <input
              autoFocus
              className="input"
              value={staffDraft.name}
              onChange={(event) => setStaffDraft((d) => ({ ...d, name: event.target.value }))}
              placeholder={ar ? "مثال: حسن علي" : "e.g. Hassan Ali"}
            />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "الدور" : "Role"}</label>
              <select className="input" value={staffDraft.role}
                onChange={(event) => setStaffDraft((d) => ({ ...d, role: event.target.value }))}>
                {HR_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "الكشك" : "Kiosk"}</label>
              <select className="input" value={staffDraft.kiosk}
                onChange={(event) => setStaffDraft((d) => ({ ...d, kiosk: event.target.value }))}>
                {kioskOptions.length
                  ? kioskOptions.map((kiosk) => (
                    <option key={kiosk.id} value={kiosk.id}>{kiosk.label}</option>
                  ))
                  : <option value="">No live kiosks loaded</option>}
                {!liveOnly && <option value="Central">Central</option>}
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "الراتب الشهري (د.ع)" : "Monthly salary (IQD)"}</label>
              <input
                className="input"
                type="number"
                min={0}
                step={50000}
                value={staffDraft.salary}
                onChange={(event) => setStaffDraft((d) => ({ ...d, salary: event.target.value }))}
              />
            </div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <label className="t-micro">{ar ? "الساعات شهرياً" : "Monthly hours"}</label>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={staffDraft.hours}
                onChange={(event) => setStaffDraft((d) => ({ ...d, hours: event.target.value }))}
              />
            </div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStaffModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <Icon name="check" size={12}/> {ar ? "إضافة الموظف" : "Add staff"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =============== REPORTS ===============
function ReportsScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const [period, setPeriod] = useState("Daily");
  const metrics = odooReportMetrics(bootstrap, period);
  const sourceMeta = insightSourceMeta(bootstrap);
  const periods = ["Daily", "Weekly", "Monthly", "Yearly"];
  const reportAction = (action) => showToast(
    ar ? `${action} - ${period}` : `${period} report ${action} (demo)`,
    "success",
  );
  const exportReport = () => {
    const filename = exportManagementReportPack(period, metrics, sourceMeta);
    showToast(
      ar ? `تم تصدير ${period}` : `${period} report exported as ${filename}`,
      "success",
    );
  };
  const grossProfit = metrics.revenue - metrics.cogs;
  const payrollExpense = Number(metrics.payroll || 0);
  const netAfterPayroll = Math.max(0, Number(metrics.netProfit || 0) - payrollExpense);
  const margin = metrics.revenue ? ((netAfterPayroll / metrics.revenue) * 100).toFixed(1) : "0.0";
  const pnlRows = [
    ["Revenue", metrics.revenue, null, "up"],
    ["COGS", -metrics.cogs, metrics.revenue ? `${((metrics.cogs / metrics.revenue) * 100).toFixed(1)}%` : null, "flat"],
    ["Gross profit", grossProfit, metrics.revenue ? `${((grossProfit / metrics.revenue) * 100).toFixed(1)}%` : null, "up"],
    ["Waste & loss", -metrics.waste, metrics.revenue ? `${((metrics.waste / metrics.revenue) * 100).toFixed(2)}%` : null, "down"],
    ["Payroll", -payrollExpense, metrics.revenue ? `${((payrollExpense / metrics.revenue) * 100).toFixed(1)}%` : null, "flat"],
    ["Net profit", netAfterPayroll, `${margin}%`, "up"],
  ];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 6 }}>
          <AITag>{ar ? "ملخص التقرير" : "Report summary"}</AITag>
          <span className="t-small subtle" style={{ marginInlineStart: 8 }}>{period}</span>
          {metrics.sourceCounts && (
            <span className="badge" style={{ marginInlineStart: 8 }}>
              {metrics.sourceCounts.orders || 0} orders / {metrics.sourceCounts.closingRows || 0} closes
            </span>
          )}
        </div>
        <div className="ai-block" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 820 }}>
          {ar
            ? <>أبريل أنهى بإيرادات <strong>د.ع ١٫٣٤ مليار</strong> (+١٢٪ شهر/شهر) وصافي ربح <strong>د.ع ٣٤٣ مليون</strong> (٢٥.٦٪ هامش). أكبر تحرك: تكاليف المورد ارتفعت ١.٤ نقطة. أكبر فرصة: ٤ كشاك تحت المتوسط في عصائر العصر.</>
            : <>{period} report shows <strong>{fmtMoney(metrics.revenue)}</strong> revenue and <strong>{fmtMoney(netAfterPayroll)}</strong> net profit after payroll ({margin}% margin). Payment split: {metrics.paymentSignal}. Waste, loss, and payroll remain separated for management review.</>
          }
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KPI label={ar ? "الإيرادات MTD" : `Revenue ${period}`} value={fmtMoney(metrics.revenue)} delta="10.4%" deltaDir="up" sparkData={[42,46,52,58,62,68,72,78,84,90,98,104,110]} size="lg"/>
        <KPI label={ar ? "تكلفة البضاعة" : `COGS ${period}`} value={fmtMoney(metrics.cogs)} delta="38.1%" deltaDir="flat" footer={ar ? "هدف ٣٧٪" : "target 37%"} size="lg"/>
        <KPI label={ar ? "صافي الربح" : `Net profit ${period}`} value={fmtMoney(netAfterPayroll)} delta={`${margin}%`} deltaDir="up" footer={ar ? "هامش ٢٥.٤٪" : `${margin}% margin`} size="lg"/>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "طرق الدفع" : "Payment methods"}</div>
            <div className="t-small subtle">{ar ? "فصل النقد عن المدفوعات الرقمية" : "Cash stays separate from terminal, QR, wallet, and manual digital collections"}</div>
          </div>
          <span className="badge">{metrics.paymentSignal}</span>
        </div>
        <table className="tbl">
          <tbody>
            {metrics.paymentRows.map(([label, amount]) => (
              <tr key={label}>
                <td style={{ fontWeight: 500 }}>{label}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "تسوية بوابات العراق" : "Iraqi gateway settlement"}</div>
            <div className="t-small subtle">{ar ? "إجماليات المزودين من طرق دفع نقطة البيع" : "Provider totals from configured POS payment methods"}</div>
          </div>
          <span className="badge">Zain Cash / FIB / Qi</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "المزود" : "Provider"}</th>
              <th scope="col">{ar ? "الفئة" : "Category"}</th>
              <th scope="col">{ar ? "التسوية" : "Settlement"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "الإجمالي" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {(metrics.gatewayRows || []).map((row) => (
              <tr key={row.provider || row.id}>
                <td style={{ fontWeight: 500 }}>{row.label}</td>
                <td><span className="badge">{paymentCategoryLabel(row.category)}</span></td>
                <td className="muted">{String(row.settlement || "").replace(/_/g, " ")}</td>
                <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(row.amount || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div>
            <div className="t-h2">{ar ? "حزمة التقارير الإدارية" : "Management report pack"}</div>
            <div className="t-small subtle">{ar ? "كل رقم مرتبط بسجل نظامي" : "Every number is tied back to deterministic system records"}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {periods.map((periodName) => (
              <button key={periodName} onClick={() => setPeriod(periodName)} className={"btn " + (periodName === period ? "btn-primary" : "btn-ghost")} style={{ height: 28, fontSize: 12 }}>
                {periodName}
              </button>
            ))}
            <button className="btn btn-ghost" onClick={exportReport} style={{ height: 28, fontSize: 12 }}>
              <Icon name="download" size={12}/>{ar ? "تصدير" : "Export pack"}
            </button>
            <button className="btn btn-ghost" onClick={() => reportAction("scheduled")} style={{ height: 28, fontSize: 12 }}>
              <Icon name="clock" size={12}/>{ar ? "جدولة" : "Schedule"}
            </button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{ar ? "التقرير" : "Report"}</th>
              <th scope="col">{ar ? "ماذا يقرر المالك؟" : "Owner decision"}</th>
              <th scope="col">{ar ? "المصادر" : "Traceable sources"}</th>
              <th scope="col" style={{ textAlign: "end" }}>{ar ? "إشارة اليوم" : "Today signal"}</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Kiosk performance", "Which stalls need action or coaching", "pos.order, bayaan.shift.close", "K-07 review"],
              ["Product profitability", "Which prices or recipes should change", "product.template, bayaan.recipe, purchase.order", "Pistachio -6 pts"],
              ["Ingredient consumption", "What to transfer or buy tomorrow", "bayaan.consumption.ledger, stock.quant", "Oranges -1.4 kg"],
              ["Waste/loss", "What waste reason is driving margin loss", "bayaan.waste.entry, shift close lines", "Croissants 42%"],
              ["Payment methods", "How much was cash, card, QR, wallet, FIB, or manual digital", "pos.payment, bayaan.shift.close", metrics.paymentSignal],
              ["Cash flow", "How much cash should be counted and deposited", "pos.payment, account.move, shift cash count", "3 variances"],
            ].map(([report, decision, sources, signal]) => (
              <tr key={report}>
                <td style={{ fontWeight: 500 }}>{report}</td>
                <td className="muted">{decision}</td>
                <td><span className="badge">{sources}</span></td>
                <td className="t-num" style={{ textAlign: "end" }}>{signal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "بيان الأرباح والخسائر" : "Profit & loss"}</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "هذا الشهر" : "This month"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="download" size={12}/>{ar ? "PDF" : "PDF"}</button>
          </div>
        </div>
        <table className="tbl">
          <tbody>
            {pnlRows.map(([label, val, sub, dir], i) => {
              const isTotal = ["Revenue", "Gross profit", "Net profit"].includes(label);
              const isSub = label.startsWith("  ");
              return (
                <tr key={i} style={{ background: isTotal ? "var(--surface-2)" : undefined }}>
                  <td style={{ paddingInlineStart: isSub ? 28 : 14, fontWeight: isTotal ? 600 : 400, color: isSub ? "var(--ink-2)" : undefined, fontSize: isSub ? 12.5 : undefined }}>
                    {isSub ? label.trim() : label}
                  </td>
                  <td className="t-num" style={{ textAlign: "end", fontWeight: isTotal ? 600 : 400, color: val < 0 ? "var(--ink-2)" : undefined }}>
                    {val < 0 ? `(${fmtMoney(-val)})` : fmtMoney(val)}
                  </td>
                  <td style={{ textAlign: "end", width: 110 }} className="t-small">
                    {sub && <span className={dir === "up" ? "delta-pos" : dir === "down" ? "delta-neg" : "muted"}>{sub}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}



/* ===== admin-shell.jsx ===== */

/* ============================================================
   Admin shell — sidebar + content frame
   ============================================================ */

const ADMIN_NAV = [
  { section: "TODAY" },
  { id: "overview", label: "Today Command", icon: "grid" },
  { id: "insights", label: "AI Insights", icon: "sparkles", badge: 4 },
  { section: "OPERATIONS" },
  { id: "kiosks", label: "Kiosks", icon: "store" },
  { id: "warehouses", label: "Warehouses", icon: "box" },
  { id: "items", label: "Items Catalog", icon: "box" },
  { id: "sales", label: "Sales & POS", icon: "receipt" },
  { id: "closing", label: "Daily Close", icon: "receipt", badge: 3 },
  { id: "waste", label: "Waste & Loss", icon: "trash", badge: 3 },
  { section: "STOCK" },
  { id: "products", label: "Products & Recipes", icon: "coffee" },
  { id: "suppliers", label: "Purchases & Suppliers", icon: "truck" },
  { id: "inventory", label: "Stock & Allocation", icon: "box" },
  { section: "PEOPLE & MONEY" },
  { id: "staff", label: "Staff", icon: "users" },
  { id: "finance", label: "Finance", icon: "cash" },
  { section: "ANALYTICS" },
  { id: "reports", label: "Reports", icon: "chart" },
];

const ROLE_LABELS = {
  superadmin: "Superadmin",
  manager: "Manager",
  logistics: "Logistics",
  accountant: "Accountant",
  supervisor: "Supervisor",
  cashier: "Cashier",
};

const TEST_ACCOUNTS = [
  { role: "Superadmin", login: "superadmin@bayaan.test" },
  { role: "Manager", login: "manager@bayaan.test" },
  { role: "Logistics", login: "logistics@bayaan.test" },
  { role: "Accountant", login: "accountant@bayaan.test" },
  { role: "Cashier", login: "cashier@bayaan.test" },
];

function authAllowsPanel(auth, hasBackend, panel, mode = "live") {
  if (!hasBackend || mode === "demo") return true;
  if (!auth?.checked || !auth.authenticated) return panel === "admin";
  return Boolean(auth.user?.allowedPanels?.[panel]);
}

function allowedAdminIds(auth, hasBackend) {
  if (!hasBackend || !auth?.checked || !auth.authenticated) {
    return ADMIN_NAV.filter((item) => item.id).map((item) => item.id);
  }
  return auth.user?.allowedNav?.length ? auth.user.allowedNav : [];
}

function filteredAdminNav(auth, hasBackend) {
  const allowed = new Set(allowedAdminIds(auth, hasBackend));
  if (!hasBackend || !auth?.checked || !auth.authenticated) return ADMIN_NAV;
  const rows = [];
  for (let i = 0; i < ADMIN_NAV.length; i += 1) {
    const item = ADMIN_NAV[i];
    if (item.section) {
      let hasVisibleItem = false;
      for (let j = i + 1; j < ADMIN_NAV.length && !ADMIN_NAV[j].section; j += 1) {
        if (allowed.has(ADMIN_NAV[j].id)) {
          hasVisibleItem = true;
          break;
        }
      }
      if (hasVisibleItem) rows.push(item);
    } else if (allowed.has(item.id)) {
      rows.push(item);
    }
  }
  return rows;
}

const ADMIN_NAV_AR = {
  overview: "مركز اليوم",
  insights: "تحليلات الذكاء",
  kiosks: "الأكشاك",
  sales: "المبيعات ونقاط البيع",
  warehouses: "المستودعات",
  items: "كتالوج البنود",
  inventory: "المخزون والتوزيع",
  products: "المنتجات والوصفات",
  closing: "الإغلاق اليومي",
  waste: "الهدر والخسارة",
  suppliers: "المشتريات والموردون",
  staff: "الموظفون",
  finance: "المالية",
  reports: "التقارير",
  TODAY: "اليوم",
  OPERATIONS: "العمليات",
  STOCK: "المخزون",
  "PEOPLE & MONEY": "الأفراد والمال",
  ANALYTICS: "التحليلات",
};

function AdminSidebar({ active, setActive, lang }) {
  const bayaan = useBayaan();
  const isAr = lang === "ar";
  const navRows = filteredAdminNav(bayaan.auth, bayaan.hasBackend);
  const user = bayaan.auth.user || {};
  const roleLabel = ROLE_LABELS[user.primaryRole] || "Owner";
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: "var(--surface-2)",
      borderInlineEnd: "1px solid var(--line)",
      padding: "12px 10px",
      display: "flex", flexDirection: "column", gap: 2,
      overflowY: "auto"
    }}>
      <div style={{ padding: "6px 10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--brand-mark-bg)", color: "var(--brand-mark-fg)",
          display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12, letterSpacing: "-0.02em" }}>M</div>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{isAr ? "مقهى" : "Maqha"}</div>
        <Icon name="chevDown" size={12} style={{ color: "var(--ink-3)", marginInlineStart: "auto" }}/>
      </div>

      {navRows.map((it, i) => {
        if (it.section) {
          return <div key={i} className="nav-section">{isAr ? ADMIN_NAV_AR[it.section] : it.section}</div>;
        }
        const on = active === it.id;
        return (
          <div key={it.id} className={"nav-item" + (on ? " active" : "")} onClick={() => setActive(it.id)}>
            <Icon name={it.icon} size={14} className="nav-icon"/>
            <span style={{ flex: 1 }}>{isAr ? ADMIN_NAV_AR[it.id] : it.label}</span>
            {it.badge && <span className="badge" style={{ height: 16, fontSize: 10, padding: "0 5px" }}>{it.badge}</span>}
          </div>
        );
      })}

      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <div className="nav-item" style={{ height: 36 }}>
          <Avatar name={user.name || "Bayaan"} size={20}/>
          <div style={{ flex: 1, lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name || (isAr ? "بيان" : "Bayaan")}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{roleLabel}</div>
          </div>
          <Icon name="settings" size={13} style={{ color: "var(--ink-3)" }}/>
        </div>
      </div>
    </aside>
  );
}

function AdminTopBar({ title, sub, right, lang }) {
  return (
    <div style={{
      height: 56, padding: "0 24px",
      borderBottom: "1px solid var(--line)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "var(--paper)",
      flexShrink: 0
    }}>
      <div>
        <div className="t-h2" style={{ letterSpacing: "-0.01em" }}>{title}</div>
        {sub && <div className="t-small subtle">{sub}</div>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {right}
        <div className="row" style={{
          gap: 6, padding: "0 10px", height: 30,
          background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6,
          color: "var(--ink-3)"
        }}>
          <Icon name="search" size={13}/>
          <span style={{ fontSize: 12.5 }}>{lang === "ar" ? "بحث" : "Search"}</span>
          <span style={{ fontSize: 10.5, padding: "1px 5px", background: "var(--surface-sunk)", borderRadius: 3, marginInlineStart: 12 }}>Ctrl K</span>
        </div>
        <button className="btn btn-ghost"><Icon name="bell" size={13}/></button>
      </div>
    </div>
  );
}

function DataModeToggle({ bayaan, lang }) {
  const ar = lang === "ar";
  const liveOnly = bayaan.mode === "live";
  return (
    <div className="segmented" aria-label={ar ? "Ù…ØµØ¯Ø± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª" : "Data source"} style={{ height: 30 }}>
      <button
        type="button"
        className={`seg-btn ${liveOnly ? "active" : ""}`}
        onClick={() => bayaan.setMode("live")}
        title={bayaan.hasBackend ? "Use only verified engine data" : "Live-only mode; backend URL is not configured"}
      >
        <Icon name="zap" size={12}/>
        {ar ? "ØªØ´ØºÙŠÙ„ ÙÙ‚Ø·" : "Live only"}
      </button>
      <button
        type="button"
        className={`seg-btn ${!liveOnly ? "active" : ""}`}
        onClick={() => bayaan.setMode("demo")}
        title="Allow demo fallback data"
      >
        <Icon name="grid" size={12}/>
        {ar ? "ØªØ¬Ø±ÙŠØ¨ÙŠ" : "Demo data"}
      </button>
    </div>
  );
}

function AuditLogRail({ lang, sourceOfTruth }) {
  const ar = lang === "ar";
  const [events, setEvents] = React.useState(() => demoAuditEvents());
  const [status, setStatus] = React.useState("idle");
  const [error, setError] = React.useState("");
  const loadEvents = React.useCallback(async () => {
    if (!sourceOfTruth?.enabled) {
      setEvents(demoAuditEvents());
      setStatus("demo");
      setError("");
      return;
    }
    setStatus("loading");
    try {
      const payload = await sourceOfTruth.getAuditLog({ limit: 80 });
      const rows = normalizeAuditEvents(payload);
      setEvents(rows);
      setStatus("live");
      setError("");
    } catch (err) {
      setStatus("error");
      setError(compactError(err));
    }
  }, [sourceOfTruth]);

  React.useEffect(() => {
    void loadEvents();
    if (!sourceOfTruth?.enabled) return undefined;
    const subscription = sourceOfTruth.subscribeRealtime?.({
      onStatus: (next) => {
        if (next === "live" || next === "polling") setStatus("live");
      },
      onEvent: (event) => {
        setStatus("live");
        setEvents((rows) => {
          const next = normalizeRealtimeAuditEvent(event);
          return [next, ...rows.filter((row) => row.id !== next.id)].slice(0, 80);
        });
      },
      onError: (err) => {
        setStatus("error");
        setError(compactError(err));
      },
    });
    if (subscription) return () => subscription.close();
    const timer = window.setInterval(() => void loadEvents(), 8000);
    return () => window.clearInterval(timer);
  }, [loadEvents, sourceOfTruth?.enabled]);

  return (
    <aside style={{
      width: 340,
      flexShrink: 0,
      background: "var(--surface)",
      borderInlineEnd: "1px solid var(--line)",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    }}>
      <div className="between" style={{ height: 56, padding: "0 16px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="t-h2">{ar ? "سجل النظام" : "Live action log"}</div>
          <div className="t-small subtle">
            {status === "live" ? (ar ? "متصل" : "Realtime stream") : status === "demo" ? "Demo events" : status === "error" ? "Log unavailable" : "Loading"}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={loadEvents} style={{ height: 28, fontSize: 12 }}>
          <Icon name="refresh" size={12}/>{ar ? "تحديث" : "Refresh"}
        </button>
      </div>
      {error && (
        <div className="t-small" style={{ margin: 12, padding: 10, border: "1px solid var(--crit)", borderRadius: 6, color: "var(--crit)", background: "var(--crit-soft)" }}>
          {error}
        </div>
      )}
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
        <div className="col" style={{ gap: 10 }}>
          {events.map((event) => (
            <div key={event.id} className="card" style={{ padding: 12 }}>
              <div className="between" style={{ alignItems: "flex-start", gap: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: "flex-start", minWidth: 0 }}>
                  <span className={`dot ${auditDotClass(event.severity)}`} style={{ marginTop: 7, flexShrink: 0 }}></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{event.title}</div>
                    <div className="t-small subtle" style={{ marginTop: 3, lineHeight: 1.45 }}>{event.detail}</div>
                  </div>
                </div>
                <span className="t-num faint" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{auditTimeLabel(event.occurredAt)}</span>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span className={`badge ${auditSeverityClass(event.severity)}`}>{event.eventType || "system"}</span>
                {event.kiosk && <span className="badge">{event.kiosk}</span>}
                {event.reference && <span className="badge">{event.reference}</span>}
              </div>
              <div className="t-small faint" style={{ marginTop: 8 }}>{event.actor}</div>
            </div>
          ))}
          {!events.length && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{ar ? "لا توجد أحداث" : "No events yet"}</div>
              <div className="t-small subtle" style={{ marginTop: 4 }}>System changes will appear here after they are committed.</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function AdminPanel({ lang }) {
  const bayaan = useBayaan();
  const [active, setActive] = useState("overview");
  const [selectedKiosk, setSelectedKiosk] = useState(MOCK.kiosks[0]);
  const allowedIds = useMemo(() => allowedAdminIds(bayaan.auth, bayaan.hasBackend), [bayaan.auth, bayaan.hasBackend]);
  const canViewAuditLog = isSuperadminAuth(bayaan.auth);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  // The AdminPanel uses the SAME gateway as the BayaanProvider. When the
  // user toggles to Demo mode, we present a transparent noop wrapper so
  // every screen's `sourceOfTruth?.enabled` check falls through to the
  // existing MOCK fallback paths without any per-screen plumbing.
  const baseGateway = bayaan.gateway;
  const liveOnlySelected = bayaan.mode === "live";
  const liveBackendActive = liveOnlySelected && baseGateway.enabled;
  const sourceOfTruth = useMemo(() => {
    if (liveBackendActive) return baseGateway;
    return new Proxy(baseGateway, {
      get(target, prop) {
        if (prop === "enabled") return false;
        const value = target[prop];
        if (typeof value !== "function") return value;
        return async () => ({ skipped: true, demo: true });
      },
    });
  }, [baseGateway, liveBackendActive]);
  const [sync, setSync] = useState({
    status: liveBackendActive ? "syncing" : "demo",
    bootstrap: null,
    warehouseSetup: liveOnlySelected ? EMPTY_WAREHOUSE_SETUP : DEMO_WAREHOUSE_SETUP,
    error: "",
  });
  const [realtime, setRealtime] = useState({
    status: liveBackendActive ? "connecting" : "demo",
    lastEvent: null,
    eventCount: 0,
    error: "",
  });
  const realtimeRefreshRef = React.useRef(false);

  const refreshOdoo = React.useCallback(async () => {
    if (!liveOnlySelected) {
      setSync({ status: "demo", bootstrap: null, warehouseSetup: DEMO_WAREHOUSE_SETUP, error: "" });
      return;
    }
    if (!baseGateway.enabled) {
      setSync({
        status: "missing",
        bootstrap: EMPTY_ENGINE_SNAPSHOT,
        warehouseSetup: EMPTY_WAREHOUSE_SETUP,
        error: "Live-only mode is on, but no backend URL is configured.",
      });
      return;
    }
    setSync((current) => ({ ...current, status: "syncing", error: "" }));
    try {
      const [bootstrap, warehouseSetup] = await Promise.all([
        sourceOfTruth.getChainBootstrap(),
        sourceOfTruth.getWarehouseSetup(),
      ]);
      setSync({
        status: "synced",
        bootstrap: markLiveOnlySnapshot(bootstrap),
        warehouseSetup: markLiveOnlyWarehouseSetup(warehouseSetup),
        error: "",
      });
    } catch (error) {
      setSync((current) => ({
        ...current,
        status: "error",
        bootstrap: current.bootstrap || EMPTY_ENGINE_SNAPSHOT,
        warehouseSetup: current.warehouseSetup || EMPTY_WAREHOUSE_SETUP,
        error: compactError(error),
      }));
    }
  }, [baseGateway.enabled, liveOnlySelected, sourceOfTruth]);

  useEffect(() => {
    void refreshOdoo();
    // Re-run whenever mode flips so the dashboard immediately respects Demo/Live.
  }, [refreshOdoo, bayaan.mode, baseGateway.enabled]);

  useEffect(() => {
    if (!liveBackendActive) {
      setRealtime({
        status: liveOnlySelected ? "missing" : "demo",
        lastEvent: null,
        eventCount: 0,
        error: "",
      });
      return undefined;
    }
    if (!bayaan.auth.authenticated) {
      setRealtime({
        status: "missing",
        lastEvent: null,
        eventCount: 0,
        error: "Sign in to start the realtime stream.",
      });
      return undefined;
    }
    const subscription = sourceOfTruth.subscribeRealtime({
      onStatus: (status) => {
        setRealtime((current) => ({ ...current, status, error: "" }));
      },
      onEvent: (event) => {
        setRealtime((current) => ({
          status: current.status === "polling" ? "polling" : "live",
          lastEvent: event,
          eventCount: current.eventCount + 1,
          error: "",
        }));
        if (!realtimeRefreshRef.current) {
          realtimeRefreshRef.current = true;
          window.setTimeout(() => {
            realtimeRefreshRef.current = false;
            void refreshOdoo();
          }, 250);
        }
      },
      onError: (error) => {
        setRealtime((current) => ({ ...current, status: "error", error: compactError(error) }));
      },
    });
    return () => subscription.close();
  }, [liveBackendActive, liveOnlySelected, bayaan.auth.authenticated, refreshOdoo, sourceOfTruth]);

  useEffect(() => {
    if (!allowedIds.length || active === "kioskDetail") return;
    if (!allowedIds.includes(active)) setActive(allowedIds[0]);
  }, [active, allowedIds]);

  useEffect(() => {
    if (!canViewAuditLog && auditLogOpen) setAuditLogOpen(false);
  }, [auditLogOpen, canViewAuditLog]);

  const openKiosk = (kiosk) => {
    setSelectedKiosk(kiosk || MOCK.kiosks[0]);
    setActive("kioskDetail");
  };

  const screens = {
    overview: <OverviewScreen lang={lang} bootstrap={sync.bootstrap}/>,
    insights: <InsightsScreen lang={lang} bootstrap={sync.bootstrap} navigate={setActive}/>,
    sales: <SalesMonitorScreen lang={lang} bootstrap={sync.bootstrap}/>,
    kiosks: <KiosksScreen lang={lang} bootstrap={sync.bootstrap} sync={sync} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo} onPick={openKiosk}/>,
    kioskDetail: <KioskDetailScreen lang={lang} kiosk={selectedKiosk} bootstrap={sync.bootstrap} onBack={() => setActive("kiosks")}/>,
    warehouses: <WarehousesScreen lang={lang} sync={sync} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    items: <ItemsCatalogScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    inventory: <InventoryScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    products: <ProductsScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    closing: <ClosingScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth}/>,
    waste: <WasteScreen lang={lang} bootstrap={sync.bootstrap}/>,
    suppliers: <SuppliersScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    staff: <HRPayrollScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>,
    finance: <ReportsScreen lang={lang} bootstrap={sync.bootstrap}/>,
    reports: <ReportsScreen lang={lang} bootstrap={sync.bootstrap}/>,
  };
  const titles = {
    overview: { en: "Today Command Center", ar: "مركز قيادة اليوم", sub: { en: "Saturday, May 9 - all kiosks", ar: "السبت، 9 مايو · جميع الأكشاك" } },
    insights: { en: "AI Insights", ar: "تحليلات الذكاء", sub: { en: "What changed and what needs attention", ar: "ما الذي تغير وما يحتاج اهتمامك" } },
    kiosks: { en: "Kiosks", ar: "الأكشاك", sub: { en: "10 active locations - 3 cities", ar: "١٠ مواقع نشطة · ٣ مدن" } },
    kioskDetail: { en: `${selectedKiosk.name} - ${selectedKiosk.id}`, ar: `${selectedKiosk.name} · ${selectedKiosk.id}`, sub: { en: `${selectedKiosk.city} - ${selectedKiosk.staff} staff - stock location scoped`, ar: `${selectedKiosk.city} · ${selectedKiosk.staff} موظفين · مخزون مستقل` } },
    sales: { en: "Sales & POS Monitor", ar: "مراقبة المبيعات ونقاط البيع", sub: { en: "Live POS orders, payment methods, refunds, voids, and recipe posting", ar: "أوامر POS وطرق الدفع والمرتجعات والإلغاءات وترحيل الوصفة" } },
    warehouses: { en: "Warehouses", ar: "المستودعات", sub: { en: "Locations, POS configs, and kiosk stock sources", ar: "المواقع ونقاط البيع ومصادر مخزون الأكشاك" } },
    items: { en: "Items Catalog", ar: "كتالوج البنود", sub: { en: "Global purchasable stock items used by suppliers, purchases, and recipes", ar: "بنود مخزون عالمية للموردين والمشتريات والوصفات" } },
    inventory: { en: "Stock & Allocation", ar: "المخزون والتوزيع", sub: { en: "Warehouse stock, kiosk stock, live needs, and transfer execution", ar: "مخزون المستودع والأكشاك والتحويلات والتنبيهات" } },
    products: { en: "Products & Recipes", ar: "المنتجات والوصفات", sub: { en: "Menu, prices, sizes, images, ingredient recipes", ar: "القائمة والأسعار والأحجام والصور ووصفات المكونات" } },
    closing: { en: "Daily Close & Variance", ar: "الإغلاق اليومي والمطابقة", sub: { en: "Expected vs counted - across kiosks", ar: "متوقع مقابل فعلي — عبر الأكشاك" } },
    waste: { en: "Waste & Loss", ar: "الهدر والخسارة", sub: { en: "Last 7 days - 3 anomalies flagged", ar: "آخر ٧ أيام · ٣ حالات شاذة" } },
    suppliers: { en: "Purchases & Suppliers", ar: "المشتريات والموردون", sub: { en: "Supplier health, purchase orders, ingredient costs, and margin impact", ar: "الموردون وطلبات الشراء وتكاليف المكونات وأثر الهامش" } },
    staff: { en: "HR & Payroll", ar: "HR & Payroll", sub: { en: "Staff, attendance, payroll approval, and expenses", ar: "Staff, attendance, payroll approval, and expenses" } },
    finance: { en: "Finance", ar: "المالية", sub: { en: "Profit, cash flow, payment split, and payroll impact", ar: "الأرباح والتدفق النقدي وطرق الدفع وأثر الرواتب" } },
    reports: { en: "Reports", ar: "التقارير", sub: { en: "Sales, P&L, cash flow", ar: "المبيعات والأرباح والتدفق النقدي" } },
  };
  const t = titles[active];

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--paper)" }}>
      <AdminSidebar active={active === "kioskDetail" ? "kiosks" : active} setActive={setActive} lang={lang}/>
      {canViewAuditLog && auditLogOpen && <AuditLogRail lang={lang} sourceOfTruth={sourceOfTruth}/>}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <AdminTopBar title={lang === "ar" ? t.ar : t.en} sub={lang === "ar" ? t.sub.ar : t.sub.en} lang={lang}
          right={(
            <div className="row" style={{ gap: 6 }}>
              {canViewAuditLog && (
                <button
                  className={`btn ${auditLogOpen ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAuditLogOpen((open) => !open)}
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Icon name="list" size={12}/>{lang === "ar" ? "السجل" : "Log"}
                </button>
              )}
              <DataModeToggle bayaan={bayaan} lang={lang}/>
              <span className={`badge ${sync.status === "synced" ? "badge-pos" : ["error", "missing"].includes(sync.status) ? "badge-crit" : "badge-warn"}`}>
                <span className={`dot ${sync.status === "synced" ? "pos" : ["error", "missing"].includes(sync.status) ? "crit" : "warn"}`}></span>
                {sync.status === "synced"
                  ? "Engine synced"
                  : sync.status === "error"
                    ? "Engine error"
                    : sync.status === "missing"
                      ? "Backend missing"
                      : liveOnlySelected
                        ? "Live only"
                        : sourceOfTruth.enabled
                          ? "Engine syncing"
                          : "Demo mode"}
              </span>
              {liveOnlySelected && (
                <span
                  className={`badge ${["live", "polling"].includes(realtime.status) ? "badge-pos" : realtime.status === "error" ? "badge-crit" : "badge-warn"}`}
                  title={realtime.lastEvent?.title || realtime.error || "Bayaan realtime stream"}
                >
                  <span className={`dot ${["live", "polling"].includes(realtime.status) ? "pos" : realtime.status === "error" ? "crit" : "warn"}`}></span>
                  {realtime.status === "live"
                    ? "Stream live"
                    : realtime.status === "polling"
                      ? "Bus fallback"
                      : realtime.status === "error"
                        ? "Stream error"
                      : realtime.status === "missing"
                          ? bayaan.auth.authenticated ? "Stream missing" : "Stream waiting"
                          : "Stream connecting"}
                </span>
              )}
              {active === "overview" && (
                <>
              <button className="btn btn-ghost"><Icon name="download" size={13}/>{lang === "ar" ? "تصدير" : "Export"}</button>
              <button className="btn btn-ghost">{lang === "ar" ? "اليوم" : "Today"} <Icon name="chevDown" size={11}/></button>
                </>
              )}
            </div>
          )}
        />
        <div className="scroll" style={{
          flex: 1,
          overflow: active === "insights" ? "hidden" : "auto",
          display: "flex", flexDirection: "column", minHeight: 0,
        }}>
          <div className="fade-up" key={active} style={{
            padding: active === "insights" ? 0 : "24px 28px 80px",
            flex: 1, minHeight: 0,
            display: active === "insights" ? "flex" : "block",
            flexDirection: "column",
          }}>
            {screens[active] || screens.overview}
          </div>
        </div>
      </main>
    </div>
  );
}



/* ===== pos.jsx ===== */

/* ============================================================
   POS panel — login, sale, payment, waste entry
   Tablet, landscape, 1180×800
   ============================================================ */

const { useState: useStatePOS } = React;

function POSPanel({ lang }) {
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const [screen, setScreen] = useStatePOS(bayaan.shift ? "sale" : "login");
  const [cart, setCart] = useStatePOS([]);
  const [tender, setTender] = useStatePOS(null);
  const [posTransfers, setPosTransfers] = useStatePOS([]);
  const [transferBusy, setTransferBusy] = useStatePOS("");
  const [posBootstrap, setPosBootstrap] = useStatePOS(null);

  const goSale = () => { setScreen("sale"); setCart([]); };
  const endShiftAndLogout = () => {
    bayaan.endShift();
    setCart([]);
    setTender(null);
    setScreen("login");
  };
  const addItem = (item, size) => {
    setCart(c => {
      const key = item.id + ":" + size;
      const existing = c.find(x => x.key === key);
      if (existing) return c.map(x => x === existing ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { key, id: item.id, name: item.name, image: item.image, size, price: item.price, qty: 1 }];
    });
  };
  const subTotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const vat = Math.round(subTotal * 0.05);
  const total = subTotal + vat;

  // Track last added item for the "just added" flash on customer display
  const [lastAdded, setLastAdded] = useStatePOS(null);
  const wrappedAdd = (item, size) => {
    addItem(item, size);
    setLastAdded({ name: item.name, price: item.price, t: Date.now() });
  };
  const posKioskId = bayaan.shift?.kioskId || bayaan.kioskId;
  const loadPosTransfers = React.useCallback(async () => {
    try {
      const bootstrap = bayaan.mode === "live" && bayaan.hasBackend
        ? await bayaan.gateway.getChainBootstrap()
        : null;
      if (bootstrap) setPosBootstrap(markLiveOnlySnapshot(bootstrap));
      const rows = bootstrap ? odooTransferRows(bootstrap) : MOCK.pendingTransfers;
      setPosTransfers(rows.filter((transfer) => {
        const status = String(transfer.status || "").toLowerCase();
        if (["cancel", "cancelled"].includes(status)) return false;
        return matchesKiosk(transfer.toKioskId || transfer.to, { id: posKioskId, kiosk_code: posKioskId });
      }));
    } catch {
      setPosTransfers([]);
    }
  }, [bayaan.gateway, bayaan.hasBackend, bayaan.mode, posKioskId]);

  React.useEffect(() => {
    void loadPosTransfers();
  }, [loadPosTransfers]);

  React.useEffect(() => {
    if (!(bayaan.mode === "live" && bayaan.hasBackend)) return undefined;
    const subscription = bayaan.gateway.subscribeRealtime?.({
      onEvent: (event) => {
        const action = event.action || event.type || "";
        if (
          action.startsWith("transfer.")
          || action.startsWith("purchase.")
          || matchesKiosk(event.kiosk || event.kioskName, { id: posKioskId, kiosk_code: posKioskId })
        ) {
          void loadPosTransfers();
        }
      },
    });
    return () => subscription?.close();
  }, [bayaan.gateway, bayaan.hasBackend, bayaan.mode, loadPosTransfers, posKioskId]);

  const receivePosTransfer = async (transfer) => {
    setTransferBusy(transfer.id);
    try {
      if (bayaan.mode === "live" && bayaan.hasBackend) {
        const result = unwrapOdoo(await bayaan.gateway.stockTransferAction({ transfer: transfer.id, action: "receive" }));
        const receivedStatus = result?.bayaan_state || "received";
        setPosTransfers((rows) => rows.map((row) => row.id === transfer.id
          ? { ...row, status: receivedStatus, engineState: result?.state || row.engineState || "done", eta: "received" }
          : row));
      } else {
        setPosTransfers((rows) => rows.map((row) => row.id === transfer.id ? { ...row, status: "received" } : row));
      }
      showToast(`Transfer ${transfer.id} received at ${posKioskId}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not receive transfer", "warn");
    } finally {
      setTransferBusy("");
    }
  };

  return (
    <div className="tablet-stage" style={{ gap: 24, padding: 24 }}>
      <div className="tablet">
        <div className="tablet-cam"></div>
        <div className="tablet-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
          {screen === "login" && <POSLogin lang={lang} onIn={goSale}/>}
          {screen === "sale" && <POSSale lang={lang}
            cart={cart} setCart={setCart} addItem={wrappedAdd}
            subTotal={subTotal} vat={vat} total={total}
            bootstrap={posBootstrap}
            onCharge={() => setScreen("payment")}
            onWaste={() => setScreen("waste")}
            onStock={() => setScreen("stock")}
            expectedTransfers={posTransfers}
            onLogout={() => setScreen("close")}
          />}
          {screen === "payment" && <POSPayment lang={lang}
            total={total} cart={cart}
            onTender={(t) => setTender(t)}
            tender={tender}
            onDone={() => { setScreen("sale"); setCart([]); setTender(null); }}
            onBack={() => setScreen("sale")}
          />}
          {screen === "waste" && <POSWaste lang={lang}
            bootstrap={posBootstrap}
            onDone={() => setScreen("sale")} onBack={() => setScreen("sale")}/>}
          {screen === "close" && <POSClose lang={lang}
            bootstrap={posBootstrap}
            onBack={() => setScreen("sale")}
            onClosed={endShiftAndLogout}/>}
          {screen === "stock" && <POSTransfers lang={lang}
            kioskId={posKioskId}
            transfers={posTransfers}
            busy={transferBusy}
            onReceive={receivePosTransfer}
            onRefresh={loadPosTransfers}
            onBack={() => setScreen("sale")}/>}
        </div>
      </div>

      {/* Customer-facing display */}
      <div className="tablet tablet-portrait">
        <div className="tablet-cam tablet-cam-portrait"></div>
        <div className="tablet-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
          <CustomerDisplay lang={lang} screen={screen} cart={cart}
            subTotal={subTotal} vat={vat} total={total} tender={tender} lastAdded={lastAdded}/>
        </div>
        <div style={{ position: "absolute", bottom: -22, insetInlineStart: 0, insetInlineEnd: 0,
          textAlign: "center", fontSize: 10.5, color: "#6E6E68", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {lang === "ar" ? "شاشة العميل" : "Customer-facing display"}
        </div>
      </div>
    </div>
  );
}

// =============== LOGIN ===============
// Demo PINs: matched against picked staff member. In live mode the PIN
// will be validated server-side via /bayaan/api/staff_pin (added later).
const DEMO_STAFF = [
  { name: "Maya Ahmed", arName: "مايا أحمد", role: "Cashier", arRole: "كاشير", pin: "1234", openingCash: 175000 },
  { name: "Yusuf Saleh", arName: "يوسف صالح", role: "Barista", arRole: "باريستا", pin: "2345", openingCash: 175000 },
  { name: "Omar Khaled", arName: "عمر خالد", role: "Supervisor", arRole: "مشرف", pin: "3456", openingCash: 250000 },
  { name: "Sara Younis", arName: "سارة يونس", role: "Barista", arRole: "باريستا", pin: "4567", openingCash: 175000 },
];

function POSLogin({ lang, onIn }) {
  const ar = lang === "ar";
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const staff = DEMO_STAFF;
  const [picked, setPicked] = useStatePOS(null);
  const [pin, setPin] = useStatePOS("");
  const [error, setError] = useStatePOS("");

  const tryStartShift = () => {
    if (!picked) return;
    if (pin.length !== 4) {
      setError(ar ? "أدخل رمز ٤ أرقام" : "Enter your 4-digit PIN");
      return;
    }
    if (pin !== picked.pin) {
      setError(ar ? "رمز غير صحيح" : "Incorrect PIN");
      setPin("");
      showToast(ar ? "رمز الدخول غير صحيح" : "Incorrect PIN", "warn");
      return;
    }
    bayaan.startShift({
      kioskId: bayaan.kioskId,
      cashier: picked.name,
      openingCash: picked.openingCash,
    });
    setError("");
    onIn();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ height: 56, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--brand-mark-bg)", color: "var(--brand-mark-fg)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>M</div>
          <div className="col">
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{ar ? "الكرادة · K-01" : "Karrada Center - K-01"}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{ar ? "السبت ٩ مايو · ٧:٤٢ ص" : "Sat May 9 - 7:42 AM"}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
          <span className="row" style={{ gap: 5 }}><span className="dot pos"></span>{ar ? "متصل" : "Online"}</span>
          <span>·</span>
          <span>{ar ? "آخر مزامنة الآن" : "Last sync just now"}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: picked ? "1fr 380px" : "1fr", overflow: "hidden" }}>
        <div style={{ padding: "40px 56px", overflow: "auto" }}>
          <div className="t-display" style={{ fontWeight: 500, marginBottom: 6 }}>{ar ? "صباح الخير" : "Good morning"}</div>
          <div className="t-h2 muted" style={{ fontWeight: 400, marginBottom: 28 }}>{ar ? "اختر اسمك للبدء" : "Pick your name to start the shift"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 640 }}>
            {staff.map(s => (
              <button key={s.name} onClick={() => { setPicked(s); setPin(""); }}
                className="card"
                style={{
                  padding: "20px 22px", textAlign: "start", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 14,
                  borderColor: picked?.name === s.name ? "var(--ink)" : "var(--line)",
                  background: picked?.name === s.name ? "var(--surface)" : "var(--surface)",
                  transition: "border-color 100ms"
                }}>
                <Avatar name={s.name} size={48}/>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{ar ? s.arName : s.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{ar ? s.arRole : s.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {picked && (
          <div className="fade-up" style={{ borderInlineStart: "1px solid var(--line)", padding: "40px 32px", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ gap: 12, marginBottom: 24 }}>
              <Avatar name={picked.name} size={36}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{ar ? picked.arName : picked.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{ar ? picked.arRole : picked.role}</div>
              </div>
            </div>
            <div className="t-micro" style={{ marginBottom: 12 }}>{ar ? "أدخل رمز الدخول" : "Enter PIN"}</div>
            <div className="row" style={{ gap: 10, marginBottom: 22 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 56, height: 56, borderRadius: 8,
                  border: "1px solid " + (pin.length === i ? "var(--ink)" : "var(--line)"),
                  background: "var(--surface)",
                  display: "grid", placeItems: "center",
                  fontSize: 22, fontFamily: "var(--font-mono)"
                }}>
                  {pin[i] ? "•" : ""}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => { setError(""); setPin(p => (p + n).slice(0, 4)); }}
                  style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{n}</button>
              ))}
              <button onClick={() => { setPicked(null); setPin(""); setError(""); }} style={{ height: 56, fontSize: 12, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{ar ? "عودة" : "Back"}</button>
              <button onClick={() => { setError(""); setPin(p => (p + 0).slice(0, 4)); }} style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>0</button>
              <button onClick={() => setPin(p => p.slice(0, -1))} style={{ height: 56, fontSize: 18, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>⌫</button>
            </div>
            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--crit, #C04A38)", textAlign: "center" }}>{error}</div>
            )}
            <button onClick={tryStartShift} disabled={pin.length !== 4} className="btn btn-primary btn-xl" style={{ marginTop: 14, justifyContent: "center", opacity: pin.length === 4 ? 1 : 0.4 }}>
              {ar ? "ابدأ الوردية" : "Start shift"} <Icon name="arrowRight" size={14}/>
            </button>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
              {bayaan.mode === "demo"
                ? (ar ? `رمز تجريبي: ${picked.pin}` : `Demo PIN: ${picked.pin}`)
                : (ar ? `العد النقدي: د.ع ${picked.openingCash.toLocaleString("en")}` : `Cash float: IQD ${picked.openingCash.toLocaleString("en")}`)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



/* ===== pos-screens.jsx ===== */

/* ============================================================
   POS Sale screen — order taking
   ============================================================ */

function POSSale({ lang, cart, setCart, addItem, subTotal, vat, total, bootstrap, onCharge, onWaste, onStock, expectedTransfers = [], onLogout }) {
  const ar = lang === "ar";
  const bayaan = useBayaan();
  const catalog = useCatalog();
  const menu = React.useMemo(() => (
    bayaan.mode === "live" && bayaan.hasBackend
      ? odooPosMenu(bootstrap)
      : catalog.menuByCategory()
  ), [bayaan.hasBackend, bayaan.mode, bootstrap, catalog.state.products]);
  const [activeCat, setActiveCat] = useStatePOS(0);
  const [search, setSearch] = useStatePOS("");
  const cat = menu[activeCat] ?? menu[0] ?? { items: [] };
  const items = search
    ? menu.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : cat.items;
  const dispatchedTransfers = expectedTransfers.filter((transfer) => isDispatchedTransfer(transfer.status));

  const inc = (key) => setCart(c => c.map(x => x.key === key ? { ...x, qty: x.qty + 1 } : x));
  const dec = (key) => setCart(c => c.flatMap(x => x.key === key ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x]));
  const rm = (key) => setCart(c => c.filter(x => x.key !== key));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ height: 52, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="row" style={{ gap: 12 }}>
          <Avatar name="Maya Ahmed" size={26}/>
          <div className="col" style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{ar ? "مايا أحمد" : "Maya Ahmed"}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{ar ? "الكرادة · وردية ٧:٠٠ ص" : "Karrada · Shift 7:00 AM"}</div>
          </div>
          <span style={{ width: 1, height: 24, background: "var(--line)", marginInlineStart: 6 }}></span>
          <span className="badge"><span className="dot pos"></span>{ar ? "متصل" : "Online"}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={onWaste}><Icon name="trash" size={13}/>{ar ? "هدر" : "Waste"}</button>
          <button className="btn btn-ghost" onClick={onStock}>
            <Icon name="box" size={13}/>{ar ? "استلام المخزون" : "Receive stock"}
            {dispatchedTransfers.length > 0 && <span className="badge badge-warn" style={{ marginInlineStart: 4 }}>{dispatchedTransfers.length}</span>}
          </button>
          <button className="btn btn-ghost" onClick={onLogout}>{ar ? "إنهاء" : "End shift"}</button>
        </div>
      </div>

      {dispatchedTransfers.length > 0 && (
        <button type="button" onClick={onStock}
          style={{
            margin: 0,
            padding: "10px 18px",
            border: 0,
            borderBottom: "1px solid var(--line)",
            background: "var(--warn-soft)",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            textAlign: "start",
            cursor: "pointer",
          }}>
          <span className="row" style={{ gap: 8, minWidth: 0 }}>
            <Icon name="truck" size={14}/>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>
              {dispatchedTransfers.length === 1 ? "1 transfer arrived for kiosk confirmation" : `${dispatchedTransfers.length} transfers arrived for kiosk confirmation`}
            </span>
          </span>
          <span className="badge badge-warn">{ar ? "استلام" : "Confirm receipt"}</span>
        </button>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }}>
        {/* Menu */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--paper)" }}>
          <div style={{ padding: "14px 18px 10px", display: "flex", gap: 10, alignItems: "center" }}>
            <div className="row" style={{ gap: 6, padding: "0 10px", height: 36, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, flex: 1, maxWidth: 320 }}>
              <Icon name="search" size={14} style={{ color: "var(--ink-3)" }}/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={ar ? "بحث عن منتج" : "Search product"}
                style={{ flex: 1, border: 0, background: "transparent", outline: "none", fontSize: 13.5 }}/>
            </div>
            <span style={{ flex: 1 }}></span>
            <div className="row" style={{ gap: 4 }}>
              {[
                { id: 0, ar: "قهوة", en: "Hot", icon: "coffee" },
                { id: 1, ar: "بارد", en: "Iced", icon: "coffee" },
                { id: 2, ar: "عصائر", en: "Juice", icon: "leaf" },
                { id: 3, ar: "كيك", en: "Cake", icon: "cake" },
                { id: 4, ar: "مخبوزات", en: "Bakery", icon: "cake" },
              ].map(t => (
                <button key={t.id} onClick={() => { setActiveCat(t.id); setSearch(""); }}
                  className={"btn " + (activeCat === t.id && !search ? "btn-primary" : "btn-ghost")}
                  style={{ height: 34, fontSize: 13 }}>
                  {ar ? t.ar : t.en}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "8px 18px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {items.map(it => (
                <button key={it.id} onClick={() => addItem(it, it.sizes[0])}
                  className="card"
                  style={{
                    padding: 0, textAlign: "start", overflow: "hidden",
                    cursor: "pointer", display: "flex", flexDirection: "row",
                    minHeight: 110, position: "relative", transition: "transform 100ms, border-color 100ms"
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = "scale(0.985)"}
                  onMouseUp={e => e.currentTarget.style.transform = "none"}
                  onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                  <div style={{ width: "50%", aspectRatio: "1 / 1", flexShrink: 0, alignSelf: "stretch", overflow: "hidden", background: "var(--surface-sunk)" }}>
                    <ProductImage slug={it.image} name={it.name} fill radius={0}/>
                  </div>
                  <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, gap: 4 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3 }}>{it.name}</div>
                    <div className="t-num" style={{ fontSize: 13 }}>IQD {it.price.toLocaleString("en")}</div>
                    <div className="t-small subtle">{it.sizes.join(" · ")}</div>
                  </div>
                </button>
              ))}
            </div>
            {items.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--ink-3)" }}>
                {ar ? "لا توجد نتائج" : "No matches"}
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div style={{ borderInlineStart: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
            <div className="between">
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ar ? "الطلب الحالي" : "Current order"}</div>
                <div className="t-small subtle">#A-{1247 + cart.length}</div>
              </div>
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12 }} onClick={() => setCart([])} disabled={cart.length === 0}>
                {ar ? "مسح" : "Clear"}
              </button>
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
            {cart.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ink-3)" }}>
                <Icon name="receipt" size={28} style={{ marginBottom: 12, opacity: 0.5 }}/>
                <div style={{ fontSize: 13 }}>{ar ? "اختر منتجاً للبدء" : "Tap an item to start"}</div>
              </div>
            )}
            {cart.map(line => (
              <div key={line.key} style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-soft)" }}>
                <div className="between" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{line.name}</div>
                    <div className="t-small subtle">{line.size}</div>
                  </div>
                  <div className="t-num" style={{ fontSize: 13 }}>IQD {(line.price * line.qty).toLocaleString("en")}</div>
                </div>
                <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                  <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
                    <button onClick={() => dec(line.key)} style={{ width: 28, height: 26, background: "var(--surface-2)", borderInlineEnd: "1px solid var(--line)" }}><Icon name="minus" size={11}/></button>
                    <div style={{ width: 30, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: "26px" }}>{line.qty}</div>
                    <button onClick={() => inc(line.key)} style={{ width: 28, height: 26, background: "var(--surface-2)", borderInlineStart: "1px solid var(--line)" }}><Icon name="plus" size={11}/></button>
                  </div>
                  <button onClick={() => rm(line.key)} className="btn btn-quiet" style={{ height: 24, fontSize: 11, color: "var(--ink-3)" }}>{ar ? "إزالة" : "Remove"}</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", background: "var(--surface-2)" }}>
            <div className="col" style={{ gap: 6, marginBottom: 14 }}>
              <div className="between"><span className="muted t-small">{ar ? "المجموع الفرعي" : "Subtotal"}</span><span className="t-num">{fmtMoney(subTotal)}</span></div>
              <div className="between"><span className="muted t-small">{ar ? "ضريبة ٥٪" : "VAT 5%"}</span><span className="t-num muted">{fmtMoney(vat)}</span></div>
              <div className="between" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{ar ? "الإجمالي" : "Total"}</span>
                <span className="t-num" style={{ fontSize: 22 }}>{fmtMoney(total)}</span>
              </div>
            </div>
            <button onClick={onCharge} disabled={cart.length === 0}
              className="btn btn-primary"
              style={{ width: "100%", height: 56, justifyContent: "center", fontSize: 16, borderRadius: 10, opacity: cart.length === 0 ? 0.4 : 1 }}>
              {ar ? "احسب" : "Charge"} {fmtMoney(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function POSTransfers({ lang, kioskId, transfers, busy, onReceive, onRefresh, onBack }) {
  const ar = lang === "ar";
  const actionable = transfers.filter((transfer) => String(transfer.status || "").toLowerCase() === "dispatched");
  const sortedTransfers = [...transfers].sort((a, b) => {
    const aReady = isDispatchedTransfer(a.status) ? 0 : isReceivedTransfer(a.status) ? 2 : 1;
    const bReady = isDispatchedTransfer(b.status) ? 0 : isReceivedTransfer(b.status) ? 2 : 1;
    return aReady - bReady;
  });
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <div style={{ height: 52, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}>
            <Icon name="arrowLeft" size={14}/>
          </button>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{ar ? "Expected transfers" : "Expected transfers"}</div>
            <div className="t-small subtle">{kioskId} receives only what arrived here</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh} style={{ height: 30, fontSize: 12 }}>
          <Icon name="refresh" size={12}/>{ar ? "Refresh" : "Refresh"}
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: "auto", padding: 18 }}>
        <div className="col" style={{ gap: 10 }}>
          {sortedTransfers.map((transfer) => {
            const status = String(transfer.status || "").toLowerCase();
            const canReceive = isDispatchedTransfer(status);
            const received = isReceivedTransfer(status);
            return (
              <div key={transfer.id} className="card" style={{ padding: 14 }}>
                <div className="between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{transfer.id}</div>
                    <div className="t-small subtle" style={{ marginTop: 3 }}>{transfer.from}{" -> "}{transfer.to}</div>
                    <div className="t-small" style={{ marginTop: 8 }}>{transfer.items}</div>
                  </div>
                  <span className={`badge ${transferStatusClass(status)}`}>{received ? "received" : transfer.status}</span>
                </div>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, marginTop: 12 }}>
                  <div className="t-small subtle">
                    {received ? "Confirmed at kiosk" : canReceive ? "Arrived - waiting for kiosk confirmation" : `ETA ${transfer.eta || "--:--"}`}
                  </div>
                  <button className="btn btn-primary" disabled={!canReceive || busy === transfer.id} onClick={() => onReceive(transfer)} style={{ height: 30, fontSize: 12 }}>
                    {busy === transfer.id ? "Receiving..." : received ? "Confirmed" : "Confirm arrived"}
                  </button>
                </div>
              </div>
            );
          })}
          {transfers.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <Icon name="box" size={26} style={{ color: "var(--ink-3)", marginBottom: 10 }}/>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{ar ? "No expected transfers" : "No expected transfers"}</div>
              <div className="t-small subtle" style={{ marginTop: 5 }}>Dispatched warehouse transfers will appear here for kiosk receipt.</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="t-small subtle">{actionable.length} transfer{actionable.length === 1 ? "" : "s"} waiting for kiosk confirmation</div>
      </div>
    </div>
  );
}

function POSClose({ lang, bootstrap, onBack, onClosed }) {
  const ar = lang === "ar";
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const snapshot = unwrapOdoo(bootstrap);
  const kioskId = bayaan.shift?.kioskId || bayaan.kioskId;
  const stockRows = React.useMemo(() => (
    (snapshot?.kiosk_stock_rows || [])
      .filter((row) => matchesKiosk(row.kiosk, { id: kioskId, kiosk_code: kioskId }))
      .slice(0, 12)
  ), [kioskId, snapshot]);
  const [actualCash, setActualCash] = useStatePOS("");
  const [counts, setCounts] = useStatePOS({});
  const [busy, setBusy] = useStatePOS(false);

  const submitClose = async () => {
    if (!bayaan.shift) return;
    const cash = Number(actualCash || 0);
    setBusy(true);
    try {
      if (bayaan.mode === "live" && bayaan.hasBackend) {
        const stockCounts = stockRows.map((row) => ({
          item: row.item,
          uom: row.uom || "Units",
          expected_qty: Number(row.actual_qty || 0),
          actual_qty: Number(counts[row.item] ?? row.actual_qty ?? 0),
        }));
        await bayaan.gateway.submitShiftClose({
          kioskId,
          cashier: bayaan.shift.cashier,
          shift: {
            openedAt: bayaan.shift.openedAt,
            openingCash: bayaan.shift.openingCash,
            sales: [],
          },
          draft: {
            actualCash: cash,
            stockCounts,
            ingredientCounts: stockCounts.map((line) => ({
              ingredient: line.item,
              actual_qty: line.actual_qty,
            })),
          },
        });
      }
      showToast(ar ? "ØªÙ… Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" : "Shift close submitted", "success");
      onClosed();
    } catch (error) {
      showToast(error?.message || "Could not submit shift close", "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="between" style={{ height: 52, padding: "0 18px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <button className="btn btn-ghost" onClick={onBack}><Icon name="arrowLeft" size={13}/>{ar ? "Ø±Ø¬ÙˆØ¹" : "Back"}</button>
        <div className="t-h2">{ar ? "Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©" : "Close shift"}</div>
        <span className="badge">{kioskId}</span>
      </div>
      <div className="col" style={{ gap: 14, padding: 18, overflow: "auto" }}>
        <div className="card card-pad">
          <label className="t-micro">{ar ? "Ø§Ù„Ù†Ù‚Ø¯ Ø§Ù„Ù…Ø¹Ø¯ÙˆØ¯" : "Counted cash"}</label>
          <input className="input" type="number" min={0} value={actualCash} onChange={(event) => setActualCash(event.target.value)} placeholder={String(bayaan.shift?.openingCash || 0)}/>
        </div>
        <div className="card">
          <div className="between" style={{ padding: "12px 14px" }}>
            <div>
              <div className="t-h2">{ar ? "Ø¹Ø¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†" : "Stock count"}</div>
              <div className="t-small subtle">{ar ? "ÙŠØªØ­ÙˆÙ„ Ø¥Ù„Ù‰ ÙØ±Ù‚ Ø¹Ù†Ø¯ Ø§Ù„Ù…Ø¯ÙŠØ±" : "These counted values become the variance record"}</div>
            </div>
          </div>
          <table className="tbl">
            <tbody>
              {stockRows.map((row) => (
                <tr key={row.item}>
                  <td>{cleanDisplayName(row.item)}</td>
                  <td className="t-num muted">{Number(row.actual_qty || 0).toLocaleString("en", { maximumFractionDigits: 2 })} {row.uom}</td>
                  <td style={{ width: 140 }}>
                    <input className="input" type="number" min={0} step={0.01}
                      value={counts[row.item] ?? ""}
                      onChange={(event) => setCounts((current) => ({ ...current, [row.item]: event.target.value }))}
                      placeholder="count"/>
                  </td>
                </tr>
              ))}
              {!stockRows.length && (
                <tr><td className="muted" style={{ textAlign: "center", padding: 24 }}>{ar ? "Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø®Ø²ÙˆÙ† Ù…Ø­Ù…Ù„" : "No live kiosk stock loaded"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn btn-primary btn-xl" onClick={submitClose} disabled={busy || !actualCash} style={{ justifyContent: "center" }}>
          <Icon name="check" size={14}/>{busy ? (ar ? "Ø¬Ø§Ø±Ù Ø§Ù„Ø¥Ø±Ø³Ø§Ù„" : "Submitting") : (ar ? "Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚" : "Submit close")}
        </button>
      </div>
    </div>
  );
}

// =============== PAYMENT ===============
function POSPayment({ lang, total, cart, onTender, tender, onDone, onBack }) {
  const ar = lang === "ar";
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const [phase, setPhase] = useStatePOS("choose"); // choose -> processing -> done
  const [cashGiven, setCashGiven] = useStatePOS("");
  const [submitState, setSubmitState] = useStatePOS({ status: "idle", externalId: null, queued: false, error: "" });
  const tenderOptions = [
    { id: "card", icon: "card", label: ar ? "بطاقة" : "Card", sub: ar ? "تلامس أو إدخال" : "Tap or insert" },
    { id: "cash", icon: "cash", label: ar ? "نقد" : "Cash", sub: ar ? "أدخل المبلغ المستلم" : "Enter amount received" },
    { id: "zain cash", icon: "card", label: "Zain Cash", sub: ar ? "محفظة أو رابط دفع" : "Wallet or pay link" },
    { id: "fib", icon: "card", label: "FIB", sub: ar ? "تطبيق البنك أو QR" : "Bank app or QR" },
    { id: "qi card", icon: "card", label: "Qi Card", sub: ar ? "بطاقة أو SuperQi" : "Card or SuperQi" },
    { id: "fastpay", icon: "card", label: "FastPay", sub: ar ? "QR التاجر" : "Merchant QR" },
  ];

  const pickTender = (t) => {
    onTender(t);
    setPhase("processing");
    setSubmitState({ status: "submitting", externalId: null, queued: false, error: "" });
    const minProcessingMs = t === "card" ? 1400 : 600;
    const submitPromise = bayaan.submitSale({ cart, tender: t, total });
    const delayPromise = new Promise((resolve) => setTimeout(resolve, minProcessingMs));
    Promise.all([submitPromise, delayPromise]).then(([result]) => {
      if (result.ok) {
        const externalId = result.result?.external_id || result.result?.id || null;
        setSubmitState({ status: "ok", externalId, queued: false, error: "" });
      } else if (result.queued) {
        setSubmitState({ status: "queued", externalId: null, queued: true, error: result.error });
        showToast(
          ar ? `تم حفظ البيع محلياً وسيتم الإرسال عند رجوع الاتصال` : `Sale queued offline · will sync when online`,
          "warn",
        );
      } else {
        setSubmitState({ status: "error", externalId: null, queued: false, error: result.error });
        showToast(
          (ar ? "فشل البيع: " : "Sale failed: ") + result.error,
          "crit",
        );
      }
      setPhase("done");
    });
  };

  const cashNum = parseFloat(cashGiven) || 0;
  const change = cashNum - total;

  if (phase === "done") {
    const isError = submitState.status === "error";
    const isQueued = submitState.status === "queued";
    const isOk = submitState.status === "ok";
    const titleAr = isError ? "فشل البيع" : isQueued ? "تم الحفظ بانتظار الاتصال" : "تم الدفع";
    const titleEn = isError ? "Sale failed" : isQueued ? "Saved offline" : "Payment complete";
    const subAr = isError
      ? "لم يتم تسجيل البيع. أعد المحاولة أو استدعِ المشرف."
      : isQueued
      ? "البيع في قائمة الانتظار وسيُرسل تلقائياً عند رجوع الاتصال."
      : `طلب ${submitState.externalId ? "#" + String(submitState.externalId).slice(-8) : "#A-1247"} مدفوع`;
    const subEn = isError
      ? "Sale was NOT recorded. Retry or call supervisor."
      : isQueued
      ? "Sale queued · will sync automatically when network is back."
      : `Order ${submitState.externalId ? "#" + String(submitState.externalId).slice(-8) : "#A-1247"} paid`;
    const iconBg = isError ? "var(--crit, #C04A38)" : isQueued ? "var(--warn, #B8860B)" : "var(--ink)";
    const iconName = isError ? "x" : isQueued ? "clock" : "check";
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 52, padding: "0 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ar ? titleAr : titleEn}</span>
          {isOk && <span className="badge badge-pos" style={{ marginInlineStart: 10 }}><span className="dot pos"></span>{ar ? "مسجل" : "Recorded"}</span>}
          {isQueued && <span className="badge badge-warn" style={{ marginInlineStart: 10 }}><span className="dot warn"></span>{ar ? "بانتظار" : "Queued"}</span>}
          {isError && <span className="badge badge-crit" style={{ marginInlineStart: 10 }}><span className="dot crit"></span>{ar ? "خطأ" : "Error"}</span>}
        </div>
        <div className="fade-up" style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: iconBg, color: "var(--ink-inverse)", display: "grid", placeItems: "center", margin: "0 auto 24px" }}>
              <Icon name={iconName} size={28} stroke={2}/>
            </div>
            <div className="t-display" style={{ marginBottom: 6 }}>{fmtMoney(total)}</div>
            <div className="muted" style={{ marginBottom: 4 }}>{ar ? subAr : subEn}</div>
            {tender === "cash" && cashNum > 0 && !isError && (
              <div style={{ marginTop: 24, padding: 16, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, display: "inline-block" }}>
                <div className="t-micro">{ar ? "الباقي" : "Change due"}</div>
                <div className="t-num-display">{fmtMoney(change)}</div>
              </div>
            )}
            {isError && submitState.error && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--surface)", border: "1px solid var(--crit, #C04A38)", borderRadius: 8, fontSize: 12, color: "var(--crit, #C04A38)", maxWidth: 360, marginInline: "auto" }}>
                {submitState.error}
              </div>
            )}
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 32 }}>
              {!isError && <button className="btn btn-ghost btn-lg"><Icon name="receipt" size={14}/>{ar ? "اطبع" : "Print"}</button>}
              {!isError && <button className="btn btn-ghost btn-lg">{ar ? "أرسل عبر SMS" : "Send SMS"}</button>}
              {isError
                ? <button onClick={onBack} className="btn btn-primary btn-lg">{ar ? "إعادة المحاولة" : "Retry"} <Icon name="arrowRight" size={13}/></button>
                : <button onClick={onDone} className="btn btn-primary btn-lg">{ar ? "طلب جديد" : "New order"} <Icon name="arrowRight" size={13}/></button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid var(--line)", borderTopColor: "var(--ink)", animation: "spin 800ms linear infinite", margin: "0 auto 16px" }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{tender === "card" ? (ar ? "جارٍ معالجة البطاقة" : "Processing card") : (ar ? "جارٍ التأكيد" : "Confirming")}</div>
          <div className="muted t-small" style={{ marginTop: 6 }}>{fmtMoney(total)}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 52, padding: "0 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} className="btn btn-quiet" style={{ height: 32 }}>
          <Icon name={ar ? "chevRight" : "chevLeft"} size={13}/>{ar ? "عودة للطلب" : "Back to order"}
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{ar ? "اختر طريقة الدفع" : "Choose payment"}</span>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px" }}>
        <div style={{ padding: 32, overflow: "auto" }}>
          <div className="t-micro" style={{ marginBottom: 6 }}>{ar ? "الإجمالي المستحق" : "Amount due"}</div>
          <div className="t-num-display" style={{ fontSize: 56, marginBottom: 36, letterSpacing: "-0.03em" }}>{fmtMoney(total)}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 760 }}>
            <button onClick={() => pickTender("card")} className="card" style={{ padding: 24, textAlign: "start", cursor: "pointer", minHeight: 140 }}>
              <Icon name="card" size={28} style={{ color: "var(--ink-1)", marginBottom: 14 }}/>
              <div style={{ fontSize: 17, fontWeight: 500 }}>{ar ? "بطاقة" : "Card"}</div>
              <div className="t-small subtle" style={{ marginTop: 4 }}>{ar ? "تواصل أو إدخال" : "Tap or insert"}</div>
            </button>
            <button onClick={() => pickTender("cash")} className="card" style={{ padding: 24, textAlign: "start", cursor: "pointer", minHeight: 140 }}>
              <Icon name="cash" size={28} style={{ color: "var(--ink-1)", marginBottom: 14 }}/>
              <div style={{ fontSize: 17, fontWeight: 500 }}>{ar ? "نقد" : "Cash"}</div>
              <div className="t-small subtle" style={{ marginTop: 4 }}>{ar ? "أدخل المبلغ المستلم" : "Enter amount received"}</div>
            </button>
            {tenderOptions.slice(2).map((option) => (
              <button key={option.id} onClick={() => pickTender(option.id)} className="card" style={{ padding: 24, textAlign: "start", cursor: "pointer", minHeight: 140 }}>
                <Icon name={option.icon} size={28} style={{ color: "var(--ink-1)", marginBottom: 14 }}/>
                <div style={{ fontSize: 17, fontWeight: 500 }}>{option.label}</div>
                <div className="t-small subtle" style={{ marginTop: 4 }}>{option.sub}</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 28, maxWidth: 640 }}>
            <div className="t-micro" style={{ marginBottom: 10 }}>{ar ? "نقد سريع" : "Quick cash"}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {[total, Math.ceil(total/10)*10, Math.ceil(total/50)*50, Math.ceil(total/100)*100, 200, 500].filter((v,i,a) => a.indexOf(v) === i).slice(0, 5).map(amt => (
                <button key={amt} onClick={() => { setCashGiven(String(amt)); pickTender("cash"); }}
                  className="btn btn-ghost btn-lg" style={{ minWidth: 92 }}>
                  {fmtMoney(amt)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderInlineStart: "1px solid var(--line)", padding: 20, background: "var(--surface-2)", overflow: "auto" }}>
          <div className="t-micro" style={{ marginBottom: 12 }}>{ar ? "ملخص الطلب" : "Order summary"}</div>
          <div className="col" style={{ gap: 8 }}>
            {cart.map(l => (
              <div key={l.key} className="between t-small">
                <span>{l.qty}× {l.name}</span>
                <span className="t-num">IQD {(l.price * l.qty).toLocaleString("en")}</span>
              </div>
            ))}
          </div>
          <div className="hairline" style={{ margin: "16px 0" }}></div>
          <div className="between t-small muted"><span>{ar ? "المجموع الفرعي" : "Subtotal"}</span><span className="t-num">{fmtMoney(total - Math.round(total*0.05/1.05))}</span></div>
          <div className="between t-small muted" style={{ marginTop: 4 }}><span>{ar ? "ضريبة" : "VAT"}</span><span className="t-num">{fmtMoney(Math.round(total*0.05/1.05))}</span></div>
          <div className="between" style={{ marginTop: 10, fontSize: 14, fontWeight: 500 }}><span>{ar ? "الإجمالي" : "Total"}</span><span className="t-num">{fmtMoney(total)}</span></div>
        </div>
      </div>
    </div>
  );
}

// =============== WASTE ENTRY ===============
function POSWaste({ lang, bootstrap, onDone, onBack }) {
  const ar = lang === "ar";
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const [item, setItem] = useStatePOS(null);
  const [qty, setQty] = useStatePOS(1);
  const [reason, setReason] = useStatePOS(null);
  const [busy, setBusy] = useStatePOS(false);

  const liveWasteItems = React.useMemo(() => {
    const snapshot = unwrapOdoo(bootstrap);
    if (!(bayaan.mode === "live" && bayaan.hasBackend) || !snapshot) return null;
    const stockRows = (snapshot.kiosk_stock_rows || [])
      .filter((row) => matchesKiosk(row.kiosk, { id: bayaan.kioskId, kiosk_code: bayaan.kioskId }));
    const productsByCode = new Map((snapshot.products || []).map((product) => [product.default_code || product.name, product]));
    const rows = stockRows.map((row) => {
      const product = productsByCode.get(row.item);
      return {
        id: product?.default_code || row.item,
        name: cleanDisplayName(product?.name || row.item),
        price: Number(product?.standard_price || 0),
      };
    });
    return rows.length ? rows : null;
  }, [bayaan.hasBackend, bayaan.kioskId, bayaan.mode, bootstrap]);

  const items = liveWasteItems || [
    { id: "menu-croissant-plain", name: "Croissant — Plain", price: 12 },
    { id: "menu-croissant-chocolate", name: "Croissant — Chocolate", price: 14 },
    { id: "menu-pistachio-cake", name: "Pistachio Cake", price: 32 },
    { id: "menu-latte", name: "Latte", price: 22 },
    { id: "menu-iced-latte", name: "Iced Latte", price: 24 },
    { id: "ing-milk-whole", name: "Milk (whole) 1L", price: 12 },
  ];
  const reasons = ar
    ? ["انتهاء اليوم", "خطأ في الطلب", "إسقاط/سكب", "رفض جودة", "تالف"]
    : ["End of day", "Wrong order", "Spill / drop", "Quality reject", "Spoiled"];

  const cost = item ? item.price * qty : 0;
  const canSubmit = !!item && !!reason && qty > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const result = await bayaan.submitWaste({ item, qty, reason });
      if (result.ok) {
        showToast(
          ar ? `تم تسجيل الهدر — ${item.name}` : `Waste recorded — ${item.name}`,
          "success",
        );
        onDone();
      } else if (result.queued) {
        showToast(
          ar ? "حُفظ الهدر محلياً وسيُرسل عند الاتصال" : "Waste queued · will sync when online",
          "warn",
        );
        onDone();
      } else {
        showToast(
          (ar ? "فشل تسجيل الهدر: " : "Waste failed: ") + result.error,
          "crit",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 52, padding: "0 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} className="btn btn-quiet" style={{ height: 32 }}>
          <Icon name={ar ? "chevRight" : "chevLeft"} size={13}/>{ar ? "عودة" : "Back"}
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{ar ? "تسجيل هدر" : "Record waste"}</span>
        <span style={{ flex: 1 }}></span>
        <span className="t-small subtle">{ar ? "يصل المشرف فوراً" : "Notifies supervisor instantly"}</span>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }}>
        <div style={{ padding: 28, overflow: "auto" }}>
          <div className="t-micro" style={{ marginBottom: 10 }}>1 — {ar ? "اختر المنتج" : "Choose item"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 28 }}>
            {items.map(it => (
              <button key={it.name} onClick={() => setItem(it)}
                className="card"
                style={{
                  padding: "14px 16px", textAlign: "start", cursor: "pointer",
                  borderColor: item?.name === it.name ? "var(--ink)" : "var(--line)"
                }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.name}</div>
                <div className="t-small subtle">IQD {it.price.toLocaleString("en")}</div>
              </button>
            ))}
          </div>

          <div className="t-micro" style={{ marginBottom: 10 }}>2 — {ar ? "الكمية" : "Quantity"}</div>
          <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 8, width: "fit-content", marginBottom: 28, overflow: "hidden" }}>
            <button onClick={() => setQty(q => Math.max(1, q-1))} style={{ width: 48, height: 48, background: "var(--surface)", borderInlineEnd: "1px solid var(--line)" }}><Icon name="minus" size={14}/></button>
            <div style={{ width: 80, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 22, lineHeight: "48px", background: "var(--surface)" }}>{qty}</div>
            <button onClick={() => setQty(q => q+1)} style={{ width: 48, height: 48, background: "var(--surface)", borderInlineStart: "1px solid var(--line)" }}><Icon name="plus" size={14}/></button>
          </div>

          <div className="t-micro" style={{ marginBottom: 10 }}>3 — {ar ? "السبب" : "Reason"}</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {reasons.map(r => (
              <button key={r} onClick={() => setReason(r)}
                className={"btn " + (reason === r ? "btn-primary" : "btn-ghost")}
                style={{ height: 36, fontSize: 13 }}>{r}</button>
            ))}
          </div>
        </div>

        <div style={{ borderInlineStart: "1px solid var(--line)", padding: 24, background: "var(--surface-2)", display: "flex", flexDirection: "column" }}>
          <div className="t-micro" style={{ marginBottom: 8 }}>{ar ? "ملخص" : "Summary"}</div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
            <div className="t-small subtle">{ar ? "المنتج" : "Item"}</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2, minHeight: 22 }}>{item?.name || (ar ? "—" : "Not selected")}</div>
            <div className="hairline" style={{ margin: "12px 0" }}></div>
            <div className="between t-small muted"><span>{ar ? "الكمية" : "Qty"}</span><span className="t-num">{qty}</span></div>
            <div className="between t-small muted" style={{ marginTop: 4 }}><span>{ar ? "السبب" : "Reason"}</span><span style={{ color: reason ? "var(--ink-1)" : "var(--ink-3)" }}>{reason || (ar ? "—" : "—")}</span></div>
            <div className="hairline" style={{ margin: "12px 0" }}></div>
            <div className="between"><span style={{ fontSize: 13, fontWeight: 500 }}>{ar ? "تكلفة الهدر" : "Loss value"}</span><span className="t-num" style={{ fontSize: 18 }}>{fmtMoney(cost)}</span></div>
          </div>

          <div style={{ flex: 1 }}></div>
          <button disabled={!canSubmit} onClick={handleSubmit}
            className="btn btn-primary btn-xl" style={{ justifyContent: "center", marginTop: 16, opacity: canSubmit ? 1 : 0.4 }}>
            {busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "سجّل الهدر" : "Submit waste")}
          </button>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", marginTop: 10 }}>
            {bayaan.shift
              ? (ar
                ? `يُسجَّل تحت ${bayaan.shift.cashier} · ${bayaan.shift.kioskId}`
                : `Logged under ${bayaan.shift.cashier} · ${bayaan.shift.kioskId}`)
              : (ar ? "يُسجَّل تحت اسمك ووقت الوردية" : "Logged under your name and shift time")}
          </div>
        </div>
      </div>
    </div>
  );
}



/* ===== customer-display.jsx ===== */

/* ============================================================
   Customer-facing display — vertical tablet next to cashier
   Shows order live, total, and friendly status messages.
   ============================================================ */

function CustomerDisplay({ lang, screen, cart, subTotal, vat, total, tender, lastAdded }) {
  const ar = lang === "ar";
  const [showFlash, setShowFlash] = React.useState(false);

  React.useEffect(() => {
    if (!lastAdded) return;
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 1400);
    return () => clearTimeout(t);
  }, [lastAdded?.t]);

  // ---- LOGIN / IDLE: branded standby ----
  // Also shown when cashier is on the sale screen with no items yet
  // (e.g. right after pressing "New order"): customer sees the home
  // screen until the first item is added.
  if (screen === "login" || (screen === "sale" && cart.length === 0)) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--terminal)", color: "var(--terminal-ink)" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" }}>
          <JuiceLottie className="customer-standby-lottie" />
          <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>{ar ? "مقهى" : "Maqha"}</div>
          <div style={{ fontSize: 12, color: "#9A998F", marginTop: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {ar ? "قهوة · عصائر · مخبوزات" : "Coffee · Juice · Bakery"}
          </div>
          <div style={{ height: 1, width: 40, background: "#3A3A40", margin: "24px auto" }}></div>
          <div style={{ fontSize: 13.5, color: "#C9C8C0", lineHeight: 1.55 }}>
            {ar ? "تفضل عند الكاشير" : "Step up when ready"}
          </div>
        </div>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #2A2A2E", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6E6E68" }}>
          <span>{ar ? "الكرادة" : "Karrada Center"}</span>
          <span className="t-num">07:42</span>
        </div>
      </div>
    );
  }

  // ---- PAYMENT: pay prompt ----
  if (screen === "payment" && tender == null) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
          <div className="t-micro">{ar ? "إجمالي مستحق" : "Amount due"}</div>
          <div className="t-num-display" style={{ fontSize: 44, marginTop: 4 }}>{fmtMoney(total)}</div>
        </div>
        <div style={{ flex: 1, padding: "24px 22px", overflow: "auto" }}>
          <div className="t-micro" style={{ marginBottom: 10 }}>{ar ? "طلبك" : "Your order"}</div>
          <div className="col" style={{ gap: 8 }}>
            {cart.map(l => (
              <div key={l.key} className="row" style={{ fontSize: 13, gap: 10, justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 8, minWidth: 0, flex: 1 }}>
                  <ProductImage slug={l.image} name={l.name} size={28} radius={4}/>
                  <span className="muted" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.qty}× {l.name}
                  </span>
                </div>
                <span className="t-num">IQD {(l.price * l.qty).toLocaleString("en")}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 22px", background: "var(--terminal)", color: "var(--terminal-ink)", textAlign: "center" }}>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", fontSize: 14, fontWeight: 500 }}>
            <Icon name="card" size={18}/>
            <span>{ar ? "اقترب أو أدخل بطاقتك" : "Tap or insert card"}</span>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "payment" && tender != null) {
    // processing/done: show big total + thank you when paid
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", alignItems: "center", justifyContent: "center", padding: "0 22px", textAlign: "center" }}>
        <SuccessLottie size={72} style={{ marginBottom: 22 }} />
        <div className="t-h2" style={{ marginBottom: 6 }}>{ar ? "شكراً لزيارتك" : "Thank you"}</div>
        <div className="t-num-display" style={{ marginTop: 4 }}>{fmtMoney(total)}</div>
        <div className="muted t-small" style={{ marginTop: 12 }}>{ar ? "نتمنى لك يوماً جميلاً" : "Have a great day"}</div>
      </div>
    );
  }

  // ---- WASTE: cashier-only screen, customer sees standby ----
  if (screen === "waste") {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--surface)", padding: "0 28px", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 10 }}>{ar ? "لحظة من فضلك" : "One moment"}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>{ar ? "الكاشير يعالج طلبك" : "Cashier is with you shortly"}</div>
        </div>
      </div>
    );
  }

  // ---- SALE: live order mirror ----
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--brand-mark-bg)", color: "var(--brand-mark-fg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>M</div>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{ar ? "مقهى" : "Maqha"}</span>
        </div>
        <span className="t-small subtle">#A-{1247 + cart.length}</span>
      </div>

      {/* Empty / waiting */}
      {cart.length === 0 && (
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "0 28px", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>
              {ar ? "أهلاً بك" : "Welcome"}
            </div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              {ar ? "سيظهر طلبك هنا أثناء التحضير" : "Your order will appear here as it's added"}
            </div>
          </div>
        </div>
      )}

      {/* Order list */}
      {cart.length > 0 && (
        <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "10px 20px" }}>
          <div className="t-micro" style={{ marginBottom: 10 }}>{ar ? "طلبك" : "Your order"}</div>
          <div className="col" style={{ gap: 0 }}>
            {cart.map(l => {
              const isJust = lastAdded && lastAdded.name === l.name && showFlash;
              return (
                <div key={l.key} style={{
                  padding: "12px 0", borderBottom: "1px solid var(--line-soft)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  background: isJust ? "var(--accent-soft)" : "transparent",
                  marginInline: isJust ? -10 : 0,
                  paddingInline: isJust ? 10 : 0,
                  borderRadius: isJust ? 6 : 0,
                  transition: "background 400ms ease, margin 200ms, padding 200ms"
                }}>
                  <ProductImage slug={l.image} name={l.name} size={48} radius={6}/>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{l.name}</div>
                    <div className="t-small subtle">{l.size} · IQD {l.price.toLocaleString("en")}</div>
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <span className="t-num muted" style={{ fontSize: 13 }}>×{l.qty}</span>
                    <span className="t-num" style={{ fontSize: 14, minWidth: 80, textAlign: "end" }}>IQD {(l.price * l.qty).toLocaleString("en")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Totals */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="between t-small muted"><span>{ar ? "المجموع" : "Subtotal"}</span><span className="t-num">{fmtMoney(subTotal)}</span></div>
        <div className="between t-small muted" style={{ marginTop: 4 }}><span>{ar ? "ضريبة ٥٪" : "VAT 5%"}</span><span className="t-num">{fmtMoney(vat)}</span></div>
        <div className="between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{ar ? "الإجمالي" : "Total"}</span>
          <span className="t-num" style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{fmtMoney(total)}</span>
        </div>
      </div>

      <div style={{ padding: "10px 20px", background: "var(--terminal)", color: "var(--terminal-ink)", fontSize: 11.5, textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {cart.length === 0
          ? (ar ? "بانتظار طلبك" : "Awaiting order")
          : (ar ? "أكد مع الكاشير عند الانتهاء" : "Confirm with cashier when ready")}
      </div>
    </div>
  );
}



/* ===== app.jsx ===== */

/* ============================================================
   App shell — master switcher (Admin / POS), language toggle
   ============================================================ */

const { useState: useStateApp } = React;

const THEME_STORAGE_KEY = "bayaan-dashboard-theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function AuthChip({ lang }) {
  const bayaan = useBayaan();
  const { showToast } = useToast();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ login: "manager@bayaan.test", password: "test" });
  if (!bayaan.hasBackend) return null;

  const user = bayaan.auth.user || {};
  const roleLabel = ROLE_LABELS[user.primaryRole] || "User";
  const signedIn = bayaan.auth.authenticated;
  const submit = async (event) => {
    event.preventDefault();
    const result = await bayaan.login(form);
    if (result.ok) {
      showToast(ar ? "تم تسجيل الدخول" : `Signed in as ${form.login}`, "success");
      setOpen(false);
    } else {
      showToast(result.error, "warn");
    }
  };
  const signOut = async () => {
    await bayaan.logout();
    showToast(ar ? "تم تسجيل الخروج" : "Signed out", "info");
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="btn btn-ghost" style={{ height: 28, fontSize: 12 }} onClick={() => setOpen(true)}>
        <Icon name="user" size={12}/>
        {signedIn ? `${roleLabel} · ${user.name || user.login}` : (ar ? "دخول" : "Sign in")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={signedIn ? "Bayaan account" : "Sign in to Bayaan"} width={420}>
        {signedIn ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="t-small subtle">{user.login}</div>
              <div style={{ marginTop: 10 }}><span className="badge">{roleLabel}</span></div>
            </div>
            <div className="between">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={signOut}>Sign out</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <label className="field-label">Login</label>
            <input className="input" value={form.login} onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}/>
            <label className="field-label">Password</label>
            <input className="input" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}/>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.login}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: "flex-start", fontSize: 12 }}
                  onClick={() => setForm({ login: account.login, password: "test" })}
                >
                  {account.role}
                </button>
              ))}
            </div>
            {bayaan.auth.error && (
              <div className="t-small" style={{ color: "var(--crit)", background: "var(--crit-soft)", border: "1px solid var(--crit)", borderRadius: 6, padding: 10 }}>
                {bayaan.auth.error}
              </div>
            )}
            <div className="between">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={bayaan.auth.busy || !form.login || !form.password}>
                {bayaan.auth.busy ? "Signing in" : "Sign in"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function MasterTop({ panel, setPanel, lang, setLang, theme, setTheme }) {
  const bayaan = useBayaan();
  const ar = lang === "ar";
  const canAdmin = authAllowsPanel(bayaan.auth, bayaan.hasBackend, "admin", bayaan.mode);
  const canPos = authAllowsPanel(bayaan.auth, bayaan.hasBackend, "pos", bayaan.mode);
  return (
    <div className="master-top">
      <div className="brand">
        <div className="brand-mark">M</div>
        <span style={{ letterSpacing: "-0.01em" }}>Maqha</span>
        <span style={{ color: "#6E6E68", fontWeight: 400 }}>- operations</span>
      </div>
      <div className="seg">
        <button className={panel === "admin" ? "on" : ""} disabled={!canAdmin} onClick={() => setPanel("admin")}>Admin</button>
        <button className={panel === "pos" ? "on" : ""} disabled={!canPos} onClick={() => setPanel("pos")}>POS</button>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <ModeBadge bayaan={bayaan} ar={ar}/>
        <AuthChip lang={lang}/>
        <div className="theme-switch" role="group" aria-label="Theme">
          <button
            type="button"
            className={theme === "light" ? "on" : ""}
            aria-label="Light theme"
            aria-pressed={theme === "light"}
            title="Light theme"
            onClick={() => setTheme("light")}
          >
            <Icon name="sun" size={13}/>
          </button>
          <button
            type="button"
            className={theme === "dark" ? "on" : ""}
            aria-label="Dark theme"
            aria-pressed={theme === "dark"}
            title="Dark theme"
            onClick={() => setTheme("dark")}
          >
            <Icon name="moon" size={13}/>
          </button>
        </div>
        <div className="lang">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "ar" ? "on" : ""} onClick={() => setLang("ar")}>AR</button>
        </div>
      </div>
    </div>
  );
}

function ModeBadge({ bayaan, ar }) {
  const { mode, setMode, hasBackend, pendingCount, kioskId } = bayaan;
  const liveAvailable = hasBackend;
  const live = mode === "live";
  const onToggle = () => {
    setMode(mode === "live" ? "demo" : "live");
  };
  const dotClass = live ? (liveAvailable ? "pos" : "crit") : "warn";
  const label = live
    ? (ar ? "تشغيل فقط" : "Live only")
    : (ar ? "وضع تجريبي" : "Demo mode");
  return (
    <button
      type="button"
      onClick={onToggle}
      title={liveAvailable
        ? (ar ? "تبديل بين بيانات الإنتاج والتجريبي" : "Toggle between production and demo data")
        : (ar ? "تشغيل فقط بدون بيانات تجريبية حتى تضبط الرابط" : "Live-only removes demo data even before the backend URL is configured")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px 3px 7px", height: 22, borderRadius: 4,
        background: "transparent",
        border: `1px solid ${live ? "var(--pos)" : "var(--line)"}`,
        color: live ? "var(--pos)" : "#8B8A82",
        fontSize: 11, fontWeight: 500, letterSpacing: "0.01em",
        cursor: "pointer",
        opacity: 1,
      }}
    >
      <span className={`dot ${dotClass}`} style={{ width: 6, height: 6 }}></span>
      <span>{label}</span>
      <span style={{ color: "#6E6E68", fontWeight: 400 }}>· {kioskId}</span>
      {pendingCount > 0 && (
        <span style={{
          marginInlineStart: 4, padding: "0 5px", borderRadius: 8,
          background: "var(--warn-soft, #FCE8C2)", color: "var(--warn, #B8860B)", fontSize: 10,
        }}>{pendingCount} {ar ? "بانتظار" : "queued"}</span>
      )}
    </button>
  );
}

function AuthRequired({ lang }) {
  const bayaan = useBayaan();
  const ar = lang === "ar";
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--paper)", padding: 24 }}>
      <div className="card" style={{ width: 420, maxWidth: "100%", padding: 18 }}>
        <div className="t-h2">{ar ? "تسجيل الدخول" : "Sign in"}</div>
        <div className="t-small subtle" style={{ marginTop: 4 }}>
          {ar ? "وضع التشغيل يحتاج حساب أودو/بيان." : "Live mode uses Odoo users and Bayaan role groups."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
          {TEST_ACCOUNTS.map((account) => (
            <button
              key={account.login}
              type="button"
              className="btn btn-ghost"
              style={{ justifyContent: "flex-start", height: 34 }}
              onClick={() => void bayaan.login({ login: account.login, password: "test" })}
            >
              {account.role}
            </button>
          ))}
        </div>
        {bayaan.auth.error && (
          <div className="t-small" style={{ marginTop: 12, color: "var(--crit)" }}>{bayaan.auth.error}</div>
        )}
        <button type="button" className="btn btn-primary" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
          onClick={() => bayaan.setMode("demo")}>
          {ar ? "فتح العرض التجريبي" : "Open demo mode"}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const bayaan = useBayaan();
  const [panel, setPanel] = useStateApp("admin");
  const [lang, setLang] = useStateApp("en");
  const [theme, setTheme] = useStateApp(getInitialTheme);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const needsLogin = bayaan.hasBackend && bayaan.mode === "live" && (!bayaan.auth.checked || !bayaan.auth.authenticated);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (authAllowsPanel(bayaan.auth, bayaan.hasBackend, panel, bayaan.mode)) return;
    if (authAllowsPanel(bayaan.auth, bayaan.hasBackend, "admin", bayaan.mode)) setPanel("admin");
    else if (authAllowsPanel(bayaan.auth, bayaan.hasBackend, "pos", bayaan.mode)) setPanel("pos");
  }, [bayaan.auth, bayaan.hasBackend, bayaan.mode, panel]);

  return (
    <div className={`app-frame panel-${panel}`} data-theme={theme} dir={dir} lang={lang}>
      <MasterTop panel={panel} setPanel={setPanel} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}/>
      {needsLogin
        ? <AuthRequired lang={lang}/>
        : panel === "admin"
          ? <AdminPanel lang={lang}/>
          : <POSPanel lang={lang}/>}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <BayaanProvider>
        <CatalogProvider>
          <AppContent/>
        </CatalogProvider>
      </BayaanProvider>
    </ToastProvider>
  );
}



export default App;
