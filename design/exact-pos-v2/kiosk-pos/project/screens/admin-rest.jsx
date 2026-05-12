/* ============================================================
   Admin screens — INVENTORY, WASTE, SUPPLIERS, STAFF, REPORTS
   ============================================================ */

// =============== INVENTORY ===============
function InventoryScreen({ lang }) {
  const ar = lang === "ar";
  const inv = MOCK.inventory;
  const lowCount = inv.filter(i => i.status !== "ok").length;
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
                ? <>تم صياغة طلب شراء بقيمة <strong>AED 8,420</strong> يغطي ٤ بنود تحت الحد الأدنى. إيصال متوقع: <strong>غداً ٠٧:٠٠</strong>.</>
                : <>An <strong>AED 8,420</strong> draft PO covers 4 below-reorder items. Expected delivery: <strong>tomorrow 07:00</strong> from Al Rawabi & Levant Foods.</>
              }
            </div>
          </div>
          <button className="btn btn-accent">{ar ? "مراجعة وموافقة" : "Review & approve"}</button>
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 28, fontSize: 12 }}>{ar ? "كل الفئات" : "All categories"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "كل المواقع" : "All locations"} <Icon name="chevDown" size={11}/></button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="download" size={12}/>{ar ? "تصدير" : "Export"}</button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "طلب شراء" : "New PO"}</button>
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
                      ? <button className="btn btn-ghost" style={{ height: 24, fontSize: 11 }}>{ar ? "اطلب" : "Reorder"}</button>
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
  );
}

// =============== WASTE ===============
function WasteScreen({ lang }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "خسارة اليوم" : "Loss today"} value={fmtMoney(369)} delta="32%" deltaDir="down" sparkData={[58,42,38,52,46,32,30]}/>
        <KPI label={ar ? "خسارة ٧ أيام" : "Loss 7-day"} value={fmtMoney(2410)} delta="vs target 2,800" deltaDir="up"/>
        <KPI label={ar ? "% من الإيرادات" : "% of revenue"} value="0.42%" delta="0.06 pts" deltaDir="up"/>
        <KPI label={ar ? "حالات شاذة" : "Anomalies flagged"} value="3" footer={ar ? "بواسطة الذكاء" : "by AI"}/>
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
            {ar ? "كشكان (JBR، صحارى) ينتجان أكثر من الطلب بنسبة ٣٥٪ في فترات ما بعد الظهر. خفض الإنتاج المسائي بـ ٢٥٪ يوفر ~٢٤٠ ر.إ يومياً دون تأثير على المبيعات."
                : "Two kiosks (JBR, Sahara) over-bake by 35% in afternoon windows. Trimming evening bake by 25% saves ~AED 240/day with no measured sales impact."}
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
            {MOCK.waste.map(w => (
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

// =============== SUPPLIERS ===============
function SuppliersScreen({ lang }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "موردون نشطون" : "Active suppliers"} value="7"/>
        <KPI label={ar ? "إنفاق ٣٠ يوم" : "30-day spend"} value={fmtMoney(136410)} delta="4.2%" deltaDir="up"/>
        <KPI label={ar ? "وصول في الموعد" : "On-time delivery"} value="93%" delta="2 pts" deltaDir="down"/>
        <KPI label={ar ? "طلبات مفتوحة" : "Open POs"} value="6" footer={ar ? "٣ معتمدة" : "3 approved"}/>
      </div>

      <div className="card">
        <div className="between" style={{ padding: "14px 18px" }}>
          <div className="t-h2">{ar ? "الموردون" : "Suppliers"}</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}>{ar ? "الفئة" : "Category"} <Icon name="chevDown" size={11}/></button>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12 }}><Icon name="plus" size={12}/>{ar ? "مورد" : "Add"}</button>
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
            {MOCK.suppliers.map((s, i) => (
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
                  <button className="btn btn-ghost" style={{ height: 24, fontSize: 11 }}>{ar ? "طلب جديد" : "New PO"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============== STAFF ===============
function StaffScreen({ lang }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label={ar ? "نشطون" : "Active staff"} value="32"/>
        <KPI label={ar ? "كشف الرواتب" : "Monthly payroll"} value={fmtMoney(186400)} footer={ar ? "خلال ٦ أيام" : "runs in 6d"}/>
        <KPI label={ar ? "متوسط ساعات الأسبوع" : "Avg weekly hrs"} value="42" delta="2h" deltaDir="up"/>
        <KPI label={ar ? "تحت المراجعة" : "Under review"} value="1" footer={ar ? "تباين نقدي" : "cash variance"}/>
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

// =============== REPORTS ===============
function ReportsScreen({ lang }) {
  const ar = lang === "ar";
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 6 }}>
          <AITag>{ar ? "ملخص الشهر" : "Month summary"}</AITag>
          <span className="t-small subtle" style={{ marginInlineStart: 8 }}>{ar ? "أبريل ٢٠٢٦" : "April 2026"}</span>
        </div>
        <div className="ai-block" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 820 }}>
          {ar
            ? <>أبريل أنهى بإيرادات <strong>AED 3.84M</strong> (+١٢٪ شهر/شهر) وصافي ربح <strong>AED 982K</strong> (٢٥.٦٪ هامش). أكبر تحرك: تكاليف المورد ارتفعت ١.٤ نقطة. أكبر فرصة: ٤ كشاك تحت المتوسط في عصائر العصر.</>
            : <>April closed at <strong>AED 3.84M</strong> revenue (+12% MoM) and <strong>AED 982K</strong> net profit (25.6% margin). Largest mover: supplier costs rose 1.4 pts. Largest opportunity: 4 kiosks under-perform on afternoon juice.</>
          }
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <KPI label={ar ? "الإيرادات MTD" : "Revenue MTD"} value={fmtMoney(1284000)} delta="10.4%" deltaDir="up" sparkData={[42,46,52,58,62,68,72,78,84,90,98,104,110]} size="lg"/>
        <KPI label={ar ? "تكلفة البضاعة" : "COGS MTD"} value={fmtMoney(489000)} delta="38.1%" deltaDir="flat" footer={ar ? "هدف ٣٧٪" : "target 37%"} size="lg"/>
        <KPI label={ar ? "صافي الربح" : "Net profit MTD"} value={fmtMoney(326000)} delta="25.4%" deltaDir="up" footer={ar ? "هامش ٢٥.٤٪" : "25.4% margin"} size="lg"/>
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
            {[
              ["Revenue", 1284000, "+10.4%", "up"],
              ["  Coffee", 642000, null],
              ["  Cake", 318000, null],
              ["  Juice", 218000, null],
              ["  Bakery", 106000, null],
              ["COGS", -489000, "+38.1%", "flat"],
              ["Gross profit", 795000, "61.9%", "up"],
              ["Salaries", -186400, null],
              ["Rent", -142000, null],
              ["Utilities & ops", -68000, null],
              ["Marketing", -42000, null],
              ["Waste & loss", -10240, "0.79%", "down"],
              ["Net profit", 326000, "25.4%", "up"],
            ].map(([label, val, sub, dir], i) => {
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

window.InventoryScreen = InventoryScreen;
window.WasteScreen = WasteScreen;
window.SuppliersScreen = SuppliersScreen;
window.StaffScreen = StaffScreen;
window.ReportsScreen = ReportsScreen;
