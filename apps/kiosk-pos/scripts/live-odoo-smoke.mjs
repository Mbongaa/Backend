import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const requestedAppUrl = process.env.KIOSK_POS_LIVE_URL ?? "http://127.0.0.1:5174";
const odooUrl = process.env.ODOO_URL ?? resolveLocalOdooUrl();
const odooDb = process.env.ODOO_DB ?? "bayaan";
const odooLogin = process.env.ODOO_LOGIN ?? "admin";
const odooPassword = process.env.ODOO_PASSWORD ?? "admin";
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const verificationDir = path.join(appRoot, "verification");
let appUrl = requestedAppUrl;
let serverUrl = new URL(appUrl);
let liveAppUrl = withQueryParam(appUrl, "odooUrl", "/odoo");
let server;
let cdpProcess;

async function main() {
  await ensureOdooReachable();
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
  const screenshots = [];
  collectPageDiagnostics(page, consoleErrors);

  try {
    await page.goto(liveAppUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForBodyIncludes(page, "Engine synced", 20_000);
    await assertNotVisible(page, "Demo mode");
    const aiResult = await verifyLiveAiDashboard(page, sessionId, screenshots);

    await nav(page, "Kiosks");
    await expectText(page, "Karrada Center");
    await expectText(page, "K-01");

    await nav(page, "Sales & POS");
    await expectText(page, "Source POS orders");
    const streamMode = await waitForAnyText(page, ["Stream live", "Bus fallback"], 30_000);
    const bootstrap = await readLiveBootstrap(sessionId);
    const saleItem = pickLiveSaleItem(bootstrap);
    const sale = await postKioskSale(sessionId, saleItem);
    await waitForBodyIncludes(page, sale.name || sale.external_id, 30_000);
    await waitForBodyIncludes(page, formatIqd(saleItem.amount), 30_000);
    await waitForBodyIncludes(page, "paid", 30_000);
    await capture(page, "live-odoo-sales-pos", screenshots);

    const transferItem = pickLiveTransferItem(bootstrap);

    await nav(page, "Stock & Allocation");
    await expectText(page, "Warehouse transfers");
    const transfer = await postStockTransfer(sessionId, transferItem);
    await waitForBodyIncludes(page, transfer.name, 30_000);
    await dispatchStockTransfer(sessionId, transfer.name);
    await waitForBodyIncludes(page, "dispatched", 30_000);
    await capture(page, "live-odoo-stock-transfer-dispatched", screenshots);
    await receiveStockTransfer(sessionId, transfer.name);
    await waitForBodyIncludes(page, "received", 30_000);
    await capture(page, "live-odoo-stock-transfer-received", screenshots);

    await nav(page, "Purchases & Suppliers");
    await waitForBodyIncludes(page, "Purchases & Suppliers", 10_000);
    const purchase = await postPurchaseOrder(sessionId, transferItem);
    await waitForBodyIncludes(page, purchase.name, 30_000);
    await receivePurchaseOrder(sessionId, purchase.name);
    await waitForBodyIncludes(page, "received", 30_000);
    await capture(page, "live-odoo-purchase-received", screenshots);

    await nav(page, "Waste & Loss");
    await waitForBodyIncludes(page, "Waste entries", 10_000);
    const waste = await postWaste(sessionId, saleItem);
    await waitForBodyIncludes(page, waste.reason, 30_000);
    await waitForBodyIncludes(page, "K-01", 30_000);
    await capture(page, "live-odoo-waste-posted", screenshots);

    await nav(page, "Daily Close");
    const close = await postShiftClose(sessionId, sale, saleItem);
    await waitForBodyIncludes(page, "Karrada Center", 30_000);
    await openCloseById(page, close.id);
    await expectText(page, "Stock lines - expected vs counted");
    await expectText(page, "Notes and investigation status");
    await reviewShiftClose(sessionId, close.id);
    await waitForBodyIncludes(page, "Approved by", 30_000);
    await capture(page, "live-odoo-shift-close-approved", screenshots);

    await nav(page, "Reports");
    await expectText(page, "Payment methods");
    await expectText(page, "Cash flow");
    await capture(page, "live-odoo-reports", screenshots);

    const fallbackSale = await verifyBusFallbackRealtime(context, sessionId, consoleErrors, screenshots, saleItem);
    const websocketCloseSale = await verifyWebSocketCloseFallbackRealtime(context, sessionId, consoleErrors, screenshots, saleItem);

    // Tie-preserving cleanup: the two realtime-fallback sales above were created AFTER the
    // shift close, so they sit in a fresh open session with no Z-report move. Close that
    // session through the official path so the live ledger ties after the smoke run
    // (a verification run must not leave the books untied).
    await closeFallbackSession(sessionId, [fallbackSale, websocketCloseSale], saleItem);

    if (consoleErrors.length) {
      throw new Error(`Console/request errors: ${consoleErrors.join(" | ")}`);
    }

    console.log(JSON.stringify({
      ok: true,
      mode: "live-odoo",
      appUrl,
      odooUrl,
      screenshots,
      verified: [
        "Odoo session auth",
        "Vite /odoo same-origin proxy",
        "chain_bootstrap live sync",
        `AI dashboard provider call: ${aiResult.llm.model} / ${aiResult.llm.responseId}`,
        "AI Insights live chat shows runtime, claim proof, source evidence, and model-authored visualizations",
        "K-01 live kiosk",
        `realtime ${streamMode}: backend sale appeared without manual refresh`,
        "realtime stock transfer appeared without manual refresh",
        "realtime stock transfer receive appeared without manual refresh",
        "realtime purchase receiving appeared without manual refresh",
        "realtime waste appeared without manual refresh",
        "realtime shift close appeared without manual refresh",
        "realtime manager close review appeared without manual refresh",
        `forced Odoo bus fallback sale appeared without manual refresh: ${fallbackSale.name || fallbackSale.external_id}`,
        `browser WebSocket close fallback sale appeared without manual refresh: ${websocketCloseSale.name || websocketCloseSale.external_id}`,
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

function setAppUrl(nextUrl) {
  appUrl = nextUrl;
  serverUrl = new URL(appUrl);
  liveAppUrl = withQueryParam(appUrl, "odooUrl", "/odoo");
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
  let response;
  try {
    response = await fetch(`${odooUrl}/web/session/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { db: odooDb, login: odooLogin, password: odooPassword },
        id: Date.now(),
      }),
    });
  } catch (error) {
    throw new Error(`Live Odoo smoke blocked: could not authenticate against ${odooUrl}. ${formatFetchCause(error)}`);
  }
  if (!response.ok) throw new Error(`Odoo auth HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || payload.error.message || "Odoo auth failed");
  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(/session_id=([^;]+)/);
  if (!match) throw new Error("Odoo auth did not return a session_id cookie");
  return match[1];
}

function pickLiveSaleItem(bootstrap) {
  const products = Array.isArray(bootstrap?.products) ? bootstrap.products : [];
  const eligible = (product) => product
    && product.available_in_pos !== false
    && product.default_code
    && Number(product.list_price || 0) > 0;
  const preferredCodes = ["MENU-CROISSANT-PLAIN", "MENU-ESPRESSO", "MENU-LATTE"];
  const product = preferredCodes
    .map((code) => products.find((row) => String(row.default_code || "").toUpperCase() === code))
    .find(eligible)
    || products.find(eligible);
  if (!product) {
    throw new Error("Live bootstrap did not include a POS product with a positive price for kiosk_sale smoke.");
  }
  const amount = Number(product.list_price);
  return {
    product: String(product.default_code),
    name: String(product.name || product.default_code),
    priceUnit: amount,
    amount,
  };
}

function formatIqd(amount) {
  return `IQD ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(amount || 0)))}`;
}

async function postKioskSale(sessionId, saleItem, prefix = "SMOKE-REALTIME") {
  const externalId = `${prefix}-${Date.now()}`;
  const result = await odooJsonRpc("/bayaan/api/kiosk_sale", sessionId, {
    kiosk: "K-01",
    external_id: externalId,
    cashier: odooLogin,
    items: [{
      product: saleItem.product,
      name: saleItem.name,
      qty: 1,
      price_unit: saleItem.priceUnit,
    }],
    payments: [{ method: "cash", amount: saleItem.amount }],
  });
  if (!result?.name && !result?.external_id) {
    throw new Error(`kiosk_sale did not return an order reference: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyLiveAiDashboard(page, sessionId, screenshots) {
  const aiQuery = "Tell me about how much cash and online payments we had today, and visualize the split.";
  const result = await odooJsonRpc("/bayaan/api/ai_dashboard_plan", sessionId, {
    query: aiQuery,
    locale: "en",
    scope: { sectionId: "insights", timeRange: "today" },
  });
  if (result?.llm?.status !== "llm_called") {
    throw new Error(`AI dashboard live smoke requires llm_called, got ${JSON.stringify(result?.llm || result)}`);
  }
  if (!result.llm.responseId) {
    throw new Error(`AI dashboard live smoke did not receive an OpenAI response id: ${JSON.stringify(result.llm)}`);
  }
  if (!Array.isArray(result.sourceEvidence) || result.sourceEvidence.length === 0) {
    throw new Error("AI dashboard live smoke did not receive source evidence.");
  }
  if (!Array.isArray(result.claims) || result.claims.length === 0) {
    throw new Error("AI dashboard live smoke did not receive claim-level numeric evidence.");
  }
  if (!Array.isArray(result.visualizations) || result.visualizations.length === 0) {
    throw new Error("AI dashboard live smoke did not receive model-authored visualizations.");
  }
  if (/api[_-]?key|authorization|bearer\s+/i.test(JSON.stringify(result))) {
    throw new Error("AI dashboard response appears to expose provider credentials.");
  }

  await nav(page, "AI Insights");
  await waitForBodyIncludes(page, "assistant-ui", 10_000);
  const input = page.locator(".assistant-thread-input");
  await input.fill(aiQuery);
  await input.press("Enter");
  await waitForBodyIncludes(page, "AI runtime", 30_000);
  await waitForBodyIncludes(page, "llm_called", 30_000);
  await waitForBodyIncludes(page, "Claim proof", 30_000);
  await waitForBodyIncludes(page, "Source evidence", 30_000);
  await page.locator(".ai-agent-visual-card").first().waitFor({ state: "visible", timeout: 30_000 });
  const artifactChip = page.locator(".assistant-thread-artifact-chip:not(.is-loading)").first();
  await artifactChip.waitFor({ state: "visible", timeout: 30_000 });
  await artifactChip.click();
  const chatColumn = page.locator(".bayaan-assistant-chat-column").first();
  const artifactPane = page.locator(".bayaan-assistant-artifact-pane").first();
  await artifactPane.waitFor({ state: "visible", timeout: 30_000 });
  const [chatBox, artifactBox] = await Promise.all([
    chatColumn.boundingBox(),
    artifactPane.boundingBox(),
  ]);
  if (!chatBox || !artifactBox || artifactBox.x <= chatBox.x) {
    throw new Error(`AI artifact canvas must open to the right of the chat column; chat=${JSON.stringify(chatBox)} artifact=${JSON.stringify(artifactBox)}`);
  }
  await waitForBodyIncludes(page, "numeric refs", 30_000);
  await page.waitForTimeout(1200);
  await capture(page, "live-odoo-ai-insights", screenshots);
  return result;
}

async function readLiveBootstrap(sessionId) {
  return odooJsonRpc("/bayaan/api/chain_bootstrap", sessionId, {});
}

function pickLiveTransferItem(bootstrap) {
  const stockRows = Array.isArray(bootstrap?.warehouse_stock) ? bootstrap.warehouse_stock : [];
  const preferred = stockRows.find((row) => String(row.item || "").toUpperCase() === "CUP-12OZ")
    || stockRows.find((row) => Number(row.actual_qty ?? row.qty ?? 0) > 0 && row.item)
    || stockRows.find((row) => row.item);
  return preferred?.item || "CUP-12OZ";
}

async function postStockTransfer(sessionId, item) {
  const origin = `BAYAAN-LIVE-SMOKE-${Date.now()}`;
  const result = await odooJsonRpc("/bayaan/api/stock_transfer", sessionId, {
    kiosk: "K-01",
    item,
    qty: 1,
    origin,
  });
  if (!result?.name) {
    throw new Error(`stock_transfer did not return a transfer reference: ${JSON.stringify(result)}`);
  }
  if (result.origin !== origin) {
    throw new Error(`stock_transfer did not preserve smoke origin ${origin}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function dispatchStockTransfer(sessionId, transferName) {
  const result = await odooJsonRpc("/bayaan/api/stock_transfer_action", sessionId, {
    transfer: transferName,
    action: "dispatch",
  });
  if (String(result?.bayaan_state || "").toLowerCase() !== "dispatched") {
    throw new Error(`stock_transfer_action did not dispatch ${transferName}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function receiveStockTransfer(sessionId, transferName) {
  const result = await odooJsonRpc("/bayaan/api/stock_transfer_action", sessionId, {
    transfer: transferName,
    action: "receive",
  });
  if (String(result?.bayaan_state || "").toLowerCase() !== "received") {
    throw new Error(`stock_transfer_action did not receive ${transferName}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function postPurchaseOrder(sessionId, item) {
  const result = await odooJsonRpc("/bayaan/api/purchase_order", sessionId, {
    supplier: "Live Smoke Supplier",
    items: [{
      item,
      qty: 1,
      rate: 1,
    }],
  });
  if (!result?.name) {
    throw new Error(`purchase_order did not return an order reference: ${JSON.stringify(result)}`);
  }
  return result;
}

async function receivePurchaseOrder(sessionId, poName) {
  const result = await odooJsonRpc("/bayaan/api/purchase_order_action", sessionId, {
    po: poName,
    action: "receive",
  });
  if (!["done", "received"].includes(String(result?.receipt_state || result?.state || "").toLowerCase())) {
    throw new Error(`purchase_order_action did not receive ${poName}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function postWaste(sessionId, saleItem) {
  const reason = `live smoke waste ${Date.now()}`;
  const result = await odooJsonRpc("/bayaan/api/waste", sessionId, {
    kiosk: "K-01",
    item: saleItem.product,
    name: saleItem.name,
    qty: 1,
    reason,
  });
  if (result?.state !== "posted") {
    throw new Error(`waste did not post: ${JSON.stringify(result)}`);
  }
  return { ...result, reason };
}

// A clean ingredient count for a kiosk: counted == current on-hand qty, which equals
// `expected` in the close math (expected = current_qty), so the close posts ~0 ingredient
// variance instead of an alarming full-stock loss (counted defaults to 0 when omitted).
async function cleanIngredientCounts(sessionId, kiosk = "K-01") {
  try {
    const bootstrap = await readLiveBootstrap(sessionId);
    return (bootstrap?.kiosk_stock_rows || [])
      .filter((row) => row.kiosk === kiosk && row.item)
      .map((row) => ({ ingredient: row.item, actual_qty: Number(row.actual_qty || 0) }));
  } catch {
    return [];
  }
}

async function postShiftClose(sessionId, sale, saleItem) {
  const cashAmount = Number(sale?.amount_total || saleItem.amount || 0);
  const result = await odooJsonRpc("/bayaan/api/shift_close", sessionId, {
    kiosk: "K-01",
    opened_at: odooDateTime(new Date(Date.now() - 10 * 60 * 1000)),
    expected_cash: cashAmount,
    actual_cash: cashAmount,
    pos_invoices: [sale.name],
    // Clean ingredient count → ~0 variance (the close no longer books a full-stock loss).
    ingredient_counts: await cleanIngredientCounts(sessionId),
    // A single stock-count line so the "Stock lines - expected vs counted" review section renders.
    stock_counts: [{
      item: saleItem.product,
      expected_qty: 0.0,
      actual_qty: 0.0,
    }],
  });
  if (!result?.id) {
    throw new Error(`shift_close did not return a close id: ${JSON.stringify(result)}`);
  }
  return result;
}

async function closeFallbackSession(sessionId, sales, saleItem) {
  const names = sales.map((sale) => sale && sale.name).filter(Boolean);
  if (!names.length) return null;
  const cash = names.length * Number(saleItem.amount || 0);
  const result = await odooJsonRpc("/bayaan/api/shift_close", sessionId, {
    kiosk: "K-01",
    opened_at: odooDateTime(new Date(Date.now() - 10 * 60 * 1000)),
    expected_cash: cash,
    actual_cash: cash,
    pos_invoices: names,
    // Clean ingredient count → the cleanup close posts ~0 variance, not a full-stock loss.
    ingredient_counts: await cleanIngredientCounts(sessionId),
  });
  if (!result?.id) {
    throw new Error(`fallback-session cleanup close did not return an id: ${JSON.stringify(result)}`);
  }
  return result;
}

async function reviewShiftClose(sessionId, closeId) {
  const result = await odooJsonRpc("/bayaan/api/shift_close_review", sessionId, {
    close_id: closeId,
    decision: "approved",
    note: "Approved by live smoke manager review.",
  });
  if (result?.managerReviewState !== "approved") {
    throw new Error(`shift_close_review did not approve ${closeId}: ${JSON.stringify(result)}`);
  }
  return result;
}

function odooDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function odooJsonRpc(route, sessionId, payload) {
  let response;
  try {
    response = await fetch(`${odooUrl}${route}`, {
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
  } catch (error) {
    throw new Error(`Live Odoo smoke blocked: ${route} could not reach ${odooUrl}. ${formatFetchCause(error)}`);
  }
  if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
  const message = await response.json();
  if (message.error) throw new Error(message.error.data?.message || message.error.message || `${route} failed`);
  return message.result;
}

async function ensureOdooReachable() {
  try {
    const response = await fetch(`${odooUrl}/web/login`, { signal: AbortSignal.timeout(2500) });
    if (response.ok || response.status === 303 || response.status === 302) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `Live Odoo smoke blocked: Odoo is not reachable at ${odooUrl}. ` +
      `Start Odoo for database ${odooDb} or set ODOO_URL/ODOO_PORT before running npm run smoke:live. ` +
      formatFetchCause(error),
    );
  }
}

async function ensureServer() {
  if (await isLiveServerReachable(appUrl)) return;
  if (await isReachable(appUrl)) {
    if (process.env.KIOSK_POS_LIVE_URL) {
      throw new Error(`${appUrl} is reachable but its /odoo proxy is not. Restart that server with VITE_ODOO_URL=/odoo and VITE_ODOO_TARGET=${odooUrl}.`);
    }
    setAppUrl(await findFallbackAppUrl());
  }

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
    if (await isLiveServerReachable(appUrl)) return;
    await delay(250);
  }
  throw new Error(`Vite live server did not become reachable at ${appUrl}\n${logs}`);
}

async function findFallbackAppUrl() {
  const host = serverUrl.hostname;
  for (let port = 5175; port < 5195; port += 1) {
    const candidate = `http://${host}:${port}`;
    if (!(await isReachable(candidate))) return candidate;
  }
  throw new Error(`No free fallback Vite port found for live smoke while ${requestedAppUrl} is already occupied.`);
}

async function isLiveServerReachable(url) {
  return (await isReachable(url)) && (await isOdooProxyReachable(url));
}

async function isReachable(url = appUrl) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function isOdooProxyReachable(url = appUrl) {
  try {
    const response = await fetch(`${url}/odoo/web/login`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function formatFetchCause(error) {
  const cause = error?.cause || error;
  const parts = [];
  if (cause?.code) parts.push(`code=${cause.code}`);
  if (cause?.address) parts.push(`address=${cause.address}`);
  if (cause?.port) parts.push(`port=${cause.port}`);
  const message = cause?.message || error?.message || String(error);
  parts.push(`message=${message}`);
  return `Cause: ${parts.join(" ")}`;
}

async function verifyBusFallbackRealtime(context, sessionId, consoleErrors, screenshots, saleItem) {
  const page = await context.newPage();
  collectPageDiagnostics(page, consoleErrors);
  try {
    await page.goto(withQueryParam(liveAppUrl, "bayaanRealtime", "polling"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForBodyIncludes(page, "Engine synced", 20_000);
    await nav(page, "Sales & POS");
    await waitForBodyIncludes(page, "Bus fallback", 30_000);
    const sale = await postKioskSale(sessionId, saleItem, "SMOKE-BUS-FALLBACK");
    await waitForBodyIncludes(page, sale.name || sale.external_id, 30_000);
    await waitForBodyIncludes(page, formatIqd(saleItem.amount), 30_000);
    await waitForBodyIncludes(page, "paid", 30_000);
    await capture(page, "live-odoo-bus-fallback-sale", screenshots);
    return sale;
  } finally {
    await page.close();
  }
}

async function verifyWebSocketCloseFallbackRealtime(context, sessionId, consoleErrors, screenshots, saleItem) {
  const page = await context.newPage();
  collectPageDiagnostics(page, consoleErrors);
  if (typeof page.routeWebSocket !== "function") {
    await page.close();
    throw new Error("Installed Playwright does not support page.routeWebSocket for browser-level realtime fallback smoke.");
  }
  await page.routeWebSocket("**/odoo/websocket**", (socket) => {
    if (typeof socket.close !== "function") {
      throw new Error("Playwright WebSocket route cannot close the intercepted Odoo websocket.");
    }
    socket.close();
  });
  try {
    await page.goto(liveAppUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForBodyIncludes(page, "Engine synced", 20_000);
    await nav(page, "Sales & POS");
    await waitForBodyIncludes(page, "Bus fallback", 30_000);
    const sale = await postKioskSale(sessionId, saleItem, "SMOKE-WS-CLOSE");
    await waitForBodyIncludes(page, sale.name || sale.external_id, 30_000);
    await waitForBodyIncludes(page, formatIqd(saleItem.amount), 30_000);
    await waitForBodyIncludes(page, "paid", 30_000);
    await capture(page, "live-odoo-websocket-close-fallback-sale", screenshots);
    return sale;
  } finally {
    await page.close();
  }
}

async function capture(page, name, screenshots) {
  await mkdir(verificationDir, { recursive: true });
  const filename = `verification/${name}.png`;
  await page.screenshot({
    path: path.join(appRoot, filename),
    fullPage: true,
  });
  screenshots.push(filename);
}

function collectPageDiagnostics(page, consoleErrors) {
  // Transient environmental network/DNS failures (e.g. a font/icon CDN that didn't resolve
  // this run) are echoed to the console WITHOUT a URL, so ignore them by error code. Real
  // broken app assets still surface via the requestfailed (URL) handler below.
  const transientNet = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_NETWORK_CHANGED|ERR_TIMED_OUT/;
  page.on("console", (message) => {
    if (message.type() === "error" && !transientNet.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("fonts.googleapis.com") && !url.includes("fonts.gstatic.com")) {
      consoleErrors.push(`Request failed: ${url}`);
    }
  });
}

async function nav(page, label) {
  const navItem = page.locator(".nav-item", { hasText: label }).first();
  if (await navItem.isVisible({ timeout: 500 }).catch(() => false)) {
    await navItem.click();
    return;
  }
  const section = adminSectionId(label);
  if (!section) throw new Error(`No admin section mapping for ${label}`);
  const changed = await page.evaluate((nextSection) => {
    if (typeof window.__bayaanSetAdminSection !== "function") return false;
    window.__bayaanSetAdminSection(nextSection);
    return true;
  }, section);
  if (!changed) throw new Error(`Admin navigation helper was not available for ${label}`);
}

function adminSectionId(label) {
  return {
    "AI Insights": "insights",
    "Kiosks": "kiosks",
    "Daily Close": "closing",
    "Reports": "reports",
  }[label];
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

async function openCloseById(page, closeId) {
  const expected = `Close id: ${closeId}`;
  const started = Date.now();
  let bodyText = "";
  while (Date.now() - started < 30_000) {
    const rows = page.locator("tr.row-click", { hasText: "Karrada Center" });
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      await rows.nth(index).click();
      await delay(250);
      bodyText = (await page.textContent("body")) || "";
      if (bodyText.includes(expected)) return;
    }
    await delay(500);
  }
  throw new Error(`Expected body to include "${expected}". Body starts: ${bodyText.slice(0, 1200)}`);
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
      // Always fall through to the next candidate. A missing bundled Chromium
      // ("Executable doesn't exist … run npx playwright install") is NOT a spawn error,
      // so an early break here would skip the system Chrome/Edge channels entirely — the
      // exact reason a machine without bundled Chromium failed the smoke. Try them all;
      // the win32 CDP fallback below handles spawn EPERM after every candidate.
    }
  }
  if (lastLaunchExe && process.platform === "win32") {
    return launchBrowserOverCdp(lastLaunchExe);
  }
  throw lastError || new Error("Unable to launch browser (no bundled Chromium and no system Chrome/Edge found).");
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
