import { chromium } from "playwright";
const URL="http://127.0.0.1:5174"; const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1100}});
await page.goto(URL,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("owner@miza.iq"); await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click(); await page.waitForTimeout(8000);
await page.getByRole("button",{name:/^Daily Close/i}).first().click().catch(()=>{}); await page.waitForTimeout(5000);
// click the Karrada / Erbil close row to expand per-item stock variance
await page.getByText(/Erbil Mall|Karrada Center/).first().click().catch(()=>{}); await page.waitForTimeout(2500);
await page.screenshot({path:"verification/miza-dailyclose-expand.png",fullPage:false});
const body=await page.locator("body").innerText();
console.log("per-item stock variance present?  Opening:",/Opening/i.test(body),"| Used/Consumed:",/Used|Consumed/i.test(body),"| Expected:",/Expected/i.test(body),"| Counted:",/Counted|Actual/i.test(body),"| Variance:",/Variance/i.test(body));
await browser.close();
