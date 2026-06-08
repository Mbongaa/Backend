import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8069';
const CREDS = [
  ['admin', 'admin'],
  ['owner@miza.iq', 'test'],
  ['admin', 'test'],
];
const OUT = 'verification';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

async function login() {
  for (const [login, pwd] of CREDS) {
    await page.goto(`${BASE}/web/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="login"]', login);
    await page.fill('input[name="password"]', pwd);
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);
    if (!page.url().includes('/web/login')) {
      console.log(`LOGIN OK as ${login}`);
      return login;
    }
  }
  throw new Error('All logins failed');
}

const who = await login();

// Go straight to the Point of Sale Orders list action
await page.goto(`${BASE}/odoo/action-point_of_sale.action_pos_pos_form`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/odoo-pos-orders.png`, fullPage: false });

// Count rows shown and grab the breadcrumb/title
const title = await page.locator('.o_breadcrumb, .o_control_panel').first().innerText().catch(() => '(no title)');
const rows = await page.locator('.o_data_row').count().catch(() => -1);
console.log('PAGE TITLE:', title.replace(/\n+/g, ' | ').slice(0, 200));
console.log('VISIBLE ORDER ROWS:', rows);

await browser.close();
console.log('Saved screenshot to', `${OUT}/odoo-pos-orders.png`);
