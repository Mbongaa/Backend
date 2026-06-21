// Accountant controls browser gate — the UI/permission behaviours the automated gates missed
// and Codex caught only via live probes, now permanent regression checks:
//   #10  Ctrl-K palette finds a real POS ORDER (not just sections/kiosks/products).
//   #4   Ctrl-K palette ALSO finds a POS SESSION, a JOURNAL ENTRY and an ACCOUNT (fetched from
//        the live read routes; bootstrap has none of these).
//   #11  Kiosk-detail "Stock health" tier word comes from the stock PERCENT, not op-status.
//   #1   Cashier shift-open shows the kiosk's real cash float (not IQD 0 — the matchesKiosk bug).
//
// Run: node scripts/demo-verify/verify-controls-ui.mjs   (needs backend + dev server up)
import { launch, makePage, adminLogin, gotoAdmin, shot, bodyText, odooLogin, api } from "./lib.mjs";

const tierOf = (pct) => (pct >= 70 ? "ok" : pct >= 50 ? "watch" : "critical");
const unwrap = (r) => (r && r.result ? r.result : r);

(async () => {
  const results = [];
  const add = (name, ok, detail) => { results.push({ ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`); };

  // ---- live ground truth via the API ----
  const { cookie } = await odooLogin("owner@koub.iq");
  const boot = await api("/bayaan/api/chain_bootstrap", cookie, {});
  const orders = boot?.today?.orders || [];
  const orderName = orders[0]?.name || "";
  const orderTerm = (orderName.match(/(\d{3,})\s*$/) || [, ""])[1] || orderName.split(" ").pop();
  const byKiosk = boot?.summary?.reportPeriods?.daily?.byKiosk || boot?.summary?.byKiosk || [];
  const healthiest = [...byKiosk].sort((a, b) => (b.stockHealth || 0) - (a.stockHealth || 0))[0] || {};
  const k01 = (boot?.kiosks || []).find((k) => (k.kiosk_code || k.id) === "K-01") || {};
  const k01Float = Number(k01.retainedFloat || k01.defaultCashFloat || 0);
  // a journal entry, an account code and a POS session to search for
  const journals = unwrap(await api("/bayaan/api/accounting_report", cookie, { payload: { report: "journals", limit: 20 } }))?.rows || [];
  const chart = unwrap(await api("/bayaan/api/accounting_report", cookie, { payload: { report: "chart" } }))?.rows || [];
  const sessions = unwrap(await api("/bayaan/api/pos_session_history", cookie, { payload: { action: "list" } }))?.sessions || [];
  const journalName = journals[0]?.name || "";
  const accountCode = (chart.find((a) => a.code === "400000") || chart[0] || {}).code || "";
  const sessionName = sessions[0]?.name || "";
  console.log(`ground truth: order term=${orderTerm}; healthiest=${healthiest.name}@${healthiest.stockHealth}%; K-01 float=${k01Float}; journal=${journalName}; account=${accountCode}; session=${sessionName}`);

  const browser = await launch();
  const page = await makePage(browser);
  try {
    await adminLogin(page, "owner@koub.iq");
    await page.waitForTimeout(900);

    // ---- #10 + #4: palette finds order / session / journal / account ----
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    const input = page.getByPlaceholder(/orders, sessions|الطلبات|Search kiosks/i).first();
    const paletteOpen = await input.isVisible({ timeout: 3000 }).catch(() => false);
    await page.waitForTimeout(1800); // let the async sessions/journals/accounts fetch settle
    const overlay = () => page.locator("div.card").filter({ has: input }).innerText().catch(() => "");
    const searchFinds = async (term, labelRe) => {
      if (!paletteOpen || !term) return false;
      await input.fill(String(term));
      await page.waitForTimeout(600);
      const t = await overlay();
      return t.includes(String(term)) && labelRe.test(t) && !/No results|لا نتائج/i.test(t);
    };
    const okOrder = await searchFinds(orderTerm, /Order|طلب/i);
    await shot(page, "controls-10-palette-order");
    add("#10 palette finds a POS order", okOrder, `term "${orderTerm}"`);
    const okSession = await searchFinds(sessionName, /session|جلسة/i);
    add("#4 palette finds a POS session", okSession, `term "${sessionName}"`);
    const okJournal = await searchFinds(journalName, /Journal|قيد/i);
    add("#4 palette finds a journal entry", okJournal, `term "${journalName}"`);
    const okAccount = await searchFinds(accountCode, /Account|حساب/i);
    await shot(page, "controls-4-palette-account");
    add("#4 palette finds an account", okAccount, `term "${accountCode}"`);
    await page.keyboard.press("Escape").catch(() => {});

    // ---- #11: kiosk detail "Stock health" tier word matches the percent ----
    await gotoAdmin(page, "Kiosks");
    await page.waitForTimeout(900);
    const kioskName = healthiest.name || "";
    await page.locator(".card, tr.row-click").filter({ hasText: new RegExp(kioskName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "controls-11-kiosk-stock-health");
    const kpi = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".analytics-kpi-card"));
      const card = cards.find((c) => /Stock health|صحة المخزون/i.test(c.querySelector(".t-micro")?.textContent || ""));
      if (!card) return null;
      return { value: card.querySelector(".t-num-big")?.textContent || "",
               delta: (card.querySelector(".delta-pos, .delta-neg, .delta-flat")?.textContent || "").trim() };
    });
    if (kpi) {
      const pct = Number((kpi.value.match(/(-?\d+(\.\d+)?)/) || [])[1]);
      const expected = tierOf(pct);
      const ok = new RegExp(expected, "i").test(kpi.delta) && !(pct >= 50 && /critical|حرج/i.test(kpi.delta));
      add("#11 kiosk Stock-health tier word matches the percent", ok, `value=${kpi.value} -> "${expected}"; delta "${kpi.delta}"`);
    } else {
      add("#11 kiosk Stock-health tier word matches the percent", false, "Stock health KPI not found");
    }
  } catch (e) {
    add("verify-controls-ui (owner) run", false, "error: " + (e?.message || e));
  } finally {
    await page._context?.close().catch(() => {});
  }

  // ---- #1: cashier shift-open shows the real cash float (not IQD 0) ----
  const cpage = await makePage(browser);
  try {
    await adminLogin(cpage, "zainab@koub.iq");
    await cpage.waitForTimeout(900);
    await cpage.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
    await cpage.waitForTimeout(1600);
    await cpage.locator("div").filter({ hasText: /^Zainab Hassan/ }).first().click().catch(() => {});
    await cpage.waitForTimeout(1000);
    await shot(cpage, "controls-1-cashier-open-float");
    const body = await bodyText(cpage);
    const m = body.match(/(?:Expected opening|الافتتاح المتوقع)[^\d]*([\d,]+)/);
    const shown = m ? Number(m[1].replace(/,/g, "")) : null;
    const ok = shown != null && shown > 0 && (!k01Float || shown === k01Float);
    add("#1 cashier shift-open shows the real cash float (not 0)", ok,
      shown == null ? "expected-opening text not found on the open screen" : `shows ${shown} (API float ${k01Float})`);
  } catch (e) {
    add("#1 cashier float run", false, "error: " + (e?.message || e));
  } finally {
    await cpage._context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
