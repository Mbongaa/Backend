import { chromium } from "playwright";
const URL="http://127.0.0.1:5174"; const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errs=[]; page.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,150));});
await page.goto(URL,{waitUntil:"networkidle"}); await page.waitForTimeout(1200);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("owner@koub.iq"); await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click(); await page.waitForTimeout(6000);
await page.getByRole("button",{name:/^Kiosks/i}).first().click().catch(()=>{}); await page.waitForTimeout(2500);
// open Karrada Center detail via its card
await page.locator(".card").filter({hasText:/Karrada Center/}).first().click().catch(e=>errs.push("card:"+String(e).slice(0,60)));
await page.waitForTimeout(2500);
// click the Current stock tab
let tabClicked=false;
for (const lbl of [/^Current stock$/i, /Current stock/i, /المخزون الحالي/]) {
  try { await page.getByRole("button",{name:lbl}).first().click({timeout:2500}); tabClicked=true; break; } catch(e){}
}
if(!tabClicked){ try{ await page.getByText(/Current stock/i).first().click({timeout:2000}); tabClicked=true; }catch(e){} }
await page.waitForTimeout(2500);
await page.screenshot({path:"verification/koub-stockview.png",fullPage:false});
const body=await page.locator("body").innerText();
console.log("tabClicked:",tabClicked,"| has 'On hand now':", body.includes("On hand now"), "| has 'Used today':", body.includes("Used today"));
console.log("ERRORS:",JSON.stringify(errs.slice(0,5)));
await browser.close();
