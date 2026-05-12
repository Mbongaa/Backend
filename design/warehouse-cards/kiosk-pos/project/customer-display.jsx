/* ============================================================
   Customer-facing display — vertical tablet next to cashier
   Shows order live, total, and friendly status messages.
   ============================================================ */

function CustomerDisplay({ lang, screen, cart, subTotal, vat, total, tender, lastAdded }) {
  const ar = lang === "ar";
  const [showFlash, setShowFlash] = React.useState(false);

  React.useEffect(() => {
    if (!lastAdded) return;
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 1400);
    return () => clearTimeout(t);
  }, [lastAdded?.t]);

  // ---- LOGIN: branded standby ----
  if (screen === "login") {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink)", color: "#FBFBF8" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", textAlign: "center" }}>
          <div style={{
            width: 180, height: 180,
            filter: "invert(1)",
            marginBottom: 8,
            mixBlendMode: "screen"
          }}>
            <dotlottie-player src="uploads/Juice.lottie" autoplay loop background="transparent"
              style={{ width: "100%", height: "100%", background: "transparent" }}></dotlottie-player>
          </div>
          <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>{ar ? "مقهى" : "Maqha"}</div>
          <div style={{ fontSize: 12, color: "#9A998F", marginTop: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {ar ? "قهوة · عصائر · مخبوزات" : "Coffee · Juice · Bakery"}
          </div>
          <div style={{ height: 1, width: 40, background: "#3A3A40", margin: "24px auto" }}></div>
          <div style={{ fontSize: 13.5, color: "#C9C8C0", lineHeight: 1.55 }}>
            {ar ? "تفضل عند الكاشير" : "Step up when ready"}
          </div>
        </div>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #2A2A2E", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6E6E68" }}>
          <span>{ar ? "مارينا ووك" : "Marina Walk"}</span>
          <span className="t-num">07:42</span>
        </div>
      </div>
    );
  }

  // ---- PAYMENT: pay prompt ----
  if (screen === "payment" && tender == null) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
          <div className="t-micro">{ar ? "إجمالي مستحق" : "Amount due"}</div>
          <div className="t-num-display" style={{ fontSize: 44, marginTop: 4 }}>{fmtMoney(total)}</div>
        </div>
        <div style={{ flex: 1, padding: "24px 22px", overflow: "auto" }}>
          <div className="t-micro" style={{ marginBottom: 10 }}>{ar ? "طلبك" : "Your order"}</div>
          <div className="col" style={{ gap: 8 }}>
            {cart.map(l => (
              <div key={l.key} className="between" style={{ fontSize: 13 }}>
                <span className="muted">{l.qty}× {l.name}</span>
                <span className="t-num">AED {l.price * l.qty}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 22px", background: "var(--ink)", color: "#FBFBF8", textAlign: "center" }}>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", fontSize: 14, fontWeight: 500 }}>
            <Icon name="card" size={18}/>
            <span>{ar ? "اقترب أو أدخل بطاقتك" : "Tap or insert card"}</span>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "payment" && tender != null) {
    // processing/done: show big total + thank you when paid
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", alignItems: "center", justifyContent: "center", padding: "0 22px", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--ink)", color: "#FBFBF8", display: "grid", placeItems: "center", marginBottom: 22 }}>
          <Icon name="check" size={32} stroke={2}/>
        </div>
        <div className="t-h2" style={{ marginBottom: 6 }}>{ar ? "شكراً لزيارتك" : "Thank you"}</div>
        <div className="t-num-display" style={{ marginTop: 4 }}>{fmtMoney(total)}</div>
        <div className="muted t-small" style={{ marginTop: 12 }}>{ar ? "نتمنى لك يوماً جميلاً" : "Have a great day"}</div>
      </div>
    );
  }

  // ---- WASTE: cashier-only screen, customer sees standby ----
  if (screen === "waste") {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--surface)", padding: "0 28px", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", marginBottom: 10 }}>{ar ? "لحظة من فضلك" : "One moment"}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>{ar ? "الكاشير يعالج طلبك" : "Cashier is with you shortly"}</div>
        </div>
      </div>
    );
  }

  // ---- SALE: live order mirror ----
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--ink)", color: "#FBFBF8", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>M</div>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{ar ? "مقهى" : "Maqha"}</span>
        </div>
        <span className="t-small subtle">#A-{1247 + cart.length}</span>
      </div>

      {/* Empty / waiting */}
      {cart.length === 0 && (
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "0 28px", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>
              {ar ? "أهلاً بك" : "Welcome"}
            </div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              {ar ? "سيظهر طلبك هنا أثناء التحضير" : "Your order will appear here as it's added"}
            </div>
          </div>
        </div>
      )}

      {/* Order list */}
      {cart.length > 0 && (
        <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "10px 20px" }}>
          <div className="t-micro" style={{ marginBottom: 10 }}>{ar ? "طلبك" : "Your order"}</div>
          <div className="col" style={{ gap: 0 }}>
            {cart.map(l => {
              const isJust = lastAdded && lastAdded.name === l.name && showFlash;
              return (
                <div key={l.key} style={{
                  padding: "12px 0", borderBottom: "1px solid var(--line-soft)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: isJust ? "var(--accent-soft)" : "transparent",
                  marginInline: isJust ? -10 : 0,
                  paddingInline: isJust ? 10 : 0,
                  borderRadius: isJust ? 6 : 0,
                  transition: "background 400ms ease, margin 200ms, padding 200ms"
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{l.name}</div>
                    <div className="t-small subtle">{l.size} · AED {l.price}</div>
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <span className="t-num muted" style={{ fontSize: 13 }}>×{l.qty}</span>
                    <span className="t-num" style={{ fontSize: 14, minWidth: 60, textAlign: "end" }}>AED {l.price * l.qty}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Totals */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="between t-small muted"><span>{ar ? "المجموع" : "Subtotal"}</span><span className="t-num">{fmtMoney(subTotal)}</span></div>
        <div className="between t-small muted" style={{ marginTop: 4 }}><span>{ar ? "ضريبة ٥٪" : "VAT 5%"}</span><span className="t-num">{fmtMoney(vat)}</span></div>
        <div className="between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{ar ? "الإجمالي" : "Total"}</span>
          <span className="t-num" style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{fmtMoney(total)}</span>
        </div>
      </div>

      <div style={{ padding: "10px 20px", background: "var(--ink)", color: "#FBFBF8", fontSize: 11.5, textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {cart.length === 0
          ? (ar ? "بانتظار طلبك" : "Awaiting order")
          : (ar ? "أكد مع الكاشير عند الانتهاء" : "Confirm with cashier when ready")}
      </div>
    </div>
  );
}

window.CustomerDisplay = CustomerDisplay;
