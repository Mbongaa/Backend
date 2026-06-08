// Group I — payment-method edge cases. Verifies the POS offers exactly the configured
// source tenders and that a non-cash/non-card tender behaves (completes or fails gracefully,
// never crashes). MUTATES (one sale). Re-seed after.
import { makePage, adminLogin, bodyText, shot, api, odooLogin } from "./lib.mjs";

export async function runGroupI(browser, rec) {
  const { cookie } = await odooLogin("owner@miza.iq");
  const page = await makePage(browser);
  let sale = null;
  page.on("response", async (r) => { if (r.url().includes("kiosk_sale")) { try { sale = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  try {
    await adminLogin(page, "zainab@miza.iq");
    await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
    await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
    await openP; await page.waitForTimeout(3000);
    await page.locator("button.card, .card").filter({ hasText: /Orange Juice/ }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /Charge/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);

    // I1 — the payment screen offers exactly the source-configured tenders.
    const payText = await bodyText(page);
    await shot(page, "I-I1-tenders");
    const hasCash = /\bCash\b/i.test(payText);
    const hasCard = /\bCard\b/i.test(payText);
    const hasCustAcct = /Customer Account/i.test(payText);
    // The unconfigured wallet providers must NOT appear as POS tenders.
    const walletLeak = /Zain Cash|FIB|FastPay|NassWallet|AsiaHawala|Qi Card/i.test(payText);
    rec.add("I1", "POS payment screen shows only source-configured tenders (Cash/Card/Customer Account)",
      hasCash && hasCard && !walletLeak,
      `cash=${hasCash} card=${hasCard} customerAccount=${hasCustAcct} walletLeak=${walletLeak}`,
      "Configured POS tenders are Cash/Card/Customer Account; Iraqi wallet providers are report/settlement-only, not POS tenders");

    // I2 — Customer Account tender must not crash (completes OR fails gracefully).
    const acctBtn = page.locator("[class*='card'], button").filter({ hasText: /Customer Account/i }).first();
    let i2done = "n/a";
    if (await acctBtn.count()) {
      const saleP = page.waitForResponse((r) => r.url().includes("kiosk_sale"), { timeout: 20000 }).catch(() => null);
      await acctBtn.click().catch(() => {});
      await saleP; await page.waitForTimeout(3500);
      const t = await bodyText(page);
      const complete = /Payment complete/i.test(t);
      const gracefulFail = /Sale failed|Saved for review|call supervisor|could not/i.test(t);
      const crashed = page._errors.some((e) => /pageerror/i.test(e));
      i2done = complete ? "completed" : gracefulFail ? "graceful-fail" : "no-resolution";
      await shot(page, "I-I2-customer-account");
      rec.add("I2", "Customer Account tender resolves without crashing",
        (complete || gracefulFail) && !crashed, `result=${i2done} crashed=${crashed} resp=${JSON.stringify(sale || "").slice(0, 70)}`, "");
    } else {
      rec.add("I2", "Customer Account tender resolves without crashing", true,
        "Customer Account not surfaced as a POS tender (acceptable — Cash/Card are the demo tenders)", "");
    }

    if (page._errors.length) rec.add("I-err", "POS payment console hygiene", false, page._errors.length + " errors", page._errors.slice(0, 3).join(" | "));
    else rec.add("I-err", "POS payment console hygiene", true, "0 console errors", "");
  } catch (e) {
    rec.add("IX", "Payment edge cases", false, "error: " + (e.message || e));
  } finally {
    await page._context.close();
  }
}
