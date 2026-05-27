import { useEffect, useState } from "react";
import ExactKioskApp from "./ExactKioskApp.jsx";
import MobileDashboard from "./MobileDashboard.jsx";

const MOBILE_BREAKPOINT_PX = 760;

const MODE_KEY = "bayaan.mobile.override.v1";

function readInitialView() {
  if (typeof window === "undefined") return "desktop";
  // URL override wins so smoke and shareable demo links can pin a mode.
  const params = new URLSearchParams(window.location.search);
  const param = (params.get("bayaanView") || "").toLowerCase();
  if (param === "mobile") return "mobile";
  if (param === "desktop") return "desktop";
  // Persisted manual override is the next priority.
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === "mobile" || stored === "desktop") return stored;
  // Fall back to viewport width.
  return window.innerWidth < MOBILE_BREAKPOINT_PX ? "mobile" : "desktop";
}

export default function AppShell() {
  const [view, setView] = useState(readInitialView);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Re-evaluate on resize unless the user pinned a manual override.
    const onResize = () => {
      const stored = window.localStorage.getItem(MODE_KEY);
      if (stored === "mobile" || stored === "desktop") return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("bayaanView")) return;
      const next = window.innerWidth < MOBILE_BREAKPOINT_PX ? "mobile" : "desktop";
      setView((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (view === "mobile") {
    return <MobileDashboard />;
  }
  return <ExactKioskApp />;
}
