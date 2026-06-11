import { chromium } from "playwright";
const URL="http://127.0.0.1:5174";
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1680,height:1020}})).newPage();
let bucket=[];
p.on("console", async (m)=>{
  if(m.type()!=="error") return;
  const t=m.text();
  if(/gstatic|googleapis/.test(t)) return;
  let args=[];
  try { args = await Promise.all(m.args().map(a=>a.jsonValue().catch(()=>"?"))); } catch {}
  bucket.push(t.slice(0,80)+" :: args="+JSON.stringify(args).slice(0,200));
});
const step=async(label,fn)=>{ bucket=[]; await fn(); await p.waitForTimeout(1500); if(bucket.length) console.log(`>>> ${label}:\n   `+bucket.join("\n   ")); else console.log(`    ${label}: clean`); };
await p.goto(URL,{waitUntil:"domcontentloaded"}); await p.waitForTimeout(1800);
const boot=p.waitForResponse(r=>r.url().includes("chain_bootstrap")&&r.status()<400,{timeout:25000}).catch(()=>null);
await p.getByRole("button",{name:/^Owner$/}).first().click();
await Promise.race([boot,p.waitForTimeout(8000)]); await p.waitForTimeout(3000);
bucket=[]; await p.waitForTimeout(500); if(bucket.length) console.log(">>> after-login:\n   "+bucket.join("\n   "));
const nav=async(label)=>{ const it=p.locator(".nav-item",{hasText:label}).first(); if(await it.isVisible().catch(()=>false)){await it.click();} };
for(const s of ["Today Command","Kiosks","Sales & POS","Warehouses","Stock inventory","Stock & Allocation","Products & Recipes","Purchases & Suppliers","Daily Close","Waste & Loss","Staff","Finance","Reports","AI Assistant"]){
  await step("Section "+s, ()=>nav(s));
}
// drill-downs
await nav("Kiosks"); await p.waitForTimeout(1200);
await step("Kiosk drill-down", async()=>{ const c=p.locator(".card",{hasText:/Karrada|Mansour|Erbil Mall/}).first(); if(await c.isVisible().catch(()=>false)) await c.click(); });
await nav("Daily Close"); await p.waitForTimeout(1200);
await step("Close expand", async()=>{ const r=p.locator("tr.row-click").first(); if(await r.isVisible().catch(()=>false)) await r.click(); });
await nav("Staff"); await p.waitForTimeout(1000);
await step("Staff payroll tab", async()=>{ const t=p.getByRole("button",{name:/Payroll & costs/}).first(); if(await t.isVisible().catch(()=>false)) await t.click(); });
await step("Staff schedule tab", async()=>{ const t=p.getByRole("button",{name:/Schedule & coverage/}).first(); if(await t.isVisible().catch(()=>false)) await t.click(); });
await b.close();
