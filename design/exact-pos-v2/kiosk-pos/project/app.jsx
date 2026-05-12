/* ============================================================
   App shell — master switcher (Admin / POS), language toggle
   ============================================================ */

const { useState: useStateApp } = React;

function MasterTop({ panel, setPanel, lang, setLang }) {
  return (
    <div className="master-top">
      <div className="brand">
        <div className="brand-mark">M</div>
        <span style={{ letterSpacing: "-0.01em" }}>Maqha</span>
        <span style={{ color: "#6E6E68", fontWeight: 400 }}>· operations</span>
      </div>
      <div className="seg">
        <button className={panel === "admin" ? "on" : ""} onClick={() => setPanel("admin")}>Admin</button>
        <button className={panel === "pos" ? "on" : ""} onClick={() => setPanel("pos")}>POS</button>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ fontSize: 11.5, color: "#8B8A82" }}>Demo · Sat May 9</span>
        <div className="lang">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "ar" ? "on" : ""} onClick={() => setLang("ar")}>عربي</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [panel, setPanel] = useStateApp("admin");
  const [lang, setLang] = useStateApp("en");
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="app-frame" dir={dir} lang={lang}>
      <MasterTop panel={panel} setPanel={setPanel} lang={lang} setLang={setLang}/>
      {panel === "admin"
        ? <AdminPanel lang={lang}/>
        : <POSPanel lang={lang}/>}
    </div>
  );
}

window.App = App;
