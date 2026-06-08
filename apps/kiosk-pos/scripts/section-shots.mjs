import { chromium } from "playwright";

const URL = process.env.KIOSK_POS_URL || "http://127.0.0.1:5174";
const consoleErrors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 160)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Sign in|دخول/ }).first().click();
const dialog = page.locator("[role='dialog']");
await dialog.waitFor({ state: "visible" });
await dialog.locator("input").first().fill("superadmin@bayaan.test");
await dialog.getByRole("button", { name: /^Sign in$/ }).click().catch(() => dialog.locator("button[type='submit']").click());
await page.waitForTimeout(5000);

const sections = ["Daily Close", "Sales & POS", "Staff", "Products & Recipes", "Purchases & Suppliers"];
for (const label of sections) {
  try {
    await page.getByRole("button", { name: new RegExp("^" + label, "i") }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    const file = "verification/section-" + label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
    await page.screenshot({ path: file, fullPage: false });
    console.log("CAPTURED:", label, "->", file);
  } catch (e) {
    console.log("SKIP:", label, "-", String(e).slice(0, 80));
  }
}
console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors.slice(0, 6)));
await browser.close();
