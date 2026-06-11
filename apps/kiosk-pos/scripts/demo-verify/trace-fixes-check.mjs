// Verifies the demo-breaker frontend fixes:
//  DB0 — Quick-cash buttons show only sensible IQD notes >= total (no bogus 200/500),
//        and a cash sale never displays negative change.
//  DB2 — Admin Stock & Allocation: a DISPATCHED transfer shows NO "Receive" button
//        (kiosk receives at POS), while a DRAFT transfer still shows its advance button.
import { launch, makePage, adminLogin, gotoAdmin, bodyText, shot, api, odooLogin } from "./lib.mjs";
const log = (m) => console.log("  " + m);

const browser = await launch();
const { cookie } = await odooLogin("owner@miza.iq");

// ---------- DB0: quick-cash buttons ----------
console.log("\nDB0 — POS payment quick-cash buttons (cash sale of one Cappuccino = 4000):");
{
  const page = await makePage(browser);
  await adminLogin(page, "zainab@miza.iq");
  await page.getByRole("button", { name: /^POS$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const openP = page.waitForResponse((r) => r.url().includes("open_session"), { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Start shift|ابدأ الوردية/ }).first().click().catch(() => {});
  await openP; await page.waitForTimeout(3500);
  await page.locator("button.card, .card").filter({ hasText: /Cappuccino/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Charge/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "fix-db0-payment");
  // Quick-cash row: the buttons under "Quick cash"
  const t = await bodyText(page);
  const hasQuickCash = /Quick cash|نقد سريع/i.test(t);
  // Collect all button texts that look like IQD amounts in the quick-cash area
  const amounts = (t.match(/IQD\s*([\d.,]+)/g) || []).map((s) => Number(s.replace(/[^\d]/g, "")));
  const bogus = amounts.filter((n) => n === 200 || n === 500);
  // The exact total (4000) should be offered, plus at least one higher note.
  const has4000 = amounts.includes(4000);
  const higherNote = amounts.some((n) => n > 4000);
  log(`Quick cash row present: ${hasQuickCash}`);
  log(`IQD amounts seen on screen: ${[...new Set(amounts)].sort((a, b) => a - b).join(", ")}`);
  log(`bogus 200/500 chips present: ${bogus.length ? "❌ " + bogus.join(",") : "✅ none"}`);
  log(`offers exact 4000 + a higher note: ${has4000 && higherNote ? "✅" : "⚠ " + has4000 + "/" + higherNote}`);

  // Tap a quick-cash note higher than total and confirm change is NOT negative.
  const payP = page.waitForResponse((r) => r.url().includes("kiosk_sale"), { timeout: 20000 }).catch(() => null);
  // click the quick-cash button equal to 5000 if present else 10000
  const qc = page.locator(".btn").filter({ hasText: /IQD\s*5,?000|IQD\s*10,?000/ }).first();
  if (await qc.count()) { await qc.click().catch(() => {}); } else {
    await page.locator("button.card").filter({ has: page.getByText("Cash", { exact: true }) }).first().click().catch(() => {});
  }
  await payP; await page.waitForTimeout(3000);
  const done = await bodyText(page);
  await shot(page, "fix-db0-done");
  const changeM = done.match(/Change due[^\d-]*(-?[\d.,]+)/i);
  const changeVal = changeM ? Number(changeM[1].replace(/[^\d-]/g, "")) : null;
  const negative = /Change due[\s\S]{0,40}IQD\s*-/.test(done) || (changeVal != null && changeVal < 0);
  log(`negative change shown on done screen: ${negative ? "❌ YES" : "✅ no"}`);
  const db0Ok = !bogus.length && has4000 && higherNote && !negative;
  log(db0Ok ? "DB0 ✅ PASS" : "DB0 ❌ ISSUE");
  await page._context.close();
}

// ---------- DB2: admin Receive button hidden on dispatched rows ----------
console.log("\nDB2 — admin transfer card: dispatched row must NOT show a Receive button:");
{
  // Build one DRAFT and one DISPATCHED transfer to K-01 via API.
  const draft = await api("/bayaan/api/stock_transfer", cookie, { kiosk: "K-01", items: [{ item: "RAW-CUP", qty: 10 }] });
  const disp = await api("/bayaan/api/stock_transfer", cookie, { kiosk: "K-01", items: [{ item: "RAW-CUP", qty: 10 }] });
  const dispId = disp.id || disp.name;
  await api("/bayaan/api/stock_transfer_action", cookie, { transfer: dispId, action: "approve" });
  await api("/bayaan/api/stock_transfer_action", cookie, { transfer: dispId, action: "dispatch" });
  log(`created draft ${draft.name || draft.id} + dispatched ${disp.name || disp.id}`);

  const page = await makePage(browser);
  await adminLogin(page, "hassan@miza.iq"); // logistics — the persona that previously hit the error
  await gotoAdmin(page, "Stock & Allocation");
  await page.waitForTimeout(2500);
  await shot(page, "fix-db2-admin-transfers");
  // Find the dispatched transfer row and check it has "waiting kiosk" but NO Receive/Confirm button.
  const dispName = disp.name || `PICK-${disp.id}`;
  const row = page.locator("div").filter({ hasText: new RegExp(dispName.replace(/[/]/g, "\\/")) }).last();
  const rowText = await row.innerText().catch(() => "");
  const waitingShown = /waiting kiosk|بانتظار الكشك/i.test(rowText) || /waiting kiosk/i.test(await bodyText(page));
  // A Receive button within the dispatched row
  const receiveBtnInRow = await row.getByRole("button", { name: /Receive|Confirm|استلام/i }).count().catch(() => 0);
  // Sanity: a draft row should still offer an advance (Approve/Dispatch) button somewhere on the page
  const advanceButtons = await page.getByRole("button", { name: /Approve|Dispatch|Confirm|Send|Pick/i }).count().catch(() => 0);
  log(`dispatched row shows "waiting kiosk": ${waitingShown ? "✅" : "⚠ not detected"}`);
  log(`Receive button inside dispatched row: ${receiveBtnInRow === 0 ? "✅ none (fixed)" : "❌ " + receiveBtnInRow + " present"}`);
  log(`advance buttons still present for non-dispatched rows: ${advanceButtons > 0 ? "✅ " + advanceButtons : "⚠ 0"}`);
  const db2Ok = receiveBtnInRow === 0 && advanceButtons > 0;
  log(db2Ok ? "DB2 ✅ PASS" : "DB2 ❌ ISSUE");
  await page._context.close();

  // cleanup the two test transfers
  for (const t of [draft.id || draft.name, dispId]) {
    await api("/bayaan/api/stock_transfer_action", cookie, { transfer: t, action: "cancel" }).catch(() => {});
  }
}

await browser.close();
console.log("\n==== FIXES CHECK COMPLETE — see DB0/DB2 verdicts above ====");
