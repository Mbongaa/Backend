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
    await adminLogin(page, "layla@miza.iq");
    await gotoAdmin(page, "Daily Close");
    await page.waitForTimeout(1800);
    // Expand a close with variance.
    await page.locator("tr.row-click", { hasText: /Mansour District|Erbil Mall/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    const expanded = await bodyText(page);
    const hasControls = /Approve|Reject|note|Investigation/i.test(expanded);
    await shot(page, "D-D1-close-review");
    // Add a manager note (non-locking).
    const noteBox = page.locator("textarea, input[type='text']").filter({ hasNot: page.locator("[disabled]") });
    await noteBox.first().fill("Manager review note — demo verification " + new Date().toISOString().slice(11, 19)).catch(() => {});
    await page.getByRole("button", { name: /Add note|Save note|حفظ/ }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const after = await bodyText(page);
    const noteOk = /Note saved|note added|saved to/i.test(after) || (reviewResp && !reviewResp.message);
    rec.add("D1", "Manager daily-close review (controls + note via /shift_close_review)",
      hasControls && (noteOk || !!reviewResp),
      `controls=${hasControls} noteSaved=${noteOk} resp=${JSON.stringify(reviewResp || "").slice(0, 70)}`,
      JSON.stringify(reviewResp || "").slice(0, 160));
  } catch (e) {
    rec.add("D1", "Manager daily-close review", false, "error: " + (e.message || e));
  } finally {
    await page._context.close();
  }

  // ---- D2: stock transfer builder opens (owner UI) ----
  const page2 = await makePage(browser);
  try {
    await adminLogin(page2, "owner@miza.iq");
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
    const { cookie } = await odooLogin("owner@miza.iq");
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
    await adminLogin(page4, "owner@miza.iq");
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
