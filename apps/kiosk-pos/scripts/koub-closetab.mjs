import { chromium } from "playwright";
const URL="http://127.0.0.1:5174"; const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
await page.goto(URL,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("owner@koub.iq"); await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click(); await page.waitForTimeout(8000);
await page.getByRole("button",{name:/^Kiosks/i}).first().click().catch(()=>{}); await page.waitForTimeout(5000);
await page.locator(".card").filter({hasText:/Karrada Center/}).first().click().catch(()=>{}); await page.waitForTimeout(3000);
// list the tab labels present
const tabs = await page.locator("button").allInnerTexts();
console.log("Kiosk-detail tabs seen:", tabs.filter(t=>/Current stock|Daily closing|Stock movement|POS session|Overview|Sales|Waste|Staff/i.test(t)).slice(0,12));
// open the Daily closings tab
for (const lbl of [/Daily closing/i, /Closings/i, /الإغلاق/]) { try{ await page.getByRole("button",{name:lbl}).first().click({timeout:2500}); break; }catch(e){} }
await page.waitForTimeout(2500);
await page.screenshot({path:"verification/koub-closetab.png",fullPage:false});
const body=await page.locator("body").innerText();
console.log("Daily-closings tab shows variance columns? Expected:",/Expected/i.test(body),"| Counted:",/Counted/i.test(body),"| Variance:",/Variance/i.test(body));
await browser.close();
