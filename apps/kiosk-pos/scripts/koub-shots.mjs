import { chromium } from "playwright";
const URL = process.env.KIOSK_POS_URL || "http://127.0.0.1:5174";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERR: " + String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
// open sign-in modal
await page.getByRole("button", { name: /Sign in|دخول/ }).first().click();
const dlg = page.locator("[role='dialog']");
await dlg.waitFor({ state: "visible" });
const inputs = dlg.locator("input");
await inputs.nth(0).fill("owner@koub.iq");
await inputs.nth(1).fill("test");
await dlg.locator("button[type='submit']").click().catch(async () => {
  await dlg.getByRole("button", { name: /^Sign in$/ }).click();
});
await page.waitForTimeout(7000);  // let auth_status + chain_bootstrap load
await page.screenshot({ path: "verification/koub-01-overview.png", fullPage: false });
console.log("CAPTURED overview");

// Try to capture a few more sections by common nav labels (best effort)
const sections = [
  ["Inventory", "koub-02-inventory"],
  ["Items", "koub-02-items"],
  ["Sales", "koub-03-sales"],
  ["Staff", "koub-04-staff"],
  ["Products", "koub-05-products"],
  ["Closing", "koub-06-closing"],
  ["Kiosks", "koub-07-kiosks"],
];
for (const [label, file] of sections) {
  try {
    await page.getByRole("button", { name: new RegExp("^" + label, "i") }).first().click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `verification/${file}.png`, fullPage: false });
    console.log("CAPTURED", label);
  } catch (e) {
    console.log("SKIP", label, "-", String(e).slice(0, 60));
  }
}
console.log("CONSOLE_ERRORS:", JSON.stringify(errors.slice(0, 8)));
await browser.close();
