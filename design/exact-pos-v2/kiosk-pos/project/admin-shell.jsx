/* ============================================================
   Admin shell — sidebar + content frame
   ============================================================ */

const ADMIN_NAV = [
  { section: "Today" },
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "insights", label: "AI Insights", icon: "sparkles", badge: 4 },
  { section: "Operations" },
  { id: "kiosks", label: "Kiosks", icon: "store" },
  { id: "inventory", label: "Inventory", icon: "box" },
  { id: "waste", label: "Waste & Loss", icon: "trash", badge: 3 },
  { id: "suppliers", label: "Suppliers", icon: "truck" },
  { id: "staff", label: "Staff", icon: "users" },
  { section: "Finance" },
  { id: "reports", label: "Reports", icon: "chart" },
];

const ADMIN_NAV_AR = {
  overview: "نظرة عامة",
  insights: "تحليلات الذكاء",
  kiosks: "الأكشاك",
  inventory: "المخزون",
  waste: "الهدر والخسارة",
  suppliers: "الموردون",
  staff: "الموظفون",
  reports: "التقارير",
  Today: "اليوم",
  Operations: "العمليات",
  Finance: "المالية",
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
        <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--ink)", color: "#FBFBF8",
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
          <span style={{ fontSize: 10.5, padding: "1px 5px", background: "var(--surface-sunk)", borderRadius: 3, marginInlineStart: 12 }}>⌘K</span>
        </div>
        <button className="btn btn-ghost"><Icon name="bell" size={13}/></button>
      </div>
    </div>
  );
}

function AdminPanel({ lang }) {
  const [active, setActive] = useState("overview");
  const screens = {
    overview: <OverviewScreen lang={lang}/>,
    insights: <InsightsScreen lang={lang}/>,
    kiosks: <KiosksScreen lang={lang} onPick={() => setActive("kioskDetail")}/>,
    kioskDetail: <KioskDetailScreen lang={lang} onBack={() => setActive("kiosks")}/>,
    inventory: <InventoryScreen lang={lang}/>,
    waste: <WasteScreen lang={lang}/>,
    suppliers: <SuppliersScreen lang={lang}/>,
    staff: <StaffScreen lang={lang}/>,
    reports: <ReportsScreen lang={lang}/>,
  };
  const titles = {
    overview: { en: "Overview", ar: "نظرة عامة", sub: { en: "Saturday, May 9 · all kiosks", ar: "السبت، 9 مايو · جميع الأكشاك" } },
    insights: { en: "AI Insights", ar: "تحليلات الذكاء", sub: { en: "What changed and what needs attention", ar: "ما الذي تغير وما يحتاج اهتمامك" } },
    kiosks: { en: "Kiosks", ar: "الأكشاك", sub: { en: "10 active locations · 3 cities", ar: "١٠ مواقع نشطة · ٣ مدن" } },
    kioskDetail: { en: "Marina Walk · K-01", ar: "مارينا ووك · K-01", sub: { en: "Dubai · 4 staff · open 7am–11pm", ar: "دبي · ٤ موظفين · ٧ ص – ١١ م" } },
    inventory: { en: "Inventory", ar: "المخزون", sub: { en: "Live stock across all locations", ar: "مخزون مباشر لجميع المواقع" } },
    waste: { en: "Waste & Loss", ar: "الهدر والخسارة", sub: { en: "Last 7 days · 3 anomalies flagged", ar: "آخر ٧ أيام · ٣ حالات شاذة" } },
    suppliers: { en: "Suppliers", ar: "الموردون", sub: { en: "7 active · 30-day spend AED 136K", ar: "٧ نشطون · إنفاق ٣٠ يوم" } },
    staff: { en: "Staff", ar: "الموظفون", sub: { en: "32 active · payroll runs in 6 days", ar: "٣٢ نشط · الرواتب خلال ٦ أيام" } },
    reports: { en: "Reports", ar: "التقارير", sub: { en: "Sales, P&L, cash flow", ar: "المبيعات والأرباح والتدفق النقدي" } },
  };
  const t = titles[active];

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--paper)" }}>
      <AdminSidebar active={active === "kioskDetail" ? "kiosks" : active} setActive={setActive} lang={lang}/>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <AdminTopBar title={lang === "ar" ? t.ar : t.en} sub={lang === "ar" ? t.sub.ar : t.sub.en} lang={lang}
          right={active === "overview" && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost"><Icon name="download" size={13}/>{lang === "ar" ? "تصدير" : "Export"}</button>
              <button className="btn btn-ghost">{lang === "ar" ? "اليوم" : "Today"} <Icon name="chevDown" size={11}/></button>
            </div>
          )}
        />
        <div className="scroll" style={{ flex: 1, overflow: "auto" }}>
          <div className="fade-up" key={active} style={{ padding: "24px 28px 80px" }}>
            {screens[active] || screens.overview}
          </div>
        </div>
      </main>
    </div>
  );
}

window.AdminPanel = AdminPanel;
