/* ============================================================
   Admin screens — INSIGHTS, KIOSKS, KIOSK DETAIL
   ============================================================ */

// =============== INSIGHTS ===============
function InsightsScreen({ lang }) {
  const ar = lang === "ar";
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? MOCK.insights : MOCK.insights.filter(i => i.kind === filter);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <AITag>{ar ? "موجز اليوم" : "Today's brief"}</AITag>
          <span className="t-small subtle" style={{ marginInlineStart: 8 }}>{ar ? "تم التحديث منذ ٤ دقائق" : "Updated 4 min ago"}</span>
        </div>
        <div className="ai-block" style={{ fontSize: 15.5, lineHeight: 1.55, maxWidth: 860 }}>
          {ar
            ? <>أربعة أشياء تستحق وقتك اليوم. الأهم: <strong>هامش كعكة الفستق انخفض ٦ نقاط</strong> منذ ارتفاع تكلفة المورد في ٢٢ أبريل. إعادة صياغة الوصفة قد تستعيد ٤٫٥ نقطة. تابع تأثير ذلك على هامش الأكشاك الفاخرة.</>
            : <>Four things deserve your time today. Most important: <strong>pistachio cake margin dropped 6 points</strong> since Levant Foods raised prices on Apr 22. Reformulating the recipe (12g → 9g, peer median) could recover 4.5 points and not measurably change taste tests. Watch flow-through to premium kiosk margin.</>
          }
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {[
          { id: "all", label: ar ? "الكل" : "All" },
          { id: "trend", label: ar ? "اتجاهات" : "Trends" },
          { id: "anomaly", label: ar ? "شذوذ" : "Anomalies" },
          { id: "forecast", label: ar ? "توقعات" : "Forecasts" },
          { id: "action", label: ar ? "إجراءات" : "Actions" },
        ].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={"btn " + (filter === t.id ? "btn-primary" : "btn-ghost")}
            style={{ height: 28, fontSize: 12 }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {filtered.map(ins => (
          <div key={ins.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>
              {ins.tags.map(t => <span key={t} className="badge">{t}</span>)}
              <span style={{ flex: 1 }}></span>
              <span className="t-small subtle">{ar ? "ثقة" : "confidence"} · <span className="t-num">{ins.confidence}%</span></span>
            </div>
            <div className="ai-block">
              <div style={{ fontWeight: 500, fontSize: 15, lineHeight: 1.35, marginBottom: 6 }}>{ins.title}</div>
              <div className="t-small muted" style={{ lineHeight: 1.6 }}>{ins.body}</div>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ height: 26, fontSize: 12 }}>{ar ? "تفاصيل" : "Details"}</button>
              <button className="btn btn-ghost" style={{ height: 26, fontSize: 12 }}>{ar ? "تجاهل" : "Dismiss"}</button>
              <span style={{ flex: 1 }}></span>
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12 }}>{ar ? "إجراء" : "Take action"} <Icon name="arrowRight" size={11}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============== KIOSKS ===============

// Per-kiosk inventory + waste model — derived deterministically from id+status
// so cards show varied but stable values until the realtime tick nudges them.
const WASTE_TARGET = 4.0; // % target line drawn on every waste meter

function deriveKioskOps(k) {
  // inventory fill % — good ~ 65–88, warn ~ 38–62, crit ~ 18–34
  const seed = (k.id.charCodeAt(2) * 13 + k.id.charCodeAt(3) * 7) % 24;
  let inv;
  if (k.status === "good") inv = 66 + seed;
  else if (k.status === "warn") inv = 38 + (seed % 24);
  else inv = 18 + (seed % 16);
  // critical / low item counts
  const slots = 24; // total tracked SKUs at this kiosk
  const lowItems = k.status === "crit" ? 5 + (seed % 3) : k.status === "warn" ? 2 + (seed % 2) : (seed % 2);
  const critItems = k.status === "crit" ? 2 + (seed % 2) : k.status === "warn" ? (seed % 2) : 0;
  // estimated runout window for the most-depleted item
  const hours = k.status === "crit" ? 2 + (seed % 4) : k.status === "warn" ? 6 + (seed % 6) : 18 + (seed % 24);
  // currently brewing / queue
  const queue = (seed % 5);
  // last sale seconds-ago
  const lastSale = (seed % 50) + 4;
  return { inv: Math.min(96, inv), lowItems, critItems, slots, hours, queue, lastSale };
}

// Inventory progress bar — segmented (12 slots) with fill colored by status
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

// Waste progress bar — continuous, with target marker at 4%, scale 0–8%
function WasteMeter({ pct, status }) {
  const SCALE = 8;
  const fillW = Math.min(100, (pct / SCALE) * 100);
  const targetX = (WASTE_TARGET / SCALE) * 100;
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
      {/* target marker — outside the clipped fill so the tick + flag show above the bar */}
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
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%", background: color,
        }}/>
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%", background: color,
          opacity: 0.35, animation: "kioskPulse 1.6s ease-out infinite",
        }}/>
      </span>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-3)" }}>LIVE</span>
    </span>
  );
}

function KioskCard({ k, ops, onPick, ar }) {
  const statusLabel = k.status === "good" ? (ar ? "جيد" : "Healthy")
                    : k.status === "warn" ? (ar ? "انتباه" : "Watch")
                    : (ar ? "حرج" : "Critical");
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
      {/* Header */}
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
          {k.city} · {k.staff} {ar ? "موظفين" : "staff"} · {ops.queue > 0 ? `${ops.queue} ${ar ? "في الطابور" : "in queue"}` : (ar ? `بيع منذ ${ops.lastSale} ث` : `sale ${ops.lastSale}s ago`)}
        </div>
      </div>

      {/* Numbers strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ padding: "10px 12px 10px 16px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>{ar ? "إيرادات" : "Revenue"}</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {fmtMoney(k.revenue)}
          </div>
        </div>
        <div style={{ padding: "10px 12px", borderInlineEnd: "1px solid var(--line-soft)" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>{ar ? "طلبات" : "Orders"}</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{k.orders}</div>
        </div>
        <div style={{ padding: "10px 16px 10px 12px" }}>
          <div className="t-micro" style={{ marginBottom: 2 }}>{ar ? "هامش" : "Margin"}</div>
          <div className="t-num" style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{k.margin}%</div>
        </div>
      </div>

      {/* Inventory meter */}
      <div style={{ padding: "14px 16px 8px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">{ar ? "المخزون" : "Inventory"}</span>
          <span className="t-num" style={{ fontSize: 12.5, fontWeight: 500 }}>{ops.inv}%</span>
        </div>
        <InventoryMeter pct={ops.inv} status={k.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>
          {ops.critItems > 0
            ? <><span style={{ color: "var(--crit)" }}>{ops.critItems} {ar ? "حرج" : "critical"}</span> · {ops.lowItems} {ar ? "منخفض" : "low"} · {ops.slots - ops.critItems - ops.lowItems} {ar ? "جيد" : "stocked"}</>
            : ops.lowItems > 0
              ? <><span style={{ color: "var(--warn)" }}>{ops.lowItems} {ar ? "منخفض" : "low"}</span> · {ops.slots - ops.lowItems} {ar ? "جيد" : "stocked"} · {ar ? "نفاد خلال" : "runout"} ~{ops.hours}h</>
              : <>{ops.slots} {ar ? "صنف بحالة جيدة" : "items in good standing"} · {ar ? "نفاد خلال" : "runout"} {ops.hours}h+</>
          }
        </div>
      </div>

      {/* Waste meter */}
      <div style={{ padding: "10px 16px 14px" }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="t-micro">{ar ? "الهدر اليوم" : "Waste today"}</span>
          <div className="row" style={{ gap: 8 }}>
            <span className="t-small subtle" style={{ fontSize: 11 }}>{ar ? "هدف" : "target"} {WASTE_TARGET}%</span>
            <span className={"t-num " + (k.waste > WASTE_TARGET ? "delta-neg" : "")} style={{ fontSize: 12.5, fontWeight: 500 }}>{k.waste.toFixed(1)}%</span>
          </div>
        </div>
        <WasteMeter pct={k.waste} status={k.status}/>
        <div className="t-small subtle" style={{ marginTop: 6, fontSize: 11.5 }}>
          AED {Math.round(k.revenue * k.waste / 100).toLocaleString()} {ar ? "خسارة محتملة" : "estimated loss"}
          {k.waste > WASTE_TARGET && <> · <span style={{ color: "var(--warn)" }}>{((k.waste - WASTE_TARGET)).toFixed(1)} {ar ? "نقطة فوق الهدف" : "pts over"}</span></>}
        </div>
      </div>
    </div>
  );
}

function KiosksScreen({ lang, onPick }) {
  const ar = lang === "ar";
  const [view, setView] = useState("cards");
  const [city, setCity] = useState("all");
  const [sortBy, setSortBy] = useState("status");

  // Realtime tick — nudges revenue / orders / inventory / waste every 3s
  // to convey live updates. Nudges are tiny so layout stays calm.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3200);
    return () => clearInterval(id);
  }, []);

  const live = useMemo(() => {
    return MOCK.kiosks.map((k, i) => {
      const ops = deriveKioskOps(k);
      // deterministic noise per tick — not random, so values feel coherent
      const phase = (tick + i) % 6;
      const revBump = phase * 4 + (i * 3) % 11;
      const ordBump = phase % 3;
      const invJitter = ((tick * (i + 1)) % 5) - 2; // -2..+2
      const wasteJitter = (((tick + i * 2) % 7) - 3) * 0.04; // ±0.12
      return {
        ...k,
        revenue: k.revenue + revBump * 6,
        orders: k.orders + ordBump,
        waste: Math.max(0.4, k.waste + wasteJitter),
        ops: { ...ops, inv: Math.max(8, Math.min(96, ops.inv + invJitter)) }
      };
    });
  }, [tick]);

  const cities = ["all", ...new Set(MOCK.kiosks.map(k => k.city))];
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
      {/* Inline keyframes for the live pulse — scoped to this screen */}
      <style>{`
        @keyframes kioskPulse {
          0% { transform: scale(0.8); opacity: 0.55; }
          70% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "أكشاك نشطة" : "Active"} value="10" footer={`${counts.good} ok · ${counts.warn} watch · ${counts.crit} crit`}/>
        <KPI label={ar ? "إيرادات اليوم" : "Today's revenue"} value={fmtMoney(live.reduce((s, k) => s + k.revenue, 0))} delta="8.4%" deltaDir="up"/>
        <KPI label={ar ? "متوسط المخزون" : "Avg inventory"} value={`${counts.avgInv}%`} footer={ar ? "عبر كل الأكشاك" : "across fleet"}/>
        <KPI label={ar ? "متوسط الهدر" : "Avg waste"} value={`${counts.avgWaste}%`} delta={`target ${WASTE_TARGET}%`} deltaDir={parseFloat(counts.avgWaste) <= WASTE_TARGET ? "up" : "down"}/>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 2px" }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {cities.map(c => (
            <button key={c} onClick={() => setCity(c)}
              className={"btn " + (city === c ? "btn-primary" : "btn-ghost")}
              style={{ height: 28, fontSize: 12 }}>
              {c === "all" ? (ar ? "كل المدن" : "All cities") : c}
              {c !== "all" && <span className="subtle" style={{ marginInlineStart: 4, fontSize: 11 }}>{MOCK.kiosks.filter(k => k.city === c).length}</span>}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="t-small subtle" style={{ fontSize: 11.5 }}>{ar ? "ترتيب" : "Sort"}</span>
          <div className="row" style={{ gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", height: 28 }}>
            {[
              { id: "status", l: ar ? "الحالة" : "Status" },
              { id: "revenue", l: ar ? "الإيرادات" : "Revenue" },
              { id: "inventory", l: ar ? "المخزون" : "Inventory" },
              { id: "waste", l: ar ? "الهدر" : "Waste" },
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
              title={ar ? "بطاقات" : "Cards"}
              style={{
                width: 32, display: "grid", placeItems: "center",
                background: view === "cards" ? "var(--surface-sunk)" : "transparent",
                color: view === "cards" ? "var(--ink)" : "var(--ink-3)",
                borderInlineEnd: "1px solid var(--line-soft)",
              }}><Icon name="grid" size={13}/></button>
            <button onClick={() => setView("table")}
              title={ar ? "جدول" : "Table"}
              style={{
                width: 32, display: "grid", placeItems: "center",
                background: view === "table" ? "var(--surface-sunk)" : "transparent",
                color: view === "table" ? "var(--ink)" : "var(--ink-3)",
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 6H21M3 12H21M3 18H21"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Cards or table */}
      {view === "cards" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {sorted.map(k => (
            <KioskCard key={k.id} k={k} ops={k.ops} onPick={onPick} ar={ar}/>
          ))}
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>{ar ? "الكشك" : "Kiosk"}</th>
                <th>{ar ? "المدينة" : "City"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "إيرادات اليوم" : "Revenue today"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "الطلبات" : "Orders"}</th>
                <th style={{ width: 160 }}>{ar ? "المخزون" : "Inventory"}</th>
                <th style={{ width: 160 }}>{ar ? "الهدر" : "Waste"}</th>
                <th style={{ textAlign: "end" }}>{ar ? "الهامش" : "Margin"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(k => (
                <tr key={k.id} className="row-click" onClick={onPick}>
                  <td><span className={`dot ${k.status === "good" ? "pos" : k.status === "warn" ? "warn" : "crit"}`}></span></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{k.name}</div>
                    <div className="t-small faint">{k.id}</div>
                  </td>
                  <td className="muted">{k.city}</td>
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
    </div>
  );
}

// =============== KIOSK DETAIL ===============
function KioskDetailScreen({ lang, onBack }) {
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

window.InsightsScreen = InsightsScreen;
window.KiosksScreen = KiosksScreen;
window.KioskDetailScreen = KioskDetailScreen;
