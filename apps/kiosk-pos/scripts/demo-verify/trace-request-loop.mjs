// Full request loop driven entirely through the UI, the way the demo runs:
// cashier requests low stock -> warehouse sees "Kiosk request", approves + dispatches
// -> cashier confirms receipt. Proves the end-to-end flow is solid.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, api, odooLogin } from "./lib.mjs";
const log = (m) => console.log("  " + m);
const milk = (b) => { const r = (b?.kiosk_stock_rows || []).find((x) => x.kiosk === "K-01" && /milk/i.test(x.item || "")); return r ? r.actual_qty : null; };

const browser = await launch();
const { cookie } = await odooLogin("owner@koub.iq");
const milkBefore = milk(await api("/bayaan/api/chain_bootstrap", cookie));
log(`K-01 milk starts at ${milkBefore} (low — reorder is 10)`);

// 1) CASHIER requests stock from the POS low-stock alert
console.log("\n1) CASHIER — low-stock alert → Request stock:");
let reqResp = null;
{
  const page = await makePage(browser);
  page.on("response", async (r) => { if (r.url().includes("stock_request")) { try { reqResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  await adminLogin(page, "zainab@koub.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(4000);
  const alert = /low on stock — request from warehouse/i.test(await bodyText(page));
  const reqP = page.waitForResponse((r) => r.url().includes("stock_request"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Request stock|طلب مخزون/ }).first().click().catch(() => {});
  await reqP; await page.waitForTimeout(2500);
  log(`alert shown: ${alert ? "✅" : "❌"}   request created: ${reqResp?.name || JSON.stringify(reqResp).slice(0,50)}`);
  await page._context.close();
}

// 2) WAREHOUSE sees "Kiosk request" and approves + dispatches
console.log("\n2) WAREHOUSE (logistics) — sees the request, approves + dispatches:");
{
  const page = await makePage(browser);
  await adminLogin(page, "hassan@koub.iq");
  await gotoAdmin(page, "Stock & Allocation");
  await page.waitForTimeout(2500);
  const t = await bodyText(page);
  log(`"Kiosk request" badge visible: ${/Kiosk request/i.test(t) ? "✅" : "❌"}   header count: ${/open kiosk request/i.test(t) ? "✅" : "❌"}`);
  await shot(page, "trace-loop-2-warehouse");
  // advance the transfer: click the row action up to 3x (Approve -> [Pick] -> Dispatch)
  for (const want of [/Approve|Confirm/i, /Dispatch|Pick|Send/i, /Dispatch|Pick|Send/i]) {
    const btn = page.getByRole("button", { name: want }).first();
    if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) continue;
    const ap = page.waitForResponse((r) => r.url().includes("stock_transfer_action"), { timeout: 12000 }).catch(() => null);
    await btn.click().catch(() => {});
    await ap; await page.waitForTimeout(2000);
    if (/dispatched|waiting kiosk/i.test(await bodyText(page))) break;
  }
  const state = (await api("/bayaan/api/chain_bootstrap", cookie))?.transfers?.find((x) => x.requested)?.bayaan_state;
  log(`transfer state after warehouse actions: ${state}`);
  await shot(page, "trace-loop-2b-dispatched");
  await page._context.close();
}

// 3) CASHIER confirms receipt at the POS
console.log("\n3) CASHIER — confirms receipt at the POS:");
let recvResp = null;
{
  const page = await makePage(browser);
  page.on("response", async (r) => { if (r.url().includes("stock_transfer_action")) { try { recvResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  await adminLogin(page, "zainab@koub.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /Receive stock|استلام المخزون|transfer arrived/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const recP = page.waitForResponse((r) => r.url().includes("stock_transfer_action"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Confirm arrived|Confirm receipt|^Receive$/i }).first().click().catch(() => {});
  await recP; await page.waitForTimeout(3000);
  await shot(page, "trace-loop-3-received");
  log(`receive response: ${JSON.stringify(recvResp || "").slice(0, 90)}`);
  await page._context.close();
}

// 4) verify
console.log("\n4) VERIFY:");
const milkAfter = milk(await api("/bayaan/api/chain_bootstrap", cookie));
log(`K-01 milk ${milkBefore} → ${milkAfter}  (Δ ${milkAfter != null && milkBefore != null ? (milkAfter - milkBefore).toFixed(2) : "?"})`);
const ok = reqResp && !reqResp.message && recvResp && !recvResp.message && milkAfter > milkBefore;
console.log("\n==== REQUEST LOOP: " + (ok ? "✅ PASS — request → approve → dispatch → receive works end to end" : "❌ ISSUE — see steps above") + " ====");
await browser.close();
