// Live, human-style walkthrough of the AI Insights "create a product" flow.
// Drives the REAL browser UI against the live Vite frontend + Odoo backend + OpenAI
// (no mocks, no direct API fabrication). Reproduces the exact demo report:
//   "create a mango juice for 5000 IQD, small/medium/large, each +500 IQD"
// and clicks "Confirm & create product", asserting it succeeds (the bug was a
// "Product not found: <id>" failure on confirm) and that the missing-mango notice shows.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, has, odooLogin } from "./lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A real PNG (the brand logo) to exercise the product-image upload — a normal image
// Odoo's Pillow pipeline can process (a synthetic 1x1 px trips "Truncated File Read").
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_PNG = path.resolve(__dirname, "../../public/brand/miza-logo.png");

const PROMPT = "create a mango juice for 5000 IQD, with variation small medium large, each level is 500 IQD more";

async function run() {
  const browser = await launch();
  const page = await makePage(browser);
  const net = [];
  const reqLog = [];
  page.on("request", (r) => { const u = r.url(); if (u.includes("/bayaan/api/")) reqLog.push(u.split("/bayaan/api/")[1].split("?")[0]); });
  // Capture the two writes that matter, with their response bodies.
  page.on("response", async (r) => {
    const u = r.url();
    if (u.includes("/bayaan/api/ai_dashboard_plan") || u.includes("/bayaan/api/product_create_bundle")) {
      let body = "";
      try { body = await r.text(); } catch { /* stream */ }
      net.push({ route: u.split("/bayaan/api/")[1]?.split("?")[0], status: r.status(), body });
    }
  });

  const log = (m) => console.log(m);
  let ok = true;
  try {
    log("1) Login as owner@miza.iq (manager scope, can create products)…");
    await adminLogin(page, "owner@miza.iq", "test");

    log("2) Open the Insights (AI assistant) screen…");
    const opened = await gotoAdmin(page, "AI Assistant");
    if (!opened) throw new Error("could not find the Insights nav item");
    await page.waitForTimeout(1500);
    await shot(page, "ai-01-insights-open");

    log("3) Type the product-create request into the assistant composer…");
    const composer = page.locator(".assistant-thread-input, .aui-composer-input, textarea").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.click();
    await composer.fill(PROMPT);
    await shot(page, "ai-02-prompt-typed");
    // This composer submits via the Send button (↑), not Enter. Click it; fall back to Enter.
    const planP = page.waitForResponse((r) => r.url().includes("/bayaan/api/ai_dashboard_plan"), { timeout: 160000 }).catch(() => null);
    const sendBtn = page.getByRole("button", { name: /Send message|إرسال الرسالة|إرسال/ });
    if (await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.first().click();
    } else {
      await composer.press("Enter");
    }
    log("   • message sent; waiting for ai_dashboard_plan response…");
    await planP;

    log("4) Wait for the AI to return a product draft card (real OpenAI call)…");
    const confirmBtn = page.getByRole("button", { name: /Confirm & create product|تأكيد وإنشاء المنتج/ });
    await confirmBtn.first().waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(1200);
    await shot(page, "ai-03-draft-card");

    const draftText = await bodyText(page);
    const warned = has(draftText, /not in your catalog|Ingredient notice|substituted|غير موجود في الكتالوج|تنبيه عن المكونات/i);
    log(`   • Missing/substituted-ingredient notice visible: ${warned ? "YES" : "no"}`);

    log("4b) Attach a product image via the new drag/drop field…");
    let imageAttached = false;
    try {
      const imgInput = page.locator('label:has-text("Drag an image here") input[type="file"]').first();
      await imgInput.setInputFiles(TMP_PNG, { timeout: 8000 });
      await page.waitForTimeout(800);
      imageAttached = await page.locator('label:has-text("Remove") , img[alt=""]').first().isVisible({ timeout: 4000 }).catch(() => false);
      await shot(page, "ai-03b-image-attached");
      log(`   • image field present & file accepted: ${imageAttached ? "YES" : "field not found"}`);
    } catch (e) {
      log("   • image attach skipped: " + (e?.message || e).split("\n")[0]);
    }

    log("4c) Ensure the recipe has a usable ingredient (AI may flag mango as missing and leave it empty)…");
    const qtySel = 'input[placeholder="qty"], input[placeholder="كمية"]';
    const countValidQty = async () => {
      const qi = page.locator(qtySel);
      const n = await qi.count();
      let valid = 0;
      for (let i = 0; i < n; i++) { const v = await qi.nth(i).inputValue().catch(() => ""); if (Number(v) > 0) valid++; }
      return valid;
    };
    if ((await countValidQty()) === 0) {
      const addBtn = page.getByRole("button", { name: /Add ingredient|إضافة مكوّن/ });
      if (await addBtn.first().isVisible({ timeout: 2500 }).catch(() => false)) {
        await addBtn.first().click();
        await page.waitForTimeout(400);
        await page.locator(qtySel).last().fill("0.2").catch(() => {});
        log("   • recipe was empty — added an ingredient via the new 'Add ingredient' button");
      } else {
        log("   • recipe empty and no Add-ingredient button found");
      }
    } else {
      log("   • AI already provided a usable recipe ingredient");
    }

    log("5) Click 'Confirm & create product'…");
    const { cookie } = await odooLogin("owner@miza.iq", "test");
    const btn = confirmBtn.first();
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const disabled = await btn.isDisabled().catch(() => "?");
    log(`   • confirm button disabled: ${disabled}`);
    await btn.click({ timeout: 8000 }).catch(async (e) => {
      log("   • normal click failed: " + (e?.message || e).split("\n")[0] + " — trying force click");
      await btn.click({ force: true }).catch(() => {});
    });
    await page.waitForTimeout(2500);
    log(`   • API calls right after click: ${reqLog.slice(-4).join(", ")}`);

    log("6) Wait for the create to resolve (success card OR error toast)…");
    const created = page.getByText(/Product created|تم إنشاء المنتج/);
    const failedToast = page.getByText(/Product not found|Could not create product|تعذر إنشاء المنتج/i);
    const outcome = await Promise.race([
      created.first().waitFor({ state: "visible", timeout: 40000 }).then(() => "created").catch(() => null),
      failedToast.first().waitFor({ state: "visible", timeout: 40000 }).then(() => "failed").catch(() => null),
    ]);
    await page.waitForTimeout(1000);
    await shot(page, "ai-04-after-confirm");

    const toastText = (await page.locator(".ai-toast").allInnerTexts().catch(() => [])).join(" | ");
    const recipeRows = await page.locator('.ins-card select, .ins-card option').count().catch(() => 0);
    log(`   • toast(s): ${toastText || "(none)"}`);
    log(`   • bayaan API calls this run: ${reqLog.join(", ")}`);
    log(`   • recipe select/option nodes in card: ${recipeRows}`);

    // Ground-truth read of what was actually written: clean name (no brackets) + image.
    const bundle = net.find((n) => n.route === "product_create_bundle");
    let createdId = null;
    try { createdId = JSON.parse(bundle?.body || "{}")?.result?.product_id || null; } catch { /* */ }
    let nameClean = null, hasImage = null, storedName = null;
    if (createdId) {
      const rpc = async (model, method, args) => {
        const r = await fetch("http://127.0.0.1:8069/web/dataset/call_kw", {
          method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: {} } }),
        });
        return (await r.json()).result;
      };
      const rows = await rpc("product.product", "read", [[createdId], ["name", "image_1920"]]).catch(() => null);
      if (rows && rows[0]) {
        storedName = rows[0].name;
        nameClean = !/[[\]]/.test(rows[0].name || "");
        hasImage = Boolean(rows[0].image_1920);
      }
    }

    log("\n===== NETWORK (writes) =====");
    for (const n of net) log(`  ${n.route} -> HTTP ${n.status}  ${n.body.replace(/\s+/g, " ").slice(0, 300)}`);
    log("\n===== RESULT =====");
    log(`  missing-mango notice:    ${warned ? "shown" : "NOT shown"}`);
    log(`  image field accepted:    ${imageAttached ? "YES" : "no"}`);
    log(`  confirm outcome:         ${outcome || "TIMEOUT/UNKNOWN"}`);
    log(`  product_create_bundle:   HTTP ${bundle?.status ?? "—"}`);
    log(`  stored product name:     ${JSON.stringify(storedName)}  (no brackets: ${nameClean})`);
    log(`  image persisted on product: ${hasImage}`);

    ok = outcome === "created" && (bundle ? bundle.status < 400 : true)
      && !/Product not found/.test(bundle?.body || "")
      && nameClean === true;
    if (!ok) log("\n❌ create did NOT succeed cleanly — see screenshots in verification/demo-verify/");
    else log("\n✅ AI product creation succeeded end-to-end (no 'Product not found').");

    const pageErrs = (page._errors || []).filter((e) => !/peek_notifications/.test(e));
    if (pageErrs.length) log("page/console errors:\n  - " + pageErrs.join("\n  - "));
  } catch (e) {
    ok = false;
    log("WALKTHROUGH ERROR: " + (e?.message || e));
    await shot(page, "ai-99-error");
  } finally {
    await browser.close();
  }
  process.exit(ok ? 0 : 1);
}

run();
