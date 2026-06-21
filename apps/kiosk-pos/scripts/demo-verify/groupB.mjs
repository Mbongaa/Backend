// Group B — Role scoping. Each role's UI must reflect its server-side allowedNav/panels.
import { makePage, adminLogin, navLabels, bodyText, shot } from "./lib.mjs";

const ALL = ["Today Command", "AI Assistant", "Kiosks", "Warehouses", "Stock inventory",
  "Sales & POS", "Daily Close", "Waste & Loss", "Products & Recipes",
  "Purchases & Suppliers", "Stock & Allocation", "Staff", "Finance", "Reports"];

const ROLES = [
  { id: "B1", email: "layla@koub.iq", role: "manager",
    expect: ALL, forbid: [], posDisabled: true },
  { id: "B2", email: "hassan@koub.iq", role: "logistics",
    expect: ["Today Command", "Warehouses", "Stock inventory", "Purchases & Suppliers", "Stock & Allocation", "Reports"],
    forbid: ["Daily Close", "Finance", "Staff", "AI Assistant", "Sales & POS", "Kiosks", "Waste & Loss", "Products & Recipes"],
    posDisabled: true },
  { id: "B3", email: "noor@koub.iq", role: "accountant",
    expect: ["Today Command", "AI Assistant", "Sales & POS", "Daily Close", "Purchases & Suppliers", "Staff", "Finance", "Reports"],
    forbid: ["Kiosks", "Warehouses", "Stock inventory", "Waste & Loss", "Products & Recipes", "Stock & Allocation"],
    posDisabled: true },
];

export async function runGroupB(browser, rec) {
  for (const r of ROLES) {
    const page = await makePage(browser);
    try {
      await adminLogin(page, r.email);
      const labels = await navLabels(page);
      const labelStr = labels.join(" | ");
      const missing = r.expect.filter((e) => !labels.some((l) => l.includes(e) || e.includes(l)));
      const leaked = r.forbid.filter((f) => labels.some((l) => l.includes(f) || f.includes(l)));
      // POS toggle button must be disabled for non-POS roles.
      const posBtn = page.getByRole("button", { name: /^POS$/ }).first();
      const posDisabled = await posBtn.isDisabled().catch(() => null);
      await shot(page, `B-${r.id}-${r.role}`);

      const problems = [];
      if (missing.length) problems.push("missing nav: " + missing.join(","));
      if (leaked.length) problems.push("LEAKED nav (should be hidden): " + leaked.join(","));
      if (r.posDisabled && posDisabled === false) problems.push("POS panel NOT disabled for " + r.role);
      if (page._errors.length) problems.push(page._errors.length + " console error(s)");

      rec.add(r.id, `Role scope: ${r.role}`, problems.length === 0,
        problems.length ? problems.join("; ") : `${labels.length} nav items, POS disabled=${posDisabled}`,
        "nav=[" + labelStr + "]");
    } catch (e) {
      rec.add(r.id, `Role scope: ${r.role}`, false, "error: " + (e.message || e));
    } finally {
      await page._context.close();
    }
  }

  // B4 — cashier: no admin nav, lands on POS panel, Admin toggle disabled.
  const page = await makePage(browser);
  try {
    await adminLogin(page, "zainab@koub.iq");
    await page.waitForTimeout(1500);
    const labels = await navLabels(page);
    const text = await bodyText(page);
    const onPos = /Customer-facing display|Start shift|Amount due|Source verified|Source required/i.test(text);
    const adminBtn = page.getByRole("button", { name: /^Admin$/ }).first();
    const adminDisabled = await adminBtn.isDisabled().catch(() => null);
    await shot(page, "B-B4-cashier");
    const problems = [];
    if (labels.length > 0) problems.push("admin nav visible to cashier: " + labels.join(","));
    if (!onPos) problems.push("cashier not on POS panel");
    if (adminDisabled === false) problems.push("Admin panel NOT disabled for cashier");
    if (page._errors.length) problems.push(page._errors.length + " console error(s)");
    rec.add("B4", "Role scope: cashier (POS only)", problems.length === 0,
      problems.length ? problems.join("; ") : `no admin nav, on POS, Admin disabled=${adminDisabled}`,
      `navCount=${labels.length} onPos=${onPos}`);
  } catch (e) {
    rec.add("B4", "Role scope: cashier", false, "error: " + (e.message || e));
  } finally {
    await page._context.close();
  }
}
