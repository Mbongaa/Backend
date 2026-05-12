import React from "react";
import { flushSync } from "react-dom";
import { JuiceLottie } from "../components/JuiceLottie";
import { SuccessLottie } from "../components/SuccessLottie";
import { createSourceOfTruthGateway } from "../services/sourceOfTruth";
import {
  clearCatalog,
  loadCatalog,
  makeEmptyCatalog,
  nextProductId,
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

/* This file is a mechanical Vite port of design/exact-pos/kiosk-pos/project/Kiosk POS.html and its imports. */

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
    { item: "Milk (whole) 1L", category: "Dairy", stock: 42, unit: "ctn", reorder: 60, days: 1.2, supplier: "Baghdad Dairy", status: "low" },
    { item: "Espresso beans - house", category: "Coffee", stock: 86, unit: "kg", reorder: 50, days: 9.4, supplier: "Babel Roasters", status: "ok" },
    { item: "Pistachio paste", category: "Bakery", stock: 4, unit: "kg", reorder: 12, days: 0.8, supplier: "Mesopotamia Foods", status: "crit" },
    { item: "Oat milk 1L", category: "Dairy alt", stock: 28, unit: "ctn", reorder: 24, days: 3.1, supplier: "Tigris Bakery", status: "ok" },
    { item: "Croissant - frozen", category: "Bakery", stock: 124, unit: "pc", reorder: 100, days: 2.8, supplier: "Tigris Bakery", status: "ok" },
    { item: "Vanilla syrup 750ml", category: "Syrups", stock: 11, unit: "btl", reorder: 18, days: 2.0, supplier: "Erbil Syrups", status: "low" },
    { item: "Lemons", category: "Produce", stock: 38, unit: "kg", reorder: 30, days: 4.2, supplier: "Najaf Fresh", status: "ok" },
    { item: "Mint - fresh", category: "Produce", stock: 6, unit: "kg", reorder: 10, days: 1.4, supplier: "Najaf Fresh", status: "low" },
    { item: "Cups 12oz", category: "Packaging", stock: 4200, unit: "pc", reorder: 3000, days: 11.0, supplier: "Iraq Pack", status: "ok" },
    { item: "Chocolate - 70%", category: "Bakery", stock: 22, unit: "kg", reorder: 18, days: 6.4, supplier: "Mesopotamia Foods", status: "ok" },
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
    { name: "Baghdad Dairy", category: "Dairy", spend30: 13_447_000, ontime: 98, lastOrder: "2 days ago", status: "good" },
    { name: "Mesopotamia Foods", category: "Bakery / Nuts", spend30: 9_835_000, ontime: 91, lastOrder: "Today", status: "good" },
    { name: "Tigris Bakery", category: "Bakery", spend30: 7_469_000, ontime: 88, lastOrder: "Yesterday", status: "warn" },
    { name: "Babel Roasters", category: "Coffee", spend30: 6_622_000, ontime: 100, lastOrder: "5 days ago", status: "good" },
    { name: "Najaf Fresh", category: "Produce", spend30: 4_973_000, ontime: 82, lastOrder: "Today", status: "warn" },
    { name: "Erbil Syrups", category: "Syrups", spend30: 2_247_000, ontime: 95, lastOrder: "8 days ago", status: "good" },
    { name: "Iraq Pack", category: "Packaging", spend30: 3_213_000, ontime: 99, lastOrder: "12 days ago", status: "good" },
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
        aEn: "Based on the last 14 days at K-07 and the +6% Friday forecast: 14 kg oranges, 5 kg pistachio paste (urgent), 0.4 ctn whole milk, 600 cups 12oz, and 0.5 kg mint. The pistachio paste is already in pending action PA-1 awaiting approval.",
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
            { item: "Milk (whole) 1L", qty: 4, unit: "ctn", value: 56_000, urgency: "normal", coverDays: 2.0 },
            { item: "Cups 12oz", qty: 600, unit: "pc", value: 4_200, urgency: "normal", coverDays: 1.4 },
            { item: "Mint - fresh", qty: 0.5, unit: "kg", value: 87_500, urgency: "normal", coverDays: 1.5 },
          ],
          totalValue: 2_440_200,
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
        { item: "Milk (whole) 1L", unit: "ctn", expected: 18, actual: 18, variance: 0, value: 0 },
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
        { item: "Milk (whole) 1L", unit: "ctn", expected: 12, actual: 9, variance: -3, value: -42_000 },
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
      { item: "Milk (whole) 1L", unit: "ctn", opening: 24, received: 12, consumed: 18, waste: 0, expected: 18, actual: 18, variance: 0, status: "ok" },
    ],
    "K-04": [
      { item: "Oranges", unit: "kg", opening: 18, received: 10, consumed: 11.9, waste: 0.7, expected: 15.4, actual: 14.7, variance: -0.7, status: "issue" },
      { item: "Sugar", unit: "kg", opening: 4.0, received: 0, consumed: 0.34, waste: 0, expected: 3.66, actual: 3.66, variance: 0, status: "ok" },
      { item: "Cups 12oz", unit: "pc", opening: 360, received: 200, consumed: 298, waste: 6, expected: 256, actual: 248, variance: -8, status: "watch" },
      { item: "Straws", unit: "pc", opening: 420, received: 0, consumed: 94, waste: 0, expected: 326, actual: 326, variance: 0, status: "ok" },
      { item: "Oat milk 1L", unit: "ctn", opening: 9, received: 0, consumed: 6, waste: 0, expected: 3, actual: 3, variance: 0, status: "watch" },
    ],
    "K-07": [
      { item: "Oranges", unit: "kg", opening: 40, received: 0, consumed: 10.5, waste: 1.5, expected: 28.0, actual: 26.6, variance: -1.4, status: "issue" },
      { item: "Milk (whole) 1L", unit: "ctn", opening: 16, received: 0, consumed: 4, waste: 0, expected: 12, actual: 9, variance: -3, status: "issue" },
      { item: "Cups 12oz", unit: "pc", opening: 640, received: 0, consumed: 267, waste: 106, expected: 267, actual: 251, variance: -16, status: "issue" },
      { item: "Pistachio paste", unit: "kg", opening: 3.0, received: 0, consumed: 2.4, waste: 0.2, expected: 0.4, actual: 0.2, variance: -0.2, status: "issue" },
    ],
  },

  pendingTransfers: [
    { id: "TR-2041", from: "Main Warehouse", to: "K-04 Zayouna Plaza", eta: "17:30", status: "picked", items: "Oat milk 12 ctn, cups 400 pc", value: 612_000 },
    { id: "TR-2042", from: "Main Warehouse", to: "K-07 Majidi Mall", eta: "Tomorrow 07:00", status: "approved", items: "Pistachio paste 5 kg, cups 600 pc", value: 1_316_700 },
    { id: "TR-2043", from: "Baghdad Area Warehouse", to: "K-02 Mansour District", eta: "16:45", status: "draft", items: "Mint 4 kg, lemons 12 kg", value: 356_000 },
  ],

  transferSuggestions: [
    { kiosk: "K-04 Zayouna Plaza", item: "Oat milk 1L", qty: "12 ctn", cover: "1.1 days", reason: "low stock before evening rush" },
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

const CatalogContext = React.createContext(null);

function CatalogProvider({ children }) {
  const [state, setState] = React.useState(
    () => loadCatalog() ?? makeEmptyCatalog(flattenSeed()),
  );

  const persist = React.useCallback((next) => {
    setState(next);
    saveCatalog(next);
  }, []);

  const api = React.useMemo(
    () => ({
      state,
      upsertProduct: (p) => {
        const exists = state.products.some((x) => x.id === p.id);
        const products = exists
          ? state.products.map((x) => (x.id === p.id ? p : x))
          : [...state.products, p];
        persist({ ...state, products });
      },
      deleteProduct: (id) => {
        const recipes = { ...state.recipes };
        delete recipes[id];
        persist({
          ...state,
          products: state.products.filter((p) => p.id !== id),
          recipes,
        });
      },
      setRecipe: (productId, lines) => {
        const recipes = { ...state.recipes };
        if (!lines || lines.length === 0) delete recipes[productId];
        else recipes[productId] = { productId, lines };
        persist({ ...state, recipes });
      },
      setImage: (slug, dataUrl) => {
        persist({
          ...state,
          imagesBySlug: { ...state.imagesBySlug, [slug]: dataUrl },
        });
      },
      clearImage: (slug) => {
        const imagesBySlug = { ...state.imagesBySlug };
        delete imagesBySlug[slug];
        persist({ ...state, imagesBySlug });
      },
      resetAll: () => {
        clearCatalog();
        setState(makeEmptyCatalog(flattenSeed()));
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
      <div style={{
        position: "fixed", bottom: 22, insetInlineEnd: 22, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
        maxWidth: 360,
      }}>
        {toasts.map((t) => (
          <div key={t.id} className="ai-toast" style={{
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
// Until any real image files exist in apps/kiosk-pos/public/products/, every
// tile renders the fallback — no broken image icons. Drop a webp in with the
// matching slug and it appears next reload, no code change.
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
  if (!snapshot?.kiosks?.length) return MOCK.kiosks;
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
    const fallback = MOCK.kiosks[index % MOCK.kiosks.length];
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

const odooInventoryRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  if (!snapshot?.warehouse_stock?.length) return MOCK.inventory;
  return snapshot.warehouse_stock.slice(0, 30).map((row) => {
    const qty = Number(row.actual_qty || 0);
    const status = qty <= 5 ? "crit" : qty <= 25 ? "low" : "ok";
    return {
      item: row.item || "Stock item",
      category: row.mode === "recipe" ? "Recipe ingredient" : "Stock item",
      stock: Math.round(qty * 100) / 100,
      unit: row.uom || "u",
      reorder: status === "crit" ? 10 : 25,
      days: status === "crit" ? 0.6 : status === "low" ? 1.8 : 6.4,
      supplier: "Bayaan",
      status,
    };
  });
};

const odooPosOrderRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.today?.orders || [];
  if (!rows.length) return MOCK.posOrders;
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
  const rows = snapshot?.closings?.length ? snapshot.closings : MOCK.closings;
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
  const base = snapshot || MOCK;

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
  if (!rows.length) return MOCK.pendingTransfers;
  return rows.slice(0, 12).map((transfer) => ({
    id: transfer.name || `PICK-${transfer.id}`,
    from: transfer.from || "Central Warehouse",
    to: transfer.toKioskId || transfer.to || "Kiosk",
    items: transfer.lines?.length
      ? transfer.lines.slice(0, 2).map((line) => `${line.product} x ${Number(line.qty || 0).toLocaleString("en", { maximumFractionDigits: 2 })}`).join(", ")
      : `${transfer.items || 0} items`,
    eta: transfer.scheduledAt ? String(transfer.scheduledAt).slice(11, 16) : "--:--",
    status: transfer.state || "draft",
  }));
};

const transferQtyValue = (qty) => Number(String(qty ?? 0).replace(/,/g, "").match(/[\d.]+/)?.[0] ?? 0);
const transferQtyUnit = (qty) => String(qty ?? "").replace(/^[\d.,\s]+/, "").trim();
const transferKioskId = (value) => String(value || "").match(/K-\d+/)?.[0] || String(value || "");

const odooTransferSuggestionRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.suggested_transfers || [];
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
  if (!recipes.length) return demoRecipeMarginRows();
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

const odooPurchaseOrderRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.purchase_orders || [];
  if (!rows.length) {
    return [
      { po: "PO-2026-0509-007", supplier: "Baghdad Dairy", items: "Milk, cream, yogurt", value: 2_950_000, status: "approved" },
      { po: "PO-2026-0509-008", supplier: "Mesopotamia Foods", items: "Pistachio paste 50 kg", value: 11_125_000, status: "draft" },
      { po: "PO-2026-0509-009", supplier: "Najaf Fresh", items: "Oranges, lemons, mint", value: 1_840_000, status: "receiving" },
    ];
  }
  return rows.slice(0, 12).map((order) => ({
    po: order.name || `PO-${order.id}`,
    supplier: order.supplier || "Supplier",
    items: order.lines?.length
      ? order.lines.slice(0, 3).map((line) => line.product).join(", ")
      : "No lines",
    value: Number(order.amount_total || 0),
    status: order.state || "draft",
  }));
};

const odooCashierPerformanceRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const orders = snapshot?.today?.orders || [];
  if (!orders.length) {
    return [
      { name: "Maya Ahmed", kiosk: "K-01", sales: 6_447_000, shortage: 0, voidRefund: "3 / 1" },
      { name: "Yusuf Saleh", kiosk: "K-02", sales: 7_469_000, shortage: -84_000, voidRefund: "8 / 2" },
      { name: "Karim Fahmy", kiosk: "K-09", sales: 3_353_000, shortage: -32_000, voidRefund: "14 / 3" },
      { name: "Sara Younis", kiosk: "K-04", sales: 4_239_000, shortage: null, voidRefund: "4 / 1" },
    ];
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

const odooWasteRows = (bootstrap) => {
  const snapshot = unwrapOdoo(bootstrap);
  const rows = snapshot?.today?.waste || [];
  if (!rows.length) return MOCK.waste;
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
  const periodKey = String(period || "Daily").toLowerCase();
  const periodSummary = summary?.reportPeriods?.[periodKey];
  if (periodSummary) {
    const payments = periodSummary.payments || { cash: 0, digital: 0 };
    return {
      revenue: Number(periodSummary.revenue || 0),
      cogs: Number(periodSummary.cogs || 0),
      waste: Number(periodSummary.wasteCost || 0),
      payroll: Number(periodSummary.payrollExpense || payrollExpenseForPeriod(period)),
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
      payroll: Number(summary.totals.payrollExpense || payrollExpenseForPeriod(period)),
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
    <div ref={containerRef} style={{ position: "relative" }}>
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
  const sourceKiosks = useMemo(() => odooKioskRows(bootstrap), [bootstrap]);
  const closeRows = useMemo(() => odooClosingRows(bootstrap), [bootstrap]);
  const paymentSplit = useMemo(() => odooPaymentSplit(bootstrap), [bootstrap]);
  const summary = useMemo(() => odooSummary(bootstrap), [bootstrap]);

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
    setFeed(seedFeed(initial));
  }, [initial]);

  // Live products (revenue tickers)
  const initialProducts = useMemo(() => ([
    { id: "p1", name: "Iced Latte",       cat: "Iced Coffee", rev: 3_690_000, qty: 415 },
    { id: "p2", name: "Iced Americano",   cat: "Iced Coffee", rev: 2_620_000, qty: 392 },
    { id: "p3", name: "Orange Juice",     cat: "Juice",       rev: 2_330_000, qty: 301 },
    { id: "p4", name: "Latte",            cat: "Hot Coffee",  rev: 2_130_000, qty: 271 },
    { id: "p5", name: "Pistachio Cake",   cat: "Cake",        rev: 1_670_000, qty: 148 },
    { id: "p6", name: "Cold Brew",        cat: "Iced Coffee", rev: 1_630_000, qty: 172 },
    { id: "p7", name: "Cappuccino",       cat: "Hot Coffee",  rev: 1_580_000, qty: 215 },
    { id: "p8", name: "Mocha",            cat: "Hot Coffee",  rev: 1_410_000, qty: 178 },
  ]), []);
  const [products, setProducts] = useState(initialProducts);

  // Live waste leaderboard (cost lost per item — ticks like products)
  const initialWaste = useMemo(() => ([
    { id: "w1", name: "Croissant - chocolate", cat: "Bakery",      cost: 412_000, qty: 28 },
    { id: "w2", name: "Pistachio cake slice",  cat: "Cake",        cost: 384_000, qty: 18 },
    { id: "w3", name: "Iced latte",            cat: "Iced Coffee", cost: 294_000, qty: 22 },
    { id: "w4", name: "Mango juice",           cat: "Juice",       cost: 168_000, qty: 14 },
    { id: "w5", name: "Croissant - plain",     cat: "Bakery",      cost: 142_000, qty: 19 },
    { id: "w6", name: "Espresso shot",         cat: "Coffee",      cost: 84_000,  qty: 12 },
  ]), []);
  const [waste, setWaste] = useState(initialWaste);

  // Live activity feed (rolling event stream)
  const [feed, setFeed] = useState(() => seedFeed(initial));
  const eventCounterRef = useRef(1000);

  // Hourly bars — current hour ticks up
  const [hourly, setHourly] = useState(() => [4,3,2,2,3,8,18,32,48,52,46,58,62,55,40,32,38,46,52,58,48,32,18,8]);
  const currentHour = 14;

  // ---- Tick: nudge metrics, occasionally trigger rank swaps ----
  useEffect(() => {
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
        const sorted = [...prev].sort((a, b) => b.cost - a.cost);
        const idx = Math.floor(Math.random() * Math.min(4, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.cost - b.cost;
        return prev.map((w) => w.id === b.id ? { ...w, cost: w.cost + gap + 8000 + Math.random() * 14000, qty: w.qty + 2 } : w);
      });
    }, 8100);

    return () => { alive = false; clearInterval(tickFast); clearInterval(tickSwap); clearInterval(tickStockSwap); clearInterval(tickProdSwap); clearInterval(tickWasteSwap); };
  }, [initial]);

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
  const variancePct = -1.3;

  // Period filter: "day" | "week" | "month". Pure display multiplier — keeps the
  // underlying live state ticking so rank-swap animations still fire.
  const [period, setPeriod] = useState("day");
  const periodMul = period === "month" ? 30 : period === "week" ? 7 : 1;
  const periodSubtitle = period === "month" ? "this month" : period === "week" ? "this week" : "today";
  const planDelta = period === "month" ? "+11.2% vs plan" : period === "week" ? "+9.6% vs plan" : "+8.4% vs plan";

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
                <PulseDot color="var(--ai)"/>
                {ar ? "ملخص الذكاء" : "AI summary"}
              </div>
              <span className="badge badge-ai" style={{ height: 18, fontSize: 10 }}>traceable</span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div className="ai-block">
                <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>
                  {ar ? MOCK.ai.varianceLead.headlineAr : MOCK.ai.varianceLead.headlineEn}
                </div>
                <div className="t-small muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
                  {ar
                    ? "الأرقام مرتبطة بإغلاق الوردية ودفتر الاستهلاك. الذكاء لا يحسب الرقم الرسمي."
                    : "Numbers link back to shift close and the consumption ledger. AI does not compute the official total."}
                </div>
              </div>
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
                  <div className="ov-kpi-delta" style={{ color: "var(--pos)" }}>+ {planDelta}</div>
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
                <div className="ov-kpi-value">{wastePct.toFixed(1)}%</div>
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
              <span className="badge" style={{ height: 18, fontSize: 10 }}>{MOCK.alerts.length}</span>
            </div>
            <div>
              {MOCK.alerts.map((a, i) => (
                <div key={a.id} style={{
                  padding: "11px 14px",
                  borderBottom: i < MOCK.alerts.length - 1 ? "1px solid var(--line-soft)" : 0,
                  display: "flex", gap: 10, alignItems: "flex-start"
                }}>
                  <span className={`dot ${a.level}`} style={{ marginTop: 6, flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.35 }}>{a.title}</div>
                    <div className="t-small subtle" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{a.body}</div>
                    <div className="t-small faint" style={{ fontSize: 10.5, marginTop: 5, fontFamily: "var(--font-mono)" }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--accent)"/>
                {ar ? "إجراءات تلقائية" : "Auto-actions"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>queue - 3</span>
            </div>
            <div style={{ padding: "10px 14px" }}>
              {[
                { label: "Auto-PO drafted - Baghdad Dairy", sub: "Milk x 4 kiosks - IQD 1.2M", ok: true },
                { label: "Pre-prep schedule shifted", sub: "Zayouna Plaza - 7:30 to 7:45", ok: true },
                { label: "Pistachio recipe flagged", sub: "12g to 9g - awaiting approval", ok: false },
              ].map((a, i) => (
                <div key={i} className="row" style={{ padding: "8px 0", gap: 8, borderBottom: i < 2 ? "1px solid var(--line-soft)" : 0 }}>
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Seed initial activity feed ----------
function seedFeed(kiosks) {
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
          { label: "Approve auto-PO - Baghdad Dairy", sub: "20 ctn - ETA 2h", primary: true },
          { label: "Transfer 8 ctn from K-01 Karrada Center", sub: "Recovers ~IQD 280K today", primary: false },
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
    { role: "ai", text: ar ? (SCENES.default.replyAr || SCENES.default.reply) : SCENES.default.reply, cite: sourceMeta.cite },
  ]);
  const [busy, setBusy] = useStateIns(false);

  useEffectIns(() => {
    setMessages((items) => items.map((item, index) => (
      index === 0 && item.role === "ai" ? { ...item, cite: sourceMeta.cite } : item
    )));
  }, [sourceMeta.cite]);

  const sendQuestion = (q, sceneIdHint) => {
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
  return (
    <div className={compact ? "health-bar compact" : "health-bar"}>
      <div className="between health-meta">
        <span>{label}</span>
        <span className="t-num">{right || `${safeValue}%`}</span>
      </div>
      <div className="health-track" aria-label={`${label}: ${safeValue}%`}>
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
                  <th style={{ width: 32 }}></th>
                  <th>Kiosk</th>
                  <th>City</th>
                  <th style={{ textAlign: "end" }}>Revenue</th>
                  <th style={{ textAlign: "end" }}>Orders</th>
                  <th style={{ textAlign: "end" }}>Margin</th>
                  <th>Stock inventory</th>
                  <th>Waste tracker</th>
                  <th>Issue</th>
                  <th>7-day</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(k => (
                  <tr key={k.id} className="row-click" onClick={onPick}>
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
    avgInv: Math.round(live.reduce((s, k) => s + k.ops.inv, 0) / live.length),
    avgWaste: (live.reduce((s, k) => s + k.waste, 0) / live.length).toFixed(1),
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
            disabled={!sourceOfTruth}
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
                <th style={{ width: 32 }}></th>
                <th>Kiosk</th>
                <th>City</th>
                <th>Status</th>
                <th style={{ textAlign: "end" }}>Revenue today</th>
                <th style={{ textAlign: "end" }}>Orders</th>
                <th style={{ width: 160 }}>Inventory</th>
                <th style={{ width: 160 }}>Waste</th>
                <th style={{ textAlign: "end" }}>Margin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(k => (
                <tr key={k.id} className="row-click" onClick={() => onPick(k)}>
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
              <th style={{ width: 32 }}></th>
              <th>{ar ? "الكشك" : "Kiosk"}</th>
              <th>{ar ? "المدينة" : "City"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "إيرادات اليوم" : "Revenue today"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الطلبات" : "Orders"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "متوسط الطلب" : "Avg order"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الهامش" : "Margin"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الهدر" : "Waste"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الموظفون" : "Staff"}</th>
              <th>{ar ? "اتجاه ٧ أيام" : "7-day"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MOCK.kiosks.map(k => (
              <tr key={k.id} className="row-click" onClick={onPick}>
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
  const stockRows = odooKioskStockReconciliationRows(bootstrap, selected) || MOCK.kioskStockDetails[selected.id] || MOCK.kioskStockDetails["K-01"];
  const orders = odooPosOrderRows(bootstrap).filter((order) => matchesKiosk(order.kioskId || order.kiosk, selected));
  const visibleOrders = orders.length ? orders : MOCK.posOrders.slice(0, 4);
  const closing = odooClosingRows(bootstrap).find((c) => matchesKiosk(c.kioskId || c.kioskName, selected));
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
              <th>{ar ? "المكون / البند" : "Ingredient / item"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "افتتاح" : "Opening stock"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "مستلم اليوم" : "Received today"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "استهلاك POS" : "Expected consumed from POS sales"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "هدر مسجل" : "Recorded waste"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "متبقي متوقع" : "Expected remaining"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "عد فعلي" : "Actual counted"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الفرق" : "Variance"}</th>
              <th>{ar ? "الحالة" : "Status"}</th>
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
            <th>{ar ? "الوقت" : "Time"}</th>
            <th>{ar ? "الطلب" : "Order"}</th>
            <th>{ar ? "الكاشير" : "Cashier"}</th>
            <th>{ar ? "المنتج" : "Product sold"}</th>
            <th>{ar ? "الدفع" : "Payment method"}</th>
            <th style={{ textAlign: "end" }}>{ar ? "المبلغ" : "Amount"}</th>
            <th>{ar ? "الحالة" : "Status"}</th>
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
          {[
            ["07:00", "Opening stock count", "Posted by cashier", "stock.quant"],
            ["09:15", "Transfer received", "Main Warehouse -> kiosk location", "stock.picking"],
            ["14:42", "Recipe deduction", "10 x Orange Juice 350ml", "bayaan.consumption.ledger"],
            ["15:10", "Waste recorded", "Wrong order / spill", "bayaan.waste.entry"],
          ].map(([time, action, detail, source]) => (
            <tr key={`${time}-${action}`}>
              <td className="t-num muted" style={{ width: 72 }}>{time}</td>
              <td>{action}</td>
              <td className="muted">{detail}</td>
              <td><span className="badge">{source}</span></td>
            </tr>
          ))}
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
        <KPI label={ar ? "مستودعات" : "Warehouses"} value={String(setup.warehouses?.length || 0)} footer={enabled ? "stock.warehouse" : "demo fallback"}/>
        <KPI label={ar ? "مواقع أكشاك" : "Kiosk locations"} value={String(kioskLocations.length)} footer="stock.location"/>
        <KPI label={ar ? "نقاط بيع" : "POS configs"} value={String(setup.pos_configs?.length || 0)} footer="pos.config"/>
        <KPI label={ar ? "المصدر" : "Source"} value={enabled ? "Engine" : "Demo"} footer={sync?.status === "error" ? "sync error" : sync?.status || "ready"}/>
      </div>

      <div className="card card-pad" style={{ background: enabled ? "var(--pos-soft)" : "var(--warn-soft)", borderColor: "transparent" }}>
        <div className="between" style={{ gap: 14, alignItems: "flex-start" }}>
          <div className="ai-block" style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{enabled ? "Bayaan is reading the source engine" : "Backend engine is not configured in this browser session"}</div>
            <div className="t-small muted" style={{ lineHeight: 1.6 }}>
              {enabled
                ? "Creating warehouses or kiosks here writes real inventory, POS, and Bayaan records in the single backend database."
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
              <th>Type</th>
              <th>Name</th>
              <th>Engine record</th>
              <th>Stock location</th>
              <th style={{ textAlign: "end" }}>Qty</th>
              <th style={{ textAlign: "end" }}>Reserved / policy</th>
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

      <div className="card card-pad" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
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
                <th>{ar ? "الوقت" : "Time"}</th>
                <th>{ar ? "الكشك" : "Kiosk"}</th>
                <th>{ar ? "الكاشير" : "Cashier"}</th>
                <th>{ar ? "المنتج" : "Product sold"}</th>
                <th>{ar ? "الدفع" : "Payment"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "المبلغ" : "Amount"}</th>
                <th>{ar ? "الحالة" : "Status"}</th>
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
function InventoryScreen({ lang, bootstrap, sourceOfTruth }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const [busyTransfer, setBusyTransfer] = React.useState("");
  const inv = odooInventoryRows(bootstrap);
  const baseTransfers = odooTransferRows(bootstrap);
  const [draftTransfers, setDraftTransfers] = React.useState([]);
  const [purchaseDrafts, setPurchaseDrafts] = React.useState([]);
  const [transferModalOpen, setTransferModalOpen] = React.useState(false);
  const [transferDraft, setTransferDraft] = React.useState({ kiosk: "", item: "", qty: "" });
  React.useEffect(() => { setDraftTransfers([]); }, [bootstrap]);
  const transfers = [...draftTransfers, ...baseTransfers];
  const suggestions = odooTransferSuggestionRows(bootstrap);
  const kioskRows = odooKioskRows(bootstrap);
  const lowCount = inv.filter(i => i.status !== "ok").length;
  React.useEffect(() => {
    setTransferDraft((draft) => ({
      kiosk: draft.kiosk || kioskRows[0]?.id || "K-01",
      item: draft.item || inv[0]?.item || "",
      qty: draft.qty || "",
    }));
  }, [bootstrap]);

  const exportInventory = () => {
    const rows = [
      ["Item", "Category", "Stock", "Unit", "Reorder at", "Days of cover", "Supplier", "Status"],
      ...inv.map((item) => [item.item, item.category, item.stock, item.unit, item.reorder, item.days, item.supplier, item.status]),
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

  const createDraftPo = (item = inv.find((row) => row.status !== "ok") || inv[0]) => {
    if (!item) return;
    const qty = Math.max(Number(item.reorder || 0) * 2 - Number(item.stock || 0), Number(item.reorder || 0), 1);
    const draft = {
      id: `PO-DRAFT-${Date.now()}`,
      supplier: item.supplier || "Supplier",
      items: `${item.item} ${Math.round(qty)} ${item.unit || ""}`.trim(),
      value: Math.round(qty * 7_500),
      status: "draft",
    };
    setPurchaseDrafts((rows) => [draft, ...rows]);
    showToast(ar ? "Purchase draft created" : `Purchase draft created - ${draft.items}`, "success");
  };

  const reviewAndApprovePo = () => {
    const lowItems = inv.filter((row) => row.status !== "ok").slice(0, 4);
    if (!lowItems.length) {
      showToast(ar ? "No reorder items" : "No reorder items", "info");
      return;
    }
    const suppliers = Array.from(new Set(lowItems.map((row) => row.supplier || "Supplier"))).join(", ");
    const draft = {
      id: `PO-APPROVED-${Date.now()}`,
      supplier: suppliers,
      items: lowItems.map((row) => row.item).join(", "),
      value: 2_950_000,
      status: "approved",
    };
    setPurchaseDrafts((rows) => [draft, ...rows]);
    showToast(ar ? "Suggested PO approved" : "Suggested PO approved and queued", "success");
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
        });
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
      showToast(ar ? "Transfer drafted" : `Transfer drafted - ${transferDraft.item} to ${kioskName}`, "success");
    } catch (error) {
      showToast(error?.message || "Could not create transfer", "warn");
    } finally {
      setBusyTransfer("");
    }
  };
  const createSuggestedTransfer = async (suggestion) => {
    const key = `${suggestion.kiosk}-${suggestion.item}`;
    setBusyTransfer(key);
    try {
      let created = null;
      if (sourceOfTruth?.enabled) {
        created = await sourceOfTruth.submitStockTransfer({
          kioskId: suggestion.kioskId || transferKioskId(suggestion.kiosk),
          itemId: suggestion.itemId || suggestion.item,
          qty: suggestion.qtyValue || transferQtyValue(suggestion.qty),
          uom: suggestion.uom || transferQtyUnit(suggestion.qty),
        });
      }
      const draftId = created?.name || `DRAFT-${transferKioskId(suggestion.kiosk)}-${slugify(suggestion.item)}`;
      setDraftTransfers((rows) => [
        {
          id: draftId,
          from: "Main Warehouse",
          to: suggestion.kiosk,
          items: `${suggestion.item} ${suggestion.qty}`,
          eta: created?.state ? "engine" : "draft",
          status: created?.state || "draft",
        },
        ...rows.filter((row) => row.id !== draftId),
      ]);
      showToast(
        ar
          ? `تم تجهيز تحويل ${suggestion.item} إلى ${suggestion.kiosk}`
          : `Draft transfer prepared - ${suggestion.item} to ${suggestion.kiosk}`,
        "success",
      );
    } catch (error) {
      showToast(error?.message || "Could not create transfer", "warn");
    } finally {
      setBusyTransfer("");
    }
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "بنود متابعة" : "SKUs tracked"} value="142"/>
        <KPI label={ar ? "تحت الحد الأدنى" : "Below reorder"} value={lowCount} delta={ar ? "حرج" : "needs PO"} deltaDir="down"/>
        <KPI label={ar ? "قيمة المخزون" : "Stock value"} value={fmtMoney(284200)}/>
        <KPI label={ar ? "متوسط أيام التغطية" : "Avg days of cover"} value="4.6" sub={ar ? "يوم" : "days"}/>
      </div>

      <div className="card card-pad" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
        <div className="row" style={{ gap: 10 }}>
          <AITag>{ar ? "إجراء مقترح" : "Suggested"}</AITag>
          <div className="ai-block" style={{ flex: 1, paddingLeft: 14 }}>
            <div style={{ fontSize: 14, color: "var(--ink-1)" }}>
              {ar
                ? <>تم صياغة طلب شراء بقيمة <strong>د.ع ٢٫٩٥ مليون</strong> يغطي ٤ بنود تحت الحد الأدنى. إيصال متوقع: <strong>غداً ٠٧:٠٠</strong>.</>
                : <>An <strong>IQD 2.95M</strong> draft PO covers 4 below-reorder items. Expected delivery: <strong>tomorrow 07:00</strong> from Baghdad Dairy &amp; Mesopotamia Foods.</>
              }
            </div>
          </div>
          <button className="btn btn-accent" onClick={reviewAndApprovePo}>{ar ? "مراجعة وموافقة" : "Review & approve"}</button>
        </div>
      </div>

      {purchaseDrafts.length > 0 && (
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "Purchase drafts" : "Purchase drafts"}</div>
              <div className="t-small subtle">{ar ? "Queued from reorder decisions" : "Queued from reorder decisions"}</div>
            </div>
            <span className="badge">{purchaseDrafts.length} queued</span>
          </div>
          <table className="tbl">
            <tbody>
              {purchaseDrafts.map((draft) => (
                <tr key={draft.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{draft.supplier}</div>
                    <div className="t-small faint">{draft.id}</div>
                  </td>
                  <td className="muted">{draft.items}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(draft.value)}</td>
                  <td style={{ textAlign: "end" }}><span className={`badge ${draft.status === "approved" ? "badge-pos" : "badge-warn"}`}>{draft.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "تحويلات قيد التنفيذ" : "Pending transfers"}</div>
              <div className="t-small subtle">{ar ? "من المستودع إلى موقع مخزون الكشك" : "Warehouse to kiosk stock locations"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setTransferModalOpen(true)} style={{ height: 28, fontSize: 12 }}>
              <Icon name="truck" size={12}/>{ar ? "تحويل جديد" : "New transfer"}
            </button>
          </div>
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
                  <td><span className={`badge ${transfer.status === "draft" ? "badge-warn" : "badge-pos"}`}>{transfer.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "اقتراحات الغد" : "Suggested transfers for tomorrow"}</div>
              <div className="t-small subtle">{ar ? "محسوبة من المبيعات والاستهلاك والحد الأدنى" : "From sales pace, consumption, and safety stock"}</div>
            </div>
            <span className="badge badge-ai">AI reads verified data</span>
          </div>
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

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 28, fontSize: 12 }}>{ar ? "كل الفئات" : "All categories"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل المواقع" : "All locations"} <Icon name="chevDown" size={11}/></button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" onClick={exportInventory} style={{ height: 28, fontSize: 12 }}><Icon name="download" size={12}/>{ar ? "تصدير" : "Export"}</button>
            <button className="btn btn-ghost" onClick={() => createDraftPo()} style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "طلب شراء" : "New PO"}</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{ar ? "البند" : "Item"}</th>
              <th>{ar ? "الفئة" : "Category"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "المخزون" : "Stock"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "نقطة الطلب" : "Reorder at"}</th>
              <th style={{ width: 140 }}>{ar ? "أيام التغطية" : "Days of cover"}</th>
              <th>{ar ? "المورد" : "Supplier"}</th>
              <th style={{ textAlign: "end" }}></th>
            </tr>
          </thead>
          <tbody>
            {inv.map((it, i) => {
              const pct = Math.min(it.days / 14, 1);
              const tone = it.status === "crit" ? "crit" : it.status === "low" ? "warn" : "ok";
              return (
                <tr key={i}>
                  <td><span style={{ fontWeight: 500 }}>{it.item}</span></td>
                  <td className="muted">{it.category}</td>
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
                      ? <button className="btn btn-ghost" onClick={() => createDraftPo(it)} style={{ height: 24, fontSize: 11 }}>{ar ? "اطلب" : "Reorder"}</button>
                      : <Icon name="dots" size={14} style={{ color: "var(--ink-3)" }}/>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)}
        title={ar ? "New stock transfer" : "New stock transfer"}
        sub={ar ? "Warehouse to kiosk stock location" : "Warehouse to kiosk stock location"}>
        <form onSubmit={createManualTransfer} className="col" style={{ gap: 10 }}>
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
              <th style={{ width: 30 }}></th>
              <th>{ar ? "الوقت" : "Time"}</th>
              <th>{ar ? "الكشك" : "Kiosk"}</th>
              <th>{ar ? "البند" : "Item"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الكمية" : "Qty"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "التكلفة" : "Cost"}</th>
              <th>{ar ? "السبب" : "Reason"}</th>
              <th></th>
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
              <th style={{ width: 24 }}></th>
              <th>{ar ? "الكشك" : "Kiosk"}</th>
              <th>{ar ? "الكاشير" : "Cashier"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "المبيعات" : "Sales"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "نقد متوقع" : "Cash expected"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "نقد فعلي" : "Cash counted"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "مدفوعات رقمية" : "Digital payments"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "فرق النقد" : "Cash variance"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "فرق المخزون" : "Stock variance"}</th>
              <th>{ar ? "الحالة" : "Status"}</th>
              <th>{ar ? "التحقيق" : "Investigation"}</th>
              <th style={{ width: 24 }}></th>
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
                  <tr className="row-click" onClick={() => setExpandedId(expanded ? null : c.id)}
                    data-motion={flashId === c.id ? "approving" : undefined}>
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
                    <td><Icon name={expanded ? "chevDown" : "chevRight"} size={11}/></td>
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
                                      <th>{ar ? "البند" : "Item"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "افتتاح" : "Opening"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "مستلم" : "Received"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "استهلاك" : "Consumed"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "هدر" : "Waste"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "متوقع" : "Expected"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "فعلي" : "Counted"}</th>
                                      <th style={{ textAlign: "end" }}>{ar ? "فارق" : "Variance"}</th>
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
                                  <th>{ar ? "البند" : "Item"}</th>
                                  <th style={{ textAlign: "end" }}>{ar ? "متوقع" : "Expected"}</th>
                                  <th style={{ textAlign: "end" }}>{ar ? "فعلي" : "Counted"}</th>
                                  <th style={{ textAlign: "end" }}>{ar ? "فرق" : "Variance"}</th>
                                  <th style={{ textAlign: "end" }}>{ar ? "قيمة الفرق" : "Variance value"}</th>
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

function ProductsScreen({ lang, bootstrap, sourceOfTruth }) {
  const ar = lang === "ar";
  const catalog = useCatalog();
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const recipeRows = odooRecipeMarginRows(bootstrap);
  const recipeCoverage = React.useMemo(
    () => new Map(recipeRows.map((row) => [recipeProductKey(row.product), row])),
    [recipeRows],
  );

  const products = catalog.state.products;
  const productHasRecipe = (product) => (
    Boolean(catalog.state.recipes[product.id]?.lines?.length)
    || recipeCoverage.has(recipeProductKey(product.name))
  );
  const filtered = products
    .filter((p) => filter === "all" || p.category === filter)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const totals = {
    total: products.length,
    withRecipe: products.filter(productHasRecipe).length,
    withImage: products.filter((p) => catalog.state.imagesBySlug[p.image] || p.image).length,
    customImages: Object.keys(catalog.state.imagesBySlug).length,
  };

  const startNew = () => {
    const id = catalog.nextId();
    const name = "New product";
    const slug = slugify(name) + "-" + id;
    const draft = { id, category: "Hot Coffee", name, image: slug, price: 5_000, sizes: ["S"] };
    catalog.upsertProduct(draft);
    setEditingId(id);
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
              <th>{ar ? "المنتج" : "Product"}</th>
              <th>{ar ? "إصدار الوصفة" : "Recipe version"}</th>
              <th>{ar ? "المكونات" : "Ingredients / packaging"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "السعر" : "Price"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "التكلفة" : "Cost"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الهامش" : "Gross margin"}</th>
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
              <th style={{ width: 56 }}></th>
              <th>{ar ? "المنتج" : "Product"}</th>
              <th>{ar ? "الفئة" : "Category"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "السعر" : "Price"}</th>
              <th>{ar ? "الأحجام" : "Sizes"}</th>
              <th>{ar ? "الوصفة" : "Recipe"}</th>
              <th style={{ width: 100, textAlign: "end" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const recipe = catalog.state.recipes[p.id];
              const engineRecipe = recipeCoverage.get(recipeProductKey(p.name));
              const lineCount = recipe?.lines?.length ?? 0;
              const isEditing = editingId === p.id;
              return (
                <React.Fragment key={p.id}>
                  <tr className="row-click">
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
                        <ProductEditor product={p} ar={ar} sourceOfTruth={sourceOfTruth} onClose={() => setEditingId(null)}/>
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
    </div>
  );
}

function ProductEditor({ product, ar, sourceOfTruth, onClose }) {
  const catalog = useCatalog();
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState(product);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const recipeLines = catalog.state.recipes[product.id]?.lines ?? [];
  const [lines, setLines] = React.useState(recipeLines);

  React.useEffect(() => { setDraft(product); }, [product.id]);

  const ingredientOptions = React.useMemo(
    () => MOCK.inventory.map((it) => ({ value: it.item, label: it.item, unit: it.unit })),
    [],
  );

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
function SuppliersScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const enginePurchaseOrders = odooPurchaseOrderRows(bootstrap);
  const [purchaseOrders, setPurchaseOrders] = useState(enginePurchaseOrders);
  const [supplierRows, setSupplierRows] = useState(MOCK.suppliers);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [poDraft, setPoDraft] = useState({
    supplier: MOCK.suppliers[0]?.name || "",
    items: "Milk, cream, yogurt",
    value: "2950000",
  });
  const [supplierDraft, setSupplierDraft] = useState({
    name: "",
    category: "Produce",
    ontime: "95",
  });
  React.useEffect(() => { setPurchaseOrders(enginePurchaseOrders); }, [bootstrap]);
  const openPurchaseOrders = purchaseOrders.filter((po) => !["done", "cancel", "cancelled"].includes(String(po.status).toLowerCase()));
  const supplierCategories = ["all", ...Array.from(new Set(supplierRows.map((supplier) => supplier.category)))];
  const filteredSuppliers = categoryFilter === "all"
    ? supplierRows
    : supplierRows.filter((supplier) => supplier.category === categoryFilter);
  const openPoModal = (supplier = supplierRows[0]) => {
    setPoDraft((draft) => ({ ...draft, supplier: supplier?.name || draft.supplier }));
    setPoModalOpen(true);
  };
  const submitPo = (event) => {
    event.preventDefault();
    const value = Number(poDraft.value || 0);
    if (!poDraft.supplier || !poDraft.items.trim() || value <= 0) {
      showToast(ar ? "PO needs supplier, items, and value" : "PO needs supplier, items, and value", "warn");
      return;
    }
    const next = {
      po: `PO-DRAFT-${String(purchaseOrders.length + 1).padStart(3, "0")}`,
      supplier: poDraft.supplier,
      items: poDraft.items.trim(),
      value,
      status: "draft",
    };
    setPurchaseOrders((rows) => [next, ...rows]);
    setPoModalOpen(false);
    showToast(ar ? "Purchase order drafted" : `Purchase order drafted - ${next.supplier}`, "success");
  };
  const submitSupplier = (event) => {
    event.preventDefault();
    if (!supplierDraft.name.trim()) {
      showToast(ar ? "Supplier name is required" : "Supplier name is required", "warn");
      return;
    }
    const next = {
      name: supplierDraft.name.trim(),
      category: supplierDraft.category,
      spend30: 0,
      ontime: Math.max(0, Math.min(100, Number(supplierDraft.ontime || 95))),
      lastOrder: "New",
      status: "good",
    };
    setSupplierRows((rows) => [next, ...rows]);
    setSupplierDraft({ name: "", category: "Produce", ontime: "95" });
    setSupplierModalOpen(false);
    showToast(ar ? "Supplier added" : `Supplier added - ${next.name}`, "success");
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "موردون نشطون" : "Active suppliers"} value={String(supplierRows.length)}/>
        <KPI label={ar ? "إنفاق ٣٠ يوم" : "30-day spend"} value={fmtMoney(supplierRows.reduce((sum, supplier) => sum + Number(supplier.spend30 || 0), 0))} delta="4.2%" deltaDir="up"/>
        <KPI label={ar ? "وصول في الموعد" : "On-time delivery"} value="93%" delta="2 pts" deltaDir="down"/>
        <KPI label={ar ? "طلبات مفتوحة" : "Open POs"} value={String(openPurchaseOrders.length)} footer={ar ? "بيانات الشراء" : "purchase.order"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "طلبات الشراء المفتوحة" : "Open purchase orders"}</div>
              <div className="t-small subtle">{ar ? "المشتريات التي تغير تكلفة المنتج" : "Purchases that change ingredient cost"}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => openPoModal()} style={{ height: 28, fontSize: 12 }}>
              <Icon name="plus" size={12}/>{ar ? "طلب شراء" : "New PO"}
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>{ar ? "الطلب" : "PO"}</th>
                <th>{ar ? "المورد" : "Supplier"}</th>
                <th>{ar ? "بنود" : "Items"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "القيمة" : "Value"}</th>
                <th>{ar ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.po}>
                  <td className="t-num">{po.po}</td>
                  <td>{po.supplier}</td>
                  <td className="muted">{po.items}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{fmtMoney(po.value)}</td>
                  <td><span className={`badge ${po.status === "purchase" || po.status === "approved" ? "badge-pos" : po.status === "draft" || po.status === "sent" ? "badge-warn" : ""}`}>{po.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="between" style={{ padding: "14px 18px" }}>
            <div>
              <div className="t-h2">{ar ? "تغيرات سعر المكونات" : "Ingredient price changes"}</div>
              <div className="t-small subtle">{ar ? "الأثر على هامش المنتجات" : "Margin impact by recipe component"}</div>
            </div>
            <span className="badge badge-ai">margin watch</span>
          </div>
          <table className="tbl">
            <tbody>
              {[
                ["Pistachio paste", "+18%", "Pistachio Cake", "-6.0 pts"],
                ["Milk (whole) 1L", "+7%", "Latte / Cappuccino", "-1.2 pts"],
                ["Oranges", "-4%", "Orange Juice 350ml", "+0.9 pts"],
                ["Cups 12oz", "+3%", "All drinks", "-0.4 pts"],
              ].map(([item, change, product, impact]) => (
                <tr key={item}>
                  <td style={{ fontWeight: 500 }}>{item}</td>
                  <td className={String(change).startsWith("+") ? "delta-neg t-num" : "delta-pos t-num"}>{change}</td>
                  <td className="muted">{product}</td>
                  <td className="t-num" style={{ textAlign: "end" }}>{impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "الموردون" : "Suppliers"}</div>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={{ height: 28, fontSize: 12, width: 150 }}>
              {supplierCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={() => setSupplierModalOpen(true)} style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "مورد" : "Add"}</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{ar ? "المورد" : "Supplier"}</th>
              <th>{ar ? "الفئة" : "Category"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "إنفاق ٣٠ يوم" : "30-day spend"}</th>
              <th style={{ width: 140 }}>{ar ? "الالتزام" : "On-time"}</th>
              <th>{ar ? "آخر طلب" : "Last order"}</th>
              <th style={{ textAlign: "end" }}></th>
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
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(s.spend30)}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "var(--surface-sunk)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${s.ontime}%`, background: s.ontime > 95 ? "var(--pos)" : s.ontime > 88 ? "var(--ink-1)" : "var(--warn)", borderRadius: 3 }}/>
                    </div>
                    <span className="t-num" style={{ fontSize: 12, minWidth: 32, textAlign: "end" }}>{s.ontime}%</span>
                  </div>
                </td>
                <td className="muted">{s.lastOrder}</td>
                <td style={{ textAlign: "end" }}>
                  <button className="btn btn-ghost" onClick={() => openPoModal(s)} style={{ height: 24, fontSize: 11 }}>{ar ? "طلب جديد" : "New PO"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={poModalOpen} onClose={() => setPoModalOpen(false)}
        title={ar ? "New purchase order" : "New purchase order"}
        sub={ar ? "Draft supplier order" : "Draft supplier order"}>
        <form onSubmit={submitPo} className="col" style={{ gap: 10 }}>
          <select className="input" value={poDraft.supplier} onChange={(event) => setPoDraft((draft) => ({ ...draft, supplier: event.target.value }))}>
            {supplierRows.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>)}
          </select>
          <input className="input" value={poDraft.items} onChange={(event) => setPoDraft((draft) => ({ ...draft, items: event.target.value }))} placeholder="Items"/>
          <input className="input" value={poDraft.value} onChange={(event) => setPoDraft((draft) => ({ ...draft, value: event.target.value }))} placeholder="Value IQD" inputMode="numeric"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPoModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create PO</button>
          </div>
        </form>
      </Modal>

      <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}
        title={ar ? "Add supplier" : "Add supplier"}
        sub={ar ? "Supplier health starts in review" : "Supplier health starts in review"}>
        <form onSubmit={submitSupplier} className="col" style={{ gap: 10 }}>
          <input className="input" value={supplierDraft.name} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Supplier name"/>
          <input className="input" value={supplierDraft.category} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Category"/>
          <input className="input" value={supplierDraft.ontime} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, ontime: event.target.value }))} placeholder="On-time %" inputMode="numeric"/>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setSupplierModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add supplier</button>
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
                <th>{ar ? "الكاشير" : "Cashier"}</th>
                <th>{ar ? "الكشك" : "Kiosk"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "المبيعات" : "Sales"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "فرق النقد" : "Cash shortage"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "إلغاء/مرتجع" : "Void/refund"}</th>
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
              <th>{ar ? "الموظف" : "Staff member"}</th>
              <th>{ar ? "الدور" : "Role"}</th>
              <th>{ar ? "الكشك" : "Kiosk"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "ساعات الشهر" : "Hours (mo)"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الراتب" : "Salary"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الحالة" : "Status"}</th>
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

function HRPayrollScreen({ lang, bootstrap }) {
  const ar = lang === "ar";
  const { showToast } = useToast();
  const cashierRows = odooCashierPerformanceRows(bootstrap);
  const underReview = cashierRows.filter((row) => row.shortage < 0).length;
  const [roleFilter, setRoleFilter] = useState("all");
  const [kioskFilter, setKioskFilter] = useState("all");
  const [payrollStatus, setPayrollStatus] = useState("draft");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState({ name: "", category: "Operations", amount: "" });
  const [adjustmentDraft, setAdjustmentDraft] = useState({
    staff: MOCK.staff[2]?.name || "",
    type: "deduction",
    amount: "",
    reason: "",
  });
  const [expenseRows, setExpenseRows] = useState([
    { name: "Cleaning supplies", category: "Operations", amount: 118_000 },
    { name: "Generator fuel", category: "Utilities", amount: 242_000 },
    { name: "Staff meal allowance", category: "Staff", amount: 96_000 },
    { name: "Kiosk repair", category: "Maintenance", amount: 175_000 },
  ]);
  const [adjustments, setAdjustments] = useState([
    { staff: "Karim Fahmy", type: "deduction", amount: 32_000, reason: "Cash shortage pending review", status: "hold" },
    { staff: "Yusuf Saleh", type: "advance", amount: 150_000, reason: "Salary advance", status: "approved" },
    { staff: "Sara Younis", type: "deduction", amount: 110_000, reason: "Unpaid leave", status: "approved" },
    { staff: "Rashid Al-Tikriti", type: "bonus", amount: 85_000, reason: "Warehouse overtime", status: "approved" },
  ]);
  const attendanceRows = [
    { staff: "Sara Younis", kiosk: "K-04", issue: "Leave", hours: 88, impact: -110_000, status: "approved" },
    { staff: "Karim Fahmy", kiosk: "K-07", issue: "Cash shortage review", hours: 168, impact: -32_000, status: "hold" },
    { staff: "Rashid Al-Tikriti", kiosk: "Central", issue: "Overtime", hours: 184, impact: 85_000, status: "approved" },
    { staff: "Maya Ahmed", kiosk: "K-01", issue: "Normal shift", hours: 162, impact: 0, status: "ready" },
  ];
  const roles = ["all", ...Array.from(new Set(MOCK.staff.map((person) => person.role)))];
  const kiosks = ["all", ...Array.from(new Set(MOCK.staff.map((person) => person.kiosk)))];
  const payrollRows = useMemo(() => MOCK.staff.map((person) => {
    const personAdjustments = adjustments.filter((item) => item.staff === person.name);
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
  }), [adjustments]);
  const filteredRoster = payrollRows.filter((person) => (
    (roleFilter === "all" || person.role === roleFilter)
    && (kioskFilter === "all" || person.kiosk === kioskFilter)
  ));
  const activeStaff = MOCK.staff.filter((person) => person.status !== "leave").length;
  const grossPayroll = payrollRows.reduce((sum, person) => sum + person.salary, 0);
  const netPayroll = payrollRows.reduce((sum, person) => sum + person.netPay, 0);
  const adjustmentTotal = payrollRows.reduce((sum, person) => sum + person.bonus + person.overtimePay - person.advance - person.deduction, 0);
  const payrollReviewCount = payrollRows.filter((person) => person.payrollStatus === "review").length;
  const avgWeeklyHours = Math.round(MOCK.staff.reduce((sum, person) => sum + person.hours, 0) / Math.max(MOCK.staff.length, 1) / 4);
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

  const submitAdjustment = (event) => {
    event.preventDefault();
    const amount = Number(adjustmentDraft.amount || 0);
    if (!adjustmentDraft.staff || amount <= 0) {
      showToast("Adjustment needs staff and amount", "warn");
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
    setAdjustmentDraft({ staff: MOCK.staff[2]?.name || "", type: "deduction", amount: "", reason: "" });
    setAdjustmentModalOpen(false);
    showToast("Payroll adjustment added", "success");
  };

  const reviewPayroll = () => {
    setPayrollStatus("reviewed");
    showToast("Payroll marked reviewed", "success");
  };

  const approvePayroll = () => {
    if (payrollReviewCount > 0) {
      showToast("Resolve held payroll rows first", "warn");
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
        <KPI label={ar ? "Avg weekly hrs" : "Avg weekly hrs"} value={String(avgWeeklyHours)} delta="2h" deltaDir="up"/>
        <KPI label={ar ? "Payroll review" : "Payroll review"} value={String(payrollReviewCount + underReview)} footer={ar ? "held rows" : "held rows"}/>
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
                <th>{ar ? "Cashier" : "Cashier"}</th>
                <th>{ar ? "Kiosk" : "Kiosk"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Sales" : "Sales"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Cash shortage" : "Cash shortage"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Void/refund" : "Void/refund"}</th>
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
                <th>{ar ? "Staff" : "Staff"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Base" : "Base"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Adj." : "Adj."}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Net pay" : "Net pay"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
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
                <th>{ar ? "Staff" : "Staff"}</th>
                <th>{ar ? "Issue" : "Issue"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Impact" : "Impact"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
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
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{ar ? "Staff member" : "Staff member"}</th>
              <th>{ar ? "Role" : "Role"}</th>
              <th>{ar ? "Kiosk" : "Kiosk"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "Hours (mo)" : "Hours (mo)"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "Net payroll" : "Net payroll"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "Status" : "Status"}</th>
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
            {MOCK.staff.map((person) => <option key={person.name} value={person.name}>{person.name}</option>)}
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
              <th>{ar ? "المزود" : "Provider"}</th>
              <th>{ar ? "الفئة" : "Category"}</th>
              <th>{ar ? "التسوية" : "Settlement"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الإجمالي" : "Total"}</th>
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
              <th>{ar ? "التقرير" : "Report"}</th>
              <th>{ar ? "ماذا يقرر المالك؟" : "Owner decision"}</th>
              <th>{ar ? "المصادر" : "Traceable sources"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "إشارة اليوم" : "Today signal"}</th>
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
  { id: "sales", label: "Sales & POS", icon: "receipt" },
  { id: "closing", label: "Daily Close", icon: "receipt", badge: 3 },
  { id: "waste", label: "Waste & Loss", icon: "trash", badge: 3 },
  { section: "STOCK" },
  { id: "inventory", label: "Stock & Allocation", icon: "box" },
  { id: "warehouses", label: "Warehouses", icon: "box" },
  { id: "products", label: "Products & Recipes", icon: "coffee" },
  { id: "suppliers", label: "Purchases & Suppliers", icon: "truck" },
  { section: "PEOPLE & MONEY" },
  { id: "staff", label: "Staff", icon: "users" },
  { id: "finance", label: "Finance", icon: "cash" },
  { section: "ANALYTICS" },
  { id: "reports", label: "Reports", icon: "chart" },
];

const ADMIN_NAV_AR = {
  overview: "مركز اليوم",
  insights: "تحليلات الذكاء",
  kiosks: "الأكشاك",
  sales: "المبيعات ونقاط البيع",
  warehouses: "المستودعات",
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
  const isAr = lang === "ar";
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

      {ADMIN_NAV.map((it, i) => {
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
          <Avatar name="Layla Hassan" size={20}/>
          <div style={{ flex: 1, lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{isAr ? "ليلى حسن" : "Layla Hassan"}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{isAr ? "المدير" : "Owner"}</div>
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

function AdminPanel({ lang }) {
  const [active, setActive] = useState("overview");
  const [selectedKiosk, setSelectedKiosk] = useState(MOCK.kiosks[0]);
  const sourceOfTruth = useMemo(() => createSourceOfTruthGateway(), []);
  const [sync, setSync] = useState({
    status: sourceOfTruth.enabled ? "syncing" : "demo",
    bootstrap: null,
    warehouseSetup: DEMO_WAREHOUSE_SETUP,
    error: "",
  });

  const refreshOdoo = async () => {
    if (!sourceOfTruth.enabled) {
      setSync({ status: "demo", bootstrap: null, warehouseSetup: DEMO_WAREHOUSE_SETUP, error: "" });
      return;
    }
    setSync((current) => ({ ...current, status: "syncing", error: "" }));
    try {
      const [bootstrap, warehouseSetup] = await Promise.all([
        sourceOfTruth.getChainBootstrap(),
        sourceOfTruth.getWarehouseSetup(),
      ]);
      setSync({ status: "synced", bootstrap, warehouseSetup, error: "" });
    } catch (error) {
      setSync((current) => ({ ...current, status: "error", error: compactError(error) }));
    }
  };

  useEffect(() => {
    void refreshOdoo();
  }, [sourceOfTruth]);

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
    inventory: <InventoryScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth}/>,
    products: <ProductsScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth}/>,
    closing: <ClosingScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth}/>,
    waste: <WasteScreen lang={lang} bootstrap={sync.bootstrap}/>,
    suppliers: <SuppliersScreen lang={lang} bootstrap={sync.bootstrap}/>,
    staff: <HRPayrollScreen lang={lang} bootstrap={sync.bootstrap}/>,
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
    inventory: { en: "Stock & Allocation", ar: "المخزون والتوزيع", sub: { en: "Warehouse stock, kiosk stock, transfers, low-stock items, and tomorrow suggestions", ar: "مخزون المستودع والأكشاك والتحويلات والتنبيهات واقتراحات الغد" } },
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <AdminTopBar title={lang === "ar" ? t.ar : t.en} sub={lang === "ar" ? t.sub.ar : t.sub.en} lang={lang}
          right={(
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${sync.status === "synced" ? "badge-pos" : sync.status === "error" ? "badge-crit" : "badge-warn"}`}>
                <span className={`dot ${sync.status === "synced" ? "pos" : sync.status === "error" ? "crit" : "warn"}`}></span>
                {sync.status === "synced" ? "Engine synced" : sync.status === "error" ? "Engine error" : sourceOfTruth.enabled ? "Engine syncing" : "Demo mode"}
              </span>
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
  const [screen, setScreen] = useStatePOS("login");
  const [cart, setCart] = useStatePOS([]);
  const [tender, setTender] = useStatePOS(null);

  const goSale = () => { setScreen("sale"); setCart([]); };
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

  return (
    <div className="tablet-stage" style={{ gap: 24, padding: 24 }}>
      <div className="tablet">
        <div className="tablet-cam"></div>
        <div className="tablet-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
          {screen === "login" && <POSLogin lang={lang} onIn={goSale}/>}
          {screen === "sale" && <POSSale lang={lang}
            cart={cart} setCart={setCart} addItem={wrappedAdd}
            subTotal={subTotal} vat={vat} total={total}
            onCharge={() => setScreen("payment")}
            onWaste={() => setScreen("waste")}
            onLogout={() => setScreen("login")}
          />}
          {screen === "payment" && <POSPayment lang={lang}
            total={total} cart={cart}
            onTender={(t) => setTender(t)}
            tender={tender}
            onDone={() => { setScreen("sale"); setCart([]); setTender(null); }}
            onBack={() => setScreen("sale")}
          />}
          {screen === "waste" && <POSWaste lang={lang}
            onDone={() => setScreen("sale")} onBack={() => setScreen("sale")}/>}
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
function POSLogin({ lang, onIn }) {
  const ar = lang === "ar";
  const staff = [
    { name: "Maya Ahmed", arName: "مايا أحمد", role: "Cashier", arRole: "كاشير" },
    { name: "Yusuf Saleh", arName: "يوسف صالح", role: "Barista", arRole: "باريستا" },
    { name: "Omar Khaled", arName: "عمر خالد", role: "Supervisor", arRole: "مشرف" },
    { name: "Sara Younis", arName: "سارة يونس", role: "Barista", arRole: "باريستا" },
  ];
  const [picked, setPicked] = useStatePOS(null);
  const [pin, setPin] = useStatePOS("");

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
                <button key={n} onClick={() => setPin(p => (p + n).slice(0, 4))}
                  style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{n}</button>
              ))}
              <button onClick={() => setPicked(null)} style={{ height: 56, fontSize: 12, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{ar ? "عودة" : "Back"}</button>
              <button onClick={() => setPin(p => (p + 0).slice(0, 4))} style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>0</button>
              <button onClick={() => setPin(p => p.slice(0, -1))} style={{ height: 56, fontSize: 18, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>⌫</button>
            </div>
            <button onClick={onIn} className="btn btn-primary btn-xl" style={{ marginTop: 20, justifyContent: "center" }}>
              {ar ? "ابدأ الوردية" : "Start shift"} <Icon name="arrowRight" size={14}/>
            </button>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
              {ar ? "العد النقدي: د.ع ١٧٥٬٠٠٠ افتراضي" : "Cash float: IQD 175,000 default"}
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

function POSSale({ lang, cart, setCart, addItem, subTotal, vat, total, onCharge, onWaste, onLogout }) {
  const ar = lang === "ar";
  const catalog = useCatalog();
  const menu = React.useMemo(() => catalog.menuByCategory(), [catalog.state.products]);
  const [activeCat, setActiveCat] = useStatePOS(0);
  const [search, setSearch] = useStatePOS("");
  const cat = menu[activeCat] ?? menu[0] ?? { items: [] };
  const items = search
    ? menu.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : cat.items;

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
          <button className="btn btn-ghost"><Icon name="box" size={13}/>{ar ? "المخزون" : "Stock"}</button>
          <button className="btn btn-ghost" onClick={onLogout}>{ar ? "إنهاء" : "End shift"}</button>
        </div>
      </div>

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

// =============== PAYMENT ===============
function POSPayment({ lang, total, cart, onTender, tender, onDone, onBack }) {
  const ar = lang === "ar";
  const [phase, setPhase] = useStatePOS("choose"); // choose -> processing -> done
  const [cashGiven, setCashGiven] = useStatePOS("");
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
    setTimeout(() => setPhase("done"), t === "card" ? 1400 : 600);
  };

  const cashNum = parseFloat(cashGiven) || 0;
  const change = cashNum - total;

  if (phase === "done") {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 52, padding: "0 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ar ? "تم الدفع" : "Payment complete"}</span>
        </div>
        <div className="fade-up" style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ink)", color: "var(--ink-inverse)", display: "grid", placeItems: "center", margin: "0 auto 24px" }}>
              <Icon name="check" size={28} stroke={2}/>
            </div>
            <div className="t-display" style={{ marginBottom: 6 }}>{fmtMoney(total)}</div>
            <div className="muted" style={{ marginBottom: 4 }}>{ar ? "اكتمل الدفع" : "Order #A-1247 paid"}</div>
            {tender === "cash" && cashNum > 0 && (
              <div style={{ marginTop: 24, padding: 16, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, display: "inline-block" }}>
                <div className="t-micro">{ar ? "الباقي" : "Change due"}</div>
                <div className="t-num-display">{fmtMoney(change)}</div>
              </div>
            )}
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 32 }}>
              <button className="btn btn-ghost btn-lg"><Icon name="receipt" size={14}/>{ar ? "اطبع" : "Print"}</button>
              <button className="btn btn-ghost btn-lg">{ar ? "أرسل عبر SMS" : "Send SMS"}</button>
              <button onClick={onDone} className="btn btn-primary btn-lg">{ar ? "طلب جديد" : "New order"} <Icon name="arrowRight" size={13}/></button>
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
function POSWaste({ lang, onDone, onBack }) {
  const ar = lang === "ar";
  const [item, setItem] = useStatePOS(null);
  const [qty, setQty] = useStatePOS(1);
  const [reason, setReason] = useStatePOS(null);

  const items = [
    { name: "Croissant — Plain", price: 12 },
    { name: "Croissant — Chocolate", price: 14 },
    { name: "Pistachio Cake", price: 32 },
    { name: "Latte", price: 22 },
    { name: "Iced Latte", price: 24 },
    { name: "Milk (whole) 1L", price: 12 },
  ];
  const reasons = ar
    ? ["انتهاء اليوم", "خطأ في الطلب", "إسقاط/سكب", "رفض جودة", "تالف"]
    : ["End of day", "Wrong order", "Spill / drop", "Quality reject", "Spoiled"];

  const cost = item ? item.price * qty : 0;
  const canSubmit = item && reason;

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
          <button disabled={!canSubmit} onClick={onDone}
            className="btn btn-primary btn-xl" style={{ justifyContent: "center", marginTop: 16, opacity: canSubmit ? 1 : 0.4 }}>
            {ar ? "سجّل الهدر" : "Submit waste"}
          </button>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", marginTop: 10 }}>
            {ar ? "يُسجَّل تحت اسمك ووقت الوردية" : "Logged under your name and shift time"}
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

function MasterTop({ panel, setPanel, lang, setLang, theme, setTheme }) {
  return (
    <div className="master-top">
      <div className="brand">
        <div className="brand-mark">M</div>
        <span style={{ letterSpacing: "-0.01em" }}>Maqha</span>
        <span style={{ color: "#6E6E68", fontWeight: 400 }}>- operations</span>
      </div>
      <div className="seg">
        <button className={panel === "admin" ? "on" : ""} onClick={() => setPanel("admin")}>Admin</button>
        <button className={panel === "pos" ? "on" : ""} onClick={() => setPanel("pos")}>POS</button>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ fontSize: 11.5, color: "#8B8A82" }}>Demo - Sat May 9</span>
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

function App() {
  const [panel, setPanel] = useStateApp("admin");
  const [lang, setLang] = useStateApp("en");
  const [theme, setTheme] = useStateApp(getInitialTheme);
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <ToastProvider>
      <CatalogProvider>
        <div className={`app-frame panel-${panel}`} data-theme={theme} dir={dir} lang={lang}>
          <MasterTop panel={panel} setPanel={setPanel} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}/>
          {panel === "admin"
            ? <AdminPanel lang={lang}/>
            : <POSPanel lang={lang}/>}
        </div>
      </CatalogProvider>
    </ToastProvider>
  );
}



export default App;
