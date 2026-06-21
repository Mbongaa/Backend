// Demo trace: full warehouse→kiosk transfer sequence, driven like a live demo.
// 1) confirm the bogus hardcoded TR-2040 is GONE for the K-01 POS (no real transfers),
// 2) admin dispatches a real transfer to K-01,
// 3) cashier receives it at the POS and stock increases.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, api, odooLogin } from "./lib.mjs";

const milk = (b) => { const r = (b?.kiosk_stock_rows || []).find((x) => x.kiosk === "K-01" && /milk/i.test(x.item || "")); return r ? r.actual_qty : null; };
const log = (m) => console.log("  " + m);

const browser = await launch();
const { cookie } = await odooLogin("owner@koub.iq");

// ---------- STEP 0: with NO real transfers, the POS must show NONE (mock TR-2040 gone) ----------
console.log("\nSTEP 0 — cashier POS with zero real transfers (the old bug showed a fake TR-2040):");
{
  const page = await makePage(browser);
  await adminLogin(page, "zainab@koub.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(3500);
  const t = await bodyText(page);
  const fakeShown = /TR-2040|Milk 12 L, cups 400 pc/i.test(t);
  const banner = /transfer arrived for kiosk confirmation/i.test(t);
  await shot(page, "trace-0-pos-no-transfers");
  log(`fake TR-2040 visible: ${fakeShown}   |   any "transfer arrived" banner: ${banner}`);
  log(fakeShown ? "❌ STILL showing hardcoded mock transfer" : "✅ no hardcoded mock transfer (fix works)");
  await page._context.close();
}

// ---------- STEP 1: admin dispatches a REAL transfer to K-01 ----------
console.log("\nSTEP 1 — admin creates + approves + dispatches a real transfer (Fresh Milk x5) to K-01:");
const b0 = await api("/bayaan/api/chain_bootstrap", cookie);
const milkBefore = milk(b0);
const create = await api("/bayaan/api/stock_transfer", cookie, { kiosk: "K-01", items: [{ item: "Fresh Milk", qty: 5 }] });
const tid = create?.id || create?.transfer || create?.name;
log(`created transfer ${tid} (state ${create?.bayaan_state || create?.state})`);
for (const action of ["approve", "dispatch"]) {
  const r = await api("/bayaan/api/stock_transfer_action", cookie, { transfer: tid, action });
  log(`  → ${action}: bayaan_state=${r?.bayaan_state || r?.state || JSON.stringify(r).slice(0,60)}`);
}
{
  // screenshot the admin dashboard showing the dispatched transfer
  const page = await makePage(browser);
  await adminLogin(page, "owner@koub.iq");
  await gotoAdmin(page, "Stock & Allocation");
  await page.waitForTimeout(2000);
  await shot(page, "trace-1-admin-dispatched");
  await page._context.close();
}

// ---------- STEP 2: cashier RECEIVES it at the POS (the reported-broken step) ----------
console.log("\nSTEP 2 — cashier opens POS, sees the REAL transfer, and confirms receipt:");
let receiveResp = null;
{
  const page = await makePage(browser);
  page.on("response", async (r) => { if (r.url().includes("stock_transfer_action")) { try { receiveResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  await adminLogin(page, "zainab@koub.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(4000);
  const sale = await bodyText(page);
  const bannerShown = /transfer arrived for kiosk confirmation/i.test(sale);
  await shot(page, "trace-2a-pos-banner");

  // open the receive screen (top "Receive stock" button or the banner)
  await page.getByRole("button", { name: /Receive stock|استلام المخزون|transfer arrived|Confirm receipt/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const recvScreen = await bodyText(page);
  const realRef = /RAW-MILK|Fresh Milk|WH\/INT|x\s*5/i.test(recvScreen);
  log(`"transfer arrived" banner shown: ${bannerShown}   |   receive screen lists the real transfer: ${realRef}`);
  await shot(page, "trace-2b-pos-receive-screen");

  // click the Receive/Confirm action for the transfer (button is "Confirm arrived")
  const recP = page.waitForResponse((r) => r.url().includes("stock_transfer_action"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Confirm arrived|Confirm receipt|^Receive$|استلام|تأكيد/i }).first().click().catch(() => {});
  await recP; await page.waitForTimeout(3000);
  const after = await bodyText(page);
  await shot(page, "trace-2c-pos-after-receive");
  const errToast = /could not receive|not found|failed/i.test(after);
  log(`receive response: ${JSON.stringify(receiveResp || "").slice(0, 120)}`);
  log(`error toast: ${errToast}`);
  await page._context.close();
}

// ---------- STEP 3: verify backend ----------
console.log("\nSTEP 3 — verify the transfer received and kiosk stock increased:");
const b1 = await api("/bayaan/api/chain_bootstrap", cookie);
const milkAfter = milk(b1);
const picking = await odooPickingState(cookie, tid);
log(`transfer ${tid} bayaan_transfer_state: ${picking}`);
log(`K-01 Fresh Milk: ${milkBefore} → ${milkAfter}  (Δ ${milkAfter != null && milkBefore != null ? (milkAfter - milkBefore).toFixed(2) : "?"})`);
const ok = (milkAfter > milkBefore) && receiveResp && !receiveResp.message && !receiveResp.error;
console.log("\n==== TRANSFER TRACE RESULT: " + (ok ? "✅ PASS — confirm-at-POS works end to end" : "❌ ISSUE — see steps above") + " ====");

await browser.close();

async function odooPickingState(cookie, name) {
  // read via chain_bootstrap transfers (may already be gone if received+old); fall back to a note
  const b = await api("/bayaan/api/chain_bootstrap", cookie);
  const row = (b?.transfers || []).find((t) => (t.name || `PICK-${t.id}`) === name || t.name === name);
  return row ? (row.bayaan_state || row.state) : "received (no longer in active-transfer list)";
}
