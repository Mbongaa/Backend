// RE4 check: the cashier Waste form shows the ingredient UNIT (kg/L) and accepts a
// fractional quantity (so a cashier can waste 0.5 L of milk, not just whole units).
// Render + interaction only — does NOT submit (avoids mutating demo stock).
import { launch, makePage, adminLogin, bodyText, shot } from "./lib.mjs";
const log = (m) => console.log("  " + m);

const browser = await launch();
const page = await makePage(browser);
await adminLogin(page, "zainab@miza.iq");
await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
await page.waitForTimeout(800);
const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
await openP; await page.waitForTimeout(3000);

console.log("\nOpen the Waste form and select a kg/L ingredient (Fresh Milk):");
await page.getByRole("button", { name: /^Waste$|هدر/ }).first().click().catch(() => {});
await page.waitForTimeout(1500);
// pick the milk item card
await page.locator("button.card").filter({ hasText: /Milk|حليب/ }).first().click().catch(() => {});
await page.waitForTimeout(600);
await shot(page, "fix-re4-waste-form");
const t = await bodyText(page);
const unitShown = /\b(L|kg|كغ|لتر)\b/i.test(t) && /(Quantity|الكمية|Qty|per|للوحدة)/i.test(t);
log(`unit (L/kg) visible on the waste form: ${unitShown ? "✅" : "⚠ not detected"}`);

// Try to set a fractional quantity in the qty number input.
const qtyInput = page.locator("input[type='number']").first();
let fractionalOk = false;
if (await qtyInput.count()) {
  await qtyInput.fill("0.5").catch(() => {});
  await page.waitForTimeout(400);
  const v = await qtyInput.inputValue().catch(() => "");
  fractionalOk = v === "0.5" || Number(v) === 0.5;
  log(`set qty to 0.5 -> input holds "${v}"  ${fractionalOk ? "✅ fractional accepted" : "❌ rejected"}`);
} else {
  log("❌ no numeric qty input found");
}
// Summary should reflect the fractional qty + unit
const summaryHasFrac = /0\.5/.test(await bodyText(page));
log(`summary reflects 0.5: ${summaryHasFrac ? "✅" : "⚠"}`);
await shot(page, "fix-re4-waste-frac");

const ok = unitShown && fractionalOk;
console.log("\n==== RE4 WASTE UI: " + (ok ? "✅ PASS — unit shown + fractional qty accepted" : "❌ ISSUE — see above") + " ====");
await page._context.close();
await browser.close();
