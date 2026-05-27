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
    await page.addInitScript(() => {
      window.localStorage.setItem("bayaan.mode.v1", "demo");
      window.localStorage.setItem("bayaan.kiosk.v1", "K-01");
    });
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // The sandboxed Codex environment blocks outbound network access, so the
      // Google Fonts loads in index.html/styles.css can surface as generic
      // ERR_NETWORK_ACCESS_DENIED console errors. Ignore those so the smoke
      // suite continues to enforce app-level errors while staying offline-safe.
      if (text.includes("ERR_NETWORK_ACCESS_DENIED")) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (!url.includes("fonts.gstatic.com") && !url.includes("fonts.googleapis.com")) {
        consoleErrors.push(`Request failed: ${url}`);
      }
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      if (!url.includes("fonts.gstatic.com") && !url.includes("fonts.googleapis.com")) {
        consoleErrors.push(`HTTP ${response.status()}: ${url}`);
      }
    });

    // Realtime/bootstrap requests can keep the browser from reaching networkidle.
    // The visible text/image assertions below are the app readiness check.
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expectLoadedImage(page, '.master-top img[src="/brand/miza-logo.png"]');
    await expectText(page, "- operations");
    // The BayaanProvider mode badge — Demo by default when no VITE_ODOO_URL is set.
    await expectText(page, "Demo mode");
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
    await page.getByRole("button", { name: "Dark theme" }).click();
    assert(await page.locator(".app-frame").getAttribute("data-theme") === "dark", "Dark theme did not apply to the app frame");
    await expectText(page, "STREAM ACTIVE");
    await page.waitForTimeout(900);
    await page.screenshot({ path: filePath("exact-admin-overview-dark.png"), fullPage: true });
    await page.getByRole("button", { name: "Light theme" }).click();
    assert(await page.locator(".app-frame").getAttribute("data-theme") === "light", "Light theme did not restore after dark-mode proof");

    for (const [nav, expectedText, screenshotName] of [
      ["AI Insights", ["assistant-ui", "New Thread", /Local preview|Live LLM/, /orders\s+\d+/, /Daily summaries tier/], "exact-admin-ai-insights.png"],
      ["Kiosks", "Active"],
      ["Sales & POS", ["Demo POS orders", "Gateway providers"], "exact-admin-sales-pos.png"],
      ["Warehouses", "Bayaan warehouse topology"],
      ["Stock & Allocation", "Kiosk stock needs", "exact-admin-stock-allocation.png"],
      ["Products & Recipes", ["Recipe cost and margin control", "Demo persistence"], "exact-admin-products-recipes.png"],
      ["Daily Close", ["Variance loop", "Today's closes", "Digital payments", "Investigation"], "exact-admin-daily-close.png"],
      ["Waste & Loss", ["Waste reason control", "Demo pattern"]],
      ["Purchases & Suppliers", ["Open purchase orders", "Supplier item catalog", "Suppliers"]],
      ["Staff", ["Cashier performance", "Roster"]],
      ["Reports", ["Management report pack", "Payment methods", "Iraqi gateway settlement", "Profit & loss", "Export pack"]],
    ]) {
      await navigateAdmin(page, nav);
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
      if (nav === "Warehouses") {
        await expectText(page, /Central Warehouse[\s\S]*12,340/);
      }
      if (nav === "Stock & Allocation") {
        await expectText(page, "Create transfer");
        await assertStockAllocationReleaseGate(page);
        await page.getByRole("button", { name: /Create transfer/ }).first().click();
        await expectText(page, /Review suggested transfer before creating/);
        await expectText(page, "New stock transfer");
        await page.locator("[role='dialog']").getByRole("button", { name: /Create transfer/ }).click();
        await expectText(page, /Draft transfer prepared/);
        const draftId = "DRAFT-K-04-oat-milk-1l";
        await expectText(page, new RegExp(draftId));
        await clickStockTransferAction(page, draftId, "Approve");
        await expectStockTransferRow(page, draftId, /approved/i, "stock transfer draft did not move to approved");
        await clickStockTransferAction(page, draftId, "Pick");
        await expectStockTransferRow(page, draftId, /picked/i, "stock transfer did not move to picked");
        await clickStockTransferAction(page, draftId, "Dispatch");
        await expectStockTransferRow(page, draftId, /dispatched[\s\S]*waiting kiosk/i, "stock transfer did not move to dispatched waiting-kiosk state");
        await clickStockTransferAction(page, draftId, "Receive");
        await expectStockTransferRow(page, draftId, /received/i, "stock transfer did not expose and persist the receive action");
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

    await navigateAdmin(page, "Kiosks");
    await page.locator(".card", { hasText: "Karrada Center" }).first().click();
    await expectText(page, "Daily stock reconciliation");
    await expectText(page, "Expected consumed from POS sales");
    await page.waitForTimeout(900);
    await page.screenshot({ path: filePath("exact-admin-kiosk-current-stock.png"), fullPage: true });

    await page.getByRole("button", { name: "POS", exact: true }).click();
    await expectText(page, "Good morning");
    await expectText(page, "Customer-facing display");
    await expectText(page, "Step up when ready");
    await expectLoadedImage(page, '.tablet-portrait img[src="/brand/miza-logo.png"]');
    await page.screenshot({ path: filePath("exact-pos-login.png"), fullPage: true });

    await page.getByRole("button", { name: /Maya Ahmed/ }).click();
    // Type a wrong PIN first to assert validation kicks in (was a fake-PIN flow before).
    for (const digit of ["9", "9", "9", "9"]) {
      await clickExactButton(page, digit);
    }
    await page.getByRole("button", { name: /Start shift/ }).click();
    await expectText(page, "Incorrect PIN");
    // Now the correct demo PIN for Maya Ahmed (1234) — see DEMO_STAFF in ExactKioskApp.jsx.
    for (const digit of ["1", "2", "3", "4"]) {
      await clickExactButton(page, digit);
    }
    await page.getByRole("button", { name: /Start shift/ }).click();
    await expectText(page, "Current order");
    await page.waitForSelector('button.card img[src="/products/latte.webp"]', { timeout: 10_000 });
    // Wait for every product img to either decode (complete + naturalWidth>0) or surface a load error.
    await page.locator("button.card img").evaluateAll((imgs) =>
      Promise.all(imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => { img.removeEventListener("load", done); img.removeEventListener("error", done); resolve(); };
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          // Safety bound so a stuck request can't hang the smoke.
          setTimeout(done, 5000);
        });
      })),
    );
    const brokenProductImages = await page.locator("button.card img").evaluateAll((imgs) =>
      imgs
        .filter((img) => img.naturalWidth === 0 || img.naturalHeight === 0)
        .map((img) => img.getAttribute("src")),
    );
    assert(brokenProductImages.length === 0, `Broken product images: ${brokenProductImages.join(", ")}`);

    await page.locator("button.card", { hasText: "Latte" }).first().click();
    // Coffee items open the modifier sheet — pick a non-default option to prove the price delta lands in cart.
    await page.locator("[data-testid='product-modifier-sheet']").waitFor({ state: "visible", timeout: 5_000 });
    await page.locator("[data-testid='mod-size-large']").click();
    await page.locator("[data-testid='mod-milk-almond']").click();
    await page.locator("[data-testid='modifier-add-to-order']").click();
    await page.locator("[data-testid='cart-line-modifiers']").first().waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: "Juice" }).click();
    await page.locator("button.card", { hasText: "Orange" }).first().click();
    // Juice also has modifiers (size/sweetness) — accept defaults.
    await page.locator("[data-testid='product-modifier-sheet']").waitFor({ state: "visible", timeout: 5_000 });
    await page.locator("[data-testid='modifier-add-to-order']").click();
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
    // The new wiring records the sale via BayaanProvider; in demo mode this
    // resolves to ok and a "Recorded" badge appears next to "Payment complete".
    await expectText(page, "Recorded");
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
    await expectText(page, "ميزا");
    await assertNoVisibleMojibake(page);
    await page.screenshot({ path: filePath("exact-arabic-pos.png"), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await mobile.addInitScript(() => {
      window.localStorage.setItem("bayaan.mode.v1", "demo");
      window.localStorage.setItem("bayaan.kiosk.v1", "K-01");
    });
    await mobile.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await mobile.locator("[data-testid='mobile-dashboard']").first().waitFor({ state: "visible", timeout: 10_000 });
    const mobileText = (await mobile.textContent("body"))?.trim() ?? "";
    assert(mobileText.length > 200, "Mobile render is blank or near blank");
    // Owner mobile view is read-only and surfaces the branch ranking + watchlist.
    const mobileTextLower = mobileText.toLowerCase();
    assert(mobileTextLower.includes("sales today") || mobileText.includes("مبيعات اليوم"),
      "Mobile dashboard KPI 'Sales today' missing");
    assert(mobileTextLower.includes("best") || mobileText.includes("الأفضل"),
      "Mobile dashboard branch ranking missing");
    assert(mobileText.includes("Spectator") || mobileText.includes("مراقب"),
      "Mobile dashboard role label missing");
    await mobile.screenshot({ path: filePath("exact-mobile-admin.png"), fullPage: true });
    await mobile.close();

    // Force-desktop override on a phone viewport must still render the cashier admin shell.
    const forcedDesktop = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await forcedDesktop.addInitScript(() => {
      window.localStorage.setItem("bayaan.mode.v1", "demo");
      window.localStorage.setItem("bayaan.kiosk.v1", "K-01");
    });
    await forcedDesktop.goto(`${baseUrl}/?bayaanView=desktop`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await forcedDesktop.waitForTimeout(2000);
    const forcedText = (await forcedDesktop.textContent("body"))?.trim() ?? "";
    assert(/command\s+center|today\s+command/i.test(forcedText) || /operations/i.test(forcedText),
      "?bayaanView=desktop did not render the desktop admin shell on a narrow viewport");
    // And the explicit mobile override on a desktop-class viewport must show the mobile shell.
    const forcedMobile = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await forcedMobile.goto(`${baseUrl}/?bayaanView=mobile`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await forcedMobile.locator("[data-testid='mobile-dashboard']").first().waitFor({ state: "visible", timeout: 10_000 });
    await forcedMobile.close();
    await forcedDesktop.close();

    assert(consoleErrors.length === 0, `Console/request errors detected: ${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join(" | ")}`);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      screenshots: [
        "verification/exact-admin-overview.png",
        "verification/exact-admin-overview-dark.png",
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
  const defaultCandidate = { label: "chromium default", options: { headless: true } };
  const chromeCandidate = { label: "chromium channel=chrome", options: { headless: true, channel: "chrome" } };
  const edgeCandidate = { label: "chromium channel=msedge", options: { headless: true, channel: "msedge" } };
  const platformCandidates = process.platform === "win32"
    ? [edgeCandidate, chromeCandidate, defaultCandidate]
    : [defaultCandidate, chromeCandidate, edgeCandidate];
  const candidates = [
    preferredChannel ? { label: `chromium channel=${preferredChannel}`, options: { headless: true, channel: preferredChannel } } : null,
    ...platformCandidates,
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
    "Miza",
    "/brand/miza-logo.png",
    "STREAM ACTIVE",
    "Top performers",
    "AI Insights",
    "assistant-ui",
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
    checkedStrings: 11,
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

async function expectLoadedImage(page, selector) {
  const image = page.locator(selector).first();
  await image.waitFor({ state: "visible", timeout: 10_000 });
  const loaded = await image.evaluate((img) =>
    img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
  );
  assert(loaded, `Image did not load: ${selector}`);
}

async function clickExactButton(page, name) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.getByRole("button", { name, exact: true }).click({ timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (!/detached from the DOM|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(120);
    }
  }
  throw lastError;
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

async function navigateAdmin(page, label) {
  const navItem = page.locator(".nav-item", { hasText: label }).first();
  if (await navItem.isVisible({ timeout: 500 }).catch(() => false)) {
    await navItem.click();
    return;
  }
  const section = adminSectionId(label);
  assert(section, `No admin section mapping for ${label}`);
  const changed = await page.evaluate((nextSection) => {
    if (typeof window.__bayaanSetAdminSection !== "function") return false;
    window.__bayaanSetAdminSection(nextSection);
    return true;
  }, section);
  assert(changed, `Admin navigation helper was not available for ${label}`);
}

function adminSectionId(label) {
  return {
    "AI Insights": "insights",
    "Kiosks": "kiosks",
    "Sales & POS": "sales",
    "Warehouses": "warehouses",
    "Items Catalog": "items",
    "Stock & Allocation": "inventory",
    "Products & Recipes": "products",
    "Daily Close": "closing",
    "Waste & Loss": "waste",
    "Purchases & Suppliers": "suppliers",
    "Staff": "staff",
    "Finance": "finance",
    "Reports": "reports",
  }[label];
}

async function assertStockAllocationReleaseGate(page) {
  const ledger = page.locator('[data-testid="inventory-ledger-card"]');
  await ledger.waitFor({ state: "visible", timeout: 10_000 });
  await expectText(page, /Showing 1-10 of \d+ stock rows/);
  await expectText(page, "Rows per page");
  await expectText(page, /Page 1 of \d+/);

  const ledgerRows = ledger.locator("tbody tr");
  await waitForCountAtLeast(ledgerRows, 10, "inventory ledger must render a full Studio table page");
  const firstPageFirstRow = await ledgerRows.first().innerText();

  const chartBox = await page.locator('[data-testid="inventory-health-chart"]').boundingBox();
  const listBox = await page.locator('[data-testid="inventory-health-list"]').boundingBox();
  assert(chartBox && listBox, "inventory health chart/list boxes were not measurable");
  await page.locator('[data-testid="inventory-health-chart"] .recharts-surface').waitFor({ state: "visible", timeout: 10_000 });
  const overlaps = chartBox.x < listBox.x + listBox.width
    && chartBox.x + chartBox.width > listBox.x
    && chartBox.y < listBox.y + listBox.height
    && chartBox.y + chartBox.height > listBox.y;
  assert(!overlaps, "inventory health pie chart overlaps the status list");

  await page.getByRole("link", { name: "Go to next page" }).click();
  await expectText(page, /Page 2 of \d+/);
  await waitForCountAtLeast(ledgerRows, 2, "inventory ledger next page did not render rows");
  const secondPageFirstRow = await ledgerRows.first().innerText();
  assert(firstPageFirstRow !== secondPageFirstRow, "inventory ledger pagination did not change visible rows");
  await page.getByRole("link", { name: "Go to previous page" }).click();
  await expectText(page, /Page 1 of \d+/);
}

async function waitForCountAtLeast(locator, expected, message, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.count() >= expected) return;
    await delay(120);
  }
  throw new Error(`${message}; saw ${await locator.count()}, expected at least ${expected}`);
}

async function expectStockTransferRow(page, rowId, pattern, message, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const row of stockTransferRowCandidates(page, rowId)) {
      const text = await row.innerText({ timeout: 500 }).catch(() => "");
      if (pattern.test(text)) return text;
    }
    await delay(160);
  }
  throw new Error(message);
}

async function clickStockTransferAction(page, rowId, actionName) {
  for (const row of stockTransferRowCandidates(page, rowId)) {
    const action = row.getByRole("button", { name: actionName });
    if (await action.count()) {
      await action.first().click();
      return;
    }
  }
  throw new Error(`Could not find ${actionName} action for transfer ${rowId}`);
}

function stockTransferRowCandidates(page, rowId) {
  const text = page.getByText(rowId, { exact: false }).first();
  return [
    page.locator("tr", { hasText: rowId }).first(),
    text.locator("xpath=ancestor::div[.//button][1]"),
    text.locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
  ];
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
