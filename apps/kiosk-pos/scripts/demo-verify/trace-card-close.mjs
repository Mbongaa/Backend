import { launch, makePage, adminLogin, bodyText, shot, api, odooLogin } from "./lib.mjs";
const log=(m)=>console.log("  "+m);
const b=await launch(); const {cookie}=await odooLogin("owner@koub.iq");
const before=(await api("/bayaan/api/chain_bootstrap",cookie)).closings.length;
const p=await makePage(b);
let closeResp=null;
p.on("response", async r=>{ if(r.url().includes("shift_close")&&!r.url().includes("review")){ try{closeResp=(await r.json())?.result??(await r.json())?.error;}catch{} } });
await adminLogin(p,"zainab@koub.iq");
await p.getByRole("button",{name:/^POS$/}).first().click().catch(()=>{});
await p.waitForTimeout(1200);
await p.locator("div").filter({hasText:/^Zainab Hassancashier$/}).first().click().catch(()=>{});
await p.waitForTimeout(800);
const openP=p.waitForResponse(r=>r.url().includes("open_session"),{timeout:20000}).catch(()=>null);
await p.getByRole("button",{name:/Start shift|ابدأ الوردية/}).first().click().catch(()=>{});
await openP; await p.waitForTimeout(3500);
// CARD sale: Cappuccino (4000) paid by Card
await p.locator("button.card, .card").filter({hasText:/Cappuccino/}).first().click().catch(()=>{});
await p.waitForTimeout(700);
await p.getByRole("button",{name:/Charge/}).first().click().catch(()=>{});
await p.waitForTimeout(1200);
const saleP=p.waitForResponse(r=>r.url().includes("kiosk_sale"),{timeout:20000}).catch(()=>null);
await p.locator("[class*='card']").filter({hasText:/Card|Bank card/}).first().click().catch(()=>{});
await saleP; await p.waitForTimeout(4000);
log("card sale done");
// New order, then End shift -> close
await p.getByRole("button",{name:/New order|طلب جديد/}).first().click().catch(()=>{});
await p.waitForTimeout(800);
await p.getByRole("button",{name:/End shift|إنهاء/}).first().click().catch(()=>{});
await p.waitForTimeout(1500);
// enter counted cash (any, to satisfy required) and counted card = 3000 (expected 4000 -> var -1000)
const inputs = p.locator("input[type='number']");
await inputs.nth(0).fill("175000").catch(()=>{});  // counted cash
await inputs.nth(1).fill("3000").catch(()=>{});     // counted card (terminal) — 1000 short
await shot(p,"trace-card-close-form");
const closeP=p.waitForResponse(r=>r.url().includes("shift_close")&&!r.url().includes("review"),{timeout:15000}).catch(()=>null);
await p.getByRole("button",{name:/Submit close|إرسال الإغلاق/}).first().click().catch(()=>{});
await closeP; await p.waitForTimeout(2500);
log("close response: "+JSON.stringify(closeResp||"").slice(0,80));
await p._context.close();
// verify backend: find newest close, check card fields
const bb=await api("/bayaan/api/chain_bootstrap",cookie);
const after=bb.closings.length;
// the new close is the K-01 one with countedCard==3000
const k01=bb.closings.filter(c=>c.kioskId==="K-01").sort((a,b)=>(b.id-a.id))[0];
log(`closings ${before} -> ${after}`);
log(`newest K-01 close: cardExpected ${k01?.expectedCard} cardCounted ${k01?.countedCard} cardVariance ${k01?.cardVariance}`);
const ok = closeResp && !closeResp.message && k01 && Number(k01.cardVariance)<0;
console.log("\n==== CARD CLOSE TRACE: "+(ok?"✅ PASS — card counted & variance captured at close":"❌ ISSUE")+" ====");
await b.close();
