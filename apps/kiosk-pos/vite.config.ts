import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";

function resolveOdooTarget(env: Record<string, string>) {
  const configured = env.VITE_ODOO_TARGET ?? env.ODOO_URL;
  if (configured && configured !== "auto") return configured;

  const port = env.VITE_ODOO_PORT ?? "8069";
  if (process.platform === "win32") {
    try {
      const distro = env.VITE_ODOO_WSL_DISTRO ?? "Ubuntu";
      const output = execFileSync(
        "wsl.exe",
        ["-d", distro, "-e", "bash", "-lc", "hostname -I | awk '{print $1}'"],
        { encoding: "utf8", timeout: 3000 },
      );
      const host = output.trim().split(/\s+/)[0];
      if (host) return `http://${host}:${port}`;
    } catch {
      // Fall back to localhost for non-WSL or temporarily unavailable WSL setups.
    }
  }
  return `http://127.0.0.1:${port}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const odooTarget = resolveOdooTarget(env);

  return {
    plugins: [react()],
    server: {
      strictPort: true,
      proxy: {
        "/odoo": {
          target: odooTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/odoo/, ""),
        },
      },
    },
  };
});
