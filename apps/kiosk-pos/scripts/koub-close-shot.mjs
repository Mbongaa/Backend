import { chromium } from "playwright";
const URL = "http://127.0.0.1:5174";
const errors=[];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console",(m)=>{if(m.type()==="error")errors.push(m.text().slice(0,180));});
await page.goto(URL,{waitUntil:"networkidle"});
await page.waitForTimeout(1200);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("owner@koub.iq");
await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click();
await page.waitForTimeout(6000);
for (const label of ["Daily Close","Closing","Close"]) {
  try { await page.getByRole("button",{name:new RegExp("^"+label,"i")}).first().click({timeout:3500});
    await page.waitForTimeout(3000);
    await page.screenshot({path:"verification/koub-06-daily-close.png",fullPage:false});
    console.log("CAPTURED",label); break;
  } catch(e){ console.log("skip",label); }
}
console.log("CONSOLE_ERRORS:",JSON.stringify(errors.slice(0,5)));
await browser.close();
