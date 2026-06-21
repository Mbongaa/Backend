import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1800, height: 980 } });
await page.addInitScript(() => {
  window.localStorage.setItem("bayaan.mode.v1", "demo");
  window.localStorage.setItem("bayaan.kiosk.v1", "K-01");
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const signIn = page.getByRole("button", { name: /Sign in|دخول/ }).first();
if (await signIn.isVisible().catch(() => false)) {
  await signIn.click();
  const dlg = page.locator("[role='dialog']");
  await dlg.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await dlg.locator("input").nth(0).fill("owner@koub.iq");
  await dlg.locator("input").nth(1).fill("test");
  await dlg.locator("button[type='submit']").click();
  await page.waitForTimeout(4000);
}
const adminBtn = page.getByRole("button", { name: /^Admin|لوحة الإدارة/ }).first();
if (await adminBtn.isVisible().catch(() => false)) { await adminBtn.click(); await page.waitForTimeout(2000); }
// 1. Ctrl+K opens
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
const palette = page.locator(".command-palette");
const openOnCtrlK = await palette.isVisible().catch(() => false);
// 2. type + Enter navigates to staff
await page.keyboard.type("staff");
await page.waitForTimeout(400);
await page.screenshot({ path: "verification/sweep/palette-open.png" });
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
const onStaff = await page.locator("text=/Staff|الموظفون/").first().isVisible().catch(() => false);
// 3. click the topbar search opens too
await page.locator("button:has-text('Ctrl K')").first().click();
await page.waitForTimeout(500);
const openOnClick = await palette.isVisible().catch(() => false);
await page.keyboard.press("Escape");
console.log(JSON.stringify({ openOnCtrlK, onStaff, openOnClick, pageErrors: errors }));
await browser.close();
