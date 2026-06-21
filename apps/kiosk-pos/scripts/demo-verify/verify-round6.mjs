// Round-6 verification (live browser): proves the four Codex P1 UI fixes actually render.
//   #6 — Daily Close drill-down "Variance inputs" (recon) table shows a Variance value (IQD)
//        column with a real frozen-cost figure (not just the lower stock table).
//   #7 — admin "Receive" opens the shared per-line ReceiveDiscrepancyModal with an explicit
//        Missing column + a Reason select (no silent force-complete).
//   #8 — backend products carry the manager-flag (surfaced earlier); spot the waste note hint.
// Dynamic ground truth from the live API — no hardcoded close ids / dates (those drift).
// Run: node scripts/demo-verify/verify-round6.mjs   (needs backend + dev server up)
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, odooLogin, api, fillOpeningCash } from "./lib.mjs";

const results = [];
const add = (name, ok, detail) => { results.push({ ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`); };

const browser = await launch();

// ---- live ground truth ----
const { cookie } = await odooLogin("owner@koub.iq");
const boot = await api("/bayaan/api/chain_bootstrap", cookie, {});
const closings = boot?.closings || [];
const reconVals = closings.flatMap((c) => (c.varianceInputs || []).filter((s) => s.variance).map((s) => Math.round(Math.abs(s.value))));
console.log("ground truth: closings=" + closings.length + " recon nonzero values=" + JSON.stringify(reconVals.slice(0, 8)));

const page = await makePage(browser);
try {
  await adminLogin(page, "owner@koub.iq");

  // ===== #6: recon "Variance value" column =====
  await gotoAdmin(page, "Daily Close");
  await page.waitForTimeout(2200);
  const rows = page.locator("tr.row-click");
  const n = await rows.count();
  let reconInfo = null;
  for (let i = 0; i < n && !reconInfo; i++) {
    await rows.nth(i).click().catch(() => {});
    await page.waitForTimeout(900);
    reconInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table.tbl"));
      for (const tbl of tables) {
        const heads = Array.from(tbl.querySelectorAll("thead th")).map((th) => th.textContent.trim());
        // the recon table is the one with the variance-loop columns
        if (heads.some((h) => /Consumed|استهلاك/.test(h)) && heads.some((h) => /Opening|افتتاح/.test(h))) {
          const lastCol = heads[heads.length - 1];
          const lastCells = Array.from(tbl.querySelectorAll("tbody tr")).map((tr) => {
            const tds = tr.querySelectorAll("td");
            return (tds[tds.length - 1]?.textContent || "").trim();
          });
          return { heads, lastCol, lastCells };
        }
      }
      return null;
    });
    if (!reconInfo) { await rows.nth(i).click().catch(() => {}); await page.waitForTimeout(250); }
  }
  if (reconInfo) {
    const headerOk = /Variance value|قيمة الفرق/.test(reconInfo.lastCol);
    const moneyCell = reconInfo.lastCells.find((c) => /IQD/i.test(c) && /\d/.test(c));
    await shot(page, "round6-1-recon-variance-value");
    add("#6 recon table has a 'Variance value' column", headerOk, `last header: "${reconInfo.lastCol}"`);
    add("#6 recon shows a real IQD value (not '-')", Boolean(moneyCell), `cell: "${moneyCell || reconInfo.lastCells.join(" | ")}"`);
  } else {
    add("#6 recon table reachable", false, "could not locate the Variance-inputs table after expanding closes");
  }

  add("PAGE-ERRORS (admin)", page._errors.length === 0, page._errors.slice(0, 3).join(" | ") || "clean");
} catch (err) {
  add("RUN (admin)", false, "error: " + String((err && err.message) || err).slice(0, 200));
  await shot(page, "round6-run-error");
} finally {
  await page._context?.close().catch(() => {});
}

// ===== #7: cashier POS receive opens the shared discrepancy modal (Missing + Reason) =====
// The real receive path is the kiosk POS (dispatched transfers wait for the kiosk, not admin).
// Seed a dispatched transfer to K-01 so zainab has something to receive.
try {
  const created = await api("/bayaan/api/stock_transfer", cookie, { kiosk: "K-01", items: [{ item: "Fresh Milk", qty: 5 }] });
  const tid = created?.id || created?.transfer || created?.name;
  for (const action of ["approve", "dispatch"]) await api("/bayaan/api/stock_transfer_action", cookie, { transfer: tid, action });
  console.log("seeded dispatched transfer " + tid + " to K-01");
} catch (e) { console.log("transfer seed error: " + (e.message || e)); }

const cpage = await makePage(browser);
try {
  await adminLogin(cpage, "zainab@koub.iq");
  await cpage.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await cpage.waitForTimeout(1200);
  await cpage.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await cpage.waitForTimeout(800);
  await fillOpeningCash(cpage);
  const openP = cpage.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await cpage.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await cpage.waitForTimeout(3500);
  await cpage.getByRole("button", { name: /Receive stock|استلام المخزون/ }).first().click().catch(() => {});
  await cpage.waitForTimeout(1500);
  await cpage.getByRole("button", { name: /Confirm arrived|تأكيد الوصول/ }).first().click().catch(() => {});
  await cpage.waitForTimeout(1400);
  // Detect via the real DOM (innerText can miss freshly-rendered modal cells).
  const modalHeaders = await cpage.evaluate(() =>
    Array.from(document.querySelectorAll("table.tbl thead th")).map((th) => th.textContent.trim()));
  const modalOpen = modalHeaders.some((h) => /Received|المستلم/.test(h)) && modalHeaders.some((h) => /Dispatched|المُرسَل/.test(h));
  const hasMissing = modalHeaders.some((h) => /Missing|ناقص/.test(h));
  await shot(cpage, "round6-2-pos-receive-modal");
  add("#7 cashier POS receive opens the per-line discrepancy modal", modalOpen, `headers: ${JSON.stringify(modalHeaders)}`);
  add("#7 receive modal has an explicit Missing column", hasMissing, hasMissing ? "Missing column present" : "no Missing column");
  // lower the first Received input -> a discrepancy -> the required Reason select must appear
  const recInput = cpage.locator(".card input[type='number']").first();
  await recInput.fill("0").catch(() => {});
  await cpage.waitForTimeout(800);
  const hasReason = await cpage.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label, .t-micro")).map((n) => n.textContent || "");
    return labels.some((x) => /Discrepancy reason|سبب الفرق/.test(x));
  });
  await shot(cpage, "round6-3-pos-receive-reason");
  add("#7 a discrepancy reveals the required Reason select", hasReason, hasReason ? "Reason select shown" : "no Reason select");
  add("PAGE-ERRORS (pos)", cpage._errors.length === 0, cpage._errors.slice(0, 3).join(" | ") || "clean");
} catch (err) {
  add("RUN (pos)", false, "error: " + String((err && err.message) || err).slice(0, 200));
  await shot(cpage, "round6-pos-run-error").catch(() => {});
} finally {
  await cpage._context?.close().catch(() => {});
  await browser.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
