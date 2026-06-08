import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8069';
const OUT = 'verification';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const consoleErrs = [];
const pageErrs = [];
const failedReq = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', (e) => pageErrs.push(String(e)));
page.on('requestfailed', (r) => failedReq.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 500) failedReq.push(`HTTP ${r.status()} ${r.url()}`); });

// login admin/admin
await page.goto(`${BASE}/web/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="login"]', 'admin');
await page.fill('input[name="password"]', 'admin');
await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.click('button[type="submit"]')]);
await page.waitForTimeout(1500);
console.log('after login url:', page.url());

// Approach 1: navigate to the Point of Sale app menu directly
await page.goto(`${BASE}/odoo/point-of-sale`, { waitUntil: 'domcontentloaded' }).catch((e) => console.log('nav err', String(e)));
await page.waitForTimeout(4000);
console.log('PoS app url after load:', page.url());
await page.screenshot({ path: `${OUT}/odoo-pos-app.png` }).catch(() => {});

const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
console.log('BODY SNIPPET:', bodyText);

console.log('\n--- CONSOLE ERRORS (' + consoleErrs.length + ') ---');
consoleErrs.slice(0, 15).forEach((e) => console.log('  •', e.slice(0, 300)));
console.log('\n--- PAGE ERRORS (' + pageErrs.length + ') ---');
pageErrs.slice(0, 15).forEach((e) => console.log('  •', e.slice(0, 300)));
console.log('\n--- FAILED/5xx REQUESTS (' + failedReq.length + ') ---');
failedReq.slice(0, 20).forEach((e) => console.log('  •', e.slice(0, 200)));

await browser.close();
