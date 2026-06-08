import { chromium } from "playwright";
const URL = "http://127.0.0.1:5174";
const errors=[];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console",(m)=>{if(m.type()==="error")errors.push(m.text().slice(0,160));});
await page.goto(URL,{waitUntil:"networkidle"}); await page.waitForTimeout(1200);
await page.getByRole("button",{name:/Sign in|دخول/}).first().click();
const dlg=page.locator("[role='dialog']"); await dlg.waitFor({state:"visible"});
await dlg.locator("input").nth(0).fill("zainab@miza.iq");
await dlg.locator("input").nth(1).fill("test");
await dlg.locator("button[type='submit']").click();
await page.waitForTimeout(5000);
try { await page.getByRole("button",{name:/^POS$/}).first().click({timeout:4000}); } catch(e){}
await page.waitForTimeout(3500);
// click the cashier CARD (has the lowercase "cashier" role label), not the header
try {
  const card = page.locator("div").filter({ hasText: /^Zainab Hassancashier$/ }).first();
  await card.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  const startBtn = page.getByRole("button",{name:/Start shift|ابدأ الوردية/}).first();
  await startBtn.click({timeout:6000});
  await page.waitForTimeout(7000);
  console.log("started shift");
} catch(e){ console.log("step:", String(e).slice(0,90)); }
await page.screenshot({path:"verification/miza-08-pos.png",fullPage:false});
// try adding a product to cart if grid is up
try { await page.locator("button.card, .card.product, [class*='product']").filter({ hasText: /Orange Juice|Cappuccino|Cheesecake/ }).first().click({timeout:4000});
  await page.waitForTimeout(2000);
  await page.screenshot({path:"verification/miza-09-pos-cart.png",fullPage:false});
  console.log("added product"); } catch(e){ console.log("no grid click:", String(e).slice(0,70)); }
console.log("CONSOLE_ERRORS:",JSON.stringify(errors.slice(0,6)));
await browser.close();
