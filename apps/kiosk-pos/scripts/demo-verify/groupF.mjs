// Group F — Cross-cutting: RTL, dark mode, console hygiene, realtime, no Odoo leak.
import { makePage, adminLogin, bodyText, shot } from "./lib.mjs";

export async function runGroupF(browser, rec) {
  const page = await makePage(browser);
  try {
    await adminLogin(page, "owner@koub.iq");
    await page.waitForTimeout(1000);

    // F4 — realtime stream indicator.
    const t0 = await bodyText(page);
    const stream = /STREAM ACTIVE|Stream live|Engine synced|live/i.test(t0);
    rec.add("F4", "Realtime stream indicator present", stream,
      stream ? "stream/engine indicator shown" : "no stream indicator", "");

    // F5 — no visible "Odoo" branding leak.
    const odooLeak = /\bOdoo\b/.test(t0);
    rec.add("F5", "No visible 'Odoo' branding leak", !odooLeak,
      odooLeak ? "'Odoo' visible in admin UI" : "no Odoo string visible", "");

    // F2 — dark mode toggle.
    await page.getByRole("button", { name: /Dark theme/ }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    const darkOn = (await page.locator(".app-frame").getAttribute("data-theme").catch(() => null)) === "dark";
    await shot(page, "F-F2-dark");
    await page.getByRole("button", { name: /Light theme/ }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const lightBack = (await page.locator(".app-frame").getAttribute("data-theme").catch(() => null)) === "light";
    rec.add("F2", "Dark mode applies and restores", darkOn && lightBack,
      `dark=${darkOn} restoredLight=${lightBack}`, "");

    // F1 — Arabic RTL toggle.
    await page.getByRole("button", { name: /^AR$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    const dir = await page.locator(".app-frame").getAttribute("dir").catch(() => null);
    const rtl = dir === "rtl";
    await shot(page, "F-F1-arabic-rtl");
    // restore EN
    await page.getByRole("button", { name: /^EN$/ }).first().click().catch(() => {});
    rec.add("F1", "Arabic RTL toggle flips app to dir=rtl", rtl, `app-frame dir=${dir}`, "");

    // F3 — console hygiene across the cross-cutting sweep.
    rec.add("F3", "Console hygiene (cross-cutting sweep)", page._errors.length === 0,
      page._errors.length ? page._errors.length + " errors" : "0 console/page errors",
      page._errors.join(" | ").slice(0, 200));
  } catch (e) {
    rec.add("FX", "Cross-cutting sweep crashed", false, e.message || String(e));
  } finally {
    await page._context.close();
  }
}
