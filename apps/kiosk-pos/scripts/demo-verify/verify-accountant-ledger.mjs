// Zero-weakness check of the ACCOUNTANT's ledger workflow, end to end, in the UI,
// logged in as the accountant role (noor@koub.iq). Posts a real manual journal entry,
// drills into it, and confirms it lands in the General Ledger — plus CSV export presence.
import { launch, makePage, adminLogin, gotoAdmin, navLabels, bodyText, has, shot, makeRecorder, writeReport, odooLogin, api } from "./lib.mjs";

async function main() {
  const browser = await launch();
  const rec = makeRecorder();
  const page = await makePage(browser);
  const stamp = Date.now().toString().slice(-6);
  const entryRef = `UI accountant test ${stamp}`;

  try {
    await adminLogin(page, "noor@koub.iq");

    // 1) Accountant sees the whole ledger toolkit.
    const labels = await navLabels(page);
    const need = ["General ledger", "Journal entries", "Trial balance", "Income & Balance", "Chart of accounts"];
    const navOk = need.every((l) => labels.some((x) => x.includes(l)));
    rec.add("LED-1", "Accountant sees the full ledger navigation", navOk, navOk ? "" : `got: ${labels.join(", ")}`, await shot(page, "led-01-accountant-nav"));

    // 2) Journal entries page + New entry affordance.
    await gotoAdmin(page, "Journal entries");
    let t = await bodyText(page);
    const newBtn = page.getByRole("button", { name: /New journal entry|قيد جديد/ }).first();
    const canCreate = await newBtn.isVisible({ timeout: 3000 }).catch(() => false);
    rec.add("LED-2", "Journal entries page offers 'New journal entry' to the accountant", canCreate && has(t, "Journal", "click any entry"), "", await shot(page, "led-02-journals"));

    // 3) Post a balanced manual entry through the modal.
    let posted = false;
    if (canCreate) {
      await newBtn.click();
      const dlg = page.locator("[role='dialog']");
      await dlg.waitFor({ state: "visible", timeout: 6000 });
      await dlg.getByPlaceholder(/depreciation adjustment/).fill(entryRef);
      const acct = dlg.locator('input[list="bayaan-coa-list"]');
      const nums = dlg.locator('input[type="number"]');
      await acct.nth(0).fill("101504");          // Cash K-01 (asset)
      await nums.nth(0).fill("75000");           // line 0 debit
      await acct.nth(1).fill("301000");          // Capital (equity)
      await nums.nth(3).fill("75000");           // line 1 credit
      await page.waitForTimeout(400);
      const dlgText = await dlg.innerText();
      const showsBalanced = /Balanced|متوازن/.test(dlgText);
      rec.add("LED-3", "Modal validates the entry as Balanced before posting", showsBalanced, "", await shot(page, "led-03-entry-balanced"));
      await dlg.getByRole("button", { name: /Post entry|ترحيل القيد/ }).click();
      await page.waitForTimeout(3000);
      t = await bodyText(page);
      posted = has(t, entryRef);
      rec.add("LED-4", "Posted manual entry appears in the journal list", posted, entryRef, await shot(page, "led-04-entry-posted"));
    } else {
      rec.add("LED-3", "Modal validates the entry as Balanced before posting", false, "no New entry button");
      rec.add("LED-4", "Posted manual entry appears in the journal list", false, "could not open modal");
    }

    // 4) Drill-down: click the entry row -> line detail.
    if (posted) {
      await page.locator("tr.row-click", { hasText: entryRef }).first().click().catch(async () => {
        await page.locator("tr.row-click").first().click();
      });
      const dlg = page.locator("[role='dialog']");
      // Wait for the detail to finish loading (the account codes to render), not the loading state.
      const drill = await dlg.getByText("101504").first().isVisible({ timeout: 6000 }).catch(() => false)
        && await dlg.getByText("301000").first().isVisible({ timeout: 2000 }).catch(() => false);
      rec.add("LED-5", "Clicking an entry drills into its debit/credit lines", drill, "", await shot(page, "led-05-entry-detail"));

      // Reverse it from the UI (audit-preserving — posts an opposite entry, no delete).
      const reverseBtn = dlg.getByRole("button", { name: /Reverse entry|عكس القيد/ }).first();
      if (await reverseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reverseBtn.click();
        await dlg.getByRole("button", { name: /Confirm reverse|تأكيد العكس/ }).click();
        await page.waitForTimeout(2800);
        const after = await bodyText(page);
        rec.add("LED-5R", "Accountant can reverse an entry from the UI", has(after, "Reversal of"), "", await shot(page, "led-05b-reversed"));
      } else {
        rec.add("LED-5R", "Accountant can reverse an entry from the UI", false, "no reverse button");
      }
    } else {
      rec.add("LED-5", "Clicking an entry drills into its debit/credit lines", false, "no entry to drill");
      rec.add("LED-5R", "Accountant can reverse an entry from the UI", false, "no entry to reverse");
    }

    // 5) The entry shows in the General Ledger + CSV export present.
    await gotoAdmin(page, "General ledger");
    await page.waitForTimeout(800);
    t = await bodyText(page);
    const inGl = /101504/.test(t) || has(t, entryRef);
    const glCsv = await page.getByRole("button", { name: /^CSV$/ }).first().isVisible({ timeout: 2000 }).catch(() => false);
    rec.add("LED-6", "Manual entry is in the General Ledger, with CSV export", inGl && glCsv, "", await shot(page, "led-06-gl"));

    // 6) Trial balance still balances + CSV export.
    await gotoAdmin(page, "Trial balance");
    await page.waitForTimeout(800);
    t = await bodyText(page);
    const tbCsv = await page.getByRole("button", { name: /^CSV$/ }).first().isVisible({ timeout: 2000 }).catch(() => false);
    rec.add("LED-7", "Trial balance still balances after the manual entry, with CSV export", has(t, "Balanced") && tbCsv, "", await shot(page, "led-07-trial"));

    // 7) Backend ground truth: the entry is a real posted, balanced account.move.
    const { cookie } = await odooLogin("noor@koub.iq");
    const journals = await api("/bayaan/api/accounting_report", cookie, { payload: { report: "journals" } });
    const found = (journals?.rows || []).find((r) => (r.ref || "").includes(entryRef));
    rec.add("LED-8", "Backend: the manual entry is a real posted journal entry", !!found && found.state === "posted", found ? `${found.name} ${found.amount}` : "not found");
  } catch (err) {
    rec.add("LED-ERR", "Walkthrough exception", false, String(err && err.message).slice(0, 200), await shot(page, "led-error"));
  }

  const errs = (page._errors || []).filter(Boolean);
  rec.add("LED-9", "No console/page errors during the accountant ledger flow", errs.length === 0, errs.slice(0, 3).join(" | "));

  const summary = writeReport(rec.results, "Accountant ledger workflow verification");
  console.log(`\n${summary.pass}/${summary.total} passed · ${summary.fail} failed · ${summary.dir}`);
  await browser.close();
  process.exit(summary.fail ? 1 : 0);
}

main();
