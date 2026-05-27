export type Lang = "en" | "ar";

export type LocalText = {
  en: string;
  ar: string;
};

export type KioskStatus = "good" | "watch" | "critical";

export type Kiosk = {
  id: string;
  name: LocalText;
  area: LocalText;
  revenue: number;
  orders: number;
  margin: number;
  waste: number;
  staff: number;
  status: KioskStatus;
  trend: number[];
};

export type IngredientStock = {
  id: string;
  name: LocalText;
  unit: string;
  opening: number;
  reorderAt: number;
  cost: number;
};

export type RecipeLine = {
  ingredientId: string;
  qty: number;
};

export type MenuItem = {
  id: string;
  category: string;
  name: LocalText;
  price: number;
  sizes: string[];
  recipe: RecipeLine[];
};

export type CartLine = {
  key: string;
  id: string;
  name: LocalText;
  size: string;
  price: number;
  qty: number;
  recipe: RecipeLine[];
};

export type ModifierValue = {
  id: string;
  name: LocalText;
  priceDelta?: number;
  recipeFactor?: number;
  default?: boolean;
};

export type ModifierGroup = {
  id: string;
  name: LocalText;
  selection: "single" | "multi";
  required?: boolean;
  values: ModifierValue[];
};

export type ProductModifierBinding = {
  appliesTo: { categories?: string[]; productIds?: string[] };
  groups: ModifierGroup[];
};

export const brand = {
  name: "Bayaan",
  product: "Kiosk Ops",
  arName: "بيان",
  arProduct: "إدارة الأكشاك",
};

export const today = {
  en: "Saturday, May 9, 2026",
  ar: "السبت، 9 مايو 2026",
};

export const kpis = {
  revenueToday: 4_820_000,
  revenueDelta: 8.4,
  profitToday: 1_610_000,
  profitMargin: 33.4,
  ordersToday: 842,
  avgTicket: 5724,
  cashOnHand: 3_920_000,
  stockValue: 18_740_000,
  revenueSpark: [62, 76, 72, 83, 91, 103, 126],
  profitSpark: [21, 24, 25, 29, 30, 34, 42],
  orderSpark: [44, 55, 48, 62, 66, 71, 84],
  cashSpark: [70, 74, 73, 78, 82, 85, 88],
};

export const kiosks: Kiosk[] = [
  { id: "K-01", name: { en: "Mansour Coffee Stand", ar: "كشك المنصور" }, area: { en: "Mansour", ar: "المنصور" }, revenue: 612_000, orders: 112, margin: 35.1, waste: 1.9, staff: 4, status: "good", trend: [24, 28, 26, 31, 35, 38, 42] },
  { id: "K-02", name: { en: "Karrada Juice Bar", ar: "عصائر الكرادة" }, area: { en: "Karrada", ar: "الكرادة" }, revenue: 574_000, orders: 104, margin: 31.8, waste: 3.2, staff: 4, status: "watch", trend: [20, 22, 25, 24, 29, 32, 34] },
  { id: "K-03", name: { en: "Jadriyah Cakes", ar: "كيك الجادرية" }, area: { en: "Jadriyah", ar: "الجادرية" }, revenue: 488_000, orders: 86, margin: 37.6, waste: 1.4, staff: 3, status: "good", trend: [14, 16, 17, 19, 22, 23, 25] },
  { id: "K-04", name: { en: "Zayouna Drive", ar: "زايوونة درايف" }, area: { en: "Zayouna", ar: "زيونة" }, revenue: 421_000, orders: 79, margin: 27.4, waste: 4.7, staff: 3, status: "watch", trend: [18, 17, 16, 20, 19, 18, 20] },
  { id: "K-05", name: { en: "Baghdad Mall", ar: "بغداد مول" }, area: { en: "Harthiya", ar: "الحارثية" }, revenue: 536_000, orders: 96, margin: 34.5, waste: 1.8, staff: 4, status: "good", trend: [18, 21, 23, 26, 27, 30, 34] },
  { id: "K-06", name: { en: "Palestine Street", ar: "شارع فلسطين" }, area: { en: "Palestine St.", ar: "شارع فلسطين" }, revenue: 356_000, orders: 68, margin: 29.1, waste: 2.8, staff: 3, status: "good", trend: [13, 14, 15, 16, 18, 17, 20] },
  { id: "K-07", name: { en: "Yarmouk Hospital Gate", ar: "بوابة اليرموك" }, area: { en: "Yarmouk", ar: "اليرموك" }, revenue: 302_000, orders: 61, margin: 23.6, waste: 6.1, staff: 3, status: "critical", trend: [20, 18, 16, 13, 12, 11, 10] },
  { id: "K-08", name: { en: "Adhamiya Morning", ar: "أعظمية الصباح" }, area: { en: "Adhamiya", ar: "الأعظمية" }, revenue: 386_000, orders: 73, margin: 31.2, waste: 2.2, staff: 3, status: "good", trend: [13, 15, 18, 19, 21, 20, 22] },
  { id: "K-09", name: { en: "Mutanabbi Walk", ar: "شارع المتنبي" }, area: { en: "Mutanabbi", ar: "المتنبي" }, revenue: 268_000, orders: 56, margin: 21.8, waste: 4.8, staff: 2, status: "watch", trend: [12, 11, 10, 10, 11, 10, 9] },
  { id: "K-10", name: { en: "Al-Rashid Popup", ar: "كشك الرشيد" }, area: { en: "Al-Rashid", ar: "الرشيد" }, revenue: 293_000, orders: 63, margin: 28.8, waste: 2.6, staff: 2, status: "good", trend: [9, 10, 11, 13, 12, 14, 15] },
];

export const ingredients: IngredientStock[] = [
  { id: "oranges", name: { en: "Oranges", ar: "برتقال" }, unit: "kg", opening: 42, reorderAt: 12, cost: 1900 },
  { id: "mango", name: { en: "Mango pulp", ar: "لب المانجو" }, unit: "kg", opening: 18, reorderAt: 7, cost: 4200 },
  { id: "coffee", name: { en: "Coffee beans", ar: "حبوب القهوة" }, unit: "kg", opening: 8.5, reorderAt: 2.5, cost: 18500 },
  { id: "milk", name: { en: "Whole milk", ar: "حليب كامل الدسم" }, unit: "L", opening: 34, reorderAt: 10, cost: 1250 },
  { id: "sugar", name: { en: "Sugar", ar: "سكر" }, unit: "kg", opening: 11, reorderAt: 3, cost: 900 },
  { id: "ice", name: { en: "Ice", ar: "ثلج" }, unit: "kg", opening: 54, reorderAt: 18, cost: 350 },
  { id: "cups", name: { en: "Cups 350ml", ar: "أكواب 350مل" }, unit: "pc", opening: 900, reorderAt: 250, cost: 85 },
  { id: "straws", name: { en: "Straws", ar: "مصاصات" }, unit: "pc", opening: 900, reorderAt: 250, cost: 20 },
  { id: "cakeBox", name: { en: "Cake boxes", ar: "علب الكيك" }, unit: "pc", opening: 160, reorderAt: 45, cost: 220 },
  { id: "strawberry", name: { en: "Strawberry", ar: "فراولة" }, unit: "kg", opening: 13, reorderAt: 5, cost: 3800 },
];

export const menuCategories = [
  { id: "coffee", label: { en: "Coffee", ar: "قهوة" } },
  { id: "juice", label: { en: "Juice", ar: "عصائر" } },
  { id: "cake", label: { en: "Cake", ar: "كيك" } },
  { id: "bakery", label: { en: "Bakery", ar: "مخبوزات" } },
];

export const menuItems: MenuItem[] = [
  { id: "espresso", category: "coffee", name: { en: "Espresso", ar: "إسبريسو" }, price: 3000, sizes: ["S", "D"], recipe: [{ ingredientId: "coffee", qty: 0.018 }, { ingredientId: "cups", qty: 1 }] },
  { id: "americano", category: "coffee", name: { en: "Americano", ar: "أمريكانو" }, price: 4000, sizes: ["M", "L"], recipe: [{ ingredientId: "coffee", qty: 0.02 }, { ingredientId: "cups", qty: 1 }] },
  { id: "latte", category: "coffee", name: { en: "Latte", ar: "لاتيه" }, price: 5000, sizes: ["M", "L"], recipe: [{ ingredientId: "coffee", qty: 0.019 }, { ingredientId: "milk", qty: 0.22 }, { ingredientId: "cups", qty: 1 }] },
  { id: "iced-latte", category: "coffee", name: { en: "Iced latte", ar: "آيس لاتيه" }, price: 5500, sizes: ["M", "L"], recipe: [{ ingredientId: "coffee", qty: 0.019 }, { ingredientId: "milk", qty: 0.18 }, { ingredientId: "ice", qty: 0.15 }, { ingredientId: "cups", qty: 1 }, { ingredientId: "straws", qty: 1 }] },
  { id: "orange", category: "juice", name: { en: "Orange juice", ar: "عصير برتقال" }, price: 5000, sizes: ["M", "L"], recipe: [{ ingredientId: "oranges", qty: 0.35 }, { ingredientId: "sugar", qty: 0.01 }, { ingredientId: "ice", qty: 0.12 }, { ingredientId: "cups", qty: 1 }, { ingredientId: "straws", qty: 1 }] },
  { id: "mango", category: "juice", name: { en: "Mango juice", ar: "عصير مانجو" }, price: 6000, sizes: ["M", "L"], recipe: [{ ingredientId: "mango", qty: 0.22 }, { ingredientId: "sugar", qty: 0.012 }, { ingredientId: "ice", qty: 0.12 }, { ingredientId: "cups", qty: 1 }, { ingredientId: "straws", qty: 1 }] },
  { id: "strawberry", category: "juice", name: { en: "Strawberry juice", ar: "عصير فراولة" }, price: 6000, sizes: ["M", "L"], recipe: [{ ingredientId: "strawberry", qty: 0.2 }, { ingredientId: "milk", qty: 0.12 }, { ingredientId: "ice", qty: 0.12 }, { ingredientId: "cups", qty: 1 }, { ingredientId: "straws", qty: 1 }] },
  { id: "pistachio-cake", category: "cake", name: { en: "Pistachio cake", ar: "كيك الفستق" }, price: 7500, sizes: ["slice"], recipe: [{ ingredientId: "cakeBox", qty: 1 }] },
  { id: "chocolate-cake", category: "cake", name: { en: "Chocolate cake", ar: "كيك شوكولاتة" }, price: 6500, sizes: ["slice"], recipe: [{ ingredientId: "cakeBox", qty: 1 }] },
  { id: "cheesecake", category: "cake", name: { en: "Cheesecake", ar: "تشيز كيك" }, price: 7000, sizes: ["slice"], recipe: [{ ingredientId: "cakeBox", qty: 1 }] },
  { id: "plain-croissant", category: "bakery", name: { en: "Plain croissant", ar: "كرواسون سادة" }, price: 3000, sizes: ["pc"], recipe: [{ ingredientId: "cakeBox", qty: 1 }] },
  { id: "choco-croissant", category: "bakery", name: { en: "Chocolate croissant", ar: "كرواسون شوكولاتة" }, price: 3500, sizes: ["pc"], recipe: [{ ingredientId: "cakeBox", qty: 1 }] },
];

// Modifier metadata applied per category. Cashier picks one value per single-select group,
// any number from multi-select groups. priceDelta adjusts the line total. recipeFactor scales
// ingredient consumption (Large = 1.25x means recipe qty × 1.25 at consumption time).
export const productModifierBindings: ProductModifierBinding[] = [
  {
    appliesTo: { categories: ["coffee", "Hot Coffee", "Iced Coffee"] },
    groups: [
      {
        id: "temp",
        name: { en: "Temperature", ar: "درجة الحرارة" },
        selection: "single",
        required: true,
        values: [
          { id: "hot", name: { en: "Hot", ar: "حار" }, default: true },
          { id: "iced", name: { en: "Iced", ar: "مثلج" }, priceDelta: 500 },
        ],
      },
      {
        id: "size",
        name: { en: "Size", ar: "الحجم" },
        selection: "single",
        required: true,
        values: [
          { id: "small", name: { en: "Small", ar: "صغير" }, priceDelta: -500, recipeFactor: 0.8 },
          { id: "medium", name: { en: "Medium", ar: "وسط" }, default: true, recipeFactor: 1.0 },
          { id: "large", name: { en: "Large", ar: "كبير" }, priceDelta: 1000, recipeFactor: 1.25 },
        ],
      },
      {
        id: "milk",
        name: { en: "Milk", ar: "الحليب" },
        selection: "single",
        values: [
          { id: "whole", name: { en: "Whole", ar: "كامل الدسم" }, default: true },
          { id: "lactose-free", name: { en: "Lactose-free", ar: "خالي اللاكتوز" }, priceDelta: 500 },
          { id: "almond", name: { en: "Almond", ar: "حليب لوز" }, priceDelta: 1000 },
        ],
      },
      {
        id: "extras",
        name: { en: "Extras", ar: "إضافات" },
        selection: "multi",
        values: [
          { id: "extra-shot", name: { en: "Extra espresso shot", ar: "شوت إسبريسو إضافي" }, priceDelta: 800 },
          { id: "decaf", name: { en: "Decaf", ar: "منزوع الكافيين" } },
        ],
      },
    ],
  },
  {
    appliesTo: { categories: ["juice", "Juice"] },
    groups: [
      {
        id: "size",
        name: { en: "Size", ar: "الحجم" },
        selection: "single",
        required: true,
        values: [
          { id: "medium", name: { en: "Medium 350ml", ar: "وسط 350مل" }, default: true, recipeFactor: 1.0 },
          { id: "large", name: { en: "Large 500ml", ar: "كبير 500مل" }, priceDelta: 1500, recipeFactor: 1.4 },
        ],
      },
      {
        id: "sweetness",
        name: { en: "Sweetness", ar: "التحلية" },
        selection: "single",
        values: [
          { id: "no-sugar", name: { en: "No sugar", ar: "بدون سكر" } },
          { id: "regular", name: { en: "Regular", ar: "عادي" }, default: true },
          { id: "extra-sweet", name: { en: "Extra sweet", ar: "زيادة سكر" } },
        ],
      },
    ],
  },
];

export const alerts = [
  { level: "critical", title: { en: "Cash variance at Yarmouk", ar: "فرق نقدي في اليرموك" }, body: { en: "Drawer is short by IQD 38,000 after the lunch shift.", ar: "الصندوق أقل بـ 38,000 دينار بعد وردية الغداء." }, action: { en: "Review shift", ar: "مراجعة الوردية" }, time: { en: "12 min ago", ar: "قبل 12 دقيقة" } },
  { level: "watch", title: { en: "Orange stock low in 3 kiosks", ar: "مخزون البرتقال منخفض في 3 أكشاك" }, body: { en: "Expected runout before 8 PM if demand continues.", ar: "نفاد متوقع قبل 8 مساء إذا استمر الطلب الحالي." }, action: { en: "Approve transfer", ar: "اعتماد التحويل" }, time: { en: "31 min ago", ar: "قبل 31 دقيقة" } },
  { level: "watch", title: { en: "Cake box usage above recipe", ar: "استخدام علب الكيك أعلى من الوصفة" }, body: { en: "K-04 used 14 boxes more than expected from sales.", ar: "كشك K-04 استخدم 14 علبة أكثر من المتوقع حسب المبيعات." }, action: { en: "Open variance", ar: "فتح الفرق" }, time: { en: "1 hr ago", ar: "قبل ساعة" } },
];

export const aiInsights = [
  { kind: "forecast", title: { en: "Tomorrow needs 128 kg oranges", ar: "الغد يحتاج 128 كغم برتقال" }, body: { en: "Forecast uses today pace, Friday uplift, and kiosk allocation. Transfer 18 kg to Mansour before 9 AM.", ar: "التوقع يعتمد على وتيرة اليوم وارتفاع الجمعة وتوزيع الأكشاك. حوّل 18 كغم إلى المنصور قبل 9 صباحا." }, confidence: 91 },
  { kind: "anomaly", title: { en: "Yarmouk waste is 2.4x normal", ar: "هدر اليرموك أعلى من الطبيعي 2.4 مرة" }, body: { en: "Variance is concentrated in milk and cups. Check free drinks, recipe compliance, or unrecorded sales.", ar: "الفرق متركز في الحليب والأكواب. راجع المشروبات المجانية أو الالتزام بالوصفة أو المبيعات غير المسجلة." }, confidence: 86 },
  { kind: "margin", title: { en: "Mango margin dropped 5.1 points", ar: "هامش المانجو انخفض 5.1 نقطة" }, body: { en: "Supplier price changed this morning. Keep price or reduce pulp by 15g after taste approval.", ar: "سعر المورد تغير هذا الصباح. إما تثبيت السعر أو تقليل اللب 15 غرام بعد اعتماد الطعم." }, confidence: 82 },
  { kind: "cash", title: { en: "Two cashiers close slower than peer median", ar: "كاشيران يغلقان أبطأ من متوسط الفريق" }, body: { en: "End-shift counts take 11 minutes longer. Add guided stock count order for both kiosks.", ar: "عد نهاية الوردية يستغرق 11 دقيقة أكثر. أضف ترتيب عد موجه لهذين الكشكين." }, confidence: 78 },
];

export const inventoryRows = [
  { item: { en: "Oranges", ar: "برتقال" }, category: { en: "Produce", ar: "فواكه" }, stock: 218, unit: "kg", reorder: 140, days: 2.1, supplier: "Baghdad Fresh", status: "ok" },
  { item: { en: "Mango pulp", ar: "لب المانجو" }, category: { en: "Produce", ar: "فواكه" }, stock: 42, unit: "kg", reorder: 55, days: 1.4, supplier: "Dijla Fruits", status: "low" },
  { item: { en: "Coffee beans", ar: "حبوب القهوة" }, category: { en: "Coffee", ar: "قهوة" }, stock: 31, unit: "kg", reorder: 24, days: 6.7, supplier: "Roast House IQ", status: "ok" },
  { item: { en: "Whole milk", ar: "حليب كامل الدسم" }, category: { en: "Dairy", ar: "ألبان" }, stock: 64, unit: "L", reorder: 80, days: 1.2, supplier: "Al Safi Dairy", status: "low" },
  { item: { en: "Cups 350ml", ar: "أكواب 350مل" }, category: { en: "Packaging", ar: "تغليف" }, stock: 4200, unit: "pc", reorder: 3000, days: 8.8, supplier: "Pack Iraq", status: "ok" },
  { item: { en: "Cake boxes", ar: "علب الكيك" }, category: { en: "Packaging", ar: "تغليف" }, stock: 230, unit: "pc", reorder: 320, days: 1.1, supplier: "Pack Iraq", status: "critical" },
];

export const wasteRows = [
  { kiosk: "K-07 Yarmouk", item: { en: "Whole milk", ar: "حليب كامل الدسم" }, qty: 4, unit: "L", cost: 5000, reason: { en: "Spillage", ar: "سكب" }, time: "13:40", flagged: true },
  { kiosk: "K-04 Zayouna", item: { en: "Cake boxes", ar: "علب الكيك" }, qty: 14, unit: "pc", cost: 3080, reason: { en: "Missing stock", ar: "نقص مخزون" }, time: "12:55", flagged: true },
  { kiosk: "K-02 Karrada", item: { en: "Orange juice", ar: "عصير برتقال" }, qty: 3, unit: "pc", cost: 5700, reason: { en: "Wrong order", ar: "طلب خاطئ" }, time: "12:22", flagged: false },
  { kiosk: "K-09 Mutanabbi", item: { en: "Plain croissant", ar: "كرواسون سادة" }, qty: 8, unit: "pc", cost: 9600, reason: { en: "End of day", ar: "نهاية اليوم" }, time: "11:58", flagged: true },
];

export const suppliers = [
  { name: "Baghdad Fresh", category: { en: "Produce", ar: "فواكه" }, spend30: 9_840_000, onTime: 96, lastOrder: { en: "Today", ar: "اليوم" }, status: "good" },
  { name: "Dijla Fruits", category: { en: "Produce", ar: "فواكه" }, spend30: 6_240_000, onTime: 88, lastOrder: { en: "Yesterday", ar: "أمس" }, status: "watch" },
  { name: "Roast House IQ", category: { en: "Coffee", ar: "قهوة" }, spend30: 5_760_000, onTime: 100, lastOrder: { en: "4 days ago", ar: "قبل 4 أيام" }, status: "good" },
  { name: "Al Safi Dairy", category: { en: "Dairy", ar: "ألبان" }, spend30: 4_120_000, onTime: 91, lastOrder: { en: "Today", ar: "اليوم" }, status: "good" },
  { name: "Pack Iraq", category: { en: "Packaging", ar: "تغليف" }, spend30: 2_980_000, onTime: 94, lastOrder: { en: "2 days ago", ar: "قبل يومين" }, status: "good" },
];

export const staff = [
  { name: { en: "Maya Ahmed", ar: "مايا أحمد" }, role: { en: "Cashier", ar: "كاشير" }, kiosk: "K-01", hours: 164, salary: 650_000, status: "active" },
  { name: { en: "Yusuf Saleh", ar: "يوسف صالح" }, role: { en: "Barista", ar: "باريستا" }, kiosk: "K-01", hours: 170, salary: 720_000, status: "active" },
  { name: { en: "Omar Khaled", ar: "عمر خالد" }, role: { en: "Supervisor", ar: "مشرف" }, kiosk: "K-01, K-02", hours: 176, salary: 1_200_000, status: "active" },
  { name: { en: "Sara Younis", ar: "سارة يونس" }, role: { en: "Barista", ar: "باريستا" }, kiosk: "K-04", hours: 96, salary: 410_000, status: "leave" },
  { name: { en: "Karim Abbas", ar: "كريم عباس" }, role: { en: "Cashier", ar: "كاشير" }, kiosk: "K-07", hours: 168, salary: 650_000, status: "review" },
];

export const t = (value: LocalText, lang: Lang) => value[lang];

export const formatMoney = (amount: number, lang: Lang = "en") => {
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  return lang === "ar" ? `${formatted} د.ع` : `IQD ${formatted}`;
};

export const formatQty = (value: number, unit: string, lang: Lang = "en") => {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(3));
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 3,
  }).format(rounded);
  return `${formatted} ${unit}`;
};
