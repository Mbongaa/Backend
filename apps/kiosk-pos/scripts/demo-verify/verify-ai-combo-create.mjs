// Live walkthrough: ask the AI to create a COMBO of existing products (Cappuccino +
// Cheesecake) and verify the fix — it must come out as a 'recipe'-mode product (no
// standalone stock SKU) whose stored recipe is EXPANDED into real stock items
// (cappuccino's raw ingredients + 1 cheesecake), not a phantom "1 Cappuccino" line.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, has, odooLogin } from "./lib.mjs";

const PROMPT = "Create a combo that sells one Cappuccino and one Cheesecake slice together for 8000 IQD";

async function run() {
  const browser = await launch();
  const page = await makePage(browser);
  const net = [];
  page.on("response", async (r) => {
    if (r.url().includes("/bayaan/api/product_create_bundle")) {
      let body = ""; try { body = await r.text(); } catch { /* */ }
      net.push({ status: r.status(), body });
    }
  });
  const log = (m) => console.log(m);
  let ok = true;
  try {
    log("1) owner login + open AI Assistant…");
    await adminLogin(page, "owner@miza.iq", "test");
    await gotoAdmin(page, "AI Assistant");
    await page.waitForTimeout(1500);

    log("2) ask the AI to create the combo…");
    const composer = page.locator(".assistant-thread-input, .aui-composer-input, textarea").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.click();
    await composer.fill(PROMPT);
    const sendBtn = page.getByRole("button", { name: /Send message|إرسال/ });
    if (await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) await sendBtn.first().click();
    else await composer.press("Enter");

    log("3) wait for the draft card…");
    const confirmBtn = page.getByRole("button", { name: /Confirm & create product|تأكيد وإنشاء المنتج/ });
    await confirmBtn.first().waitFor({ state: "visible", timeout: 150000 });
    await page.waitForTimeout(1200);
    await shot(page, "combo-01-draft");

    const draftText = await bodyText(page);
    const modeShownRecipe = /Recipe \(deduct ingredients\)/i.test(draftText);
    log(`   • draft mode shows 'Recipe (deduct ingredients)': ${modeShownRecipe}`);

    // Make sure at least one ingredient line has a qty (AI should reference the two products).
    const qtySel = 'input[placeholder="qty"], input[placeholder="كمية"]';
    const qi = page.locator(qtySel); const n = await qi.count();
    let valid = 0; for (let i = 0; i < n; i++) { const v = await qi.nth(i).inputValue().catch(() => ""); if (Number(v) > 0) valid++; }
    if (valid === 0) {
      const addBtn = page.getByRole("button", { name: /Add ingredient|إضافة مكوّن/ });
      if (await addBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) { await addBtn.first().click(); await page.waitForTimeout(400); await page.locator(qtySel).last().fill("1").catch(() => {}); }
    }

    log("4) confirm & create…");
    const { cookie } = await odooLogin("owner@miza.iq", "test");
    await confirmBtn.first().click();
    const created = page.getByText(/Product created|تم إنشاء المنتج/);
    const outcome = await Promise.race([
      created.first().waitFor({ state: "visible", timeout: 40000 }).then(() => "created").catch(() => null),
      page.getByText(/Product not found|Could not create product/i).first().waitFor({ state: "visible", timeout: 40000 }).then(() => "failed").catch(() => null),
    ]);
    await page.waitForTimeout(1200);
    await shot(page, "combo-02-after-confirm");

    // Ground-truth: read the created combo's mode + stored recipe.
    const bundle = net.find(Boolean);
    let pid = null; try { pid = JSON.parse(bundle?.body || "{}")?.result?.product_id; } catch { /* */ }
    const rpc = async (m, me, a, k = {}) => {
      const r = await fetch("http://127.0.0.1:8069/web/dataset/call_kw", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: m, method: me, args: a, kwargs: k } }) });
      return (await r.json()).result;
    };
    let mode = null, lines = [];
    if (pid) {
      const tmpl = (await rpc("product.product", "read", [[pid], ["product_tmpl_id", "name"]]))[0];
      mode = (await rpc("product.template", "read", [[tmpl.product_tmpl_id[0]], ["bayaan_consumption_mode"]]))[0].bayaan_consumption_mode;
      const rec = (await rpc("bayaan.recipe", "search_read", [[["product_id", "=", pid], ["state", "=", "active"]], ["line_ids"]]))[0];
      if (rec) lines = await rpc("bayaan.recipe.line", "search_read", [[["id", "in", rec.line_ids]], ["ingredient_id", "qty", "uom_id"]]);
    }
    const lineNames = lines.map((l) => l.ingredient_id[1]);
    const expanded = lineNames.some((x) => /RAW-/.test(x)) && lineNames.some((x) => /CHEESECAKE/i.test(x));
    const noPhantom = !lineNames.some((x) => /\bCappuccino\b/i.test(x) && !/RAW-/.test(x));

    log("\n===== RESULT =====");
    log(`  confirm outcome:           ${outcome}`);
    log(`  product_create_bundle:     HTTP ${bundle?.status ?? "—"}`);
    log(`  stored consumption mode:   ${mode}  (want: recipe)`);
    log(`  stored recipe lines:       ${JSON.stringify(lineNames)}`);
    log(`  expanded (raw + cheesecake): ${expanded}`);
    log(`  no phantom 'Cappuccino' line: ${noPhantom}`);

    ok = outcome === "created" && mode === "recipe" && expanded && noPhantom;
    log(ok ? "\n✅ Combo created as recipe-mode with EXPANDED real-stock recipe — no standalone stock SKU."
          : "\n❌ Combo did not come out as expected — see screenshots.");
    const errs = (page._errors || []).filter((e) => !/peek_notifications/.test(e));
    if (errs.length) log("page errors:\n  - " + errs.join("\n  - "));
  } catch (e) {
    ok = false; log("ERROR: " + (e?.message || e)); await shot(page, "combo-99-error");
  } finally { await browser.close(); }
  process.exit(ok ? 0 : 1);
}
run();
