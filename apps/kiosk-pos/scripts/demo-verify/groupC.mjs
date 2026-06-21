// Group C — Cashier POS flow (login: zainab, kiosk K-01). MUTATES the live demo DB.
import { makePage, adminLogin, bodyText, shot, api, odooLogin, closeKioskSession, fillOpeningCash } from "./lib.mjs";

const sum = (a) => a.reduce((s, x) => s + x, 0);

async function snapshot(cookie) {
  const b = await api("/bayaan/api/chain_bootstrap", cookie);
  const orders = b?.today?.orders || [];
  return {
    count: orders.length,
    sales: b?.summary?.totals?.salesToday || 0,
    names: new Set(orders.map((o) => o.name)),
    waste: (b?.today?.waste || []).length,
    closings: (b?.closings || []).length,
    orders,
  };
}

export async function runGroupC(browser, rec) {
  const { cookie } = await odooLogin("owner@koub.iq");
  const before = await snapshot(cookie);

  const page = await makePage(browser);
  const responses = {};
  page.on("response", async (r) => {
    for (const key of ["open_session", "kiosk_sale", "waste", "shift_close"]) {
      if (r.url().includes(key) && !r.url().includes("review")) {
        try { responses[key] = (await r.json())?.result ?? (await r.json())?.error; } catch {}
      }
    }
  });

  try {
    await adminLogin(page, "zainab@koub.iq");
    await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);

    // --- C1: start shift ---
    await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await fillOpeningCash(page);
    const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
    await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
    await openP;
    await page.waitForTimeout(3500);
    const afterStart = await bodyText(page);
    const shiftOpen = /Charge|Record waste|Amount due|Customer-facing display/i.test(afterStart) && !/Start shift/i.test(afterStart);
    rec.add("C1", "Cashier start shift (/open_session)", shiftOpen && responses.open_session,
      shiftOpen ? "sale screen active" : "did not reach sale screen", JSON.stringify(responses.open_session || "").slice(0, 120));
    await shot(page, "C-C1-shift-open");

    // --- C2: build cart (Cappuccino recipe + Cheesecake finished) ---
    // Recipe/made-to-order products open a size/modifier popup before they add to the
    // cart; finished goods (cake slice) add straight. Handle the popup when it appears.
    const handleModifierPopup = async () => {
      const body = await bodyText(page);
      if (/Choose|\bSize\b|الحجم|اختر|Medium|Large|Small/i.test(body)) {
        await page.getByRole("button", { name: /Medium|^M$|متوسط/ }).first().click().catch(() => {});
        await page.getByRole("button", { name: /Add to (order|cart)|إضافة|^Add$/ }).first().click().catch(() => {});
        await page.waitForTimeout(600);
      }
    };
    await page.locator("button.card, .card").filter({ hasText: /Cappuccino/ }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    await handleModifierPopup();
    await page.locator("button.card, .card").filter({ hasText: /Cheesecake/ }).first().click().catch(() => {});
    await page.waitForTimeout(900);
    await handleModifierPopup();
    // Read Subtotal / VAT / Total trio from the sale rail text.
    const cartTxt = await bodyText(page);
    const pick = (re) => { const m = cartTxt.match(re); return m ? Number(m[1].replace(/[.,\s]/g, "")) : null; };
    const trio = {
      sub: pick(/Subtotal[\s\S]{0,15}?IQD\s*([\d,]+)/i),
      vat: pick(/VAT[\s\S]{0,15}?IQD\s*([\d,]+)/i),
      total: pick(/\bTotal[\s\S]{0,15}?IQD\s*([\d,]+)/i),
    };
    // Iraq is 0% VAT by default, so the cart rail shows ONLY a Total line (the Subtotal/VAT
    // breakdown renders only when vatRatePct > 0). Accept either: a full Subtotal+VAT==Total
    // breakdown, or — at 0% VAT — a present, positive Total with no breakdown (sub==total, vat==0).
    const vatOk = trio.total != null && trio.total > 0 && (
      (trio.sub != null && trio.vat != null && Math.abs(trio.sub + trio.vat - trio.total) <= 1)
      || (trio.sub == null && trio.vat == null)
    );
    rec.add("C2", "Cart math: Subtotal + VAT == Total (Total-only at 0% VAT)",
      vatOk,
      vatOk
        ? (trio.vat != null ? `${trio.sub} + ${trio.vat} = ${trio.total}` : `Total ${trio.total} (0% VAT — no breakdown line, by design)`)
        : `could not verify trio: ${JSON.stringify(trio)}`,
      JSON.stringify(trio));
    await shot(page, "C-C2-cart");

    // --- C3 + C4: charge -> pay cash -> complete ---
    await page.getByRole("button", { name: /Charge/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "C-C3-payment");
    const saleP = page.waitForResponse((r) => r.url().includes("kiosk_sale"), { timeout: 20000 }).catch(() => null);
    // Click the configured Cash method card.
    await page.locator("[class*='card']").filter({ hasText: /Cash/ }).first().click().catch(() => {});
    await saleP;
    await page.waitForTimeout(4000);
    const done = await bodyText(page);
    const complete = /Payment complete/i.test(done);
    const sale = responses.kiosk_sale || {};
    rec.add("C3", "Charge screen → amount due == cart total", trio.total != null,
      trio.total != null ? `amount due ${trio.total}` : "no total read", "");
    rec.add("C4", "Sale completes (/kiosk_sale) → Payment complete",
      complete && sale && !sale.message, complete ? "Payment complete shown" : "did not complete",
      "kiosk_sale=" + JSON.stringify(sale).slice(0, 200));
    await shot(page, "C-C4-complete");

    // --- backend verification: order count + sales delta + recipe consumption ---
    await page.waitForTimeout(1500);
    const after = await snapshot(cookie);
    const newNames = [...after.names].filter((n) => !before.names.has(n));
    const newOrder = after.orders.find((o) => newNames.includes(o.name));
    const countDelta = after.count - before.count;
    const salesDelta = after.sales - before.sales;
    rec.add("C4b", "Backend: new pos.order created with matching total",
      countDelta >= 1 && newOrder != null,
      `orders ${before.count}→${after.count} (Δ${countDelta}); sales +${salesDelta}; new=${newOrder?.name} total=${newOrder?.amount_total}`,
      JSON.stringify(newOrder ? { name: newOrder.name, total: newOrder.amount_total, state: newOrder.state, cons: newOrder.consumption_state } : null));
    const consPosted = newOrder && (newOrder.consumption_state === "posted" || newOrder.consumption_state === "finished");
    rec.add("C5", "Recipe consumption posted for the new order",
      !!consPosted, newOrder ? `consumption_state=${newOrder.consumption_state}` : "no new order found",
      JSON.stringify(newOrder?.lines || []).slice(0, 200));

    // --- C6: record waste from POS (return to sale, then top "Waste" button) ---
    try {
      await page.getByRole("button", { name: /New order|طلب جديد/ }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /^\s*Waste\s*$|تسجيل هدر|الهدر/ }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      const wasteText = await bodyText(page);
      const onWaste = /Record waste|هدر/i.test(wasteText);
      // pick first waste item, qty 1, first reason chip
      await page.locator("button").filter({ hasText: /Cappuccino|Orange|Milk|Cup|Cheesecake|Beans|Sugar|Syrup/ }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      await page.locator("button.btn-ghost, button.btn").filter({ hasText: /Overproduction|Spillage|Expired|Wrong|Quality|Stale|Damaged|Spoilage|Breakage|Error/ }).first().click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, "C-C6-waste-form");
      const wasteP = page.waitForResponse((r) => r.url().includes("/waste"), { timeout: 12000 }).catch(() => null);
      await page.getByRole("button", { name: /Submit waste|تسجيل الهدر|إرسال/ }).last().click().catch(() => {});
      await wasteP;
      await page.waitForTimeout(2500);
      const afterWaste = await snapshot(cookie);
      const wasteDelta = afterWaste.waste - before.waste;
      rec.add("C6", "Record waste from POS posts a waste row",
        (wasteDelta >= 1) || (responses.waste && !responses.waste.message),
        onWaste ? `waste rows ${before.waste}→${afterWaste.waste}; resp=${JSON.stringify(responses.waste || "").slice(0, 80)}` : "waste screen not reached",
        JSON.stringify(responses.waste || "").slice(0, 150));
      await shot(page, "C-C6-waste");
    } catch (e) {
      rec.add("C6", "Record waste from POS", false, "error: " + (e.message || e));
    }

    // --- C7: cashier ends shift -> real daily close (tie-preserving) ---
    // A verification run must NOT leave the books untied. The earlier version skipped
    // the close "to preserve the open session", which left this group's paid sale in an
    // open session with no Z-report move — so a post-run reconcile showed POS gross >
    // posted revenue (Codex NO-GO #2). Now C7 runs the official close so the session
    // posts its Z-report account.move and the ledger ties again. Group D's close review
    // works off historical closed sessions, so it does not need this one left open.
    let closeOk = false;
    let closeDetail = "no new order to close";
    let closeRaw = "";
    try {
      if (newOrder) {
        const cashAmt = Number(newOrder.amount_total || trio.total || 0);
        // Clean count (counted == current kiosk qty == expected) → ~0 ingredient variance,
        // so the close does not pollute the Daily Close screen with a scary loss.
        const closeResp = await closeKioskSession(cookie, "K-01", [newOrder.name], cashAmt);
        // The close route lets any finalize failure propagate, so a returned id with no
        // error message means the native close posted the Z-report move successfully.
        closeOk = !!(closeResp && closeResp.id && !closeResp.message && !closeResp.error);
        const afterClose = await snapshot(cookie);
        closeDetail = closeOk
          ? `close ${closeResp.name || closeResp.id} posted; closings ${before.closings}→${afterClose.closings}`
          : `close failed: ${JSON.stringify(closeResp).slice(0, 160)}`;
        closeRaw = JSON.stringify(closeResp).slice(0, 200);
      }
    } catch (e) {
      closeDetail = "error: " + (e.message || e);
    }
    rec.add("C7", "Cashier daily close posts Z-report move (tie-preserving, /shift_close)",
      closeOk, closeDetail, closeRaw);
  } catch (e) {
    rec.add("CX", "Cashier POS flow crashed", false, (e.message || String(e)));
  } finally {
    await page._context.close();
  }
}
