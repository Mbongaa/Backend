# AI Dashboard Manager: Philosophy, Architecture, and Component Map

This document is the first registry for the Bayaan dashboard manager agent. It is intentionally written before implementation so the agent's future canvas behavior is grounded in the real dashboard surfaces instead of ad hoc prompt guesses.

## Verified Baseline

- The active Vite runtime imports and renders `ExactKioskApp` from `apps/kiosk-pos/src/main.tsx:3` and `apps/kiosk-pos/src/main.tsx:9`.
- The active admin shell labels the main dashboard sections in `ADMIN_NAV`: Today Command, AI Insights, Kiosks, Warehouses, Items Catalog, Sales & POS, Daily Close, Waste & Loss, Products & Recipes, Purchases & Suppliers, Stock & Allocation, Staff, Finance, and Reports at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:12658`.
- The active admin screen router maps those section IDs to concrete React screen functions at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13187`.
- The Next.js studio app has a matching `BayaanSectionId` union for overview, insights, kiosks, sales, warehouses, items, inventory, products, closing, waste, suppliers, staff, finance, and reports at `apps/bayaan-dashboard/src/data/bayaan-demo.ts:22`.
- The studio app carries matching section metadata for overview, insights, kiosks, sales, warehouses, items, inventory, products, closing, waste, suppliers, staff, finance, and reports at `apps/bayaan-dashboard/src/data/bayaan-demo.ts:62`.
- The existing Bayaan AI module already states the intended split: M1 is read-only reporting and M2 later adds live alerts plus approve-to-execute actions at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:226`.
- The existing AI module also states every numeric claim should carry `sources` so AI does not invent numbers at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:228`.
- The repo-level product rule says AI is a final-layer reporting/insights surface and never computes official numbers at `AGENTS.md:28`.
- The repo-level AI rule says AI reads deterministic Odoo/Bayaan reports and every numeric output must trace back to source rows at `AGENTS.md:135`.
- The production read path is initial `/bayaan/api/chain_bootstrap` plus scoped realtime subscription, with manual refresh and polling only as fallbacks at `AGENTS.md:124`.

## Active Vite Component Adoption Inventory

As of 2026-05-17, the active Vite dashboard is not fully migrated to the Studio Admin component stack.

| Active Vite surface | Current implementation | Studio/Admin parity status |
| --- | --- | --- |
| Stock & Allocation | Imports and renders `StudioInventoryWorkspace` from the studio-dashboard folder at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5` and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8604` | Studio component adopted |
| Waste & Loss | Imports and renders `StudioWasteReasonControl` and `StudioWasteEntriesTable` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8713`, and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8730` | Studio component partially adopted |
| Kiosks overview cards | Local `KioskCard` and `RealtimeKioskCard` functions at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6110` and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6363` | Legacy/self-made; compare against studio `KiosksSection` at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:198` |
| Individual kiosk detail | Local `KioskDetailScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:6865` | Legacy/self-made; now has all-10-kiosk late-order simulation smoke coverage |
| Sales & POS | Local `SalesMonitorScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8062` | Legacy/self-made; compare against studio `SalesSection` and live orders panel at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:376` and `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:428` |
| Staff | Local `HRPayrollScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:10828` | Legacy/self-made; compare against studio `StaffSection` at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1036` |
| Finance and Reports | Local `ReportsScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:12400` | Legacy/self-made; compare against studio `ReportsSection` at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1157` |
| Overview and AI Insights | Local `OverviewScreen` and `InsightsScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:3897` and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5902` | Legacy/self-made; migrate only with screenshot parity checks |
| Warehouses, Items, Closing, Products, Suppliers | Local screen functions at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:7763`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8736`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8919`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:9314`, and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:10029` | Legacy/self-made; require either Studio migration or section-specific interaction/screenshot gates |

## Philosophy

The first version of the agent is a dashboard manager, not an operator. It should observe, analyze, explain, and visualize. It must not create a purchase order, approve a close, change a recipe, adjust stock, create a transfer, or edit any official Odoo/Bayaan record.

The agent's value is not "chat over the dashboard." Its value is choosing the right visual proof surface. If the owner asks "why is Zayouna behind?", the answer should not be only prose. The agent should open a canvas with a diagnosis headline, a variance breakdown, an hourly pattern, and source citations. If the owner asks "which closes need attention?", the agent should show the close review table, variance inputs, blockers, and traceable evidence.

The agent should speak in management language while remaining database-honest:

- Deterministic data first: the official numbers come from Bayaan/Odoo reports, never the model.
- Visual proof over long prose: a short explanation should be paired with the smallest component set that proves the claim.
- Read-only by default: all actions in v1 are recommendations or proposed next steps, not executable buttons.
- Source citations are part of the UI contract: every KPI, anomaly, forecast, or recommendation must have source refs.
- Canvas components should be composable: the agent chooses from registered dashboard sections, existing AI card renderers, and studio-only visualization components.
- The variance loop is the central operating story: opening stock + received transfers - recipe consumption - recorded waste = expected stock, then expected vs counted exposes variance at close, as defined in `AGENTS.md:40`.

## Read-Only Architecture

### Runtime Flow

1. User asks a question in the AI panel.
2. Intent router classifies the question into one or more dashboard domains: sales, stock, waste, close, recipe, supplier, finance, staff, kiosk, warehouse, or executive summary.
3. Data planner requests read-only data packs from deterministic report APIs.
4. Analyzer produces claims only from returned metrics and rows.
5. Component resolver chooses a canvas layout from the component registry.
6. Canvas renderer displays registered components with a `sourceRefs` sidecar.
7. Assistant narrative summarizes what the canvas proves and what a human manager could do next.

### Hard Guardrails

- The agent v1 receives no mutation tools. It can read snapshots, report packs, and realtime events, but cannot call create/update/approve endpoints.
- Any component containing an action button must be rendered in `proposal` mode for the AI canvas. Example: "Create transfer" becomes "Recommended transfer", and "Approve close" becomes "Manager approval required."
- Any mutation already present in the dashboard remains human-only. For example, the active inventory screen can submit purchase orders, create stock transfers, create stock items, and advance transfer status through `sourceOfTruth` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8309`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8351`, `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8393`, and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8451`; the AI canvas must not invoke those paths in v1.
- Live data may refresh the canvas, but streams do not create official numbers. The repo's streaming rule says streams never replace Odoo/Bayaan writes at `AGENTS.md:126`.

### Read Data Boundary

The existing gateway already has the right read shape:

- `createSourceOfTruthGateway` returns a no-op gateway when no backend URL is configured at `apps/kiosk-pos/src/services/sourceOfTruth.ts:363` and `apps/kiosk-pos/src/services/sourceOfTruth.ts:374`.
- The live gateway exposes read paths for auth status, `/bayaan/api/chain_bootstrap`, `/warehouse_setup`, `/payment_gateways`, and audit log at `apps/kiosk-pos/src/services/sourceOfTruth.ts:380`.
- The live gateway exposes realtime subscription at `apps/kiosk-pos/src/services/sourceOfTruth.ts:410`.
- The no-op gateway is explicitly `enabled: false` and returns skipped responses for reads at `apps/kiosk-pos/src/services/sourceOfTruth.ts:4675`.
- The app refreshes bootstrap and warehouse setup together when live backend mode is active at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:12979`.
- Realtime events update local realtime state and trigger a debounced refresh at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13158`.

For the AI work, introduce a dedicated read facade instead of giving the agent the whole `sourceOfTruth` object:

```ts
type AiReadGateway = {
  getDashboardSnapshot(scope: DashboardScope): Promise<DashboardSnapshot>;
  getReportPack(query: ReportQuery): Promise<ReportPack>;
  getSourceRows(refs: SourceRef[]): Promise<SourceRowPreview[]>;
  subscribeToReadEvents?(scope: DashboardScope, onEvent: (event: ReadEvent) => void): Subscription;
};
```

The facade should live in front of the same deterministic sources as the dashboard. It must not expose methods named `create`, `submit`, `review`, `approve`, `action`, `upsert`, or `delete`.

## Component Registry Shape

Each visualization entry should be registered with enough metadata for the agent to select it without knowing React internals.

```ts
type DashboardComponentEntry = {
  id: string;
  label: string;
  sectionId: BayaanSectionId | "canvas" | "studio";
  sourcePath: string;
  sourceLines: string;
  visualKind:
    | "kpi-grid"
    | "rank-list"
    | "status-card"
    | "table"
    | "expanded-table"
    | "meter"
    | "progress-list"
    | "donut"
    | "bar-chart"
    | "area-chart"
    | "line-chart"
    | "heatmap"
    | "stacked-breakdown"
    | "timeline"
    | "ai-explanation"
    | "proposal-card";
  bestFor: string[];
  dataContract: string;
  sourceRefsRequired: string[];
  interactionMode: "read-only" | "proposal-only" | "human-action";
  canvasSizes: Array<"small" | "medium" | "wide" | "full">;
  notes?: string;
};
```

The registry should be code-owned later, but this document is the first human-readable legend.

## Existing AI Canvas Primitives

The current AI canvas already supports a card renderer map for headline, bars, forecast, rank, runway, stack, actions, hourly, heatmap, rank-big, and wastegrid cards at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5511`.

| Registry ID | Current Renderer | Best Use | Notes |
| --- | --- | --- | --- |
| `canvas.headline` | `HeadlineCard` | One major anomaly, KPI delta, or diagnosis | Existing default scene uses it for "Pistachio cake margin dropped 6 pts" at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4871`. |
| `canvas.bars` | `BarsCard` | Current vs prior comparisons by day/category/kiosk | Used for "Iced drinks +31% w/w" at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4881`. |
| `canvas.forecast` | `ForecastCard` | Forecast range with confidence | Existing scene has "Friday revenue" with low/high range at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4897`. |
| `canvas.rank` | `RankCard` | Small ranked rows with target comparison | Existing scene ranks cashier speed against median at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4906`. |
| `canvas.runway` | `RunwayCard` | Days of cover, stock runway, category health | Existing scene shows stock runway by category at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4918`. |
| `canvas.stack` | `StackCard` | Variance decomposition, root-cause breakdown | Zayouna scene breaks a 12% gap into causes at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4950`. |
| `canvas.actions` | `ActionsCard` | Proposed next steps only in v1 | Zayouna scene contains "Approve auto-PO" and transfer text at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4962`; AI v1 must render these as proposals, not actions. |
| `canvas.hourly` | `HourlyCard` | Intra-day order, sales, or stockout timeline | Zayouna scene shows hourly drinks served and outage range at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4971`. |
| `canvas.heatmap` | `HeatmapCard` | Correlation, day/hour matrix, kiosk x date anomaly grid | Weekend scene uses heat x sales correlation at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4998`. |
| `canvas.rank-big` | `RankBigCard` | Larger recommendation ranking | Weekend scene ranks push candidates with score, attach, margin, and reason at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:4987`. |
| `canvas.wastegrid` | `WasteGridCard` | Waste heatmap across kiosks and dates | Waste scene defines a 14-day waste heatmap at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5025`. |

The current canvas renders scenes in a 12-column grid and swaps cards with motion at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5529`. The current chat panel guesses scenes from keywords for Zayouna, weekend product push, waste, or default brief at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5927`; this should be replaced by a registry-backed intent router.

## Studio and Dashboard Visualization Primitives

| Registry ID | Component | Best Use | Evidence |
| --- | --- | --- | --- |
| `primitive.panel` | `Panel` | Framed section with title, badge, optional action | Studio `Panel` renders a title/badge shell at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1819`. |
| `primitive.kpi_grid` | `KpiGrid` | 3-4 metric summaries | `KpiGrid` maps label/value/detail cards at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1786`. |
| `primitive.ai_block` | `AiBlock` | Compact explanatory finding with label and text | `AiBlock` renders a Sparkles badge and explanatory panel at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1802`. |
| `primitive.table_wrap` | `TableWrap` | Scrollable dense data table | `TableWrap` is an overflow wrapper at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1844`. |
| `primitive.segmented` | `Segmented` | Text filter/sort controls | `Segmented` renders stateful button groups at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1678`. |
| `primitive.icon_segmented` | `IconSegmented` | Card/table view switcher | Icon segmented control appears at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1705`. |
| `primitive.meter` | `Meter` | Inventory, waste, pressure, progress against target | `Meter` renders animated percent bars at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1749`. |
| `primitive.metric_cell` | `MetricCell` | Dense card metrics inside status cards | `MetricCell` is used by kiosk and warehouse cards at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1660`. |
| `primitive.live_pulse` | `LivePulse` | Live state indicator | `LivePulse` renders animated status dots at `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1734`. |
| `primitive.live_activity` | `LiveActivity` | Stream-like event feed | Overview live activity log is implemented at `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:443`. |
| `primitive.rank_panel` | `RankPanel` | Top/bottom lists with percent bars | Overview uses RankPanel for top performers, restock priority, top products, and top waste at `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:183`. |

The studio component stack includes Recharts, TanStack Table, lucide-react, Next.js, React, and shadcn packages at `apps/bayaan-dashboard/package.json:25`, `apps/bayaan-dashboard/package.json:33`, `apps/bayaan-dashboard/package.json:34`, `apps/bayaan-dashboard/package.json:37`, `apps/bayaan-dashboard/package.json:42`, and `apps/bayaan-dashboard/package.json:43`.

## Dashboard Section Component Map

### `overview` - Today Command Center

Current active title: "Today Command Center" with all-kiosk subtitle at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13205`.

Registered components:

- `overview.terminal_status`: stream health, time, kiosks online, latency, buffered events. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:362`.
- `overview.top_performers_rank`: top kiosk ranking by revenue. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:183`.
- `overview.restock_priority_rank`: low-stock priority list. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:195`.
- `overview.top_products_rank`: product revenue ranking. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:209`.
- `overview.top_waste_rank`: waste cost ranking. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:221`.
- `overview.kpi_panel`: total sales, profit estimate, cash expected, digital payments, kiosk status, orders, waste, variance. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:98`.
- `overview.live_activity`: live sales stream. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:254`.
- `overview.hourly_pulse`: actual vs expected hourly bars. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:260`.
- `overview.alerts`: operational alerts. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:285`.
- `overview.ai_summary`: traceable AI summary card. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:326`.
- `overview.stock_need_cards`: stock need cards per kiosk/item. Evidence: `apps/bayaan-dashboard/src/components/bayaan/overview-dashboard.tsx:339`.

Agent use: executive brief, "what changed today?", "what needs attention?", "show me the proof behind today's risk."

### `insights` - AI Insights

Current active title: "AI Insights" and subtitle "What changed and what needs attention" at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13206`.

Registered components:

- `insights.canvas_grid`: existing 12-column AI canvas. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5529`.
- `insights.chat_panel`: AI/user chat panel with suggested prompts. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5916`.
- `insights.source_meta`: current source citation header in canvas. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5565`.
- `insights.studio_cards`: studio brief cards with confidence progress bars. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:134`.
- `insights.studio_traceable_cards`: studio insight cards with source text. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:150`.
- `insights.suggested_questions`: suggested owner questions. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:184`.

Agent use: the default landing surface for analysis. It should compose other section components here instead of forcing users to navigate manually.

### `kiosks` - Kiosk Fleet

Current active screen maps to `KiosksScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13191`.

Registered components:

- `kiosks.kpi_grid`: active/good/watch/critical, revenue, average inventory, average waste. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:249`.
- `kiosks.city_filter`: city filter buttons. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:276`.
- `kiosks.sort_segmented`: sort by status, revenue, inventory, waste. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:293`.
- `kiosks.view_toggle`: cards vs table. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:303`.
- `kiosks.realtime_card`: per-kiosk status card with live pulse, revenue, orders, margin, inventory meter, waste meter. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1527`.
- `kiosks.table`: dense table with status, revenue, orders, inventory, waste, margin. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:326`.

Agent use: "which kiosk is weakest?", "compare Baghdad vs Basra", "why is K-07 critical?", "show stores sorted by waste."

### `warehouses` - Warehouse Topology

Current active screen maps to `WarehousesScreen` at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13193`.

Registered components:

- `warehouses.kpi_grid`: warehouse count, kiosk locations, POS configs, source. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1367`.
- `warehouses.engine_status`: configured/not-configured engine status block. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1376`.
- `warehouses.topology_toolbar`: scope, sort, and view controls. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1399`.
- `warehouses.realtime_card`: stock availability, reserved quantity, linked locations, movement pressure. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1595`.
- `warehouses.topology_table`: type, engine record, stock location, qty, reserved/policy. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1448`.

Agent use: "show the stock topology", "which location has pressure?", "prove this is not a second accounting store."

### `items` - Stock Items Catalog

Current active title/subtitle: "Items Catalog" and global purchasable stock items at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13211`.

Registered components:

- `items.catalog_table`: item, category, UoM, default supplier, unit cost, mode. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8715`.
- `items.category_filter`: all-category dropdown. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8707`.
- `items.new_item_modal`: stock item creation form. Human-only in v1. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8741`.

Agent use: "what stock item exists for milk?", "which ingredients lack suppliers?", "which items can be used in recipes?"

### `sales` - Sales & POS Monitor

Current active title/subtitle: "Sales & POS Monitor" with live POS orders, payments, refunds, voids, and recipe posting at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13209`.

Registered components:

- `sales.kpi_grid`: POS orders, cash, digital payments, needs review. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:382`.
- `sales.payment_split`: progress list by payment method. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:393`.
- `sales.gateway_providers`: settlement table for Iraq providers. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:407`.
- `sales.live_orders_table`: time, kiosk, cashier, product sold, payment, amount, recipe status. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:428`.
- `sales.live_demo_stream`: area chart for revenue vs expected and line chart for orders. Evidence: `apps/bayaan-dashboard/src/components/bayaan/live-demo-panel.tsx:75` and `apps/bayaan-dashboard/src/components/bayaan/live-demo-panel.tsx:105`.

Agent use: "what sales are not posted?", "which payment method dominates?", "show live orders that need recipe review."

### `closing` - Daily Close & Variance

Current active title/subtitle: "Daily Close & Variance" and "Expected vs counted - across kiosks" at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13214`.

Registered components:

- `closing.kpi_grid`: pending review, approved closes, cash variance, stock variance value. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:690`.
- `closing.variance_loop_explanation`: expected-vs-counted operating rule. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:700`.
- `closing.today_closes_table`: kiosk, cashier, sales, cash expected/counted/variance, stock variance, status, investigation. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:706`.
- `closing.active_review_table`: active app close table with human approval/reject/note controls. Human-only in v1. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:8925`.
- `closing.variance_inputs_expanded`: opening, received, consumed, waste, expected, counted, variance. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:9081`.
- `closing.recipe_posting_review`: paid orders needing consumption review. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:9068`.

Agent use: "which closes can be approved?", "why is this variance blocked?", "show expected vs counted for K-07."

### `waste` - Waste & Loss

Current active title/subtitle: "Waste & Loss" and last-7-days anomalies at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13215`.

Registered components:

- `waste.kpi_grid`: loss today, loss 7-day, percent of revenue, anomalies flagged. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:614`.
- `waste.reason_control`: waste reason values by category. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:624`.
- `waste.pattern_ai_block`: croissant waste pattern explanation. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:636`.
- `waste.entries_table`: time, kiosk, item, qty, cost, reason, flag. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:642`.
- `waste.reason_bar_chart`: studio bar chart for waste reasons. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioWasteWorkspace.tsx:42`.
- `waste.entries_flag_table`: studio table with flagged-row indicator. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioWasteWorkspace.tsx:120`.

Agent use: "show waste anomalies", "which reason is driving loss?", "what waste links to today's close variance?"

### `products` - Products & Recipes

Current active title/subtitle: "Products & Recipes" and "Menu, prices, sizes, images, ingredient recipes" at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13213`.

Registered components:

- `products.kpi_grid`: products, with recipe, custom images, missing recipes. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:768`.
- `products.recipe_margin_table`: product, recipe version, ingredient mode, price, cost, gross margin. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:779`.
- `products.persistence_ai_block`: explains current local/demo persistence. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:812`.
- `products.product_list_table`: image, product, category, price, sizes, recipe status. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:818`.
- `products.active_editor`: active product editor can upsert product catalog and submit recipe versions. Human-only in v1. Evidence: `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:9689` and `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:9702`.

Agent use: "which product margin dropped?", "which products are missing recipes?", "show recipe cost proof for pistachio cake."

### `suppliers` - Purchases & Suppliers

Current active title/subtitle: "Purchases & Suppliers" and supplier health, purchase orders, ingredient costs, margin impact at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13216`.

Registered components:

- `suppliers.open_po_table`: PO, supplier, invoice, warehouse, items, value, status. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:890`.
- `suppliers.item_catalog_table`: supplier item catalog and margin watch. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:924`.
- `suppliers.recurring_purchases_table`: plan, supplier, warehouse, schedule, items, action. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:942`.
- `suppliers.supplier_table`: supplier, category, delivery time, 30-day spend, last order. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:985`.

Agent use: "which supplier price changed?", "which PO is open?", "what item costs are hurting margin?"

### `inventory` - Stock & Allocation

Current active title/subtitle: "Stock & Allocation" and warehouse stock, kiosk stock, live needs, transfer execution at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13212`.

Registered components:

- `inventory.warehouse_allocation_table`: item, category, location, stock, reorder, cover, supplier, allocation action. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:468`.
- `inventory.transfer_execution_card`: transfer rows and status. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1489`.
- `inventory.kiosk_live_needs_table`: item, kiosk, qty, cover, reason, create transfer. Human action in dashboard, proposal-only in AI. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:530`.
- `inventory.studio_health_donut`: inventory health donut with healthy/low/critical split. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioInventoryWorkspace.tsx:291`.
- `inventory.studio_ledger_table`: inventory ledger with category/location filters and export. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioInventoryWorkspace.tsx:394`.
- `inventory.studio_transfers_panel`: warehouse transfer state cards. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioInventoryWorkspace.tsx:443`.
- `inventory.studio_stock_needs_panel`: kiosk live stock needs with AI verified-data badge. Evidence: `apps/kiosk-pos/src/components/studio-dashboard/StudioInventoryWorkspace.tsx:494`.

Agent use: "what should we move today?", "which items are below reorder?", "show the transfer proof but do not execute it."

### `staff` - HR & Payroll

Current active title/subtitle: "HR & Payroll" with staff, attendance, payroll approval, and expenses at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13217`.

Registered components:

- `staff.kpi_grid`: active staff, monthly payroll, weekly hours, under review. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1036`.
- `staff.cashier_performance_table`: cashier, kiosk, sales, cash shortage, void/refund. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1050`.
- `staff.expenses_table`: expense rows. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1080`.
- `staff.roster_table`: staff member, role, kiosk, monthly hours, salary, status. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1105`.

Agent use: "who needs coaching?", "which cashier shortages overlap with close variance?", "where is staffing coverage weak?"

### `finance` and `reports` - Management Reporting

Current active titles/subtitles: Finance at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13218`; Reports at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:13219`.

Registered components:

- `reports.ai_summary`: daily report summary with revenue and net profit. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1162`.
- `reports.kpi_grid`: revenue, COGS, net profit. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1168`.
- `reports.payment_methods_table`: payment method amounts. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1176`.
- `reports.gateway_settlement_table`: provider, category, settlement, total. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1191`.
- `reports.management_report_pack`: report, owner decision, traceable sources, today signal. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1218`.
- `reports.pnl_table`: profit and loss daily/weekly/monthly rows. Evidence: `apps/bayaan-dashboard/src/components/bayaan/section-dashboard.tsx:1256`.

Agent use: "summarize P&L", "show payment split", "what report explains today's margin loss?"

## Query-to-Component Resolver Examples

| User Query Pattern | Intent | Canvas Layout |
| --- | --- | --- |
| "Why is K-04/Zayouna behind?" | Kiosk diagnosis | `canvas.headline` + `canvas.stack` + `canvas.hourly` + `inventory.kiosk_live_needs_table` + source citations. |
| "Show waste anomalies" | Waste anomaly review | `canvas.wastegrid` + `waste.reason_bar_chart` + `waste.entries_flag_table` + `waste.pattern_ai_block`. |
| "What should we transfer today?" | Stock allocation | `inventory.studio_health_donut` + `inventory.studio_stock_needs_panel` + `inventory.studio_transfers_panel` in proposal-only mode. |
| "Can I approve closes?" | Close review | `closing.today_closes_table` + `closing.variance_inputs_expanded` + `closing.recipe_posting_review` + blocker summary. |
| "Which products are hurting margin?" | Recipe and supplier margin | `products.recipe_margin_table` + `suppliers.item_catalog_table` + `canvas.bars` trend. |
| "How are payments split?" | Payment reconciliation | `sales.payment_split` + `reports.payment_methods_table` + `reports.gateway_settlement_table`. |
| "What happened today?" | Executive brief | `overview.kpi_panel` + `overview.top_performers_rank` + `overview.alerts` + `overview.ai_summary`. |
| "Which cashier needs coaching?" | Staff and cash control | `staff.cashier_performance_table` + `closing.today_closes_table` filtered by shortage + `canvas.rank`. |

## Implementation Phases

### Phase 1 - Static Registry

- Create `apps/kiosk-pos/src/ai-dashboard/componentRegistry.ts`.
- Encode every component from this document with section ID, visual kind, source path, data contract, and interaction mode.
- Mark all dashboard mutation components as `human-action`.
- Mark AI canvas uses of action cards as `proposal-only`.

### Phase 2 - Read-Only Data Packs

- Add backend or frontend read adapters for report packs: sales, close, waste, inventory, product recipe, supplier, staff, finance, and overview.
- Every data pack returns `metrics`, `rows`, `sourceRefs`, `scope`, `generatedAt`, and `limits`.
- The model receives compact JSON only. It must not receive raw unlimited `pos.order` pages, matching the cost-control rule at `AGENTS.md:136`.

### Phase 3 - Intent Router and Component Resolver

- Replace the current `guessScene` keyword function with a registry-aware resolver. The current keyword function lives at `apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx:5927`.
- Router output should be deterministic JSON:

```ts
type AiDashboardPlan = {
  intent: string;
  scope: DashboardScope;
  requiredDataPacks: string[];
  components: Array<{
    componentId: string;
    size: "small" | "medium" | "wide" | "full";
    mode: "read-only" | "proposal-only";
    title?: string;
    dataBinding: string;
  }>;
  explanationStyle: "brief" | "diagnostic" | "audit";
  modelSelection: AiDashboardModelSelection;
};
```

The first release-gate model selection is now represented as a provider catalog plus `DEFAULT_AI_DASHBOARD_MODEL_SELECTION` in `apps/kiosk-pos/src/ai-dashboard/modelProvider.ts:74`. This keeps the chosen model explicit while still requiring provider credentials to stay server-only.

### Phase 4 - Canvas Renderer Adapters

- Keep the existing AI card renderer system for custom insight cards.
- Add adapters that can render registered studio components inside the AI canvas with read-only props.
- Add a common `SourceEvidencePanel` that lists source model, row count, filters, and timestamps.
- Build "proposal mode" wrappers for action-looking components so users see recommendations without executable handlers.

### Phase 5 - Verification

- Add tests for intent-to-component mapping.
- Add tests that reject plans containing mutation methods in v1.
- Add smoke coverage proving a query updates the canvas and shows source evidence.
- Do not claim production readiness until the frontend verify gate and addon test gate are run successfully.

### Phase 6 - Future M2 Execution

M2 can add human-approved execution later. The architecture should leave room for:

- `proposeAction` objects that are audit logged but not executed.
- Human confirmation UI.
- Server-side permission checks by role and kiosk scope.
- Idempotent mutation endpoints.
- Audit evidence linking the original insight, manager decision, and backend write.

M2 is not part of the first build.

## First Build Definition of Done

Current gate status is tracked in `docs/ai-dashboard-release-gate.md`.

- A registry exists in code and includes the sections and components in this document.
- A model provider boundary exists in code with OpenAI `gpt-5.4-mini` selected as the v1 default and GPT/Claude/Ollama alternatives behind the same adapter shape.
- The AI agent can answer with a canvas plan before rendering.
- The canvas can render at least five proof layouts: executive brief, kiosk diagnosis, waste anomalies, close review, and stock allocation.
- Every rendered numeric claim displays source evidence.
- No rendered AI component can mutate backend state.
- The old keyword scene selector is replaced or wrapped by the registry resolver.
- Existing dashboard routes still work in demo mode and live/no-backend mode.
