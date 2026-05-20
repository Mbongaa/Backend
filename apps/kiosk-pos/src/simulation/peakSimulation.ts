export type PeakSimulationOptions = {
  seed?: number;
  minutes?: number;
  cursorMinute?: number;
  targetOrders?: Record<string, number>;
};

export type PeakSimulationAuditOptions = {
  seed?: number;
  iterations?: number;
  minutes?: number;
  targetOrders?: Record<string, number>;
};

type StockItem = {
  code: string;
  item: string;
  category: string;
  uom: string;
  unitCost: number;
  kioskOpening: number;
  warehouseQty: number;
  reorderAt: number;
};

type RecipeLine = {
  item: string;
  qty: number;
};

type Product = {
  code: string;
  name: string;
  category: string;
  price: number;
  standardPrice: number;
  consumptionMode: "recipe" | "finished" | "hybrid";
  recipe: RecipeLine[];
  finishedStockItem?: string;
  weight: number;
};

type KioskProfile = {
  id: string;
  name: string;
  city: string;
  area: string;
  cashier: string;
  manager: string;
  supervisor: string;
  staff: number;
  rate: number;
  cashWeight: number;
};

type OrderLine = {
  product: string;
  product_code: string;
  qty: number;
  price_unit: number;
  subtotal: number;
};

type PaymentRow = {
  id: string;
  order: string;
  method: string;
  amount: number;
  provider: {
    id: string;
    label: string;
    category: string;
  };
};

type OrderRow = {
  id: number;
  name: string;
  kiosk: string;
  kioskName: string;
  cashier: string;
  date_order: string;
  amount_total: number;
  state: "paid";
  consumption_state: "posted";
  lines: OrderLine[];
  payments: PaymentRow[];
};

type TimedOrder = OrderRow & {
  minute: number;
};

type TimedWaste = {
  id: string;
  minute: number;
  kiosk: string;
  kioskName: string;
  product: string;
  item: string;
  qty: number;
  uom: string;
  reason: string;
  estimated_cost: number;
  create_date: string;
};

type SimulationTransfer = {
  id: number;
  name: string;
  from: string;
  to: string;
  toKioskId: string;
  createdMinute: number;
  approvedMinute: number;
  pickedMinute: number;
  dispatchedMinute: number;
  receivedMinute?: number;
  movedQty?: number;
  receiptShortageQty?: number;
  lines: Array<{
    product: string;
    qty: number;
    doneQty: number;
    receivedQty?: number;
    uom: string;
  }>;
};

type AuditFailure = {
  iteration: number;
  seed: number;
  message: string;
};

export type PeakSimulationSnapshot = ReturnType<typeof createPeakSimulation>;

const DEFAULT_SEED = 20260516;
const DEFAULT_MINUTES = 60;
const START_HOUR = 14;
const START_DATE = "2026-05-16";

const STOCK_ITEMS: StockItem[] = [
  { code: "COFFEE-BEANS", item: "Coffee beans", category: "Ingredient", uom: "kg", unitCost: 18_000, kioskOpening: 13, warehouseQty: 180, reorderAt: 2.2 },
  { code: "MILK-WHOLE", item: "Whole milk", category: "Ingredient", uom: "L", unitCost: 1_500, kioskOpening: 46, warehouseQty: 640, reorderAt: 8 },
  { code: "ORANGES", item: "Baghdad oranges", category: "Ingredient", uom: "kg", unitCost: 1_200, kioskOpening: 82, warehouseQty: 1_150, reorderAt: 12 },
  { code: "SUGAR", item: "Sugar", category: "Ingredient", uom: "kg", unitCost: 900, kioskOpening: 12, warehouseQty: 180, reorderAt: 2 },
  { code: "ICE", item: "Ice", category: "Ingredient", uom: "kg", unitCost: 120, kioskOpening: 118, warehouseQty: 1_600, reorderAt: 22 },
  { code: "CUP-12OZ", item: "Cups 12oz", category: "Packaging", uom: "Units", unitCost: 80, kioskOpening: 720, warehouseQty: 11_400, reorderAt: 130 },
  { code: "CROISSANT-PLAIN", item: "Plain croissant", category: "Finished", uom: "Units", unitCost: 1_100, kioskOpening: 132, warehouseQty: 1_900, reorderAt: 24 },
  { code: "CAKE-SLICE", item: "Cake slice base", category: "Finished", uom: "Units", unitCost: 2_650, kioskOpening: 102, warehouseQty: 1_140, reorderAt: 18 },
  { code: "PISTACHIO-PASTE", item: "Pistachio paste", category: "Ingredient", uom: "kg", unitCost: 28_000, kioskOpening: 4.6, warehouseQty: 62, reorderAt: 0.75 },
];

function defaultPurchaseQtyFor(item: StockItem) {
  if (item.code === "COFFEE-BEANS") return 25;
  if (item.uom === "kg") return 25;
  if (item.uom === "L") return 50;
  return 100;
}

const PRODUCTS: Product[] = [
  {
    code: "MENU-ESPRESSO",
    name: "Espresso",
    category: "Coffee",
    price: 3_000,
    standardPrice: 470,
    consumptionMode: "recipe",
    weight: 15,
    recipe: [
      { item: "COFFEE-BEANS", qty: 0.018 },
      { item: "CUP-12OZ", qty: 1 },
    ],
  },
  {
    code: "MENU-LATTE",
    name: "Latte",
    category: "Coffee",
    price: 4_500,
    standardPrice: 880,
    consumptionMode: "recipe",
    weight: 21,
    recipe: [
      { item: "COFFEE-BEANS", qty: 0.018 },
      { item: "MILK-WHOLE", qty: 0.22 },
      { item: "CUP-12OZ", qty: 1 },
    ],
  },
  {
    code: "MENU-ICED-COFFEE",
    name: "Iced coffee",
    category: "Iced Coffee",
    price: 5_000,
    standardPrice: 980,
    consumptionMode: "recipe",
    weight: 18,
    recipe: [
      { item: "COFFEE-BEANS", qty: 0.018 },
      { item: "MILK-WHOLE", qty: 0.1 },
      { item: "ICE", qty: 0.16 },
      { item: "CUP-12OZ", qty: 1 },
    ],
  },
  {
    code: "MENU-ORANGE-JUICE",
    name: "Fresh orange juice",
    category: "Juice",
    price: 4_000,
    standardPrice: 630,
    consumptionMode: "recipe",
    weight: 24,
    recipe: [
      { item: "ORANGES", qty: 0.42 },
      { item: "SUGAR", qty: 0.012 },
      { item: "ICE", qty: 0.08 },
      { item: "CUP-12OZ", qty: 1 },
    ],
  },
  {
    code: "MENU-CROISSANT",
    name: "Plain croissant",
    category: "Bakery",
    price: 2_500,
    standardPrice: 1_100,
    consumptionMode: "finished",
    weight: 12,
    recipe: [],
    finishedStockItem: "CROISSANT-PLAIN",
  },
  {
    code: "MENU-PISTACHIO-CAKE",
    name: "Pistachio cake",
    category: "Bakery",
    price: 6_000,
    standardPrice: 3_030,
    consumptionMode: "hybrid",
    weight: 10,
    recipe: [
      { item: "PISTACHIO-PASTE", qty: 0.012 },
      { item: "CUP-12OZ", qty: 0.2 },
    ],
    finishedStockItem: "CAKE-SLICE",
  },
];

const KIOSKS: KioskProfile[] = [
  { id: "K-01", name: "Karrada Center", city: "Baghdad", area: "Karrada", cashier: "Maya Ahmed", manager: "Sara Kareem", supervisor: "Omar Jaber", staff: 4, rate: 1.35, cashWeight: 0.52 },
  { id: "K-02", name: "Mansour District", city: "Baghdad", area: "Mansour", cashier: "Ali Hassan", manager: "Sara Kareem", supervisor: "Omar Jaber", staff: 4, rate: 1.55, cashWeight: 0.44 },
  { id: "K-03", name: "Baghdad Mall", city: "Baghdad", area: "Harthiya", cashier: "Noor Raad", manager: "Sara Kareem", supervisor: "Omar Jaber", staff: 4, rate: 1.28, cashWeight: 0.38 },
  { id: "K-04", name: "Zayouna Plaza", city: "Baghdad", area: "Zayouna", cashier: "Yasmin Adel", manager: "Sara Kareem", supervisor: "Omar Jaber", staff: 3, rate: 1.18, cashWeight: 0.58 },
  { id: "K-05", name: "Al Mansour Mall", city: "Baghdad", area: "Mansour", cashier: "Mustafa Sami", manager: "Sara Kareem", supervisor: "Omar Jaber", staff: 3, rate: 1.42, cashWeight: 0.41 },
  { id: "K-06", name: "University Street", city: "Baghdad", area: "Jadriya", cashier: "Rana Khalid", manager: "Sara Kareem", supervisor: "Dina Saleh", staff: 3, rate: 1.22, cashWeight: 0.35 },
  { id: "K-07", name: "Karada Riverside", city: "Baghdad", area: "Abu Nuwas", cashier: "Karim Fahmy", manager: "Sara Kareem", supervisor: "Dina Saleh", staff: 3, rate: 1.05, cashWeight: 0.61 },
  { id: "K-08", name: "Palestine Street", city: "Baghdad", area: "Palestine", cashier: "Zainab Mahdi", manager: "Sara Kareem", supervisor: "Dina Saleh", staff: 3, rate: 1.31, cashWeight: 0.45 },
  { id: "K-09", name: "Yarmouk Hospital", city: "Baghdad", area: "Yarmouk", cashier: "Hussein Nabil", manager: "Sara Kareem", supervisor: "Dina Saleh", staff: 3, rate: 0.96, cashWeight: 0.63 },
  { id: "K-10", name: "Adhamiya Walk", city: "Baghdad", area: "Adhamiya", cashier: "Lina Saad", manager: "Sara Kareem", supervisor: "Dina Saleh", staff: 3, rate: 1.14, cashWeight: 0.49 },
];

const TARGET_ORDERS_60: Record<string, number> = {
  "K-01": 68,
  "K-02": 78,
  "K-03": 66,
  "K-04": 58,
  "K-05": 70,
  "K-06": 60,
  "K-07": 52,
  "K-08": 64,
  "K-09": 48,
  "K-10": 56,
};

const TRANSFERS: SimulationTransfer[] = [
  {
    id: 9101,
    name: "WH/INT/PEAK-001",
    from: "Central Warehouse",
    to: "Zayouna Plaza",
    toKioskId: "K-04",
    createdMinute: 7,
    approvedMinute: 9,
    pickedMinute: 12,
    dispatchedMinute: 15,
    receivedMinute: 23,
    lines: [
      { product: "ORANGES", qty: 30, doneQty: 30, uom: "kg" },
      { product: "CUP-12OZ", qty: 120, doneQty: 120, uom: "Units" },
    ],
  },
  {
    id: 9102,
    name: "WH/INT/PEAK-002",
    from: "Central Warehouse",
    to: "Karada Riverside",
    toKioskId: "K-07",
    createdMinute: 10,
    approvedMinute: 12,
    pickedMinute: 16,
    dispatchedMinute: 20,
    lines: [
      { product: "MILK-WHOLE", qty: 12, doneQty: 12, uom: "L" },
      { product: "CUP-12OZ", qty: 160, doneQty: 160, uom: "Units" },
    ],
  },
  {
    id: 9103,
    name: "WH/INT/PEAK-003",
    from: "Central Warehouse",
    to: "Yarmouk Hospital",
    toKioskId: "K-09",
    createdMinute: 12,
    approvedMinute: 14,
    pickedMinute: 18,
    dispatchedMinute: 21,
    receivedMinute: 27,
    lines: [
      { product: "PISTACHIO-PASTE", qty: 1.2, doneQty: 1.2, uom: "kg" },
      { product: "CAKE-SLICE", qty: 54, doneQty: 54, uom: "Units" },
    ],
  },
];

const STOCK_OVERRIDES: Record<string, Record<string, number>> = {
  "K-04": { ORANGES: 38, "CUP-12OZ": 110 },
  "K-05": { "CROISSANT-PLAIN": 58 },
  "K-07": { "MILK-WHOLE": 24, "CUP-12OZ": 110 },
  "K-09": { "PISTACHIO-PASTE": 1.9, "CAKE-SLICE": 48 },
};

const PAYMENT_PROVIDERS = [
  { id: "cash", label: "Cash", category: "cash", baseWeight: 44 },
  { id: "bank_card", label: "Bank card terminal", category: "card", baseWeight: 24 },
  { id: "fib", label: "FIB", category: "bank_app", baseWeight: 13 },
  { id: "zain_cash", label: "Zain Cash", category: "mobile_wallet", baseWeight: 9 },
  { id: "fastpay", label: "FastPay", category: "mobile_wallet", baseWeight: 6 },
  { id: "generic_qr", label: "Generic QR", category: "qr", baseWeight: 4 },
];

export function createPeakSimulation(options: PeakSimulationOptions = {}) {
  const seed = Math.trunc(options.seed ?? DEFAULT_SEED);
  const minutes = clamp(Math.trunc(options.minutes ?? DEFAULT_MINUTES), 1, 180);
  const cursorMinute = clamp(Math.trunc(options.cursorMinute ?? minutes), 0, minutes);
  const targetOrders = targetOrdersForMinutes(minutes, options.targetOrders);
  const generated = generateOperations(seed, minutes, targetOrders);
  const orders = generated.orders.filter((order) => order.minute < cursorMinute);
  const waste = generated.waste.filter((entry) => entry.minute < cursorMinute);
  const transfers = TRANSFERS
    .filter((transfer) => transfer.createdMinute < cursorMinute)
    .map((transfer) => transferRow(transfer, cursorMinute));
  const stock = buildStockState(orders, waste, cursorMinute);
  const payments = orders.flatMap((order) => order.payments);
  const consumption = buildConsumptionRows(orders);
  const closings = cursorMinute >= minutes ? buildClosingRows(orders, waste, stock.details, minutes) : [];
  const purchaseOrders = buildPurchaseOrders(cursorMinute);
  const suppliers = buildSuppliers();
  const recurringPurchases = buildRecurringPurchases();
  const hr = buildHrSnapshot(cursorMinute);
  const sourceRowCounts = {
    transferRows: transfers.length,
    purchaseOrders: purchaseOrders.length,
    supplierRows: suppliers.length,
    recurringPurchaseRows: recurringPurchases.length,
    productRows: PRODUCTS.length,
    warehouseStockRows: stock.warehouse_stock.length,
    hrEmployeeRows: hr.employees.length,
    hrAttendanceRows: hr.attendance.length,
    hrShiftRows: hr.shifts.length,
    hrCoverageRuleRows: hr.coverageRules.length,
    payrollAdjustmentRows: 0,
    payrollRunRows: 0,
    operatingExpenseRows: 0,
  };
  const summary = buildSummary(orders, payments, consumption, waste, stock, closings, minutes, targetOrders, sourceRowCounts);

  return {
    engine: "bayaan_peak_simulation",
    company: { id: 1, name: "Bayaan Foods Baghdad" },
    meta: {
      simulation: {
        seed,
        minutes,
        cursorMinute,
        targetOrders,
        totalTargetOrders: Object.values(targetOrders).reduce((sum, value) => sum + value, 0),
        kioskCount: KIOSKS.length,
        scenario: `${minutes}-minute Baghdad peak-opening operating window`,
        start: timestamp(0, 0),
        end: timestamp(minutes, 0),
        current: timestamp(cursorMinute, 0),
      },
      rows_returned: {
        orders: orders.length,
        payments: payments.length,
        consumption: consumption.length,
        waste: waste.length,
        stock: stock.kiosk_stock_rows.length,
        products: PRODUCTS.length,
        warehouseStock: stock.warehouse_stock.length,
        transfers: transfers.length,
        purchaseOrders: purchaseOrders.length,
        suppliers: suppliers.length,
        recurringPurchases: recurringPurchases.length,
        closings: closings.length,
      },
    },
    kiosks: KIOSKS.map((kiosk, index) => ({
      id: index + 1,
      kiosk_code: kiosk.id,
      name: kiosk.name,
      city: kiosk.city,
      area: kiosk.area,
      manager: kiosk.manager,
      supervisor: kiosk.supervisor,
      warehouse: `${kiosk.id} Stock Location`,
      pos_config_id: index + 1,
      pos_config: `${kiosk.id} POS`,
    })),
    pos_configs: KIOSKS.map((kiosk, index) => ({
      id: index + 1,
      name: `${kiosk.id} POS`,
      kiosk: kiosk.id,
      active: true,
      payment_methods: PAYMENT_PROVIDERS.map((provider, providerIndex) => ({
        id: `${index + 1}-${providerIndex + 1}`,
        name: provider.label,
        provider: {
          id: provider.id,
          label: provider.label,
          category: provider.category,
        },
      })),
    })),
    products: PRODUCTS.map((product) => ({
      default_code: product.code,
      name: product.name,
      category: product.category,
      list_price: product.price,
      standard_price: product.standardPrice,
      consumption_mode: product.consumptionMode,
      available_in_pos: true,
    })),
    recipes: PRODUCTS.filter((product) => product.recipe.length).map((product) => ({
      product: product.name,
      product_code: product.code,
      version: "v-sim-peak-2026-05-16",
      effective_from: START_DATE,
      lines: product.recipe.map((line) => {
        const item = stockItem(line.item);
        return {
          ingredient: item.item,
          item: item.code,
          qty: line.qty,
          uom: item.uom,
          cost: roundMoney(item.unitCost * line.qty),
        };
      }),
    })),
    warehouse_stock: stock.warehouse_stock,
    kiosk_stock: stock.kiosk_stock,
    kiosk_stock_rows: stock.kiosk_stock_rows,
    kioskStockDetails: stock.details,
    transfers,
    suggested_transfers: buildSimulationTransferSuggestions(stock.kiosk_stock_rows),
    purchase_orders: purchaseOrders,
    suppliers,
    recurring_purchases: recurringPurchases,
    closings,
    summary,
    today: {
      orders: orders.map(stripMinute),
      payments,
      sales: buildSalesRows(orders),
      consumption,
      waste: waste.map(stripMinute),
    },
    hr,
  };
}

export function auditPeakSimulation(options: PeakSimulationAuditOptions = {}) {
  const iterations = clamp(Math.trunc(options.iterations ?? 15), 1, 100);
  const seed = Math.trunc(options.seed ?? DEFAULT_SEED);
  const minutes = clamp(Math.trunc(options.minutes ?? DEFAULT_MINUTES), 1, 180);
  const targetOrders = options.targetOrders;
  const resolvedTargetOrders = targetOrdersForMinutes(minutes, targetOrders);
  const failures: AuditFailure[] = [];
  const summaries: Array<{ seed: number; minutes: number; orders: number; revenue: number; consumptionRows: number; wasteRows: number }> = [];

  for (let index = 0; index < iterations; index += 1) {
    const iterationSeed = seed + index;
    const snapshot = createPeakSimulation({ seed: iterationSeed, minutes, cursorMinute: minutes, targetOrders });
    const startSnapshot = createPeakSimulation({ seed: iterationSeed, minutes, cursorMinute: 0, targetOrders });
    const midSnapshot = createPeakSimulation({ seed: iterationSeed, minutes, cursorMinute: Math.floor(minutes / 3), targetOrders });
    const checks = auditSnapshot(snapshot, startSnapshot, midSnapshot, minutes, resolvedTargetOrders, targetOrders);
    summaries.push({
      seed: iterationSeed,
      minutes,
      orders: snapshot.today.orders.length,
      revenue: snapshot.summary.totals.salesToday,
      consumptionRows: snapshot.today.consumption.length,
      wasteRows: snapshot.today.waste.length,
    });
    checks.forEach((message) => failures.push({ iteration: index + 1, seed: iterationSeed, message }));
  }

  return {
    ok: failures.length === 0,
    iterations,
    failures,
    summaries,
  };
}

function generateOperations(seed: number, minutes: number, targetOrders: Record<string, number>) {
  const rng = seededRandom(seed);
  const orders: TimedOrder[] = [];
  const waste: TimedWaste[] = [];
  let orderSequence = 1;
  let wasteSequence = 1;
  const orderPlan = new Map(
    KIOSKS.map((kiosk) => [
      kiosk.id,
      allocateOrdersByMinute(targetOrders[kiosk.id] ?? 0, minutes, kiosk, seededRandom(seed + kiosk.id.charCodeAt(2) * 97)),
    ]),
  );

  for (let minute = 0; minute < minutes; minute += 1) {
    KIOSKS.forEach((kiosk, kioskIndex) => {
      const orderCount = orderPlan.get(kiosk.id)?.[minute] ?? 0;
      for (let orderIndex = 0; orderIndex < orderCount; orderIndex += 1) {
        const second = Math.min(58, Math.floor((60 / Math.max(1, orderCount)) * orderIndex + rng() * 10));
        const lines = buildOrderLines(rng, minute);
        const amount = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
        const provider = choosePaymentProvider(rng, kiosk);
        const name = `SIM-${String(seed).slice(-4)}-${String(orderSequence).padStart(5, "0")}`;
        const payment: PaymentRow = {
          id: `${name}-PAY`,
          order: name,
          method: provider.label,
          amount,
          provider: {
            id: provider.id,
            label: provider.label,
            category: provider.category,
          },
        };
        orders.push({
          id: orderSequence,
          minute,
          name,
          kiosk: kiosk.id,
          kioskName: kiosk.name,
          cashier: kiosk.cashier,
          date_order: timestamp(minute, second),
          amount_total: amount,
          state: "paid",
          consumption_state: "posted",
          lines,
          payments: [payment],
        });
        orderSequence += 1;
      }

      if (minute > 6 && orderCount > 0 && rng() < 0.018 + kioskIndex * 0.0015) {
        const entry = buildWasteEntry(rng, kiosk, minute, wasteSequence);
        waste.push(entry);
        wasteSequence += 1;
      }
    });
  }

  return { orders, waste };
}

function targetOrdersForMinutes(minutes: number, overrides?: Record<string, number>) {
  return Object.fromEntries(KIOSKS.map((kiosk) => {
    const base = overrides?.[kiosk.id] ?? TARGET_ORDERS_60[kiosk.id] ?? 0;
    return [kiosk.id, Math.max(0, Math.round(base * (minutes / 60)))];
  }));
}

function allocateOrdersByMinute(target: number, minutes: number, kiosk: KioskProfile, rng: () => number) {
  if (target <= 0) return Array(minutes).fill(0);
  const weights = Array.from({ length: minutes }, (_value, minute) => demandWeight(minute, minutes, kiosk));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (weight / totalWeight) * target);
  const counts = raw.map((value) => Math.floor(value));
  let remaining = target - counts.reduce((sum, value) => sum + value, 0);
  const remainders = raw
    .map((value, minute) => ({ minute, score: value - Math.floor(value) + rng() * 0.001 }))
    .sort((left, right) => right.score - left.score);
  for (let index = 0; index < remainders.length && remaining > 0; index += 1) {
    counts[remainders[index]?.minute ?? 0] += 1;
    remaining -= 1;
  }
  return counts;
}

function buildOrderLines(rng: () => number, minute: number): OrderLine[] {
  const lineTarget = rng() < 0.62 ? 1 : rng() < 0.88 ? 2 : 3;
  const quantities = new Map<Product, number>();
  for (let index = 0; index < lineTarget; index += 1) {
    const product = chooseProduct(rng, minute);
    quantities.set(product, (quantities.get(product) ?? 0) + 1);
  }
  return Array.from(quantities, ([product, qty]) => ({
    product: product.name,
    product_code: product.code,
    qty,
    price_unit: product.price,
    subtotal: product.price * qty,
  }));
}

function chooseProduct(rng: () => number, minute: number) {
  const heatLift = minute >= 8 && minute <= 24 ? 1.28 : 1;
  const snackLift = minute >= 18 ? 1.18 : 1;
  return chooseWeighted(rng, PRODUCTS, (product) => {
    if (product.code === "MENU-ORANGE-JUICE") return product.weight * heatLift;
    if (product.category === "Bakery") return product.weight * snackLift;
    return product.weight;
  });
}

function choosePaymentProvider(rng: () => number, kiosk: KioskProfile) {
  return chooseWeighted(rng, PAYMENT_PROVIDERS, (provider) => {
    if (provider.category === "cash") return provider.baseWeight * (kiosk.cashWeight / 0.44);
    if (provider.category === "bank_app" && ["K-03", "K-06", "K-08"].includes(kiosk.id)) return provider.baseWeight * 1.25;
    return provider.baseWeight;
  });
}

function buildWasteEntry(rng: () => number, kiosk: KioskProfile, minute: number, sequence: number): TimedWaste {
  const candidates = [
    { product: "Fresh orange juice prep spill", item: "ORANGES", qty: 0.7 + rng() * 0.9, reason: "Spill / drop" },
    { product: "Milk pitcher over-pour", item: "MILK-WHOLE", qty: 0.35 + rng() * 0.45, reason: "Wrong order" },
    { product: "Croissant quality reject", item: "CROISSANT-PLAIN", qty: 1 + Math.floor(rng() * 3), reason: "Quality reject" },
    { product: "Pistachio cake trim", item: "CAKE-SLICE", qty: 1 + Math.floor(rng() * 2), reason: "Spoiled" },
  ];
  const chosen = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
  const item = stockItem(chosen.item);
  const qty = roundQty(chosen.qty);
  return {
    id: `SIM-W-${String(sequence).padStart(4, "0")}`,
    minute,
    kiosk: kiosk.id,
    kioskName: kiosk.name,
    product: chosen.product,
    item: item.code,
    qty,
    uom: item.uom,
    reason: chosen.reason,
    estimated_cost: roundMoney(qty * item.unitCost),
    create_date: timestamp(minute, Math.floor(rng() * 58)),
  };
}

function buildConsumptionRows(orders: TimedOrder[]) {
  let ledgerSequence = 1;
  return orders.flatMap((order) => {
    const rows: Array<Record<string, unknown>> = [];
    order.lines.forEach((line) => {
      const product = productByCode(line.product_code);
      if (product.consumptionMode === "finished") return;
      product.recipe.forEach((recipeLine) => {
        const item = stockItem(recipeLine.item);
        const qty = roundQty(recipeLine.qty * line.qty);
        rows.push({
          id: ledgerSequence,
          order: order.name,
          kiosk: order.kiosk,
          kioskName: order.kioskName,
          sold_product: product.name,
          product: product.name,
          product_code: product.code,
          ingredient: item.item,
          item: item.code,
          item_code: item.code,
          qty,
          uom: item.uom,
          cost: roundMoney(qty * item.unitCost),
          recipe_version: "v-sim-peak-2026-05-16",
          consumed_at: order.date_order,
          create_date: order.date_order,
        });
        ledgerSequence += 1;
      });
    });
    return rows;
  });
}

function buildStockState(orders: TimedOrder[], waste: TimedWaste[], cursorMinute: number) {
  const opening = openingStockByKiosk();
  const usage = emptyKioskStock();
  const wasteUsage = emptyKioskStock();
  const received = emptyKioskStock();

  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const product = productByCode(line.product_code);
      if (product.consumptionMode !== "finished") {
        product.recipe.forEach((recipeLine) => addStock(usage, order.kiosk, recipeLine.item, recipeLine.qty * line.qty));
      }
      if (product.finishedStockItem) {
        addStock(usage, order.kiosk, product.finishedStockItem, line.qty);
      }
    });
  });

  waste.forEach((entry) => addStock(wasteUsage, entry.kiosk, entry.item, entry.qty));

  TRANSFERS.forEach((transfer) => {
    if (transfer.receivedMinute == null || transfer.receivedMinute >= cursorMinute) return;
    transfer.lines.forEach((line) => addStock(received, transfer.toKioskId, line.product, line.doneQty));
  });

  const kiosk_stock: Record<string, Array<Record<string, unknown>>> = {};
  const kiosk_stock_rows: Array<Record<string, unknown>> = [];
  const details: Record<string, Array<Record<string, unknown>>> = {};

  KIOSKS.forEach((kiosk) => {
    kiosk_stock[kiosk.id] = [];
    details[kiosk.id] = [];
    STOCK_ITEMS.forEach((item) => {
      const opened = opening[kiosk.id]?.[item.code] ?? item.kioskOpening;
      const transferred = received[kiosk.id]?.[item.code] ?? 0;
      const consumed = usage[kiosk.id]?.[item.code] ?? 0;
      const wasted = wasteUsage[kiosk.id]?.[item.code] ?? 0;
      const actual = roundQty(opened + transferred - consumed - wasted);
      const targetQty = item.kioskOpening;
      const criticalQty = roundQty(item.reorderAt * 0.4);
      const stockPercent = targetQty ? Math.max(0, Math.min(100, Math.round((actual / targetQty) * 1000) / 10)) : 0;
      const stockStatus = actual <= 0 ? "empty" : actual <= criticalQty ? "critical" : actual <= item.reorderAt ? "low" : "ok";
      const detail = {
        item: item.code,
        name: item.item,
        unit: item.uom,
        uom: item.uom,
        opening: roundQty(opened),
        received: roundQty(transferred),
        consumed: roundQty(consumed),
        waste: roundQty(wasted),
        expected: actual,
        actual,
        actual_qty: actual,
        variance: 0,
        status: stockStatus === "ok" ? "ok" : stockStatus === "low" ? "watch" : "issue",
        target_qty: targetQty,
        reorder_qty: item.reorderAt,
        critical_qty: criticalQty,
        max_qty: roundQty(targetQty * 1.25),
        stock_percent: stockPercent,
        stock_status: stockStatus,
      };
      details[kiosk.id]?.push(detail);
      kiosk_stock[kiosk.id]?.push({
        item: item.code,
        name: item.item,
        actual_qty: actual,
        qty: actual,
        uom: item.uom,
        category: item.category,
        unit_cost: item.unitCost,
        standard_price: item.unitCost,
        target_qty: targetQty,
        reorder_qty: item.reorderAt,
        critical_qty: criticalQty,
        max_qty: roundQty(targetQty * 1.25),
        stock_percent: stockPercent,
        stock_status: stockStatus,
      });
      kiosk_stock_rows.push({
        kiosk: kiosk.id,
        kioskName: kiosk.name,
        item: item.code,
        name: item.item,
        actual_qty: actual,
        qty: actual,
        uom: item.uom,
        category: item.category,
        unit_cost: item.unitCost,
        standard_price: item.unitCost,
        target_qty: targetQty,
        reorder_qty: item.reorderAt,
        critical_qty: criticalQty,
        max_qty: roundQty(targetQty * 1.25),
        stock_percent: stockPercent,
        stock_status: stockStatus,
      });
    });
  });

  const transferredOut = stockReceivedByItem(cursorMinute);
  const purchasedIn = purchaseReceivedByItem(cursorMinute);
  const warehouse_stock = STOCK_ITEMS.map((item) => ({
    item: item.code,
    name: item.item,
    actual_qty: roundQty(item.warehouseQty + (purchasedIn[item.code] ?? 0) - (transferredOut[item.code] ?? 0)),
    qty: roundQty(item.warehouseQty + (purchasedIn[item.code] ?? 0) - (transferredOut[item.code] ?? 0)),
    uom: item.uom,
    category: item.category,
    unit_cost: item.unitCost,
    standard_price: item.unitCost,
    default_purchase_qty: defaultPurchaseQtyFor(item),
  }));

  return { kiosk_stock, kiosk_stock_rows, warehouse_stock, details };
}

function buildSummary(
  orders: TimedOrder[],
  payments: PaymentRow[],
  consumption: Array<Record<string, unknown>>,
  waste: TimedWaste[],
  stock: ReturnType<typeof buildStockState>,
  closings: Array<Record<string, unknown>>,
  minutes: number,
  targetOrders: Record<string, number>,
  sourceRowCounts: {
    transferRows: number;
    purchaseOrders: number;
    supplierRows: number;
    recurringPurchaseRows: number;
    productRows: number;
    warehouseStockRows: number;
    hrEmployeeRows: number;
    hrAttendanceRows: number;
    hrShiftRows: number;
    hrCoverageRuleRows: number;
    payrollAdjustmentRows: number;
    payrollRunRows: number;
    operatingExpenseRows: number;
  },
) {
  const revenue = roundMoney(orders.reduce((sum, order) => sum + order.amount_total, 0));
  const cogs = roundMoney(consumption.reduce((sum, row) => sum + Number(row.cost || 0), 0) + finishedCogs(orders));
  const wasteCost = roundMoney(waste.reduce((sum, row) => sum + row.estimated_cost, 0));
  const varianceTotals = closeVarianceTotals(closings);
  const paymentSplit = paymentTotals(payments);
  const hourlySales = Array.from({ length: 24 }, (_value, hour) => ({
    hour,
    revenue: 0,
    orders: 0,
  }));
  const minutePulse = Array.from({ length: minutes }, (_value, minute) => ({ minute, revenue: 0, orders: 0 }));

  orders.forEach((order) => {
    const hour = Number(order.date_order.slice(11, 13));
    if (hourlySales[hour]) {
      hourlySales[hour].revenue = roundMoney(hourlySales[hour].revenue + order.amount_total);
      hourlySales[hour].orders += 1;
    }
    if (minutePulse[order.minute]) {
      minutePulse[order.minute].revenue = roundMoney(minutePulse[order.minute].revenue + order.amount_total);
      minutePulse[order.minute].orders += 1;
    }
  });

  const byKiosk = KIOSKS.map((kiosk) => {
    const kioskOrders = orders.filter((order) => order.kiosk === kiosk.id);
    const kioskRevenue = roundMoney(kioskOrders.reduce((sum, order) => sum + order.amount_total, 0));
    const kioskWaste = roundMoney(waste.filter((entry) => entry.kiosk === kiosk.id).reduce((sum, row) => sum + row.estimated_cost, 0));
    const kioskStock = stock.kiosk_stock_rows.filter((row) => row.kiosk === kiosk.id);
    const lowRows = kioskStock.filter((row) => ["empty", "critical", "low"].includes(String(row.stock_status || "")));
    const zeroRows = kioskStock.filter((row) => Number(row.actual_qty || 0) <= 0);
    const stockHealth = Math.max(0, Math.round(kioskStock.reduce((sum, row) => sum + Number(row.stock_percent || 0), 0) / Math.max(kioskStock.length, 1)));
    const cashExpected = paymentTotals(kioskOrders.flatMap((order) => order.payments)).cash;
    return {
      kioskId: kiosk.id,
      name: kiosk.name,
      city: kiosk.city,
      sales: kioskRevenue,
      revenue: kioskRevenue,
      orders: kioskOrders.length,
      targetOrders: targetOrders[kiosk.id] ?? 0,
      remainingOrders: Math.max(0, (targetOrders[kiosk.id] ?? 0) - kioskOrders.length),
      avgTicket: kioskOrders.length ? Math.round(kioskRevenue / kioskOrders.length) : 0,
      wasteCost: kioskWaste,
      stockHealth,
      lowStockItems: lowRows.length,
      zeroStockItems: zeroRows.length,
      cashExpected,
      status: zeroRows.length ? "variance_issue" : lowRows.length >= 2 ? "low_stock" : "ok",
    };
  });

  const sourceCounts = {
    orders: orders.length,
    payments: payments.length,
    consumptionRows: consumption.length,
    wasteRows: waste.length,
    closingRows: closings.length,
    stockRows: stock.kiosk_stock_rows.length,
    transferRows: sourceRowCounts.transferRows,
    purchaseOrders: sourceRowCounts.purchaseOrders,
    supplierRows: sourceRowCounts.supplierRows,
    recurringPurchaseRows: sourceRowCounts.recurringPurchaseRows,
    productRows: sourceRowCounts.productRows,
    warehouseStockRows: sourceRowCounts.warehouseStockRows,
    hrEmployeeRows: sourceRowCounts.hrEmployeeRows,
    hrAttendanceRows: sourceRowCounts.hrAttendanceRows,
    hrShiftRows: sourceRowCounts.hrShiftRows,
    hrCoverageRuleRows: sourceRowCounts.hrCoverageRuleRows,
    payrollAdjustmentRows: sourceRowCounts.payrollAdjustmentRows,
    payrollRunRows: sourceRowCounts.payrollRunRows,
    operatingExpenseRows: sourceRowCounts.operatingExpenseRows,
  };
  const profitEstimate = roundMoney(revenue - cogs - wasteCost + varianceTotals.varianceImpact);
  const closedKioskCount = new Set(closings.map((close) => String(close.kioskId || close.kiosk || ""))).size;
  const reportPeriods = {
    daily: periodSummary(revenue, cogs, wasteCost, varianceTotals, paymentSplit, sourceCounts, 1),
    weekly: periodSummary(revenue, cogs, wasteCost, varianceTotals, paymentSplit, sourceCounts, 7),
    monthly: periodSummary(revenue, cogs, wasteCost, varianceTotals, paymentSplit, sourceCounts, 30),
    yearly: periodSummary(revenue, cogs, wasteCost, varianceTotals, paymentSplit, sourceCounts, 365),
  };

  return {
    totals: {
      salesToday: revenue,
      ordersToday: orders.length,
      avgTicket: orders.length ? Math.round(revenue / orders.length) : 0,
      cogs,
      wasteCost,
      cashVariance: varianceTotals.cashVariance,
      stockVarianceValue: varianceTotals.stockVarianceValue,
      varianceImpact: varianceTotals.varianceImpact,
      profitEstimate,
      cashExpected: paymentSplit.cash,
      openingCashFloat: 250_000 * KIOSKS.length,
      digitalPayments: paymentSplit.digital,
      openKiosks: Math.max(0, KIOSKS.length - closedKioskCount),
      closedKiosks: closedKioskCount,
      margin: revenue ? Number(((profitEstimate / revenue) * 100).toFixed(1)) : 0,
      payrollExpense: reportPeriods.daily.payrollExpense,
      operatingExpenses: 0,
      netProfitAfterPayroll: reportPeriods.daily.netProfitAfterPayroll,
    },
    alerts: {
      lowStockItems: stock.kiosk_stock_rows.filter((row) => Number(row.actual_qty || 0) < stockItem(String(row.item)).reorderAt).length,
      unresolvedVariances: closings.filter((close) => ["pending", "issue"].includes(String(close.status || ""))).length,
    },
    payments: paymentSplit,
    byKiosk,
    simulation: {
      minutes,
      targetOrders,
      totalTargetOrders: Object.values(targetOrders).reduce((sum, value) => sum + value, 0),
      completedOrders: orders.length,
      progress: Object.values(targetOrders).reduce((sum, value) => sum + value, 0)
        ? Number((orders.length / Object.values(targetOrders).reduce((sum, value) => sum + value, 0)).toFixed(4))
        : 0,
    },
    hourlySales,
    hourlyPulse: hourlySales,
    minutePulse,
    sourceCounts,
    reportPeriods,
  };
}

function buildSalesRows(orders: TimedOrder[]) {
  return KIOSKS.map((kiosk) => {
    const kioskOrders = orders.filter((order) => order.kiosk === kiosk.id);
    return {
      kiosk: kiosk.id,
      pos_config: `${kiosk.id} POS`,
      revenue: roundMoney(kioskOrders.reduce((sum, order) => sum + order.amount_total, 0)),
      orders: kioskOrders.length,
    };
  });
}

function buildClosingRows(
  orders: TimedOrder[],
  waste: TimedWaste[],
  details: Record<string, Array<Record<string, unknown>>>,
  minutes: number,
) {
  const closeKiosks = ["K-02", "K-04", "K-09"];
  return closeKiosks.map((kioskId, index) => {
    const kiosk = KIOSKS.find((row) => row.id === kioskId) ?? KIOSKS[0];
    const kioskOrders = orders.filter((order) => order.kiosk === kioskId);
    const kioskPayments = paymentTotals(kioskOrders.flatMap((order) => order.payments));
    const sales = roundMoney(kioskOrders.reduce((sum, order) => sum + order.amount_total, 0));
    const cashExpected = kioskPayments.cash + 250_000;
    const variance = kioskId === "K-04" ? -38_000 : kioskId === "K-09" ? 6_000 : 0;
    const stock = (details[kioskId] || []).slice(0, 6).map((line, lineIndex) => {
      const expected = Number(line.actual || 0);
      const stockVariance = kioskId === "K-04" && lineIndex === 2 ? -1.4 : 0;
      const item = stockItem(String(line.item));
      const value = roundMoney(stockVariance * item.unitCost);
      return {
        item: line.item,
        unit: line.uom,
        expected,
        actual: roundQty(expected + stockVariance),
        variance: stockVariance,
        value,
        varianceValue: value,
        status: stockVariance ? "issue" : "ok",
      };
    });
    return {
      id: `SIM-CLOSE-${kioskId}`,
      name: `SIM-CLOSE-${String(index + 1).padStart(3, "0")}`,
      kioskId,
      kioskName: kiosk.name,
      city: kiosk.city,
      cashier: kiosk.cashier,
      openedAt: timestamp(0, 0),
      closedAt: timestamp(minutes, index * 4),
      sales,
      expectedCash: cashExpected,
      actualCash: cashExpected + variance,
      cashVariance: variance,
      digitalPayments: kioskPayments.digital,
      status: variance < 0 ? "pending" : "approved",
      notes: variance < 0 ? "Manager review required: cash short and orange count variance." : "No exceptions.",
      stock,
      recipePostingIssues: 0,
      recipePostingIssueOrders: [],
      wasteCost: roundMoney(waste.filter((entry) => entry.kiosk === kioskId).reduce((sum, row) => sum + row.estimated_cost, 0)),
      orderCount: kioskOrders.length,
    };
  });
}

export function buildSimulationTransferSuggestions(kioskStockRows: Array<Record<string, unknown>>) {
  return kioskStockRows
    .filter((row) => ["empty", "critical", "low"].includes(String(row.stock_status || "")))
    .slice(0, 12)
    .map((row) => {
      const item = stockItem(String(row.item));
      const targetQty = Number(row.target_qty || item.kioskOpening);
      const qty = roundQty(Math.max(1, targetQty - Number(row.actual_qty || 0)));
      return {
        kiosk: row.kiosk,
        kioskName: row.kioskName,
        item: item.code,
        qty,
        uom: item.uom,
        cover: "<1 day",
        reason: `${item.item} below configured target after peak-hour consumption`,
        actual_qty: Number(row.actual_qty || 0),
        target_qty: targetQty,
        reorder_qty: Number(row.reorder_qty || item.reorderAt),
        critical_qty: Number(row.critical_qty || item.reorderAt * 0.4),
        stock_percent: Number(row.stock_percent || 0),
      };
    });
}

function buildPurchaseOrders(cursorMinute: number) {
  return [
    {
      id: 6401,
      name: "PO/SIM/ORANGES-0516",
      supplier: "Mesopotamia Fresh",
      state: cursorMinute >= 22 ? "partial" : "purchase",
      receipt_state: cursorMinute >= 22 ? "partial" : "none",
      amount_total: 1_920_000,
      expected_date: START_DATE,
      warehouse: "Baghdad Area Warehouse",
      lines: [
        { product: "ORANGES", orderedQty: 1_600, receivedQty: cursorMinute >= 22 ? 900 : 0, uom: "kg", priceUnit: 1_200 },
      ],
    },
    {
      id: 6402,
      name: "PO/SIM/DAIRY-0516",
      supplier: "Tigris Dairy",
      state: "purchase",
      receipt_state: "none",
      amount_total: 960_000,
      expected_date: START_DATE,
      warehouse: "Baghdad Area Warehouse",
      lines: [
        { product: "MILK-WHOLE", orderedQty: 640, receivedQty: 0, uom: "L", priceUnit: 1_500 },
      ],
    },
  ];
}

function buildSuppliers() {
  return [
    { id: 1, name: "Mesopotamia Fresh", category: "Supplier", address: "", deliveryCategory: "Review", delivery_category: "Review", products: ["ORANGES", "SUGAR"], lead_time_days: 1 },
    { id: 2, name: "Tigris Dairy", category: "Supplier", address: "", deliveryCategory: "Review", delivery_category: "Review", products: ["MILK-WHOLE"], lead_time_days: 1 },
    { id: 3, name: "Baghdad Roasters", category: "Supplier", address: "", deliveryCategory: "Review", delivery_category: "Review", products: ["COFFEE-BEANS"], lead_time_days: 2 },
    { id: 4, name: "Date Palm Bakery", category: "Supplier", address: "", deliveryCategory: "Review", delivery_category: "Review", products: ["CROISSANT-PLAIN", "CAKE-SLICE"], lead_time_days: 1 },
    { id: 5, name: "Iraq Pack", category: "Supplier", address: "", deliveryCategory: "Review", delivery_category: "Review", products: ["CUP-12OZ", "LID-12OZ", "STRAW"], lead_time_days: 1 },
  ];
}

function buildRecurringPurchases() {
  return [
    {
      id: 1,
      name: "Daily oranges replenishment",
      supplier: "Mesopotamia Fresh",
      warehouse: "Baghdad Area Warehouse",
      cadence: "daily",
      frequency: "daily",
      weekday: 0,
      next_run: START_DATE,
      nextDate: START_DATE,
      product: "ORANGES",
      qty: 1_400,
      uom: "kg",
      active: true,
      lines: [{ product: "ORANGES", qty: 1_400, uom: "kg", rate: 1_200 }],
    },
    {
      id: 2,
      name: "Daily milk replenishment",
      supplier: "Tigris Dairy",
      warehouse: "Baghdad Area Warehouse",
      cadence: "daily",
      frequency: "daily",
      weekday: 0,
      next_run: START_DATE,
      nextDate: START_DATE,
      product: "MILK-WHOLE",
      qty: 520,
      uom: "L",
      active: true,
      lines: [{ product: "MILK-WHOLE", qty: 520, uom: "L", rate: 1_500 }],
    },
    {
      id: 3,
      name: "Weekly coffee-bean replenishment",
      supplier: "Baghdad Roasters",
      warehouse: "Baghdad Area Warehouse",
      cadence: "weekly",
      frequency: "weekly",
      weekday: 0,
      next_run: START_DATE,
      nextDate: START_DATE,
      product: "COFFEE-BEANS",
      qty: 160,
      uom: "kg",
      active: true,
      lines: [{ product: "COFFEE-BEANS", qty: 160, uom: "kg", rate: 18_000 }],
    },
  ];
}

function buildHrSnapshot(cursorMinute: number) {
  return {
    employees: KIOSKS.flatMap((kiosk, index) => [
      { id: `${kiosk.id}-cashier`, name: kiosk.cashier, role: "cashier", kiosk: kiosk.id, kioskName: kiosk.name, status: "on_shift", monthlySalary: 62_000, expectedMonthlyHours: 168, hourlyRate: 369 },
      { id: `${kiosk.id}-barista`, name: `Barista ${index + 1}`, role: "barista", kiosk: kiosk.id, kioskName: kiosk.name, status: "on_shift", monthlySalary: 56_000, expectedMonthlyHours: 168, hourlyRate: 333 },
    ]),
    attendance: KIOSKS.map((kiosk, index) => ({
      id: `ATT-${kiosk.id}`,
      employee: kiosk.cashier,
      kiosk: kiosk.id,
      checkIn: timestamp(0, index),
      state: "checked_in",
    })),
    shifts: KIOSKS.map((kiosk) => ({
      id: `SHIFT-${kiosk.id}`,
      employee: kiosk.cashier,
      kiosk: kiosk.id,
      kioskName: kiosk.name,
      date: START_DATE,
      startHour: 13,
      endHour: 21,
      role: "cashier",
      plannedHours: 8,
      state: "active",
    })),
    coverageRules: [],
    adjustments: [],
    payrollRuns: [],
    expenses: [],
    coverageGaps: cursorMinute >= 18 ? [{
      ruleId: "SIM-COVER-K-07-RUNNER",
      date: START_DATE,
      kiosk: "K-07",
      kioskName: "Karada Riverside",
      role: "runner",
      startHour: 16.5,
      endHour: 17,
      requiredCount: 1,
      assignedCount: 0,
      missingCount: 1,
      gapMinutes: 30,
      severity: "watch",
    }] : [],
    summary: {
      onShift: KIOSKS.length * 2,
      gaps: cursorMinute >= 18 ? 1 : 0,
      payrollAccrued: 1_180_000,
    },
  };
}

function transferRow(transfer: SimulationTransfer, cursorMinute: number) {
  const bayaan_state = transferState(transfer, cursorMinute);
  const completed = bayaan_state === "completed";
  const lines = transfer.lines.map((line) => {
    const receivedQty = completed ? line.doneQty : 0;
    return {
      ...line,
      doneQty: receivedQty,
      receivedQty,
    };
  });
  const receivedQtyTotal = roundQty(lines.reduce((sum, line) => sum + Number(line.receivedQty || 0), 0));
  return {
    id: transfer.id,
    name: transfer.name,
    from: transfer.from,
    to: transfer.to,
    toKioskId: transfer.toKioskId,
    location_src: transfer.from,
    location_dest: transfer.to,
    bayaan_state,
    state: bayaan_state === "completed" ? "done" : "assigned",
    scheduledAt: timestamp(transfer.dispatchedMinute, 0),
    createdAt: timestamp(transfer.createdMinute, 0),
    doneAt: transfer.receivedMinute && transfer.receivedMinute < cursorMinute ? timestamp(transfer.receivedMinute, 0) : null,
    movedQty: transfer.movedQty ?? receivedQtyTotal,
    receiptShortageQty: transfer.receiptShortageQty ?? 0,
    lines,
  };
}

function transferState(transfer: SimulationTransfer, cursorMinute: number) {
  if (transfer.receivedMinute != null && cursorMinute > transfer.receivedMinute) return "completed";
  if (cursorMinute > transfer.dispatchedMinute) return "dispatched";
  if (cursorMinute > transfer.pickedMinute) return "picked";
  if (cursorMinute > transfer.approvedMinute) return "approved";
  return "draft";
}

function stockReceivedByItem(cursorMinute: number) {
  const received: Record<string, number> = {};
  TRANSFERS.forEach((transfer) => {
    if (transfer.receivedMinute == null || transfer.receivedMinute >= cursorMinute) return;
    transfer.lines.forEach((line) => {
      received[line.product] = roundQty((received[line.product] ?? 0) + line.doneQty);
    });
  });
  return received;
}

function purchaseReceivedByItem(cursorMinute: number) {
  const received: Record<string, number> = {};
  buildPurchaseOrders(cursorMinute).forEach((purchaseOrder) => {
    purchaseOrder.lines.forEach((line) => {
      const qty = Number(line.receivedQty || 0);
      if (qty <= 0) return;
      received[line.product] = roundQty((received[line.product] ?? 0) + qty);
    });
  });
  return received;
}

function openingStockByKiosk() {
  return Object.fromEntries(KIOSKS.map((kiosk) => [
    kiosk.id,
    Object.fromEntries(STOCK_ITEMS.map((item) => [
      item.code,
      STOCK_OVERRIDES[kiosk.id]?.[item.code] ?? item.kioskOpening,
    ])),
  ]));
}

function emptyKioskStock() {
  return Object.fromEntries(KIOSKS.map((kiosk) => [kiosk.id, {} as Record<string, number>]));
}

function addStock(rows: Record<string, Record<string, number>>, kioskId: string, itemCode: string, qty: number) {
  rows[kioskId] = rows[kioskId] ?? {};
  rows[kioskId][itemCode] = roundQty((rows[kioskId][itemCode] ?? 0) + qty);
}

function productByCode(code: string) {
  const product = PRODUCTS.find((row) => row.code === code);
  if (!product) throw new Error(`Unknown simulation product ${code}`);
  return product;
}

function stockItem(code: string) {
  const item = STOCK_ITEMS.find((row) => row.code === code || row.item === code);
  if (!item) throw new Error(`Unknown simulation stock item ${code}`);
  return item;
}

function paymentTotals(payments: PaymentRow[]) {
  const split = {
    cash: 0,
    card: 0,
    qr: 0,
    mobile_wallet: 0,
    bank_app: 0,
    manual_digital: 0,
    digital_other: 0,
    digital: 0,
    total: 0,
  };
  payments.forEach((payment) => {
    const amount = Number(payment.amount || 0);
    const category = payment.provider.category;
    if (category === "cash") split.cash += amount;
    else if (category === "card") split.card += amount;
    else if (category === "qr") split.qr += amount;
    else if (category === "mobile_wallet") split.mobile_wallet += amount;
    else if (category === "bank_app") split.bank_app += amount;
    else if (category === "manual_digital") split.manual_digital += amount;
    else split.digital_other += amount;
  });
  split.digital = split.card + split.qr + split.mobile_wallet + split.bank_app + split.manual_digital + split.digital_other;
  split.total = split.cash + split.digital;
  Object.keys(split).forEach((key) => {
    split[key as keyof typeof split] = roundMoney(split[key as keyof typeof split]);
  });
  return split;
}

function periodSummary(
  revenue: number,
  cogs: number,
  wasteCost: number,
  varianceTotals: ReturnType<typeof closeVarianceTotals>,
  payments: ReturnType<typeof paymentTotals>,
  sourceCounts: Record<string, number>,
  multiplier: number,
) {
  const payrollExpense = Math.round(1_180_000 * multiplier);
  const varianceImpact = roundMoney(varianceTotals.varianceImpact * multiplier);
  const profitBeforePayroll = roundMoney((revenue - cogs - wasteCost) * multiplier + varianceImpact);
  const hasOperatingActivity = revenue || cogs || wasteCost || varianceImpact || payments.total;
  const profitAfterPayroll = roundMoney(profitBeforePayroll - payrollExpense);
  return {
    revenue: roundMoney(revenue * multiplier),
    cogs: roundMoney(cogs * multiplier),
    wasteCost: roundMoney(wasteCost * multiplier),
    cashVariance: roundMoney(varianceTotals.cashVariance * multiplier),
    stockVarianceValue: roundMoney(varianceTotals.stockVarianceValue * multiplier),
    varianceImpact,
    payrollExpense,
    netProfit: profitBeforePayroll,
    netProfitAfterPayroll: hasOperatingActivity ? profitAfterPayroll : 0,
    cashExpected: roundMoney(payments.cash * multiplier),
    openingCashFloat: roundMoney(250_000 * KIOSKS.length * multiplier),
    digitalPayments: roundMoney(payments.digital * multiplier),
    payments: Object.fromEntries(Object.entries(payments).map(([key, value]) => [key, roundMoney(value * multiplier)])),
    sourceCounts,
  };
}

function closeVarianceTotals(closings: Array<Record<string, unknown>>) {
  const cashVariance = roundMoney(closings.reduce((sum, close) => sum + Number(close.cashVariance || 0), 0));
  const stockVarianceValue = roundMoney(closings.reduce((sum, close) => {
    const stock = Array.isArray(close.stock) ? close.stock as Array<Record<string, unknown>> : [];
    return sum + stock.reduce((stockSum, line) => stockSum + Number(line.value || 0), 0);
  }, 0));
  return {
    cashVariance,
    stockVarianceValue,
    varianceImpact: roundMoney(cashVariance + stockVarianceValue),
  };
}

function finishedCogs(orders: Array<{ lines: OrderLine[] }>) {
  return roundMoney(orders.reduce((sum, order) => {
    return sum + order.lines.reduce((lineSum, line) => {
      const product = productByCode(line.product_code);
      if (!product.finishedStockItem) return lineSum;
      return lineSum + product.standardPrice * line.qty;
    }, 0);
  }, 0));
}

function demandWeight(minute: number, minutes: number, kiosk: KioskProfile) {
  const base = demandWave(minute, minutes);
  const kioskLift = 0.82 + kiosk.rate * 0.12;
  const cashierRamp = minute < 5 ? 0.72 + minute * 0.06 : 1;
  return Math.max(0.05, base * kioskLift * cashierRamp);
}

function demandWave(minute: number, minutes: number) {
  const progress = minute / Math.max(1, minutes - 1);
  const openingRamp = 0.55 + Math.min(0.45, progress * 1.2);
  const centerRush = 1 + Math.exp(-Math.pow((progress - 0.52) / 0.22, 2)) * 0.55;
  const lateRush = progress >= 0.68 ? 1.16 : 1;
  return openingRamp * centerRush * lateRush;
}

function chooseWeighted<T>(rng: () => number, rows: T[], weightFor: (row: T) => number) {
  const total = rows.reduce((sum, row) => sum + weightFor(row), 0);
  let cursor = rng() * total;
  for (const row of rows) {
    cursor -= weightFor(row);
    if (cursor <= 0) return row;
  }
  return rows[rows.length - 1] as T;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function auditSnapshot(
  snapshot: PeakSimulationSnapshot,
  startSnapshot?: PeakSimulationSnapshot,
  midSnapshot?: PeakSimulationSnapshot,
  expectedMinutes = DEFAULT_MINUTES,
  expectedTargetOrders?: Record<string, number>,
  targetOrderOverrides?: Record<string, number>,
) {
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };
  const orders = snapshot.today.orders;
  const payments = snapshot.today.payments;
  const wasteRows = snapshot.today.waste;
  const revenue = roundMoney(orders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0));
  const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const wasteCost = roundMoney(wasteRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0));
  const paymentSplit = paymentTotals(payments);
  const hourlyTotal = roundMoney(snapshot.summary.hourlySales.reduce((sum, row) => sum + Number(row.revenue || 0), 0));
  const sourceCounts = snapshot.summary.sourceCounts;

  check(snapshot.kiosks.length === 10, "expected exactly 10 operational kiosks");
  const targetOrders = snapshot.meta.simulation.targetOrders;
  const totalTargetOrders = snapshot.meta.simulation.totalTargetOrders;

  if (startSnapshot) {
    check(startSnapshot.today.orders.length === 0, "minute 0 should start with zero orders");
    check(startSnapshot.today.payments.length === 0, "minute 0 should start with zero payments");
    check(startSnapshot.today.consumption.length === 0, "minute 0 should start with zero ledger rows");
    check(startSnapshot.today.waste.length === 0, "minute 0 should start with zero waste rows");
    check(startSnapshot.closings.length === 0, "minute 0 should not include close rows");
    check(startSnapshot.summary.sourceCounts.orders === 0, "minute 0 sourceCounts.orders should be zero");
    check(startSnapshot.summary.sourceCounts.payments === 0, "minute 0 sourceCounts.payments should be zero");
    check(startSnapshot.summary.sourceCounts.consumptionRows === 0, "minute 0 sourceCounts.consumptionRows should be zero");
    check(startSnapshot.summary.sourceCounts.wasteRows === 0, "minute 0 sourceCounts.wasteRows should be zero");
    check(startSnapshot.summary.sourceCounts.transferRows === startSnapshot.transfers.length, "minute 0 sourceCounts.transferRows mismatch");
    check(startSnapshot.summary.sourceCounts.purchaseOrders === startSnapshot.purchase_orders.length, "minute 0 sourceCounts.purchaseOrders mismatch");
    check(startSnapshot.summary.sourceCounts.supplierRows === startSnapshot.suppliers.length, "minute 0 sourceCounts.supplierRows mismatch");
    check(startSnapshot.summary.sourceCounts.recurringPurchaseRows === startSnapshot.recurring_purchases.length, "minute 0 sourceCounts.recurringPurchaseRows mismatch");
    check(startSnapshot.summary.sourceCounts.productRows === startSnapshot.products.length, "minute 0 sourceCounts.productRows mismatch");
    check(startSnapshot.summary.sourceCounts.warehouseStockRows === startSnapshot.warehouse_stock.length, "minute 0 sourceCounts.warehouseStockRows mismatch");
    check(startSnapshot.summary.sourceCounts.hrEmployeeRows === startSnapshot.hr.employees.length, "minute 0 sourceCounts.hrEmployeeRows mismatch");
    check(startSnapshot.summary.sourceCounts.hrShiftRows === startSnapshot.hr.shifts.length, "minute 0 sourceCounts.hrShiftRows mismatch");
    check(startSnapshot.summary.sourceCounts.hrAttendanceRows === startSnapshot.hr.attendance.length, "minute 0 sourceCounts.hrAttendanceRows mismatch");
    check(startSnapshot.summary.sourceCounts.hrCoverageRuleRows === startSnapshot.hr.coverageRules.length, "minute 0 sourceCounts.hrCoverageRuleRows mismatch");
    check(startSnapshot.summary.sourceCounts.payrollAdjustmentRows === 0, "minute 0 sourceCounts.payrollAdjustmentRows should be zero");
    check(startSnapshot.summary.sourceCounts.payrollRunRows === 0, "minute 0 sourceCounts.payrollRunRows should be zero");
    check(startSnapshot.summary.sourceCounts.operatingExpenseRows === 0, "minute 0 sourceCounts.operatingExpenseRows should be zero");
    check(Number(startSnapshot.summary.reportPeriods.daily.payrollExpense || 0) === Number(startSnapshot.hr.summary.payrollAccrued || 0), "minute 0 daily report should accrue payroll before payroll runs exist");
    check(Number(startSnapshot.summary.reportPeriods.daily.netProfitAfterPayroll || 0) === 0, "minute 0 net profit after payroll should stay zero with no sales");
  }
  if (midSnapshot) {
    check(midSnapshot.suggested_transfers.length > 0, "expected low-stock transfer suggestions before peak receipts land");
  }
  if (expectedTargetOrders) {
    KIOSKS.forEach((kiosk) => {
      check(targetOrders[kiosk.id] === expectedTargetOrders[kiosk.id], `${kiosk.id} target order override was not preserved`);
    });
  }
  auditMinuteCausality(Number(snapshot.meta.simulation.seed || DEFAULT_SEED), expectedMinutes, targetOrders, targetOrderOverrides)
    .forEach((message) => check(false, message));

  check(snapshot.meta.simulation.minutes === expectedMinutes, `expected a ${expectedMinutes}-minute operating snippet`);
  check(orders.length === totalTargetOrders, `expected ${totalTargetOrders} target orders, got ${orders.length}`);
  check(new Set(orders.map((order) => order.kiosk)).size === 10, "expected all 10 kiosks to receive orders");
  check(new Set(orders.map((order) => order.name)).size === orders.length, "order names must be unique");
  check(new Set(payments.map((payment) => payment.id)).size === payments.length, "payment ids must be unique");
  check(orders.every((order) => order.payments.length === 1), "every order must have one payment row");
  check(orders.every((order) => order.consumption_state === "posted"), "every simulated paid order must post recipe consumption");
  orders.forEach((order) => {
    const lineTotal = roundMoney(order.lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0));
    const orderPaymentTotal = roundMoney(order.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    check(Math.abs(Number(order.amount_total || 0) - lineTotal) <= 0.001, `${order.name} order total did not reconcile to line subtotals`);
    check(Math.abs(orderPaymentTotal - Number(order.amount_total || 0)) <= 0.001, `${order.name} payment total did not reconcile to order total`);
    check(order.payments.every((payment) => payment.order === order.name), `${order.name} has a detached payment row`);
    order.lines.forEach((line, lineIndex) => {
      const expectedSubtotal = roundMoney(Number(line.price_unit || 0) * Number(line.qty || 0));
      check(Number(line.qty || 0) > 0, `${order.name} line ${lineIndex + 1} has non-positive quantity`);
      check(Math.abs(Number(line.subtotal || 0) - expectedSubtotal) <= 0.001, `${order.name} line ${lineIndex + 1} subtotal did not reconcile`);
    });
  });
  check(Math.abs(revenue - paymentTotal) <= 0.001, `payment total ${paymentTotal} did not match revenue ${revenue}`);
  check(Math.abs(revenue - paymentSplit.total) <= 0.001, `payment split total ${paymentSplit.total} did not match revenue ${revenue}`);
  check(Math.abs(revenue - snapshot.summary.totals.salesToday) <= 0.001, "summary revenue did not match order rows");
  check(Math.abs(Number(snapshot.summary.totals.wasteCost || 0) - wasteCost) <= 0.001, "summary waste cost did not reconcile to waste rows");
  check(new Set(wasteRows.map((row) => row.id)).size === wasteRows.length, "waste entry ids must be unique");
  wasteRows.forEach((row) => {
    const item = STOCK_ITEMS.find((candidate) => candidate.code === row.item);
    const kiosk = KIOSKS.find((candidate) => candidate.id === row.kiosk);
    check(Boolean(item), `${String(row.id || "unknown waste")} references unknown stock item ${String(row.item || "")}`);
    check(Boolean(kiosk), `${String(row.id || "unknown waste")} references unknown kiosk ${String(row.kiosk || "")}`);
    check(Number(row.qty || 0) > 0, `${String(row.id || "unknown waste")} has non-positive waste quantity`);
    check(Boolean(row.reason), `${String(row.id || "unknown waste")} is missing a waste reason`);
    if (item) {
      check(row.uom === item.uom, `${String(row.id || "unknown waste")} waste unit did not match stock item unit`);
      check(Math.abs(Number(row.estimated_cost || 0) - roundMoney(Number(row.qty || 0) * item.unitCost)) <= 0.001, `${String(row.id || "unknown waste")} waste cost did not match quantity times unit cost`);
    }
  });
  check(Math.abs(Number(snapshot.summary.totals.cashExpected || 0) - paymentSplit.cash) <= 0.001, "summary cash expected should only include simulated cash payments");
  check(Math.abs(Number(snapshot.summary.totals.digitalPayments || 0) - paymentSplit.digital) <= 0.001, "summary digital payments did not reconcile to simulated non-cash payments");
  check(Math.abs(Number(snapshot.summary.totals.openingCashFloat || 0) - 250_000 * KIOSKS.length) <= 0.001, "summary opening cash float should stay separate from simulated cash payments");
  check(Math.abs(Number(snapshot.summary.payments.cash || 0) - paymentSplit.cash) <= 0.001, "summary payment split cash did not reconcile");
  check(Math.abs(Number(snapshot.summary.payments.digital || 0) - paymentSplit.digital) <= 0.001, "summary payment split digital did not reconcile");
  check(Math.abs(Number(snapshot.summary.payments.total || 0) - revenue) <= 0.001, "summary payment split total did not reconcile to revenue");
  check(Math.abs(revenue - hourlyTotal) <= 0.001, "hourly pulse did not reconcile to order revenue");
  const varianceTotals = closeVarianceTotals(snapshot.closings);
  check(Number(snapshot.summary.totals.cashVariance || 0) === varianceTotals.cashVariance, "summary cash variance did not reconcile to close rows");
  check(Number(snapshot.summary.totals.stockVarianceValue || 0) === varianceTotals.stockVarianceValue, "summary stock variance value did not reconcile to close rows");
  check(Number(snapshot.summary.totals.varianceImpact || 0) === varianceTotals.varianceImpact, "summary variance impact did not reconcile to close rows");
  check(
    Number(snapshot.summary.totals.profitEstimate || 0) === roundMoney(revenue - Number(snapshot.summary.totals.cogs || 0) - Number(snapshot.summary.totals.wasteCost || 0) + varianceTotals.varianceImpact),
    "summary profit estimate did not include variance impact",
  );
  const payrollAccrued = Number(snapshot.hr?.summary?.payrollAccrued || 0);
  const employeePayroll = roundMoney((snapshot.hr?.employees || []).reduce((sum, employee) => sum + Number(employee.monthlySalary || 0), 0));
  check(payrollAccrued > 0, "HR payroll accrued should be present for accounting reports");
  check(employeePayroll === payrollAccrued, "HR payroll accrued did not reconcile to employee pay rows");
  check((snapshot.hr?.employees || []).length === 20, "HR simulation should include two staff rows per kiosk");
  check(Number(snapshot.hr?.summary?.onShift || 0) === (snapshot.hr?.employees || []).length, "HR on-shift count did not reconcile to employee rows");
  check(Number(snapshot.hr?.summary?.gaps || 0) === (snapshot.hr?.coverageGaps || []).length, "HR coverage gap count did not reconcile to gap rows");
  check(Number(snapshot.summary.reportPeriods.daily.varianceImpact || 0) === varianceTotals.varianceImpact, "daily report variance impact did not reconcile");
  check(Number(snapshot.summary.reportPeriods.daily.netProfit || 0) === Number(snapshot.summary.totals.profitEstimate || 0), "daily report net profit did not reconcile before payroll");
  const periodMultipliers = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    yearly: 365,
  } as const;
  Object.entries(periodMultipliers).forEach(([periodKey, multiplier]) => {
    const period = snapshot.summary.reportPeriods[periodKey as keyof typeof snapshot.summary.reportPeriods];
    const periodPayments = period.payments || {};
    check(Math.abs(Number(period.revenue || 0) - roundMoney(revenue * multiplier)) <= 0.001, `${periodKey} report revenue did not reconcile`);
    check(Math.abs(Number(period.wasteCost || 0) - roundMoney(wasteCost * multiplier)) <= 0.001, `${periodKey} report waste cost did not reconcile`);
    check(Math.abs(Number(period.cashExpected || 0) - roundMoney(paymentSplit.cash * multiplier)) <= 0.001, `${periodKey} report cash expected did not reconcile`);
    check(Math.abs(Number(period.digitalPayments || 0) - roundMoney(paymentSplit.digital * multiplier)) <= 0.001, `${periodKey} report digital payments did not reconcile`);
    check(Math.abs(Number(periodPayments.cash || 0) - roundMoney(paymentSplit.cash * multiplier)) <= 0.001, `${periodKey} report payment split cash did not reconcile`);
    check(Math.abs(Number(periodPayments.digital || 0) - roundMoney(paymentSplit.digital * multiplier)) <= 0.001, `${periodKey} report payment split digital did not reconcile`);
    check(Math.abs(Number(periodPayments.total || 0) - roundMoney(revenue * multiplier)) <= 0.001, `${periodKey} report payment split total did not reconcile`);
    check(Math.abs(Number(period.netProfit || 0) - roundMoney(Number(snapshot.summary.totals.profitEstimate || 0) * multiplier)) <= 0.001, `${periodKey} report net profit did not reconcile before payroll`);
    check(Math.abs(Number(period.payrollExpense || 0) - roundMoney(payrollAccrued * multiplier)) <= 0.001, `${periodKey} report payroll did not reconcile to HR snapshot`);
    const hasPeriodActivity = Number(period.revenue || 0) || Number(period.cogs || 0) || Number(period.wasteCost || 0) || Number(period.varianceImpact || 0) || Number(periodPayments.total || 0);
    const operatingExpenses = Number((period as Record<string, unknown>).operatingExpenses || 0);
    const expectedNetAfterPayroll = hasPeriodActivity
      ? roundMoney(Number(period.netProfit || 0) - Number(period.payrollExpense || 0) - operatingExpenses)
      : 0;
    check(Math.abs(Number(period.netProfitAfterPayroll || 0) - expectedNetAfterPayroll) <= 0.001, `${periodKey} report net profit after payroll did not reconcile`);
  });
  const expectedLedgerRows = orders.reduce((sum, order) => {
    return sum + order.lines.reduce((lineSum, line) => {
      const product = productByCode(line.product_code);
      return lineSum + (product.consumptionMode === "finished" ? 0 : product.recipe.length);
    }, 0);
  }, 0);
  check(snapshot.today.consumption.length === expectedLedgerRows, `expected ${expectedLedgerRows} recipe ledger rows, got ${snapshot.today.consumption.length}`);
  const ledgerRowsByKey = new Map<string, Array<Record<string, unknown>>>();
  snapshot.today.consumption.forEach((row) => {
    const key = `${String(row.order || "")}|${String(row.product_code || "")}|${String(row.item_code || row.item || "")}`;
    const rows = ledgerRowsByKey.get(key) || [];
    rows.push(row);
    ledgerRowsByKey.set(key, rows);
    const order = orders.find((candidate) => candidate.name === row.order);
    check(Boolean(order), `${String(row.order || "unknown order")} consumption row has no paid order`);
    if (order) {
      check(row.kiosk === order.kiosk, `${order.name} consumption row kiosk did not match order kiosk`);
      check(row.consumed_at === order.date_order, `${order.name} consumption row timestamp did not match order timestamp`);
    }
    check(row.recipe_version === "v-sim-peak-2026-05-16", `${String(row.order || "unknown order")} consumption row did not pin the simulation recipe version`);
  });
  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const product = productByCode(line.product_code);
      if (product.consumptionMode === "finished") {
        const finishedRows = snapshot.today.consumption.filter((row) => row.order === order.name && row.product_code === product.code);
        check(finishedRows.length === 0, `${order.name} finished product ${product.code} should not create recipe ledger rows`);
        return;
      }
      product.recipe.forEach((recipeLine) => {
        const item = stockItem(recipeLine.item);
        const key = `${order.name}|${product.code}|${item.code}`;
        const rows = ledgerRowsByKey.get(key) || [];
        check(rows.length === 1, `${order.name} ${product.code} ${item.code} expected one recipe ledger row, got ${rows.length}`);
        const row = rows[0];
        if (!row) return;
        const expectedQty = roundQty(recipeLine.qty * line.qty);
        const expectedCost = roundMoney(expectedQty * item.unitCost);
        check(row.sold_product === product.name, `${order.name} ${product.code} ledger product name did not match`);
        check(row.ingredient === item.item, `${order.name} ${product.code} ${item.code} ingredient label did not match`);
        check(row.uom === item.uom, `${order.name} ${product.code} ${item.code} unit did not match`);
        check(Math.abs(Number(row.qty || 0) - expectedQty) <= 0.001, `${order.name} ${product.code} ${item.code} ledger quantity did not match recipe`);
        check(Math.abs(Number(row.cost || 0) - expectedCost) <= 0.001, `${order.name} ${product.code} ${item.code} ledger cost did not match unit cost`);
      });
    });
  });
  check(Math.abs(Number(snapshot.summary.totals.cogs || 0) - roundMoney(snapshot.today.consumption.reduce((sum, row) => sum + Number(row.cost || 0), 0) + finishedCogs(orders))) <= 0.001, "COGS did not reconcile to recipe ledger plus finished SKU COGS");
  check(sourceCounts.orders === orders.length, "sourceCounts.orders mismatch");
  check(sourceCounts.payments === payments.length, "sourceCounts.payments mismatch");
  check(sourceCounts.consumptionRows === snapshot.today.consumption.length, "sourceCounts.consumptionRows mismatch");
  check(sourceCounts.wasteRows === snapshot.today.waste.length, "sourceCounts.wasteRows mismatch");
  check(sourceCounts.closingRows === snapshot.closings.length, "sourceCounts.closingRows mismatch");
  check(sourceCounts.stockRows === snapshot.kiosk_stock_rows.length, "sourceCounts.stockRows mismatch");
  check(sourceCounts.transferRows === snapshot.transfers.length, "sourceCounts.transferRows mismatch");
  check(sourceCounts.purchaseOrders === snapshot.purchase_orders.length, "sourceCounts.purchaseOrders mismatch");
  check(sourceCounts.supplierRows === snapshot.suppliers.length, "sourceCounts.supplierRows mismatch");
  check(sourceCounts.recurringPurchaseRows === snapshot.recurring_purchases.length, "sourceCounts.recurringPurchaseRows mismatch");
  check(sourceCounts.productRows === snapshot.products.length, "sourceCounts.productRows mismatch");
  check(sourceCounts.warehouseStockRows === snapshot.warehouse_stock.length, "sourceCounts.warehouseStockRows mismatch");
  check(sourceCounts.hrEmployeeRows === snapshot.hr.employees.length, "sourceCounts.hrEmployeeRows mismatch");
  check(sourceCounts.hrShiftRows === snapshot.hr.shifts.length, "sourceCounts.hrShiftRows mismatch");
  check(sourceCounts.hrAttendanceRows === snapshot.hr.attendance.length, "sourceCounts.hrAttendanceRows mismatch");
  check(sourceCounts.hrCoverageRuleRows === snapshot.hr.coverageRules.length, "sourceCounts.hrCoverageRuleRows mismatch");
  check(sourceCounts.payrollAdjustmentRows === (snapshot.hr.adjustments || []).length, "sourceCounts.payrollAdjustmentRows mismatch");
  check(sourceCounts.payrollRunRows === (snapshot.hr.payrollRuns || []).length, "sourceCounts.payrollRunRows mismatch");
  check(sourceCounts.operatingExpenseRows === (snapshot.hr.expenses || []).length, "sourceCounts.operatingExpenseRows mismatch");
  const uniqueClosedKioskCount = new Set(snapshot.closings.map((close) => {
    const closeRecord = close as Record<string, unknown>;
    return String(close.kioskId || closeRecord.kiosk || "");
  })).size;
  check(Number(snapshot.summary.totals.closedKiosks || 0) === uniqueClosedKioskCount, "summary closed kiosk count mismatch");
  check(
    Number(snapshot.summary.totals.openKiosks || 0) === Math.max(0, snapshot.kiosks.length - uniqueClosedKioskCount),
    "summary open kiosk count mismatch",
  );
  check(
    Math.abs(Number(snapshot.summary.totals.netProfitAfterPayroll || 0) - Number(snapshot.summary.reportPeriods.daily.netProfitAfterPayroll || 0)) <= 0.001,
    "summary net profit after payroll did not mirror daily report",
  );
  check(snapshot.kiosk_stock_rows.every((row) => Number(row.actual_qty || 0) >= 0), "stock went negative");
  check(snapshot.transfers.some((transfer) => transfer.bayaan_state === "dispatched"), "expected at least one dispatched transfer awaiting kiosk receipt");
  check(snapshot.closings.length >= 3, "expected shift-close control rows at the end of the snippet");

  const expectedTransferReceipts: Record<string, Record<string, number>> = {};
  const expectedWarehouseTransfers: Record<string, number> = {};
  snapshot.transfers.forEach((transfer) => {
    const completed = ["completed", "received", "done"].includes(String(transfer.bayaan_state || transfer.state || "").toLowerCase());
    if (!completed) return;
    const kioskId = String(transfer.toKioskId || transfer.to || "");
    expectedTransferReceipts[kioskId] = expectedTransferReceipts[kioskId] || {};
    (transfer.lines || []).forEach((line) => {
      const item = String(line.product || "");
      const orderedQty = Number(line.qty || 0);
      const qty = Number(line.receivedQty ?? line.doneQty ?? 0);
      check(qty >= 0, `${String(transfer.name || "transfer")} ${item} received quantity must not be negative`);
      check(qty <= orderedQty, `${String(transfer.name || "transfer")} ${item} received quantity exceeded requested quantity`);
      expectedTransferReceipts[kioskId][item] = roundQty((expectedTransferReceipts[kioskId][item] ?? 0) + qty);
      expectedWarehouseTransfers[item] = roundQty((expectedWarehouseTransfers[item] ?? 0) + qty);
    });
    const lineReceivedTotal = roundQty((transfer.lines || []).reduce((sum, line) => (
      sum + Number(line.receivedQty ?? line.doneQty ?? 0)
    ), 0));
    check(Math.abs(Number(transfer.movedQty || 0) - lineReceivedTotal) <= 0.001, `${String(transfer.name || "transfer")} moved quantity did not reconcile to received lines`);
  });
  snapshot.transfers.forEach((transfer) => {
    const completed = ["completed", "received", "done"].includes(String(transfer.bayaan_state || transfer.state || "").toLowerCase());
    if (completed) return;
    (transfer.lines || []).forEach((line) => {
      const item = String(line.product || "");
      const qty = Number(line.receivedQty ?? line.doneQty ?? 0);
      check(qty === 0, `${String(transfer.name || "transfer")} ${item} non-received transfer line recorded received quantity`);
    });
  });
  Object.entries(snapshot.kioskStockDetails || {}).forEach(([kioskId, rows]) => {
    rows.forEach((row) => {
      const item = String(row.item || "");
      const expectedReceived = expectedTransferReceipts[kioskId]?.[item] ?? 0;
      check(Math.abs(Number(row.received || 0) - expectedReceived) <= 0.001, `${kioskId} ${item} transfer receipts did not reconcile`);
    });
  });
  const purchaseReceipts: Record<string, number> = {};
  (snapshot.purchase_orders || []).forEach((purchaseOrder) => {
    const lineTotal = roundMoney((purchaseOrder.lines || []).reduce((sum, line) => (
      sum + Number(line.orderedQty || 0) * Number(line.priceUnit || 0)
    ), 0));
    const receivedQtyTotal = roundQty((purchaseOrder.lines || []).reduce((sum, line) => sum + Number(line.receivedQty || 0), 0));
    check(Math.abs(Number(purchaseOrder.amount_total || 0) - lineTotal) <= 0.001, `${String(purchaseOrder.name || "purchase order")} amount total did not reconcile to ordered lines`);
    if (String(purchaseOrder.receipt_state || "") === "partial") {
      check(receivedQtyTotal > 0, `${String(purchaseOrder.name || "purchase order")} partial receipt has no received quantity`);
    }
    if (["purchase", "none", ""].includes(String(purchaseOrder.receipt_state || ""))) {
      check(receivedQtyTotal === 0, `${String(purchaseOrder.name || "purchase order")} unreceived PO has received quantity`);
    }
    (purchaseOrder.lines || []).forEach((line) => {
      const item = String(line.product || "");
      const stock = stockItem(item);
      check(line.uom === stock.uom, `${String(purchaseOrder.name || "purchase order")} ${item} PO unit did not match stock item`);
      check(Number(line.priceUnit || 0) === stock.unitCost, `${String(purchaseOrder.name || "purchase order")} ${item} PO price did not match stock item unit cost`);
      check(Number(line.orderedQty || 0) > 0, `${String(purchaseOrder.name || "purchase order")} ${item} ordered quantity must be positive`);
      check(Number(line.receivedQty || 0) >= 0, `${String(purchaseOrder.name || "purchase order")} ${item} received quantity must not be negative`);
      check(Number(line.receivedQty || 0) <= Number(line.orderedQty || 0), `${String(purchaseOrder.name || "purchase order")} ${item} received quantity exceeded ordered quantity`);
      purchaseReceipts[item] = roundQty((purchaseReceipts[item] ?? 0) + Number(line.receivedQty || 0));
    });
  });
  (snapshot.warehouse_stock || []).forEach((row) => {
    const item = stockItem(String(row.item));
    const expectedQty = roundQty(item.warehouseQty + (purchaseReceipts[item.code] ?? 0) - (expectedWarehouseTransfers[item.code] ?? 0));
    check(Math.abs(Number(row.actual_qty || 0) - expectedQty) <= 0.001, `${item.code} warehouse stock did not reconcile to purchases and transfers`);
  });

  snapshot.closings.forEach((close) => {
    const kioskId = String(close.kioskId || "");
    const kioskOrders = orders.filter((order) => order.kiosk === kioskId);
    const kioskPayments = paymentTotals(kioskOrders.flatMap((order) => order.payments));
    const kioskRevenue = roundMoney(kioskOrders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0));
    const kioskWasteCost = roundMoney(wasteRows.filter((row) => row.kiosk === kioskId).reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0));
    const expectedCash = roundMoney(kioskPayments.cash + 250_000);
    check(Math.abs(Number(close.sales || 0) - kioskRevenue) <= 0.001, `${kioskId} close sales did not reconcile`);
    check(Math.abs(Number(close.digitalPayments || 0) - kioskPayments.digital) <= 0.001, `${kioskId} close digital payments did not reconcile`);
    check(Math.abs(Number(close.wasteCost || 0) - kioskWasteCost) <= 0.001, `${kioskId} close waste cost did not reconcile`);
    check(Math.abs(Number(close.expectedCash || 0) - expectedCash) <= 0.001, `${kioskId} close expected cash did not reconcile`);
    check(Math.abs(Number(close.actualCash || 0) - (Number(close.expectedCash || 0) + Number(close.cashVariance || 0))) <= 0.001, `${kioskId} close actual cash did not reconcile to expected cash plus variance`);
    check(Number(close.orderCount || 0) === kioskOrders.length, `${kioskId} close order count did not reconcile`);
    (close.stock || []).forEach((line) => {
      const item = stockItem(String(line.item || ""));
      const expectedValue = roundMoney(Number(line.variance || 0) * item.unitCost);
      check(Number(line.value || 0) === expectedValue, `${kioskId} ${item.code} stock variance value did not reconcile`);
    });
    const stockVarianceCount = (close.stock || []).filter((line) => Number(line.variance || 0) !== 0).length;
    const stockVarianceValue = roundMoney((close.stock || []).reduce((sum, line) => sum + Number(line.value || 0), 0));
    check(stockVarianceCount === 0 || stockVarianceValue !== 0, `${kioskId} stock variance count had zero accounting value`);
  });

  snapshot.summary.byKiosk.forEach((kioskSummary) => {
    const kioskOrders = orders.filter((order) => order.kiosk === kioskSummary.kioskId);
    const kioskRevenue = roundMoney(kioskOrders.reduce((sum, order) => sum + Number(order.amount_total || 0), 0));
    const kioskWasteCost = roundMoney(wasteRows.filter((row) => row.kiosk === kioskSummary.kioskId).reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0));
    const target = targetOrders[kioskSummary.kioskId] ?? 0;
    check(kioskSummary.orders === kioskOrders.length, `${kioskSummary.kioskId} order count did not reconcile`);
    check(kioskSummary.orders === target, `${kioskSummary.kioskId} did not hit target order count ${target}`);
    check(Math.abs(kioskSummary.sales - kioskRevenue) <= 0.001, `${kioskSummary.kioskId} revenue did not reconcile`);
    check(Math.abs(Number(kioskSummary.wasteCost || 0) - kioskWasteCost) <= 0.001, `${kioskSummary.kioskId} waste cost did not reconcile`);
  });

  return failures;
}

function auditMinuteCausality(
  seed: number,
  minutes: number,
  resolvedTargetOrders: Record<string, number>,
  targetOrderOverrides?: Record<string, number>,
) {
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };
  const operations = generateOperations(seed, minutes, resolvedTargetOrders);

  for (let cursorMinute = 1; cursorMinute <= minutes; cursorMinute += 1) {
    const sourceMinute = cursorMinute - 1;
    const previous = createPeakSimulation({ seed, minutes, cursorMinute: cursorMinute - 1, targetOrders: targetOrderOverrides });
    const current = createPeakSimulation({ seed, minutes, cursorMinute, targetOrders: targetOrderOverrides });
    const minuteOrders = operations.orders.filter((order) => order.minute === sourceMinute);
    const minuteWaste = operations.waste.filter((entry) => entry.minute === sourceMinute);
    const expectedConsumed = emptyKioskStock();
    const expectedWaste = emptyKioskStock();
    const expectedReceived = emptyKioskStock();
    const minuteRevenue = roundMoney(minuteOrders.reduce((sum, order) => sum + order.amount_total, 0));

    minuteOrders.forEach((order) => {
      order.lines.forEach((line) => {
        const product = productByCode(line.product_code);
        if (product.consumptionMode !== "finished") {
          product.recipe.forEach((recipeLine) => addStock(expectedConsumed, order.kiosk, recipeLine.item, recipeLine.qty * line.qty));
        }
        if (product.finishedStockItem) {
          addStock(expectedConsumed, order.kiosk, product.finishedStockItem, line.qty);
        }
      });
    });
    minuteWaste.forEach((entry) => addStock(expectedWaste, entry.kiosk, entry.item, entry.qty));
    TRANSFERS.forEach((transfer) => {
      if (transfer.receivedMinute !== sourceMinute) return;
      transfer.lines.forEach((line) => addStock(expectedReceived, transfer.toKioskId, line.product, line.doneQty));
    });

    const currentPulse = current.summary.minutePulse[sourceMinute];
    const previousPulse = previous.summary.minutePulse[sourceMinute];
    check(Number(previousPulse?.orders || 0) === 0, `minute ${sourceMinute} pulse appeared before source orders`);
    check(Number(previousPulse?.revenue || 0) === 0, `minute ${sourceMinute} pulse revenue appeared before source orders`);
    check(Number(currentPulse?.orders || 0) === minuteOrders.length, `minute ${sourceMinute} pulse order count did not match injected orders`);
    check(Math.abs(Number(currentPulse?.revenue || 0) - minuteRevenue) <= 0.001, `minute ${sourceMinute} pulse revenue did not match injected orders`);

    KIOSKS.forEach((kiosk) => {
      STOCK_ITEMS.forEach((item) => {
        const before = stockDetail(previous, kiosk.id, item.code);
        const after = stockDetail(current, kiosk.id, item.code);
        const consumedDelta = roundQty(Number(after.consumed || 0) - Number(before.consumed || 0));
        const wasteDelta = roundQty(Number(after.waste || 0) - Number(before.waste || 0));
        const receivedDelta = roundQty(Number(after.received || 0) - Number(before.received || 0));
        const actualDelta = roundQty(Number(after.actual_qty || 0) - Number(before.actual_qty || 0));
        const expectedConsumedDelta = expectedConsumed[kiosk.id]?.[item.code] ?? 0;
        const expectedWasteDelta = expectedWaste[kiosk.id]?.[item.code] ?? 0;
        const expectedReceivedDelta = expectedReceived[kiosk.id]?.[item.code] ?? 0;
        const expectedActualDelta = roundQty(expectedReceivedDelta - expectedConsumedDelta - expectedWasteDelta);

        check(Math.abs(consumedDelta - expectedConsumedDelta) <= 0.001, `${kiosk.id} ${item.code} minute ${sourceMinute} consumption moved without matching order lines`);
        check(Math.abs(wasteDelta - expectedWasteDelta) <= 0.001, `${kiosk.id} ${item.code} minute ${sourceMinute} waste moved without matching waste rows`);
        check(Math.abs(receivedDelta - expectedReceivedDelta) <= 0.001, `${kiosk.id} ${item.code} minute ${sourceMinute} received stock moved without completed transfer`);
        check(Math.abs(actualDelta - expectedActualDelta) <= 0.001, `${kiosk.id} ${item.code} minute ${sourceMinute} actual stock delta did not reconcile to source rows`);
      });
    });

    const purchaseDelta = stockDeltaByItem(purchaseReceivedByItem(cursorMinute - 1), purchaseReceivedByItem(cursorMinute));
    const transferOutDelta = stockDeltaByItem(stockReceivedByItem(cursorMinute - 1), stockReceivedByItem(cursorMinute));
    STOCK_ITEMS.forEach((item) => {
      const before = warehouseLine(previous, item.code);
      const after = warehouseLine(current, item.code);
      const actualDelta = roundQty(Number(after.actual_qty || 0) - Number(before.actual_qty || 0));
      const expectedWarehouseDelta = roundQty((purchaseDelta[item.code] ?? 0) - (transferOutDelta[item.code] ?? 0));
      check(Math.abs(actualDelta - expectedWarehouseDelta) <= 0.001, `${item.code} warehouse minute ${sourceMinute} stock delta did not reconcile to purchase receipts and completed transfers`);
    });
  }

  return failures;
}

function stockDetail(snapshot: PeakSimulationSnapshot, kioskId: string, itemCode: string) {
  const row = snapshot.kioskStockDetails[kioskId]?.find((line) => line.item === itemCode);
  if (!row) throw new Error(`Missing stock detail ${kioskId} ${itemCode}`);
  return row;
}

function warehouseLine(snapshot: PeakSimulationSnapshot, itemCode: string) {
  const row = snapshot.warehouse_stock.find((line) => line.item === itemCode);
  if (!row) throw new Error(`Missing warehouse stock ${itemCode}`);
  return row;
}

function stockDeltaByItem(before: Record<string, number>, after: Record<string, number>) {
  const itemCodes = new Set([...Object.keys(before), ...Object.keys(after)]);
  const delta: Record<string, number> = {};
  itemCodes.forEach((itemCode) => {
    delta[itemCode] = roundQty((after[itemCode] ?? 0) - (before[itemCode] ?? 0));
  });
  return delta;
}

function stripMinute<T extends { minute: number }>(row: T): Omit<T, "minute"> {
  const copy = { ...row } as Omit<T, "minute"> & { minute?: number };
  delete copy.minute;
  return copy;
}

function timestamp(minute: number, second: number) {
  const totalMinutes = START_HOUR * 60 + minute;
  const hour = Math.floor(totalMinutes / 60);
  const displayMinute = totalMinutes % 60;
  return `${START_DATE}T${String(hour).padStart(2, "0")}:${String(displayMinute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
