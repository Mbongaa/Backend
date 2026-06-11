// Live: ask the AI to create a product whose ingredients do NOT exist in the catalog
// (dragonfruit + lychee). Observe the fail-safe behavior so we can explain it.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot } from "./lib.mjs";

const PROMPT = "Create a dragonfruit and lychee smoothie for 6000 IQD";

async function run() {
  const browser = await launch();
  const page = await makePage(browser);
  const net = [];
  page.on("response", async (r) => {
    if (r.url().includes("/bayaan/api/product_create_bundle")) { let b=""; try{b=await r.text();}catch{} net.push({ status:r.status(), body:b }); }
  });
  const log = (m) => console.log(m);
  try {
    await adminLogin(page, "owner@miza.iq", "test");
    await gotoAdmin(page, "AI Assistant"); await page.waitForTimeout(1500);
    const composer = page.locator(".assistant-thread-input, .aui-composer-input, textarea").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.click(); await composer.fill(PROMPT);
    const sendBtn = page.getByRole("button", { name: /Send message|إرسال/ });
    if (await sendBtn.first().isVisible({ timeout: 3000 }).catch(()=>false)) await sendBtn.first().click(); else await composer.press("Enter");

    const confirmBtn = page.getByRole("button", { name: /Confirm & create product|تأكيد وإنشاء المنتج/ });
    await confirmBtn.first().waitFor({ state: "visible", timeout: 150000 });
    await page.waitForTimeout(1200);
    await shot(page, "noing-01-draft");

    const t = await bodyText(page);
    const warned = /Ingredient notice|not in your catalog|substituted/i.test(t);
    // count recipe ingredient rows (selects/qty inputs in the recipe block)
    const qtyCount = await page.locator('input[placeholder="qty"], input[placeholder="كمية"]').count();
    const emptyRecipe = /No ingredients in the draft/i.test(t);
    // What did the AI say + what does the banner flag?
    const banner = (await page.locator('.ins-card').allInnerTexts().catch(()=>[])).join(" ").match(/(not in your catalog|substituted)[^.]*\./gi) || [];

    log("=== AT THE DRAFT STAGE ===");
    log(`  missing-ingredient warning shown: ${warned}`);
    log(`  banner snippets: ${JSON.stringify(banner.slice(0,4))}`);
    log(`  recipe ingredient rows: ${qtyCount}`);
    log(`  recipe explicitly empty: ${emptyRecipe}`);

    // Try to confirm WITHOUT adding an ingredient — observe the guard.
    log("=== CLICK CONFIRM (no ingredient added) ===");
    await confirmBtn.first().click();
    await page.waitForTimeout(1500);
    const toast = (await page.locator(".ai-toast").allInnerTexts().catch(()=>[])).join(" | ");
    await shot(page, "noing-02-after-confirm");
    const createdCall = net.length > 0;
    log(`  toast: ${toast || "(none captured)"}`);
    log(`  product_create_bundle called: ${createdCall}${createdCall ? " HTTP "+net[0].status : ""}`);
    log(`  => ${createdCall ? "a write happened" : "NO write happened (blocked at the draft)"}`);
  } catch (e) { log("ERROR: " + (e?.message||e)); await shot(page,"noing-99-error"); }
  finally { await browser.close(); }
}
run();
