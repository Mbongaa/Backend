import { launch, makePage, adminLogin, bodyText, shot } from "./lib.mjs";

const browser = await launch();
const page = await makePage(browser);
try {
  await adminLogin(page, "owner@koub.iq");
  await page.waitForTimeout(3500);
  const text = await bodyText(page);
  await shot(page, "iqd-frontend-dashboard");

  // Did anything render in USD? Look for a stray $ on monetary figures.
  const dollarHits = (text.match(/\$\s?\d/g) || []).slice(0, 5);
  const iqdHits = (text.match(/IQD\s?[\d,]+|[\d,]+\s?د\.ع/g) || []).slice(0, 6);
  const revToday = text.match(/362[,.]?\d{0,3}|158[,.]?000|121[,.]?000|83[,.]?000/g) || [];

  console.log("IQD-labeled figures seen:", iqdHits);
  console.log("Stray $ figures (should be none):", dollarHits.length ? dollarHits : "none ✓");
  console.log("Today revenue numbers present:", [...new Set(revToday)].slice(0, 6));
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 300));
} finally {
  await browser.close();
}
