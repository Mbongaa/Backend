// Demo trace: the DIGITAL-PAYMENT-AT-CLOSE concern.
// A shift with a cash, a card, AND a digital (Customer Account) sale.
// The cashier close form must:
//   - count ONLY cash + card (no digital input field),
//   - expected cash = opening + cash sales (NOT the digital sale),
//   - expected card = card sales (NOT the digital sale),
//   - a clean count (counted == expected) yields ZERO cash/card variance
//     even though a digital sale happened -> no phantom manager note.
import { launch, makePage, adminLogin, bodyText, shot, api, odooLogin } from "./lib.mjs";
const log = (m) => console.log("  " + m);

const browser = await launch();
const { cookie } = await odooLogin("owner@miza.iq");
const beforeClose = (await api("/bayaan/api/chain_bootstrap", cookie)).closings.length;

const sales = [];
const page = await makePage(browser);
page.on("response", async (r) => {
  if (r.url().includes("kiosk_sale")) { try { const j = await r.json(); sales.push(j?.result ?? j?.error); } catch {} }
});
let closeResp = null;
page.on("response", async (r) => {
  if (r.url().includes("shift_close") && !r.url().includes("review")) { try { closeResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} }
});

await adminLogin(page, "zainab@miza.iq");
await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
await page.waitForTimeout(800);
const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
await openP; await page.waitForTimeout(3500);

// Helper: sell one Cappuccino paying with the given tender (exact label text).
async function sell(labelExact) {
  await page.locator("button.card, .card").filter({ hasText: /Cappuccino/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Charge/ }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const saleP = page.waitForResponse((r) => r.url().includes("kiosk_sale"), { timeout: 15000 }).catch(() => null);
  // Tender cards are button.card whose LABEL text node equals the method name.
  const ok = await page.locator("button.card").filter({ has: page.getByText(labelExact, { exact: true }) }).first()
    .click().then(() => true).catch(() => false);
  if (!ok) console.log(`  ⚠ could not click tender "${labelExact}"`);
  await saleP; await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /New order|طلب جديد/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
}

console.log("\nSTEP 1 — three sales: Cash, Card, Customer Account (digital):");
await sell("Cash");
await sell("Card");
await sell("Customer Account");
log(`kiosk_sale responses captured: ${sales.length}`);
sales.forEach((s, i) => log(`  sale ${i + 1}: ${s?.name || JSON.stringify(s).slice(0, 60)} total ${s?.amount_total} consumption=${s?.consumption_state} lines=${(s?.consumption_lines || []).length}`));

console.log("\nSTEP 2 — open the End-shift close form and inspect it:");
await page.getByRole("button", { name: /End shift|إنهاء/ }).first().click().catch(() => {});
await page.waitForTimeout(1800);
const form = await bodyText(page);
await shot(page, "trace-digital-close-form");
const expCashM = form.match(/Expected cash:\s*IQD\s*([\d.,]+)/i);
const expCardM = form.match(/Expected card:\s*IQD\s*([\d.,]+)/i);
const expCash = expCashM ? Number(expCashM[1].replace(/[.,\s]/g, "")) : null;
const expCard = expCardM ? Number(expCardM[1].replace(/[.,\s]/g, "")) : null;
// A dedicated digital/wallet COUNTING field would carry an "Expected digital/wallet" hint
// next to a counted input (the way cash and card do). Match that precisely, not the word
// "digital" appearing anywhere on the page.
const hasDigitalInput = /(Counted|expected)\s+(digital|wallet|qr)/i.test(form);
log(`form shows "Counted cash": ${/Counted cash/i.test(form)}`);
log(`form shows "Counted card": ${/Counted card/i.test(form)}`);
log(`form shows ANY digital/wallet counting field: ${hasDigitalInput}`);
log(`Expected cash shown: ${expCash}   Expected card shown: ${expCard}`);
log(`(each Cappuccino = 4000; cash sale only -> expected cash 4000; card sale only -> expected card 4000; digital 4000 must be in NEITHER)`);

console.log("\nSTEP 3 — count EXACTLY the expected cash & card (clean count) and submit:");
const inputs = page.locator("input[type='number']");
await inputs.nth(0).fill(String(expCash ?? 4000)).catch(() => {});
await inputs.nth(1).fill(String(expCard ?? 4000)).catch(() => {});
const closeP = page.waitForResponse((r) => r.url().includes("shift_close") && !r.url().includes("review"), { timeout: 15000 }).catch(() => null);
await page.getByRole("button", { name: /Submit close|إرسال الإغلاق/ }).first().click().catch(() => {});
await closeP; await page.waitForTimeout(2500);
await shot(page, "trace-digital-close-submitted");
log(`close response: ${JSON.stringify(closeResp || "").slice(0, 140)}`);
await page._context.close();

console.log("\nSTEP 4 — verify the close record on the backend:");
const bb = await api("/bayaan/api/chain_bootstrap", cookie);
const afterClose = bb.closings.length;
const k01 = bb.closings.filter((c) => c.kioskId === "K-01").sort((a, b) => b.id - a.id)[0];
log(`closings ${beforeClose} -> ${afterClose}`);
log(`newest K-01 close: expectedCash ${k01?.expectedCash} countedCash ${k01?.countedCash} cashVariance ${k01?.cashVariance}`);
log(`                   expectedCard ${k01?.expectedCard} countedCard ${k01?.countedCard} cardVariance ${k01?.cardVariance}`);
log(`                   digitalPayments ${k01?.digitalPayments}`);

const digitalLeaked =
  (expCash != null && expCash > 4000) ||
  (expCard != null && expCard > 4000) ||
  (k01 && Number(k01.expectedCash || 0) > 4000) ||
  (k01 && Number(k01.expectedCard || 0) > 4000);
const cleanVariance = k01 && Number(k01.cashVariance || 0) === 0 && Number(k01.cardVariance || 0) === 0;
const ok = closeResp && !closeResp.message && !hasDigitalInput && !digitalLeaked && cleanVariance;
console.log("\n==== DIGITAL CLOSE TRACE: " + (ok
  ? "✅ PASS — digital excluded from cashier counting; clean count => zero variance"
  : "❌ ISSUE — digital may be leaking into cash/card counting or forcing variance (see steps above)") + " ====");
await browser.close();
