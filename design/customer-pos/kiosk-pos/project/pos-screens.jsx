/* ============================================================
   POS Sale screen — order taking
   ============================================================ */

function POSSale({ lang, cart, setCart, addItem, subTotal, vat, total, onCharge, onWaste, onLogout }) {
  const ar = lang === "ar";
  const [activeCat, setActiveCat] = useStatePOS(0);
  const [search, setSearch] = useStatePOS("");
  const cat = MOCK.posMenu[activeCat];
  const items = search
    ? MOCK.posMenu.flatMap(c => c.items).filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
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
            <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{ar ? "مارينا · وردية ٧:٠٠ ص" : "Marina · Shift 7:00 AM"}</div>
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
                    padding: 14, textAlign: "start",
                    cursor: "pointer", display: "flex", flexDirection: "column",
                    minHeight: 110, position: "relative", transition: "transform 100ms, border-color 100ms"
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = "scale(0.985)"}
                  onMouseUp={e => e.currentTarget.style.transform = "none"}
                  onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--surface-sunk)", display: "grid", placeItems: "center", color: "var(--ink-2)", marginBottom: 10 }}>
                    <Icon name={activeCat === 3 ? "cake" : activeCat === 2 ? "leaf" : "coffee"} size={16}/>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>{it.name}</div>
                  <div style={{ flex: 1 }}></div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="t-num" style={{ fontSize: 13 }}>AED {it.price}</span>
                    <span className="t-small subtle">{it.sizes.join(" · ")}</span>
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
                  <div className="t-num" style={{ fontSize: 13 }}>AED {line.price * line.qty}</div>
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
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ink)", color: "#FBFBF8", display: "grid", placeItems: "center", margin: "0 auto 24px" }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 640 }}>
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
                <span className="t-num">AED {l.price * l.qty}</span>
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
                <div className="t-small subtle">AED {it.price}</div>
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

window.POSSale = POSSale;
window.POSPayment = POSPayment;
window.POSWaste = POSWaste;
