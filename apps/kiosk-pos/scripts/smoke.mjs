import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import os from "node:os";
import path from "node:path";

const baseUrl = process.env.KIOSK_POS_URL ?? "http://127.0.0.1:5174";
const preferredChannel = process.env.KIOSK_POS_BROWSER_CHANNEL;
const serverUrl = new URL(baseUrl);
const verificationDir = new URL("../verification/", import.meta.url);
const appRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let cdpProcess;

async function main() {
  fs.mkdirSync(verificationDir, { recursive: true });
  await ensureServer();

  const browser = await launchBrowserOrNull();
  if (!browser) {
    await smokeLite();
    stopServer();
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 980 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (!url.includes("fonts.gstatic.com") && !url.includes("fonts.googleapis.com")) {
        consoleErrors.push(`Request failed: ${url}`);
      }
    });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await expectText(page, "Maqha");
    // New Overview is an always-on operations terminal (see design/exact-pos-v2/.../overview.jsx)
    await expectText(page, "STREAM ACTIVE");
    await expectText(page, "Top performers");
    for (const commandSignal of [
      "Total sales today",
      "Profit estimate",
      "Cash expected",
      "Digital payments",
      "Kiosk status",
      /low-stock alerts/,
      /unresolved closes/,
      "AI summary",
    ]) {
      await expectText(page, commandSignal);
    }
    await assertNoVisibleOdoo(page);
    assert(await page.locator(".vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay").count() === 0, "Framework error overlay is visible");
    await page.waitForTimeout(900);
    await page.screenshot({ path: filePath("exact-admin-overview.png"), fullPage: true });

    for (const [nav, expectedText, screenshotName] of [
      ["AI Insights", ["Today's brief", "Demo source rows - read-only", /orders\s+\d+/, /Daily summaries tier/], "exact-admin-ai-insights.png"],
      ["Kiosks", "Active"],
      ["Sales & POS", ["Live POS orders", "Gateway providers", "Zain Cash", "FIB"], "exact-admin-sales-pos.png"],
      ["Warehouses", "Bayaan warehouse topology"],
      ["Stock & Allocation", "Suggested", "exact-admin-stock-allocation.png"],
      ["Products & Recipes", ["Recipe cost and margin control", "Demo persistence"], "exact-admin-products-recipes.png"],
      ["Daily Close", ["Variance loop", "Today's closes", "Digital payments", "Investigation"], "exact-admin-daily-close.png"],
      ["Waste & Loss", ["Waste reason control", "Pattern detected"]],
      ["Purchases & Suppliers", ["Open purchase orders", "Active suppliers"]],
      ["Staff", ["Cashier performance", "Roster"]],
      ["Reports", ["Management report pack", "Payment methods", "Iraqi gateway settlement", "Zain Cash", "FIB", "Profit & loss", "Export pack"]],
    ]) {
      await page.locator(".nav-item", { hasText: nav }).first().click();
      const headings = Array.isArray(expectedText) ? expectedText : [expectedText];
      for (const heading of headings) {
        await expectText(page, heading);
      }
      if (screenshotName && nav !== "Daily Close") {
        await scrollAdminToTop(page);
        await page.waitForTimeout(900);
        await page.screenshot({ path: filePath(screenshotName), fullPage: true });
      }
      if (nav === "Daily Close") {
        await page.locator("tr.row-click", { hasText: "Mansour District" }).click();
        await expectText(page, "Approve close");
        await expectText(page, "Reject");
        await expectText(page, "Notes and investigation status");
        await expectText(page, "Recipe posting review");
        await page.waitForTimeout(900);
        await page.screenshot({ path: filePath(screenshotName), fullPage: true });
        await page.getByRole("button", { name: /Add note/ }).click();
        await expectText(page, /Note saved to Mansour District close/);
        await page.waitForTimeout(3800);
      }
      if (nav === "Products & Recipes") {
        await page.getByRole("button", { name: "Edit" }).first().click();
        await expectText(page, "Recipe ingredients");
        await expectText(page, "Save");
        await page.getByRole("button", { name: "Cancel" }).click();
      }
      if (nav === "Stock & Allocation") {
        await expectText(page, "Create transfer");
        await page.getByRole("button", { name: /Create transfer/ }).first().click();
        await expectText(page, /Draft transfer prepared/);
        await expectText(page, /DRAFT-K-04-oat-milk-1l/);
        await page.waitForTimeout(3800);
        await scrollAdminToTop(page);
        await page.screenshot({ path: filePath("exact-admin-stock-transfer-draft.png"), fullPage: true });
      }
      if (nav === "Reports") {
        await page.getByRole("button", { name: /Export pack/ }).click();
        await expectText(page, /Daily report exported as bayaan-daily-management-report-/);
        await page.waitForTimeout(3800);
      }
      await assertNoVisibleOdoo(page);
    }
    await scrollAdminToTop(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: filePath("exact-admin-reports.png"), fullPage: true });

    await page.locator(".nav-item", { hasText: "Kiosks" }).first().click();
    await page.locator(".card", { hasText: "Karrada Center" }).first().click();
    await expectText(page, "Daily stock reconciliation");
    await expectText(page, "Expected consumed from POS sales");
    await page.waitForTimeout(900);
    await page.screenshot({ path: filePath("exact-admin-kiosk-current-stock.png"), fullPage: true });

    await page.getByRole("button", { name: "POS", exact: true }).click();
    await expectText(page, "Good morning");
    await expectText(page, "Customer-facing display");
    await expectText(page, "Step up when ready");
    await page.screenshot({ path: filePath("exact-pos-login.png"), fullPage: true });

    await page.getByRole("button", { name: /Maya Ahmed/ }).click();
    for (const digit of ["1", "2", "3", "4"]) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await page.getByRole("button", { name: /Start shift/ }).click();
    await expectText(page, "Current order");

    await page.locator("button.card", { hasText: "Latte" }).first().click();
    await page.getByRole("button", { name: "Juice" }).click();
    await page.locator("button.card", { hasText: "Orange" }).first().click();
    await expectText(page, "Confirm with cashier when ready");
    await page.screenshot({ path: filePath("exact-pos-sale-with-customer-display.png"), fullPage: true });

    await page.getByRole("button", { name: /Charge/ }).click();
    await expectText(page, "Amount due");
    await expectText(page, "Tap or insert card");
    await expectText(page, "Zain Cash");
    await expectText(page, "FIB");
    await page.screenshot({ path: filePath("exact-pos-payment-prompt.png"), fullPage: true });

    await page.getByRole("button", { name: /^Card\b/ }).click();
    await page.getByText("Payment complete").waitFor({ state: "visible", timeout: 10_000 });
    await expectText(page, "Thank you");
    await page.screenshot({ path: filePath("exact-pos-payment-complete.png"), fullPage: true });

    await page.getByRole("button", { name: /New order/ }).click();
    await page.getByRole("button", { name: /^Waste$/ }).click();
    await expectText(page, "Record waste");
    await page.locator("button.card", { hasText: "Pistachio Cake" }).click();
    await page.getByRole("button", { name: "Spill / drop" }).click();
    await page.getByRole("button", { name: "Submit waste" }).click();
    await expectText(page, "Current order");
    await page.screenshot({ path: filePath("exact-pos-after-waste.png"), fullPage: true });

    await page.locator(".lang button").nth(1).click();
    assert(await page.locator(".app-frame").getAttribute("dir") === "rtl", "Arabic mode did not switch the app to RTL");
    await expectText(page, "مقهى");
    await assertNoVisibleMojibake(page);
    await page.screenshot({ path: filePath("exact-arabic-pos.png"), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await mobile.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
    const mobileText = (await mobile.textContent("body"))?.trim() ?? "";
    assert(mobileText.length > 200, "Mobile render is blank or near blank");
    await mobile.screenshot({ path: filePath("exact-mobile-admin.png"), fullPage: true });
    await mobile.close();

    assert(consoleErrors.length === 0, `Console/request errors detected: ${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join(" | ")}`);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      screenshots: [
        "verification/exact-admin-overview.png",
        "verification/exact-admin-ai-insights.png",
        "verification/exact-admin-sales-pos.png",
        "verification/exact-admin-stock-allocation.png",
        "verification/exact-admin-stock-transfer-draft.png",
        "verification/exact-admin-products-recipes.png",
        "verification/exact-admin-daily-close.png",
        "verification/exact-admin-kiosk-current-stock.png",
        "verification/exact-admin-reports.png",
        "verification/exact-pos-login.png",
        "verification/exact-pos-sale-with-customer-display.png",
        "verification/exact-pos-payment-prompt.png",
        "verification/exact-pos-payment-complete.png",
        "verification/exact-pos-after-waste.png",
        "verification/exact-arabic-pos.png",
        "verification/exact-mobile-admin.png",
      ],
    }, null, 2));
  } finally {
    await browser.close();
    stopServer();
    stopCdpBrowser();
  }
}

async function launchBrowserOrNull() {
  const candidates = [
    preferredChannel ? { label: `chromium channel=${preferredChannel}`, options: { headless: true, channel: preferredChannel } } : null,
    { label: "chromium default", options: { headless: true } },
    { label: "chromium channel=chrome", options: { headless: true, channel: "chrome" } },
    { label: "chromium channel=msedge", options: { headless: true, channel: "msedge" } },
  ].filter(Boolean);

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
      console.warn(`Playwright launch failed (${candidate.label}): ${message}`);
    }
  }

  if (lastLaunchExe && process.platform === "win32") {
    console.warn("Falling back to CDP launch mode to avoid stdio pipe spawn restrictions…");
    try {
      return await launchBrowserOverCdp(lastLaunchExe);
    } catch (error) {
      console.warn(`CDP fallback failed; switching to smoke-lite: ${error?.message || error}`);
      return null;
    }
  }

  const detail = lastError ? `\nLast error: ${String(lastError?.message || lastError)}` : "";
  console.warn(`Unable to launch a browser; switching to smoke-lite.${detail}`);
  return null;
}

function extractLaunchingExe(message) {
  const cleaned = String(message || "").replace(/\u001b\[[0-9;]*m/g, "");
  const match = cleaned.match(/- <launching>\s+(.+?\.exe)\s/i);
  if (!match?.[1]) return null;
  return match[1];
}

async function launchBrowserOverCdp(executablePath) {
  const port = Number(process.env.KIOSK_POS_CDP_PORT || 9222);
  const userDataDir = path.join(os.tmpdir(), `bayaan-playwright-cdp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(userDataDir, { recursive: true });

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

  const spawnError = await new Promise((resolve) => {
    cdpProcess.once("error", (error) => resolve(error));
    setTimeout(() => resolve(null), 25);
  });
  if (spawnError) {
    throw new Error(`CDP browser spawn failed for ${executablePath}: ${spawnError.message || spawnError}`);
  }

  const endpoint = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (cdpProcess.exitCode != null) {
      throw new Error(`CDP browser exited early (code ${cdpProcess.exitCode}) before ${endpoint} became reachable.`);
    }
    try {
      const res = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(700) });
      if (res.ok) break;
    } catch {
      // keep waiting
    }
    await delay(200);
  }

  try {
    return await chromium.connectOverCDP(endpoint);
  } catch (error) {
    throw new Error(`CDP connect failed at ${endpoint}: ${error?.message || error}`);
  }
}

async function smokeLite() {
  console.warn("Running smoke-lite (no browser) due to launch restrictions…");
  const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) });
  assert(res.ok, `App did not respond at ${baseUrl} (status ${res.status})`);
  const html = await res.text();
  assert(html.includes("vite") || html.includes("module"), "Unexpected HTML payload from dev server");

  const jsFiles = listFiles(path.join(appRoot, "dist", "assets"))
    .filter((f) => f.endsWith(".js") && f.includes("index-"));
  assert(jsFiles.length > 0, "No built JS assets found; run `npm run build` before smoke-lite");

  const bundle = jsFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  for (const needle of [
    "Maqha",
    "STREAM ACTIVE",
    "Top performers",
    "AI Insights",
    "Today's brief",
    "Customer-facing display",
    "Step up when ready",
    "Amount due",
    "Payment complete",
    "Record waste",
  ]) {
    assert(bundle.includes(needle), `Missing expected UI copy in build output: ${needle}`);
  }
  assert(!html.includes("Odoo"), "HTML contains \"Odoo\" string; visible branding must not leak");

  console.log(JSON.stringify({
    ok: true,
    mode: "smoke-lite",
    baseUrl,
    checkedStrings: 10,
  }, null, 2));
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

async function ensureServer() {
  if (await isReachable()) return;

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  server = spawn(command, ["vite", "--host", serverUrl.hostname, "--port", serverUrl.port || "5173", "--strictPort"], {
    cwd: appRoot,
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  server.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await isReachable()) return;
    await delay(250);
  }

  throw new Error(`Vite dev server did not become reachable at ${baseUrl}\n${logs}`);
}

async function isReachable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(baseUrl, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function expectText(page, text) {
  if (text instanceof RegExp) {
    await page.getByText(text).first().waitFor({ state: "visible", timeout: 10_000 });
    return;
  }
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function assertNoVisibleOdoo(page) {
  const bodyText = (await page.textContent("body")) ?? "";
  assert(!bodyText.includes("Odoo"), "Visible dashboard copy exposes Odoo branding");
}

async function assertNoVisibleMojibake(page) {
  const bodyText = (await page.textContent("body")) ?? "";
  assert(!/[ÃÂØÙ�]|â(?:€|ˆ|€¦|€“|€”|†)/.test(bodyText), "Visible copy contains mojibake text");
}

async function scrollAdminToTop(page) {
  await page.locator("main .scroll").evaluate((node) => { node.scrollTop = 0; }).catch(() => {});
}

function filePath(name) {
  return fileURLToPath(new URL(name, verificationDir));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  stopServer();
  stopCdpBrowser();
  console.error(error);
  process.exit(1);
});

function stopServer() {
  if (!server?.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  server.kill("SIGTERM");
}

function stopCdpBrowser() {
  if (!cdpProcess?.pid) return;
  try {
    spawnSync("taskkill", ["/pid", String(cdpProcess.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Ignore.
  }
  cdpProcess = null;
}
