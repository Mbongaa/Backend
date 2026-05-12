/* ============================================================
   Shared UI primitives — exported to window
   ============================================================ */

const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

// ---------- Icons (single stroke, 14px) ----------
const Icon = ({ name, size = 14, stroke = 1.5, className = "", style }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></>,
    store: <><path d="M3 9V20H21V9"/><path d="M3 9L5 4H19L21 9"/><path d="M9 20V14H15V20"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20V13"/><path d="M22 20H2"/></>,
    box: <><path d="M21 7.5L12 3L3 7.5V16.5L12 21L21 16.5V7.5Z"/><path d="M3 7.5L12 12L21 7.5"/><path d="M12 12V21"/></>,
    trash: <><path d="M3 6H21"/><path d="M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6"/><path d="M5 6L6 20C6 21 7 22 8 22H16C17 22 18 21 18 20L19 6"/></>,
    truck: <><rect x="1" y="6" width="14" height="11"/><path d="M15 9H19L22 12V17H15"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    users: <><path d="M16 21V19C16 17 15 16 13 16H6C4 16 3 17 3 19V21"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 21V19C21 17 20 16 18 16"/><path d="M16 4C17 4 18 5 18 7C18 9 17 10 16 10"/></>,
    sparkles: <><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/><path d="M19 17L19.5 19L21 19.5L19.5 20L19 22L18.5 20L17 19.5L18.5 19L19 17Z"/></>,
    pin: <><path d="M12 22V14"/><path d="M8 14H16L15 8H9L8 14Z"/><path d="M9 8L10 3H14L15 8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21L16 16"/></>,
    bell: <><path d="M18 8C18 6 17 4 15 3C13 2 11 2 9 3C7 4 6 6 6 8C6 14 3 14 3 17H21C21 14 18 14 18 8Z"/><path d="M14 21C13 22 11 22 10 21"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15A1.7 1.7 0 0020 17L20.1 17.1A2 2 0 1117.3 20L17.2 19.9A1.7 1.7 0 0015.5 19.6 1.7 1.7 0 0014.5 21V21.1A2 2 0 0110.5 21.1V21A1.7 1.7 0 009.5 19.6 1.7 1.7 0 007.7 19.9L7.7 20A2 2 0 114.9 17.1L5 17A1.7 1.7 0 005.4 15.5 1.7 1.7 0 003.9 14.5H3.8A2 2 0 113.8 10.5H3.9A1.7 1.7 0 005.4 9.5 1.7 1.7 0 005 7.7L4.9 7.7A2 2 0 117.7 4.9L7.7 5A1.7 1.7 0 009.5 5.4 1.7 1.7 0 0010.5 3.9V3.8A2 2 0 1114.5 3.8V3.9A1.7 1.7 0 0015.5 5.4 1.7 1.7 0 0017.2 5L17.3 4.9A2 2 0 1120.1 7.7L20 7.7A1.7 1.7 0 0019.6 9.5 1.7 1.7 0 0021 10.5H21.1A2 2 0 0121.1 14.5H21A1.7 1.7 0 0019.4 15Z"/></>,
    chevDown: <path d="M6 9L12 15L18 9"/>,
    chevRight: <path d="M9 6L15 12L9 18"/>,
    chevLeft: <path d="M15 6L9 12L15 18"/>,
    chevUp: <path d="M6 15L12 9L18 15"/>,
    arrowUp: <path d="M12 19V5M5 12L12 5L19 12"/>,
    arrowDown: <path d="M12 5V19M5 12L12 19L19 12"/>,
    arrowRight: <path d="M5 12H19M12 5L19 12L12 19"/>,
    plus: <path d="M12 5V19M5 12H19"/>,
    minus: <path d="M5 12H19"/>,
    x: <path d="M6 6L18 18M6 18L18 6"/>,
    check: <path d="M5 12L10 17L20 7"/>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    filter: <path d="M3 5H21L14 13V20L10 22V13L3 5Z"/>,
    download: <><path d="M12 4V16M5 11L12 18L19 11"/><path d="M4 21H20"/></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M5 9V15M19 9V15"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10H22"/></>,
    coffee: <><path d="M4 8H18V14C18 17 16 19 13 19H9C6 19 4 17 4 14V8Z"/><path d="M18 10H20C21 10 22 11 22 12V13C22 14 21 15 20 15H18"/><path d="M8 4V6M12 4V6M16 4V6"/></>,
    leaf: <><path d="M12 22C7 17 7 11 12 6C16 11 17 17 12 22Z"/><path d="M12 22V8"/></>,
    cake: <><path d="M3 12V20H21V12"/><path d="M3 12H21"/><path d="M5 12V8H19V12"/><path d="M12 8V4M9 4L12 2L15 4"/></>,
    receipt: <><path d="M5 2V22L8 20L11 22L14 20L17 22L19 20V2L17 4L14 2L11 4L8 2L5 2Z"/><path d="M9 8H15M9 12H15M9 16H13"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21V19C4 17 6 15 8 15H16C18 15 20 17 20 19V21"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7V12L15 14"/></>,
    zap: <path d="M13 2L4 14H12L11 22L20 10H12L13 2Z"/>,
    eye: <><path d="M2 12C2 12 6 5 12 5C18 5 22 12 22 12C22 12 18 19 12 19C6 19 2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    flag: <><path d="M5 22V4C5 3 6 2 7 2H17L15 6L17 10H7"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {paths[name]}
    </svg>
  );
};

// ---------- Sparkline ----------
const Spark = ({ data, width = 80, height = 26, color }) => {
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / r) * (height - 2) - 1
  ]);
  const d = "M" + pts.map(p => p.join(",")).join(" L");
  const a = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="spark">
      <path className="area" d={a} fill={color || "currentColor"} opacity="0.06"/>
      <path className="line" d={d} stroke={color || "currentColor"} fill="none" strokeWidth="1.25"/>
    </svg>
  );
};

// ---------- MiniBars ----------
const MiniBars = ({ data, width = 80, height = 26, accentIndex = -1 }) => {
  const max = Math.max(...data);
  const bw = width / data.length - 1;
  return (
    <svg width={width} height={height}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 2);
        return <rect key={i} x={i * (bw + 1)} y={height - h} width={bw} height={h}
          fill={i === accentIndex ? "var(--accent)" : "var(--ink-2)"} opacity={i === accentIndex ? 1 : 0.5} rx="0.5"/>;
      })}
    </svg>
  );
};

// ---------- KPI ----------
const KPI = ({ label, value, sub, delta, deltaDir, spark, sparkData, footer, size }) => {
  const dirClass = deltaDir === "up" ? "delta-pos" : deltaDir === "down" ? "delta-neg" : "delta-flat";
  const arrow = deltaDir === "up" ? "↑" : deltaDir === "down" ? "↓" : "·";
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 120 }}>
      <div className="between">
        <div className="t-micro">{label}</div>
        {sparkData && <Spark data={sparkData} width={64} height={20}/>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className={size === "lg" ? "t-num-display" : "t-num-big"}>{value}</div>
        {sub && <span className="muted t-small">{sub}</span>}
      </div>
      {(delta || footer) && (
        <div className="row" style={{ gap: 10, fontSize: 12 }}>
          {delta && <span className={dirClass}>{arrow} {delta}</span>}
          {footer && <span className="subtle">{footer}</span>}
        </div>
      )}
    </div>
  );
};

// ---------- Section header ----------
const SectionHead = ({ title, sub, right }) => (
  <div className="between" style={{ marginBottom: 12 }}>
    <div>
      <div className="t-h2">{title}</div>
      {sub && <div className="t-small subtle" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ---------- AI Tag ----------
const AITag = ({ children = "AI" }) => <span className="ai-tag">{children}</span>;

// ---------- Avatar ----------
const Avatar = ({ name, size = 24, color }) => {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("");
  const palette = ["#3A3A40", "#2342D8", "#0E7A4E", "#A66B00", "#7B3F8F", "#155E63"];
  const c = color || palette[name.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c, color: "#fff",
      display: "grid", placeItems: "center",
      fontSize: size * 0.4, fontWeight: 600,
      flexShrink: 0
    }}>{initials}</div>
  );
};

// ---------- Number formatters ----------
const fmtMoney = (n, currency = "AED") => {
  const opts = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return `${currency} ${n.toLocaleString("en", opts)}`;
};
const fmtNum = (n) => n.toLocaleString("en");

// ---------- Export ----------
Object.assign(window, { Icon, Spark, MiniBars, KPI, SectionHead, AITag, Avatar, fmtMoney, fmtNum });
