import { chromium } from "playwright";

const URL = process.env.KIOSK_POS_URL || "http://127.0.0.1:5174";
const LOGIN = process.env.BAYAAN_LOGIN || "superadmin@bayaan.test";

const consoleErrors = [];
const netFails = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 200)));
page.on("response", (r) => {
  const u = r.url();
  if ((u.includes("/websocket") || u.includes("realtime_config") || u.includes("chain_bootstrap")) && r.status() >= 400)
    netFails.push(`${r.status()} ${u.replace(URL, "")}`);
});

await page.goto(URL, { waitUntil: "networkidle" });

// Sign in
await page.getByRole("button", { name: /Sign in|دخول/ }).first().click();
const dialog = page.locator("[role='dialog']");
await dialog.waitFor({ state: "visible" });
const loginInput = dialog.locator("input").first();
await loginInput.fill(LOGIN);
await dialog.getByRole("button", { name: /^Sign in$/ }).click().catch(async () => {
  await dialog.locator("button[type='submit']").click();
});

// Let realtime settle (polling interval is 2s; give it a few cycles)
await page.waitForTimeout(8000);

// Read the realtime badge
let badge = "(not found)";
const badgeLoc = page.locator("text=/Stream (live|polling|error|missing|waiting|reconnecting)|التدفق/").first();
if (await badgeLoc.count()) badge = (await badgeLoc.innerText()).replace(/\s+/g, " ").trim();

// Also read the visible class of the badge container for color
let badgeClass = "";
try {
  badgeClass = await page.locator(".badge-pos, .badge-crit, .badge-warn").first().getAttribute("class");
} catch {}

await page.screenshot({ path: "verification/stream-check.png", fullPage: false });

console.log("REALTIME_BADGE:", badge);
console.log("BADGE_CLASS:", badgeClass);
console.log("NET_FAILS:", JSON.stringify(netFails));
console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors.slice(0, 8)));
await browser.close();
