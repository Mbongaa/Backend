import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const exact = read("src/exact-design/ExactKioskApp.jsx");
const gateway = read("src/services/sourceOfTruth.ts");
const backend = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/controllers/api.py");
const manifest = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/__manifest__.py");
const modelInit = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/__init__.py");
const recurringModel = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/models/bayaan_recurring_purchase.py");
const accessCsv = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/security/ir.model.access.csv");
const testInit = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/__init__.py");
const procurementTests = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_procurement_flow_api.py");
const securityTests = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_api_security_scope.py");
const hrTests = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_hr_payroll_api.py");
const realtimeTests = read("../../backend/bayaan_odoo_addons/bayaan_fnb_kiosk/tests/test_realtime_api.py");
const packageJson = read("package.json");
const makefile = read("../../Makefile");
const liveSmoke = read("scripts/live-odoo-smoke.mjs");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
};

const inventoryScreen = between(exact, "function InventoryScreen", "// =============== DAILY CLOSING");
const suppliersScreen = between(exact, "function SuppliersScreen", "// =============== STAFF");
const productsScreen = between(exact, "function ProductsScreen", "// =============== SUPPLIERS");
const posWaste = between(exact, "function POSWaste", "/* ===== customer-display.jsx");
const seedFeed = between(exact, "function seedFeed", "Admin screen");
const hrPayroll = between(exact, "function HRPayrollScreen", "// =============== REPORTS");

[
  "/bayaan/api/product_catalog",
  "/bayaan/api/recurring_purchase",
  "/bayaan/api/hr_snapshot",
  "/bayaan/api/hr_employee",
  "/bayaan/api/hr_attendance",
  "/bayaan/api/payroll_adjustment",
  "/bayaan/api/payroll_run",
  "/bayaan/api/payroll_run_action",
].forEach((route) => assert(backend.includes(route), `Backend route missing: ${route}`));

[
  "recurring_purchases",
  "payroll_adjustments",
  "payroll_runs",
  "payrollAdjustments",
  "payrollRuns",
  "available_in_pos",
].forEach((token) => assert(backend.includes(token), `Backend bootstrap/serialization token missing: ${token}`));

[
  '"account"',
  '"point_of_sale"',
  '"purchase"',
  '"stock"',
].forEach((dependency) => assert(manifest.includes(dependency), `Addon dependency missing: ${dependency}`));

assert(modelInit.includes("bayaan_recurring_purchase"), "Recurring purchase model must be imported by models/__init__.py");
assert(recurringModel.includes('_name = "bayaan.recurring.purchase"'), "Recurring purchase model missing");
assert(recurringModel.includes("action_create_purchase_order"), "Recurring purchase model must create real purchase.order records");
assert(recurringModel.includes('self.env["purchase.order"].sudo()'), "Recurring purchase must use Odoo purchase.order");
assert(accessCsv.includes("model_bayaan_recurring_purchase"), "Recurring purchase access rules missing");
assert(accessCsv.includes("model_bayaan_recurring_purchase_line"), "Recurring purchase line access rules missing");

[
  "upsertProductCatalog",
  "createRecurringPurchase",
  "recurringPurchaseAction",
  "getHrSnapshot",
  "createHrEmployee",
  "createHrShift",
  "createHrCoverageRule",
  "submitHrAttendance",
  "submitPayrollAdjustment",
  "payrollRunAction",
].forEach((method) => assert(gateway.includes(method), `Gateway method missing: ${method}`));

assert(gateway.includes('client.json("/bayaan/api/product_catalog"'), "Product catalog gateway must call /product_catalog");
assert(gateway.includes('client.json("/bayaan/api/recurring_purchase"'), "Recurring purchase gateway must call /recurring_purchase");
assert(gateway.includes('client.json("/bayaan/api/hr_snapshot"'), "HR snapshot gateway must call /hr_snapshot");

assert(productsScreen.includes("sourceOfTruth.upsertProductCatalog"), "Products screen must save product catalog to Odoo");
assert(productsScreen.includes("sourceOfTruth.submitRecipeVersion"), "Products screen must save recipe versions to Odoo");
assert(productsScreen.includes("odooIngredientOptions"), "Products screen must use live ingredient options");
assert(!/function ProductCreateDialog[\s\S]*?MOCK\.inventory\.map/.test(productsScreen), "Product create dialog must not hard-code MOCK.inventory for recipe ingredients");
assert(!/function ProductEditor[\s\S]*?MOCK\.inventory\.map/.test(productsScreen), "Product editor must not hard-code MOCK.inventory for recipe ingredients");

assert(suppliersScreen.includes("createRecurringPurchase"), "Suppliers screen must create recurring purchases");
assert(suppliersScreen.includes("recurringPurchaseAction"), "Suppliers screen must run recurring purchases into POs");
assert(suppliersScreen.includes("Recurring purchases"), "Suppliers screen must render recurring purchase plans");
assert(!inventoryScreen.includes("recurringDraft"), "Inventory screen must not own recurring purchase UI state");

assert(exact.includes("function POSClose"), "POS close screen missing");
assert(exact.includes('setScreen("close")'), "POS end-shift must open the close screen");
assert(exact.includes("submitShiftClose"), "POS close must submit shift close to the gateway");
assert(posWaste.includes("liveWasteItems"), "POS waste must load live kiosk stock options");
assert(posWaste.includes("const items = liveWasteItems || ["), "POS waste must prefer live stock items before demo fallback");
assert(!seedFeed.includes("liveWasteItems"), "Activity seed feed must not contain POS waste hooks");

assert(hrPayroll.includes("sourceOfTruth.getHrSnapshot"), "HR payroll must read the live HR/payroll snapshot");
assert(hrPayroll.includes("sourceOfTruth.createHrEmployee"), "HR payroll must create live staff records");
assert(hrPayroll.includes("sourceOfTruth.createHrShift"), "HR payroll must create live shifts");
assert(hrPayroll.includes("sourceOfTruth.createHrCoverageRule"), "HR payroll must create live coverage rules");
assert(hrPayroll.includes("sourceOfTruth.submitPayrollAdjustment"), "HR payroll must submit live payroll adjustments");
assert(hrPayroll.includes("sourceOfTruth.payrollRunAction"), "HR payroll must create/approve live payroll runs");
assert(exact.includes("staff: <HRPayrollScreen lang={lang} bootstrap={sync.bootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo}/>"), "Admin staff screen must receive live gateway props");

[
  "test_procurement_flow_api",
  "test_api_security_scope",
  "test_hr_payroll_api",
  "test_realtime_api",
].forEach((testModule) => assert(testInit.includes(testModule), `Odoo test module not loaded: ${testModule}`));

[
  "test_purchase_order_receive_moves_stock_into_warehouse",
  "test_create_supplier_persists_partner_setup_fields",
  "test_recurring_purchase_run_creates_confirmed_purchase_order",
  "test_purchase_order_partial_receive_records_shortage",
  "test_stock_transfer_receive_moves_stock_from_warehouse_to_kiosk",
  "test_multiline_transfer_partial_receive_records_shortage",
  "test_full_stock_loop_purchase_transfer_sale_waste_and_close",
  "test_shift_close_approval_locks_record",
].forEach((testName) => assert(procurementTests.includes(testName), `Procurement/stock Odoo test missing: ${testName}`));

[
  "test_cashier_can_receive_dispatched_transfer_for_assigned_kiosk",
  "test_cashier_cannot_receive_transfer_for_unassigned_kiosk",
  "test_manager_cannot_receive_on_behalf_of_kiosk",
  "test_superadmin_can_receive_transfer_for_pos_testing",
  "test_superadmin_auth_status_can_open_pos_for_any_kiosk",
].forEach((testName) => assert(securityTests.includes(testName), `Role/scope Odoo test missing: ${testName}`));

[
  "test_payroll_run_uses_attendance_and_approved_adjustments",
  "test_kiosk_work_week_flags_missing_coverage_until_staffed",
].forEach((testName) => assert(hrTests.includes(testName), `HR/payroll Odoo test missing: ${testName}`));

[
  "test_realtime_config_returns_signed_user_channel",
  "test_kiosk_sale_publishes_realtime_bus_event",
].forEach((testName) => assert(realtimeTests.includes(testName), `Realtime Odoo test missing: ${testName}`));

assert(packageJson.includes('"gate:wiring"'), "package.json must expose gate:wiring");
assert(/"verify"\s*:\s*"[^"]*gate:wiring/.test(packageJson), "npm run verify must include gate:wiring");
assert(makefile.includes("verify: install"), "Root Makefile must expose a full verify target");
assert(makefile.includes("$(MAKE) odoo-test"), "Root make verify must include the Odoo addon test gate");
assert(liveSmoke.includes('waitUntil: "domcontentloaded"'), "Live Odoo smoke must not wait for networkidle while realtime sockets are open");

if (failures.length) {
  console.error("Bayaan wiring gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Bayaan wiring gate passed.");
