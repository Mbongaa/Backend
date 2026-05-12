/* ============================================================
   Mock data for the prototype
   ============================================================ */

const MOCK = {
  today: { date: "Saturday, May 9, 2026" },
  brand: { name: "Maqha", arabic: "مقهى" },

  kpis: {
    revenueToday: 142680,
    revenueDelta: 8.4,
    revenueSpark: [62, 78, 71, 92, 88, 110, 142],
    profitToday: 41320,
    profitMargin: 28.9,
    profitSpark: [18, 22, 19, 26, 24, 32, 41],
    ordersToday: 3142,
    ordersDelta: 4.1,
    ordersSpark: [12, 14, 13, 16, 15, 18, 31],
    cashOnHand: 78420,
    cashSpark: [60, 64, 68, 72, 70, 76, 78],
  },

  alerts: [
    { id: 1, level: "crit", title: "Cash variance — Marina Branch", body: "Cashier ended shift AED 240 short. Pattern: 3rd time this week.", time: "12 min ago", action: "Review shift" },
    { id: 2, level: "warn", title: "Milk stock critical at 4 kiosks", body: "Estimated runout in 6 hours at current pace. Auto-PO drafted to Al Rawabi.", time: "32 min ago", action: "Approve PO" },
    { id: 3, level: "warn", title: "Waste spike — JBR Kiosk", body: "Croissant waste up 240% vs 7-day avg. Likely overproduction.", time: "1 hr ago", action: "View kiosk" },
  ],

  insights: [
    { id: 1, kind: "trend", title: "Iced drinks up 31% week-over-week",
      body: "Driven by 4 coastal kiosks. Heat index correlation 0.84. Suggest increasing ice milk pre-prep by 25% Thu–Sun.",
      tags: ["Trend", "Operations"], confidence: 92 },
    { id: 2, kind: "anomaly", title: "Pistachio cake margin dropped 6 pts",
      body: "Supplier cost up 18% since Apr 22. Recipe uses 12g — peers average 9g. Reformulation could recover 4.5 pts.",
      tags: ["Anomaly", "Margin"], confidence: 88 },
    { id: 3, kind: "forecast", title: "Friday forecast: AED 198K (±6%)",
      body: "Based on weather, last 90 days, and Eid holiday pull-forward effect. Stock 3 kiosks above plan.",
      tags: ["Forecast"], confidence: 81 },
    { id: 4, kind: "action", title: "Two cashiers averaging 11s/order over peer median",
      body: "Marina K-04 and Mall K-09. Re-train on combo shortcuts could save ~40 min/day in queue time.",
      tags: ["Staff", "Action"], confidence: 76 },
  ],

  kiosks: [
    { id: "K-01", name: "Marina Walk", city: "Dubai", revenue: 18420, orders: 412, margin: 31.2, waste: 2.1, staff: 4, status: "good", trend: [22, 24, 23, 28, 26, 30, 32] },
    { id: "K-02", name: "JBR Beach", city: "Dubai", revenue: 21340, orders: 488, margin: 29.8, waste: 4.6, staff: 4, status: "warn", trend: [18, 20, 22, 19, 24, 26, 28] },
    { id: "K-03", name: "Mall of Emirates L1", city: "Dubai", revenue: 16280, orders: 374, margin: 32.1, waste: 1.8, staff: 3, status: "good", trend: [14, 15, 17, 16, 18, 20, 22] },
    { id: "K-04", name: "City Walk South", city: "Dubai", revenue: 12110, orders: 298, margin: 24.4, waste: 3.2, staff: 3, status: "warn", trend: [16, 14, 13, 15, 12, 14, 12] },
    { id: "K-05", name: "Dubai Hills Mall", city: "Dubai", revenue: 14920, orders: 342, margin: 30.5, waste: 2.4, staff: 3, status: "good", trend: [12, 14, 15, 16, 17, 16, 18] },
    { id: "K-06", name: "Yas Mall G2", city: "Abu Dhabi", revenue: 13680, orders: 318, margin: 28.7, waste: 2.9, staff: 3, status: "good", trend: [10, 12, 13, 14, 15, 14, 16] },
    { id: "K-07", name: "Marina Mall AD", city: "Abu Dhabi", revenue: 11240, orders: 267, margin: 26.1, waste: 5.8, staff: 3, status: "crit", trend: [16, 15, 14, 12, 11, 9, 8] },
    { id: "K-08", name: "Galleria Al Maryah", city: "Abu Dhabi", revenue: 15110, orders: 351, margin: 30.9, waste: 2.0, staff: 3, status: "good", trend: [12, 14, 15, 17, 18, 17, 19] },
    { id: "K-09", name: "Sahara Centre", city: "Sharjah", revenue: 9580, orders: 234, margin: 22.8, waste: 4.1, staff: 3, status: "warn", trend: [12, 11, 10, 9, 11, 10, 9] },
    { id: "K-10", name: "City Centre Sharjah", city: "Sharjah", revenue: 10000, orders: 258, margin: 27.4, waste: 2.7, staff: 3, status: "good", trend: [9, 10, 11, 10, 12, 11, 13] },
  ],

  inventory: [
    { item: "Milk (whole) 1L", category: "Dairy", stock: 42, unit: "ctn", reorder: 60, days: 1.2, supplier: "Al Rawabi", status: "low" },
    { item: "Espresso beans — house", category: "Coffee", stock: 86, unit: "kg", reorder: 50, days: 9.4, supplier: "Roaster Co.", status: "ok" },
    { item: "Pistachio paste", category: "Bakery", stock: 4, unit: "kg", reorder: 12, days: 0.8, supplier: "Levant Foods", status: "crit" },
    { item: "Oat milk 1L", category: "Dairy alt", stock: 28, unit: "ctn", reorder: 24, days: 3.1, supplier: "Alpro ME", status: "ok" },
    { item: "Croissant — frozen", category: "Bakery", stock: 124, unit: "pc", reorder: 100, days: 2.8, supplier: "Modern Bakery", status: "ok" },
    { item: "Vanilla syrup 750ml", category: "Syrups", stock: 11, unit: "btl", reorder: 18, days: 2.0, supplier: "Monin Gulf", status: "low" },
    { item: "Lemons", category: "Produce", stock: 38, unit: "kg", reorder: 30, days: 4.2, supplier: "Daily Fresh", status: "ok" },
    { item: "Mint — fresh", category: "Produce", stock: 6, unit: "kg", reorder: 10, days: 1.4, supplier: "Daily Fresh", status: "low" },
    { item: "Cups 12oz", category: "Packaging", stock: 4200, unit: "pc", reorder: 3000, days: 11.0, supplier: "Pack Pro", status: "ok" },
    { item: "Chocolate — 70%", category: "Bakery", stock: 22, unit: "kg", reorder: 18, days: 6.4, supplier: "Levant Foods", status: "ok" },
  ],

  waste: [
    { id: 1, kiosk: "K-02 JBR", item: "Croissant — chocolate", qty: 14, cost: 84, reason: "Overproduction", time: "11:42", flagged: true },
    { id: 2, kiosk: "K-04 City Walk", item: "Iced latte", qty: 3, cost: 36, reason: "Wrong order", time: "11:18", flagged: false },
    { id: 3, kiosk: "K-07 Marina AD", item: "Pistachio cake slice", qty: 6, cost: 168, reason: "End-of-day", time: "10:55", flagged: true },
    { id: 4, kiosk: "K-01 Marina", item: "Milk (whole)", qty: 2, cost: 24, reason: "Spillage", time: "10:30", flagged: false },
    { id: 5, kiosk: "K-09 Sahara", item: "Croissant — plain", qty: 9, cost: 45, reason: "Stale", time: "10:12", flagged: true },
    { id: 6, kiosk: "K-02 JBR", item: "Espresso shot", qty: 4, cost: 12, reason: "Quality reject", time: "09:48", flagged: false },
  ],

  suppliers: [
    { name: "Al Rawabi Dairy", category: "Dairy", spend30: 38420, ontime: 98, lastOrder: "2 days ago", status: "good" },
    { name: "Levant Foods", category: "Bakery / Nuts", spend30: 28100, ontime: 91, lastOrder: "Today", status: "good" },
    { name: "Modern Bakery", category: "Bakery", spend30: 21340, ontime: 88, lastOrder: "Yesterday", status: "warn" },
    { name: "Roaster Co.", category: "Coffee", spend30: 18920, ontime: 100, lastOrder: "5 days ago", status: "good" },
    { name: "Daily Fresh", category: "Produce", spend30: 14210, ontime: 82, lastOrder: "Today", status: "warn" },
    { name: "Monin Gulf", category: "Syrups", spend30: 6420, ontime: 95, lastOrder: "8 days ago", status: "good" },
    { name: "Pack Pro", category: "Packaging", spend30: 9180, ontime: 99, lastOrder: "12 days ago", status: "good" },
  ],

  staff: [
    { name: "Layla Hassan", role: "Operations Mgr", kiosk: "—", hours: 168, salary: 14200, status: "active" },
    { name: "Omar Khaled", role: "Supervisor", kiosk: "K-01,02", hours: 176, salary: 8600, status: "active" },
    { name: "Maya Ahmed", role: "Cashier", kiosk: "K-01", hours: 162, salary: 4800, status: "active" },
    { name: "Yusuf Saleh", role: "Barista", kiosk: "K-02", hours: 174, salary: 5100, status: "active" },
    { name: "Nour Ibrahim", role: "Cashier", kiosk: "K-03", hours: 158, salary: 4800, status: "active" },
    { name: "Rashid Al-Mansoori", role: "Warehouse", kiosk: "Central", hours: 184, salary: 6200, status: "active" },
    { name: "Sara Younis", role: "Barista", kiosk: "K-04", hours: 88, salary: 2700, status: "leave" },
    { name: "Karim Fahmy", role: "Cashier", kiosk: "K-07", hours: 168, salary: 4800, status: "review" },
  ],

  // ---- POS ----
  posMenu: [
    { cat: "Hot Coffee", items: [
      { id: 1, name: "Espresso", price: 12, sizes: ["S","D"] },
      { id: 2, name: "Americano", price: 16, sizes: ["S","M","L"] },
      { id: 3, name: "Flat White", price: 20, sizes: ["S","M"] },
      { id: 4, name: "Latte", price: 22, sizes: ["S","M","L"] },
      { id: 5, name: "Cappuccino", price: 22, sizes: ["S","M","L"] },
      { id: 6, name: "Cortado", price: 18, sizes: ["S"] },
      { id: 7, name: "Mocha", price: 24, sizes: ["S","M","L"] },
      { id: 8, name: "Spanish Latte", price: 24, sizes: ["S","M"] },
    ]},
    { cat: "Iced Coffee", items: [
      { id: 11, name: "Iced Americano", price: 18, sizes: ["M","L"] },
      { id: 12, name: "Iced Latte", price: 24, sizes: ["M","L"] },
      { id: 13, name: "Iced Mocha", price: 26, sizes: ["M","L"] },
      { id: 14, name: "Cold Brew", price: 26, sizes: ["M","L"] },
      { id: 15, name: "Iced Spanish", price: 26, sizes: ["M","L"] },
    ]},
    { cat: "Juice", items: [
      { id: 21, name: "Orange", price: 22, sizes: ["M","L"] },
      { id: 22, name: "Mango", price: 24, sizes: ["M","L"] },
      { id: 23, name: "Strawberry", price: 24, sizes: ["M","L"] },
      { id: 24, name: "Avocado", price: 28, sizes: ["M","L"] },
      { id: 25, name: "Mint Lemonade", price: 22, sizes: ["M","L"] },
    ]},
    { cat: "Cake", items: [
      { id: 31, name: "Pistachio Cake", price: 32, sizes: ["slice"] },
      { id: 32, name: "Chocolate Fondant", price: 28, sizes: ["slice"] },
      { id: 33, name: "Cheesecake", price: 30, sizes: ["slice"] },
      { id: 34, name: "Carrot Cake", price: 26, sizes: ["slice"] },
      { id: 35, name: "Tiramisu", price: 30, sizes: ["slice"] },
      { id: 36, name: "Lotus Cake", price: 28, sizes: ["slice"] },
    ]},
    { cat: "Bakery", items: [
      { id: 41, name: "Croissant — Plain", price: 12, sizes: ["pc"] },
      { id: 42, name: "Croissant — Chocolate", price: 14, sizes: ["pc"] },
      { id: 43, name: "Croissant — Almond", price: 16, sizes: ["pc"] },
      { id: 44, name: "Cinnamon Roll", price: 16, sizes: ["pc"] },
      { id: 45, name: "Za'atar Manakeesh", price: 14, sizes: ["pc"] },
    ]},
  ],
};

window.MOCK = MOCK;
