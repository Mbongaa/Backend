import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Bell,
  Brain,
  CakeSlice,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  CreditCard,
  Download,
  Filter,
  Languages,
  Leaf,
  LockKeyhole,
  Minus,
  Package,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  aiInsights,
  brand,
  formatMoney,
  formatQty,
  ingredients,
  kiosks,
  kpis,
  menuCategories,
  menuItems,
  staff,
  suppliers,
  t,
  today,
  type CartLine,
  type Kiosk,
  type Lang,
  type LocalText,
  type MenuItem,
} from "./data";
import { JuiceLottie } from "./components/JuiceLottie";
import {
  calculateCartTotals,
  canFulfillRecipe,
  cartConsumption,
  createSaleRecord,
  createWasteRecord,
  shiftSummary,
  type ShiftState,
  type StockSnapshot,
  type Tender,
  type TenderMethod,
} from "./domain/pos";
import {
  createInitialChainState,
  getChainMetrics,
  getInventoryControlRows,
  getKioskRows,
  getKioskStock,
  getTopItemsForKiosk,
  getWasteActivityRows,
  recordKioskSale,
  recordKioskWaste,
  transferStockToKiosk,
  type ChainState,
} from "./domain/chain";
import {
  getDecisionInsights,
  getFinancialReport,
  getPurchaseRecommendations,
  getRecipeCostRows,
  monthlyPayroll,
  type ReportPeriod,
} from "./domain/finance";
import { applyChainBootstrapSnapshot } from "./services/bootstrapAdapter";
import { createSourceOfTruthGateway, type ShiftCloseDraft, type SourceOfTruthGateway } from "./services/sourceOfTruth";

type Panel = "admin" | "pos";
type AdminScreenId = "overview" | "insights" | "kiosks" | "kioskDetail" | "recipes" | "inventory" | "waste" | "suppliers" | "staff" | "reports";
type PosScreen = "login" | "sale" | "payment" | "waste" | "stock" | "close";
type WasteDraft = { product: MenuItem; qty: number; reason: string };
type CustomerDisplayTender = Tender & { total: number };
type CustomerFlash = { key: string; name: LocalText; price: number; t: number };
type PaidOrder = { lines: CartLine[]; total: number; tender: Tender };

const createShiftState = (kioskId: string): ShiftState => ({
  id: `SHIFT-${kioskId.replace("-", "")}-20260509-AM`,
  openedAt: "2026-05-09T07:00:00+03:00",
  openingCash: 500_000,
  sales: [],
  waste: [],
});

const text = {
  admin: { en: "Admin", ar: "الإدارة" },
  pos: { en: "POS", ar: "نقطة البيع" },
  online: { en: "Online", ar: "متصل" },
  today: { en: "Today", ar: "اليوم" },
  export: { en: "Export", ar: "تصدير" },
  search: { en: "Search", ar: "بحث" },
  allKiosks: { en: "All kiosks", ar: "كل الأكشاك" },
  healthy: { en: "Healthy", ar: "جيد" },
  watch: { en: "Watch", ar: "متابعة" },
  issue: { en: "Issue", ar: "مشكلة" },
};

const nav: Array<{ id?: AdminScreenId; section?: LocalText; label?: LocalText; icon?: LucideIcon; badge?: number }> = [
  { section: { en: "Today", ar: "اليوم" } },
  { id: "overview", label: { en: "Overview", ar: "نظرة عامة" }, icon: BarChart3 },
  { id: "insights", label: { en: "AI Insights", ar: "تحليلات الذكاء" }, icon: Sparkles, badge: 4 },
  { section: { en: "Operations", ar: "العمليات" } },
  { id: "kiosks", label: { en: "Kiosks", ar: "الأكشاك" }, icon: Store },
  { id: "recipes", label: { en: "Recipes", ar: "الوصفات" }, icon: Coffee },
  { id: "inventory", label: { en: "Inventory", ar: "المخزون" }, icon: Package },
  { id: "waste", label: { en: "Waste & Loss", ar: "الهدر والخسارة" }, icon: Trash2, badge: 3 },
  { id: "suppliers", label: { en: "Suppliers", ar: "الموردون" }, icon: Truck },
  { id: "staff", label: { en: "Staff", ar: "الموظفون" }, icon: Users },
  { section: { en: "Finance", ar: "المالية" } },
  { id: "reports", label: { en: "Reports", ar: "التقارير" }, icon: ClipboardList },
];

const titles: Record<AdminScreenId, { title: LocalText; sub: LocalText }> = {
  overview: { title: { en: "Overview", ar: "نظرة عامة" }, sub: { en: "Baghdad pilot, 10 kiosks", ar: "تجربة بغداد، 10 أكشاك" } },
  insights: { title: { en: "AI Insights", ar: "تحليلات الذكاء" }, sub: { en: "Forecasts, anomalies, and action prompts", ar: "توقعات وشذوذ وإجراءات مقترحة" } },
  kiosks: { title: { en: "Kiosks", ar: "الأكشاك" }, sub: { en: "10 active stands, ready for 100+", ar: "10 أكشاك نشطة، جاهزة للتوسع" } },
  kioskDetail: { title: { en: "Mansour Coffee Stand", ar: "كشك المنصور" }, sub: { en: "K-01, Mansour, Baghdad", ar: "K-01، المنصور، بغداد" } },
  recipes: { title: { en: "Recipes", ar: "الوصفات" }, sub: { en: "Menu costing, raw materials, and margins", ar: "تكلفة المنتجات والمواد والهوامش" } },
  inventory: { title: { en: "Inventory", ar: "المخزون" }, sub: { en: "Central warehouse and kiosk allocations", ar: "المستودع الرئيسي وتوزيع الأكشاك" } },
  waste: { title: { en: "Waste & Loss", ar: "الهدر والخسارة" }, sub: { en: "Expected vs actual stock variance", ar: "المتوقع مقابل العد الفعلي" } },
  suppliers: { title: { en: "Suppliers", ar: "الموردون" }, sub: { en: "Costs, delivery reliability, and purchase orders", ar: "التكاليف والالتزام وطلبات الشراء" } },
  staff: { title: { en: "Staff", ar: "الموظفون" }, sub: { en: "Shifts, salaries, and cashier accountability", ar: "الورديات والرواتب ومسؤولية الكاشير" } },
  reports: { title: { en: "Reports", ar: "التقارير" }, sub: { en: "Sales, stock, cash flow, and profit", ar: "المبيعات والمخزون والنقد والربح" } },
};

function App() {
  const [panel, setPanel] = useState<Panel>("admin");
  const [lang, setLang] = useState<Lang>("en");
  const [chain, setChain] = useState<ChainState>(() => createInitialChainState());
  const sourceOfTruth = useMemo(() => createSourceOfTruthGateway(), []);

  useEffect(() => {
    if (!sourceOfTruth.enabled) return;
    void sourceOfTruth.getChainBootstrap()
      .then((snapshot) => setChain((current) => applyChainBootstrapSnapshot(current, snapshot)))
      .catch(reportSyncError);
  }, [sourceOfTruth]);

  const transferInventory = (kioskId: string, itemId: string, qty: number) => {
    const ingredient = ingredients.find((item) => item.id === itemId);
    setChain((current) => transferStockToKiosk(current, kioskId, itemId, qty));
    void sourceOfTruth.submitStockTransfer({
      kioskId,
      itemId,
      qty,
      uom: ingredient?.unit,
    }).catch(reportSyncError);
  };

  return (
    <div className="app" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <MasterTop panel={panel} setPanel={setPanel} lang={lang} setLang={setLang} />
      <div className="panel-host" hidden={panel !== "admin"}>
        <AdminPanel lang={lang} chain={chain} onTransfer={transferInventory} sourceOfTruth={sourceOfTruth} />
      </div>
      <div className="panel-host" hidden={panel !== "pos"}>
        <POSPanel lang={lang} chain={chain} setChain={setChain} sourceOfTruth={sourceOfTruth} />
      </div>
    </div>
  );
}

function MasterTop({
  panel,
  setPanel,
  lang,
  setLang,
}: {
  panel: Panel;
  setPanel: (panel: Panel) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
}) {
  return (
    <header className="master-top">
      <div className="brand-lockup">
        <div className="brand-mark">B</div>
        <strong>{lang === "ar" ? brand.arName : brand.name}</strong>
        <span>{lang === "ar" ? brand.arProduct : brand.product}</span>
      </div>
      <Segmented
        items={[
          { id: "admin", label: t(text.admin, lang) },
          { id: "pos", label: t(text.pos, lang) },
        ]}
        active={panel}
        onChange={(value) => setPanel(value as Panel)}
      />
      <div className="top-actions">
        <span className="top-date">{t(today, lang)}</span>
        <div className="language-toggle" aria-label="Language">
          <Languages size={14} />
          <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>عربي</button>
        </div>
      </div>
    </header>
  );
}

function Segmented({
  items,
  active,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function AdminPanel({
  lang,
  chain,
  onTransfer,
  sourceOfTruth,
}: {
  lang: Lang;
  chain: ChainState;
  onTransfer: (kioskId: string, itemId: string, qty: number) => void;
  sourceOfTruth: SourceOfTruthGateway;
}) {
  const [active, setActive] = useState<AdminScreenId>("overview");
  const [selectedKioskId, setSelectedKioskId] = useState("K-01");
  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === selectedKioskId) ?? kiosks[0];
  const current = active === "kioskDetail"
    ? {
        title: selectedKiosk.name,
        sub: {
          en: `${selectedKiosk.id}, ${selectedKiosk.area.en}, Baghdad`,
          ar: `${selectedKiosk.id}، ${selectedKiosk.area.ar}`,
        },
      }
    : titles[active] ?? titles.overview;

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">B</div>
          <div>
            <strong>{lang === "ar" ? brand.arName : brand.name}</strong>
            <span>{lang === "ar" ? "نظام الأكشاك" : "Kiosk system"}</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {nav.map((item, index) => {
            if (item.section) {
              return <div className="nav-section" key={`${item.section.en}-${index}`}>{t(item.section, lang)}</div>;
            }
            const Icon = item.icon!;
            const selected = active === item.id || (active === "kioskDetail" && item.id === "kiosks");
            return (
              <button key={item.id} className={`nav-item ${selected ? "active" : ""}`} onClick={() => setActive(item.id!)}>
                <Icon size={15} />
                <span>{t(item.label!, lang)}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <Avatar name="Hassan" />
          <div>
            <strong>{lang === "ar" ? "حسن" : "Hassan"}</strong>
            <span>{lang === "ar" ? "المالك" : "Owner"}</span>
          </div>
          <Settings size={15} />
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-top">
          <div>
            <h1>{t(current.title, lang)}</h1>
            <p>{t(current.sub, lang)}</p>
          </div>
          <div className="admin-actions">
            <span className={`badge ${sourceOfTruth.enabled ? "good" : "watch"}`}>
              {sourceOfTruth.enabled ? "Live backend" : "Demo mode"}
            </span>
            <button className="btn subtle-btn"><Search size={15} />{t(text.search, lang)}</button>
            <button className="icon-btn" aria-label="Notifications"><Bell size={16} /></button>
            <button className="btn subtle-btn"><Download size={15} />{t(text.export, lang)}</button>
          </div>
        </div>
        <div className="admin-scroll">
          <div className="admin-content">
            {active === "overview" && <OverviewScreen lang={lang} chain={chain} onTransfer={onTransfer} goKiosk={() => setActive("kiosks")} />}
            {active === "insights" && <InsightsScreen lang={lang} chain={chain} />}
            {active === "kiosks" && <KiosksScreen lang={lang} chain={chain} onPick={(id) => { setSelectedKioskId(id); setActive("kioskDetail"); }} />}
            {active === "kioskDetail" && <KioskDetailScreen lang={lang} chain={chain} kioskId={selectedKioskId} onBack={() => setActive("kiosks")} />}
            {active === "recipes" && <RecipesScreen lang={lang} sourceOfTruth={sourceOfTruth} />}
            {active === "inventory" && <InventoryScreen lang={lang} chain={chain} onTransfer={onTransfer} />}
            {active === "waste" && <WasteScreen lang={lang} chain={chain} />}
            {active === "suppliers" && <SuppliersScreen lang={lang} chain={chain} sourceOfTruth={sourceOfTruth} />}
            {active === "staff" && <StaffScreen lang={lang} />}
            {active === "reports" && <ReportsScreen lang={lang} chain={chain} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function OverviewScreen({
  lang,
  chain,
  onTransfer,
  goKiosk,
}: {
  lang: Lang;
  chain: ChainState;
  onTransfer: (kioskId: string, itemId: string, qty: number) => void;
  goKiosk: () => void;
}) {
  const metrics = getChainMetrics(chain);
  const kioskRows = getKioskRows(chain);
  const inventory = getInventoryControlRows(chain);
  const needsTransfer = inventory
    .filter((row) => row.lowKiosks > 0 || row.criticalKiosks > 0)
    .sort((a, b) => (b.criticalKiosks - a.criticalKiosks) || (b.lowKiosks - a.lowKiosks));
  const suggested = needsTransfer[0] ?? inventory.find((row) => row.id === "oranges") ?? inventory[0];
  const attentionCount = metrics.lowKiosks + metrics.criticalKiosks;
  return (
    <div className="stack">
      <Card className="ai-card">
        <div className="ai-head">
          <AITag label={lang === "ar" ? "موجز الذكاء" : "AI brief"} />
          <span>{lang === "ar" ? "08:42 الآن" : "08:42 now"}</span>
        </div>
        <div className="ai-rule">
          {lang === "ar" ? (
            <p>
              المبيعات أعلى من الخطة بـ <strong>8.4%</strong>. الطلب على العصائر يقود النمو، لكن مخزون البرتقال في 3 أكشاك يحتاج تحويل قبل المساء. تم تجهيز طلب شراء أولي ويمكن اعتماده.
            </p>
          ) : (
            <p>
              Today has <strong>{formatMoney(metrics.revenueToday, lang)}</strong> in posted sales across {metrics.activeKiosks} kiosks. {attentionCount} kiosks need stock attention. Best transfer now: {suggested ? `${formatQty(suggested.suggestedQty, suggested.unit, lang)} ${t(suggested.name, lang)} to ${suggested.targetKioskId}` : "none"}.
            </p>
          )}
        </div>
        <div className="inline-actions">
          <button className="btn primary-btn" disabled={!suggested} onClick={() => suggested && onTransfer(suggested.targetKioskId, suggested.id, suggested.suggestedQty)}>{lang === "ar" ? "اعتماد التحويل" : "Approve transfer"} <ArrowRight size={15} /></button>
          <button className="btn subtle-btn" onClick={goKiosk}>{lang === "ar" ? "عرض الأكشاك" : "View kiosks"}</button>
        </div>
      </Card>

      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "مبيعات اليوم" : "Revenue today"} value={formatMoney(metrics.revenueToday, lang)} delta={`+${kpis.revenueDelta}%`} trend="up" spark={kpis.revenueSpark} />
        <KPI label={lang === "ar" ? "الربح الإجمالي" : "Gross profit"} value={formatMoney(metrics.grossProfit, lang)} sub={`${metrics.profitMargin.toFixed(1)}%`} delta="+2.1 pts" trend="up" spark={kpis.profitSpark} />
        <KPI label={lang === "ar" ? "الطلبات" : "Orders"} value={new Intl.NumberFormat(lang === "ar" ? "ar-IQ" : "en-US").format(metrics.ordersToday)} sub={formatMoney(metrics.avgTicket, lang)} delta="+4.1%" trend="up" spark={kpis.orderSpark} />
        <KPI label={lang === "ar" ? "النقد المتاح" : "Cash on hand"} value={formatMoney(metrics.cashOnHand, lang)} delta="+6.3%" trend="up" spark={kpis.cashSpark} />
      </div>

      <div className="split">
        <Card>
          <SectionTitle title={lang === "ar" ? "المبيعات بالساعة" : "Hourly sales"} sub={lang === "ar" ? "الساعة الحالية مميزة" : "Current hour highlighted"} />
          <HourlyChart />
        </Card>
        <Card className="attention-card">
          <SectionTitle title={lang === "ar" ? "تحتاج انتباهك" : "Needs attention"} right={<span className="badge">{Math.max(attentionCount, needsTransfer.length)}</span>} />
          {(needsTransfer.length ? needsTransfer.slice(0, 3) : inventory.slice(0, 3)).map((row) => (
            <div className="alert-row" key={row.id}>
              <span className={`status-dot ${row.status === "critical" ? "critical" : row.status === "low" ? "watch" : "good"}`} />
              <div>
                <strong>{t(row.name, lang)} · {row.targetKioskId}</strong>
                <p>
                  {lang === "ar"
                    ? `${row.lowKiosks + row.criticalKiosks} أكشاك تحت الحد. المستودع: ${formatQty(row.warehouseQty, row.unit, lang)}.`
                    : `${row.lowKiosks + row.criticalKiosks} kiosks below target. Warehouse has ${formatQty(row.warehouseQty, row.unit, lang)}.`}
                </p>
                <div className="row-line">
                  <button className="btn mini-btn" onClick={() => onTransfer(row.targetKioskId, row.id, row.suggestedQty)}>
                    {lang === "ar" ? "حول الآن" : "Transfer now"}
                  </button>
                  <span>{formatQty(row.suggestedQty, row.unit, lang)}</span>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "أداء الأكشاك اليوم" : "Kiosk performance today"} sub={lang === "ar" ? "مرتبة حسب الإيرادات" : "Sorted by revenue"} right={<button className="btn subtle-btn"><Filter size={14} />{lang === "ar" ? "تصفية" : "Filter"}</button>} />
        <KioskTable lang={lang} rows={kioskRows.slice(0, 6)} />
      </Card>

      <div className="split">
        <Card>
          <SectionTitle title={lang === "ar" ? "صحة المخزون" : "Stock health"} sub={lang === "ar" ? "أيام التغطية حسب الفئة" : "Days of cover by category"} />
          <StockHealth lang={lang} rows={inventory} />
        </Card>
        <Card>
          <SectionTitle title={lang === "ar" ? "التدفق النقدي" : "Cash flow this week"} sub={lang === "ar" ? "الداخل مقابل الخارج" : "In vs out"} />
          <CashFlow lang={lang} />
        </Card>
      </div>
    </div>
  );
}

function InsightsScreen({ lang, chain }: { lang: Lang; chain: ChainState }) {
  const [filter, setFilter] = useState("all");
  const liveInsights = getDecisionInsights(chain).map(localizeDecisionInsight);
  const visible = filter === "all"
    ? [...liveInsights, ...aiInsights]
    : [...liveInsights, ...aiInsights].filter((insight) => insight.kind === filter);

  return (
    <div className="stack">
      <Card className="ai-card">
        <div className="ai-head">
          <AITag label={lang === "ar" ? "موجز اليوم" : "Today's brief"} />
          <span>{lang === "ar" ? "تم التحديث قبل 4 دقائق" : "Updated 4 min ago"}</span>
        </div>
        <div className="ai-rule">
          <p>
            {lang === "ar"
              ? "الأولوية اليوم هي حماية المخزون النقدي والمواد السريعة الحركة. التوصيات أدناه مبنية على المبيعات والوصفات والهدر."
              : "The priority today is protecting cash and fast-moving ingredients. The recommendations below are driven by sales, recipes, stock, and waste."}
          </p>
        </div>
      </Card>

      <div className="inline-actions">
        {[
          ["all", lang === "ar" ? "الكل" : "All"],
          ["forecast", lang === "ar" ? "توقعات" : "Forecast"],
          ["anomaly", lang === "ar" ? "شذوذ" : "Anomaly"],
          ["margin", lang === "ar" ? "هامش" : "Margin"],
          ["cash", lang === "ar" ? "نقد" : "Cash"],
        ].map(([id, label]) => (
          <button key={id} className={`btn ${filter === id ? "primary-btn" : "subtle-btn"}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="insight-grid">
        {visible.map((insight) => (
          <Card key={insight.title.en} className="insight-card">
            <div className="between">
              <span className="badge">{insight.kind}</span>
              <span className="muted">{lang === "ar" ? "ثقة" : "confidence"} {insight.confidence}%</span>
            </div>
            <div className="ai-rule">
              <h3>{t(insight.title, lang)}</h3>
              <p>{t(insight.body, lang)}</p>
            </div>
            <div className="inline-actions">
              <button className="btn mini-btn">{lang === "ar" ? "تفاصيل" : "Details"}</button>
              <button className="btn mini-btn">{lang === "ar" ? "إجراء" : "Take action"} <ArrowRight size={13} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function localizeDecisionInsight(insight: ReturnType<typeof getDecisionInsights>[number]) {
  const arabicByKind: Record<typeof insight.kind, { title: string; body: string }> = {
    forecast: {
      title: "خطة شراء التوسع جاهزة",
      body: "التوقع يعتمد على مخزون المستودع، المتبقي في الأكشاك، واستهلاك الوصفات الحالي.",
    },
    anomaly: {
      title: "أكشاك تحتاج مراجعة مخزون أو خسائر",
      body: "التنبيه مبني على المخزون المتوقع بعد مبيعات نقطة البيع والهدر وحدود إعادة الطلب.",
    },
    margin: {
      title: "هوامش الوصفات تحت المراقبة",
      body: "النظام يقارن تكلفة المواد الخام بسعر البيع حتى تظهر المنتجات التي تحتاج مراجعة.",
    },
    cash: {
      title: "صافي الربح اليومي محسوب",
      body: "القراءة تجمع المبيعات وتكلفة المواد والرواتب والمصاريف التشغيلية والهدر.",
    },
  };

  return {
    kind: insight.kind,
    title: { en: insight.title, ar: arabicByKind[insight.kind].title },
    body: { en: insight.body, ar: arabicByKind[insight.kind].body },
    confidence: insight.confidence,
  };
}

function KiosksScreen({
  lang,
  chain,
  onPick,
}: {
  lang: Lang;
  chain: ChainState;
  onPick: (kioskId: string) => void;
}) {
  const metrics = getChainMetrics(chain);
  const rows = getKioskRows(chain);
  const avgMargin = rows.length ? rows.reduce((sum, row) => sum + row.margin, 0) / rows.length : 0;

  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "أكشاك نشطة" : "Active kiosks"} value={String(metrics.activeKiosks)} sub={lang === "ar" ? "بغداد" : "Baghdad"} />
        <KPI label={lang === "ar" ? "مبيعات اليوم" : "Today's revenue"} value={formatMoney(metrics.revenueToday, lang)} delta="+8.4%" trend="up" />
        <KPI label={lang === "ar" ? "متوسط الهامش" : "Avg margin"} value={`${avgMargin.toFixed(1)}%`} delta="+0.8 pts" trend="up" />
        <KPI label={lang === "ar" ? "تحتاج متابعة" : "Need attention"} value={String(metrics.lowKiosks + metrics.criticalKiosks)} sub={lang === "ar" ? "تحذير أو مشكلة" : "watch or critical"} />
      </div>
      <Card className="table-card">
        <div className="table-toolbar">
          <div className="inline-actions">
            <button className="btn primary-btn">{lang === "ar" ? "كل المناطق" : "All areas"} <ChevronDown size={14} /></button>
            <button className="btn subtle-btn">{lang === "ar" ? "الحالة" : "Status"} <ChevronDown size={14} /></button>
          </div>
          <button className="btn subtle-btn"><Plus size={14} />{lang === "ar" ? "إضافة كشك" : "Add kiosk"}</button>
        </div>
        <KioskTable lang={lang} rows={rows} onPick={onPick} />
      </Card>
    </div>
  );
}

function KioskDetailScreen({
  lang,
  chain,
  kioskId,
  onBack,
}: {
  lang: Lang;
  chain: ChainState;
  kioskId: string;
  onBack: () => void;
}) {
  const kiosk = getKioskRows(chain).find((row) => row.id === kioskId) ?? getKioskRows(chain)[0];
  const stock = getKioskStock(chain, kiosk.id);
  const topItems = getTopItemsForKiosk(chain, kiosk.id);
  const lowStock = stock.filter((row) => row.status !== "ok").length;

  return (
    <div className="stack">
      <button className="btn subtle-btn back-btn" onClick={onBack}>
        {lang === "ar" ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        {t(text.allKiosks, lang)}
      </button>
      <div className="kpi-grid five">
        <KPI label={lang === "ar" ? "اليوم" : "Today"} value={formatMoney(kiosk.revenue, lang)} delta="+11%" trend="up" spark={kiosk.trend} />
        <KPI label={lang === "ar" ? "الطلبات" : "Orders"} value={String(kiosk.orders)} delta="+6%" trend="up" />
        <KPI label={lang === "ar" ? "الهامش" : "Margin"} value={`${kiosk.margin}%`} delta="+0.4 pts" trend="up" />
        <KPI label={lang === "ar" ? "الهدر" : "Waste"} value={`${kiosk.waste}%`} sub={lang === "ar" ? "من المبيعات" : "of sales"} />
        <KPI label={lang === "ar" ? "المخزون" : "Stock"} value={String(lowStock)} sub={lang === "ar" ? "تحتاج متابعة" : "needs attention"} />
      </div>
      <div className="split">
        <Card className="table-card">
          <SectionTitle title={lang === "ar" ? "أعلى المنتجات اليوم" : "Top items today"} />
          <SimpleRows
            rows={topItems.map((item) => [item.name, String(item.qty), formatMoney(item.revenue, lang)])}
          />
        </Card>
        <Card>
          <SectionTitle title={lang === "ar" ? "الفريق المناوب" : "Shift roster"} />
          <div className="people-list">
            {staff.slice(0, 4).map((person) => (
              <div className="person-row" key={person.name.en}>
                <Avatar name={person.name.en} />
                <div>
                  <strong>{t(person.name, lang)}</strong>
                  <span>{t(person.role, lang)} · {person.kiosk}</span>
                </div>
                <span className={`badge ${person.status === "active" ? "good" : ""}`}>{person.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "مخزون الكشك" : "Kiosk stock ledger"} sub={lang === "ar" ? "المخصص - المستهلك - الهدر = المتبقي" : "Allocated - consumed - waste = remaining"} />
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "المادة" : "Item"}</th>
              <th>{lang === "ar" ? "المخصص" : "Allocated"}</th>
              <th>{lang === "ar" ? "استهلاك POS" : "POS consumed"}</th>
              <th>{lang === "ar" ? "هدر" : "Waste"}</th>
              <th>{lang === "ar" ? "متبقي" : "Remaining"}</th>
              <th>{lang === "ar" ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr key={row.id}>
                <td><strong>{t(row.name, lang)}</strong><span className="subcell">{row.id}</span></td>
                <td className="num">{formatQty(row.opening, row.unit, lang)}</td>
                <td className="num">{formatQty(row.consumed, row.unit, lang)}</td>
                <td className="num">{formatQty(row.wasted, row.unit, lang)}</td>
                <td className="num">{formatQty(row.remaining, row.unit, lang)}</td>
                <td><span className={`badge ${row.status === "empty" ? "critical" : row.status === "low" ? "watch" : "good"}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="ai-card">
        <SectionTitle title={lang === "ar" ? "ملاحظات الذكاء لهذا الكشك" : "AI notes for this kiosk"} />
        <div className="ai-rule">
          <h3>{lowStock ? (lang === "ar" ? "يوجد مواد تحتاج تحويل" : "Some items need transfer") : (lang === "ar" ? "المخزون مستقر" : "Stock position is stable")}</h3>
          <p>{lowStock ? (lang === "ar" ? "راجع المواد المنخفضة قبل ذروة العصر. الاستهلاك هنا مرتبط مباشرة بمبيعات نقطة البيع." : "Review low items before afternoon peak. Consumption here is driven directly by POS sales.") : (lang === "ar" ? "لا يوجد نفاد متوقع حاليا لهذا الكشك." : "No immediate runout is expected for this kiosk.")}</p>
        </div>
      </Card>
    </div>
  );
}

function RecipesScreen({ lang, sourceOfTruth }: { lang: Lang; sourceOfTruth: SourceOfTruthGateway }) {
  const recipeRows = getRecipeCostRows();
  const [selectedId, setSelectedId] = useState(recipeRows[0]?.item.id ?? "");
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const selected = recipeRows.find((row) => row.item.id === selectedId) ?? recipeRows[0];
  const avgCost = recipeRows.length ? recipeRows.reduce((sum, row) => sum + row.ingredientCost, 0) / recipeRows.length : 0;
  const avgMargin = recipeRows.length ? recipeRows.reduce((sum, row) => sum + row.marginPct, 0) / recipeRows.length : 0;
  const reviewCount = recipeRows.filter((row) => row.status !== "strong").length;
  const publishRecipe = () => {
    if (!selected) return;
    setPublishedId(selected.item.id);
    void sourceOfTruth.submitRecipeVersion({
      itemId: selected.item.id,
      effectiveFrom: "2026-05-09",
      wasteAllowancePercent: 2,
      submit: true,
      ingredients: selected.lines.map((line) => ({
        ingredientId: line.ingredient.id,
        qty: line.qty,
        uom: line.ingredient.unit,
      })),
    }).catch(reportSyncError);
  };

  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "منتجات بوصفة" : "Recipe products"} value={String(recipeRows.length)} />
        <KPI label={lang === "ar" ? "متوسط التكلفة" : "Avg recipe cost"} value={formatMoney(avgCost, lang)} />
        <KPI label={lang === "ar" ? "متوسط الهامش" : "Avg margin"} value={`${avgMargin.toFixed(1)}%`} delta="+1.8 pts" trend="up" />
        <KPI label={lang === "ar" ? "تحتاج مراجعة" : "Need review"} value={String(reviewCount)} sub={lang === "ar" ? "هامش منخفض" : "low margin"} />
      </div>

      <Card className="ai-card">
        <div className="ai-head"><AITag label={lang === "ar" ? "محرك التكلفة" : "Cost engine"} /></div>
        <div className="ai-rule">
          <p>{lang === "ar" ? "كل منتج مرتبط بوصفة مواد خام. عند البيع، تخصم نقطة البيع نفس المواد من مخزون الكشك، وتستخدم الإدارة نفس الوصفة لحساب تكلفة المنتج والهامش." : "Every menu item is tied to a raw-material recipe. When POS sells it, the same recipe deducts kiosk stock and calculates product cost and margin for management."}</p>
        </div>
      </Card>

      <div className="split">
        <Card className="table-card">
          <SectionTitle title={lang === "ar" ? "تكلفة المنتجات" : "Product costing"} sub={lang === "ar" ? "السعر - تكلفة الوصفة = الهامش" : "Price - recipe cost = margin"} />
          <table className="data-table">
            <thead>
              <tr>
                <th>{lang === "ar" ? "المنتج" : "Product"}</th>
                <th>{lang === "ar" ? "الفئة" : "Category"}</th>
                <th>{lang === "ar" ? "السعر" : "Price"}</th>
                <th>{lang === "ar" ? "التكلفة" : "Cost"}</th>
                <th>{lang === "ar" ? "الهامش" : "Margin"}</th>
                <th>{lang === "ar" ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {recipeRows.map((row) => (
                <tr key={row.item.id} className="clickable" onClick={() => setSelectedId(row.item.id)}>
                  <td><strong>{t(row.item.name, lang)}</strong><span className="subcell">{row.item.id}</span></td>
                  <td>{row.item.category}</td>
                  <td className="num">{formatMoney(row.item.price, lang)}</td>
                  <td className="num">{formatMoney(row.ingredientCost, lang)}</td>
                  <td className="num">{row.marginPct}%</td>
                  <td><span className={`badge ${row.status === "strong" ? "good" : row.status === "watch" ? "watch" : "critical"}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="table-card">
          <SectionTitle
            title={selected ? t(selected.item.name, lang) : ""}
            sub={lang === "ar" ? "تفاصيل الوصفة النشطة" : "Active recipe detail"}
            right={selected ? (
              <button className="btn mini-btn" onClick={publishRecipe}>
                {publishedId === selected.item.id ? (lang === "ar" ? "منشورة" : "Published") : (lang === "ar" ? "نشر النسخة" : "Publish version")}
              </button>
            ) : null}
          />
          {selected ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{lang === "ar" ? "المادة" : "Ingredient"}</th>
                  <th>{lang === "ar" ? "الكمية" : "Qty"}</th>
                  <th>{lang === "ar" ? "التكلفة" : "Cost"}</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr key={`${selected.item.id}-${line.ingredient.id}`}>
                    <td><strong>{t(line.ingredient.name, lang)}</strong><span className="subcell">{line.ingredient.id}</span></td>
                    <td className="num">{formatQty(line.qty, line.ingredient.unit, lang)}</td>
                    <td className="num">{formatMoney(line.cost, lang)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>{lang === "ar" ? "إجمالي التكلفة" : "Total cost"}</strong></td>
                  <td></td>
                  <td className="num"><strong>{formatMoney(selected.ingredientCost, lang)}</strong></td>
                </tr>
              </tbody>
            </table>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function InventoryScreen({
  lang,
  chain,
  onTransfer,
}: {
  lang: Lang;
  chain: ChainState;
  onTransfer: (kioskId: string, itemId: string, qty: number) => void;
}) {
  const rows = getInventoryControlRows(chain);
  const metrics = getChainMetrics(chain);
  const low = rows.filter((row) => row.status !== "ok").length;
  const suggested = rows.find((row) => row.status !== "ok") ?? rows[0];
  const avgCover = rows.length ? rows.reduce((sum, row) => sum + row.daysCover, 0) / rows.length : 0;

  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "مواد متابعة" : "Items tracked"} value={String(rows.length)} />
        <KPI label={lang === "ar" ? "تحت حد الطلب" : "Below reorder"} value={String(low)} trend="down" delta={lang === "ar" ? "تحتاج تحويل" : "needs transfer"} />
        <KPI label={lang === "ar" ? "قيمة المخزون" : "Stock value"} value={formatMoney(metrics.warehouseValue + metrics.allocatedValue, lang)} />
        <KPI label={lang === "ar" ? "متوسط التغطية" : "Avg cover"} value={avgCover.toFixed(1)} sub={lang === "ar" ? "أيام" : "days"} />
      </div>
      <Card className="ai-card">
        <div className="ai-head">
          <AITag label={lang === "ar" ? "إجراء مقترح" : "Suggested"} />
        </div>
        <div className="ai-rule">
          <p>{lang === "ar" ? `حوّل ${formatQty(suggested.suggestedQty, suggested.unit, lang)} ${t(suggested.name, lang)} إلى ${suggested.targetKioskId} للحفاظ على تغطية المخزون قبل الذروة.` : `Transfer ${formatQty(suggested.suggestedQty, suggested.unit, lang)} ${t(suggested.name, lang)} to ${suggested.targetKioskId} to protect stock cover before peak hours.`}</p>
        </div>
        <button className="btn primary-btn" onClick={() => onTransfer(suggested.targetKioskId, suggested.id, suggested.suggestedQty)}>{lang === "ar" ? "اعتماد التحويل" : "Approve transfer"}</button>
      </Card>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "المستودع وتوزيع الأكشاك" : "Warehouse and kiosk allocation"} sub={lang === "ar" ? "المخزن المركزي + المتبقي في الأكشاك" : "Central stock + remaining kiosk stock"} />
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "المادة" : "Item"}</th>
              <th>{lang === "ar" ? "المستودع" : "Warehouse"}</th>
              <th>{lang === "ar" ? "مخصص للأكشاك" : "Allocated"}</th>
              <th>{lang === "ar" ? "استهلاك POS" : "POS consumed"}</th>
              <th>{lang === "ar" ? "هدر" : "Waste"}</th>
              <th>{lang === "ar" ? "أيام التغطية" : "Days of cover"}</th>
              <th>{lang === "ar" ? "الحالة" : "Status"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{t(row.name, lang)}</strong><span className="subcell">{row.id}</span></td>
                <td className="num">{formatQty(row.warehouseQty, row.unit, lang)}</td>
                <td className="num">{formatQty(row.remainingAtKiosks, row.unit, lang)}</td>
                <td className="num">{formatQty(row.consumedQty, row.unit, lang)}</td>
                <td className="num">{formatQty(row.wastedQty, row.unit, lang)}</td>
                <td><Progress value={Math.min(row.daysCover / 10, 1)} tone={row.status === "critical" ? "critical" : row.status === "low" ? "watch" : "good"} label={`${row.daysCover}d`} /></td>
                <td><span className={`badge ${row.status === "critical" ? "critical" : row.status === "low" ? "watch" : "good"}`}>{row.status}</span></td>
                <td>
                  <button className="btn mini-btn" onClick={() => onTransfer(row.targetKioskId, row.id, row.suggestedQty)}>
                    {lang === "ar" ? "تحويل" : "Transfer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function WasteScreen({ lang, chain }: { lang: Lang; chain: ChainState }) {
  const rows = getWasteActivityRows(chain);
  const metrics = getChainMetrics(chain);
  const flagged = rows.filter((row) => row.flagged).length;
  const wasteShare = metrics.revenueToday ? ((metrics.wasteCost / metrics.revenueToday) * 100).toFixed(2) : "0.00";

  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "خسارة اليوم" : "Loss today"} value={formatMoney(metrics.wasteCost, lang)} delta="-12%" trend="up" />
        <KPI label={lang === "ar" ? "سجلات الهدر" : "Waste entries"} value={String(rows.length)} />
        <KPI label={lang === "ar" ? "من الإيرادات" : "Of revenue"} value={`${wasteShare}%`} />
        <KPI label={lang === "ar" ? "شذوذ مرصود" : "Anomalies"} value={String(flagged)} sub={lang === "ar" ? "بالذكاء" : "by AI"} />
      </div>
      <Card className="ai-card">
        <div className="ai-head"><AITag label={lang === "ar" ? "نمط مرصود" : "Pattern detected"} /></div>
        <div className="ai-rule">
          <p>{lang === "ar" ? "كل هدر مسجل من نقطة البيع يظهر هنا ويؤثر على مخزون الكشك وتقرير الربح." : "Every POS waste entry appears here and affects kiosk stock, loss reporting, and profit."}</p>
        </div>
      </Card>
      <Card className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>{lang === "ar" ? "الوقت" : "Time"}</th>
              <th>{lang === "ar" ? "الكشك" : "Kiosk"}</th>
              <th>{lang === "ar" ? "المادة" : "Item"}</th>
              <th>{lang === "ar" ? "الكمية" : "Qty"}</th>
              <th>{lang === "ar" ? "التكلفة" : "Cost"}</th>
              <th>{lang === "ar" ? "السبب" : "Reason"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.kioskId}-${row.id}`}>
                <td><span className={`status-dot ${row.flagged ? "watch" : ""}`} /></td>
                <td className="num">{row.time}</td>
                <td>{row.kioskName}</td>
                <td>{row.itemName}</td>
                <td className="num">{row.qty} {row.unit}</td>
                <td className="num">{formatMoney(row.cost, lang)}</td>
                <td>{row.reason}</td>
                <td>{row.flagged ? <span className="badge watch">{lang === "ar" ? "مرصود" : "Flagged"}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SuppliersScreen({ lang, chain, sourceOfTruth }: { lang: Lang; chain: ChainState; sourceOfTruth: SourceOfTruthGateway }) {
  const [draftedItem, setDraftedItem] = useState<string | null>(null);
  const purchase20 = getPurchaseRecommendations(chain, 20);
  const purchase100 = getPurchaseRecommendations(chain, 100);
  const needed20 = purchase20.filter((row) => row.orderQty > 0);
  const needed100 = purchase100.filter((row) => row.orderQty > 0);
  const cost20 = needed20.reduce((sum, row) => sum + row.estimatedCost, 0);
  const cost100 = needed100.reduce((sum, row) => sum + row.estimatedCost, 0);
  const createDraftPo = (row: typeof purchase20[number]) => {
    const qty = row.orderQty || row.requiredQty;
    setDraftedItem(row.item.id);
    void sourceOfTruth.submitPurchaseOrder({
      supplier: row.supplier,
      items: [{ itemId: row.item.id, qty, rate: row.item.cost }],
      submit: false,
    }).catch(reportSyncError);
  };

  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "موردون نشطون" : "Active suppliers"} value="5" />
        <KPI label={lang === "ar" ? "طلب 20 كشك" : "20-stand order"} value={formatMoney(cost20, lang)} delta={`${needed20.length} items`} trend="down" />
        <KPI label={lang === "ar" ? "احتياج 100 كشك" : "100-stand reserve"} value={formatMoney(cost100, lang)} />
        <KPI label={lang === "ar" ? "التوصيل في الموعد" : "On-time delivery"} value="94%" />
      </div>
      <Card className="ai-card">
        <div className="ai-head"><AITag label={lang === "ar" ? "شراء مقترح" : "Purchase plan"} /></div>
        <div className="ai-rule">
          <p>{lang === "ar" ? `للتوسع من 10 إلى 20 كشك، النظام يقترح شراء ${needed20.length} مواد بقيمة ${formatMoney(cost20, lang)}. خطة 100 كشك محفوظة كتوقع مالي وتشغيلي.` : `To expand from 10 to 20 stands, the system suggests ${needed20.length} purchase lines worth ${formatMoney(cost20, lang)}. The 100-stand plan is kept as a financial and operational forecast.`}</p>
        </div>
      </Card>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "الموردون" : "Suppliers"} sub={lang === "ar" ? "التكلفة والالتزام" : "Cost and delivery reliability"} />
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "المورد" : "Supplier"}</th>
              <th>{lang === "ar" ? "الفئة" : "Category"}</th>
              <th>{lang === "ar" ? "إنفاق 30 يوم" : "30-day spend"}</th>
              <th>{lang === "ar" ? "الالتزام" : "On-time"}</th>
              <th>{lang === "ar" ? "آخر طلب" : "Last order"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.name}>
                <td><strong>{supplier.name}</strong></td>
                <td>{t(supplier.category, lang)}</td>
                <td className="num">{formatMoney(supplier.spend30, lang)}</td>
                <td><Progress value={supplier.onTime / 100} tone={supplier.onTime > 92 ? "good" : "watch"} label={`${supplier.onTime}%`} /></td>
                <td>{t(supplier.lastOrder, lang)}</td>
                <td><button className="btn mini-btn">{lang === "ar" ? "طلب جديد" : "New PO"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "توقع الشراء" : "Purchase forecast"} sub={lang === "ar" ? "مبني على كمية المواد المطلوبة لكل كشك" : "Based on required raw material quantities per stand"} />
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "المادة" : "Item"}</th>
              <th>{lang === "ar" ? "المورد" : "Supplier"}</th>
              <th>{lang === "ar" ? "الموجود" : "Current"}</th>
              <th>{lang === "ar" ? "المطلوب لـ20" : "Required for 20"}</th>
              <th>{lang === "ar" ? "كمية الشراء" : "Order qty"}</th>
              <th>{lang === "ar" ? "التكلفة" : "Cost"}</th>
              <th>{lang === "ar" ? "الأولوية" : "Priority"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {purchase20.slice(0, 8).map((row) => (
              <tr key={row.item.id}>
                <td><strong>{t(row.item.name, lang)}</strong><span className="subcell">{row.item.id}</span></td>
                <td>{row.supplier}</td>
                <td className="num">{formatQty(row.currentQty, row.item.unit, lang)}</td>
                <td className="num">{formatQty(row.requiredQty, row.item.unit, lang)}</td>
                <td className="num">{formatQty(row.orderQty, row.item.unit, lang)}</td>
                <td className="num">{formatMoney(row.estimatedCost, lang)}</td>
                <td><span className={`badge ${row.priority === "critical" ? "critical" : row.priority === "watch" ? "watch" : "good"}`}>{row.priority}</span></td>
                <td>
                  <button className="btn mini-btn" disabled={row.orderQty <= 0} onClick={() => createDraftPo(row)}>
                    {draftedItem === row.item.id ? (lang === "ar" ? "تم" : "Drafted") : (lang === "ar" ? "طلب" : "Draft PO")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StaffScreen({ lang }: { lang: Lang }) {
  const payroll = monthlyPayroll();
  return (
    <div className="stack">
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "نشطون" : "Active staff"} value="32" />
        <KPI label={lang === "ar" ? "رواتب الشهر" : "Monthly payroll"} value={formatMoney(payroll, lang)} />
        <KPI label={lang === "ar" ? "متوسط الساعات" : "Avg weekly hours"} value="42" />
        <KPI label={lang === "ar" ? "تحت المراجعة" : "Under review"} value="1" sub={lang === "ar" ? "فرق نقدي" : "cash variance"} />
      </div>
      <Card className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "الموظف" : "Staff member"}</th>
              <th>{lang === "ar" ? "الدور" : "Role"}</th>
              <th>{lang === "ar" ? "الكشك" : "Kiosk"}</th>
              <th>{lang === "ar" ? "الساعات" : "Hours"}</th>
              <th>{lang === "ar" ? "الراتب" : "Salary"}</th>
              <th>{lang === "ar" ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr key={person.name.en}>
                <td><div className="person-row compact"><Avatar name={person.name.en} /><strong>{t(person.name, lang)}</strong></div></td>
                <td>{t(person.role, lang)}</td>
                <td className="num">{person.kiosk}</td>
                <td className="num">{person.hours}h</td>
                <td className="num">{formatMoney(person.salary, lang)}</td>
                <td><span className={`badge ${person.status === "review" ? "watch" : person.status === "active" ? "good" : ""}`}>{person.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ReportsScreen({ lang, chain }: { lang: Lang; chain: ChainState }) {
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const report = getFinancialReport(chain, period);
  const usageRows = getInventoryControlRows(chain).filter((row) => row.consumedQty > 0 || row.wastedQty > 0).slice(0, 8);

  return (
    <div className="stack">
      <Card className="ai-card">
        <div className="ai-head"><AITag label={lang === "ar" ? "ملخص مالي" : "Financial summary"} /></div>
        <div className="ai-rule">
          <p>{lang === "ar" ? `تقرير ${period} يجمع المبيعات والمخزون والهدر والمصاريف في قراءة مالية واحدة. الإيرادات ${formatMoney(report.revenue, lang)} وصافي الربح ${formatMoney(report.netProfit, lang)}.` : `${period} report combines sales, stock movement, waste, and expenses into one financial view. Revenue is ${formatMoney(report.revenue, lang)} with net profit of ${formatMoney(report.netProfit, lang)}.`}</p>
        </div>
      </Card>
      <div className="inline-actions">
        {(["daily", "weekly", "monthly", "yearly"] as ReportPeriod[]).map((item) => (
          <button key={item} className={`btn ${period === item ? "primary-btn" : "subtle-btn"}`} onClick={() => setPeriod(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="kpi-grid four">
        <KPI label={lang === "ar" ? "الإيرادات" : "Revenue"} value={formatMoney(report.revenue, lang)} delta="+10.4%" trend="up" />
        <KPI label={lang === "ar" ? "تكلفة المواد" : "COGS"} value={formatMoney(report.materialCost, lang)} sub="36.0%" />
        <KPI label={lang === "ar" ? "صافي الربح" : "Net profit"} value={formatMoney(report.netProfit, lang)} sub={`${report.netMargin.toFixed(1)}%`} />
        <KPI label={lang === "ar" ? "توقع الإيراد" : "Forecast revenue"} value={formatMoney(report.forecastRevenue, lang)} sub="+8%" />
      </div>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "الأرباح والخسائر" : "Profit and loss"} right={<button className="btn subtle-btn"><Download size={14} />PDF</button>} />
        <SimpleRows
          rows={[
            [lang === "ar" ? "الإيرادات" : "Revenue", formatMoney(report.revenue, lang), "+10.4%"],
            [lang === "ar" ? "تكلفة المواد" : "Raw material cost", `(${formatMoney(report.materialCost, lang)})`, "36.0%"],
            [lang === "ar" ? "تكلفة الشراء القادمة" : "Next purchase cost", `(${formatMoney(report.purchaseCost, lang)})`, lang === "ar" ? "تخطيط" : "planned"],
            [lang === "ar" ? "الرواتب" : "Salaries", `(${formatMoney(report.salaryExpense, lang)})`, ""],
            [lang === "ar" ? "المصاريف التشغيلية" : "Operational expenses", `(${formatMoney(report.operatingExpense, lang)})`, ""],
            [lang === "ar" ? "الهدر والخسارة" : "Waste and loss", `(${formatMoney(report.wasteLoss, lang)})`, ""],
            [lang === "ar" ? "أفضل كشك" : "Best-performing stand", report.bestKiosk, ""],
            [lang === "ar" ? "صافي الربح" : "Net profit", formatMoney(report.netProfit, lang), `${report.netMargin.toFixed(1)}%`],
          ]}
        />
      </Card>
      <Card className="table-card">
        <SectionTitle title={lang === "ar" ? "استهلاك المواد" : "Raw material consumption"} sub={lang === "ar" ? "من مبيعات POS والهدر" : "From POS sales and waste"} />
        <table className="data-table">
          <thead>
            <tr>
              <th>{lang === "ar" ? "المادة" : "Item"}</th>
              <th>{lang === "ar" ? "استهلاك البيع" : "Sold consumption"}</th>
              <th>{lang === "ar" ? "الهدر" : "Waste"}</th>
              <th>{lang === "ar" ? "المتبقي" : "Remaining"}</th>
              <th>{lang === "ar" ? "القيمة" : "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {(usageRows.length ? usageRows : getInventoryControlRows(chain).slice(0, 5)).map((row) => (
              <tr key={row.id}>
                <td><strong>{t(row.name, lang)}</strong><span className="subcell">{row.id}</span></td>
                <td className="num">{formatQty(row.consumedQty, row.unit, lang)}</td>
                <td className="num">{formatQty(row.wastedQty, row.unit, lang)}</td>
                <td className="num">{formatQty(row.remainingAtKiosks, row.unit, lang)}</td>
                <td className="num">{formatMoney(row.totalValue, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function POSPanel({
  lang,
  chain,
  setChain,
  sourceOfTruth,
}: {
  lang: Lang;
  chain: ChainState;
  setChain: React.Dispatch<React.SetStateAction<ChainState>>;
  sourceOfTruth: SourceOfTruthGateway;
}) {
  const [kioskId, setKioskId] = useState("K-01");
  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === kioskId) ?? kiosks[0];
  const [screen, setScreen] = useState<PosScreen>("login");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paidOrder, setPaidOrder] = useState<PaidOrder | null>(null);
  const [customerTender, setCustomerTender] = useState<CustomerDisplayTender | null>(null);
  const [lastAdded, setLastAdded] = useState<CustomerFlash | null>(null);
  const [shift, setShift] = useState<ShiftState>(() => createShiftState("K-01"));
  const totals = useMemo(() => calculateCartTotals(cart), [cart]);
  const summary = useMemo(() => shiftSummary(shift), [shift]);
  const stock = useMemo(() => getKioskStock(chain, kioskId, [cart]), [cart, chain, kioskId]);

  const selectKiosk = (nextKioskId: string) => {
    if (screen !== "login") return;
    setKioskId(nextKioskId);
    setCart([]);
    setPaidOrder(null);
    setCustomerTender(null);
    setLastAdded(null);
    setShift(createShiftState(nextKioskId));
  };

  const addItem = (item: MenuItem, size: string) => {
    if (!canFulfillRecipe(item.recipe, stock)) return;

    setCart((current) => {
      const key = `${item.id}:${size}`;
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) => line.key === key ? { ...line, qty: line.qty + 1 } : line);
      }
      return [...current, { key, id: item.id, name: item.name, size, price: item.price, qty: 1, recipe: item.recipe }];
    });
    setLastAdded({ key: `${item.id}:${size}`, name: item.name, price: item.price, t: Date.now() });
  };
  const mirrorLineIncrement = (line: CartLine) => {
    setLastAdded({ key: line.key, name: line.name, price: line.price, t: Date.now() });
  };
  const openPayment = () => {
    setPaidOrder(null);
    setCustomerTender(null);
    setScreen("payment");
  };
  const previewTender = (tender: Tender) => {
    setCustomerTender({ ...tender, total: totals.total });
  };
  const commitPayment = (tender: Tender) => {
    if (cart.length === 0) return;
    const total = totals.total;
    const lines = cart;
    const sale = createSaleRecord({
      id: `S-${kioskId}-${String(shift.sales.length + 1).padStart(4, "0")}`,
      lines,
      tender,
    });
    setShift((current) => ({
      ...current,
      sales: [...current.sales, sale],
    }));
    setChain((current) => recordKioskSale(current, kioskId, sale));
    void sourceOfTruth.submitSale(sale, kioskId).catch(reportSyncError);
    setPaidOrder({ lines, total, tender });
    setCart([]);
  };
  const startNewOrder = () => {
    setPaidOrder(null);
    setCustomerTender(null);
    setScreen("sale");
  };
  const recordWaste = (draft: WasteDraft) => {
    const waste = createWasteRecord({
      id: `W-${kioskId}-${String(shift.waste.length + 1).padStart(4, "0")}`,
      ...draft,
    });
    setShift((current) => ({
      ...current,
      waste: [...current.waste, waste],
    }));
    setChain((current) => recordKioskWaste(current, kioskId, waste));
    void sourceOfTruth.submitWaste(waste, kioskId).catch(reportSyncError);
    setScreen("sale");
  };
  const closeShift = (draft: ShiftCloseDraft) => {
    void sourceOfTruth.submitShiftClose({
      kioskId,
      cashier: "maya.ahmed@example.com",
      shift,
      stock,
      draft,
    }).catch(reportSyncError);
    resetShift();
  };
  const resetShift = () => {
    setCart([]);
    setPaidOrder(null);
    setCustomerTender(null);
    setLastAdded(null);
    setShift(createShiftState(kioskId));
    setScreen("login");
  };

  return (
    <div className="tablet-stage pos-dual-stage">
      <div className="tablet pos-cashier-tablet">
        <div className="tablet-camera" />
        <div className="tablet-screen">
          {screen === "login" && (
            <POSLogin
              lang={lang}
              kioskId={kioskId}
              onKioskChange={selectKiosk}
              onEnter={() => setScreen("sale")}
            />
          )}
          {screen === "sale" && (
            <POSSale
              lang={lang}
              kiosk={selectedKiosk}
              cart={cart}
              setCart={setCart}
              addItem={addItem}
              totals={totals}
              stock={stock}
              shiftStats={summary}
              onPayment={openPayment}
              onWaste={() => setScreen("waste")}
              onStock={() => setScreen("stock")}
              onLogout={() => setScreen("close")}
              onMirrorAdd={mirrorLineIncrement}
            />
          )}
          {screen === "payment" && (
            <POSPayment
              lang={lang}
              cart={paidOrder?.lines ?? cart}
              total={paidOrder?.total ?? totals.total}
              onBack={() => {
                setCustomerTender(null);
                setScreen("sale");
              }}
              onPreviewTender={previewTender}
              onCommit={commitPayment}
              onNewOrder={startNewOrder}
            />
          )}
          {screen === "waste" && <POSWaste lang={lang} onBack={() => setScreen("sale")} onDone={recordWaste} />}
          {screen === "stock" && <POSStock lang={lang} stock={stock} onBack={() => setScreen("sale")} />}
          {screen === "close" && (
            <POSShiftClose
              lang={lang}
              shiftId={shift.id}
              stock={stock}
              shiftStats={summary}
              onBack={() => setScreen("sale")}
              onConfirm={closeShift}
            />
          )}
        </div>
      </div>
      <div className="tablet customer-tablet">
        <div className="tablet-camera customer-camera" />
        <div className="tablet-screen">
          <CustomerDisplay
            lang={lang}
            kiosk={selectedKiosk}
            screen={screen}
            cart={cart}
            totals={totals}
            tender={customerTender}
            lastAdded={lastAdded}
          />
        </div>
        <div className="customer-tablet-label">{lang === "ar" ? "شاشة العميل" : "Customer-facing display"}</div>
      </div>
    </div>
  );
}

function CustomerDisplay({
  lang,
  kiosk,
  screen,
  cart,
  totals,
  tender,
  lastAdded,
}: {
  lang: Lang;
  kiosk: Kiosk;
  screen: PosScreen;
  cart: CartLine[];
  totals: { subtotal: number; tax: number; total: number };
  tender: CustomerDisplayTender | null;
  lastAdded: CustomerFlash | null;
}) {
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    if (!lastAdded) return;
    setShowFlash(true);
    const timeout = window.setTimeout(() => setShowFlash(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [lastAdded]);

  if (screen === "login") {
    return (
      <div className="customer-display customer-standby">
        <div className="customer-standby-center">
          <div className="customer-logo-motion" aria-hidden="true">
            <JuiceLottie className="customer-lottie" />
            <svg className="customer-logo-fallback" viewBox="0 0 160 160" role="img" aria-label="">
              <path d="M92 25h36" />
              <path d="M110 25 91 60" />
              <path d="M47 58h76l-10 74a14 14 0 0 1-14 12H71a14 14 0 0 1-14-12L47 58Z" />
              <path d="M58 78h56" />
              <path d="M68 92c9 7 25 7 36 0" />
              <path d="M75 112h28" />
            </svg>
          </div>
          <div className="customer-brand">{lang === "ar" ? brand.arName : brand.name}</div>
          <div className="customer-kicker">{lang === "ar" ? "قهوة · عصائر · كيك" : "Coffee · Juice · Cake"}</div>
          <div className="customer-rule" />
          <p>{lang === "ar" ? "تفضل عند الكاشير" : "Step up when ready"}</p>
        </div>
        <div className="customer-footer">
          <span>{t(kiosk.area, lang)}</span>
          <span className="num">07:42</span>
        </div>
      </div>
    );
  }

  if (screen === "waste" || screen === "stock" || screen === "close") {
    return (
      <div className="customer-display customer-wait">
        <div>
          <h2>{lang === "ar" ? "لحظة من فضلك" : "One moment"}</h2>
          <p>{lang === "ar" ? "الكاشير يعالج طلبك" : "The cashier is with you shortly"}</p>
        </div>
      </div>
    );
  }

  if (screen === "payment" && tender) {
    return (
      <div className="customer-display customer-paid">
        <div className="customer-paid-check"><Check size={34} /></div>
        <h2>{lang === "ar" ? "شكرا لزيارتك" : "Thank you"}</h2>
        <strong className="customer-total-big">{formatMoney(tender.total, lang)}</strong>
        <p>{lang === "ar" ? "نتمنى لك يوما جميلا" : "Have a great day"}</p>
      </div>
    );
  }

  if (screen === "payment") {
    return (
      <div className="customer-display customer-payment">
        <div className="customer-payment-head">
          <span className="customer-micro">{lang === "ar" ? "إجمالي مستحق" : "Amount due"}</span>
          <strong className="customer-total-big">{formatMoney(totals.total, lang)}</strong>
        </div>
        <div className="customer-order-list">
          <span className="customer-micro">{lang === "ar" ? "طلبك" : "Your order"}</span>
          {cart.map((line) => (
            <div className="customer-order-row compact" key={line.key}>
              <span>{line.qty}x {t(line.name, lang)}</span>
              <strong>{formatMoney(line.price * line.qty, lang)}</strong>
            </div>
          ))}
        </div>
        <div className="customer-pay-cue">
          <CreditCard size={19} />
          <span>{lang === "ar" ? "مرر أو أدخل البطاقة" : "Tap, insert, or pay cash"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-display customer-sale">
      <div className="customer-sale-top">
        <div className="row-line">
          <div className="customer-mini-mark">B</div>
          <strong>{lang === "ar" ? brand.arName : brand.name}</strong>
        </div>
        <span className="muted">#B-{1247 + cart.length}</span>
      </div>

      {cart.length === 0 ? (
        <div className="customer-empty">
          <h2>{lang === "ar" ? "أهلا بك" : "Welcome"}</h2>
          <p>{lang === "ar" ? "سيظهر طلبك هنا أثناء التحضير" : "Your order will appear here as it is added"}</p>
        </div>
      ) : (
        <div className="customer-order-list">
          <span className="customer-micro">{lang === "ar" ? "طلبك" : "Your order"}</span>
          {cart.map((line) => {
            const justAdded = lastAdded?.key === line.key && showFlash;
            return (
              <div className={`customer-order-row ${justAdded ? "flash" : ""}`} key={line.key}>
                <div>
                  <strong>{t(line.name, lang)}</strong>
                  <span>{line.size} · {formatMoney(line.price, lang)}</span>
                </div>
                <div className="customer-row-price">
                  <span>x{line.qty}</span>
                  <strong>{formatMoney(line.price * line.qty, lang)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="customer-total-panel">
        <div><span>{lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</span><strong>{formatMoney(totals.subtotal, lang)}</strong></div>
        <div><span>{lang === "ar" ? "الضريبة" : "Tax"}</span><strong>{formatMoney(totals.tax, lang)}</strong></div>
        <div className="customer-grand"><span>{lang === "ar" ? "الإجمالي" : "Total"}</span><strong>{formatMoney(totals.total, lang)}</strong></div>
      </div>

      <div className="customer-status-strip">
        {cart.length === 0
          ? (lang === "ar" ? "بانتظار طلبك" : "Awaiting order")
          : (lang === "ar" ? "أكد مع الكاشير عند الانتهاء" : "Confirm with cashier when ready")}
      </div>
    </div>
  );
}

function reportSyncError(error: unknown) {
  console.warn("Bayaan source-of-truth sync failed", error);
}

function POSLogin({
  lang,
  kioskId,
  onKioskChange,
  onEnter,
}: {
  lang: Lang;
  kioskId: string;
  onKioskChange: (kioskId: string) => void;
  onEnter: () => void;
}) {
  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === kioskId) ?? kiosks[0];
  const visibleStaff = useMemo(() => {
    const assigned = staff.filter((person) => person.kiosk.split(",").map((entry) => entry.trim()).includes(kioskId));
    return (assigned.length ? assigned : staff).slice(0, 4);
  }, [kioskId]);
  const [picked, setPicked] = useState(visibleStaff[0]);
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (visibleStaff.some((person) => person.name.en === picked.name.en)) return;
    setPicked(visibleStaff[0]);
    setPin("");
  }, [picked.name.en, visibleStaff]);

  return (
    <div className="pos-login">
      <POSTop lang={lang} kiosk={selectedKiosk} />
      <div className="login-body">
        <section className="login-staff">
          <h2>{lang === "ar" ? "صباح الخير" : "Good morning"}</h2>
          <p>{lang === "ar" ? "اختر اسمك لبدء الوردية" : "Pick your name to start the shift"}</p>
          <div className="kiosk-picker">
            <div className="kiosk-picker-head">
              <span className="label">{lang === "ar" ? "جهاز نقطة البيع" : "POS device"}</span>
              <strong>{t(selectedKiosk.name, lang)}</strong>
            </div>
            <div className="kiosk-picker-grid">
              {kiosks.map((kiosk) => (
                <button
                  key={kiosk.id}
                  className={`kiosk-pick ${kiosk.id === kioskId ? "active" : ""}`}
                  onClick={() => onKioskChange(kiosk.id)}
                >
                  <strong>{kiosk.id}</strong>
                  <span>{t(kiosk.area, lang)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="staff-picker">
            {visibleStaff.map((person) => (
              <button key={person.name.en} className={`staff-card ${picked.name.en === person.name.en ? "active" : ""}`} onClick={() => { setPicked(person); setPin(""); }}>
                <Avatar name={person.name.en} size="lg" />
                <span>
                  <strong>{t(person.name, lang)}</strong>
                  <small>{t(person.role, lang)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="pin-panel">
          <div className="person-row">
            <Avatar name={picked.name.en} />
            <div>
              <strong>{t(picked.name, lang)}</strong>
              <span>{t(picked.role, lang)}</span>
            </div>
          </div>
          <div className="pin-title"><LockKeyhole size={14} />{lang === "ar" ? "رمز الدخول" : "Enter PIN"}</div>
          <div className="pin-dots">
            {[0, 1, 2, 3].map((index) => <span key={index} className={pin[index] ? "filled" : ""} />)}
          </div>
          <div className="pin-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
              <button key={number} onClick={() => setPin((value) => `${value}${number}`.slice(0, 4))}>{number}</button>
            ))}
            <button onClick={() => setPin("")}>{lang === "ar" ? "مسح" : "Clear"}</button>
            <button onClick={() => setPin((value) => `${value}0`.slice(0, 4))}>0</button>
            <button onClick={() => setPin((value) => value.slice(0, -1))}><X size={16} /></button>
          </div>
          <button className="btn primary-btn big-btn" onClick={onEnter} disabled={pin.length < 4}>
            {lang === "ar" ? "ابدأ الوردية" : "Start shift"} <ArrowRight size={16} />
          </button>
          <span className="muted center-text">{lang === "ar" ? "رصيد الصندوق الافتتاحي 500,000 د.ع" : "Opening cash float IQD 500,000"}</span>
        </aside>
      </div>
    </div>
  );
}

function POSSale({
  lang,
  kiosk,
  cart,
  setCart,
  addItem,
  totals,
  stock,
  shiftStats,
  onPayment,
  onWaste,
  onStock,
  onLogout,
  onMirrorAdd,
}: {
  lang: Lang;
  kiosk: Kiosk;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  addItem: (item: MenuItem, size: string) => void;
  totals: { subtotal: number; tax: number; total: number };
  stock: StockSnapshot[];
  shiftStats: ReturnType<typeof shiftSummary>;
  onPayment: () => void;
  onWaste: () => void;
  onStock: () => void;
  onLogout: () => void;
  onMirrorAdd: (line: CartLine) => void;
}) {
  const [category, setCategory] = useState("coffee");
  const [search, setSearch] = useState("");
  const filtered = menuItems.filter((item) => {
    const inCategory = item.category === category;
    const inSearch = t(item.name, lang).toLowerCase().includes(search.toLowerCase()) || item.name.en.toLowerCase().includes(search.toLowerCase());
    return search ? inSearch : inCategory;
  });
  const currentConsumption = useMemo(
    () => Array.from(cartConsumption(cart), ([ingredientId, qty]) => ({
      ingredient: ingredients.find((ingredient) => ingredient.id === ingredientId),
      qty,
    })).filter((row): row is { ingredient: typeof ingredients[number]; qty: number } => Boolean(row.ingredient)),
    [cart],
  );
  const productAvailability = useMemo(
    () => new Map(menuItems.map((item) => [item.id, canFulfillRecipe(item.recipe, stock)])),
    [stock],
  );

  const inc = (key: string) => {
    const line = cart.find((entry) => entry.key === key);
    if (!line || !canFulfillRecipe(line.recipe, stock)) return;
    setCart((current) => current.map((entry) => entry.key === key ? { ...entry, qty: entry.qty + 1 } : entry));
    onMirrorAdd(line);
  };
  const dec = (key: string) => setCart((current) => current.flatMap((line) => line.key === key ? (line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : []) : [line]));

  return (
    <div className="pos-sale">
      <POSTop lang={lang} kiosk={kiosk} compact canClose={cart.length === 0} onWaste={onWaste} onStock={onStock} onLogout={onLogout} />
      <div className="sale-grid">
        <section className="menu-panel">
          <div className="sale-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={lang === "ar" ? "بحث عن منتج" : "Search product"} />
            </div>
            <div className="category-row">
              {menuCategories.map((cat) => (
                <button key={cat.id} className={`btn ${category === cat.id && !search ? "primary-btn" : "subtle-btn"}`} onClick={() => { setCategory(cat.id); setSearch(""); }}>
                  {cat.id === "coffee" && <Coffee size={14} />}
                  {cat.id === "juice" && <Leaf size={14} />}
                  {cat.id === "cake" && <CakeSlice size={14} />}
                  {cat.id === "bakery" && <PackageCheck size={14} />}
                  {t(cat.label, lang)}
                </button>
              ))}
            </div>
          </div>
          <div className="stock-strip">
            {stock.slice(0, 5).map((item) => (
              <div className={`stock-chip ${item.status !== "ok" ? "low" : ""}`} key={item.id}>
                <span>{t(item.name, lang)}</span>
                <strong>{formatQty(item.remaining, item.unit, lang)}</strong>
              </div>
            ))}
          </div>
          <div className="shift-strip">
            <span><strong>{shiftStats.orderCount}</strong>{lang === "ar" ? "طلبات مغلقة" : "closed orders"}</span>
            <span><strong>{formatMoney(shiftStats.salesTotal, lang)}</strong>{lang === "ar" ? "مبيعات الوردية" : "shift sales"}</span>
            <span><strong>{formatMoney(shiftStats.cashExpected, lang)}</strong>{lang === "ar" ? "نقد متوقع" : "expected cash"}</span>
            <span><strong>{formatMoney(shiftStats.wasteCost, lang)}</strong>{lang === "ar" ? "هدر مسجل" : "logged waste"}</span>
          </div>
          <div className="product-grid">
            {filtered.map((item) => (
              <ProductButton
                key={item.id}
                item={item}
                lang={lang}
                disabled={!productAvailability.get(item.id)}
                onAdd={() => addItem(item, item.sizes[0])}
              />
            ))}
          </div>
        </section>
        <aside className="cart-panel">
          <div className="cart-head">
            <div>
              <h3>{lang === "ar" ? "الطلب الحالي" : "Current order"}</h3>
              <span className="muted">#B-{1247 + cart.length}</span>
            </div>
            <button className="btn mini-btn" onClick={() => setCart([])} disabled={cart.length === 0}>{lang === "ar" ? "مسح" : "Clear"}</button>
          </div>
          <div className="cart-lines">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <ShoppingCart size={34} />
                <span>{lang === "ar" ? "اختر منتجا للبدء" : "Tap an item to start"}</span>
              </div>
            ) : cart.map((line) => (
              <div className="cart-line" key={line.key}>
                <div>
                  <strong>{t(line.name, lang)}</strong>
                  <span>{line.size}</span>
                </div>
                <strong className="num">{formatMoney(line.price * line.qty, lang)}</strong>
                <div className="qty-stepper">
                  <button onClick={() => dec(line.key)}><Minus size={13} /></button>
                  <span>{line.qty}</span>
                  <button onClick={() => inc(line.key)}><Plus size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-total">
            <div><span>{lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</span><strong>{formatMoney(totals.subtotal, lang)}</strong></div>
            <div><span>{lang === "ar" ? "الضريبة" : "Tax"}</span><strong>{formatMoney(totals.tax, lang)}</strong></div>
            <div className="grand"><span>{lang === "ar" ? "الإجمالي" : "Total"}</span><strong>{formatMoney(totals.total, lang)}</strong></div>
            <div className="consumption-preview">
              {currentConsumption.slice(0, 3).map(({ ingredient, qty }) => (
                <span key={ingredient.id}>{t(ingredient.name, lang)} {formatQty(qty, ingredient.unit, lang)}</span>
              ))}
            </div>
            <button className="btn primary-btn charge-btn" onClick={onPayment} disabled={cart.length === 0}>
              {lang === "ar" ? "تحصيل" : "Charge"} {formatMoney(totals.total, lang)}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function POSPayment({
  lang,
  cart,
  total,
  onBack,
  onPreviewTender,
  onCommit,
  onNewOrder,
}: {
  lang: Lang;
  cart: CartLine[];
  total: number;
  onBack: () => void;
  onPreviewTender: (tender: Tender) => void;
  onCommit: (tender: Tender) => void;
  onNewOrder: () => void;
}) {
  const [phase, setPhase] = useState<"choose" | "done">("choose");
  const [method, setMethod] = useState<TenderMethod | "">("");
  const [cash, setCash] = useState("");
  const cashValue = Number(cash) || 0;

  if (phase === "done") {
    return (
      <div className="payment-done">
        <div className="payment-check"><Check size={34} /></div>
        <h2>{formatMoney(total, lang)}</h2>
        <p>{lang === "ar" ? "تم دفع الطلب" : "Order paid"}</p>
        {method === "cash" && cashValue > total ? <div className="change-box"><span>{lang === "ar" ? "الباقي" : "Change due"}</span><strong>{formatMoney(cashValue - total, lang)}</strong></div> : null}
        <div className="inline-actions center-actions">
          <button className="btn subtle-btn"><ReceiptText size={15} />{lang === "ar" ? "طباعة" : "Print"}</button>
          <button className="btn primary-btn" onClick={onNewOrder}>{lang === "ar" ? "طلب جديد" : "New order"} <ArrowRight size={15} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-screen">
      <div className="payment-top">
        <button className="btn subtle-btn" onClick={onBack}>{lang === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}{lang === "ar" ? "عودة" : "Back"}</button>
        <strong>{lang === "ar" ? "اختيار الدفع" : "Choose payment"}</strong>
      </div>
      <div className="payment-grid">
        <section>
          <span className="label">{lang === "ar" ? "المبلغ المستحق" : "Amount due"}</span>
          <h2>{formatMoney(total, lang)}</h2>
          <div className="pay-methods">
            {([
              { id: "cash", label: lang === "ar" ? "نقد" : "Cash", icon: Banknote },
              { id: "card", label: lang === "ar" ? "بطاقة" : "Card", icon: CreditCard },
              { id: "wallet", label: lang === "ar" ? "محفظة" : "Wallet", icon: Wallet },
            ] satisfies Array<{ id: TenderMethod; label: string; icon: LucideIcon }>).map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`pay-card ${method === item.id ? "active" : ""}`} onClick={() => setMethod(item.id)}>
                  <Icon size={28} />
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>
          {method === "cash" && (
            <div className="cash-entry">
              <input value={cash} onChange={(event) => setCash(event.target.value)} inputMode="numeric" placeholder={lang === "ar" ? "المبلغ المستلم" : "Amount received"} />
              <div className="quick-cash">
                {[...new Set([total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, 50_000])].map((amount) => (
                  <button className="btn mini-btn" key={amount} onClick={() => setCash(String(amount))}>{formatMoney(amount, lang)}</button>
                ))}
              </div>
            </div>
          )}
          <button
            className="btn primary-btn big-btn"
            disabled={!method || (method === "cash" && cashValue < total)}
            onClick={() => {
              if (!method) return;
              const tender = { method, received: method === "cash" ? cashValue : undefined };
              onPreviewTender(tender);
              onCommit(tender);
              setPhase("done");
            }}
          >
            {lang === "ar" ? "تأكيد الدفع" : "Confirm payment"}
          </button>
        </section>
        <aside className="summary-card">
          <span className="label">{lang === "ar" ? "ملخص الطلب" : "Order summary"}</span>
          {cart.map((line) => (
            <div className="summary-line" key={line.key}>
              <span>{line.qty}x {t(line.name, lang)}</span>
              <strong>{formatMoney(line.price * line.qty, lang)}</strong>
            </div>
          ))}
          <div className="summary-total">
            <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
            <strong>{formatMoney(total, lang)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}

function POSStock({ lang, stock, onBack }: { lang: Lang; stock: StockSnapshot[]; onBack: () => void }) {
  const keyStock = [...stock]
    .sort((a, b) => {
      const order = { empty: 0, low: 1, ok: 2 } as const;
      return order[a.status] - order[b.status];
    })
    .slice(0, 10);

  return (
    <div className="stock-screen">
      <div className="payment-top">
        <button className="btn subtle-btn" onClick={onBack}>{lang === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}{lang === "ar" ? "عودة" : "Back"}</button>
        <strong>{lang === "ar" ? "مخزون الكشك" : "Kiosk stock"}</strong>
      </div>
      <div className="pos-stock-body">
        <div className="pos-stock-summary">
          <div>
            <span>{lang === "ar" ? "مواد منخفضة" : "Low items"}</span>
            <strong>{stock.filter((item) => item.status !== "ok").length}</strong>
          </div>
          <div>
            <span>{lang === "ar" ? "مواد مستهلكة" : "Tracked items"}</span>
            <strong>{stock.length}</strong>
          </div>
          <div>
            <span>{lang === "ar" ? "آخر مزامنة" : "Last sync"}</span>
            <strong>{lang === "ar" ? "الآن" : "Now"}</strong>
          </div>
        </div>
        <div className="pos-stock-list">
          {keyStock.map((item) => (
            <div className={`pos-stock-row ${item.status}`} key={item.id}>
              <div>
                <strong>{t(item.name, lang)}</strong>
                <span>{lang === "ar" ? "افتتاحي" : "Opening"} {formatQty(item.opening, item.unit, lang)}</span>
              </div>
              <div>
                <span>{lang === "ar" ? "مستهلك" : "Consumed"}</span>
                <strong>{formatQty(item.consumed, item.unit, lang)}</strong>
              </div>
              <div>
                <span>{lang === "ar" ? "هدر" : "Waste"}</span>
                <strong>{formatQty(item.wasted, item.unit, lang)}</strong>
              </div>
              <div>
                <span>{lang === "ar" ? "متبقي" : "Remaining"}</span>
                <strong>{formatQty(item.remaining, item.unit, lang)}</strong>
              </div>
              <em>{item.status === "ok" ? (lang === "ar" ? "جيد" : "OK") : item.status === "low" ? (lang === "ar" ? "منخفض" : "Low") : (lang === "ar" ? "نفد" : "Empty")}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function POSWaste({ lang, onBack, onDone }: { lang: Lang; onBack: () => void; onDone: (draft: WasteDraft) => void }) {
  const [item, setItem] = useState<MenuItem | null>(menuItems[4]);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const reasons = lang === "ar" ? ["نهاية اليوم", "طلب خاطئ", "سكب", "رفض جودة", "تالف"] : ["End of day", "Wrong order", "Spill", "Quality reject", "Spoiled"];
  const cost = item ? item.price * qty : 0;

  return (
    <div className="waste-screen">
      <div className="payment-top">
        <button className="btn subtle-btn" onClick={onBack}>{lang === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}{lang === "ar" ? "عودة" : "Back"}</button>
        <strong>{lang === "ar" ? "تسجيل هدر" : "Record waste"}</strong>
      </div>
      <div className="waste-grid">
        <section>
          <StepTitle number="1" label={lang === "ar" ? "اختر المادة" : "Choose item"} />
          <div className="waste-items">
            {menuItems.slice(4, 12).map((product) => (
              <button className={`waste-item ${item?.id === product.id ? "active" : ""}`} key={product.id} onClick={() => setItem(product)}>
                <strong>{t(product.name, lang)}</strong>
                <span>{formatMoney(product.price, lang)}</span>
              </button>
            ))}
          </div>
          <StepTitle number="2" label={lang === "ar" ? "الكمية" : "Quantity"} />
          <div className="large-stepper">
            <button onClick={() => setQty((value) => Math.max(1, value - 1))}><Minus size={17} /></button>
            <strong>{qty}</strong>
            <button onClick={() => setQty((value) => value + 1)}><Plus size={17} /></button>
          </div>
          <StepTitle number="3" label={lang === "ar" ? "السبب" : "Reason"} />
          <div className="reason-row">
            {reasons.map((entry) => (
              <button key={entry} className={`btn ${reason === entry ? "primary-btn" : "subtle-btn"}`} onClick={() => setReason(entry)}>{entry}</button>
            ))}
          </div>
        </section>
        <aside className="summary-card waste-summary">
          <span className="label">{lang === "ar" ? "ملخص" : "Summary"}</span>
          <div className="summary-line"><span>{lang === "ar" ? "المادة" : "Item"}</span><strong>{item ? t(item.name, lang) : "-"}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "الكمية" : "Qty"}</span><strong>{qty}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "السبب" : "Reason"}</span><strong>{reason || "-"}</strong></div>
          <div className="summary-total"><span>{lang === "ar" ? "قيمة الخسارة" : "Loss value"}</span><strong>{formatMoney(cost, lang)}</strong></div>
          <button className="btn primary-btn big-btn" disabled={!item || !reason} onClick={() => item && onDone({ product: item, qty, reason })}>{lang === "ar" ? "سجل الهدر" : "Submit waste"}</button>
        </aside>
      </div>
    </div>
  );
}

function POSShiftClose({
  lang,
  shiftId,
  stock,
  shiftStats,
  onBack,
  onConfirm,
}: {
  lang: Lang;
  shiftId: string;
  stock: StockSnapshot[];
  shiftStats: ReturnType<typeof shiftSummary>;
  onBack: () => void;
  onConfirm: (draft: ShiftCloseDraft) => void;
}) {
  const countItems = stock.slice(0, 5);
  const [actualCash, setActualCash] = useState(String(shiftStats.cashExpected));
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(countItems.map((item) => [item.id, String(item.remaining)])),
  );
  const actualCashValue = Number(actualCash) || 0;
  const cashVariance = actualCashValue - shiftStats.cashExpected;
  const stockVariance = countItems.reduce((sum, item) => sum + Math.abs((Number(counts[item.id]) || 0) - item.remaining), 0);

  return (
    <div className="close-screen">
      <div className="payment-top">
        <button className="btn subtle-btn" onClick={onBack}>{lang === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}{lang === "ar" ? "عودة" : "Back"}</button>
        <strong>{lang === "ar" ? "إغلاق الوردية" : "Close shift"}</strong>
      </div>
      <div className="close-grid">
        <section>
          <div className="close-kpis">
            <div><span>{lang === "ar" ? "طلبات مغلقة" : "Closed orders"}</span><strong>{shiftStats.orderCount}</strong></div>
            <div><span>{lang === "ar" ? "مبيعات الوردية" : "Shift sales"}</span><strong>{formatMoney(shiftStats.salesTotal, lang)}</strong></div>
            <div><span>{lang === "ar" ? "نقد متوقع" : "Expected cash"}</span><strong>{formatMoney(shiftStats.cashExpected, lang)}</strong></div>
            <div><span>{lang === "ar" ? "هدر مسجل" : "Logged waste"}</span><strong>{formatMoney(shiftStats.wasteCost, lang)}</strong></div>
          </div>
          <StepTitle number="1" label={lang === "ar" ? "عد الصندوق" : "Count cash drawer"} />
          <div className="cash-entry close-cash">
            <input
              value={actualCash}
              onChange={(event) => setActualCash(event.target.value)}
              inputMode="numeric"
              placeholder={lang === "ar" ? "النقد الفعلي" : "Actual cash"}
            />
            <div className={`variance-chip ${cashVariance === 0 ? "good" : cashVariance < 0 ? "bad" : "watch"}`}>
              <span>{lang === "ar" ? "فرق النقد" : "Cash variance"}</span>
              <strong>{formatMoney(cashVariance, lang)}</strong>
            </div>
          </div>
          <StepTitle number="2" label={lang === "ar" ? "عد المواد الرئيسية" : "Count key ingredients"} />
          <div className="stock-count-list">
            {countItems.map((item) => {
              const actual = Number(counts[item.id]) || 0;
              const variance = actual - item.remaining;
              return (
                <div className="stock-count-row" key={item.id}>
                  <div>
                    <strong>{t(item.name, lang)}</strong>
                    <span>{lang === "ar" ? "متوقع" : "Expected"} {formatQty(item.remaining, item.unit, lang)}</span>
                  </div>
                  <input
                    value={counts[item.id]}
                    onChange={(event) => setCounts((current) => ({ ...current, [item.id]: event.target.value }))}
                    inputMode="decimal"
                    aria-label={`${item.name.en} actual count`}
                  />
                  <em className={variance === 0 ? "good" : variance < 0 ? "bad" : "watch"}>
                    {formatQty(variance, item.unit, lang)}
                  </em>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="summary-card close-summary">
          <span className="label">{lang === "ar" ? "مراجعة قبل الإغلاق" : "Close review"}</span>
          <div className="summary-line"><span>{lang === "ar" ? "رقم الوردية" : "Shift ID"}</span><strong>{shiftId}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "النقد المتوقع" : "Expected cash"}</span><strong>{formatMoney(shiftStats.cashExpected, lang)}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "النقد الفعلي" : "Actual cash"}</span><strong>{formatMoney(actualCashValue, lang)}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "فرق النقد" : "Cash variance"}</span><strong className={cashVariance < 0 ? "bad" : "good"}>{formatMoney(cashVariance, lang)}</strong></div>
          <div className="summary-line"><span>{lang === "ar" ? "فروقات المخزون" : "Stock variances"}</span><strong>{stockVariance ? stockVariance.toFixed(2) : "0"}</strong></div>
          <p className="close-note">
            {lang === "ar"
              ? "بعد الإغلاق، تتحول هذه الأرقام إلى سجل وردية للمحاسبة والمراجعة."
              : "After close, these numbers become the auditable shift record for accounting and operations."}
          </p>
          <button className="btn primary-btn big-btn" onClick={() => onConfirm({
            actualCash: actualCashValue,
            stockCounts: countItems.map((item) => ({
              item: item.id,
              uom: item.unit,
              expected_qty: item.remaining,
              actual_qty: Number(counts[item.id]) || 0,
            })),
          })}>
            {lang === "ar" ? "اعتماد إغلاق الوردية" : "Submit shift close"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function ProductButton({ item, lang, disabled, onAdd }: { item: MenuItem; lang: Lang; disabled?: boolean; onAdd: () => void }) {
  const Icon = item.category === "juice" ? Leaf : item.category === "cake" ? CakeSlice : item.category === "bakery" ? PackageCheck : Coffee;
  return (
    <button className={`product-card ${disabled ? "disabled" : ""}`} onClick={onAdd} disabled={disabled}>
      <div className="product-icon"><Icon size={18} /></div>
      <strong>{t(item.name, lang)}</strong>
      <div>
        <span className="num">{formatMoney(item.price, lang)}</span>
        <small>{disabled ? (lang === "ar" ? "المخزون لا يكفي" : "Stock blocked") : item.sizes.join(" · ")}</small>
      </div>
    </button>
  );
}

function POSTop({
  lang,
  kiosk,
  compact,
  canClose = true,
  onWaste,
  onStock,
  onLogout,
}: {
  lang: Lang;
  kiosk: Kiosk;
  compact?: boolean;
  canClose?: boolean;
  onWaste?: () => void;
  onStock?: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className={`pos-top ${compact ? "compact" : ""}`}>
      <div className="row-line">
        <div className="sidebar-mark">B</div>
        <div>
          <strong>{t(kiosk.area, lang)} · {kiosk.id}</strong>
          <span>{lang === "ar" ? "وردية 7:00 ص" : "Shift 7:00 AM"}</span>
        </div>
        <span className="badge good"><span className="status-dot good" />{t(text.online, lang)}</span>
      </div>
      {compact ? (
        <div className="inline-actions">
          <button className="btn subtle-btn" onClick={onWaste}><Trash2 size={14} />{lang === "ar" ? "هدر" : "Waste"}</button>
          <button className="btn subtle-btn" onClick={onStock}><Package size={14} />{lang === "ar" ? "مخزون" : "Stock"}</button>
          <button className="btn subtle-btn" onClick={onLogout} disabled={!canClose}>
            {lang === "ar" ? "إنهاء" : "End shift"}
          </button>
        </div>
      ) : (
        <span className="muted">{lang === "ar" ? "آخر مزامنة الآن" : "Last sync just now"}</span>
      )}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function KPI({
  label,
  value,
  sub,
  delta,
  trend,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  trend?: "up" | "down";
  spark?: number[];
}) {
  return (
    <Card className="kpi-card">
      <div className="between">
        <span className="label">{label}</span>
        {spark ? <Sparkline data={spark} /> : null}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {sub ? <span>{sub}</span> : null}
        {delta ? <strong className={trend === "down" ? "bad" : "good"}>{delta}</strong> : null}
      </div>
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 76;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points.join(" ")} />
    </svg>
  );
}

function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

function AITag({ label }: { label: string }) {
  return <span className="ai-tag"><Brain size={12} />{label}</span>;
}

function Avatar({ name, size }: { name: string; size?: "lg" }) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("");
  return <span className={`avatar ${size === "lg" ? "large" : ""}`}>{initials}</span>;
}

function KioskTable({ lang, rows, onPick }: { lang: Lang; rows: Kiosk[]; onPick?: (kioskId: string) => void }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>{lang === "ar" ? "الكشك" : "Kiosk"}</th>
          <th>{lang === "ar" ? "المنطقة" : "Area"}</th>
          <th>{lang === "ar" ? "الإيرادات" : "Revenue"}</th>
          <th>{lang === "ar" ? "الطلبات" : "Orders"}</th>
          <th>{lang === "ar" ? "الهامش" : "Margin"}</th>
          <th>{lang === "ar" ? "الهدر" : "Waste"}</th>
          <th>{lang === "ar" ? "الاتجاه" : "Trend"}</th>
          <th>{lang === "ar" ? "الحالة" : "Status"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={onPick ? "clickable" : ""} onClick={() => onPick?.(row.id)}>
            <td><strong>{t(row.name, lang)}</strong><span className="subcell">{row.id}</span></td>
            <td>{t(row.area, lang)}</td>
            <td className="num">{formatMoney(row.revenue, lang)}</td>
            <td className="num">{row.orders}</td>
            <td className="num">{row.margin}%</td>
            <td className={`num ${row.waste > 4 ? "bad" : ""}`}>{row.waste}%</td>
            <td><Sparkline data={row.trend} /></td>
            <td><span className={`badge ${row.status}`}>{statusLabel(row.status, lang)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusLabel(status: Kiosk["status"], lang: Lang) {
  if (status === "good") return t(text.healthy, lang);
  if (status === "watch") return t(text.watch, lang);
  return t(text.issue, lang);
}

function HourlyChart() {
  const data = [2, 2, 1, 1, 2, 5, 14, 28, 42, 48, 44, 53, 58, 61, 49, 36, 42, 54, 57, 43, 28, 18, 9, 4];
  const max = Math.max(...data);
  return (
    <div className="hourly-chart">
      {data.map((value, index) => (
        <div className={`hour-bar ${index === 14 ? "active" : ""}`} key={`${value}-${index}`} style={{ height: `${(value / max) * 100}%` }} />
      ))}
    </div>
  );
}

function StockHealth({ lang, rows }: { lang: Lang; rows: ReturnType<typeof getInventoryControlRows> }) {
  const visible = rows.slice(0, 4).map((row) => ({
    label: t(row.name, lang),
    days: row.daysCover,
    target: row.status === "critical" ? 6 : row.status === "low" ? 5 : 4,
  }));
  return (
    <div className="progress-list">
      {visible.map(({ label, days, target }) => (
        <div className="progress-row" key={label}>
          <span>{label}</span>
          <Progress value={Math.min(days / 10, 1)} tone={days < target / 2 ? "critical" : days < target ? "watch" : "good"} label={`${days}d`} />
        </div>
      ))}
    </div>
  );
}

function CashFlow({ lang }: { lang: Lang }) {
  const days = lang === "ar" ? ["ن", "ث", "ر", "خ", "ج", "س", "ح"] : ["M", "T", "W", "T", "F", "S", "S"];
  const data = [
    [72, 48],
    [76, 51],
    [81, 50],
    [90, 56],
    [126, 70],
    [142, 58],
    [84, 34],
  ];
  const max = Math.max(...data.flat());
  return (
    <div className="cash-bars">
      {data.map(([cashIn, cashOut], index) => (
        <div key={index}>
          <div className="cash-pair">
            <span style={{ height: `${(cashIn / max) * 100}%` }} />
            <span style={{ height: `${(cashOut / max) * 100}%` }} />
          </div>
          <small>{days[index]}</small>
        </div>
      ))}
    </div>
  );
}

function Progress({ value, label, tone }: { value: number; label: string; tone?: "good" | "watch" | "critical" }) {
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <span className={tone} style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
      <strong>{label}</strong>
    </div>
  );
}

function SimpleRows({ rows }: { rows: string[][] }) {
  return (
    <div className="simple-rows">
      {rows.map((row, index) => (
        <div key={`${row[0]}-${index}`}>
          <span>{row[0]}</span>
          <strong>{row[1]}</strong>
          <em>{row[2]}</em>
        </div>
      ))}
    </div>
  );
}

function StepTitle({ number, label }: { number: string; label: string }) {
  return <h3 className="step-title"><span>{number}</span>{label}</h3>;
}

export default App;
