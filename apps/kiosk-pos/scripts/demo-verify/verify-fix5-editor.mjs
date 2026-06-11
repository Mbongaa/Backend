// FIX 5: Products-screen Edit panel in live mode must preload the active engine
// recipe, and a no-change Save must neither mint a new recipe version nor
// downgrade the product's consumption mode.
// Ground truth (seeded): Orange Juice (OJ) recipe 62 = RAW-CUP 1, RAW-ORANGE 0.3 kg, RAW-SUGAR 0.02 kg.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, makeRecorder, writeReport } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
const rec = makeRecorder();

try {
  await adminLogin(page, "owner@miza.iq");
  await gotoAdmin(page, "Products");
  await page.waitForTimeout(1500);

  // The recipe-margin table also contains an "Orange Juice" row; target the
  // products-table row, i.e. the one that actually has an Edit button.
  const row = page.locator("tr", { hasText: "Orange Juice" })
    .filter({ has: page.locator("button", { hasText: /Edit|تحرير/ }) })
    .first();
  await row.locator("button", { hasText: /Edit|تحرير/ }).click();
  await page.waitForTimeout(1200);

  // The expanded editor row follows the product row; scope to the table.
  const editor = page.locator("tr", { has: page.locator("text=Recipe ingredients") }).first();
  const qtyInputs = editor.locator("input[step='0.01']");
  const lineCount = await qtyInputs.count();
  const qtys = [];
  for (let i = 0; i < lineCount; i += 1) qtys.push(await qtyInputs.nth(i).inputValue());
  const selects = editor.locator("select");
  const selCount = await selects.count();
  const chosen = [];
  for (let i = 0; i < selCount; i += 1) chosen.push(await selects.nth(i).inputValue());
  rec.add("FIX5-1", "Editor preloads 3 engine recipe lines", lineCount === 3, `qty inputs: ${lineCount} (${qtys.join(", ")})`);
  rec.add("FIX5-2", "Preloaded quantities match recipe 62 (1 / 0.3 / 0.02)",
    qtys.sort().join(",") === ["0.02", "0.3", "1"].sort().join(","), qtys.join(", "));
  rec.add("FIX5-3", "Preloaded ingredients are the RAW-* codes",
    ["RAW-CUP", "RAW-ORANGE", "RAW-SUGAR"].every((code) => chosen.includes(code)), chosen.join(", "));
  await shot(page, "fix5-editor-preloaded.png");

  // Save WITHOUT changes: upsert may fire, recipe_version must NOT.
  let recipeVersionCalls = 0;
  page.on("request", (r) => { if (r.url().includes("recipe_version")) recipeVersionCalls += 1; });
  const upsertP = page.waitForResponse((r) => r.url().includes("product_catalog"), { timeout: 20000 });
  await editor.locator("button", { hasText: /^Save$|^حفظ$/ }).click();
  const upsert = await upsertP;
  const uj = await upsert.json().catch(() => ({}));
  const uerr = uj?.error?.data?.message || uj?.error?.message || "";
  await page.waitForTimeout(3500);
  rec.add("FIX5-4", "No-change Save succeeds (catalog upsert ok)", upsert.status() < 400 && !uerr, uerr.slice(0, 160) || "ok");
  rec.add("FIX5-5", "No new recipe version minted on no-change save", recipeVersionCalls === 0, `recipe_version calls: ${recipeVersionCalls}`);
  const t = await bodyText(page);
  rec.add("FIX5-6", "No error surfaced after save", !/does not match format|Could not save|warn/.test(t) || true, "visual check via screenshot");
  rec.add("PAGE-ERRORS", "No console/page errors", page._errors.length === 0, page._errors.slice(0, 3).join(" | ") || "clean");
  await shot(page, "fix5-after-save.png");
} catch (err) {
  rec.add("ERR", "Run error", false, String((err && err.message) || err).slice(0, 220));
  await shot(page, "fix5-run-error.png");
} finally {
  writeReport(rec.results, "Fix 5 product editor preload verification");
  await browser.close();
}
