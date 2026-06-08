// Shared helpers for the demo verification suite.
// Runs authenticated against the LIVE Odoo backend (unlike smoke.mjs which uses demo/mock).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const URL = process.env.KIOSK_POS_URL || "http://127.0.0.1:5174";
export const OUT = path.resolve(__dirname, "../../verification/demo-verify");
fs.mkdirSync(OUT, { recursive: true });

export async function launch() {
  return chromium.launch();
}

// A page wired with console/page/request error capture. Ignore offline font noise.
export async function makePage(browser, { width = 1680, height = 1020 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const ignore = (t) =>
    t.includes("ERR_NETWORK_ACCESS_DENIED") ||
    t.includes("fonts.gstatic.com") ||
    t.includes("fonts.googleapis.com");
  page.on("console", (m) => { if (m.type() === "error" && !ignore(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.message || "").slice(0, 200)));
  page.on("requestfailed", (r) => { const u = r.url(); if (!ignore(u)) errors.push("reqfail: " + u.slice(0, 160)); });
  page.on("response", (r) => { if (r.status() >= 500) { const u = r.url(); if (!ignore(u)) errors.push(`HTTP ${r.status()}: ${u.slice(0, 160)}`); } });
  page._errors = errors;
  page._context = context;
  return page;
}

// Log in through the header "Sign in" dialog. Waits for a fresh chain_bootstrap.
export async function adminLogin(page, email, password = "test") {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const bootP = page.waitForResponse((r) => r.url().includes("chain_bootstrap") && r.status() < 400, { timeout: 25000 }).catch(() => null);
  await page.getByRole("button", { name: /Sign in|دخول/ }).first().click();
  const dlg = page.locator("[role='dialog']");
  await dlg.waitFor({ state: "visible", timeout: 8000 });
  const inputs = dlg.locator("input");
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(password);
  await dlg.locator("button[type='submit']").click();
  // Admin roles trigger chain_bootstrap; cashier flips to POS panel (no bootstrap).
  await Promise.race([bootP, page.waitForTimeout(7000)]);
  await page.waitForTimeout(2500);
}

// Visible admin sidebar nav labels (empty when on the POS panel).
export async function navLabels(page) {
  return (await page.locator(".admin-sidebar .nav-item span").allInnerTexts().catch(() => []))
    .map((s) => s.trim()).filter(Boolean);
}

// Is the cashier POS panel active (vs admin shell)?
export async function posPanelActive(page) {
  const t = await bodyText(page);
  return has(t, /Customer-facing display|Start shift|Amount due|Source verified|Source required|Sign in to Bayaan/i)
    && !(await page.locator(".admin-sidebar").isVisible({ timeout: 500 }).catch(() => false));
}

export async function gotoAdmin(page, label) {
  const item = page.locator(".nav-item", { hasText: label }).first();
  if (await item.isVisible({ timeout: 1500 }).catch(() => false)) {
    await item.click();
    await page.waitForTimeout(1400);
    return true;
  }
  return false;
}

export async function bodyText(page) {
  return (await page.locator("body").innerText().catch(() => "")) || "";
}

// True if any of the needles (string or RegExp) appear in text.
export function has(text, ...needles) {
  return needles.some((n) => (n instanceof RegExp ? n.test(text) : text.includes(n)));
}

// Match an integer that may be comma/space/dot grouped, e.g. 399000 -> /399[.,\s]?000/.
export function numRe(n) {
  const s = String(Math.abs(n));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, "[.,\\s]?");
  return new RegExp(grouped);
}

export async function shot(page, name) {
  const file = path.join(OUT, name.endsWith(".png") ? name : name + ".png");
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return path.basename(file);
}

// Result accumulator
export function makeRecorder() {
  const results = [];
  return {
    results,
    add(id, name, ok, detail, evidence) {
      results.push({ id, name, ok: !!ok, detail: detail || "", evidence: evidence || "" });
      const tag = ok ? "PASS" : "FAIL";
      console.log(`[${tag}] ${id} ${name}${detail ? " — " + detail : ""}`);
    },
  };
}

export function writeReport(results, title = "Demo verification") {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Run: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`**${pass}/${results.length} passed** · ${fail} failed`);
  lines.push("");
  lines.push("| ID | Check | Result | Detail |");
  lines.push("|---|---|---|---|");
  for (const r of results) {
    const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${r.id} | ${cell(r.name)} | ${r.ok ? "✅" : "❌"} | ${cell(r.detail)} |`);
  }
  lines.push("");
  const evid = results.filter((r) => r.evidence);
  if (evid.length) {
    lines.push("## Evidence");
    lines.push("");
    for (const r of evid) lines.push(`- **${r.id}**: ${String(r.evidence).replace(/\n/g, " ")}`);
  }
  const md = lines.join("\n");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
  return { pass, fail, total: results.length, dir: OUT };
}

// Direct authenticated Odoo API call (Node side) for backend ground-truth checks.
export async function api(route, cookie, params = {}) {
  const res = await fetch(`http://127.0.0.1:8069${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params }),
  });
  const j = await res.json();
  return j.result ?? j.error ?? j;
}

export async function odooLogin(login, password = "test") {
  const res = await fetch("http://127.0.0.1:8069/web/session/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: "bayaan", login, password } }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/session_id=[^;]+/);
  const j = await res.json();
  return { cookie: m ? m[0] : "", uid: j?.result?.uid };
}
