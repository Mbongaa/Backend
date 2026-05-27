import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./exact-design/AppShell.jsx";
import { registerOfflineServiceWorker } from "./bayaan/registerOfflineServiceWorker";
import "./studio.css";
import "./exact-design/exact.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);

registerOfflineServiceWorker();
