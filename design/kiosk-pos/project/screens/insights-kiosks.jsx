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
function KiosksScreen({ lang, onPick }) {
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
                <td style={{ textAlign: "end" }} className="t-num muted">AED {(k.revenue/k.orders).toFixed(0)}</td>
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
