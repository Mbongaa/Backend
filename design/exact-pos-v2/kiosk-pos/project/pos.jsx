/* ============================================================
   POS panel — login, sale, payment, waste entry
   Tablet, landscape, 1180×800
   ============================================================ */

const { useState: useStatePOS } = React;

function POSPanel({ lang }) {
  const [screen, setScreen] = useStatePOS("login");
  const [cart, setCart] = useStatePOS([]);
  const [tender, setTender] = useStatePOS(null);

  const goSale = () => { setScreen("sale"); setCart([]); };
  const addItem = (item, size) => {
    setCart(c => {
      const key = item.id + ":" + size;
      const existing = c.find(x => x.key === key);
      if (existing) return c.map(x => x === existing ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { key, id: item.id, name: item.name, size, price: item.price, qty: 1 }];
    });
  };
  const subTotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const vat = Math.round(subTotal * 0.05);
  const total = subTotal + vat;

  // Track last added item for the "just added" flash on customer display
  const [lastAdded, setLastAdded] = useStatePOS(null);
  const wrappedAdd = (item, size) => {
    addItem(item, size);
    setLastAdded({ name: item.name, price: item.price, t: Date.now() });
  };

  return (
    <div className="tablet-stage" style={{ gap: 24, padding: 24 }}>
      <div className="tablet">
        <div className="tablet-cam"></div>
        <div className="tablet-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
          {screen === "login" && <POSLogin lang={lang} onIn={goSale}/>}
          {screen === "sale" && <POSSale lang={lang}
            cart={cart} setCart={setCart} addItem={wrappedAdd}
            subTotal={subTotal} vat={vat} total={total}
            onCharge={() => setScreen("payment")}
            onWaste={() => setScreen("waste")}
            onLogout={() => setScreen("login")}
          />}
          {screen === "payment" && <POSPayment lang={lang}
            total={total} cart={cart}
            onTender={(t) => setTender(t)}
            tender={tender}
            onDone={() => { setScreen("sale"); setCart([]); setTender(null); }}
            onBack={() => setScreen("sale")}
          />}
          {screen === "waste" && <POSWaste lang={lang}
            onDone={() => setScreen("sale")} onBack={() => setScreen("sale")}/>}
        </div>
      </div>

      {/* Customer-facing display */}
      <div className="tablet tablet-portrait">
        <div className="tablet-cam tablet-cam-portrait"></div>
        <div className="tablet-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
          <CustomerDisplay lang={lang} screen={screen} cart={cart}
            subTotal={subTotal} vat={vat} total={total} tender={tender} lastAdded={lastAdded}/>
        </div>
        <div style={{ position: "absolute", bottom: -22, insetInlineStart: 0, insetInlineEnd: 0,
          textAlign: "center", fontSize: 10.5, color: "#6E6E68", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {lang === "ar" ? "شاشة العميل" : "Customer-facing display"}
        </div>
      </div>
    </div>
  );
}

// =============== LOGIN ===============
function POSLogin({ lang, onIn }) {
  const ar = lang === "ar";
  const staff = [
    { name: "Maya Ahmed", arName: "مايا أحمد", role: "Cashier", arRole: "كاشير" },
    { name: "Yusuf Saleh", arName: "يوسف صالح", role: "Barista", arRole: "باريستا" },
    { name: "Omar Khaled", arName: "عمر خالد", role: "Supervisor", arRole: "مشرف" },
    { name: "Sara Younis", arName: "سارة يونس", role: "Barista", arRole: "باريستا" },
  ];
  const [picked, setPicked] = useStatePOS(null);
  const [pin, setPin] = useStatePOS("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ height: 56, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--ink)", color: "#FBFBF8", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>M</div>
          <div className="col">
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{ar ? "مارينا ووك · K-01" : "Marina Walk · K-01"}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{ar ? "السبت ٩ مايو · ٧:٤٢ ص" : "Sat May 9 · 7:42 AM"}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
          <span className="row" style={{ gap: 5 }}><span className="dot pos"></span>{ar ? "متصل" : "Online"}</span>
          <span>·</span>
          <span>{ar ? "آخر مزامنة الآن" : "Last sync just now"}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: picked ? "1fr 380px" : "1fr", overflow: "hidden" }}>
        <div style={{ padding: "40px 56px", overflow: "auto" }}>
          <div className="t-display" style={{ fontWeight: 500, marginBottom: 6 }}>{ar ? "صباح الخير" : "Good morning"}</div>
          <div className="t-h2 muted" style={{ fontWeight: 400, marginBottom: 28 }}>{ar ? "اختر اسمك للبدء" : "Pick your name to start the shift"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 640 }}>
            {staff.map(s => (
              <button key={s.name} onClick={() => { setPicked(s); setPin(""); }}
                className="card"
                style={{
                  padding: "20px 22px", textAlign: "start", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 14,
                  borderColor: picked?.name === s.name ? "var(--ink)" : "var(--line)",
                  background: picked?.name === s.name ? "var(--surface)" : "var(--surface)",
                  transition: "border-color 100ms"
                }}>
                <Avatar name={s.name} size={48}/>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{ar ? s.arName : s.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{ar ? s.arRole : s.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {picked && (
          <div className="fade-up" style={{ borderInlineStart: "1px solid var(--line)", padding: "40px 32px", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ gap: 12, marginBottom: 24 }}>
              <Avatar name={picked.name} size={36}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{ar ? picked.arName : picked.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{ar ? picked.arRole : picked.role}</div>
              </div>
            </div>
            <div className="t-micro" style={{ marginBottom: 12 }}>{ar ? "أدخل رمز الدخول" : "Enter PIN"}</div>
            <div className="row" style={{ gap: 10, marginBottom: 22 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 56, height: 56, borderRadius: 8,
                  border: "1px solid " + (pin.length === i ? "var(--ink)" : "var(--line)"),
                  background: "var(--surface)",
                  display: "grid", placeItems: "center",
                  fontSize: 22, fontFamily: "var(--font-mono)"
                }}>
                  {pin[i] ? "•" : ""}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => setPin(p => (p + n).slice(0, 4))}
                  style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{n}</button>
              ))}
              <button onClick={() => setPicked(null)} style={{ height: 56, fontSize: 12, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>{ar ? "عودة" : "Back"}</button>
              <button onClick={() => setPin(p => (p + 0).slice(0, 4))} style={{ height: 56, fontSize: 20, fontFamily: "var(--font-mono)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>0</button>
              <button onClick={() => setPin(p => p.slice(0, -1))} style={{ height: 56, fontSize: 18, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>⌫</button>
            </div>
            <button onClick={onIn} className="btn btn-primary btn-xl" style={{ marginTop: 20, justifyContent: "center" }}>
              {ar ? "ابدأ الوردية" : "Start shift"} <Icon name="arrowRight" size={14}/>
            </button>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
              {ar ? "العد النقدي: AED 500.00 افتراضي" : "Cash float: AED 500.00 default"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.POSPanel = POSPanel;
