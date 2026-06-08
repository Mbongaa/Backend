import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      strictPort: true,
      // The repo lives on a Windows mount (/mnt/c) under WSL where inotify does not
      // fire, so native file watching misses edits and HMR silently serves stale code.
      // Polling makes the watcher reliable across the Windows/WSL boundary.
      watch: { usePolling: true, interval: 300 },
      proxy: {
        "/odoo": {
          target: odooTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          // Deep-reasoning AI calls can think for minutes with no bytes in between;
          // keep the dev proxy from cutting the SSE stream (6 min ceiling).
          proxyTimeout: 360_000,
          timeout: 360_000,
          rewrite: (path) => path.replace(/^\/odoo/, ""),
        },
      },
    },
  };
});
