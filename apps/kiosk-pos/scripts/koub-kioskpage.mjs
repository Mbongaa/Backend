import { chromium } from "playwright";
const URL="http://127.0.0.1:5174"; const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
await page.goto(URL,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("owner@koub.iq"); await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click();
await page.waitForTimeout(8000);  // let auth_status + chain_bootstrap fully resolve
await page.getByRole("button",{name:/^Kiosks/i}).first().click().catch(()=>{});
await page.waitForTimeout(6000);  // let the kiosks grid render from LIVE bootstrap
await page.screenshot({path:"verification/koub-kioskpage.png",fullPage:false});
const body=await page.locator("body").innerText();
const names=["Karrada","Mansour","Erbil","Majidi","Zayouna","Basra","Baghdad Mall","Empire","Family Mall","Al Mansour Mall"];
console.log("Kiosk names present on page:");
for (const n of names) console.log("   "+n+":", body.includes(n));
await browser.close();
