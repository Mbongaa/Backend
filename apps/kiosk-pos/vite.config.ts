import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const odooTarget = process.env.VITE_ODOO_TARGET ?? process.env.ODOO_URL ?? "http://127.0.0.1:8069";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/odoo": {
        target: odooTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/odoo/, ""),
      },
    },
  },
});
