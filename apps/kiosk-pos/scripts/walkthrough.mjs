#!/usr/bin/env node
// One-off walkthrough that clicks through every dashboard screen and logs:
// - which buttons exist
// - which clicks throw / freeze / no-op
// - any console errors
// Used to find broken UX after the demo→production wiring lands.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.KIOSK_POS_URL ?? "http://127.0.0.1:5174";
const verifyDir = fileURLToPath(new URL("../verification/walkthrough/", import.meta.url));
fs.mkdirSync(verifyDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

function logFinding(area, finding) {
  console.log(`[${area}] ${finding}`);
}

async function shot(page, name) {
  const file = path.join(verifyDir, name + ".png");
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function clickIfExists(page, selectorOrRole, name) {
  try {
    const locator = typeof selectorOrRole === "function" ? selectorOrRole() : page.locator(selectorOrRole);
    const count = await locator.count();
    if (count === 0) return { ok: false, reason: "no such element" };
    const first = locator.first();
    if (!(await first.isVisible())) return { ok: false, reason: "not visible" };
    await first.click({ timeout: 3000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message?.slice(0, 80) };
  }
}

async function navigateAdminScreen(page, navLabel) {
  const navItem = page.locator(".nav-item", { hasText: navLabel }).first();
  if (!(await navItem.isVisible())) return false;
  await navItem.click();
  await page.waitForTimeout(400);
  return true;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  // Start from a clean slate so prior runs don't leave 5 stray "Test Cappuccino" rows.
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.evaluate(() => { window.localStorage.clear(); });
  await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
  logFinding("LOAD", "Initial load OK (storage cleared)");
  await shot(page, "00-overview");

  // === Products & Recipes screen ===
  await navigateAdminScreen(page, "Products & Recipes");
  await page.waitForTimeout(600);
  await shot(page, "10-products-list");
  const newBtn = page.getByRole("button", { name: /New product/ });
  const newBtnCount = await newBtn.count();
  logFinding("PRODUCTS", `'New product' button count: ${newBtnCount}`);
  if (newBtnCount > 0) {
    const before = await page.locator("table.tbl tbody tr").count();
    await newBtn.first().click();
    await page.waitForTimeout(500);
    // Now the new product flow opens a modal dialog. Assert it.
    const dialog = page.locator('[role="dialog"]');
    logFinding("PRODUCTS", `Modal opened: ${await dialog.count() > 0}`);
    await shot(page, "11-products-create-modal");

    // Type a name (the autoFocus name input is the first input in the modal)
    const nameInput = dialog.locator('input').first();
    await nameInput.click();
    await nameInput.fill("");
    await nameInput.type("Test Cappuccino", { delay: 30 });
    await page.waitForTimeout(200);
    const nameValue = await nameInput.inputValue();
    logFinding("PRODUCTS", `Name input value after typing: "${nameValue}"`);
    await shot(page, "11b-products-modal-typed");

    // Click Add product
    const addBtn = dialog.getByRole("button", { name: /Add product/ });
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      await page.waitForTimeout(1200);
    } else {
      logFinding("PRODUCTS", "BUG: 'Add product' submit button not found in modal");
    }
    await shot(page, "12-products-after-save");
    const dialogStillOpen = await page.locator('[role="dialog"]').count();
    logFinding("PRODUCTS", `Modal closed after save: ${dialogStillOpen === 0}`);

    // The products table is the LAST table.tbl on the page (the first one is
    // "Recipe cost and margin control"). Pick by its preceding header.
    const productsTable = page.locator("table.tbl").last();
    const firstRowText = await productsTable.locator("tbody tr").first().textContent();
    logFinding("PRODUCTS", `Top-of-products-table contains "Test Cappuccino": ${(firstRowText || "").includes("Test Cappuccino")}`);
    const finalCount = await productsTable.locator("tbody tr").count();
    logFinding("PRODUCTS", `Rows in products table after save: ${finalCount}`);
    const allTexts = await productsTable.locator("tbody tr").allTextContents();
    const idx = allTexts.findIndex((t) => t.includes("Test Cappuccino"));
    logFinding("PRODUCTS", `Test Cappuccino position in table (0-indexed, -1 = absent): ${idx}`);

    // Verify the new product flows through to the POS sale screen.
    await page.getByRole("button", { name: "POS", exact: true }).click();
    await page.waitForTimeout(400);
    // Login
    await page.getByRole("button", { name: /Maya Ahmed/ }).click();
    for (const digit of ["1", "2", "3", "4"]) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await page.getByRole("button", { name: /Start shift/ }).click();
    await page.waitForTimeout(400);
    await shot(page, "13-pos-sale-after-new-product");
    const posMenuText = (await page.textContent("body")) || "";
    logFinding("PRODUCTS", `POS sale screen shows "Test Cappuccino": ${posMenuText.includes("Test Cappuccino")}`);
    // Back to admin
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.waitForTimeout(400);
  } else {
    logFinding("PRODUCTS", "BUG: 'New product' button missing entirely");
  }

  // === Kiosks screen ===
  await navigateAdminScreen(page, "Kiosks");
  await page.waitForTimeout(400);
  await shot(page, "20-kiosks-list");
  for (const label of ["Add kiosk", "New kiosk"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("KIOSKS", `Button '${label}' count: ${c}`);
  }

  // === Stock & Allocation ===
  await navigateAdminScreen(page, "Stock & Allocation");
  await page.waitForTimeout(400);
  await shot(page, "30-stock");
  const transferBtn = page.getByRole("button", { name: /Create transfer|New transfer|Transfer/ });
  logFinding("STOCK", `Transfer-create button count: ${await transferBtn.count()}`);

  // === Purchases & Suppliers ===
  await navigateAdminScreen(page, "Purchases & Suppliers");
  await page.waitForTimeout(400);
  await shot(page, "40-suppliers");
  for (const label of ["Add supplier", "New PO", "Create PO"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("SUPPLIERS", `Button '${label}' count: ${c}`);
  }

  // === Daily Close ===
  await navigateAdminScreen(page, "Daily Close");
  await page.waitForTimeout(400);
  await shot(page, "50-daily-close");
  const closeRows = await page.locator("table.tbl tbody tr").count();
  logFinding("CLOSE", `Close rows visible: ${closeRows}`);
  for (const label of ["Approve", "Reject", "Note", "Investigate"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("CLOSE", `Button '${label}' count: ${c}`);
  }

  // === Waste & Loss ===
  await navigateAdminScreen(page, "Waste & Loss");
  await page.waitForTimeout(400);
  await shot(page, "60-waste");

  // === Warehouses ===
  await navigateAdminScreen(page, "Warehouses");
  await page.waitForTimeout(400);
  await shot(page, "70-warehouses");
  for (const label of ["Add warehouse", "Create warehouse", "Add kiosk", "Create kiosk"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("WAREHOUSES", `Button '${label}' count: ${c}`);
  }

  // === HR/Staff ===
  await navigateAdminScreen(page, "Staff");
  await page.waitForTimeout(400);
  await shot(page, "80-staff");
  for (const label of ["Add staff", "New staff", "Add cashier"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("STAFF", `Button '${label}' count: ${c}`);
  }

  // === Reports ===
  await navigateAdminScreen(page, "Reports");
  await page.waitForTimeout(400);
  await shot(page, "90-reports");
  for (const label of ["Export", "PDF", "Download"]) {
    const c = await page.getByRole("button", { name: new RegExp(label, "i") }).count();
    logFinding("REPORTS", `Button '${label}' count: ${c}`);
  }

  // === AI Insights ===
  await navigateAdminScreen(page, "AI Insights");
  await page.waitForTimeout(400);
  await shot(page, "95-ai-insights");
  const askInput = page.locator('input[placeholder*="Ask" i], textarea[placeholder*="Ask" i]');
  logFinding("AI", `Free-form ask input count: ${await askInput.count()}`);

} catch (e) {
  console.log("WALKTHROUGH ERROR:", e.message);
} finally {
  if (consoleErrors.length) {
    console.log("\n=== Console errors ===");
    consoleErrors.forEach((e) => console.log("- " + e));
  }
  if (pageErrors.length) {
    console.log("\n=== Page errors ===");
    pageErrors.forEach((e) => console.log("- " + e));
  }
  await browser.close();
}
