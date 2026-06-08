// Group G — Gap closure: deferred coverage items (PO receiving, realtime propagation,
// cashier POS close). MUTATES the live demo DB. Re-seed afterward.
import { makePage, adminLogin, gotoAdmin, bodyText, shot, api, odooLogin } from "./lib.mjs";

const milkQty = (b, where) => {
  if (where === "warehouse") {
    const r = (b?.warehouse_stock || []).find((x) => /milk/i.test(x.item || ""));
    return r ? r.actual_qty : null;
  }
  const r = (b?.kiosk_stock_rows || []).find((x) => x.kiosk === "K-01" && /milk/i.test(x.item || ""));
  return r ? r.actual_qty : null;
};

export async function runGroupG(browser, rec) {
  const { cookie } = await odooLogin("owner@miza.iq");

  // ---- G1: purchase order -> confirm -> receive -> warehouse stock up (backend) ----
  try {
    const b0 = await api("/bayaan/api/chain_bootstrap", cookie);
    const supplier = (b0?.suppliers || [])[0]?.name;
    const whBefore = milkQty(b0, "warehouse");
    const create = await api("/bayaan/api/purchase_order", cookie, {
      supplier, items: [{ item: "Fresh Milk", qty: 12, rate: 1200 }],
    });
    const poId = create?.id || create?.po || create?.name;
    const states = [create?.state || "draft"];
    let err = null;
    for (const action of ["confirm", "receive"]) {
      const res = await api("/bayaan/api/purchase_order_action", cookie, { po: poId, action });
      if (res?.message || res?.error) { err = `${action}: ${JSON.stringify(res).slice(0, 100)}`; break; }
      states.push(res?.state || action);
    }
    const b1 = await api("/bayaan/api/chain_bootstrap", cookie);
    const whAfter = milkQty(b1, "warehouse");
    const stockUp = whBefore != null && whAfter != null && whAfter > whBefore;
    rec.add("G1", "Purchase order → confirm → receive increases warehouse stock",
      !!poId && !err && stockUp,
      `po=${poId} supplier=${supplier} states=[${states.join("→")}]${err ? " ERR " + err : ""}; warehouse milk ${whBefore}→${whAfter}`,
      JSON.stringify({ poId, states }).slice(0, 160));
  } catch (e) {
    rec.add("G1", "Purchase order receiving lifecycle", false, "error: " + (e.message || e));
  }

  // ---- G2: realtime propagation — a backend sale must appear on the admin dashboard
  //          WITHOUT a manual refresh (CLAUDE.md release gate) ----
  const owner = await makePage(browser);
  const cashier = await makePage(browser);
  try {
    await adminLogin(owner, "owner@miza.iq");
    await gotoAdmin(owner, "Today Command");
    await owner.waitForTimeout(2000);
    const readSales = async () => {
      const t = await bodyText(owner);
      const m = t.match(/TOTAL SALES TODAY[\s\S]{0,40}?IQD\s*([\d,]+)/i) || t.match(/IQD\s*([\d,]+)[\s\S]{0,30}?PROFIT ESTIMATE/i);
      return m ? Number(m[1].replace(/[,\s]/g, "")) : null;
    };
    const before = await readSales();

    // Cashier makes a real sale (emits the realtime event after the backend write).
    await adminLogin(cashier, "zainab@miza.iq");
    await cashier.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
    await cashier.waitForTimeout(1200);
    await cashier.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
    await cashier.waitForTimeout(800);
    const openP = cashier.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
    await cashier.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
    await openP; await cashier.waitForTimeout(3000);
    await cashier.locator("button.card, .card").filter({ hasText: /Orange Juice/ }).first().click().catch(() => {});
    await cashier.waitForTimeout(700);
    const saleP = cashier.waitForResponse((r) => r.url().includes("kiosk_sale"), { timeout: 20000 }).catch(() => null);
    await cashier.getByRole("button", { name: /Charge/ }).first().click().catch(() => {});
    await cashier.waitForTimeout(1200);
    await cashier.locator("[class*='card']").filter({ hasText: /Cash/ }).first().click().catch(() => {});
    await saleP; await cashier.waitForTimeout(2000);

    // Watch the OWNER dashboard update WITHOUT reloading, up to ~20s.
    let after = before, updated = false;
    for (let i = 0; i < 20; i++) {
      await owner.waitForTimeout(1000);
      after = await readSales();
      if (before != null && after != null && after > before) { updated = true; break; }
    }
    await shot(owner, "G-G2-realtime-owner");
    rec.add("G2", "Realtime: backend sale appears on admin dashboard without manual refresh",
      updated, `owner Total-sales tile ${before} → ${after} without reload (${updated ? "updated via stream/poll" : "no update within 20s"})`,
      `before=${before} after=${after}`);
  } catch (e) {
    rec.add("G2", "Realtime propagation", false, "error: " + (e.message || e));
  } finally {
    await cashier._context.close();
    await owner._context.close();
  }

  // ---- G3: cashier POS daily close (deferred C7) ----
  const page = await makePage(browser);
  let closeResp = null;
  page.on("response", async (r) => { if (r.url().includes("shift_close") && !r.url().includes("review")) { try { closeResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  try {
    const b0 = await api("/bayaan/api/chain_bootstrap", cookie);
    const closesBefore = (b0?.closings || []).length;
    await adminLogin(page, "zainab@miza.iq");
    await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
    await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
    await openP; await page.waitForTimeout(3000);
    // End shift -> close screen
    await page.getByRole("button", { name: /End shift|إنهاء الوردية|Close shift/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    const onClose = /Counted cash|Stock count|Submit close|Close shift|إغلاق/i.test(await bodyText(page));
    // Enter a counted-cash figure in the first numeric input, then submit.
    await page.locator("input[inputmode='numeric'], input[type='number'], input.input").first().fill("175000").catch(() => {});
    await shot(page, "G-G3-pos-close");
    const closeP = page.waitForResponse((r) => r.url().includes("shift_close") && !r.url().includes("review"), { timeout: 15000 }).catch(() => null);
    await page.getByRole("button", { name: /Submit close|إرسال الإغلاق/ }).first().click().catch(() => {});
    await closeP;
    await page.waitForTimeout(2500);
    const b1 = await api("/bayaan/api/chain_bootstrap", cookie);
    const closesAfter = (b1?.closings || []).length;
    const posted = (closesAfter > closesBefore) || (closeResp && !closeResp.message && !closeResp.error);
    rec.add("G3", "Cashier POS daily close (/shift_close creates a close)",
      onClose && posted,
      `closeScreen=${onClose} closings ${closesBefore}→${closesAfter} resp=${JSON.stringify(closeResp || "").slice(0, 70)}`,
      JSON.stringify(closeResp || "").slice(0, 160));
  } catch (e) {
    rec.add("G3", "Cashier POS daily close", false, "error: " + (e.message || e));
  } finally {
    await page._context.close();
  }
}
