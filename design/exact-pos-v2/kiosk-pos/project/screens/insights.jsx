/* ============================================================
   Admin screen — AI INSIGHTS
   Canvas (left) + Chat agent (right).
   - Canvas shows today's analysis cards by default
   - When the user asks a question (or taps a suggested prompt),
     the agent streams a reply AND re-renders the canvas with
     a tailored set of visualization cards
   ============================================================ */

const { useState: useStateIns, useEffect: useEffectIns, useRef: useRefIns, useMemo: useMemoIns } = React;

// ============================================================
// Scene library — each scene = a set of canvas cards + a reply
// ============================================================
const SCENES = {
  default: {
    label: "Today's brief",
    reply: "Today's brief is on the canvas. Four signals worth your time — most important: pistachio cake margin slipped 6 points since the Levant Foods price hike on Apr 22. Reformulating to peer-median 9g could recover 4.5 points. I've also pre-charted the iced-drink surge, Friday's forecast, and a cashier speed gap.",
    cards: [
      {
        id: "headline-pistachio", type: "headline", span: "8/4",
        kind: "Anomaly · Margin",
        title: "Pistachio cake margin dropped 6 pts",
        delta: -6, deltaUnit: "pts", deltaLabel: "since Apr 22",
        body: "Levant Foods raised paste price 18%. Recipe uses 12g vs peer median 9g — reformulation could recover 4.5 pts.",
        spark: [31.4, 31.2, 30.8, 30.1, 29.6, 28.7, 27.4, 26.2, 25.9, 25.4, 25.4],
        annotation: { x: 5, label: "Apr 22 · price hike" },
        confidence: 88,
      },
      {
        id: "trend-iced", type: "bars", span: "4/4",
        kind: "Trend",
        title: "Iced drinks +31% w/w",
        bars: [
          { label: "Mon", v: 62, prev: 58 },
          { label: "Tue", v: 71, prev: 60 },
          { label: "Wed", v: 78, prev: 64 },
          { label: "Thu", v: 88, prev: 67 },
          { label: "Fri", v: 96, prev: 72 },
          { label: "Sat", v: 104, prev: 79, accent: true },
        ],
        body: "4 coastal kiosks · heat correlation 0.84",
        confidence: 92,
      },
      {
        id: "forecast-friday", type: "forecast", span: "4/3",
        kind: "Forecast",
        title: "Friday revenue",
        value: 198, unit: "K IQD",
        rangeLow: 186, rangeHigh: 210,
        note: "Eid pull-forward · weather +27°C",
        confidence: 81,
      },
      {
        id: "speed-cashiers", type: "rank", span: "4/3",
        kind: "Action",
        title: "Two cashiers above peer median",
        rows: [
          { label: "Marina K-04 · Sara",  v: 39, target: 28 },
          { label: "Mall K-09 · Karim",   v: 36, target: 28 },
          { label: "Median",              v: 28, target: 28, muted: true },
        ],
        body: "Re-train on combo shortcuts → ~40 min/day saved",
        confidence: 76,
      },
      {
        id: "stock-runway", type: "runway", span: "4/3",
        kind: "Operations",
        title: "Stock runway by category",
        rows: [
          { label: "Coffee",    days: 9.4, target: 7,  ok: true },
          { label: "Dairy",     days: 1.2, target: 5,  ok: false },
          { label: "Bakery",    days: 2.8, target: 4,  ok: false },
          { label: "Produce",   days: 3.4, target: 5,  ok: false },
          { label: "Syrups",    days: 5.1, target: 7,  ok: true },
          { label: "Packaging", days: 11,  target: 7,  ok: true },
        ],
        body: "Auto-PO drafted for dairy · awaiting approval",
      },
    ]
  },

  marina: {
    label: "Why is Marina AD 12% behind?",
    reply: "Pulled apart Marina AD's day. The 12% gap comes almost entirely from a 3-hour milk stockout this morning (08:42–11:15) — drinks per hour fell to 18 vs the usual 46. Footfall and ticket size are normal. Auto-PO is already drafted; a manual transfer from Marina K-01 could recover the rest of today.",
    cards: [
      {
        id: "marina-headline", type: "headline", span: "12/3",
        kind: "Diagnosis · Marina AD",
        title: "Milk stockout cost ~IQD 410K",
        delta: -12, deltaUnit: "%", deltaLabel: "vs plan",
        body: "Stockout window 08:42–11:15. Drinks/hour fell to 18 (avg 46). Footfall and ticket size unchanged.",
        spark: [42, 44, 46, 22, 18, 19, 21, 38, 44, 47, 45],
        annotation: { x: 3, label: "stockout starts" },
      },
      {
        id: "marina-stack", type: "stack", span: "8/4",
        kind: "Variance breakdown",
        title: "Where the 12% went",
        segments: [
          { label: "Milk stockout", v: 8.4, color: "var(--crit)" },
          { label: "Lower iced mix", v: 2.1, color: "var(--warn)" },
          { label: "Card terminal hiccup", v: 1.5, color: "var(--ink-2)" },
        ],
        total: 12,
        body: "Stockout dominates · 70% of variance",
      },
      {
        id: "marina-fix", type: "actions", span: "4/4",
        kind: "Recovery plan",
        title: "Two actions to recover today",
        actions: [
          { label: "Approve auto-PO · Baghdad Dairy", sub: "20 ctn · ETA 2h", primary: true },
          { label: "Transfer 8 ctn from K-01 Marina", sub: "Recovers ~IQD 280K today", primary: false },
        ],
      },
      {
        id: "marina-hourly", type: "hourly", span: "12/3",
        kind: "Hourly drinks served",
        data: [12, 18, 32, 44, 46, 48, 22, 18, 19, 21, 38, 44, 47, 45, 42, 38, 32, 28, 18, 12, 8, 4, 2, 0],
        currentHour: 14,
        outageStart: 6, outageEnd: 9,
      },
    ]
  },

  weekend: {
    label: "Which products to push this weekend?",
    reply: "Three products have the strongest pull for Sat–Sun: Iced Latte, Cold Brew, and Pistachio Cake. Iced Latte attaches to 38% of weekend tickets and clears 73% margin. I'd staff the prep accordingly and pre-batch cold brew Friday night.",
    cards: [
      {
        id: "weekend-rank", type: "rank-big", span: "8/4",
        kind: "Recommendation · Weekend",
        title: "Top push candidates",
        rows: [
          { label: "Iced Latte",      score: 92, attach: "38%", margin: "73%", reason: "Highest attach + heat-driven" },
          { label: "Cold Brew",       score: 84, attach: "21%", margin: "78%", reason: "Best margin · stock holds" },
          { label: "Pistachio Cake",  score: 76, attach: "18%", margin: "62%", reason: "Pairs with iced drinks" },
          { label: "Mango Juice",     score: 68, attach: "14%", margin: "58%", reason: "Family carts on weekends" },
        ],
      },
      {
        id: "weekend-heat", type: "heatmap", span: "4/4",
        kind: "Heat × sales",
        title: "Iced drink correlation",
        data: [
          [22, 4], [24, 7], [26, 9], [28, 14], [30, 22], [32, 31], [34, 42], [36, 58], [38, 72], [40, 81]
        ],
        body: "r = 0.84 · stronger past 32°C",
      },
      {
        id: "weekend-prep", type: "actions", span: "12/3",
        kind: "Pre-shift plan",
        title: "Friday night prep",
        actions: [
          { label: "Pre-batch 12L cold brew", sub: "Across 4 coastal kiosks", primary: true },
          { label: "Add 2 baristas Sat 10:00–14:00", sub: "Marina + JBR · peak window", primary: false },
          { label: "Increase pistachio cake bake by 20%", sub: "Sat morning", primary: false },
        ],
      },
    ]
  },

  waste: {
    label: "Show me waste anomalies",
    reply: "Three anomalies stood out across the last 14 days. JBR's croissant waste is up 240% — almost certainly overproduction in the morning bake. Marina AD's pistachio cake end-of-day waste is consistent and material at IQD 168/day. Sahara's plain croissant goes stale by lunch — likely a freshness window issue.",
    cards: [
      {
        id: "waste-grid", type: "wastegrid", span: "8/5",
        kind: "Last 14 days · waste % by kiosk",
        title: "Waste heatmap",
        kiosks: ["K-01 Marina","K-02 JBR","K-03 Mall","K-04 City Walk","K-05 Hills","K-06 Yas","K-07 Marina AD","K-08 Galleria","K-09 Sahara","K-10 Sharjah"],
        rows: 14,
      },
      {
        id: "waste-jbr", type: "headline", span: "4/3",
        kind: "Anomaly #1 · JBR",
        title: "Croissant waste +240%",
        delta: 240, deltaUnit: "%", deltaLabel: "vs 7-day avg",
        body: "Likely AM overproduction — peak demand shifted later by 18 min.",
        spark: [4, 5, 4, 6, 5, 7, 8, 12, 18, 24, 22, 21, 18],
        annotation: { x: 7, label: "shift in start" },
      },
      {
        id: "waste-marina", type: "headline", span: "4/3",
        kind: "Anomaly #2 · Marina AD",
        title: "Pistachio EOD waste consistent",
        delta: 168, deltaUnit: "IQD/d", deltaLabel: "lost",
        body: "6 slices/day at 23:00 cleanup. Reduce daily bake by 4.",
        spark: [148, 156, 162, 168, 164, 172, 168, 170, 168],
      },
      {
        id: "waste-sahara", type: "headline", span: "4/3",
        kind: "Anomaly #3 · Sahara",
        title: "Plain croissant stales by 13:00",
        delta: 9, deltaUnit: "/day", deltaLabel: "tossed",
        body: "Bake-to-sell window narrowed. Consider 2 smaller batches.",
        spark: [6, 7, 9, 8, 10, 9, 11, 9, 10],
      },
    ]
  },
};

const SUGGESTED = [
  { id: "marina",   text: "Why is Marina AD 12% behind?" },
  { id: "weekend",  text: "What should I push this weekend?" },
  { id: "waste",    text: "Show me waste anomalies" },
  { id: "default",  text: "Today's brief" },
];

// ============================================================
// Streaming-text hook — types out a string char by char
// ============================================================
function useStream(target, speed = 14) {
  const [out, setOut] = useStateIns("");
  useEffectIns(() => {
    setOut("");
    if (!target) return;
    let i = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      if (dt >= speed) {
        const advance = Math.max(1, Math.floor(dt / speed));
        i = Math.min(target.length, i + advance);
        setOut(target.slice(0, i));
        last = now;
      }
      if (i < target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return out;
}

// ============================================================
// Card visualization components
// ============================================================
function CardShell({ children, kind, title, confidence, body, accent }) {
  return (
    <div className="ins-card" style={{ position: "relative" }}>
      {accent && <div style={{
        position: "absolute", insetInlineStart: 0, top: 12, bottom: 12,
        width: 2, background: accent, borderRadius: 2,
      }}/>}
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        {kind && <span className="badge" style={{ height: 18, fontSize: 10 }}>{kind}</span>}
        <span style={{ flex: 1 }}/>
        {confidence != null && (
          <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
            {confidence}% conf
          </span>
        )}
      </div>
      {title && <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: body ? 4 : 8 }}>{title}</div>}
      {body && <div className="t-small muted" style={{ lineHeight: 1.5, marginBottom: 10 }}>{body}</div>}
      {children}
    </div>
  );
}

function HeadlineCard({ card }) {
  const positive = card.delta >= 0 && (card.deltaUnit === "%" || card.deltaUnit === "pts" ? card.delta > 0 : true);
  // For waste/anomaly cards a "+%" delta is bad. Use the explicit kind tone:
  const isAnomaly = /Anomaly/i.test(card.kind || "");
  const tone = isAnomaly ? "var(--crit)" : (card.delta < 0 ? "var(--crit)" : "var(--pos)");
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence} accent={tone}>
      <div className="row" style={{ gap: 12, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: tone,
          letterSpacing: "-0.01em",
        }}>
          {card.delta > 0 ? "+" : ""}{card.delta}{card.deltaUnit}
        </span>
        <span className="t-small subtle">{card.deltaLabel}</span>
      </div>
      {card.spark && <SparkAnnot data={card.spark} annotation={card.annotation} color={tone}/>}
    </CardShell>
  );
}

function SparkAnnot({ data, annotation, color }) {
  const W = 320, H = 70;
  const pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (W - pad * 2),
    pad + (1 - (v - min) / r) * (H - pad * 2),
  ]);
  const d = "M" + pts.map(p => p.join(",")).join(" L");
  const a = d + ` L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  // path length for draw-in
  const pathRef = useRefIns(null);
  const [drawn, setDrawn] = useStateIns(0);
  useEffectIns(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = len + "";
    pathRef.current.style.strokeDashoffset = len + "";
    requestAnimationFrame(() => {
      pathRef.current.style.transition = "stroke-dashoffset 900ms ease";
      pathRef.current.style.strokeDashoffset = "0";
    });
    const t = setTimeout(() => setDrawn(1), 900);
    return () => clearTimeout(t);
  }, [data.join(",")]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 70, display: "block" }} preserveAspectRatio="none">
      <path d={a} fill={color} opacity="0.08"/>
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      {annotation && (() => {
        const x = pts[annotation.x] ? pts[annotation.x][0] : 0;
        return (
          <g style={{ opacity: drawn, transition: "opacity 240ms ease 100ms" }}>
            <line x1={x} y1={pad} x2={x} y2={H - pad} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 2"/>
            <circle cx={x} cy={pts[annotation.x][1]} r="3" fill="var(--surface)" stroke={color} strokeWidth="1.5"/>
            <text x={x + 5} y={14} fontSize="9.5" fill="var(--ink-2)" fontFamily="var(--font-mono)">{annotation.label}</text>
          </g>
        );
      })()}
    </svg>
  );
}

function BarsCard({ card }) {
  const max = Math.max(...card.bars.flatMap(b => [b.v, b.prev]));
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 96, marginTop: 4, padding: "0 4px" }}>
        {card.bars.map((b, i) => {
          const h = (b.v / max) * 100;
          const ph = (b.prev / max) * 100;
          return (
            <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, width: "100%", justifyContent: "center" }}>
                <div style={{
                  width: "44%", background: "var(--line-strong)", height: `${ph}%`,
                  borderRadius: 1, opacity: 0.8,
                  animation: `insBarGrow 600ms cubic-bezier(0.22,1,0.36,1) ${i * 50}ms both`,
                }}/>
                <div style={{
                  width: "44%", background: b.accent ? "var(--ink)" : "var(--ink-1)", height: `${h}%`,
                  borderRadius: 1,
                  animation: `insBarGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 50 + 80}ms both`,
                }}/>
              </div>
              <span className="t-small faint" style={{ fontSize: 10 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function ForecastCard({ card }) {
  const W = 280, H = 80;
  return (
    <CardShell kind={card.kind} title={card.title} confidence={card.confidence}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {card.value}
        </span>
        <span className="t-small subtle">{card.unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 64, display: "block" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ins-fan" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.18"/>
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1="0" y1={H/2} x2={W * 0.55} y2={H/2} stroke="var(--ink-2)" strokeWidth="1.4"/>
        {/* forecast fan */}
        <path d={`M ${W*0.55} ${H/2} Q ${W*0.78} ${H/2 - 18}, ${W} 8 L ${W} ${H - 8} Q ${W*0.78} ${H/2 + 18}, ${W*0.55} ${H/2} Z`} fill="url(#ins-fan)"/>
        <line x1={W*0.55} y1={H/2} x2={W} y2={H/2 - 16} stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="3 2"/>
        <line x1={W*0.55} y1="0" x2={W*0.55} y2={H} stroke="var(--ink-3)" strokeWidth="0.8" strokeDasharray="2 2"/>
        <text x={W*0.55 + 4} y="11" fontSize="9" fill="var(--ink-2)" fontFamily="var(--font-mono)">now</text>
        <text x={W - 28} y={H - 2} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)">Fri</text>
      </svg>
      <div className="row" style={{ marginTop: 6, gap: 12, fontSize: 11, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
        <span>range {card.rangeLow}–{card.rangeHigh}</span>
        <span style={{ flex: 1 }}/>
        <span className="subtle">{card.note}</span>
      </div>
    </CardShell>
  );
}

function RankCard({ card }) {
  const max = Math.max(...card.rows.map(r => r.v));
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body} confidence={card.confidence}>
      <div className="col" style={{ gap: 8 }}>
        {card.rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center", opacity: r.muted ? 0.55 : 1 }}>
            <span className="t-small">{r.label}</span>
            <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.v}s</span>
            <div style={{ gridColumn: "1 / -1", height: 5, background: "var(--surface-sunk)", borderRadius: 2, position: "relative" }}>
              <div style={{
                height: "100%", width: `${(r.v / max) * 100}%`,
                background: r.muted ? "var(--ink-3)" : "var(--ink-1)",
                borderRadius: 2,
                animation: `insBarRow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`,
                transformOrigin: "left",
              }}/>
              <div style={{
                position: "absolute", insetInlineStart: `${(r.target / max) * 100}%`, top: -2, bottom: -2,
                width: 1.5, background: "var(--ink-2)",
              }}/>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function RunwayCard({ card }) {
  const max = 14;
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <div className="col" style={{ gap: 8 }}>
        {card.rows.map((r, i) => {
          const tone = r.ok ? "var(--ink-1)" : "var(--crit)";
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 8, alignItems: "center" }}>
              <span className="t-small">{r.label}</span>
              <div style={{ position: "relative", height: 6, background: "var(--surface-sunk)", borderRadius: 2 }}>
                <div style={{
                  position: "absolute", height: "100%", insetInlineStart: 0,
                  width: `${(r.days / max) * 100}%`,
                  background: tone, borderRadius: 2, opacity: 0.85,
                  animation: `insBarRow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
                  transformOrigin: "left",
                }}/>
                <div style={{
                  position: "absolute", insetInlineStart: `${(r.target / max) * 100}%`, top: -2, bottom: -2,
                  width: 1.5, background: "var(--ink-2)", opacity: 0.7,
                }}/>
              </div>
              <span className="t-num" style={{ fontSize: 11, fontFamily: "var(--font-mono)", textAlign: "end", color: r.ok ? "var(--ink-2)" : "var(--crit)" }}>{r.days}d</span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function StackCard({ card }) {
  const total = card.total || card.segments.reduce((s, x) => s + x.v, 0);
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <div style={{
        display: "flex", height: 22, borderRadius: 4, overflow: "hidden",
        border: "1px solid var(--line-soft)", marginTop: 6, marginBottom: 8,
      }}>
        {card.segments.map((s, i) => (
          <div key={i} style={{
            flex: s.v, background: s.color, position: "relative",
            animation: `insStackGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms both`,
            transformOrigin: "left",
          }}/>
        ))}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {card.segments.map((s, i) => (
          <div key={i} className="row" style={{ gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2 }}/>
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className="t-num" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{s.v}%</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function ActionsCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div className="col" style={{ gap: 8, marginTop: 4 }}>
        {card.actions.map((a, i) => (
          <button key={i} className={a.primary ? "btn btn-accent" : "btn btn-ghost"} style={{
            justifyContent: "space-between", height: "auto", padding: "10px 12px",
            textAlign: "start", whiteSpace: "normal", lineHeight: 1.35,
          }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 13 }}>{a.label}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{a.sub}</span>
            </span>
            <Icon name="arrowRight" size={12}/>
          </button>
        ))}
      </div>
    </CardShell>
  );
}

function HourlyCard({ card }) {
  const max = Math.max(...card.data);
  return (
    <CardShell kind={card.kind}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, padding: "8px 0 6px" }}>
        {card.data.map((v, i) => {
          const h = (v / max) * 100;
          const inOutage = i >= card.outageStart && i <= card.outageEnd;
          const isCurr = i === card.currentHour;
          return (
            <div key={i} style={{
              flex: 1, height: `${Math.max(2, h)}%`,
              background: inOutage ? "var(--crit)" : isCurr ? "var(--ink)" : "var(--ink-2)",
              opacity: inOutage ? 0.85 : isCurr ? 1 : 0.55,
              borderRadius: 1,
              animation: `insBarGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 18}ms both`,
              transformOrigin: "bottom",
            }}/>
          );
        })}
      </div>
      <div className="row" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 4 }}>
        <span>00</span><span style={{ flex: 1 }}/>
        <span style={{ color: "var(--crit)" }}>● stockout 08:42–11:15</span>
        <span style={{ flex: 1 }}/>
        <span>23</span>
      </div>
    </CardShell>
  );
}

function HeatmapCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title} body={card.body}>
      <svg viewBox="0 0 200 100" style={{ width: "100%", height: 100 }} preserveAspectRatio="none">
        <line x1="20" y1="90" x2="195" y2="90" stroke="var(--line-strong)"/>
        <line x1="20" y1="6" x2="20" y2="90" stroke="var(--line-strong)"/>
        {card.data.map(([x, y], i) => {
          const cx = 20 + ((x - 20) / 22) * 175;
          const cy = 90 - (y / 85) * 80;
          return <circle key={i} cx={cx} cy={cy} r="3" fill="var(--accent)" opacity="0.85"
            style={{ animation: `insDotIn 460ms cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both` }}/>;
        })}
        {/* trend line */}
        <line x1="22" y1="84" x2="190" y2="14" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="3 2" opacity="0.6"/>
        <text x="22" y="98" fontSize="8" fill="var(--ink-3)" fontFamily="var(--font-mono)">22°C</text>
        <text x="170" y="98" fontSize="8" fill="var(--ink-3)" fontFamily="var(--font-mono)">40°C</text>
      </svg>
    </CardShell>
  );
}

function RankBigCard({ card }) {
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div className="col" style={{ gap: 10, marginTop: 4 }}>
        {card.rows.map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "20px 1.4fr 60px 1fr",
            gap: 12, alignItems: "center",
            padding: "8px 10px",
            background: i === 0 ? "var(--surface-sunk)" : "transparent",
            borderRadius: 6,
            border: i === 0 ? "1px solid var(--line-soft)" : "1px solid transparent",
            animation: `insRowIn 480ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
          }}>
            <span className="t-num subtle" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>#{i+1}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
              <div className="t-small subtle" style={{ fontSize: 11 }}>{r.reason}</div>
            </div>
            <div className="col" style={{ alignItems: "flex-end", gap: 1 }}>
              <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500 }}>{r.score}</span>
              <span className="t-small faint" style={{ fontSize: 10 }}>score</span>
            </div>
            <div className="row" style={{ gap: 14, fontSize: 11 }}>
              <span><span className="subtle">attach</span> <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.attach}</span></span>
              <span><span className="subtle">margin</span> <span className="t-num" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.margin}</span></span>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function WasteGridCard({ card }) {
  const COLS = card.kiosks.length;
  const ROWS = card.rows;
  // generate deterministic pseudo-data
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const seed = (r * 31 + c * 17) % 100;
      let v = (seed % 9) / 2; // 0-4
      // anomalies
      if (c === 1 && r >= 8) v = 8 + (seed % 3); // JBR croissant spike
      if (c === 6) v = 4 + (seed % 3); // marina AD steady
      if (c === 8 && r % 2 === 0) v = 5.5 + (seed % 2);
      cells.push({ r, c, v });
    }
  }
  const maxV = 10;
  return (
    <CardShell kind={card.kind} title={card.title}>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <div className="col" style={{ justifyContent: "space-between", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-3)", paddingBottom: 18 }}>
          <span>14d ago</span>
          <span>today</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 2,
          }}>
            {cells.map(({ r, c, v }) => {
              const intensity = Math.min(1, v / maxV);
              const isHot = v > 5;
              return (
                <div key={`${r}-${c}`} style={{
                  aspectRatio: "1",
                  background: isHot ? "var(--crit)" : "var(--ink)",
                  opacity: 0.08 + intensity * 0.85,
                  borderRadius: 1,
                  animation: `insDotIn 360ms ease ${(r * COLS + c) * 6}ms both`,
                }}/>
              );
            })}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 2, marginTop: 4,
          }}>
            {card.kiosks.map((k, i) => (
              <div key={k} style={{ fontSize: 8.5, fontFamily: "var(--font-mono)", color: "var(--ink-3)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {k.split(" ")[0]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

const CARD_RENDERERS = {
  headline: HeadlineCard,
  bars: BarsCard,
  forecast: ForecastCard,
  rank: RankCard,
  runway: RunwayCard,
  stack: StackCard,
  actions: ActionsCard,
  hourly: HourlyCard,
  heatmap: HeatmapCard,
  "rank-big": RankBigCard,
  wastegrid: WasteGridCard,
};

// ============================================================
// Canvas — renders the active scene's cards in a 12-col grid,
// fades old cards out before new ones in
// ============================================================
function InsightCanvas({ sceneId }) {
  const scene = SCENES[sceneId] || SCENES.default;
  const [renderId, setRenderId] = useStateIns(sceneId);

  // crossfade: when sceneId changes, keep showing old for 220ms then swap
  useEffectIns(() => {
    if (sceneId === renderId) return;
    const t = setTimeout(() => setRenderId(sceneId), 220);
    return () => clearTimeout(t);
  }, [sceneId, renderId]);

  const showing = SCENES[renderId] || SCENES.default;
  const fadingOut = sceneId !== renderId;

  return (
    <div style={{ position: "relative", height: "100%", overflow: "auto" }}>
      <div style={{
        padding: "20px 24px 80px",
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 200ms ease, transform 240ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div className="row" style={{ marginBottom: 14, gap: 8 }}>
          <AITag>{showing.label}</AITag>
          <span className="t-small subtle" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {showing.cards.length} cards · generated just now
          </span>
        </div>

        <div key={renderId} style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
          alignItems: "start",
        }}>
          {showing.cards.map((card, idx) => {
            const Renderer = CARD_RENDERERS[card.type] || HeadlineCard;
            const [span, rowSpan] = (card.span || "6/3").split("/").map(Number);
            return (
              <div key={card.id} style={{
                gridColumn: `span ${span}`,
                animation: `insCardIn 520ms cubic-bezier(0.22,1,0.36,1) ${idx * 80}ms both`,
              }}>
                <Renderer card={card}/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Chat panel
// ============================================================
function ChatPanel({ messages, sendQuestion, busy, onSuggested }) {
  const [text, setText] = useStateIns("");
  const scrollRef = useRefIns(null);

  useEffectIns(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, busy]);

  const submit = (q) => {
    const v = (q ?? text).trim();
    if (!v) return;
    sendQuestion(v);
    setText("");
  };

  return (
    <div style={{
      width: 380, flexShrink: 0,
      display: "flex", flexDirection: "column",
      borderInlineStart: "1px solid var(--line)",
      background: "var(--surface)",
      height: "100%",
    }}>
      {/* header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--line-soft)",
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--surface-2)",
      }}>
        <span style={{ position: "relative", width: 8, height: 8, display: "inline-block" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--pos)" }}/>
          <span style={{
            position: "absolute", inset: -4, borderRadius: "50%", background: "var(--pos)",
            opacity: 0.3, animation: "ovPulse 1.6s ease-out infinite",
          }}/>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Maqha Insights</div>
          <div className="t-small subtle" style={{ fontSize: 10.5 }}>Online · trained on your last 90 days</div>
        </div>
        <button className="btn btn-quiet" style={{ height: 24, fontSize: 11, padding: "0 6px" }}>
          <Icon name="dots" size={12}/>
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="scroll" style={{
        flex: 1, overflowY: "auto",
        padding: "16px 16px 8px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {messages.map((m, i) => (
          <ChatMessage key={i} message={m}/>
        ))}
        {busy && <TypingIndicator/>}
      </div>

      {/* suggestions */}
      <div style={{ padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SUGGESTED.map(s => (
          <button key={s.id} onClick={() => onSuggested(s)}
            disabled={busy}
            style={{
              padding: "5px 10px", fontSize: 11.5,
              border: "1px solid var(--line)", borderRadius: 999,
              background: "var(--surface)", color: "var(--ink-1)",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.5 : 1,
              transition: "background 80ms ease",
            }}
            onMouseEnter={e => !busy && (e.currentTarget.style.background = "var(--surface-sunk)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}
          >
            {s.text}
          </button>
        ))}
      </div>

      {/* input */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 8px 8px 12px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--surface)",
        }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Ask about a kiosk, product, anomaly…"
            disabled={busy}
            style={{
              flex: 1, border: 0, outline: "none", background: "transparent",
              fontSize: 13, color: "var(--ink)",
            }}/>
          <button className="btn btn-primary" style={{ height: 28, padding: "0 10px" }}
            disabled={busy} onClick={() => submit()}>
            <Icon name="arrowUp" size={12}/>
          </button>
        </div>
        <div className="t-small faint" style={{ fontSize: 10.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>
          Powered by your operations data · {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isLive = message.streaming;
  const target = message.text || "";
  const streamed = useStream(isLive ? target : "", 12);
  const display = isLive ? streamed : target;

  if (isUser) {
    return (
      <div style={{
        alignSelf: "flex-end", maxWidth: "85%",
        padding: "8px 12px",
        background: "var(--ink)", color: "#FBFBF8",
        borderRadius: "12px 12px 4px 12px",
        fontSize: 13, lineHeight: 1.45,
        animation: "insMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both",
      }}>
        {target}
      </div>
    );
  }
  return (
    <div style={{
      alignSelf: "flex-start", maxWidth: "92%",
      animation: "insMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both",
    }}>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        <AITag>AI</AITag>
        <span className="t-small subtle" style={{ fontSize: 10.5 }}>maqha</span>
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.55,
        color: "var(--ink-1)",
      }}>
        {display}
        {isLive && display.length < target.length && <span className="ins-caret"/>}
      </div>
      {!isLive && message.cite && (
        <div className="t-small subtle" style={{ fontSize: 10.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>
          ↳ rendered {message.cite} on canvas
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out infinite" }}/>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out 0.15s infinite" }}/>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)", animation: "insDot 1.2s ease-in-out 0.3s infinite" }}/>
    </div>
  );
}

// ============================================================
// Main screen
// ============================================================
function InsightsScreen({ lang }) {
  const [scene, setScene] = useStateIns("default");
  const [messages, setMessages] = useStateIns([
    { role: "ai", text: SCENES.default.reply, cite: SCENES.default.cards.length + " cards" },
  ]);
  const [busy, setBusy] = useStateIns(false);

  const sendQuestion = (q, sceneIdHint) => {
    // pick the matching scene by keyword if no hint
    const guessed = sceneIdHint || guessScene(q);
    setMessages(m => [...m, { role: "user", text: q }]);
    setBusy(true);
    // after a brief "thinking", swap canvas + start streaming reply
    setTimeout(() => {
      setScene(guessed);
      const target = SCENES[guessed]?.reply || "Let me look at that…";
      setMessages(m => [...m, { role: "ai", text: target, streaming: true, cite: SCENES[guessed]?.cards.length + " cards" }]);
      // mark stream complete after enough time
      const streamMs = Math.min(4500, target.length * 14 + 400);
      setTimeout(() => {
        setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, streaming: false } : x));
        setBusy(false);
      }, streamMs);
    }, 700);
  };

  const onSuggested = (s) => {
    if (busy) return;
    sendQuestion(s.text, s.id);
  };

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 100px)",
      margin: "-24px -28px",
      background: "var(--paper)",
    }}>
      {/* Inline animation rules */}
      <style>{`
        @keyframes insCardIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.98); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insBarGrow {
          0% { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes insBarRow {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes insStackGrow {
          0% { transform: scaleX(0); opacity: 0.6; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes insRowIn {
          0% { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insDotIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 0.85; }
        }
        @keyframes insMsgIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes insDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        .ins-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px 16px;
          padding-inline-start: 18px;
        }
        .ins-caret {
          display: inline-block; width: 1.5px; height: 13px;
          background: var(--ink-1); margin-left: 2px;
          vertical-align: -2px;
          animation: insBlink 0.85s steps(1) infinite;
        }
        @keyframes insBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>

      <div style={{ flex: 1, minWidth: 0 }}>
        <InsightCanvas sceneId={scene}/>
      </div>
      <ChatPanel
        messages={messages}
        sendQuestion={sendQuestion}
        busy={busy}
        onSuggested={onSuggested}
      />
    </div>
  );
}

function guessScene(q) {
  const s = q.toLowerCase();
  if (/marina|behind|stockout|milk|why/.test(s)) return "marina";
  if (/weekend|push|product|recommend/.test(s)) return "weekend";
  if (/waste|anomal|spoil|loss/.test(s)) return "waste";
  return "default";
}

window.InsightsScreen = InsightsScreen;
