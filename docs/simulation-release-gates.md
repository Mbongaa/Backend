# Bayaan Simulation Release Gates

## Goal

Build a real operating simulation for Bayaan dashboard hardening. The simulation must behave like a 10-kiosk Baghdad peak-opening window, starting from zero activity and progressing minute by minute into deterministic Odoo-shaped source rows.

## Scenario Contract

- Default duration: 60 simulated minutes.
- Adjustable duration: 30 or 60 minutes through runtime query/config.
- Adjustable speed: x1, x2, x5, x10.
- Loop behavior: after the final simulated minute, the scenario resets to minute 0 and starts again unless explicitly disabled.
- Start state: minute 0 has zero orders, zero payments, zero consumption ledger rows, zero waste rows, zero closings, and initial stock only.
- End state: every kiosk lands exactly on its configured target order count for the scenario.
- Custom target profiles must be audited with the supplied per-kiosk targets, not silently re-tested against the default 60-minute target mix.

## Release Gates

1. Timeline determinism
   - Same seed, duration, and targets produce the same order IDs, payment rows, stock rows, and ledger rows.
   - Minute 0 is empty.
   - Final minute equals the configured per-kiosk order targets.
   - Custom per-kiosk target overrides propagate through minute-by-minute causality checks without double-scaling shorter durations.

2. Accounting reconciliation
   - `sum(pos.order.amount_total) == sum(pos.payment.amount)`.
   - Every simulated order must have unique order/payment IDs; each line subtotal must equal `qty * price_unit`, each order total must equal its line subtotals, and each payment row must attach back to that order.
   - Unbalanced POS sale submissions through the simulation gateway must be rejected before source order/payment rows are created.
   - POS sale payloads must allocate the cashier-displayed total into Odoo-facing line prices before submission, so displayed VAT/rounding cannot split order totals from payment totals.
   - Dashboard revenue equals order-row revenue.
   - Hour/minute pulse totals equal order-row revenue.
   - Recipe consumption rows equal recipe lines for recipe/hybrid products sold.
   - Each consumption ledger row must pin the recipe version and reconcile to the source paid order line, ingredient quantity, unit cost, kiosk, and timestamp.
   - Finished-product COGS and recipe COGS are both counted once.
   - Each waste row must reference a known stock item and kiosk; waste cost must equal `qty * unitCost` and reconcile into summary totals, report periods, close rows, by-kiosk rows, and exported management CSV rows.
   - Cash variance and stock variance values roll into profit/report-period aggregates.
   - Cash and digital payment splits reconcile across summary totals, report periods, and exported management CSV rows; opening cash float stays separate from simulated sales payments.
   - Manual POS digital payments such as FIB increase digital/bank-app totals and report periods without increasing expected cash.
   - Simulation gateway POS sale submissions must reject unknown kiosks/products, non-positive quantities/prices/payment amounts, and unrecognized payment methods before source order/payment/ledger rows are created.
   - Simulation gateway POS sale submissions must reject recipe/hybrid products without an active recipe version and must reject sales whose recipe or finished-SKU consumption exceeds current kiosk stock before source rows are created.
   - Duplicate manual POS sale retries must be idempotent by external id/order name and must not double-count orders, payments, consumption, cash, or stock usage.
   - Duplicate manual POS sale retries through the simulation gateway must return the original created order name and must not emit a second source row.
   - Source-count traceability must reconcile not only order/payment/ledger/waste/close rows, but also transfers, purchase orders, supplier rows, recurring purchase plans, product rows, warehouse stock rows, HR employee/shift/attendance rows, payroll adjustments/runs, and operating expense rows.
   - HR payroll accrual must reconcile to simulated employee pay rows and report payroll/net-profit-after-payroll.
   - Manual simulation HR staff, schedule, coverage, adjustment, and payroll-run writes must persist into the same source snapshot and update report payroll expense.
   - HR/payroll replay helpers must enforce the same employee, kiosk, shift timing, coverage, attendance, adjustment, payroll-run, and operating-expense validation before updating payroll/report source rows.
   - Draft cash-shortage deductions must hold payroll approval and stay out of displayed/source payroll totals until a manager approves the adjustment; approval must then reduce net pay, payroll expense, report P&L, and exports, while rejection must release the hold without changing payroll totals.
   - Approved or rejected payroll adjustments are terminal source decisions: duplicate same-action retries are idempotent, opposite-action reversals are rejected, and the Staff UI must not expose reversal controls after decision.
   - Once a payroll run is approved or paid, same-period cash-shortage adjustments must be blocked and moved to the next payroll run instead of mutating paid payroll totals.
   - Manual source-created shifts must preserve the operator-selected state, including confirmed shifts, after the Staff source snapshot refresh.
   - Manual simulation attendance check-in/check-out writes must compute worked hours from timestamps, surface newest attendance rows first, and appear in payroll export.
   - Manual simulation operating expenses must persist into the source HR snapshot, update HR operating-expense totals, appear in payroll export, and reduce Reports P&L plus exported management net profit.
   - Live Odoo operating expenses must use a persisted `bayaan.operating.expense` source row through the same source gateway contract; the frontend must not fall back to React-only expense state once Odoo is configured.
   - Live Odoo report periods must expose payroll expense, operating expenses, net profit after payroll, and HR/payroll/expense source-count rows with the same field names consumed by the simulation dashboard.
   - Live Odoo report periods must accrue payroll from active employees and approved adjustments before a payroll run exists, while showing zero payroll-run rows; once a reviewed/approved/paid payroll run exists, report payroll must use the prorated run totals.
   - If a live payroll run covers only part of a report period, uncovered days must still accrue active employee salary plus approved adjustment impact instead of dropping labor cost from the period report.
   - In simulation mode, reviewed/approved/paid payroll-run totals are source facts; later approved adjustments must not alter report payroll until an explicit recompute refreshes the run.
   - Source-backed Reports and management exports must preserve negative net profit after payroll; operating losses are official accounting facts and must not be clamped to zero.
   - Peak simulation-generated report periods must preserve negative net profit after payroll once order/payment/stock activity exists, while the minute-zero snapshot remains a true zero-activity start.
   - Dashboard KPI styling must render currency-prefixed negative money values as negative/down indicators, not as green positive deltas.
   - Manual source-backed sales, waste, and shift-close variance rows must scale into weekly/monthly/yearly synthetic report periods with the same multiplier logic, so each period's net profit and net profit after payroll reconcile.
   - Manual source-backed sales, waste, and shift-close variance rows must recompute net profit after payroll from the updated period aggregate, payroll, and operating-expense fields; first activity after a zero-start snapshot must not skip payroll.
   - Generated and manual simulation summary totals must mirror the source-backed daily `netProfitAfterPayroll`, so dashboard fallbacks and Reports cannot diverge after sales, waste, or close variance.
   - Dashboard open/closed kiosk totals must count unique closed kiosk ids, not close-row count, so repeated same-kiosk close rows do not overstate closed kiosks.
   - Generated peak simulation summaries and manual close mutations must use the same unique-kiosk closed/open count rule.
   - HR/payroll updates must publish payroll expense, operating expenses, and net profit after payroll on both summary totals and report periods.
   - Reports and management exports must prefer a source-provided `netProfitAfterPayroll` field over client-side recomputation whenever that field is available.
   - Finance allocation must expose negative source-backed net profit after payroll as a visible loss shortfall rather than silently converting it into zero savings.
   - Finance reserve allocation must treat favorable variance as profit already included in savings; only unfavorable variance belongs in the reserve cost bucket.
   - Live Odoo report periods must include shift-close cash variance and ingredient stock variance value in variance impact and net profit, using the same fields consumed by simulation Reports.
   - Payroll export must include individual payroll adjustment rows, including approved and rejected cash-shortage decisions plus a signed payroll-impact column, so payroll-run net adjustments can be traced row by row.
   - Duplicate backend and simulation payroll adjustment submissions with the same employee, date, type, amount, and reason must reuse the original adjustment row rather than double-posting payroll impact, even when a retry changes the create-time `approve` flag.
   - Duplicate attendance and operating-expense submissions with the same source attributes must reuse the original row rather than double-posting worked hours, operating expense, payroll totals, source counts, or report net profit.
   - Duplicate manual payroll run compute/approval/paid retries must return the original source run, must not create duplicate payroll run rows, and must not downgrade a paid run.
   - Recomputing a reviewed payroll run after held adjustments are approved must keep the same source run id while refreshing net adjustment and net pay totals before approval.
   - Backend payroll run routes must match the simulation gateway: duplicate same-period compute calls reuse the existing run, paid retries are idempotent, paid runs cannot be downgraded by approval retries, and recompute cannot mutate approved/paid payroll.
   - Unsupported payroll adjustment/run actions must be rejected before they mutate source payroll state; marking payroll paid must require an approved run.
   - Simulation gateway payroll adjustment types and payroll run date ranges must be validated before appending to the replay log, so rejected payroll rows cannot poison future bootstrap rebuilds.
   - Shift close actual cash must equal expected cash plus cash variance, and expanded close detail must show the counted stock value, not only the pre-close stock snapshot.
   - Overview profit estimate must display the same variance-adjusted profit as the deterministic summary.

3. Stock integrity
   - Warehouse stock changes from purchase receipts and completed outbound transfers.
   - Purchase order lines must reconcile ordered quantity, received quantity, unit cost, and PO total; partial receipts must visibly remain partial and increase warehouse stock only by received quantity.
   - Simulated partial purchase receipts must only add the received quantity to warehouse stock; follow-up receive completes the remaining quantity.
   - Duplicate partial purchase receive retries must be idempotent by PO/action/items/time and must not add warehouse stock twice.
   - Purchase receipt actions with zero or non-matching quantities must be no-ops and cannot mutate a purchase order into partial without stock movement.
   - Duplicate full purchase receipt retries through the simulation gateway must return the already-posted source state and must not add warehouse stock twice.
   - Simulated partial purchase receipt quantities must be consumed once across duplicate PO item lines, not applied independently to every matching line.
   - Simulation gateway purchase order creation must reject unknown suppliers/items and non-positive quantities/rates before source purchase rows are created.
   - Purchase-order replay helpers must enforce the same supplier/item/quantity/rate validation before creating source purchase rows.
   - Cancelled simulated purchase orders cannot later receive warehouse stock, and already-received purchase orders cannot be cancelled or reverse posted stock.
   - Purchase action history must replay in order after simulated refresh so cancelled/received terminal states are respected.
   - Purchase action replay helpers must reject actions for missing purchase orders and positive receipt item lines outside the PO before any warehouse stock movement.
   - Simulation gateway purchase actions must run the same validation before appending to the replay log, so a rejected receipt/action cannot poison future bootstrap rebuilds.
   - Interactive purchase receipt completion must update the source warehouse stock by the remaining unreceived quantity, not only change the PO badge.
   - Interactive purchase order creation must persist as a source purchase row and survive leaving/re-entering the Purchases & Suppliers screen.
   - Interactive purchase order creation must preserve the source item code so receiving the new PO reconciles into the warehouse stock row.
   - Duplicate manual purchase order create retries must be idempotent by PO name and must not inflate source counts or traceability rows.
   - Recurring purchase plans must display their source item lines and running a plan must create a persisted source PO row.
   - Duplicate manual recurring purchase plan create retries must be idempotent by plan id/name and must not inflate source counts or traceability rows.
   - Duplicate recurring purchase plan run retries must be idempotent by plan/date and must not create duplicate source purchase orders.
   - Recurring purchase plan runs must validate the generated purchase-order source payload and preserve supplier, item code, quantity, unit cost, and PO total.
   - Inactive recurring purchase plans cannot be run into source purchase orders.
   - Simulation gateway recurring purchase creation must reject unknown suppliers/items and non-positive quantities/rates before source recurring rows are created.
   - Recurring purchase replay helpers must enforce the same supplier/item/quantity/rate validation before creating source recurring rows.
   - Supplier creation must persist as a source supplier row and survive leaving/re-entering Purchases & Suppliers.
   - Simulation gateway supplier creation must reject empty supplier names before source supplier rows are created.
   - Supplier replay helpers must reject empty supplier names before source supplier rows are created.
   - Stock item creation must persist as a source product plus company warehouse stock row.
   - Simulation gateway stock item creation must reject empty names, unknown supplier references, and non-positive unit costs before source product/warehouse rows are created.
   - Stock-item replay helpers must enforce the same name/supplier/cost validation before creating product and warehouse rows.
   - Duplicate manual supplier and stock-item create retries must be idempotent by supplier name/product code and must not duplicate catalog, warehouse, or source-count rows.
   - Duplicate transfer, purchase order, supplier, recurring plan, and stock item create retries through the simulation gateway must return the original source identity and must not emit duplicate rows.
   - Manually created purchase orders, suppliers, recurring purchase plans, and stock items must update report-period source counts, not only visible table rows.
   - Interactive product catalog creation must persist as a source product row and survive refresh-backed Product & Recipes rendering.
   - Interactive recipe version creation must persist as a source recipe row, preserve ingredient item codes, quantities, units, and unit costs, and drive later sale consumption ledger rows.
   - Simulation gateway product catalog creation must reject empty names, non-positive sellable prices, and negative standard costs before source product rows are created.
   - Simulation gateway recipe version creation must reject unknown products, unknown ingredients, non-positive quantities, and missing units before source recipe rows are created.
   - Product catalog and recipe-version replay helpers must enforce the same validation before creating source product or recipe rows.
   - Kiosk stock changes from opening stock, completed inbound transfers, recipe consumption, finished-product sales, and recorded waste.
   - Interactive transfer receive must persist to the source transfer row and move stock from warehouse into the destination kiosk.
   - POS kiosk transfer confirmation must prove the admin transfer row changes to received and the stock move reconciles into both warehouse and destination kiosk stock.
   - Interactive transfer creation must persist as a source transfer row and survive leaving/re-entering the Stock & Allocation screen.
   - Simulation gateway transfer creation must reject unknown kiosks/items and non-positive quantities before source transfer rows are created.
   - Transfer replay helpers must enforce the same kiosk/item/quantity validation before creating source transfer rows.
   - Duplicate manual transfer create retries must be idempotent by transfer name and must not inflate source counts or traceability rows.
   - Partial transfer receipts must move only the received line quantities, remain partial, and allow a later receipt to complete the remaining quantity.
   - Duplicate partial transfer receipt retries must be idempotent by transfer/action/items/time and must not move warehouse or kiosk stock twice.
   - Partial transfer receipts that request more than available warehouse stock must record the shortage immediately, not hide it until final completion.
   - Transfer receipt actions with zero or non-matching quantities must be no-ops and cannot mutate a dispatched transfer into partial.
   - Partially received transfers cannot be cancelled into a misleading cancelled state after warehouse/kiosk stock has already moved.
   - Minute-by-minute stock deltas must reconcile to the source rows injected in that same minute; graph pulse bars cannot move ahead of the matching order rows.
   - Close stock variance quantities must carry deterministic accounting value from the stock item's unit cost.
   - No item goes negative.
   - Transfer receipt must cap moved quantity at source warehouse availability and record a shortage instead of creating negative warehouse stock or invented kiosk stock.
   - Transfer receipt cannot move stock until the transfer has reached the dispatched state.
   - Duplicate transfer receive retries must not move stock twice.
   - Transfer suggestions are derived from actual stock coverage, not random UI state.
   - Transfer suggestions and low-stock alert counts must recompute after simulated POS consumption, waste, and received transfers.
   - Transfer states advance deterministically by minute and completed transfers render as received/positive states.
   - Interactive transfer actions map API actions to canonical states: approve -> approved, pick -> picked, dispatch -> dispatched, receive -> received.
   - Draft/approved/picked/dispatched transfer rows must keep `doneQty`/`receivedQty` at zero; `qty` is only the requested quantity until receipt posts.
   - Completed transfer row `movedQty` must reconcile to the sum of received line quantities.
   - Simulation gateway transfer-action responses must return the actual source state for blocked actions, not the requested impossible state.
   - Simulation gateway transfer actions must reject unsupported action names before appending to the replay log, so invalid actions cannot create invented transfer states.
   - Simulation gateway receipt responses must return partial when purchase or transfer quantities remain open, not a premature received/done state.
   - Transfer action history must replay in order after simulated refresh; latest-action collapse cannot skip approve/pick/dispatch states.
   - Transfer action replay helpers must reject actions that reference missing transfer source rows before any stock or state mutation.
   - Transfer receipt replay must reject item lines outside the transfer request instead of silently ignoring bad received items.

4. Dashboard flow
   - Simulation mode is visibly distinct from demo/live.
   - The graph shows progressing minute-level demand, not a static final snapshot.
   - Simulation mode must render the minute/hour pulse bars for x2/x5/x10 progress; non-simulation dashboards may use the fiscal sales-flow chart.
   - Live activity, sales/POS, stock allocation, and daily close screens all read the same simulated source rows.
   - Every individual kiosk detail Sales tab must show late-minute source orders from the full 60-minute run; dashboard adapters must sort/filter the complete order set and must not globally truncate early rows before kiosk filtering.
   - Dashboard sparklines must tolerate source-backed empty or single-point trend arrays without emitting invalid SVG paths or browser console errors.
   - POS sale submission must create a simulated paid order, payment row, recipe ledger rows, and stock deduction before the Sales & POS dashboard or shift close can count it.
   - POS sale replay helpers must reject unbalanced line/payment totals before creating source orders, not only at the gateway boundary.
   - Waste & Loss reads the same simulated waste rows and its loss KPI reconciles to the P&L/export waste total.
   - POS waste submission must preserve the live stock item code, post through the simulation gateway, reduce simulated kiosk stock, and appear on the Waste & Loss dashboard with the updated loss total.
   - Simulation gateway waste submissions must reject unknown kiosks/items, non-positive quantities, over-available quantities, and costs that do not equal `qty * unit_cost` before source rows are created.
   - Waste replay helpers must enforce the same stock/cost validation before reducing simulated kiosk stock.
   - Duplicate manual waste retries must be idempotent by external id and must not double-reduce kiosk stock or double-count waste cost.
   - Duplicate manual waste retries through the simulation gateway must return the original posted state and must not emit a second waste row.
   - Staff reads simulated HR rows, coverage gaps, and accrued payroll instead of demo staff while simulation mode is active.
   - Simulation-mode Staff actions must use the source-of-truth gateway, not React-only local state, for staff, roster, coverage, payroll adjustment, operating expense, and payroll run updates.
   - POS close flow uses simulated orders for expected cash, independent of the developer's real wall-clock time.
   - POS close submission must persist into the simulated Daily Close dashboard with expected cash, counted cash, variance, stock counts, and pending manager-review state.
   - Simulation gateway close submissions must validate the kiosk exists, counted stock lines exist, and every `expected_qty` matches current source stock before creating a close row.
   - Shift-close replay helpers must enforce the same stale-stock and counted-cash validation before creating variance rows.
   - Manager approval/rejection of a simulated close must persist through the realtime bootstrap refresh path and not remain only a local React state patch.
   - Daily close review must prove a pending variance close can be manager-approved, changes to approved, and no longer exposes the approval action.
   - Daily close review actions must validate the close exists and duplicate approvals must return the original reviewed state without mutating accounting totals.
   - Simulation gateway close-review actions must reject unsupported decision names before appending to the replay log, so invalid decisions cannot poison future bootstrap rebuilds.
   - Close-review replay helpers must reject unknown close ids and replay review history sequentially so an approved close remains terminal even if later conflicting review rows appear.
   - Approved close reviews are terminal in simulation mode: a later reject/note retry must not reopen or mutate the locked approved close.
   - Manual simulated close submission must increment unresolved close/variance alert totals immediately.
   - Duplicate manual close submissions must be idempotent by close/session id and must not double-count closed kiosks, close rows, or unresolved variance alerts.
   - Duplicate close submissions through the simulation gateway must return the original close identity and expected/actual cash values.
   - Daily close review must recompute summary unresolved close/variance alert counts after approval or rejection, not only mutate the visible close row.
   - Simulation smoke must verify the dark theme state and capture a dark-mode dashboard screenshot.
   - The exported management report pack contains the same variance/profit and cash/digital payment numbers shown in Reports.
   - The exported management report pack must include non-zero traceability counts for transfers, purchase orders, suppliers, recurring purchase plans, product rows, warehouse stock rows, HR rows, payroll rows, and operating expense rows; the source-cite row and visible report source badge must name HR attendance/payroll adjustment/payroll run/expense rows when they affect reported profit.
   - AI Insights must visibly expose source chips for HR attendance, payroll adjustments, payroll runs, and operating expenses after those rows affect reported payroll and net profit.

5. Regression gates
   - `npm run simulation:audit` for the 60-minute default and 30-minute adjustable scenario.
   - `npm test`
   - `npm run build`
   - No simulation/dashboard release gate can be called green until the active Vite dashboard has been walked end to end across every nav section and major drill-down, with screenshots, dark-mode proof where relevant, console/page-error checks, and Studio Admin vs legacy/self-made component parity status recorded.
   - Browser smoke for simulation start, x2/x5/x10 speed progress, loop, final 60-minute state, all 10 kiosk-detail Sales tabs with minute-50+ orders, dark mode, final 30-minute state, stock transfers including POS kiosk receipt, and accounting tabs.
   - Browser smoke for Staff/Reports must create source-backed staff, confirmed shift, operating expense, duplicate expense retry proof, held cash-shortage deductions, held payroll review, manager-approved deduction, manager-rejected deduction with terminal decision controls hidden, duplicate adjustment retry proof, attendance, duplicate attendance retry proof, approved bonus adjustment, payroll run recompute, payroll approval, paid-state marking, and a blocked late paid-period adjustment, then screenshot the persisted Staff state and the Reports/P&L/payroll-export reconciliation.
   - Browser smoke for partial purchase receiving must prove a partial PO remains open before action and moves to received after the operator completes receiving.
