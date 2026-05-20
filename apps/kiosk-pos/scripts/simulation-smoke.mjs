import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const verificationDir = path.resolve(appRoot, "verification");
const baseUrl = process.env.KIOSK_POS_URL || "http://127.0.0.1:5174";
let server;

async function main() {
  fs.mkdirSync(verificationDir, { recursive: true });
  await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 980 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(() => {
    window.localStorage.removeItem("bayaan.mode.v1");
    window.localStorage.setItem("BAYAAN_SIMULATION", "peak");
    window.localStorage.setItem("BAYAAN_SIMULATION_SEED", "20260516");
    window.localStorage.setItem("BAYAAN_SIMULATION_MINUTES", "60");
    window.localStorage.setItem("BAYAAN_SIMULATION_SPEED", "1");
    window.localStorage.setItem("bayaan.kiosk.v1", "K-01");
  });

  await page.goto(`${baseUrl}/?bayaanSimulation=peak&bayaanSeed=20260516&bayaanSimMinutes=60&bayaanSimSpeed=1`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expectVisible(page, "Simulation mode");
  await expectVisible(page, "Simulation");
  await expectVisible(page, "0/60 min / 10 kiosks / x1");
  await expectBodyMatch(page, /TOTAL SALES TODAY\s+engine only\s+IQD 0/, "zero-start sales KPI was not zero");
  await expectBodyMatch(page, /CASH EXPECTED\s+cash drawer total\s+IQD 0/, "zero-start cash KPI was not zero");
  await expectBodyMatch(page, /DIGITAL PAYMENTS\s+card, QR, wallet, manual\s+IQD 0/, "zero-start digital KPI was not zero");
  await expectBodyMatch(page, /ORDERS\s+avg 0\s+0/, "zero-start order KPI was not zero");
  const zeroStartText = await page.locator("body").innerText();
  assert(!zeroStartText.includes("TOTAL\n2.50M"), "zero-start payment mix appears to include opening cash float");
  await page.screenshot({ path: path.join(verificationDir, "simulation-start-zero.png"), fullPage: true });

  await Promise.all([
    page.waitForURL(/bayaanSimSpeed=2/, { timeout: 10_000 }),
    page.getByRole("button", { name: "x2", exact: true }).click(),
  ]);
  await expectVisible(page, "Simulation mode");
  await expectVisible(page, "x2");
  await expectProgress(page, 2, 10, 6_000, { speed: 2 });
  await expectPulseBars(page, 2);
  await page.screenshot({ path: path.join(verificationDir, "simulation-progress-x2.png"), fullPage: true });

  await Promise.all([
    page.waitForURL(/bayaanSimSpeed=5/, { timeout: 10_000 }),
    page.getByRole("button", { name: "x5", exact: true }).click(),
  ]);
  await expectVisible(page, "Simulation mode");
  await expectVisible(page, "x5");
  await expectProgress(page, 4, 20, 5_000, { speed: 5 });
  await expectPulseBars(page, 3);
  await page.screenshot({ path: path.join(verificationDir, "simulation-progress-x5.png"), fullPage: true });

  await page.goto(`${baseUrl}/?bayaanSimulation=peak&bayaanSeed=20260516&bayaanSimMinutes=60&bayaanSimSpeed=10`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expectVisible(page, "Simulation mode");
  await expectVisible(page, "x10");
  await expectProgress(page, 5, 30, 4_000, { speed: 10 });
  await expectPulseBars(page, 3);
  await page.screenshot({ path: path.join(verificationDir, "simulation-progress-x10.png"), fullPage: true });

  const text = await page.locator("body").innerText();
  assert(!text.includes("TOTAL 2.60M"), "payment mix appears to include opening cash float");

  await expectProgress(page, 55, 60, 20_000, { speed: 10 });
  await expectProgress(page, 0, 15, 5_000, { speed: 10 });
  await page.screenshot({ path: path.join(verificationDir, "simulation-loop-x10.png"), fullPage: true });

  await page.goto(`${baseUrl}/?bayaanSimulation=peak&bayaanSeed=20260516&bayaanSimMinutes=60&bayaanSimSpeed=1&bayaanSimStart=full&bayaanSimLoop=0`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expectVisible(page, "60/60 min / 10 kiosks / x1");
  await expectBodyMatch(page, /TOTAL SALES TODAY\s+engine only\s+IQD 3,658,500/, "final sales KPI did not match target simulation total", 8_000);
  await expectBodyMatch(page, /PROFIT ESTIMATE\s+75\.8% margin\s+IQD 2,772,179/, "final overview profit estimate did not include close variance impact", 8_000);
  await expectBodyMatch(page, /CASH EXPECTED\s+cash drawer total\s+IQD 1,699,500/, "final cash KPI did not reconcile to simulated cash payments", 8_000);
  await expectBodyMatch(page, /DIGITAL PAYMENTS\s+card, QR, wallet, manual\s+IQD 1,959,000/, "final digital KPI did not reconcile to simulated digital payments", 8_000);
  await expectBodyMatch(page, /KIOSK STATUS\s+1 low-stock alerts\s+7 open \/ 3 closed/, "final kiosk close status did not show 7 open / 3 closed", 8_000);
  await expectBodyMatch(page, /ORDERS\s+avg 5,901\s+620/, "final order KPI did not hit 620 target orders", 8_000);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-full.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Kiosks" }).first().click();
  for (const kioskName of [
    "Karrada Center",
    "Mansour District",
    "Baghdad Mall",
    "Zayouna Plaza",
    "Al Mansour Mall",
    "University Street",
    "Karada Riverside",
    "Palestine Street",
    "Yarmouk Hospital",
    "Adhamiya Walk",
  ]) {
    await page.locator(".nav-item", { hasText: "Kiosks" }).first().click();
    await page.locator(".card", { hasText: kioskName }).first().click();
    await expectVisible(page, "Daily stock reconciliation");
    await page.getByRole("button", { name: "Sales", exact: true }).click();
    await expectBodyMatch(page, /Source POS orders[\s\S]*14:5\d:\d{2}/, `final ${kioskName} kiosk detail did not show minute-50+ source POS orders`);
  }
  await page.screenshot({ path: path.join(verificationDir, "simulation-kiosk-detail-late-orders.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Today Command" }).first().click();
  await expectVisible(page, "60/60 min / 10 kiosks / x1");
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark" && document.querySelector(".app-frame")?.getAttribute("data-theme") === "dark");
  await expectVisible(page, "Simulation mode");
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-dark-mode.png"), fullPage: true });
  await page.getByRole("button", { name: "Light theme" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light" && document.querySelector(".app-frame")?.getAttribute("data-theme") === "light");
  await page.waitForTimeout(350);

  await page.locator(".nav-item", { hasText: "Daily Close" }).first().click();
  await expectVisible(page, "Today's closes");
  const closeText = await page.locator("body").innerText();
  for (const expected of ["Mansour District", "Zayouna Plaza", "Yarmouk Hospital", "IQD -38K", "IQD -2K", "Pending approval", "DIGITAL PAYMENTS"]) {
    assert(closeText.includes(expected), `final Daily Close screen missing ${expected}`);
  }
  await page.locator("tr", { hasText: "Zayouna Plaza" }).first().click();
  await expectVisible(page, "SIM-CLOSE-K-04");
  const zayounaCloseText = await page.locator("body").innerText();
  for (const expected of ["Variance inputs", "Baghdad oranges", "38 kg", "30 kg", "7.98 kg", "1.36 kg", "58.67 kg", "57.27 kg", "-1.4 kg", "IQD -1,680"]) {
    assert(zayounaCloseText.includes(expected), `expanded Zayouna close reconciliation missing ${expected}`);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-daily-close.png"), fullPage: true });
  await page.getByRole("button", { name: /Approve close/ }).click();
  const approvedCloseText = await expectTransferRow(page, "Zayouna Plaza", /Approved[\s\S]*Approved by manager/i, "interactive shift close approval did not move Zayouna to approved manager-reviewed state");
  assert(!/Pending approval/i.test(approvedCloseText), "interactive shift close approval left the Zayouna row pending");
  await page.locator("tr", { hasText: "Zayouna Plaza" }).first().click();
  await expectVisible(page, "Approved by manager");
  assert((await page.getByRole("button", { name: /Approve close/ }).count()) === 0, "approved close still exposed an Approve close action");
  await page.screenshot({ path: path.join(verificationDir, "simulation-shift-close-approved.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Reports" }).first().click();
  await expectVisible(page, "Profit & loss");
  await expectVisible(page, "Variance impact");
  await expectBodyMatch(page, /Variance impact\s+\(IQD 33,680\)/, "final Reports P&L did not include close variance impact", 8_000);
  await page.getByText("Variance impact", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-reports.png"), fullPage: false });
  const reportDownload = await downloadFromClick(page, page.getByRole("button", { name: /Export pack/ }).first());
  const reportCsv = fs.readFileSync(reportDownload.path, "utf8");
  for (const expected of [
    "Summary,Cash variance,-32000,bayaan.shift.close",
    "Summary,Stock variance value,-1680,bayaan.shift.close.line",
    "Summary,Variance impact,-33680,bayaan.shift.close + stock valuation",
    "Summary,Waste and loss,22656,bayaan.waste.entry + bayaan.shift.close",
    "Summary,Payroll,1180000,HR payroll schedule",
    "Summary,Net profit after payroll,1592179,deterministic report aggregate + HR payroll schedule",
    "Summary,Cash expected,1699500,pos.payment cash",
    "Summary,Digital payments,1959000,pos.payment non-cash",
    "Payment method,Digital total,1959000,pos.payment",
  ]) {
    assert(reportCsv.includes(expected), `exported management report CSV missing ${expected}`);
  }
  for (const [label, source] of [
    ["Transfer rows", "stock.picking"],
    ["Purchase orders", "purchase.order"],
    ["Supplier rows", "res.partner"],
    ["Recurring purchase plans", "bayaan.recurring.purchase"],
    ["Product rows", "product.product"],
    ["Warehouse stock rows", "stock.quant"],
  ]) {
    const pattern = new RegExp(`Traceability,${label},[1-9]\\d*,${source.replaceAll(".", "\\.")}`);
    assert(pattern.test(reportCsv), `exported management report CSV missing traceability row for ${label}`);
  }

  await page.locator(".nav-item", { hasText: "Waste & Loss" }).first().click();
  await expectVisible(page, "Waste reason control");
  await expectBodyMatch(page, /LOSS TODAY\s+IQD 22,656[\s\S]*% OF REVENUE\s+0\.62%/, "final Waste screen did not reconcile loss KPI to simulated waste rows", 8_000);
  const wasteText = await page.locator("body").innerText();
  for (const expected of ["Waste entries", "Palestine Street", "Pistachio cake trim", "IQD 2,650", "Spoiled"]) {
    assert(wasteText.includes(expected), `final Waste screen missing ${expected}`);
  }
  assert(/(?:x|×)1/.test(wasteText), "final Waste screen missing quantity x1");
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-waste.png"), fullPage: true });

  await switchToPos(page);
  await expectVisible(page, "Good morning");
  await page.getByRole("button", { name: /Maya Ahmed/ }).click();
  for (const digit of ["1", "2", "3", "4"]) {
    await clickExactButton(page, digit);
  }
  await page.getByRole("button", { name: /Start shift/ }).click();
  await expectVisible(page, "Current order");
  await page.locator("button.card", { hasText: "Latte" }).first().click();
  await page.getByRole("button", { name: /Charge/ }).click();
  await page.getByRole("button", { name: /^Cash/ }).click();
  await expectVisible(page, "Payment complete");
  await expectVisible(page, "Recorded");
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-manual-sale-payment.png"), fullPage: true });
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.locator(".nav-item", { hasText: "Sales & POS" }).first().click();
  await expectBodyMatch(page, /SIM-MANUAL-0001[\s\S]*Latte[\s\S]*cash[\s\S]*IQD 4,725/, "manual POS sale did not flow into simulated Sales & POS dashboard", 8_000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-manual-sale-dashboard.png"), fullPage: true });
  await switchToPos(page);
  await expectVisible(page, "Current order");
  await page.getByRole("button", { name: "Waste", exact: true }).click();
  await expectVisible(page, "Record waste");
  await page.locator("button.card", { hasText: "Coffee beans" }).first().click();
  await page.getByRole("button", { name: "Spill / drop", exact: true }).click();
  await expectVisible(page, "Loss value");
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-waste-entry.png"), fullPage: true });
  await page.getByRole("button", { name: /Submit waste/ }).click();
  await expectVisible(page, "Waste recorded");
  await expectVisible(page, "Current order");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.locator(".nav-item", { hasText: "Waste & Loss" }).first().click();
  await expectBodyMatch(page, /LOSS TODAY\s+IQD 40,656/, "manual POS waste did not flow into simulated Waste dashboard total", 8_000);
  const wasteAfterPosText = await page.locator("body").innerText();
  for (const expected of ["Karrada Center", "Coffee beans", "Spill / drop", "IQD 18,000"]) {
    assert(wasteAfterPosText.includes(expected), `manual POS waste dashboard missing ${expected}`);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-waste-dashboard.png"), fullPage: true });
  await switchToPos(page);
  await expectVisible(page, "Current order");
  await page.getByRole("button", { name: /End shift/ }).click();
  await expectVisible(page, "Close shift");
  const countedCashInput = page.locator("input.input[type='number']").first();
  const expectedCashPlaceholder = await countedCashInput.getAttribute("placeholder");
  const expectedCashValue = Number(String(expectedCashPlaceholder || "").replace(/[^0-9.]/g, ""));
  assert(expectedCashValue === 407_725, `simulation POS close expected cash did not exactly include simulated K-01 cash orders plus manual sale: ${expectedCashPlaceholder}`);
  const closeCountText = await page.locator("body").innerText();
  assert(/COFFEE-BEANS\s+10\.96 kg/.test(closeCountText), "simulation POS close stock count did not include manual sale plus manual waste coffee-bean deduction");
  await countedCashInput.fill(String(expectedCashValue));
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-close-expected-cash.png"), fullPage: true });
  await page.getByRole("button", { name: /Submit close/ }).click();
  await expectVisible(page, "Shift close submitted");
  await expectVisible(page, "Good morning");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.locator(".nav-item", { hasText: "Daily Close" }).first().click();
  const manualCloseRow = await expectTransferRow(page, "Karrada Center", /Maya Ahmed[\s\S]*IQD 408K[\s\S]*IQD 408K[\s\S]*Pending approval/i, "manual POS close did not persist into simulated Daily Close dashboard");
  assert(manualCloseRow.includes("IQD 0"), "manual POS close should show zero cash variance when counted cash matches expected cash");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-close-dashboard.png"), fullPage: true });
  await page.locator("tr", { hasText: "Karrada Center" }).first().click();
  await page.getByRole("button", { name: /Approve close/ }).click();
  await page.waitForTimeout(1_200);
  const approvedManualCloseRow = await expectTransferRow(page, "Karrada Center", /Approved[\s\S]*Approved by manager/i, "manual POS close approval did not persist after simulated refresh");
  assert(!/Pending approval/i.test(approvedManualCloseRow), "manual POS close approval reverted to pending after simulated refresh");
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-close-approved-persistent.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectVisible(page, "Warehouse transfers");
  const stockText = await page.locator("body").innerText();
  for (const expected of ["WH/INT/PEAK-001", "WH/INT/PEAK-002", "completed", "dispatched", "Kiosk stock needs", "ORANGES", "2020 kg"]) {
    assert(stockText.includes(expected), `final Stock & Allocation screen missing ${expected}`);
  }
  const completedBadgeClass = await page.locator('[data-slot="badge"], .badge', { hasText: /completed|received/i }).first().getAttribute("class");
  assert(/badge-pos|emerald/i.test(completedBadgeClass || ""), "completed transfer did not render as a received/positive state");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-stock-transfer.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Purchases & Suppliers" }).first().click();
  await expectVisible(page, "Open purchase orders");
  const purchaseText = await page.locator("body").innerText();
  for (const expected of ["PO/SIM/ORANGES-0516", "Mesopotamia Fresh", "ORANGES 900/1,600 kg received", "IQD 1,920,000", "partial"]) {
    assert(purchaseText.includes(expected), `final Purchases screen missing ${expected}`);
  }
  const partialBadgeClass = await page.locator('[data-slot="badge"], .badge', { hasText: "partial" }).first().getAttribute("class");
  assert(/badge-warn|amber/i.test(partialBadgeClass || ""), "partial purchase receipt did not render as an open/warning state");
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-purchases.png"), fullPage: true });
  await page.locator("tr", { hasText: "PO/SIM/ORANGES-0516" }).first().getByRole("button", { name: "Complete" }).click();
  const completedPoRow = await expectTransferRow(page, "PO/SIM/ORANGES-0516", /received/i, "interactive purchase receive did not move partial PO to received");
  assert(!/\tpartial\t/i.test(completedPoRow), "interactive purchase receive left the status column as partial");
  const receivedBadgeClass = await page.locator("tr", { hasText: "PO/SIM/ORANGES-0516" }).first().locator('[data-slot="badge"], .badge', { hasText: "received" }).getAttribute("class");
  assert(/badge-pos|emerald/i.test(receivedBadgeClass || ""), "received purchase order did not render as a positive/closed state");
  await page.screenshot({ path: path.join(verificationDir, "simulation-purchase-received.png"), fullPage: true });
  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectMatchingRow(page, "ORANGES", /Central warehouse[\s\S]*2,?720\s*kg/i, "completed purchase receipt did not add the remaining oranges into warehouse stock");
  await page.screenshot({ path: path.join(verificationDir, "simulation-purchase-stock-reconciled.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Purchases & Suppliers" }).first().click();
  await expectVisible(page, "Open purchase orders");
  await page.getByRole("button", { name: /Upload invoice/ }).first().click();
  await expectVisible(page, "Invoice first");
  await page.locator("[role='dialog']").getByPlaceholder("Invoice number").fill("INV-SIM-MANUAL-001");
  await page.locator("[role='dialog']").getByRole("button", { name: /Create purchase order/ }).click();
  const manualPoId = "PO/SIM/MANUAL-0001";
  await expectTransferRow(page, manualPoId, /COFFEE-BEANS[\s\S]*0\/25 kg received[\s\S]*purchase/i, "interactive purchase order did not appear as a persisted simulation PO row with source item code");
  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await expectVisible(page, "HR & Payroll");
  await page.locator(".nav-item", { hasText: "Purchases & Suppliers" }).first().click();
  await expectTransferRow(page, manualPoId, /INV-SIM-MANUAL-001[\s\S]*purchase/i, "manual purchase order disappeared after leaving and returning to Purchases & Suppliers");
  await page.screenshot({ path: path.join(verificationDir, "simulation-purchase-source-persisted.png"), fullPage: true });
  await page.locator("tr", { hasText: manualPoId }).first().getByRole("button", { name: "Receive" }).click();
  await expectTransferRow(page, manualPoId, /COFFEE-BEANS[\s\S]*25\/25 kg received[\s\S]*received/i, "manual purchase receipt did not close the created PO with source item code");
  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectMatchingRow(page, "COFFEE-BEANS", /Central warehouse[\s\S]*205\s*kg/i, "manual purchase receipt did not add coffee beans into warehouse stock");
  await page.screenshot({ path: path.join(verificationDir, "simulation-purchase-manual-received-stock.png"), fullPage: true });
  await page.locator(".nav-item", { hasText: "Purchases & Suppliers" }).first().click();
  await expectTransferRow(page, "Daily oranges replenishment", /ORANGES x 1400/i, "simulation recurring purchase plan did not expose source item lines");
  await page.locator("tr", { hasText: "Daily oranges replenishment" }).first().getByRole("button", { name: "Create PO" }).click();
  const recurringPoId = "PO/SIM/REC-0001";
  await expectTransferRow(page, recurringPoId, /ORANGES[\s\S]*0\/1,400 kg received[\s\S]*purchase/i, "recurring purchase run did not create a persisted source PO row");
  await page.screenshot({ path: path.join(verificationDir, "simulation-recurring-purchase-po-created.png"), fullPage: true });

  await page.getByRole("button", { name: /Add supplier/ }).first().click();
  await expectVisible(page, "Supplier setup");
  await page.locator("[role='dialog']").getByPlaceholder("Supplier name").fill("Simulation Spice Co");
  await page.locator("[role='dialog']").getByPlaceholder("Address").fill("Karrada wholesale market");
  await page.locator("[role='dialog']").getByPlaceholder("Category").fill("Spices");
  await page.locator("[role='dialog']").locator("select").first().selectOption("Weekly");
  await page.locator("[role='dialog']").getByRole("button", { name: /Add supplier/ }).click();
  await page.locator("[role='dialog']").waitFor({ state: "detached", timeout: 8_000 });
  await expectTransferRow(page, "Simulation Spice Co", /Spices[\s\S]*Karrada wholesale market[\s\S]*Weekly/i, "manual supplier did not persist into simulated supplier source rows");
  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await expectVisible(page, "HR & Payroll");
  await page.locator(".nav-item", { hasText: "Purchases & Suppliers" }).first().click();
  await expectTransferRow(page, "Simulation Spice Co", /Spices[\s\S]*Karrada wholesale market[\s\S]*Weekly/i, "manual supplier disappeared after leaving and returning to Purchases & Suppliers");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-supplier-source-persisted.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Items Catalog" }).first().click();
  await expectVisible(page, "Stock item catalog");
  await page.getByRole("button", { name: /New item/ }).click();
  await expectVisible(page, "Creates a global purchasable stock item");
  await page.locator("[role='dialog']").getByPlaceholder("Milk whole 1L").fill("Cardamom pods");
  await page.locator("[role='dialog']").getByPlaceholder("MILK-WHOLE-1L").fill("CARDAMOM-PODS");
  await page.locator("[role='dialog']").getByPlaceholder("Ingredients").fill("Spices");
  await page.locator("[role='dialog']").locator("select").first().selectOption("kg");
  await page.locator("[role='dialog']").getByPlaceholder("Default supplier").fill("Simulation Spice Co");
  await page.locator("[role='dialog']").getByPlaceholder("Unit cost").fill("65000");
  await page.locator("[role='dialog']").getByPlaceholder("Purchase price").fill("65000");
  await page.locator("[role='dialog']").getByRole("button", { name: /Create item/ }).click();
  await page.locator("[role='dialog']").waitFor({ state: "detached", timeout: 8_000 });
  await expectTransferRow(page, "CARDAMOM-PODS", /Spices[\s\S]*kg[\s\S]*Simulation Spice Co[\s\S]*IQD 65,000/i, "manual stock item did not persist into simulated item catalog rows with supplier and unit cost");
  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectMatchingRow(page, "CARDAMOM-PODS", /Central warehouse[\s\S]*0\s*kg/i, "manual stock item did not create a source warehouse stock row");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-stock-item-source-persisted.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Products & Recipes" }).first().click();
  await expectVisible(page, "Recipe cost and margin control");
  await page.getByRole("button", { name: /New product/ }).click();
  await expectVisible(page, "Fill in name, price, category, and ingredients");
  await page.locator("[role='dialog']").getByPlaceholder("e.g. Vanilla Latte").fill("Simulation Pomegranate Juice");
  await page.locator("[role='dialog']").locator("input[type='number']").first().fill("7000");
  await page.locator("[role='dialog']").getByRole("button", { name: /Add line/ }).click();
  await page.locator("[role='dialog']").locator("select").last().selectOption("CARDAMOM-PODS");
  await page.locator("[role='dialog']").locator("input[type='number']").nth(1).fill("0.01");
  await page.locator("[role='dialog']").getByRole("button", { name: /Add product/ }).click();
  await page.locator("[role='dialog']").waitFor({ state: "detached", timeout: 8_000 });
  await expectTransferRow(page, "Simulation Pomegranate Juice", /Juice[\s\S]*IQD 7,000[\s\S]*(manual-sim-v|active|lines)/i, "manual product catalog and recipe version did not persist into simulated Product & Recipes rows");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-product-recipe-source-persisted.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await expectVisible(page, "HR & Payroll");
  await expectBodyMatch(page, /Active staff\s+20\s+HR roster/i, "final Staff screen did not reconcile active staff to simulated HR rows", 8_000);
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,180,000\s+report payroll/i, "final Staff screen did not reconcile payroll to simulated HR summary", 8_000);
  const staffText = await page.locator("body").innerText();
  for (const expected of ["Karrada Center", "Barista 1", "Karada Riverside", "0/1 staffed"]) {
    assert(staffText.includes(expected), `final Staff screen missing ${expected}`);
  }
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-payroll.png"), fullPage: true });

  const sourceStaffName = "Simulation Night Runner";
  await page.getByRole("button", { name: /Add staff/ }).click();
  let dialog = page.locator("[role='dialog']");
  await dialog.getByPlaceholder("e.g. Hassan Ali").fill(sourceStaffName);
  await dialog.locator("select").nth(0).selectOption("Other");
  await dialog.locator("select").nth(1).selectOption("K-07");
  await dialog.locator("input[type='number']").nth(0).fill("50000");
  await dialog.locator("input[type='number']").nth(1).fill("120");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Active staff\s+21\s+HR roster/i, "source-backed Staff add did not update active staff count", 8_000);
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,230,000\s+report payroll/i, "source-backed Staff add did not update payroll accrual", 8_000);

  await page.getByRole("button", { name: /Assign shift/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("K-07");
  await dialog.locator("input[type='date']").fill("2026-05-16");
  await dialog.locator("select").nth(2).selectOption("Other");
  await dialog.locator("input[type='time']").nth(0).fill("17:00");
  await dialog.locator("input[type='time']").nth(1).fill("21:00");
  await dialog.locator("select").nth(3).selectOption("confirmed");
  await dialog.getByPlaceholder("Note").fill("Simulation peak gap coverage");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Simulation Night Runner[\s\S]*Karada Riverside \/ Other[\s\S]*confirmed/, "source-backed shift did not persist its confirmed state into weekly roster", 8_000);

  await page.getByRole("button", { name: /Add expense/ }).click();
  dialog = page.locator("[role='dialog']");
  await dialog.getByPlaceholder("Expense name").fill("Generator top-up");
  await dialog.locator("select").first().selectOption("Utilities");
  await dialog.getByPlaceholder("Amount IQD").fill("44000");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Generator top-up[\s\S]*Utilities[\s\S]*IQD 44,000/, "source-backed operating expense did not persist into Staff expenses", 8_000);
  await page.getByText("Generator top-up", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-expense-source-persisted.png"), fullPage: false });
  await page.getByRole("button", { name: /Add expense/ }).click();
  dialog = page.locator("[role='dialog']");
  await dialog.getByPlaceholder("Expense name").fill("Generator top-up");
  await dialog.locator("select").first().selectOption("Utilities");
  await dialog.getByPlaceholder("Amount IQD").fill("44000");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  const expenseRetryRows = await page.locator("tr", { hasText: "Generator top-up" }).count();
  assert(expenseRetryRows === 1, `duplicate operating-expense retry created ${expenseRetryRows} visible Staff rows`);
  await expectBodyMatch(page, /Generator top-up[\s\S]*Utilities[\s\S]*IQD 44,000/, "duplicate source-backed operating expense retry changed Staff expense row", 8_000);
  await page.getByText("Generator top-up", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-expense-duplicate-retry.png"), fullPage: false });

  await page.getByRole("button", { name: /Adjustment/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("cash_shortage");
  await dialog.getByPlaceholder("Amount IQD").fill("3000");
  await dialog.getByPlaceholder("Reason").fill("Cash shortage under review");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,230,000\s+report payroll/i, "draft source-backed deduction changed payroll accrual before approval", 8_000);
  await expectTransferRow(page, sourceStaffName, /IQD 50,000[\s\S]*-[\s\S]*IQD 50,000[\s\S]*Hold/, "draft source-backed deduction changed displayed net pay before approval");
  await page.getByText(sourceStaffName, { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-draft-deduction-held.png"), fullPage: true });

  await page.getByRole("button", { name: /Review payroll/ }).click();
  await expectBodyMatch(page, /HR & Payroll[\s\S]*Reviewed/, "held deduction payroll review did not create a reviewed source run", 8_000);
  const heldPayrollExport = await downloadFromClick(page, page.getByRole("button", { name: /Export payroll/ }).first());
  const heldPayrollCsv = fs.readFileSync(heldPayrollExport.path, "utf8");
  assert(/Payroll run,Payroll .*?,\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2},reviewed,1230000,0,1230000/.test(heldPayrollCsv), "held draft cash-shortage leaked into reviewed payroll run totals");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-held-payroll-review.png"), fullPage: true });

  await clickRowAction(page, "Cash shortage under review", "Approve adjustment");
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,227,000\s+report payroll/i, "approved source-backed deduction did not reduce payroll accrual", 8_000);
  await expectTransferRow(page, sourceStaffName, /IQD 50,000[\s\S]*IQD -3,000[\s\S]*IQD 47,000[\s\S]*Ready/, "approved source-backed deduction did not reduce displayed net pay");
  const approvedAdjustmentRow = await expectTransferRow(page, "Cash shortage under review", /approved[\s\S]*-/, "approved source-backed deduction still exposed action controls");
  assert(!/Approve adjustment|Reject adjustment/.test(approvedAdjustmentRow), "approved source-backed deduction exposed reversal controls");
  await page.getByText("Cash shortage under review", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-deduction-approved-source.png"), fullPage: true });

  await page.getByRole("button", { name: /Adjustment/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("cash_shortage");
  await dialog.getByPlaceholder("Amount IQD").fill("2000");
  await dialog.getByPlaceholder("Reason").fill("Mistaken shortage rejected");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,227,000\s+report payroll/i, "second draft cash-shortage changed payroll accrual before review", 8_000);
  await clickRowAction(page, "Mistaken shortage rejected", "Reject adjustment");
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,227,000\s+report payroll/i, "rejected source-backed cash-shortage changed payroll accrual", 8_000);
  await expectTransferRow(page, sourceStaffName, /IQD 50,000[\s\S]*IQD -3,000[\s\S]*IQD 47,000[\s\S]*Ready/, "rejected cash-shortage affected displayed net pay or left staff on hold");
  const rejectedAdjustmentRow = await expectTransferRow(page, "Mistaken shortage rejected", /rejected[\s\S]*-/, "rejected source-backed cash-shortage still exposed action controls");
  assert(!/Approve adjustment|Reject adjustment/.test(rejectedAdjustmentRow), "rejected source-backed cash-shortage exposed reversal controls");
  await page.getByText("Mistaken shortage rejected", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-deduction-rejected-source.png"), fullPage: true });
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-adjustment-terminal-decisions.png"), fullPage: true });
  await page.getByRole("button", { name: /Adjustment/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("cash_shortage");
  await dialog.getByPlaceholder("Amount IQD").fill("3000");
  await dialog.getByPlaceholder("Reason").fill("Cash shortage under review");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectTransferRow(page, "Cash shortage under review", /approved[\s\S]*-/, "duplicate approved cash-shortage retry did not reuse the terminal source adjustment");
  const approvedRetryRows = await page.locator("tr", { hasText: "Cash shortage under review" }).count();
  assert(approvedRetryRows === 1, `duplicate approved cash-shortage retry created ${approvedRetryRows} visible source rows`);
  await page.getByText("Cash shortage under review", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-adjustment-duplicate-retry.png"), fullPage: true });

  await page.getByRole("button", { name: /Record attendance/ }).click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("input[type='date']").fill("2026-05-16");
  await dialog.locator("input[type='time']").nth(0).fill("17:00");
  await dialog.locator("input[type='time']").nth(1).fill("21:00");
  await dialog.getByPlaceholder("Attendance note").fill("Peak runner attendance");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Simulation Night Runner[\s\S]*K-07 - 4h[\s\S]*Peak runner attendance - Attendance logged[\s\S]*approved/, "source-backed attendance did not persist with computed worked hours", 8_000);
  await page.getByText("Peak runner attendance - Attendance logged", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(4_200);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-attendance-source-persisted.png"), fullPage: false });
  await page.getByRole("button", { name: /Record attendance/ }).click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("input[type='date']").fill("2026-05-16");
  await dialog.locator("input[type='time']").nth(0).fill("17:00");
  await dialog.locator("input[type='time']").nth(1).fill("21:00");
  await dialog.getByPlaceholder("Attendance note").fill("Peak runner attendance");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  const attendanceRetryRows = await page.locator("tr", { hasText: "Peak runner attendance - Attendance logged" }).count();
  assert(attendanceRetryRows === 1, `duplicate attendance retry created ${attendanceRetryRows} visible Staff rows`);
  await expectBodyMatch(page, /Simulation Night Runner[\s\S]*K-07 - 4h[\s\S]*Peak runner attendance - Attendance logged[\s\S]*approved/, "duplicate source-backed attendance retry changed Staff attendance row", 8_000);
  await page.getByText("Peak runner attendance - Attendance logged", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-attendance-duplicate-retry.png"), fullPage: false });

  await page.getByRole("button", { name: /Adjustment/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("bonus");
  await dialog.getByPlaceholder("Amount IQD").fill("5000");
  await dialog.getByPlaceholder("Reason").fill("Peak runner coverage");
  await dialog.locator("button[type='submit']").click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,232,000\s+report payroll/i, "source-backed payroll bonus did not update payroll accrual after approved deduction", 8_000);
  await expectBodyMatch(page, /Simulation Night Runner[\s\S]*IQD 50,000[\s\S]*IQD 2,000[\s\S]*IQD 52,000/, "source-backed payroll row did not include the approved deduction and bonus", 8_000);

  await page.getByRole("button", { name: /Review payroll/ }).click();
  await expectBodyMatch(page, /HR & Payroll[\s\S]*Reviewed/, "source-backed payroll run did not move to reviewed state", 8_000);
  await page.getByRole("button", { name: /Approve payroll/ }).click();
  await expectBodyMatch(page, /HR & Payroll[\s\S]*Approved/, "source-backed payroll run did not move to approved state", 8_000);
  const payrollExportBeforePaid = await downloadFromClick(page, page.getByRole("button", { name: /Export payroll/ }).first());
  const reviewedPayrollCsv = fs.readFileSync(payrollExportBeforePaid.path, "utf8");
  assert(reviewedPayrollCsv.includes("Attendance,Simulation Night Runner,K-07,Peak runner attendance - Attendance logged,4,approved"), "source payroll export did not include the computed attendance row");
  assert(reviewedPayrollCsv.includes("Adjustment,Simulation Night Runner,cash_shortage,3000,-3000,Cash shortage under review,approved"), "source payroll export did not include the approved cash-shortage adjustment impact row");
  assert(reviewedPayrollCsv.includes("Adjustment,Simulation Night Runner,cash_shortage,2000,0,Mistaken shortage rejected,rejected"), "source payroll export did not include the rejected cash-shortage zero-impact row");
  assert(reviewedPayrollCsv.includes("Adjustment,Simulation Night Runner,bonus,5000,5000,Peak runner coverage,approved"), "source payroll export did not include the approved bonus impact row");
  assert(reviewedPayrollCsv.includes("Expense,Generator top-up,Utilities,44000,"), "source payroll export did not include the persisted operating expense row");
  assert(/Payroll run,Payroll .*?,\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2},approved,1230000,2000,1232000/.test(reviewedPayrollCsv), "source payroll export did not include the approved run summary");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-payroll-source-persisted.png"), fullPage: true });
  await page.getByRole("button", { name: /Mark paid/ }).click();
  await expectBodyMatch(page, /HR & Payroll[\s\S]*Paid/, "source-backed payroll run did not move to paid state", 8_000);
  const payrollExportAfterPaid = await downloadFromClick(page, page.getByRole("button", { name: /Export payroll/ }).first());
  const paidPayrollCsv = fs.readFileSync(payrollExportAfterPaid.path, "utf8");
  assert(paidPayrollCsv.includes("Attendance,Simulation Night Runner,K-07,Peak runner attendance - Attendance logged,4,approved"), "paid source payroll export did not retain the computed attendance row");
  assert(paidPayrollCsv.includes("Adjustment,Simulation Night Runner,cash_shortage,3000,-3000,Cash shortage under review,approved"), "paid source payroll export did not retain the approved cash-shortage adjustment impact row");
  assert(paidPayrollCsv.includes("Adjustment,Simulation Night Runner,cash_shortage,2000,0,Mistaken shortage rejected,rejected"), "paid source payroll export did not retain the rejected cash-shortage zero-impact row");
  assert(paidPayrollCsv.includes("Adjustment,Simulation Night Runner,bonus,5000,5000,Peak runner coverage,approved"), "paid source payroll export did not retain the approved bonus impact row");
  assert(paidPayrollCsv.includes("Expense,Generator top-up,Utilities,44000,"), "paid source payroll export did not retain the persisted operating expense row");
  assert(/Payroll run,Payroll .*?,\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2},paid,1230000,2000,1232000/.test(paidPayrollCsv), "source payroll export did not include the paid run summary");
  await page.waitForTimeout(4_200);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-payroll-paid-source-persisted.png"), fullPage: true });
  await page.getByRole("button", { name: /Adjustment/ }).first().click();
  dialog = page.locator("[role='dialog']");
  await dialog.locator("select").nth(0).selectOption({ label: sourceStaffName });
  await dialog.locator("select").nth(1).selectOption("cash_shortage");
  await dialog.getByPlaceholder("Amount IQD").fill("1000");
  await dialog.getByPlaceholder("Reason").fill("Late shortage after paid payroll");
  await dialog.locator("button[type='submit']").click();
  await expectBodyMatch(page, /Payroll period already approved or paid; use the next run/, "paid payroll period did not block a late cash-shortage adjustment", 8_000);
  await expectBodyMatch(page, /Accrued payroll\s+IQD 1,232,000\s+report payroll/i, "blocked late cash-shortage changed paid payroll accrual", 8_000);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-payroll-paid-adjustment-blocked.png"), fullPage: false });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });

  await page.locator(".nav-item", { hasText: "Reports" }).first().click();
  await expectVisible(page, "Profit & loss");
  await expectBodyMatch(page, /Payroll\s+\(IQD 1,232,000\)/, "Reports P&L did not pick up source-backed HR payroll adjustment", 8_000);
  await expectBodyMatch(page, /Operating expenses\s+\(IQD 44,000\)/, "Reports P&L did not subtract the source-backed operating expense", 8_000);
  await expectBodyMatch(page, /Net profit\s+IQD 1,482,024/, "Reports P&L net profit did not subtract payroll and source-backed operating expenses", 8_000);
  await expectBodyMatch(page, /HR payroll & expenses[\s\S]*hr\.employee, hr\.attendance, bayaan\.payroll\.adjustment, bayaan\.payroll\.run, bayaan\.operating\.expense/, "Reports management pack did not cite payroll adjustment/run source models", 8_000);
  await expectBodyMatch(page, /HR payroll & expenses[\s\S]*IQD 1\.23M payroll \/ IQD 44K expenses/, "Reports management pack did not expose HR payroll/expense traceability signal", 8_000);
  await page.getByText("Payroll", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(4_200);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-payroll-report-reconciled.png"), fullPage: true });
  await page.getByText("HR payroll & expenses", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-traceability-report-pack.png"), fullPage: true });
  await page.getByText("Operating expenses", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-hr-operating-expense-report-reconciled.png"), fullPage: true });
  const hrReportDownload = await downloadFromClick(page, page.getByRole("button", { name: /Export pack/ }).first());
  const hrReportCsv = fs.readFileSync(hrReportDownload.path, "utf8");
  assert(hrReportCsv.includes("Summary,Payroll,1232000,HR payroll schedule"), "source-backed HR payroll change did not reach exported management report payroll row");
  assert(hrReportCsv.includes("Summary,Operating expenses,44000,HR operating expense rows"), "source-backed operating expense did not reach exported management report expense row");
  assert(hrReportCsv.includes("Summary,Net profit after payroll,1482024,deterministic report aggregate + HR payroll schedule + operating expenses"), "source-backed operating expense did not reduce exported management report net profit");
  assert(/Traceability,Source cite,"\d+ orders, \d+ ledger rows, \d+ closes, 21 HR employees, 1[1-9] attendance rows, 3 payroll adjustments, 1 payroll runs, 1 operating expenses",summary\.sourceCounts/.test(hrReportCsv), "exported management report source cite did not include HR attendance/payroll adjustment/run/expense rows");
  assert(/Traceability,HR employee rows,2[1-9],bayaan\.hr\.employee/.test(hrReportCsv), "exported management report did not trace source-backed HR employee rows");
  assert(/Traceability,Attendance rows,1[1-9],hr\.attendance/.test(hrReportCsv), "exported management report did not trace source-backed attendance rows");
  assert(hrReportCsv.includes("Traceability,Payroll adjustments,3,bayaan.payroll.adjustment"), "exported management report did not trace source-backed payroll adjustment rows");
  assert(hrReportCsv.includes("Traceability,Payroll runs,1,bayaan.payroll.run"), "exported management report did not trace source-backed payroll run rows");
  assert(hrReportCsv.includes("Traceability,Operating expenses,1,bayaan.operating.expense"), "exported management report did not trace source-backed operating expense rows");
  assert(!hrReportCsv.includes("Summary,Payroll,1180000,HR payroll schedule"), "exported management report retained stale payroll after source-backed HR changes");

  await page.locator(".nav-item", { hasText: "AI Insights" }).first().click();
  await expectVisible(page, "Miza Insights");
  await expectBodyMatch(
    page,
    /Verified aggregate sources[\s\S]*orders\s+\d+[\s\S]*attendance\s+1[1-9][\s\S]*adjustments\s+3[\s\S]*payroll runs\s+1[\s\S]*expenses\s+1/,
    "AI Insights source chips did not expose HR attendance, payroll adjustments, payroll run, and expense counts",
    8_000,
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(verificationDir, "simulation-ai-source-traceability.png"), fullPage: true });

  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectVisible(page, "Warehouse transfers");
  await page.getByRole("button", { name: /New transfer/ }).click();
  await page.locator("[role='dialog']").locator("select").nth(0).selectOption("K-07");
  await page.locator("[role='dialog']").locator("select").nth(1).selectOption("CUP-12OZ");
  await page.locator("[role='dialog']").getByPlaceholder(/Qty|Quantity/).first().fill("260");
  await page.locator("[role='dialog']").getByRole("button", { name: /Add line/ }).click();
  await page.locator("[role='dialog']").locator("select").nth(2).selectOption("MILK-WHOLE");
  await page.locator("[role='dialog']").getByPlaceholder(/Qty|Quantity/).nth(1).fill("12");
  await page.locator("[role='dialog']").getByRole("button", { name: /Create transfer/ }).click();
  const draftId = "SIM-DRAFT-K-07-CUP-12OZ";
  await expectTransferRow(page, draftId, /CUP-12OZ x 260[\s\S]*MILK-WHOLE x 12[\s\S]*draft/i, "interactive multi-line transfer draft row did not appear");
  await clickRowAction(page, draftId, "Approve");
  await expectTransferRow(page, draftId, /approved/i, "interactive transfer did not move to approved");
  await clickRowAction(page, draftId, "Pick");
  await expectTransferRow(page, draftId, /picked/i, "interactive transfer did not move to picked");
  await clickRowAction(page, draftId, "Dispatch");
  const dispatchedRowText = await expectTransferRow(page, draftId, /dispatched[\s\S]*waiting kiosk/i, "interactive transfer did not move to dispatched waiting-kiosk state");
  assert(!/\tCUP-12OZ 260\tdraft\t/i.test(dispatchedRowText), "interactive transfer kept draft in the ETA/state column after dispatch");
  await page.screenshot({ path: path.join(verificationDir, "simulation-transfer-action-dispatched.png"), fullPage: true });
  await page.locator(".nav-item", { hasText: "Staff" }).first().click();
  await expectVisible(page, "HR & Payroll");
  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectTransferRow(page, draftId, /dispatched[\s\S]*waiting kiosk/i, "manual transfer disappeared after leaving and returning to Stock & Allocation");
  await page.screenshot({ path: path.join(verificationDir, "simulation-transfer-source-persisted.png"), fullPage: true });

  await page.goto(`${baseUrl}/?bayaanSimulation=peak&bayaanSeed=20260516&bayaanSimMinutes=60&bayaanSimSpeed=1&bayaanSimStart=full&bayaanSimLoop=0&bayaanKiosk=K-07`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await switchToPos(page);
  await expectVisible(page, "Good morning");
  await page.getByRole("button", { name: /Maya Ahmed/ }).click();
  for (const digit of ["1", "2", "3", "4"]) {
    await clickExactButton(page, digit);
  }
  await page.getByRole("button", { name: /Start shift/ }).click();
  await expectVisible(page, "Current order");
  await page.getByRole("button", { name: /Receive stock/ }).click();
  await expectVisible(page, "Expected transfers");
  await expectVisible(page, "K-07 receives only what arrived here");
  await expectVisible(page, "WH/INT/PEAK-002");
  await expectVisible(page, "Arrived - waiting for kiosk confirmation");
  await page.getByRole("button", { name: /Confirm arrived/ }).click();
  await expectVisible(page, "Confirmed at kiosk");
  await expectVisible(page, "received");
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-transfer-received.png"), fullPage: true });
  await page.locator(".tablet-screen").first().getByRole("button").first().click();
  await expectVisible(page, "Current order");
  await page.locator(".tablet-screen").first().getByRole("button", { name: /End shift/ }).click();
  await expectMatchingRow(page, "CUP-12OZ", /211\.4\s*Units/i, "POS close stock count did not refresh kiosk stock after receiving transfer");
  await page.locator(".tablet-screen").first().getByRole("button", { name: /Back/ }).click();
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.locator(".nav-item", { hasText: "Stock & Allocation" }).first().click();
  await expectVisible(page, "Warehouse transfers");
  await expectTransferRow(page, "WH/INT/PEAK-002", /received/i, "POS transfer receive did not persist as received on admin transfer row");
  await expectMatchingRow(page, "CUP-12OZ", /Central warehouse[\s\S]*11,?120\s*Units/i, "POS transfer receive did not subtract cups from warehouse stock");
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /^K-07$/ }).click();
  await expectMatchingRow(page, "CUP-12OZ", /K-07[\s\S]*211\.4\s*Units/i, "POS transfer receive did not add cups into K-07 kiosk stock");
  await page.screenshot({ path: path.join(verificationDir, "simulation-pos-transfer-stock-reconciled.png"), fullPage: true });

  await page.goto(`${baseUrl}/?bayaanSimulation=peak&bayaanSeed=20260516&bayaanSimMinutes=30&bayaanSimSpeed=1&bayaanSimStart=full&bayaanSimLoop=0`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expectVisible(page, "30/30 min / 10 kiosks / x1");
  await expectBodyMatch(page, /TOTAL SALES TODAY\s+engine only\s+IQD 1,805,500/, "30-minute final sales KPI did not match target simulation total", 8_000);
  await expectBodyMatch(page, /CASH EXPECTED\s+cash drawer total\s+IQD 759,500/, "30-minute final cash KPI did not reconcile to simulated cash payments", 8_000);
  await expectBodyMatch(page, /DIGITAL PAYMENTS\s+card, QR, wallet, manual\s+IQD 1,046,000/, "30-minute final digital KPI did not reconcile to simulated digital payments", 8_000);
  await expectBodyMatch(page, /ORDERS\s+avg 5,824\s+310/, "30-minute final order KPI did not hit 310 target orders", 8_000);
  await page.screenshot({ path: path.join(verificationDir, "simulation-final-30min.png"), fullPage: true });

  await browser.close();
  stopServer();
  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({
    ok: true,
    screenshots: [
      "verification/simulation-start-zero.png",
      "verification/simulation-progress-x2.png",
      "verification/simulation-progress-x5.png",
      "verification/simulation-progress-x10.png",
      "verification/simulation-loop-x10.png",
      "verification/simulation-final-full.png",
      "verification/simulation-kiosk-detail-late-orders.png",
      "verification/simulation-final-dark-mode.png",
      "verification/simulation-final-daily-close.png",
      "verification/simulation-shift-close-approved.png",
      "verification/simulation-final-reports.png",
      "verification/simulation-final-waste.png",
      "verification/simulation-pos-manual-sale-payment.png",
      "verification/simulation-pos-manual-sale-dashboard.png",
      "verification/simulation-pos-waste-entry.png",
      "verification/simulation-pos-waste-dashboard.png",
      "verification/simulation-pos-close-expected-cash.png",
      "verification/simulation-pos-close-dashboard.png",
      "verification/simulation-pos-close-approved-persistent.png",
      "verification/simulation-final-stock-transfer.png",
      "verification/simulation-final-purchases.png",
      "verification/simulation-purchase-received.png",
      "verification/simulation-purchase-stock-reconciled.png",
      "verification/simulation-purchase-source-persisted.png",
      "verification/simulation-purchase-manual-received-stock.png",
      "verification/simulation-recurring-purchase-po-created.png",
      "verification/simulation-supplier-source-persisted.png",
      "verification/simulation-stock-item-source-persisted.png",
      "verification/simulation-product-recipe-source-persisted.png",
      "verification/simulation-final-payroll.png",
      "verification/simulation-hr-expense-source-persisted.png",
      "verification/simulation-hr-expense-duplicate-retry.png",
      "verification/simulation-hr-draft-deduction-held.png",
      "verification/simulation-hr-held-payroll-review.png",
      "verification/simulation-hr-deduction-approved-source.png",
      "verification/simulation-hr-deduction-rejected-source.png",
      "verification/simulation-hr-adjustment-terminal-decisions.png",
      "verification/simulation-hr-adjustment-duplicate-retry.png",
      "verification/simulation-hr-attendance-source-persisted.png",
      "verification/simulation-hr-attendance-duplicate-retry.png",
      "verification/simulation-hr-payroll-source-persisted.png",
      "verification/simulation-hr-payroll-paid-source-persisted.png",
      "verification/simulation-hr-payroll-paid-adjustment-blocked.png",
      "verification/simulation-hr-payroll-report-reconciled.png",
      "verification/simulation-hr-traceability-report-pack.png",
      "verification/simulation-hr-operating-expense-report-reconciled.png",
      "verification/simulation-ai-source-traceability.png",
      "verification/simulation-transfer-action-dispatched.png",
      "verification/simulation-transfer-source-persisted.png",
      "verification/simulation-pos-transfer-received.png",
      "verification/simulation-pos-transfer-stock-reconciled.png",
      "verification/simulation-final-30min.png",
    ],
  }, null, 2));
}

async function expectVisible(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
}

async function switchToPos(page) {
  const bodyText = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
  if (/Good morning|Current order|Close shift|Payment complete/.test(bodyText)) return;
  await page.getByRole("button", { name: "POS", exact: true }).click({ timeout: 15_000 });
}

async function expectBodyMatch(page, pattern, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText();
    if (pattern.test(text)) return text;
    await page.waitForTimeout(250);
  }
  throw new Error(message);
}

async function expectTransferRow(page, rowId, pattern, message, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const row of rowCandidates(page, rowId)) {
      if ((await row.count()) > 0) {
        const text = await row.innerText();
        if (pattern.test(text)) return text;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(message);
}

function rowCandidates(page, rowId) {
  const text = page.getByText(rowId, { exact: false }).first();
  return [
    page.locator("tr", { hasText: rowId }).first(),
    text.locator("xpath=ancestor::div[.//button][1]"),
    text.locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
  ];
}

async function clickRowAction(page, rowId, name) {
  for (const row of rowCandidates(page, rowId)) {
    if ((await row.count()) === 0) continue;
    const button = row.getByRole("button", { name }).first();
    if ((await button.count()) > 0) {
      await button.click();
      return;
    }
  }
  throw new Error(`Could not find ${name} action for ${rowId}`);
}

async function expectMatchingRow(page, rowId, pattern, message, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = page.locator("tr", { hasText: rowId });
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const text = await rows.nth(i).innerText();
      if (pattern.test(text)) return text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(message);
}

async function downloadFromClick(page, locator) {
  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
  await locator.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert(downloadPath, "download did not create a local file path");
  return { download, path: downloadPath };
}

async function clickExactButton(page, name) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.getByRole("button", { name, exact: true }).click({ timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (!/detached from the DOM|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(120);
    }
  }
  throw lastError;
}

async function expectProgress(page, min, max, timeoutMs, options = {}) {
  const speed = options.speed ?? 10;
  const minutes = options.minutes ?? 60;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText();
    const match = text.match(/(\d+)\/(\d+) min \/ 10 kiosks \/ x(\d+)/);
    const minute = match ? Number(match[1]) : -1;
    const actualMinutes = match ? Number(match[2]) : -1;
    const actualSpeed = match ? Number(match[3]) : -1;
    if (actualMinutes === minutes && actualSpeed === speed && minute >= min && minute <= max) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`simulation progress did not enter ${min}-${max} for ${minutes} minutes at x${speed}`);
}

async function expectPulseBars(page, minPositiveBars, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let lastPositive = 0;
  while (Date.now() < deadline) {
    const bars = await page.$$eval(".hourly-pulse-actual", (nodes) =>
      nodes.map((node) => Number.parseFloat(node.style.height || "0")),
    );
    const positive = bars.filter((height) => height > 0).length;
    if (positive >= minPositiveBars) return;
    lastPositive = positive;
    await page.waitForTimeout(250);
  }
  assert(false, `expected at least ${minPositiveBars} positive simulation bars, got ${lastPositive}`);
}

async function ensureServer() {
  if (await reachable(baseUrl)) return;
  server = spawn("npm", ["run", "dev"], {
    cwd: appRoot,
    shell: true,
    stdio: "ignore",
    detached: false,
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await reachable(baseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Vite server did not start at ${baseUrl}`);
}

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function stopServer() {
  if (server && !server.killed) server.kill();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  stopServer();
  console.error(error);
  process.exit(1);
});
