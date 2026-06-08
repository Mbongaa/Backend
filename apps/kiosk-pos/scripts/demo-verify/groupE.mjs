// Group E — Staff flow (login: owner). Reads roster/schedule/payroll and exercises
// the Add-shift and Payroll-adjustment write paths. MUTATES the live demo DB (E3, E5).
import { makePage, adminLogin, gotoAdmin, bodyText, shot } from "./lib.mjs";

export async function runGroupE(browser, rec) {
  const page = await makePage(browser);
  const responses = {};
  page.on("response", async (r) => {
    for (const key of ["hr_schedule", "payroll_adjustment", "payroll_run", "hr_employee"]) {
      if (r.url().includes(key)) { try { responses[key] = (await r.json())?.result ?? (await r.json())?.error; } catch {} }
    }
  });

  try {
    await adminLogin(page, "owner@miza.iq");
    await gotoAdmin(page, "Staff");
    await page.waitForTimeout(2000);
    const text = await bodyText(page);

    // E1 — roster: 9 employees with the seeded names.
    const names = ["Zainab", "Fatima", "Yusuf", "Layla", "Noor", "Hassan", "Ali", "Omar", "Sara"];
    const present = names.filter((n) => text.includes(n));
    rec.add("E1", "Staff roster shows seeded employees",
      present.length >= 7, `${present.length}/9 names present: ${present.join(",")}`, "");
    await shot(page, "E-E1-staff");

    // E2 — schedule view with week navigation + roster table.
    const hasSchedule = /roster|schedule|work week|Coverage|payroll/i.test(text);
    rec.add("E2", "Schedule / work-week view renders", hasSchedule,
      hasSchedule ? "schedule + roster sections present" : "schedule section missing", "");

    // E3 — add a shift: open editor and fill the REQUIRED fields (date, role, start, end).
    try {
      await page.getByRole("button", { name: /Assign shift|Add shift/ }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      const dlg = page.locator("[role='dialog']");
      const modalOpen = await dlg.isVisible({ timeout: 2500 }).catch(() => false);
      // Staff(0)/Kiosk(1) default ok; fill date, role(select 2), start/end times.
      await dlg.locator("input[type='date']").first().fill("2026-06-08").catch(() => {});
      await dlg.locator("select").nth(2).selectOption({ index: 1 }).catch(() => {});
      await dlg.locator("input[type='time']").nth(0).fill("08:00").catch(() => {});
      await dlg.locator("input[type='time']").nth(1).fill("16:00").catch(() => {});
      await shot(page, "E-E3-shift-modal");
      const schedP = page.waitForResponse((r) => r.url().includes("hr_schedule"), { timeout: 12000 }).catch(() => null);
      await dlg.getByRole("button", { name: /Assign shift|Update shift/ }).click().catch(() => {});
      await schedP;
      await page.waitForTimeout(2200);
      const after = await bodyText(page);
      const okToast = /Shift added to source work week|Shift updated|added to source/i.test(after);
      const closed = !(await dlg.isVisible({ timeout: 500 }).catch(() => false));
      rec.add("E3", "Create shift persists via /hr_schedule (date+role+times filled)",
        modalOpen && okToast,
        `modalOpen=${modalOpen} successToast=${okToast} modalClosed=${closed}`,
        JSON.stringify(responses.hr_schedule || "").slice(0, 140));
    } catch (e) {
      rec.add("E3", "Create shift via /hr_schedule", false, "error: " + (e.message || e));
    }

    // E4 — coverage gaps section.
    const cov = /Coverage gaps|coverage|missing role|تغطية/i.test(await bodyText(page));
    rec.add("E4", "Coverage gaps section present", cov, cov ? "coverage section rendered" : "no coverage section", "");

    // E5 — payroll adjustment write path. Button is "Adjustment" (close any leftover modal first).
    try {
      await page.keyboard.press("Escape").catch(() => {});
      await gotoAdmin(page, "Staff");
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /^\s*Adjustment\s*$|Payroll adjustment/ }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
      const dlg = page.locator("[role='dialog']");
      const modalOpen = await dlg.isVisible({ timeout: 2500 }).catch(() => false);
      const selects = dlg.locator("select");
      // Must EXPLICITLY select staff(0) — the select only displays the first option,
      // adjustmentDraft.staff stays "" until a change event fires, which blocks submit.
      await selects.nth(0).selectOption({ index: 0 }).catch(() => {});
      await selects.nth(1).selectOption({ value: "bonus" }).catch(() => {});
      await dlg.locator("input").nth(0).fill("5000").catch(() => {});
      await dlg.locator("input").nth(1).fill("Demo verification test bonus").catch(() => {});
      await shot(page, "E-E5-adjustment-modal");
      const adjP = page.waitForResponse((r) => r.url().includes("payroll_adjustment"), { timeout: 12000 }).catch(() => null);
      await dlg.getByRole("button", { name: /Save adjustment/ }).click().catch(() => {});
      await adjP;
      await page.waitForTimeout(2000);
      const after = await bodyText(page);
      const okToast = /Payroll adjustment added|adjustment added|تمت إضافة/i.test(after);
      const apiOk = responses.payroll_adjustment && !responses.payroll_adjustment.message;
      rec.add("E5", "Payroll adjustment persists via /payroll_adjustment",
        modalOpen && (okToast || apiOk),
        `modalOpen=${modalOpen} toast=${okToast} apiResp=${JSON.stringify(responses.payroll_adjustment || "").slice(0, 80)}`,
        JSON.stringify(responses.payroll_adjustment || "").slice(0, 160));
    } catch (e) {
      rec.add("E5", "Payroll adjustment via /payroll_adjustment", false, "error: " + (e.message || e));
    }

    // E6 — payroll run section renders.
    const pr = /Payroll run|Monthly payroll|Net payroll|تشغيل الرواتب/i.test(await bodyText(page));
    rec.add("E6", "Payroll run section present", pr, pr ? "payroll run section rendered" : "no payroll run section", "");

    if (page._errors.length) rec.add("E-err", "Staff screen console hygiene", false, page._errors.length + " errors", page._errors.join(" | "));
    else rec.add("E-err", "Staff screen console hygiene", true, "0 console errors", "");
  } catch (e) {
    rec.add("EX", "Staff flow crashed", false, e.message || String(e));
  } finally {
    await page._context.close();
  }
}
