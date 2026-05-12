/* ============================================================
   Admin screen — OVERVIEW
   Always-on realtime operations terminal.
   - All rank lists animate physical swaps via FLIP technique
   - Numbers tick smoothly (no instant flashes)
   - Live activity stream prepends new events
   - Designed to be left running on a wall display
   ============================================================ */

const { useLayoutEffect: useLayoutEffectOv, useRef: useRefOv } = React;

// ---------- Currency helper — overview uses whatever data holds ----------
const fmtIQD = (n) => "IQD " + Math.round(n).toLocaleString("en");
const fmtCompact = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
};

// ---------- Smooth ticker number — interpolates value changes ----------
function TickerNum({ value, format = (v) => v.toLocaleString("en"), duration = 700, className, style }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === toRef.current) return;
    fromRef.current = display;
    toRef.current = value;
    startRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span className={className} style={style}>{format(display)}</span>;
}

// ---------- Live clock (HH:MM:SS) ----------
function LiveClock({ style }) {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <span className="t-num" style={{ fontFamily: "var(--font-mono)", ...style }}>
      {pad(t.getHours())}:{pad(t.getMinutes())}:<span style={{ opacity: 0.55 }}>{pad(t.getSeconds())}</span>
    </span>
  );
}

// ---------- Live pulse dot ----------
function PulseDot({ color = "var(--pos)", size = 6 }) {
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }}/>
      <span style={{
        position: "absolute", inset: -size * 0.6, borderRadius: "50%", background: color,
        opacity: 0.35, animation: "ovPulse 1.6s ease-out infinite",
      }}/>
    </span>
  );
}

// ============================================================
// FLIP-based animated rank list
// ============================================================
function RankList({ items, renderRow, rowHeight = 44, gap = 4, emptyHint }) {
  const containerRef = useRef(null);
  const positionsRef = useRef({}); // id -> top
  const prevRanksRef = useRef({}); // id -> idx (for direction detection)

  useLayoutEffectOv(() => {
    if (!containerRef.current) return;
    const children = containerRef.current.children;
    const newPositions = {};
    const els = {};
    Array.from(children).forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      els[id] = el;
      newPositions[id] = el.offsetTop;
    });

    // FLIP animate
    Object.keys(els).forEach((id) => {
      const el = els[id];
      const prevTop = positionsRef.current[id];
      const newTop = newPositions[id];
      if (prevTop != null && prevTop !== newTop) {
        const dy = prevTop - newTop;
        // Direction → tag for visual emphasis
        const newRank = items.findIndex((it) => it.id === id);
        const prevRank = prevRanksRef.current[id];
        const dir = prevRank != null && newRank < prevRank ? "up" : "down";

        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        el.style.zIndex = "2";
        // Apply a brief highlight class
        el.dataset.swapDir = dir;
        // force reflow
        void el.offsetHeight;
        requestAnimationFrame(() => {
          el.style.transition = "transform 720ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
          // Clear dir / zIndex after the animation
          setTimeout(() => {
            if (!el) return;
            el.style.zIndex = "";
            delete el.dataset.swapDir;
          }, 760);
        });
      }
    });

    positionsRef.current = newPositions;
    items.forEach((it, idx) => { prevRanksRef.current[it.id] = idx; });
  });

  if (!items.length) {
    return <div className="t-small subtle" style={{ padding: "12px 4px" }}>{emptyHint}</div>;
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap }}>
      {items.map((it, idx) => (
        <div key={it.id} data-id={it.id}
          style={{
            position: "relative",
            minHeight: rowHeight,
            willChange: "transform",
          }}
        >
          {renderRow(it, idx)}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Sliding live activity feed (new items push old ones down)
// ============================================================
function LiveFeed({ events, maxRows = 9, ar }) {
  const containerRef = useRef(null);
  const prevTopsRef = useRef({});
  const knownIdsRef = useRef(new Set());

  useLayoutEffectOv(() => {
    if (!containerRef.current) return;
    const children = containerRef.current.children;
    const newTops = {};
    Array.from(children).forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      newTops[id] = el.offsetTop;

      // New entry → fade + slide in
      if (!knownIdsRef.current.has(id)) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(-12px)";
        void el.offsetHeight;
        requestAnimationFrame(() => {
          el.style.transition = "opacity 420ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.opacity = "1";
          el.style.transform = "";
        });
        knownIdsRef.current.add(id);
      } else {
        // Existing entry that shifted down → FLIP
        const prev = prevTopsRef.current[id];
        const curr = newTops[id];
        if (prev != null && prev !== curr) {
          const dy = prev - curr;
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          void el.offsetHeight;
          requestAnimationFrame(() => {
            el.style.transition = "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)";
            el.style.transform = "";
          });
        }
      }
    });
    prevTopsRef.current = newTops;
  });

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {events.slice(0, maxRows).map((e, i) => {
        const fade = Math.max(0.35, 1 - (i / maxRows) * 0.7);
        return (
          <div key={e.id} data-id={e.id} style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 12,
            padding: "9px 14px",
            borderBottom: i < Math.min(events.length, maxRows) - 1 ? "1px solid var(--line-soft)" : 0,
            opacity: fade,
            willChange: "transform, opacity",
          }}>
            <span className="t-num" style={{
              fontSize: 10.5, color: "var(--ink-3)",
              padding: "2px 6px", border: "1px solid var(--line)",
              borderRadius: 3, background: "var(--surface-2)",
              fontFamily: "var(--font-mono)", letterSpacing: "0.02em"
            }}>{e.kid}</span>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.item}
              </div>
              <div className="t-small subtle" style={{ fontSize: 10.5 }}>
                {e.kiosk} · {e.ago}
              </div>
            </div>
            <span className="t-num" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ink-1)" }}>
              {fmtIQD(e.amount).replace("IQD ", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Hourly pulse — current hour bar pulses; data ticks live
// ============================================================
function HourlyPulse({ data, currentHour }) {
  const yMax = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
      {data.map((v, i) => {
        const h = (v / yMax) * 100;
        const isCurr = i === currentHour;
        const isPast = i < currentHour;
        return (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(3, h)}%`,
            background: isCurr ? "var(--ink)" : isPast ? "var(--ink-2)" : "var(--line-strong)",
            opacity: isCurr ? 1 : isPast ? 0.7 : 1,
            borderRadius: 1,
            position: "relative",
            transition: "height 600ms ease",
          }}>
            {isCurr && (
              <span style={{
                position: "absolute", inset: 0, borderRadius: 1,
                background: "var(--ink)", opacity: 0.35,
                animation: "ovBarPulse 1.8s ease-in-out infinite",
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Status / direction marker for rank rows
// ============================================================
function RankIndicator({ rank }) {
  return (
    <span className="t-num" style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10.5, color: "var(--ink-3)",
      width: 22, textAlign: "end",
      letterSpacing: "0.02em",
    }}>#{rank + 1}</span>
  );
}

// ============================================================
// Main screen
// ============================================================
function OverviewScreen({ lang }) {
  const ar = lang === "ar";

  // ---- Live state: per-kiosk metrics (revenue + stock %) ----
  const initial = useMemo(() => {
    const baseSeed = (s) => {
      // hash-ish for deterministic init
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    return MOCK.kiosks.map((k) => {
      const seed = baseSeed(k.id);
      // Scale revenue up to feel like IQD totals — also gives more swap headroom
      const rev = k.revenue * 1000 + (seed % 500000);
      // initial stock %, lower for warn/crit
      const stockBase = k.status === "crit" ? 22 + (seed % 18)
                      : k.status === "warn" ? 44 + (seed % 18)
                      : 62 + (seed % 32);
      const stockItem = ["Milk, cups, oranges","Pistachio paste","Oat milk","Mint, lemons","Coffee beans","Vanilla syrup","Chocolate","Cinnamon","Sugar","Croissants"][seed % 10];
      return { ...k, liveRev: rev, liveStock: stockBase, stockItem, liveOrders: k.orders };
    });
  }, []);

  const [kiosks, setKiosks] = useState(initial);

  // Live products (revenue tickers)
  const initialProducts = useMemo(() => ([
    { id: "p1", name: "Iced Latte",       cat: "Iced Coffee", rev: 3_690_000, qty: 415 },
    { id: "p2", name: "Iced Americano",   cat: "Iced Coffee", rev: 2_620_000, qty: 392 },
    { id: "p3", name: "Orange Juice",     cat: "Juice",       rev: 2_330_000, qty: 301 },
    { id: "p4", name: "Latte",            cat: "Hot Coffee",  rev: 2_130_000, qty: 271 },
    { id: "p5", name: "Pistachio Cake",   cat: "Cake",        rev: 1_670_000, qty: 148 },
    { id: "p6", name: "Cold Brew",        cat: "Iced Coffee", rev: 1_630_000, qty: 172 },
    { id: "p7", name: "Cappuccino",       cat: "Hot Coffee",  rev: 1_580_000, qty: 215 },
    { id: "p8", name: "Mocha",            cat: "Hot Coffee",  rev: 1_410_000, qty: 178 },
  ]), []);
  const [products, setProducts] = useState(initialProducts);

  // Live activity feed (rolling event stream)
  const [feed, setFeed] = useState(() => seedFeed(initial));
  const eventCounterRef = useRef(1000);

  // Hourly bars — current hour ticks up
  const [hourly, setHourly] = useState(() => [4,3,2,2,3,8,18,32,48,52,46,58,62,55,40,32,38,46,52,58,48,32,18,8]);
  const currentHour = 14;

  // ---- Tick: nudge metrics, occasionally trigger rank swaps ----
  useEffect(() => {
    let alive = true;

    // Frequent tick: small revenue/orders nudges + new feed entry
    const tickFast = setInterval(() => {
      if (!alive) return;
      // append a random transaction
      const k = initial[Math.floor(Math.random() * initial.length)];
      eventCounterRef.current += 1;
      const items = [
        { name: "Iced Latte M · Pistachio Cake", amt: 19500 },
        { name: "Mocha L · Cinnamon Roll",       amt: 14000 },
        { name: "Spanish Latte M · Tiramisu",    amt: 19000 },
        { name: "Cold Brew L · Cheesecake",      amt: 19500 },
        { name: "Mango Juice L",                  amt: 8500 },
        { name: "Orange Juice L",                 amt: 9000 },
        { name: "Cappuccino L · Croissant",       amt: 16500 },
        { name: "Americano · Plain Croissant",    amt: 11000 },
        { name: "Iced Mocha · Carrot Cake",       amt: 21500 },
      ];
      const ev = items[Math.floor(Math.random() * items.length)];
      setFeed((prev) => [
        { id: "ev-" + eventCounterRef.current, kid: k.id, kiosk: k.name, item: ev.name, amount: ev.amt, ago: "now", ts: Date.now() },
        ...prev.map((e, i) => ({ ...e, ago: i === 0 ? `${1 + (Date.now() - e.ts) / 1000 | 0}s ago` : `${(Date.now() - e.ts) / 1000 | 0}s ago` })),
      ].slice(0, 14));

      // bump kiosk metrics
      setKiosks((prev) => prev.map((kk) => {
        const isWinner = kk.id === k.id;
        return {
          ...kk,
          liveRev: kk.liveRev + (isWinner ? ev.amt + 4000 : Math.random() * 3500),
          liveOrders: kk.liveOrders + (isWinner ? 1 : 0),
          // stock slowly declines, more for top-sellers
          liveStock: Math.max(8, kk.liveStock - (isWinner ? 0.18 : 0.06) + (Math.random() * 0.04 - 0.02)),
        };
      }));

      // bump products
      setProducts((prev) => prev.map((p) => ({
        ...p,
        rev: p.rev + Math.random() * 24000,
        qty: p.qty + (Math.random() < 0.4 ? 1 : 0),
      })));

      // bump current hour bar
      setHourly((prev) => {
        const n = [...prev];
        n[currentHour] = n[currentHour] + Math.random() * 0.4;
        return n;
      });
    }, 1800);

    // Slower tick: targeted bumps to force a rank swap somewhere
    const tickSwap = setInterval(() => {
      if (!alive) return;
      setKiosks((prev) => {
        if (prev.length < 2) return prev;
        // sort by liveRev desc so we know current ranks
        const sorted = [...prev].sort((a, b) => b.liveRev - a.liveRev);
        // pick a random adjacent pair within top 6 to swap
        const idx = Math.floor(Math.random() * Math.min(5, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.liveRev - b.liveRev;
        // give b a sudden burst that pushes it past a
        const burst = gap + 50000 + Math.random() * 80000;
        return prev.map((kk) => kk.id === b.id ? { ...kk, liveRev: kk.liveRev + burst, liveOrders: kk.liveOrders + 4 } : kk);
      });
    }, 5500);

    // Also occasionally swap restock priority (lowest stock)
    const tickStockSwap = setInterval(() => {
      if (!alive) return;
      setKiosks((prev) => {
        const sorted = [...prev].sort((a, b) => a.liveStock - b.liveStock);
        const idx = Math.floor(Math.random() * Math.min(5, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = b.liveStock - a.liveStock;
        // push b's stock below a's (a got a delivery; b consumed faster)
        return prev.map((kk) => {
          if (kk.id === b.id) return { ...kk, liveStock: Math.max(8, kk.liveStock - gap - 1.2 - Math.random() * 2) };
          if (kk.id === a.id) return { ...kk, liveStock: Math.min(96, kk.liveStock + 0.8) };
          return kk;
        });
      });
    }, 7200);

    // Occasional product swap
    const tickProdSwap = setInterval(() => {
      if (!alive) return;
      setProducts((prev) => {
        const sorted = [...prev].sort((a, b) => b.rev - a.rev);
        const idx = Math.floor(Math.random() * Math.min(4, sorted.length - 1));
        const a = sorted[idx], b = sorted[idx + 1];
        const gap = a.rev - b.rev;
        return prev.map((p) => p.id === b.id ? { ...p, rev: p.rev + gap + 30000 + Math.random() * 60000, qty: p.qty + 8 } : p);
      });
    }, 6400);

    return () => { alive = false; clearInterval(tickFast); clearInterval(tickSwap); clearInterval(tickStockSwap); clearInterval(tickProdSwap); };
  }, [initial]);

  // ---- Derived sorted lists ----
  const topPerformers = useMemo(
    () => [...kiosks].sort((a, b) => b.liveRev - a.liveRev).slice(0, 6),
    [kiosks]
  );
  const restockPriority = useMemo(
    () => [...kiosks].sort((a, b) => a.liveStock - b.liveStock).slice(0, 6),
    [kiosks]
  );
  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.rev - a.rev).slice(0, 6),
    [products]
  );

  // ---- KPI aggregates (live) ----
  const totalRev = useMemo(() => kiosks.reduce((s, k) => s + k.liveRev, 0), [kiosks]);
  const totalOrders = useMemo(() => kiosks.reduce((s, k) => s + k.liveOrders, 0), [kiosks]);
  const grossProfit = totalRev * 0.289;
  const wastePct = 3.1;
  const variancePct = -1.3;

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* keyframes */}
      <style>{`
        @keyframes ovPulse { 0% { transform: scale(0.8); opacity: 0.55; } 70% { transform: scale(2); opacity: 0; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes ovBarPulse { 0%, 100% { opacity: 0.0; } 50% { opacity: 0.4; } }
        @keyframes ovBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes ovScan {
          0% { transform: translateX(-30%); }
          100% { transform: translateX(130%); }
        }
        .ov-row {
          background: var(--surface);
          border: 1px solid var(--line-soft);
          border-radius: 6px;
          padding: 8px 12px;
          display: grid;
          grid-template-columns: 24px 1fr auto;
          align-items: center;
          gap: 10px;
          transition: background 200ms ease, border-color 200ms ease;
        }
        .ov-row[data-swap-dir="up"] {
          background: linear-gradient(90deg, rgba(14,122,78,0.08), var(--surface) 60%);
          border-color: rgba(14,122,78,0.35);
        }
        .ov-row[data-swap-dir="down"] {
          background: linear-gradient(90deg, rgba(20,20,25,0.04), var(--surface) 60%);
        }
        .ov-row .swap-badge {
          opacity: 0;
          transition: opacity 240ms ease;
        }
        .ov-row[data-swap-dir] .swap-badge {
          opacity: 1;
        }
        .ov-section {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .ov-section-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line-soft);
          background: var(--surface-2);
        }
        .ov-section-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-1);
          font-family: var(--font-mono);
        }
        .ov-bar-track {
          height: 4px; background: var(--surface-sunk); border-radius: 2px; overflow: hidden;
          position: relative;
        }
        .ov-bar-fill {
          height: 100%; border-radius: 2px;
          transition: width 700ms cubic-bezier(0.22,1,0.36,1), background 300ms ease;
        }
        .ov-cursor::after {
          content: "_"; margin-left: 2px; animation: ovBlink 1.1s step-end infinite;
          color: var(--ink-3); font-weight: 400;
        }
        .ov-scan {
          position: relative; overflow: hidden;
        }
        .ov-scan::after {
          content: ""; position: absolute; top: 0; bottom: 0; width: 30%;
          background: linear-gradient(90deg, transparent, rgba(35,66,216,0.07), transparent);
          animation: ovScan 6s linear infinite;
          pointer-events: none;
        }
      `}</style>

      {/* ============ Terminal status bar ============ */}
      <div className="ov-scan" style={{
        background: "var(--ink)", color: "#E6E5DE",
        borderRadius: 8, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 18,
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        letterSpacing: "0.04em",
      }}>
        <div className="row" style={{ gap: 8 }}>
          <PulseDot color="#48D597"/>
          <span style={{ fontWeight: 600 }}>STREAM ACTIVE</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>│</span>
        <span style={{ color: "rgba(230,229,222,0.65)" }}>
          <LiveClock style={{ color: "#E6E5DE" }}/>
          <span style={{ marginInlineStart: 6, opacity: 0.55 }}>BAGHDAD · UTC+3</span>
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>│</span>
        <span style={{ color: "rgba(230,229,222,0.65)" }}>
          <span style={{ color: "#E6E5DE", fontWeight: 600 }}>{kiosks.length}/{kiosks.length}</span> KIOSKS ONLINE
        </span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>│</span>
        <span style={{ color: "rgba(230,229,222,0.65)" }}>
          <span style={{ color: "#E6E5DE" }}>42</span>ms LATENCY
        </span>
        <span style={{ flex: 1 }}/>
        <span className="ov-cursor" style={{ color: "rgba(230,229,222,0.65)" }}>
          watching {kiosks.length} sites · {feed.length} events buffered
        </span>
      </div>

      {/* ============ KPI ribbon ============ */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
      }}>
        <KpiTile label="REVENUE"  primary={<TickerNum value={totalRev} format={(v) => fmtIQD(v)}/>} delta="+8.4% vs plan" deltaDir="up"/>
        <KpiTile label="GROSS PROFIT" primary={<TickerNum value={grossProfit} format={(v) => fmtIQD(v)}/>} delta="28.9% margin" deltaDir="up"/>
        <KpiTile label="ORDERS" primary={<TickerNum value={totalOrders} format={(v) => fmtNum(Math.round(v))}/>} delta={`avg ${fmtIQD(totalRev/Math.max(1,totalOrders)).replace("IQD ","")}`} deltaDir="flat"/>
        <KpiTile label="WASTE" primary={<span className="t-num" style={{ fontFamily: "var(--font-mono)" }}>{wastePct.toFixed(1)}%</span>} delta="target 4%" deltaDir="up"/>
        <KpiTile label="VARIANCE" primary={<span className="t-num" style={{ fontFamily: "var(--font-mono)", color: "var(--crit)" }}>{variancePct.toFixed(1)}%</span>} delta="expected · actual" deltaDir="down"/>
      </div>

      {/* ============ Main grid ============ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(300px, 1fr) minmax(360px, 1.2fr) minmax(300px, 1fr)",
        gap: 12, alignItems: "stretch",
      }}>
        {/* ---- LEFT column ---- */}
        <div className="col" style={{ gap: 12 }}>
          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "أعلى الأكشاك" : "Top performers"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                {ar ? "حسب الإيرادات" : "by revenue · live"}
              </span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={topPerformers}
                renderRow={(k, idx) => {
                  const max = topPerformers[0].liveRev || 1;
                  const pct = (k.liveRev / max) * 100;
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</span>
                          <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: "var(--pos)", fontFamily: "var(--font-mono)" }}>↑</span>
                        </div>
                        <div className="ov-bar-track">
                          <div className="ov-bar-fill" style={{ width: `${pct}%`, background: idx === 0 ? "var(--pos)" : "var(--ink-2)" }}/>
                        </div>
                      </div>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                        <TickerNum value={k.liveRev} format={(v) => fmtCompact(v)}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--crit)"/>
                {ar ? "أولوية إعادة التزويد" : "Restock priority"}
              </div>
              <span className="t-small" style={{
                fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                color: "var(--crit)", letterSpacing: "0.08em",
              }}>{ar ? "تصرف الآن" : "ACT NOW"}</span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={restockPriority}
                renderRow={(k, idx) => {
                  const pct = k.liveStock; // 0-100
                  const tone = pct < 30 ? "var(--crit)" : pct < 50 ? "var(--warn)" : "var(--pos)";
                  const label = pct < 30 ? "Critical" : pct < 50 ? "Low" : "OK";
                  return (
                    <div className="ov-row">
                      <RankIndicator rank={idx}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</span>
                          <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: tone, fontFamily: "var(--font-mono)" }}>!</span>
                        </div>
                        <div className="t-small subtle" style={{ fontSize: 10.5, marginBottom: 4 }}>{k.stockItem}</div>
                        <div className="ov-bar-track">
                          <div className="ov-bar-fill" style={{ width: `${pct}%`, background: tone }}/>
                        </div>
                      </div>
                      <div className="col" style={{ alignItems: "flex-end", gap: 1 }}>
                        <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, color: tone }}>
                          <TickerNum value={pct} format={(v) => Math.round(v) + "%"}/>
                        </span>
                        <span style={{ fontSize: 9.5, fontWeight: 500, color: tone, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>

        {/* ---- CENTER column ---- */}
        <div className="col" style={{ gap: 12 }}>
          <div className="ov-section" style={{ display: "flex", flexDirection: "column" }}>
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "النشاط المباشر" : "Live activity"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                streaming across kiosks
              </span>
            </div>
            <LiveFeed events={feed} maxRows={9} ar={ar}/>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--pos)"/>
                {ar ? "أعلى المنتجات" : "Top products"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                by revenue · live
              </span>
            </div>
            <div style={{ padding: 10 }}>
              <RankList
                items={topProducts}
                renderRow={(p, idx) => {
                  const max = topProducts[0].rev || 1;
                  const pct = (p.rev / max) * 100;
                  return (
                    <div className="ov-row" style={{ gridTemplateColumns: "24px 1fr 70px auto" }}>
                      <RankIndicator rank={idx}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</span>
                          <span className="swap-badge t-num" style={{ fontSize: 10, fontWeight: 600, color: "var(--pos)", fontFamily: "var(--font-mono)" }}>↑</span>
                        </div>
                        <div className="ov-bar-track">
                          <div className="ov-bar-fill" style={{ width: `${pct}%`, background: idx === 0 ? "var(--accent)" : "var(--ink-2)" }}/>
                        </div>
                      </div>
                      <span className="t-num subtle" style={{ fontSize: 11, fontFamily: "var(--font-mono)", textAlign: "end" }}>
                        ×<TickerNum value={p.qty} format={(v) => Math.round(v).toLocaleString("en")}/>
                      </span>
                      <span className="t-num" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, minWidth: 56, textAlign: "end" }}>
                        <TickerNum value={p.rev} format={(v) => fmtCompact(v)}/>
                      </span>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>

        {/* ---- RIGHT column ---- */}
        <div className="col" style={{ gap: 12 }}>
          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--ink-2)"/>
                {ar ? "نبض الساعة" : "Hourly pulse"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                <TickerNum value={totalRev} format={(v) => fmtCompact(v)}/> total
              </span>
            </div>
            <div style={{ padding: "14px 14px 12px" }}>
              <HourlyPulse data={hourly} currentHour={currentHour}/>
              <div className="row" style={{ marginTop: 8, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                <span>00</span><span style={{ flex: 1 }}/>
                <span>06</span><span style={{ flex: 1 }}/>
                <span>12</span><span style={{ flex: 1 }}/>
                <span>18</span><span style={{ flex: 1 }}/>
                <span>23</span>
              </div>
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--warn)"/>
                {ar ? "تنبيهات" : "Alerts"}
              </div>
              <span className="badge" style={{ height: 18, fontSize: 10 }}>{MOCK.alerts.length}</span>
            </div>
            <div>
              {MOCK.alerts.map((a, i) => (
                <div key={a.id} style={{
                  padding: "11px 14px",
                  borderBottom: i < MOCK.alerts.length - 1 ? "1px solid var(--line-soft)" : 0,
                  display: "flex", gap: 10, alignItems: "flex-start"
                }}>
                  <span className={`dot ${a.level}`} style={{ marginTop: 6, flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.35 }}>{a.title}</div>
                    <div className="t-small subtle" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{a.body}</div>
                    <div className="t-small faint" style={{ fontSize: 10.5, marginTop: 5, fontFamily: "var(--font-mono)" }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ov-section">
            <div className="ov-section-head">
              <div className="ov-section-title">
                <PulseDot color="var(--accent)"/>
                {ar ? "إجراءات تلقائية" : "Auto-actions"}
              </div>
              <span className="t-small subtle" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>queue · 3</span>
            </div>
            <div style={{ padding: "10px 14px" }}>
              {[
                { label: "Auto-PO drafted · Baghdad Dairy", sub: "Milk × 4 kiosks · IQD 1.2M", ok: true },
                { label: "Pre-prep schedule shifted", sub: "Marina AD · 7:30 → 7:45", ok: true },
                { label: "Pistachio recipe flagged", sub: "12g → 9g · awaiting approval", ok: false },
              ].map((a, i) => (
                <div key={i} className="row" style={{ padding: "8px 0", gap: 8, borderBottom: i < 2 ? "1px solid var(--line-soft)" : 0 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    background: a.ok ? "var(--pos-soft)" : "var(--warn-soft)",
                    color: a.ok ? "var(--pos)" : "var(--warn)",
                    display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700,
                  }}>{a.ok ? "✓" : "?"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{a.label}</div>
                    <div className="t-small subtle" style={{ fontSize: 10.5 }}>{a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- KPI tile (terminal-style, denser than the default KPI) ----------
function KpiTile({ label, primary, delta, deltaDir }) {
  const tone = deltaDir === "up" ? "var(--pos)" : deltaDir === "down" ? "var(--crit)" : "var(--ink-3)";
  const arrow = deltaDir === "up" ? "↑" : deltaDir === "down" ? "↓" : "·";
  return (
    <div className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="t-micro" style={{ fontSize: 10, color: "var(--ink-3)" }}>{label}</div>
      <div className="t-num" style={{
        fontFamily: "var(--font-mono)", fontSize: 20,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
        fontWeight: 500, lineHeight: 1.1,
      }}>{primary}</div>
      {delta && (
        <div className="row" style={{ gap: 5, fontSize: 11 }}>
          <span style={{ color: tone, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{arrow}</span>
          <span style={{ color: "var(--ink-2)" }}>{delta}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Seed initial activity feed ----------
function seedFeed(kiosks) {
  const items = [
    { name: "Orange Juice L", amt: 9000 },
    { name: "Mocha L · Cinnamon Roll", amt: 14000 },
    { name: "Iced Latte M · Pistachio Cake", amt: 19500 },
    { name: "Spanish Latte M · Tiramisu", amt: 19000 },
    { name: "Spanish Latte M · Tiramisu", amt: 19000 },
    { name: "Cold Brew L · Cheesecake", amt: 19500 },
    { name: "Iced Latte M · Pistachio Cake", amt: 19500 },
    { name: "Cold Brew L · Cheesecake", amt: 19500 },
    { name: "Mango Juice L", amt: 8500 },
  ];
  const now = Date.now();
  return items.map((it, i) => {
    const k = kiosks[i % kiosks.length];
    return {
      id: "ev-init-" + i,
      kid: k.id,
      kiosk: k.name,
      item: it.name,
      amount: it.amt,
      ago: i === 0 ? "now" : `${i * 6}s ago`,
      ts: now - i * 6000,
    };
  });
}

window.OverviewScreen = OverviewScreen;
