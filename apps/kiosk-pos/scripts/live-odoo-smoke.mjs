import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appUrl = process.env.KIOSK_POS_LIVE_URL ?? "http://127.0.0.1:5174";
const odooUrl = process.env.ODOO_URL ?? resolveLocalOdooUrl();
const odooDb = process.env.ODOO_DB ?? "bayaan";
const odooLogin = process.env.ODOO_LOGIN ?? "admin";
const odooPassword = process.env.ODOO_PASSWORD ?? "admin";
const serverUrl = new URL(appUrl);
const liveAppUrl = withQueryParam(appUrl, "odooUrl", "/odoo");
const appRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let cdpProcess;

async function main() {
  const sessionId = await authenticateOdoo();
  await ensureServer();

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1800, height: 980 } });
  await context.addCookies([{
    name: "session_id",
    value: sessionId,
    domain: serverUrl.hostname,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("fonts.googleapis.com") && !url.includes("fonts.gstatic.com")) {
      consoleErrors.push(`Request failed: ${url}`);
    }
  });

  try {
    await page.goto(liveAppUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForBodyIncludes(page, "Engine synced", 20_000);
    await assertNotVisible(page, "Demo mode");

    await nav(page, "Kiosks");
    await expectText(page, "Zayouna Plaza");
    await expectText(page, "K-04");

    await nav(page, "Sales & POS");
    await expectText(page, "Live POS orders");
    const streamMode = await waitForAnyText(page, ["Stream live", "Bus fallback"], 30_000);
    const sale = await postKioskSale(sessionId);
    await waitForBodyIncludes(page, sale.name || sale.external_id, 30_000);
    await waitForBodyIncludes(page, "IQD 4,000", 30_000);
    await waitForBodyIncludes(page, "paid", 30_000);

    await nav(page, "Daily Close");
    await expectText(page, "Zayouna Plaza");
    await page.locator("tr.row-click", { hasText: "Zayouna Plaza" }).first().click();
    await expectText(page, "Stock lines - expected vs counted");
    await expectText(page, "Notes and investigation status");

    await nav(page, "Reports");
    await expectText(page, "Iraqi gateway settlement");
    await expectText(page, "FIB");

    if (consoleErrors.length) {
      throw new Error(`Console/request errors: ${consoleErrors.join(" | ")}`);
    }

    console.log(JSON.stringify({
      ok: true,
      mode: "live-odoo",
      appUrl,
      odooUrl,
      verified: [
        "Odoo session auth",
        "Vite /odoo same-origin proxy",
        "chain_bootstrap live sync",
        "K-04 live kiosk",
        `realtime ${streamMode}: backend sale appeared without manual refresh`,
        "daily close stock/cash variance",
      ],
    }, null, 2));
  } finally {
    await browser.close();
    stopServer();
    stopCdpBrowser();
  }
}

function withQueryParam(url, key, value) {
  const target = new URL(url);
  target.searchParams.set(key, value);
  return target.toString();
}

function resolveLocalOdooUrl() {
  const port = process.env.ODOO_PORT ?? "8069";
  if (process.platform === "win32") {
    const distro = process.env.ODOO_WSL_DISTRO ?? "Ubuntu";
    const result = spawnSync("wsl.exe", ["-d", distro, "-e", "bash", "-lc", "hostname -I | awk '{print $1}'"], {
      encoding: "utf8",
      timeout: 3000,
    });
    const host = result.stdout?.trim().split(/\s+/)[0];
    if (host) return `http://${host}:${port}`;
  }
  return `http://127.0.0.1:${port}`;
}

async function authenticateOdoo() {
  const response = await fetch(`${odooUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db: odooDb, login: odooLogin, password: odooPassword },
      id: Date.now(),
    }),
  });
  if (!response.ok) throw new Error(`Odoo auth HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || payload.error.message || "Odoo auth failed");
  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(/session_id=([^;]+)/);
  if (!match) throw new Error("Odoo auth did not return a session_id cookie");
  return match[1];
}

async function postKioskSale(sessionId) {
  const externalId = `SMOKE-REALTIME-${Date.now()}`;
  const result = await odooJsonRpc("/bayaan/api/kiosk_sale", sessionId, {
    kiosk: "K-04",
    external_id: externalId,
    cashier: odooLogin,
    items: [{
      product: "MENU-CROISSANT",
      name: "Croissant Plain",
      qty: 1,
      price_unit: 4000.0,
    }],
    payments: [{ method: "cash", amount: 4000.0 }],
  });
  if (!result?.name && !result?.external_id) {
    throw new Error(`kiosk_sale did not return an order reference: ${JSON.stringify(result)}`);
  }
  return result;
}

async function odooJsonRpc(route, sessionId, payload) {
  const response = await fetch(`${odooUrl}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { payload },
      id: Date.now(),
    }),
  });
  if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
  const message = await response.json();
  if (message.error) throw new Error(message.error.data?.message || message.error.message || `${route} failed`);
  return message.result;
}

async function ensureServer() {
  if (await isReachable()) return;

  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx vite --host ${serverUrl.hostname} --port ${serverUrl.port} --strictPort`]
    : ["vite", "--host", serverUrl.hostname, "--port", serverUrl.port, "--strictPort"];
  server = spawn(command, args, {
    cwd: appRoot,
    stdio: "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      VITE_ODOO_URL: "/odoo",
      VITE_ODOO_TARGET: odooUrl,
    },
  });

  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  server.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await isReachable()) return;
    await delay(250);
  }
  throw new Error(`Vite live server did not become reachable at ${appUrl}\n${logs}`);
}

async function isReachable() {
  try {
    const response = await fetch(appUrl, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function nav(page, label) {
  await page.locator(".nav-item", { hasText: label }).first().click();
}

async function expectText(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function waitForBodyIncludes(page, text, timeout) {
  const started = Date.now();
  let bodyText = "";
  while (Date.now() - started < timeout) {
    bodyText = (await page.textContent("body")) || "";
    if (bodyText.includes(text)) return;
    await delay(300);
  }
  throw new Error(`Expected body to include "${text}". Body starts: ${bodyText.slice(0, 1200)}`);
}

async function waitForAnyText(page, texts, timeout) {
  const started = Date.now();
  let bodyText = "";
  while (Date.now() - started < timeout) {
    bodyText = (await page.textContent("body")) || "";
    const found = texts.find((text) => bodyText.includes(text));
    if (found) return found;
    await delay(300);
  }
  throw new Error(`Expected body to include one of "${texts.join(", ")}". Body starts: ${bodyText.slice(0, 1200)}`);
}

async function assertNotVisible(page, text) {
  const count = await page.getByText(text, { exact: true }).count();
  if (count) throw new Error(`Unexpected visible text: ${text}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServer() {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}

async function launchBrowser() {
  const candidates = [
    { label: "chromium default", options: { headless: true } },
    { label: "chromium channel=chrome", options: { headless: true, channel: "chrome" } },
    { label: "chromium channel=msedge", options: { headless: true, channel: "msedge" } },
  ];
  let lastError;
  let lastLaunchExe = null;
  for (const candidate of candidates) {
    try {
      return await chromium.launch(candidate.options);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      lastLaunchExe = extractLaunchingExe(message) ?? lastLaunchExe;
      const isSpawn = /spawn\s+(EPERM|EACCES)/i.test(message) || String(error?.code || "").toLowerCase().includes("eperm");
      if (!isSpawn) break;
    }
  }
  if (lastLaunchExe && process.platform === "win32") {
    return launchBrowserOverCdp(lastLaunchExe);
  }
  throw lastError || new Error("Unable to launch browser");
}

function extractLaunchingExe(message) {
  const cleaned = String(message || "").replace(/\u001b\[[0-9;]*m/g, "");
  const match = cleaned.match(/- <launching>\s+(.+?\.exe)\s/i);
  return match?.[1] || null;
}

async function launchBrowserOverCdp(executablePath) {
  const port = Number(process.env.KIOSK_POS_LIVE_CDP_PORT || 9223);
  const userDataDir = path.join(os.tmpdir(), `bayaan-live-cdp-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  stopCdpBrowser();
  cdpProcess = spawn(
    executablePath,
    [
      "--headless",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  const endpoint = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (cdpProcess.exitCode != null) {
      throw new Error(`CDP browser exited early with code ${cdpProcess.exitCode}`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(700) });
      if (response.ok) return chromium.connectOverCDP(endpoint);
    } catch {
      // Keep waiting.
    }
    await delay(200);
  }
  throw new Error(`CDP browser did not become reachable at ${endpoint}`);
}

function stopCdpBrowser() {
  if (!cdpProcess?.pid) return;
  try {
    spawnSync("taskkill", ["/pid", String(cdpProcess.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Ignore cleanup failure.
  }
  cdpProcess = null;
}

main().catch((error) => {
  stopServer();
  stopCdpBrowser();
  console.error(error);
  process.exit(1);
});
