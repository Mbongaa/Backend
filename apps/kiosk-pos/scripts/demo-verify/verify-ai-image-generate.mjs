// Live walkthrough of the AI product-photo generation on the draft card.
// Drives the REAL browser UI against the live Vite frontend + Odoo backend + OpenAI:
// asks the assistant to draft a product, then exercises the redesigned image hero —
// empty pane state, "Generate image with AI" (real gpt-image-1 call), the generating
// spinner overlay, and the final image landing in the pane. Deliberately does NOT
// click "Confirm & create product", so it never writes to the demo database.
import { launch, makePage, adminLogin, gotoAdmin, shot } from "./lib.mjs";

const PROMPT = "create an espresso product for 3000 IQD";

async function run() {
  const browser = await launch();
  const page = await makePage(browser);
  const log = (m) => console.log(m);
  let ok = true;
  const check = (label, pass) => {
    log(`   ${pass ? "PASS" : "FAIL"} — ${label}`);
    if (!pass) ok = false;
  };
  try {
    log("1) Login as owner@miza.iq…");
    await adminLogin(page, "owner@miza.iq", "test");

    log("2) Open the Insights (AI assistant) screen…");
    const opened = await gotoAdmin(page, "AI Assistant");
    if (!opened) throw new Error("could not find the Insights nav item");
    await page.waitForTimeout(1200);

    log("3) Ask for a product draft (real OpenAI call)…");
    const composer = page.locator(".assistant-thread-input, .aui-composer-input, textarea").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.click();
    await composer.fill(PROMPT);
    const planP = page.waitForResponse((r) => r.url().includes("/bayaan/api/ai_dashboard_plan"), { timeout: 160000 }).catch(() => null);
    const sendBtn = page.getByRole("button", { name: /Send message|إرسال الرسالة|إرسال/ });
    if (await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.first().click();
    } else {
      await composer.press("Enter");
    }
    await planP;

    log("4) Wait for the draft card and verify the redesigned image hero…");
    const confirmBtn = page.getByRole("button", { name: /Confirm & create product|تأكيد وإنشاء المنتج/ });
    await confirmBtn.first().waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(800);
    await shot(page, "aiimg-01-draft-hero-empty");
    check("empty image pane shows dropzone hint", await page.locator('label:has-text("drag one here")').first().isVisible().catch(() => false));
    const genBtn = page.getByRole("button", { name: /Generate image with AI|توليد صورة بالذكاء/ });
    check("Generate image with AI button visible", await genBtn.first().isVisible().catch(() => false));

    log("5) Generate the image and verify the loading state (real gpt-image-1 call)…");
    const genP = page.waitForResponse((r) => r.url().includes("/bayaan/api/ai_image_generate"), { timeout: 160000 }).catch(() => null);
    await genBtn.first().click();
    await page.waitForTimeout(700);
    check("spinner overlay visible while generating", await page.locator(".assistant-artifact-loader-icon").first().isVisible().catch(() => false));
    check("'Generating image…' copy visible", await page.getByText(/Generating image…|جارٍ توليد الصورة…/).first().isVisible().catch(() => false));
    await shot(page, "aiimg-02-generating");

    const genResp = await genP;
    check("ai_image_generate responded 200", !!genResp && genResp.status() === 200);
    await page.waitForTimeout(1000);
    const paneImg = page.locator('label:has(input[type="file"]) img').first();
    check("generated image fills the pane", await paneImg.isVisible({ timeout: 10000 }).catch(() => false));
    check("Regenerate with AI button visible", await page.getByRole("button", { name: /Regenerate with AI|إعادة التوليد بالذكاء/ }).first().isVisible().catch(() => false));
    check("Remove image button visible", await page.getByRole("button", { name: /Remove image|إزالة الصورة/ }).first().isVisible().catch(() => false));
    await shot(page, "aiimg-03-image-ready");

    log("6) NOT clicking Confirm — no records written.");
  } catch (e) {
    ok = false;
    log("ERROR: " + (e?.message || e));
    await shot(page, "aiimg-99-error").catch(() => {});
  } finally {
    await browser.close();
  }
  console.log(ok ? "\nRESULT: PASS" : "\nRESULT: FAIL");
  process.exit(ok ? 0 : 1);
}

run();
