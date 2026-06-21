// Demo trace: POS low-stock alert + request-from-warehouse (new feature).
// 1) drain an item below reorder, 2) cashier POS shows the low-stock alert,
// 3) cashier taps "Request stock" -> a draft warehouse->kiosk transfer is created.
import { launch, makePage, adminLogin, bodyText, shot, api, odooLogin } from "./lib.mjs";

const log = (m) => console.log("  " + m);
const k01Milk = (b) => { const r = (b?.kiosk_stock_rows || []).find((x) => x.kiosk === "K-01" && /milk/i.test(x.item || "")); return r ? { qty: r.actual_qty, reorder: r.reorder_qty, status: r.stock_status } : null; };

const browser = await launch();
const { cookie } = await odooLogin("owner@koub.iq");

// ---------- STEP 1: drain K-01 milk below its reorder point ----------
console.log("\nSTEP 1 — drain K-01 RAW-MILK below reorder so it reads LOW:");
let b = await api("/bayaan/api/chain_bootstrap", cookie);
let m = k01Milk(b);
log(`before: milk ${m.qty} (reorder ${m.reorder}, status ${m.status})`);
const drain = Math.max(Math.ceil(m.qty - m.reorder + 3), 1); // push a few below reorder
const w = await api("/bayaan/api/waste", cookie, { kiosk: "K-01", item: "Fresh Milk", qty: drain, reason: "Low-stock trace drain" });
log(`wasted ${drain} milk (waste ${w?.id ? "id " + w.id : JSON.stringify(w).slice(0,60)})`);
b = await api("/bayaan/api/chain_bootstrap", cookie);
m = k01Milk(b);
log(`after: milk ${m.qty} (reorder ${m.reorder}, status ${m.status})  →  ${m.qty <= m.reorder ? "LOW ✅" : "still ok ❌"}`);

// ---------- STEP 2: cashier POS shows the low-stock alert ----------
console.log("\nSTEP 2 — cashier opens the POS; the low-stock alert must appear:");
const transfersBefore = (await api("/bayaan/api/chain_bootstrap", cookie))?.transfers?.length || 0;
let requestResp = null, alertShown = false;
{
  const page = await makePage(browser);
  page.on("response", async (r) => { if (r.url().includes("stock_request")) { try { requestResp = (await r.json())?.result ?? (await r.json())?.error; } catch {} } });
  await adminLogin(page, "zainab@koub.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(4000);
  const sale = await bodyText(page);
  alertShown = /low on stock|request from warehouse|منخفض المخزون/i.test(sale);
  log(`low-stock alert banner shown: ${alertShown ? "✅" : "❌"}`);
  await shot(page, "trace-lowstock-1-alert");

  // ---------- STEP 3: tap "Request stock" ----------
  console.log("\nSTEP 3 — cashier taps 'Request stock' → draft transfer to warehouse:");
  const reqP = page.waitForResponse((r) => r.url().includes("stock_request"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Request stock|طلب مخزون/ }).first().click().catch(() => {});
  await reqP; await page.waitForTimeout?.(0);
  await page.waitForTimeout(3000);
  const after = await bodyText(page);
  const toast = /Stock request sent|تم إرسال طلب المخزون/i.test(after);
  await shot(page, "trace-lowstock-2-requested");
  log(`request response: ${JSON.stringify(requestResp || "").slice(0, 120)}`);
  log(`success toast shown: ${toast ? "✅" : "❌"}`);
  await page._context.close();
}

// ---------- STEP 4: verify a draft request transfer now exists for the warehouse ----------
console.log("\nSTEP 4 — verify the warehouse now has a draft request to approve:");
const b2 = await api("/bayaan/api/chain_bootstrap", cookie);
const transfersAfter = (b2?.transfers || []).length;
const draftReq = (b2?.transfers || []).find((t) => /draft/i.test(t.bayaan_state || t.state || "") && /K-01/i.test(JSON.stringify(t)));
log(`active transfers ${transfersBefore} → ${transfersAfter}`);
log(`draft request present: ${draftReq ? "✅ " + (draftReq.name || draftReq.id) : "❌ none"}`);

const ok = alertShown && requestResp && !requestResp.message && !requestResp.error && transfersAfter > transfersBefore;
console.log("\n==== LOW-STOCK REQUEST TRACE: " + (ok ? "✅ PASS — alert shows and cashier can request stock" : "❌ ISSUE — see steps above") + " ====");
await browser.close();
