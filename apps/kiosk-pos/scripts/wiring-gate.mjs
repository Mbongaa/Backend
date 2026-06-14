import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const readIfExists = (path) => {
  const fullPath = join(root, path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
};

const exact = read("src/exact-design/ExactKioskApp.jsx");
const gateway = read("src/services/sourceOfTruth.ts");
const bayaanProvider = read("src/bayaan/BayaanProvider.tsx");
const studioInventory = read("src/components/studio-dashboard/StudioInventoryWorkspace.tsx");
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
const studioReferenceDashboard = [
  "../bayaan-dashboard/README.md",
  "../bayaan-dashboard/src/app/(main)/dashboard/layout.tsx",
  "../bayaan-dashboard/src/app/(main)/dashboard/_components/sidebar/sidebar-support-card.tsx",
  "../bayaan-dashboard/src/data/bayaan-demo.ts",
  "../bayaan-dashboard/src/components/bayaan/live-demo-panel.tsx",
  "../bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx",
  "../bayaan-dashboard/src/components/bayaan/section-dashboard.tsx",
].map(readIfExists).join("\n");

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
const overviewScreen = between(exact, "function OverviewScreen", "// ---------- Seed initial activity feed");
const wasteScreen = between(exact, "function WasteScreen", "function ItemsCatalogScreen");
const itemsCatalogScreen = between(exact, "function ItemsCatalogScreen", "// =============== PRODUCTS & RECIPES");
const suppliersScreen = between(exact, "function SuppliersScreen", "// =============== STAFF");
const productsScreen = between(exact, "function ProductsScreen", "// =============== SUPPLIERS");
const kiosksScreen = between(exact, "function KiosksScreen", "function KiosksScreenLegacy");
const kioskDetailScreen = between(exact, "function KioskDetailScreen", "// =============== WAREHOUSES");
const salesMonitorScreen = between(exact, "function SalesMonitorScreen", "// =============== INVENTORY");
const reportsScreen = between(exact, "function ReportsScreen", "/* ===== admin-shell.jsx");
const posLogin = between(exact, "function POSLogin", "/* ===== pos-screens.jsx");
const posSale = between(exact, "function POSSale", "function POSTransfers");
const posClose = between(exact, "function POSClose", "// =============== PAYMENT");
const posPayment = between(exact, "function POSPayment", "function POSWaste");
const posWaste = between(exact, "function POSWaste", "/* ===== customer-display.jsx");
const posPanel = between(exact, "function POSPanel", "// =============== LOGIN");
const seedFeed = between(exact, "function seedFeed", "Admin screen");
const hrPayroll = between(exact, "function HRPayrollScreen", "// =============== REPORTS");
const auditRail = between(exact, "function AuditLogRail", "function AdminPanel");
const adminPanel = between(exact, "function AdminPanel", "function AdminApp");

[
  "/bayaan/api/product_catalog",
  "/bayaan/api/recurring_purchase",
  "/bayaan/api/hr_snapshot",
  "/bayaan/api/hr_employee",
  "/bayaan/api/hr_attendance",
  "/bayaan/api/payroll_adjustment",
  "/bayaan/api/payroll_run",
  "/bayaan/api/payroll_run_action",
  "/bayaan/api/create_kiosk",
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
  "createKiosk",
].forEach((method) => assert(gateway.includes(method), `Gateway method missing: ${method}`));

assert(gateway.includes('client.json("/bayaan/api/product_catalog"'), "Product catalog gateway must call /product_catalog");
assert(gateway.includes('client.json("/bayaan/api/recurring_purchase"'), "Recurring purchase gateway must call /recurring_purchase");
assert(gateway.includes('client.json("/bayaan/api/hr_snapshot"'), "HR snapshot gateway must call /hr_snapshot");

assert(productsScreen.includes("sourceOfTruth.upsertProductCatalog"), "Products screen must save product catalog to Odoo");
assert(productsScreen.includes("sourceOfTruth.submitRecipeVersion"), "Products screen must save recipe versions to Odoo");
assert(productsScreen.includes("odooIngredientOptions"), "Products screen must use live ingredient options");
assert(productsScreen.includes("Source-backed catalog"), "Products screen must label source-backed catalog mode distinctly from demo persistence");
assert(productsScreen.includes("/bayaan/api/product_catalog"), "Products screen must name the real product catalog route");
assert(!productsScreen.includes("/bayaan/api/products"), "Products screen must not reference the stale /bayaan/api/products route");
assert(productsScreen.includes("useOverride={!sourceDriven}"), "Products screen must hide browser image overrides in source-driven mode");
assert(productsScreen.includes("imageBase64: dataUrl"), "Product editor must persist source-mode image uploads through source payloads");
assert(productsScreen.includes("Upload source image"), "Product editor must label source-driven uploads as source image uploads");
assert(productsScreen.includes("Connect the source engine before creating live catalog rows"), "Products screen must not write local catalog rows in live-only mode without a backend");
assert(!/function ProductCreateDialog[\s\S]*?MOCK\.inventory\.map/.test(productsScreen), "Product create dialog must not hard-code MOCK.inventory for recipe ingredients");
assert(!/function ProductEditor[\s\S]*?MOCK\.inventory\.map/.test(productsScreen), "Product editor must not hard-code MOCK.inventory for recipe ingredients");

assert(kiosksScreen.includes("const sourceDriven = isSourceDrivenPayload(bootstrap)"), "Kiosk creation screen must use shared source-driven demo suppression");
assert(kiosksScreen.includes("useState(() => makeKioskDraft(sourceDriven))"), "Kiosk creation form must initialize from source-aware draft defaults");
assert(kiosksScreen.includes('sourceDriven ? "" : "K-11"'), "Kiosk creation form must not seed the demo kiosk code in source-driven mode");
assert(kiosksScreen.includes("Connect the source engine before creating source kiosks"), "Kiosk creation must not silently no-op when the source engine is missing");
assert(kiosksScreen.includes("Source kiosk code"), "Kiosk creation source-mode form must use source-neutral placeholders");
assert(kiosksScreen.includes("const revenueDelta = sourceDriven"), "Kiosks dashboard revenue KPI must be source/demo aware");
assert(kiosksScreen.includes('delta={revenueDelta} deltaDir={sourceDriven ? "flat" : "up"}'), "Kiosks dashboard must not show the fixed demo revenue lift in source mode");
assert(!kiosksScreen.includes('value={fmtMoney(live.reduce((s, k) => s + k.revenue, 0))} delta="8.4%"'), "Kiosks dashboard source mode must not expose the fixed demo revenue lift");
assert(gateway.includes('client.json("/bayaan/api/create_kiosk"'), "Kiosk creation gateway must call /create_kiosk");

assert(suppliersScreen.includes("createRecurringPurchase"), "Suppliers screen must create recurring purchases");
assert(suppliersScreen.includes("recurringPurchaseAction"), "Suppliers screen must run recurring purchases into POs");
assert(suppliersScreen.includes("Recurring purchases"), "Suppliers screen must render recurring purchase plans");
assert(!inventoryScreen.includes("recurringDraft"), "Inventory screen must not own recurring purchase UI state");
assert(studioInventory.includes("getPaginationRowModel"), "Stock allocation ledger must use Studio table pagination");
assert(studioInventory.includes("PaginationPrevious"), "Stock allocation ledger must render Studio pagination controls");
assert(studioInventory.includes("Rows per page"), "Stock allocation ledger must expose page-size control");
assert(studioInventory.includes("ChartContainer"), "Inventory health chart must use the Studio chart container");
assert(studioInventory.includes("PieChart"), "Inventory health chart must render the Studio/Recharts pie");
assert(!studioInventory.includes("inventory-health-donut"), "Inventory health chart must not use the fallback CSS donut");
assert(studioInventory.includes("border-border/15"), "Stock allocation table row dividers must stay subtle");
assert(studioInventory.includes("Kiosk stock needs"), "Studio inventory screen must use source-neutral kiosk stock-needs wording");
assert(!studioInventory.includes("Kiosk live stock needs"), "Studio inventory screen must not label stock-needs rows as live");
assert(exact.includes('normalized === "dispatched"'), "Stock transfer actions must expose a dispatched receive step");
assert(!exact.includes("return rows.slice(0, 12).map((transfer) => ({"), "Odoo transfer rows must not cap outstanding POS/admin transfers at 12");

assert(exact.includes("function POSClose"), "POS close screen missing");
assert(exact.includes('setScreen("close")'), "POS end-shift must open the close screen");
assert(exact.includes("submitShiftClose"), "POS close must submit shift close to the gateway");
assert(posWaste.includes("liveWasteItems"), "POS waste must load live kiosk stock options");
assert(posWaste.includes("const items = liveWasteItems ?? ["), "POS waste must use demo fallback only when not in source mode");
assert(posWaste.includes("No source waste items loaded"), "POS waste source mode must show an honest empty state without demo waste items");
assert(posWaste.includes("Connect the source engine before recording source waste"), "POS waste source mode must not report browser-only source waste success");
assert(posSale.includes('bayaan.mode === "live"\n      ? bayaan.hasBackend\n        ? odooPosMenu(bootstrap)\n        : []\n      : catalog.menuByCategory()'), "POS sale must not show browser catalog products in live-only mode without backend");
assert(posSale.includes("No source POS products loaded"), "POS sale source mode must show an honest empty state without demo menu items");
assert(posSale.includes("Source shift"), "POS sale header must not keep the fixed demo cashier/shift copy in source mode");
assert(posLogin.includes('const sourceEngineMissing = bayaan.mode === "live" && !bayaan.hasBackend'), "POS login must detect live-only mode without backend");
assert(posLogin.includes("No source POS shift available"), "POS login must not show demo staff as source staff when backend is missing");
assert(posLogin.includes("/bayaan/api/auth_status") && posLogin.includes("/bayaan/api/open_session"), "POS login source-empty state must name the source auth/session routes");
assert(posClose.includes("Connect the source engine before submitting source shift close"), "POS close must not report browser-only source close success without backend");
assert(exact.includes("const sourcePosPaymentOptions = (bootstrap, kioskId, ar = false)"), "POS payment must derive source payment methods from bootstrap POS configs");
assert(posPayment.includes("const tenderOptions = bayaan.mode === \"live\" ? sourceTenderOptions : demoTenderOptions"), "POS payment must use configured source payment methods in live mode and demo providers only in demo mode");
assert(posPayment.includes("No source payment methods loaded"), "POS payment source mode must show an honest empty state when no configured methods are loaded");
assert(posPayment.includes("/bayaan/api/chain_bootstrap"), "POS payment source-empty state must name the bootstrap source for configured payment methods");
assert(posPayment.includes("pickTender(cashTender.id)"), "POS payment quick cash must use the configured source cash method id");
assert(!posPayment.includes("const tenderOptions = ["), "POS payment must not define the old unguarded fixed provider list");
assert(!posPayment.includes("tenderOptions.slice(2)"), "POS payment must not append hard-coded wallet providers outside demo mode");
assert(bayaanProvider.includes('const sourceOnlyWithoutBackend = !hasBackend'), "Bayaan provider must treat a missing backend as source-only (live-only product has no demo mode)");
assert(bayaanProvider.includes('export type BayaanMode = "live"'), "Bayaan provider must collapse the mode type to live-only (no demo mode)");
assert(!bayaanProvider.includes("DEMO_AUTH"), "Bayaan provider must not fabricate a demo auth user");
assert(bayaanProvider.includes("Connect the source engine before recording source sales"), "Bayaan provider must reject source sale submissions without a backend");
assert(bayaanProvider.includes("Connect the source engine before recording source waste"), "Bayaan provider must reject source waste submissions without a backend");
assert(bayaanProvider.includes("Connect the source engine before creating source stock transfers"), "Bayaan provider must reject source stock-transfer submissions without a backend");
assert(bayaanProvider.includes("[gateway, isLive, queue, sourceOnlyWithoutBackend]"), "Bayaan provider stock-transfer callback must re-evaluate the source-only backend guard");
assert(!seedFeed.includes("liveWasteItems"), "Activity seed feed must not contain POS waste hooks");

assert(hrPayroll.includes("sourceOfTruth.getHrSnapshot"), "HR payroll must read the live HR/payroll snapshot");
assert(hrPayroll.includes("sourceOfTruth.createHrEmployee"), "HR payroll must create live staff records");
assert(hrPayroll.includes("sourceOfTruth.createHrShift"), "HR payroll must create live shifts");
assert(hrPayroll.includes("sourceOfTruth.createHrCoverageRule"), "HR payroll must create live coverage rules");
assert(hrPayroll.includes("sourceOfTruth.submitPayrollAdjustment"), "HR payroll must submit live payroll adjustments");
assert(hrPayroll.includes("sourceOfTruth.payrollRunAction"), "HR payroll must create/approve live payroll runs");
assert(hrPayroll.includes("useState(() => sourceDriven ? [] : makeDemoWeekShifts"), "HR payroll must not seed demo shifts in source-driven mode");
assert(hrPayroll.includes("if (sourceDriven) setLocalShifts([])"), "HR payroll must clear demo shifts when entering source-driven mode");
assert(hrPayroll.includes("const scheduleRows = sourceDriven"), "HR payroll schedule rows must use source-driven suppression");
assert(hrPayroll.includes("? liveShiftRows\n    : localShifts"), "HR payroll source schedules must not merge browser demo shifts");
assert(hrPayroll.includes("Connect the source engine before saving source shifts"), "HR payroll source shift saves must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes("Connect the source engine before recording source expenses"), "HR payroll source expenses must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes("Connect the source engine before adding source staff"), "HR payroll source staff creation must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes("Connect the source engine before saving coverage rules"), "HR payroll source coverage rules must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes('category: sourceDriven ? "" : "Operations"'), "HR payroll source expenses must not prefill the demo Operations category");
assert(hrPayroll.includes('type: sourceDriven ? "" : "deduction"'), "HR payroll source adjustments must not prefill the demo deduction type");
assert(hrPayroll.includes("Expense needs name, source category, and amount"), "HR payroll source expenses must require a deliberate category before posting");
assert(hrPayroll.includes("Adjustment needs staff, type, and amount"), "HR payroll source adjustments must require a deliberate type before posting");
assert(hrPayroll.includes("Select source expense category"), "HR payroll source expense form must expose a neutral category placeholder");
assert(hrPayroll.includes("Select source adjustment type"), "HR payroll source adjustment form must expose a neutral type placeholder");
assert(hrPayroll.includes('role: sourceDriven ? "" : "Cashier"'), "HR payroll source shifts must not prefill the demo cashier role");
assert(hrPayroll.includes('role: sourceDriven ? "" : "cashier"'), "HR payroll source coverage rules must not prefill the demo cashier role");
assert(hrPayroll.includes('start: sourceDriven ? "" : "08:00"'), "HR payroll source schedules must not prefill demo start times");
assert(hrPayroll.includes('end: sourceDriven ? "" : "16:00"'), "HR payroll source schedules must not prefill demo end times");
assert(hrPayroll.includes('requiredCount: sourceDriven ? "" : "2"'), "HR payroll source coverage rules must not prefill demo headcount");
assert(hrPayroll.includes("setShiftDraft(makeShiftDraft(defaultEmployee, defaultKiosk, date))"), "HR payroll new source shifts must initialize through source-aware shift drafts");
assert(hrPayroll.includes("!shiftDraft.role || !shiftDraft.start || !shiftDraft.end"), "HR payroll source shifts must require deliberate role and times");
assert(hrPayroll.includes("!coverageDraft.role || !coverageDraft.start || !coverageDraft.end"), "HR payroll source coverage rules must require deliberate role and times");
assert(hrPayroll.includes("Select source role"), "HR payroll source schedule forms must expose a neutral role placeholder");
assert(hrPayroll.includes("Connect the source engine before adding source payroll adjustments"), "HR payroll source adjustments must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes("Connect the source engine before reviewing source adjustments"), "HR payroll source adjustment review must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes("Connect the source engine before recording source attendance"), "HR payroll source attendance must not fall back to browser demo rows without a source engine");
assert(hrPayroll.includes('checkIn: sourceDriven ? "" : "17:00"'), "HR payroll source attendance must not prefill demo check-in time");
assert(hrPayroll.includes('checkOut: sourceDriven ? "" : "21:00"'), "HR payroll source attendance must not prefill demo check-out time");
assert(hrPayroll.includes('checkIn: draft.checkIn === "17:00" ? "" : draft.checkIn'), "HR payroll must clear demo check-in time when entering source mode");
assert(hrPayroll.includes('salary: sourceDriven ? "" : "1500000"'), "HR payroll source staff creation must not prefill demo salary");
assert(hrPayroll.includes('hours: sourceDriven ? "" : "168"'), "HR payroll source staff creation must not prefill demo monthly hours");
assert(hrPayroll.includes('placeholder={sourceDriven ? "Source monthly salary" : "1500000"}'), "HR payroll source staff salary field must use source-neutral placeholder");
assert(hrPayroll.includes("Connect the source engine before reviewing source payroll"), "HR payroll source payroll review must not fall back to browser demo state without a source engine");
assert(hrPayroll.includes("Connect the source engine before approving source payroll"), "HR payroll source payroll approval must not fall back to browser demo state without a source engine");
assert(hrPayroll.includes("Connect the source engine before marking source payroll paid"), "HR payroll source payroll payment must not fall back to browser demo state without a source engine");
assert(!hrPayroll.includes("const scheduleRows = liveOnly"), "HR payroll must not treat simulation/source schedules as demo schedules");
assert(!hrPayroll.includes("...localShifts.filter((shift) => !liveShiftIds.has"), "HR payroll source schedules must not append local demo shifts");
assert(exact.includes("staff: <HRPayrollScreen lang={lang} bootstrap={scopedBootstrap} sourceOfTruth={sourceOfTruth} refreshOdoo={refreshOdoo} caps={caps}/>"), "Admin staff screen must receive the guarded scoped bootstrap and live gateway props");
assert(exact.includes("noSourceStaffLoaded"), "Staff empty states must use source-neutral staff wording");
assert(exact.includes("noSourceKioskStock"), "POS stock empty state must use source-neutral kiosk stock wording");
assert(exact.includes("noSourceKiosksLoaded"), "Kiosk select empty states must use source-neutral kiosk wording");
assert(exact.includes("noSourceWarehousesLoaded"), "Warehouse select empty states must use source-neutral warehouse wording");
assert(exact.includes("No source suppliers loaded"), "Supplier empty states must use source-neutral supplier wording");
assert(auditRail.includes("setEvents([])") && auditRail.includes('setStatus("source-missing")'), "Audit rail must show an honest empty source-missing state, never demo events");
assert(!auditRail.includes("demoAuditEvents"), "Audit rail must not seed demo events in the live-only product");
assert(!auditRail.includes("allowDemoFallback"), "Audit rail must not carry a demo-fallback flag in the live-only product");
assert(auditRail.includes("No source audit events loaded"), "Audit rail source-empty state must not display demo audit events");
assert(adminPanel.includes("<AuditLogRail lang={lang} sourceOfTruth={sourceOfTruth}/>"), "Admin audit rail must render without any demo-fallback flag in the live-only product");
if (studioReferenceDashboard.trim()) {
  assert(studioReferenceDashboard.includes("Studio/reference dashboard only"), "Studio dashboard README must disclose that it is demo/reference only");
  assert(studioReferenceDashboard.includes("Studio reference only"), "Studio dashboard app shell must show a demo/reference warning");
  assert(studioReferenceDashboard.includes("DEMO STREAM"), "Studio dashboard stream widgets must label animated rows as demo");
  assert(studioReferenceDashboard.includes("Demo POS orders"), "Studio dashboard POS table must not label demo POS rows as live");
  assert(!studioReferenceDashboard.includes("Live POS orders"), "Studio dashboard must not label demo POS rows as live");
  assert(!studioReferenceDashboard.includes("STREAM ACTIVE"), "Studio dashboard must not expose the source-backed stream-active label");
  assert(!studioReferenceDashboard.includes("All traceable to Odoo/Bayaan rows"), "Studio dashboard must not claim demo AI rows are traceable to Odoo/Bayaan");
  assert(!studioReferenceDashboard.includes("Every card is backed by the single backend database"), "Studio dashboard must not claim demo topology cards are backend-backed");
  assert(!studioReferenceDashboard.includes("same UI writes to Bayaan product and recipe APIs"), "Studio dashboard must not imply reference UI writes source APIs");
}
assert(!exact.includes("No live staff loaded"), "Staff empty states must not imply live evidence");
assert(!exact.includes("No live kiosk stock loaded"), "POS stock empty state must not imply live evidence");
assert(!exact.includes("No live kiosks loaded"), "Kiosk select empty states must not imply live evidence");
assert(!exact.includes("No live warehouses loaded"), "Warehouse select empty states must not imply live evidence");
assert(!exact.includes("No live suppliers loaded"), "Supplier empty states must not imply live evidence");
assert(!exact.includes("No live inventory items loaded"), "Inventory item empty states must not imply live evidence");
assert(!exact.includes('stock_location_id: "LOC-MAIN"'), "Live-only build must not ship the demo central-warehouse stock location");
assert(exact.includes('location: "Central warehouse", locationKey: "central-warehouse"'), "Demo inventory fallback must use the same central warehouse label/key as source stock rows");
assert(inventoryScreen.includes('centralWarehouse?.name || centralWarehouse?.code || (sourceDriven ? "" : DEFAULT_WAREHOUSE_NAME)'), "Inventory source-driven mode must not use the demo warehouse fallback");
assert(inventoryScreen.includes("...(sourceDriven ? [] : MOCK.suppliers.map"), "Inventory source-driven mode must not include demo supplier options");
assert(inventoryScreen.includes('supplier: sourceDriven ? "" : MOCK.suppliers[0]?.name'), "Inventory source-driven PO drafts must not default to a demo supplier");
assert(inventoryScreen.includes("purchaseLineFromInventory(item, !sourceDriven)"), "Inventory PO lines must not use demo purchase estimates in source-driven mode");
assert(inventoryScreen.includes("Connect the source engine before creating source purchase orders"), "Inventory source PO creates must not fall back to browser demo purchase rows without a source engine");
assert(inventoryScreen.includes("Connect the source engine before creating source stock transfers"), "Inventory source stock-transfer creates must not fall back to browser draft rows without a source engine");
assert(inventoryScreen.includes("Connect the source engine before updating source stock transfers"), "Inventory source stock-transfer state changes must not fall back to browser status rows without a source engine");
assert(itemsCatalogScreen.includes("const sourceDriven = isSourceDrivenPayload(bootstrap)"), "Items Catalog must use shared source-driven detection");
assert(itemsCatalogScreen.includes("[...(sourceDriven ? [] : localItems), ...engineRows]"), "Items Catalog source-driven mode must not show browser-local stock items");
assert(itemsCatalogScreen.includes("Connect the source engine before creating source stock items"), "Items Catalog source stock-item creation must not fall back to browser rows");
assert(itemsCatalogScreen.includes("purchaseRateForInventory(item, !sourceDriven)"), "Items Catalog source-driven mode must not use demo purchase-rate estimates");
assert(!itemsCatalogScreen.includes("!liveOnly"), "Items Catalog must not use live-only checks where source-driven suppression is required");
assert(suppliersScreen.includes('return central.length ? central : (sourceDriven ? [] : [DEFAULT_WAREHOUSE_NAME, "Baghdad Area Warehouse"])'), "Suppliers source-driven mode must not use demo warehouse options");
assert(suppliersScreen.includes('supplier: sourceDriven ? "" : MOCK.suppliers[0]?.name'), "Suppliers source-driven PO drafts must not default to a demo supplier");
assert(suppliersScreen.includes("const priceChangeRows = sourceDriven ? [] : ["), "Suppliers source-driven mode must not show demo supplier price changes");
assert(suppliersScreen.includes("sourceDriven ? null : MOCK.inventory[0]"), "Suppliers source-driven mode must not use demo inventory for PO lines");
assert(suppliersScreen.includes("No source inventory items loaded for PO lines"), "Suppliers source-driven PO line empty state must be source-neutral");
assert(suppliersScreen.includes("No source inventory items loaded for recurring purchases"), "Suppliers recurring-purchase empty state must be source-neutral");
assert(suppliersScreen.includes("Connect the source engine before creating source purchase orders"), "Suppliers source PO creates must not fall back to browser demo purchase rows without a source engine");
assert(suppliersScreen.includes("Connect the source engine before saving source recurring purchases"), "Suppliers source recurring purchases must not fall back to browser demo rows without a source engine");
assert(suppliersScreen.includes('name: sourceDriven ? "" : "Weekly fresh milk"'), "Suppliers source recurring purchases must not prefill the demo plan name");
assert(suppliersScreen.includes('frequency: sourceDriven ? "" : "weekly"'), "Suppliers source recurring purchases must not prefill the demo cadence");
assert(suppliersScreen.includes('weekday: sourceDriven ? "" : "0"'), "Suppliers source recurring purchases must not prefill the demo weekday");
assert(suppliersScreen.includes('nextDate: sourceDriven ? "" : tomorrowIsoDate()'), "Suppliers source recurring purchases must not prefill a demo next date");
assert(suppliersScreen.includes("Recurring purchase needs a name, supplier, schedule, item lines, quantities, and rates"), "Suppliers source recurring purchases must require a deliberate schedule before posting");
assert(suppliersScreen.includes("Select source recurring cadence"), "Suppliers source recurring purchase form must expose a neutral cadence placeholder");
assert(suppliersScreen.includes("Select source recurring weekday"), "Suppliers source recurring purchase form must expose a neutral weekday placeholder");
assert(suppliersScreen.includes("Connect the source engine before updating source purchase orders"), "Suppliers source PO status changes must not fall back to browser demo status rows without a source engine");
assert(suppliersScreen.includes("Connect the source engine before creating source suppliers"), "Suppliers source creation must not fall back to browser rows without a source engine");

assert(exact.includes("const isSourceDrivenPayload"), "Dashboard must centralize live/simulation demo-fallback suppression");
assert(exact.includes("return allowDemoFallback ? demoFiscalSalesRows() : []"), "Fiscal sales helper must return no rows instead of demo sales in live/simulation mode");
assert(exact.includes("const odooPosSessionRows = (bootstrap, kiosk"), "Kiosk detail must have a source-backed POS session row adapter");
assert(kioskDetailScreen.includes("const sourceDriven = isSourceDrivenPayload(bootstrap)"), "Kiosk detail must use shared source-driven demo suppression");
assert(kioskDetailScreen.includes("const sessionRows = odooPosSessionRows(bootstrap, selected)"), "Kiosk detail POS sessions must read source rows before demo rows");
assert(kioskDetailScreen.includes("const demoSessionRows = !sourceDriven ? ["), "Kiosk detail demo POS sessions must be disabled in source-driven mode");
assert(kioskDetailScreen.includes("sourceDriven ? [] : MOCK.posOrders.slice"), "Kiosk detail sales tab must not fall back to demo orders in source-driven mode");
assert(kioskDetailScreen.includes("sourceDriven ? [] : demoMovementRows"), "Kiosk detail movements tab must not fall back to demo movements in source-driven mode");
assert(kioskDetailScreen.includes("useState(() => sourceDriven ? [] : makeDemoKioskWeekShifts"), "Kiosk detail must not seed demo shifts in source-driven mode");
assert(kioskDetailScreen.includes("setLocalShifts(sourceDriven ? [] : makeDemoKioskWeekShifts"), "Kiosk detail must clear demo shifts when entering source-driven mode");
assert(kioskDetailScreen.includes("Connect the source engine before saving source kiosk shifts"), "Kiosk detail source shift saves must not fall back to browser demo rows without a source engine");
assert(kioskDetailScreen.includes("const assignedTeamRows = assignedTeam.length ? assignedTeam : sourceDriven ? [] : rosterStaff.slice(0, 4)"), "Kiosk detail must not fill an empty source kiosk team with unrelated staff");
assert(kioskDetailScreen.includes("No source staff assigned to this kiosk yet."), "Kiosk detail staff tab must show an honest source-empty staff state");
assert(kioskDetailScreen.includes("const kioskWasteRows = sourceDriven"), "Kiosk detail waste tab must derive source waste KPIs from source waste rows");
assert(kioskDetailScreen.includes("const sourceStockVarianceRows = sourceDriven"), "Kiosk detail waste tab must derive source variance KPIs from reconciliation rows");
assert(kioskDetailScreen.includes("No source waste rows"), "Kiosk detail waste tab must show an honest source-waste empty state");
assert(kioskDetailScreen.includes("value={sourceDriven ? fmtMoney(sourceWasteCost) : fmtMoney(Math.round(selected.revenue * selected.waste / 100))}"), "Kiosk detail source waste KPI must use source waste rows before demo fallback math");
assert(kioskDetailScreen.includes('value={sourceDriven ? (sourceSensitiveStockRow?.item || "No source item") : selected.criticalStock}'), "Kiosk detail source-sensitive item KPI must not use the demo critical-stock fallback");
assert(kioskDetailScreen.includes("const expectedCash = sourceDriven"), "Kiosk detail expected cash must be source-aware");
assert(kioskDetailScreen.includes("Number(closing?.expectedCash || 0)"), "Kiosk detail source expected cash must come from source close rows");
assert(kioskDetailScreen.includes('delta={sourceDriven ? "source" : "demo"}'), "Kiosk detail header KPI must label source/demo data honestly");
assert(!kioskDetailScreen.includes('delta="live"'), "Kiosk detail must not label demo/source KPI rows as live");
assert(!kioskDetailScreen.includes("value={fmtMoney(Math.round(selected.revenue * 0.65))}"), "Kiosk detail source expected-cash KPI must not render fixed percentage math directly");
assert(kioskDetailScreen.includes("const overviewNoteTitle = sourceDriven"), "Kiosk detail overview notes must be source/demo-aware");
assert(kioskDetailScreen.includes("Source notes for this kiosk"), "Kiosk detail source overview must not label deterministic source notes as AI");
assert(kioskDetailScreen.includes("Demo AI notes for this kiosk"), "Kiosk detail demo overview must label AI notes as demo");
assert(kioskDetailScreen.includes("This note is derived from source rows only"), "Kiosk detail source overview must explain source-derived notes honestly");
assert(kioskDetailScreen.includes("Demo AI summary only"), "Kiosk detail demo overview must explain demo AI summaries honestly");
assert(!kioskDetailScreen.includes("AI summarizes only. Official numbers"), "Kiosk detail must not use ambiguous AI-only source/demo overview copy");
assert(kioskDetailScreen.includes("No source POS session rows loaded from /bayaan/api/chain_bootstrap"), "Kiosk detail must show an honest source-session empty state");
assert(kioskDetailScreen.includes("/bayaan/api/open_session"), "Kiosk detail source-session empty state must point at the real open-session route");
assert(exact.includes("Demo last 7 days"), "Legacy/static kiosk detail AI notes must be explicitly demo-labeled");
assert(!exact.includes('title={ar ? "ملاحظات الذكاء" : "AI notes for this kiosk"}'), "Kiosk detail screens must not ship the old ambiguous AI-notes title");
assert(salesMonitorScreen.includes("const sourceSessionRows = sourceDriven ? odooPosSessionRows(bootstrap) : []"), "Sales monitor open sessions must read source session rows in source-driven mode");
assert(salesMonitorScreen.includes("const visibleSessionRows = sourceDriven ? sourceSessionRows : demoSessionRows"), "Sales monitor must not infer source POS sessions from order groups");
assert(salesMonitorScreen.includes("From /bayaan/api/chain_bootstrap session rows only"), "Sales monitor source session panel must name its verified session source");
assert(salesMonitorScreen.includes("Orders are not converted into inferred sessions"), "Sales monitor must show an honest source-session empty state");
assert(salesMonitorScreen.includes("const digitalPaymentFooter = sourceDriven"), "Sales monitor digital payment KPI must not hard-code unverified providers");
assert(!salesMonitorScreen.includes('footer="card, QR, wallet, FIB"'), "Sales monitor must not hard-code FIB/card/QR/wallet as verified live providers");
assert(!salesMonitorScreen.includes("Grouped from the live order stream"), "Sales monitor must not label inferred order groups as live POS sessions");
assert(exact.includes("sourceDriven={sourceDriven}"), "Sales monitor must pass source mode into the POS order table");
assert(exact.includes("Source POS orders"), "POS order tables must label source rows distinctly from demo rows");
assert(exact.includes("Demo POS orders"), "POS order tables must label demo rows explicitly");
assert(exact.includes("sourceDriven && order.date"), "POS order table must not stamp source rows with the fixed demo date");
assert(!exact.includes('"Live POS orders"'), "Admin POS order tables must not label demo/source rows as live without source evidence");
assert(adminPanel.includes('status: liveBackendActive ? "syncing" : "missing"'), "Admin shell (live-only) must initialize with a source sync status, never a demo one");
assert(adminPanel.includes("bootstrap: EMPTY_ENGINE_SNAPSHOT"), "Admin shell (live-only) must initialize with the empty source snapshot, never a demo-capable null bootstrap");
assert(adminPanel.includes("const dashboardSync = useMemo(() =>"), "Admin shell must derive a source-empty dashboard sync object for live-only rendering");
assert(adminPanel.includes("bootstrap: sync.bootstrap || EMPTY_ENGINE_SNAPSHOT"), "Admin shell live-only render path must not pass demo-capable null bootstrap to screens");
assert(adminPanel.includes("const dashboardBootstrap = dashboardSync.bootstrap"), "Admin shell must centralize the guarded dashboard bootstrap");
assert(adminPanel.includes("const adminSourceDriven = isSourceDrivenPayload(dashboardBootstrap)"), "Admin shell headers must use shared source-driven detection");
assert(adminPanel.includes("bootstrap={scopedBootstrap}"), "Admin shell screens must receive the guarded scoped dashboard bootstrap");
assert(adminPanel.includes("sync={dashboardSync}"), "Admin shell inventory/setup screens must receive guarded sync state");
assert(!adminPanel.includes("DataModeToggle"), "Live-only admin shell must not wire a demo/live data-mode toggle");
assert(!adminPanel.includes("const adminSourceDriven = isSourceDrivenPayload(sync.bootstrap)"), "Admin shell must not derive source/demo labels from raw sync bootstrap");
assert(adminPanel.includes("const sourceOverviewSub"), "Admin shell overview subtitle must derive from source counts");
assert(adminPanel.includes("sub: adminSourceDriven ? sourceOverviewSub"), "Admin shell overview subtitle must not show the fixed demo date in source mode");
assert(adminPanel.includes("sub: adminSourceDriven ? sourceKiosksSub"), "Admin shell kiosk subtitle must not show the fixed demo kiosk count in source mode");
assert(adminPanel.includes("sub: adminSourceDriven ? sourceKioskDetailSub"), "Admin shell kiosk detail subtitle must not show demo staff counts in source mode");
assert(adminPanel.includes("sub: adminSourceDriven ? sourceSalesSub"), "Admin shell sales subtitle must be source-aware");
assert(adminPanel.includes("sub: adminSourceDriven ? sourceWasteSub"), "Admin shell waste subtitle must not show fixed anomaly counts in source mode");
assert(adminPanel.includes("const adminNavBadges = adminSourceDriven ?"), "Admin shell sidebar badges must use source counts in source-driven mode");
assert(adminPanel.includes("navBadges={adminNavBadges}"), "Admin shell must pass source-aware badges to the sidebar");
assert(exact.includes("function AdminSidebar({ active, setActive, lang, navBadges = null })"), "Admin sidebar must accept source-aware badge overrides");
assert(exact.includes("Object.prototype.hasOwnProperty.call(navBadges, it.id)"), "Admin sidebar must distinguish explicit zero badge overrides from demo defaults");
assert(!exact.includes("Kiosk live stock needs"), "Exact runtime must not expose ambiguous live Stock & Allocation wording");
assert(!adminPanel.includes("live needs"), "Admin Stock & Allocation subtitle must not imply live evidence for source/demo-neutral stock needs");
assert(!overviewScreen.includes("allowDemoFallback"), "Live-only Overview sales flow must not pass a demo-fallback prop");
assert(overviewScreen.includes("ScopedSalesFlowChart"), "Overview sales flow must use the scope-aware sales chart");
assert(overviewScreen.includes("No AI summary until verified engine rows are synced."), "Overview AI summary must go empty until verified source rows exist");
assert(wasteScreen.includes("wasteReasonRowsFor(wasteRows)"), "Waste screen must derive reason rows from source-backed waste rows");
assert(wasteScreen.includes("weeklyMetrics.waste"), "Waste 7-day KPI must read report metrics instead of a fixed value");
assert(!wasteScreen.includes("fmtMoney(2410)"), "Waste screen must not render the old fixed 7-day loss value");
assert(!wasteScreen.includes("0.42%"), "Waste screen must not render the old fixed revenue-loss percentage");
assert(!wasteScreen.includes("Croissants account for 42%"), "Waste screen must not render the old fixed waste-pattern narrative");
assert(!wasteScreen.includes("by AI"), "Waste screen must not claim AI flagged anomalies when it is showing source rules");
assert(!wasteScreen.includes("Connect Odoo"), "Waste screen visible copy must not expose Odoo branding");
assert(!wasteScreen.includes("Odoo returns"), "Waste screen empty state must refer to the source engine, not Odoo");
assert(reportsScreen.includes("canUseDemoFallback(bootstrap)"), "Reports sales flow must guard demo rows behind canUseDemoFallback");
assert(reportsScreen.includes("source-backed scheduler"), "Reports scheduling action must not pretend a live scheduler exists");
assert(reportsScreen.includes("managementReportRows.map"), "Reports management pack must render derived rows");
assert(exact.includes("const paymentGatewayRows = (payments, includeCatalog = true)"), "Payment gateway rows must support hiding catalog-only providers in source-driven mode");
assert(exact.includes("paymentGatewayRows(paymentSplit, !sourceDriven)"), "Sales monitor must hide catalog-only gateway providers in live/simulation mode");
assert(reportsScreen.includes("gatewaySettlementRows.length ? gatewaySettlementRows.map"), "Reports gateway settlement must render verified provider rows or an empty state");
assert(!reportsScreen.includes("Zain Cash / FIB / Qi"), "Reports gateway settlement must not use a hard-coded provider badge");
assert(!reportsScreen.includes('"K-07 review"'), "Reports management pack must not expose fixed kiosk-review signals");
assert(!reportsScreen.includes('"Pistachio -6 pts"'), "Reports management pack must not expose fixed recipe-margin signals");
assert(!reportsScreen.includes('"Oranges -1.4 kg"'), "Reports management pack must not expose fixed ingredient signals");
assert(!reportsScreen.includes('"Croissants 42%"'), "Reports management pack must not expose fixed waste signals");
assert(!reportsScreen.includes('"3 variances"'), "Reports management pack must not expose fixed cash-variance signals");
assert(!reportsScreen.includes('delta="10.4%"'), "Reports revenue KPI must not use a fixed demo delta");
assert(!reportsScreen.includes("target 37%"), "Reports COGS KPI must not use a fixed demo target");
assert(suppliersScreen.includes("supplierReceiptEvidence"), "Suppliers KPI must show receipt evidence instead of an invented live on-time percentage");
assert(!suppliersScreen.includes('value={liveOnly ? "0%" : "93%"}'), "Suppliers screen must not show a fake 0% live on-time delivery metric");
assert(!suppliersScreen.includes('"On-time delivery"'), "Suppliers screen must not expose an on-time delivery KPI until backend provides that metric");
assert(posPanel.includes('useStatePOS(() => bayaan.mode === "live" ? EMPTY_ENGINE_SNAPSHOT : null)'), "POS panel live-only mode must initialize with a source-empty bootstrap, not demo-capable null");
assert(posPanel.includes('const posScreenBootstrap = bayaan.mode === "live" ? posBootstrap || EMPTY_ENGINE_SNAPSHOT : posBootstrap'), "POS panel live-only screens must receive a guarded source-empty bootstrap");
assert(posPanel.includes("bootstrap={posScreenBootstrap}"), "POS panel sale/waste/close screens must use the guarded POS bootstrap");
assert(posPanel.includes("<POSPayment lang={lang}") && posPanel.includes("bootstrap={posScreenBootstrap}"), "POS panel payment screen must receive the guarded POS bootstrap");
assert(posPanel.includes('bayaan.mode === "live"\n          ? []\n          : MOCK.pendingTransfers'), "POS transfer receipt must not use demo pending transfers in live-only mode without backend");
assert(posPanel.includes("Connect the source engine before receiving source stock transfers"), "POS source transfer receive must not fall back to browser status updates without backend");
assert(!posPanel.includes("const rows = bootstrap ? odooTransferRows(bootstrap) : MOCK.pendingTransfers"), "POS transfer receipt must not keep the old unguarded demo transfer fallback");
assert(posPanel.includes("await loadPosTransfers();"), "POS transfer receipt must immediately reload source stock after receiving a transfer");
assert(posPanel.includes('window.dispatchEvent(new CustomEvent("bayaan:source-mutated"'), "POS transfer receipt must notify dashboard views that source stock changed");
assert(adminPanel.includes('window.addEventListener("bayaan:source-mutated"'), "Admin dashboard must resync when POS receives source stock");

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
assert(liveSmoke.includes("verifyLiveAiDashboard"), "Live Odoo smoke must prove the AI dashboard path");
assert(liveSmoke.includes("ensureOdooReachable"), "Live Odoo smoke must preflight Odoo reachability before browser work");
assert(liveSmoke.includes("Live Odoo smoke blocked: Odoo is not reachable"), "Live Odoo smoke must report an explicit Odoo-unreachable release blocker");
assert(liveSmoke.includes("/bayaan/api/ai_dashboard_plan"), "Live Odoo smoke must call the live AI dashboard route");
assert(liveSmoke.includes("receiveStockTransfer"), "Live Odoo smoke must receive its own stock transfer so the expected-transfer queue is not polluted");
assert(liveSmoke.includes("live-odoo-stock-transfer-received"), "Live Odoo smoke must capture proof that its stock transfer was received");
assert(liveSmoke.includes("BAYAAN-LIVE-SMOKE-"), "Live Odoo smoke stock transfers must carry a traceable origin");
assert(liveSmoke.includes("did not preserve smoke origin"), "Live Odoo smoke must fail if the backend drops transfer origin traceability");
assert(liveSmoke.includes("pickLiveSaleItem"), "Live Odoo smoke must derive sale item pricing from live bootstrap data");
assert(!liveSmoke.includes('"IQD 4,000"'), "Live Odoo smoke must not hardcode stale demo sale totals");
assert(!liveSmoke.includes('"MENU-CROISSANT"'), "Live Odoo smoke must not use ambiguous stale croissant product codes");
assert(liveSmoke.includes('result?.llm?.status !== "llm_called"'), "Live Odoo smoke must fail unless the provider is actually called");
assert(liveSmoke.includes("api[_-]?key|authorization|bearer"), "Live Odoo smoke must guard against provider credential leakage");
assert(liveSmoke.includes("live-odoo-ai-insights"), "Live Odoo smoke must capture the AI Insights live proof screenshot");

if (failures.length) {
  console.error("Bayaan wiring gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Bayaan wiring gate passed.");
