import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ExactKioskApp from "./exact-design/ExactKioskApp.jsx";
import { registerOfflineServiceWorker } from "./bayaan/registerOfflineServiceWorker";
import "./studio.css";
import "./exact-design/exact.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExactKioskApp />
  </StrictMode>,
);

registerOfflineServiceWorker();
