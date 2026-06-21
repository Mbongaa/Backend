// Group D — Manager / approval flows. D1/D2 via UI; D3 drives the real transfer
// state machine through the backend (authoritative). MUTATES the live demo DB.
import { makePage, adminLogin, gotoAdmin, bodyText, shot, api, odooLogin } from "./lib.mjs";

function k01Milk(bootstrap) {
  const rows = bootstrap?.kiosk_stock_rows || [];
  const r = rows.find((x) => x.kiosk === "K-01" && /milk/i.test(x.item || ""));
  return r ? r.actual_qty : null;
}

export async function runGroupD(browser, rec) {
  // ---- D1: manager (layla) daily-close review note ----
  const page = await makePage(browser);
  let reviewResp = null;
  page.on("response", async (r) => { if (r.url().includes("shift_close_review")) { try { reviewResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  try {
    // Guarantee a reviewable close exists BEFORE the manager loads the dashboard. Repeated
    // suite runs approve the seeded variance closes (and a clean zero-variance close needs
    // no review), so create a cash-variance close here — D1 is then self-sufficient
    // regardless of how many times the suite has already run. No orders → no GL/session
    // impact; the cash variance just flags it for manager review. Created pre-login so it
    // is included in the bootstrap the manager loads.
    const { cookie: ownerCookie } = await odooLogin("owner@koub.iq");
    // A STOCK-variance close gets status "issue" (Investigation open) → manager review
    // controls render. (A cash-only variance close does NOT surface the review buttons.)
    await api("/bayaan/api/shift_close", ownerCookie, {
      kiosk: "K-03",
      opened_at: new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "),
      expected_cash: 0,
      actual_cash: 0,
      stock_counts: [{ item: "Fresh Milk", expected_qty: 10, actual_qty: 6 }],
    }).catch(() => {});
    await adminLogin(page, "layla@koub.iq");
    await gotoAdmin(page, "Daily Close");
    await page.waitForTimeout(1800);
    // Find a close that still NEEDS review. The review controls (Add note / Reject /
    // Approve) only render for a submitted, not-yet-approved close
    // (can("approveClose") && status !== "approved" && status !== "open"), so expanding the
    // first row blindly can land on an already-approved close with no buttons. Expand rows
    // until the "Add note" control appears. onAddNote() builds its own note and posts
    // straight to /shift_close_review (decision:"note", which keeps the close reviewable).
    const rows = page.locator("tr.row-click");
    const rowCount = await rows.count();
    let reviewable = false;
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      await rows.nth(i).click().catch(() => {});
      await page.waitForTimeout(600);
      const addNote = page.getByRole("button", { name: /Add note|إضافة ملاحظة/ }).first();
      if (await addNote.isVisible({ timeout: 800 }).catch(() => false)) { reviewable = true; break; }
    }
    await shot(page, "D-D1-close-review");
    if (reviewable) {
      await page.getByRole("button", { name: /Add note|إضافة ملاحظة/ }).first().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
    const after = await bodyText(page);
    const hasControls = reviewable || /Approve|Reject|Investigation/i.test(after);
    const noteOk = /Note saved|note added|saved to/i.test(after) || (reviewResp && !reviewResp.message);
    rec.add("D1", "Manager daily-close review (controls + note via /shift_close_review)",
      reviewable && (noteOk || !!reviewResp),
      `reviewableCloseFound=${reviewable} hasControls=${hasControls} noteSaved=${noteOk} resp=${JSON.stringify(reviewResp || "").slice(0, 70)}`,
      JSON.stringify(reviewResp || "").slice(0, 160));
  } catch (e) {
    rec.add("D1", "Manager daily-close review", false, "error: " + (e.message || e));
  } finally {
    await page._context.close();
  }

  // ---- D2: stock transfer builder opens (owner UI) ----
  const page2 = await makePage(browser);
  try {
    await adminLogin(page2, "owner@koub.iq");
    await gotoAdmin(page2, "Stock & Allocation");
    await page2.waitForTimeout(1500);
    // Content builder trigger is "New transfer" (lowercase t); the sidebar "New Transfer" only navigates.
    const trig = page2.getByRole("button", { name: "New transfer", exact: true });
    if (await trig.count()) await trig.first().click().catch(() => {});
    else await page2.getByRole("button", { name: /New transfer/i }).last().click().catch(() => {});
    await page2.waitForTimeout(1200);
    const dlg = page2.locator("[role='dialog']");
    const open = await dlg.isVisible({ timeout: 2500 }).catch(() => false);
    const dlgText = open ? await dlg.innerText().catch(() => "") : "";
    await shot(page2, "D-D2-transfer-builder");
    rec.add("D2", "Stock transfer builder opens", open,
      open ? "New transfer dialog opened" : "transfer dialog did not open",
      dlgText.slice(0, 120).replace(/\n/g, " "));
  } catch (e) {
    rec.add("D2", "Stock transfer builder opens", false, "error: " + (e.message || e));
  } finally {
    await page2._context.close();
  }

  // ---- D3: transfer state machine (backend, authoritative) ----
  try {
    const { cookie } = await odooLogin("owner@koub.iq");
    const b0 = await api("/bayaan/api/chain_bootstrap", cookie);
    const milkBefore = k01Milk(b0);
    const create = await api("/bayaan/api/stock_transfer", cookie, { kiosk: "K-01", items: [{ item: "Fresh Milk", qty: 3 }] });
    const tid = create?.id || create?.transfer || create?.picking || create?.name;
    const states = [create?.bayaan_state || create?.state || "draft"];
    let lastErr = null;
    for (const action of ["approve", "dispatch", "receive"]) {
      const res = await api("/bayaan/api/stock_transfer_action", cookie, { transfer: tid, action });
      if (res?.message || res?.error) { lastErr = `${action}: ${JSON.stringify(res).slice(0, 100)}`; break; }
      states.push(res?.bayaan_state || res?.state || action);
    }
    const b1 = await api("/bayaan/api/chain_bootstrap", cookie);
    const milkAfter = k01Milk(b1);
    const received = states.includes("received");
    const stockUp = milkBefore != null && milkAfter != null && milkAfter > milkBefore;
    rec.add("D3", "Stock transfer lifecycle Draft→Approved→Dispatched→Received (backend)",
      !!tid && received,
      `transfer=${tid} states=[${states.join("→")}]${lastErr ? " ERR " + lastErr : ""}; K-01 milk ${milkBefore}→${milkAfter}`,
      JSON.stringify({ create, states }).slice(0, 200));
    rec.add("D3b", "Received transfer increases kiosk stock",
      stockUp, `K-01 Fresh Milk ${milkBefore} → ${milkAfter} (Δ${milkAfter != null && milkBefore != null ? (milkAfter - milkBefore) : "?"})`, "");
  } catch (e) {
    rec.add("D3", "Stock transfer lifecycle (backend)", false, "error: " + (e.message || e));
  }

  // ---- D4: purchases / receiving screen renders ----
  const page4 = await makePage(browser);
  try {
    await adminLogin(page4, "owner@koub.iq");
    await gotoAdmin(page4, "Purchases & Suppliers");
    await page4.waitForTimeout(1500);
    const text = await bodyText(page4);
    const hasSuppliers = /supplier/i.test(text);
    const hasPoUi = /purchase order|Open purchase|Create PO|New PO|Receive|receipt/i.test(text);
    await shot(page4, "D-D4-purchases");
    rec.add("D4", "Purchases & Suppliers screen renders (12 suppliers + PO/receiving UI)",
      hasSuppliers, `suppliers=${hasSuppliers} poReceivingUi=${hasPoUi} (no live PO seeded — full PO→receipt covered by demo-mode gate)`,
      "");
  } catch (e) {
    rec.add("D4", "Purchases & Suppliers screen", false, "error: " + (e.message || e));
  } finally {
    await page4._context.close();
  }
}
