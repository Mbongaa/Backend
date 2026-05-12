/* ============================================================
   Admin screen — OVERVIEW (command center)
   ============================================================ */

function OverviewScreen({ lang }) {
  const ar = lang === "ar";
  const k = MOCK.kpis;

  return (
    <div className="col" style={{ gap: 20 }}>

      {/* AI Briefing */}
      <div className="card card-pad" style={{ background: "var(--surface)" }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <AITag>{ar ? "ملخص الذكاء" : "AI brief"}</AITag>
          <span className="t-small subtle" style={{ marginInlineStart: 8 }}>
            {ar ? "اليوم · ٠٨:٤٢" : "Today · 08:42"}
          </span>
          <span style={{ flex: 1 }}></span>
          <button className="btn btn-quiet" style={{ height: 24, padding: "0 8px", fontSize: 12 }}>
            {ar ? "اقرأ المزيد" : "Read more"} <Icon name="arrowRight" size={11}/>
          </button>
        </div>
        <div className="ai-block" style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-1)", maxWidth: 760 }}>
          {ar ? (
            <>تتجه المبيعات لتجاوز الميزانية اليومية بنسبة <strong>٨٪</strong>، بقيادة المشروبات الباردة في ٤ مواقع ساحلية. مارينا أبوظبي تأخر بنسبة ١٢٪ — على الأرجح بسبب نقص الحليب اليوم. تم صياغة طلب شراء تلقائي.</>
          ) : (
            <>Sales are tracking <strong>8% above plan</strong>, led by iced drinks at 4 coastal kiosks. <strong>Marina AD is 12% behind</strong> — likely tied to today's milk shortage. An auto-PO has been drafted for your approval.</>
          )}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 14 }}>
          <button className="btn btn-accent">{ar ? "مراجعة طلب الشراء" : "Review PO"} <Icon name="arrowRight" size={11}/></button>
          <button className="btn btn-ghost">{ar ? "اعرض كشك مارينا" : "View Marina AD"}</button>
          <button className="btn btn-ghost">{ar ? "تجاهل" : "Dismiss"}</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "إيرادات اليوم" : "Revenue today"}
          value={fmtMoney(k.revenueToday)} delta={`${k.revenueDelta}% vs plan`} deltaDir="up"
          sparkData={k.revenueSpark} footer={ar ? "حتى الآن" : "to now"}
          size="lg"/>
        <KPI label={ar ? "هامش الربح" : "Gross profit"}
          value={fmtMoney(k.profitToday)} sub={`${k.profitMargin}%`} delta="2.1 pts" deltaDir="up"
          sparkData={k.profitSpark} footer={ar ? "هامش" : "margin"} size="lg"/>
        <KPI label={ar ? "الطلبات" : "Orders"}
          value={fmtNum(k.ordersToday)} delta={`${k.ordersDelta}%`} deltaDir="up"
          sparkData={k.ordersSpark} footer={ar ? "متوسط ٤٥ ر.إ" : "avg AED 45"} size="lg"/>
        <KPI label={ar ? "النقد المتاح" : "Cash on hand"}
          value={fmtMoney(k.cashOnHand)} delta="AED 2,180 vs y'day" deltaDir="up"
          sparkData={k.cashSpark} footer={ar ? "٣ خزائن" : "3 safes"} size="lg"/>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>

        {/* Hourly chart */}
        <div className="card card-pad">
          <div className="between" style={{ marginBottom: 8 }}>
            <div>
              <div className="t-h2">{ar ? "المبيعات بالساعة" : "Hourly sales"}</div>
              <div className="t-small subtle">{ar ? "الساعة الحالية مظللة" : "Current hour highlighted"}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12 }}>{ar ? "اليوم" : "Today"}</button>
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12, color: "var(--ink-3)" }}>{ar ? "الأمس" : "Yesterday"}</button>
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12, color: "var(--ink-3)" }}>{ar ? "متوسط ٧ أيام" : "7-day avg"}</button>
            </div>
          </div>
          <HourlyChart/>
        </div>

        {/* Alerts */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="between" style={{ padding: "16px 18px 10px" }}>
            <div className="t-h2">{ar ? "تنبيهات تحتاج مراجعة" : "Needs your attention"}</div>
            <span className="badge">3</span>
          </div>
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {MOCK.alerts.map((a, i) => (
              <div key={a.id} style={{
                padding: "14px 18px",
                borderBottom: i < MOCK.alerts.length - 1 ? "1px solid var(--line-soft)" : 0,
                display: "flex", gap: 12, alignItems: "flex-start"
              }}>
                <span className={`dot ${a.level}`} style={{ marginTop: 7 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{a.title}</div>
                  <div className="t-small subtle" style={{ marginTop: 3, lineHeight: 1.5 }}>{a.body}</div>
                  <div className="row" style={{ gap: 10, marginTop: 8 }}>
                    <button className="btn btn-ghost" style={{ height: 26, fontSize: 12 }}>{a.action}</button>
                    <span className="t-small faint">{a.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kiosks performance strip */}
      <div className="card">
        <div className="between" style={{ padding: "16px 18px 10px" }}>
          <div>
            <div className="t-h2">{ar ? "أداء الأكشاك اليوم" : "Kiosk performance — today"}</div>
            <div className="t-small subtle">{ar ? "مرتبة حسب الإيرادات" : "Sorted by revenue"}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="filter" size={11}/>{ar ? "تصفية" : "Filter"}</button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل الأكشاك" : "All kiosks"} <Icon name="chevRight" size={11}/></button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{ar ? "الكشك" : "Kiosk"}</th>
              <th>{ar ? "المدينة" : "City"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الإيرادات" : "Revenue"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الطلبات" : "Orders"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الهامش" : "Margin"}</th>
              <th style={{ textAlign: "end" }}>{ar ? "الهدر" : "Waste"}</th>
              <th style={{ width: 100 }}>{ar ? "الاتجاه" : "Trend"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MOCK.kiosks.slice(0, 6).map(k => (
              <tr key={k.id} className="row-click">
                <td>
                  <div style={{ fontWeight: 500 }}>{k.name}</div>
                  <div className="t-small faint">{k.id}</div>
                </td>
                <td className="muted">{k.city}</td>
                <td style={{ textAlign: "end" }} className="t-num">{fmtMoney(k.revenue)}</td>
                <td style={{ textAlign: "end" }} className="t-num muted">{k.orders}</td>
                <td style={{ textAlign: "end" }} className="t-num">{k.margin}%</td>
                <td style={{ textAlign: "end" }}>
                  <span className={"t-num " + (k.waste > 4 ? "delta-neg" : "muted")}>{k.waste}%</span>
                </td>
                <td><Spark data={k.trend} width={80} height={20}/></td>
                <td style={{ textAlign: "end" }}>
                  <span className={`badge ${k.status === "good" ? "badge-pos" : k.status === "warn" ? "badge-warn" : "badge-crit"}`}>
                    {k.status === "good" ? (ar ? "جيد" : "Healthy") : k.status === "warn" ? (ar ? "تحذير" : "Watch") : (ar ? "حرج" : "Issue")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom row: Stock health + Cash */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card card-pad">
          <SectionHead title={ar ? "صحة المخزون" : "Stock health"} sub={ar ? "متوسط أيام التغطية" : "Days-of-cover by category"}/>
          <StockBars/>
        </div>
        <div className="card card-pad">
          <SectionHead title={ar ? "التدفق النقدي" : "Cash flow this week"} sub={ar ? "الداخل مقابل الخارج" : "In vs out"}/>
          <CashFlow/>
        </div>
      </div>
    </div>
  );
}

// ---- Hourly chart ----
function HourlyChart() {
  const data = [4,3,2,2,3,8,18,32,48,52,46,58,62,55,40,32,38,46,52,58,48,32,18,8];
  const yMax = Math.max(...data);
  const W = 720, H = 200, pad = { l: 32, r: 12, t: 16, b: 28 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const bw = innerW / data.length;
  const currHour = 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200, display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={pad.l} x2={W-pad.r} y1={pad.t + innerH * p} y2={pad.t + innerH * p}
          stroke="var(--line-soft)" strokeWidth="1"/>
      ))}
      {[0, 0.5, 1].map((p, i) => (
        <text key={i} x={pad.l - 6} y={pad.t + innerH * (1 - p) + 3}
          fontSize="10" fill="var(--ink-3)" textAnchor="end" fontFamily="var(--font-mono)">
          {Math.round(yMax * p)}
        </text>
      ))}
      {data.map((v, i) => {
        const h = (v / yMax) * innerH;
        const x = pad.l + i * bw + 1;
        return <rect key={i} x={x} y={pad.t + innerH - h} width={bw - 2} height={h}
          fill={i === currHour ? "var(--ink)" : i < currHour ? "var(--ink-2)" : "var(--line-strong)"}
          opacity={i === currHour ? 1 : i < currHour ? 0.65 : 1} rx="1"/>;
      })}
      {[0, 6, 12, 18, 23].map(i => (
        <text key={i} x={pad.l + i * bw + bw / 2} y={H - 10}
          fontSize="10" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">
          {String(i).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}

// ---- Stock bars ----
function StockBars() {
  const cats = [
    { name: "Coffee", days: 9.4, target: 7 },
    { name: "Dairy", days: 1.2, target: 5 },
    { name: "Bakery", days: 2.8, target: 4 },
    { name: "Produce", days: 3.4, target: 5 },
    { name: "Syrups", days: 5.1, target: 7 },
    { name: "Packaging", days: 11.0, target: 7 },
  ];
  return (
    <div className="col" style={{ gap: 12, marginTop: 8 }}>
      {cats.map(c => {
        const pct = Math.min(c.days / 14, 1);
        const targetPct = c.target / 14;
        const low = c.days < c.target * 0.5;
        return (
          <div key={c.name} style={{ display: "grid", gridTemplateColumns: "100px 1fr 60px", alignItems: "center", gap: 12 }}>
            <span className="t-small">{c.name}</span>
            <div style={{ position: "relative", height: 18, background: "var(--surface-sunk)", borderRadius: 4 }}>
              <div style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${pct * 100}%`,
                background: low ? "var(--crit)" : "var(--ink-1)", borderRadius: 4, opacity: low ? 0.85 : 0.85 }}/>
              <div style={{ position: "absolute", insetInlineStart: `${targetPct * 100}%`, top: -2, bottom: -2, width: 1.5,
                background: "var(--ink-3)" }}/>
            </div>
            <span className={"t-num t-small " + (low ? "delta-neg" : "")} style={{ textAlign: "end" }}>{c.days}d</span>
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 4, gap: 14, fontSize: 11, color: "var(--ink-3)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ink-1)", borderRadius: 1, marginInlineEnd: 5, verticalAlign: "middle" }}></span>Days of cover</span>
        <span><span style={{ display: "inline-block", width: 1.5, height: 8, background: "var(--ink-3)", marginInlineEnd: 6, verticalAlign: "middle" }}></span>Target</span>
      </div>
    </div>
  );
}

// ---- Cash flow ----
function CashFlow() {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const data = [
    { in: 92, out: 68 }, { in: 88, out: 72 }, { in: 96, out: 58 },
    { in: 102, out: 64 }, { in: 138, out: 80 }, { in: 142, out: 58 }, { in: 84, out: 36 },
  ];
  const max = Math.max(...data.flatMap(d => [d.in, d.out]));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, height: 140, alignItems: "end" }}>
        {data.map((d, i) => (
          <div key={i} className="col" style={{ alignItems: "center", gap: 4 }}>
            <div className="row" style={{ alignItems: "end", gap: 2, height: 110 }}>
              <div style={{ width: 12, height: `${(d.in / max) * 100}%`, background: "var(--ink)", borderRadius: 1 }}/>
              <div style={{ width: 12, height: `${(d.out / max) * 100}%`, background: "var(--line-strong)", borderRadius: 1 }}/>
            </div>
            <div className="t-small faint" style={{ fontSize: 10.5 }}>{days[i]}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12, gap: 16, fontSize: 11, color: "var(--ink-3)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ink)", borderRadius: 1, marginInlineEnd: 5 }}></span>In · AED 742K</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--line-strong)", borderRadius: 1, marginInlineEnd: 5 }}></span>Out · AED 436K</span>
        <span style={{ marginInlineStart: "auto", color: "var(--pos)" }}>Net +AED 306K</span>
      </div>
    </div>
  );
}

window.OverviewScreen = OverviewScreen;
