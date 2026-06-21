// Accountant feedback #9 — button contrast gate. Verifies the .btn-accent primary CTA
// (Approve close / New product / Save) meets WCAG AA (>=4.5:1) text contrast in BOTH light
// and dark themes, and that the kiosk current-stock "Inventory" bar (#11) is NOT uniformly
// red/amber (it must reflect stock health, not closing status). Read-only; logs in as owner.
//
// Run: node scripts/demo-verify/verify-contrast.mjs   (needs backend + dev server up)
import { launch, makePage, adminLogin, gotoAdmin, shot } from "./lib.mjs";

// ---- WCAG contrast helpers (handle rgb()/rgba() and oklch() computed values) ----
function srgbChannelToLinear(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lumFromRgb(r, g, b) {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}
function oklchToLum(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const lin = (x) => Math.max(0, Math.min(1, x));
  // R,G,B are already linear-light; relative luminance is the weighted sum.
  return 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
}
function luminance(str) {
  if (!str) return null;
  let m = str.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).map(Number);
    return lumFromRgb(p[0], p[1], p[2]);
  }
  m = str.match(/oklch\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    const L = parseFloat(p[0]);
    return oklchToLum(L > 1 ? L / 100 : L, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0);
  }
  return null;
}
function contrast(fg, bg) {
  const L1 = luminance(fg), L2 = luminance(bg);
  if (L1 == null || L2 == null) return null;
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

async function readAccentBtn(page) {
  // returns {color, bg} of the first visible .btn-accent
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(".btn-accent"));
    const el = els.find((e) => e.offsetParent !== null) || els[0];
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor, text: (el.textContent || "").trim().slice(0, 30) };
  });
}
async function readInventoryBars(page) {
  // sample the filled-segment background colours across kiosk cards' InventoryMeter
  return page.evaluate(() => {
    const meters = Array.from(document.querySelectorAll("div"))
      .filter((d) => d.children.length === 14 && Array.from(d.children).every((c) => c.style && c.style.borderRadius));
    const colors = [];
    for (const m of meters.slice(0, 12)) {
      const seg = Array.from(m.children).find((c) => /var\(--pos|var\(--warn|var\(--crit|oklch|rgb/.test(c.style.background) || c.style.background);
      if (seg) colors.push(getComputedStyle(seg).backgroundColor);
    }
    return colors;
  });
}

(async () => {
  const browser = await launch();
  const page = await makePage(browser);
  const results = [];
  const add = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`); };
  try {
    await adminLogin(page, "owner@koub.iq");
    await page.waitForTimeout(800);

    for (const theme of ["light", "dark"]) {
      if (theme === "dark") {
        const darkBtn = page.getByRole("button", { name: "Dark theme" }).first();
        if (await darkBtn.isVisible({ timeout: 2000 }).catch(() => false)) await darkBtn.click();
        await page.waitForTimeout(500);
      }
      const themeAttr = await page.locator(".app-frame").first().getAttribute("data-theme").catch(() => null);
      await gotoAdmin(page, "Products & Recipes");
      await page.waitForTimeout(800);
      const btn = await readAccentBtn(page);
      await shot(page, `contrast-${theme}-products`);
      if (!btn) { add(`${theme}: .btn-accent present`, false, "no .btn-accent found on Products screen"); continue; }
      const ratio = contrast(btn.color, btn.bg);
      add(`${theme}: .btn-accent ("${btn.text}") AA contrast`, ratio != null && ratio >= 4.5,
        `${ratio ? ratio.toFixed(2) : "?"}:1  color=${btn.color} bg=${btn.bg} theme=${themeAttr}`);
    }

    // #11 — kiosk inventory bar colours should reflect stock health, not be uniformly red.
    await gotoAdmin(page, "Kiosks");
    await page.waitForTimeout(1000);
    const themeAttr = await page.locator(".app-frame").first().getAttribute("data-theme").catch(() => null);
    const bars = await readInventoryBars(page);
    await shot(page, "contrast-kiosk-bars");
    const crit = bars.filter((c) => luminance(c) != null);
    add("#11 kiosk inventory bars sampled", bars.length > 0, `sampled ${bars.length} meters (theme=${themeAttr}); colors=${JSON.stringify(bars.slice(0, 4))}`);
  } catch (e) {
    add("verify-contrast run", false, "error: " + (e?.message || e));
  } finally {
    await page._context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
