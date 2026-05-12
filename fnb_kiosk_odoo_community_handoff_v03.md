# AI-Powered F&B Kiosk Accounting & Operations System — Product + Engineering Handoff

**Version:** 0.3  
**Date:** 2026-05-10  
**Client context:** Coffee, juice, and cake kiosk business starting with ~10 kiosks, designed to scale to 20+ and eventually 100+ kiosks.  
**Commercial direction:** One-time implementation model. Avoid Odoo per-user subscription fees by using Odoo Community, self-hosted. Hosting/server infrastructure is separate and should remain a low yearly infrastructure cost, not a software subscription.

---

## 1. North Star

Build a **custom F&B kiosk operating system** for a multi-kiosk coffee, juice, and cake business.

This is **not** a generic ERP implementation.

This is a business-control system that helps the owner know, every day:

- What each kiosk sold.
- What ingredients each kiosk should have consumed.
- What stock should remain at each kiosk.
- What stock actually remains after counting.
- Where waste, loss, cash shortage, or unusual behavior happened.
- Which kiosks and products are profitable.
- What should be purchased or transferred tomorrow.

The system should feel like a specialized F&B control platform powered by a reliable open-source backend.

---

## 2. Technology Direction

### 2.1 Base platform

Use:

```text
Odoo Community Edition, self-hosted
```

Reason:

- No Odoo per-user subscription fees.
- Client dislikes monthly software costs.
- Odoo Community provides a proven ERP/POS/inventory/accounting foundation.
- We can customize and extend it with our own modules.
- Hosting, backups, support, and maintenance remain our responsibility.

### 2.2 Important rule

Do **not** sell or expose this as “standard Odoo.”

Position the solution as:

```text
Custom AI-powered F&B kiosk accounting and operations system
powered by Odoo Community as the backend foundation.
```

### 2.3 Core architectural decision

Use Odoo POS as the POS engine and customize it through custom Odoo modules.

Do **not** build a fully separate POS frontend in Phase 1 unless a technical spike proves Odoo POS cannot support the required workflow.

Reason:

- POS is operationally sensitive.
- Odoo POS already handles sessions, cashier flow, receipt logic, payments, offline-tolerant behavior, product loading, and integration with stock/POS records.
- Rebuilding POS from zero would create unnecessary risk.

### 2.4 Custom frontend/dashboard direction

For management dashboards, reports, and AI summaries, a custom dashboard can be built either:

1. Inside Odoo using custom menus, views, Owl components, and custom modules.
2. As a separate lightweight frontend connected to custom Odoo controllers/API endpoints.

For Phase 1, prefer the fastest reliable path. Avoid unnecessary frontend complexity.

---

## 3. Business Requirements Inventory

### 3.1 Business setup

The client operates small F&B kiosks selling:

- Coffee products.
- Juice products.
- Cakes or desserts.
- Possible add-ons, sizes, combos, and packaging items.

Initial scale:

```text
~10 kiosks
```

Future scale:

```text
20+ kiosks, eventually 100+ kiosks
```

The system must be designed from the beginning with multi-kiosk scaling in mind.

### 3.2 Main business problem

The client needs to control the full flow:

```text
Purchase raw materials
→ allocate raw materials to kiosks
→ sell products through POS
→ deduct recipe ingredients automatically
→ track expected remaining stock
→ count actual stock
→ identify variance, waste, loss, and profit
→ generate reports and AI recommendations
```

### 3.3 Exact physical operating reality

The client operates **stalls/kiosks in different places and potentially different cities**. The system must model physical movement of ingredients, not only financial records.

The real-world flow is:

```text
Suppliers
  ↓
Central Warehouse / Main Storage
  ↓
Optional City Warehouse / Regional Storage
  ↓
Individual Kiosk / Stall
  ↓
POS sales to customers
  ↓
Automatic recipe-based ingredient deduction from that exact kiosk's stock
  ↓
Daily closing, actual count, variance, waste/loss, replenishment plan
```

Each kiosk/stall is treated as a **mini stock location** with its own POS, staff, stock balance, sales, cash, waste, and daily close.

This is the core of the solution. The system is not only selling products; it is controlling the movement and consumption of ingredients across many physical stalls.

### 3.4 Geography and hierarchy model

The system must support a hierarchy like this:

```text
Company
  └── Country: Iraq
        ├── City: Baghdad
        │     ├── Area: Mall / Airport Road / University Area
        │     │     ├── Kiosk 001
        │     │     ├── Kiosk 002
        │     │     └── Kiosk 003
        │     └── Baghdad Warehouse
        ├── City: Basra
        │     ├── Kiosk 010
        │     └── Basra Warehouse
        └── City: Erbil
              ├── Kiosk 020
              └── Erbil Warehouse
```

Phase 1 may start with one city and ~10 kiosks, but the data model must not break when the business expands to multiple cities.

Required location fields for each kiosk/stall:

- Kiosk/stall code.
- Display name.
- City.
- Area/zone.
- Physical address or description.
- Assigned stock location.
- Assigned POS configuration.
- Assigned cashier(s).
- Assigned supervisor.
- Assigned city/area manager.
- Active/inactive status.
- Optional opening date.
- Optional GPS coordinates.

### 3.5 Stock ownership principle

Every ingredient unit must belong to one clear stock location at any point in time.

Examples:

```text
Orange stock can be in:
- Central Warehouse
- Baghdad Warehouse
- Kiosk 001
- Kiosk 002
- Waste/Loss adjustment location
- Supplier return location
```

The system must not treat inventory as one generic global balance. The owner must know:

```text
How much stock is in the main warehouse?
How much stock is in each city warehouse?
How much stock is inside each kiosk?
What was sent to each kiosk?
What was sold/consumed at each kiosk?
What should remain at each kiosk?
What is actually left at each kiosk?
```

### 3.6 Product measurement principle

Shop products are not vague items. They are **measured outputs** made from exact ingredients.

Example:

```text
Product: Orange Juice 350ml
Measured recipe:
- Orange: 0.35 kg
- Sugar: 0.01 kg
- Cup 350ml: 1 unit
- Lid: 1 unit
- Straw: 1 unit
```

When the POS sells one Orange Juice 350ml, the system must naturally reduce the stock of those ingredients from the **specific kiosk where the sale happened**.

This means the POS is not only a sales screen. It is the trigger for stock consumption.

Important:

- Packaging items are also ingredients/components.
- Different sizes require different recipe quantities.
- Add-ons must add extra ingredient consumption.
- Combos must consume all components of all included products.
- Historical recipe versions must be preserved.
- Cost and margin reports must use the recipe/cost at the time of sale.

### 3.7 Central production vs kiosk preparation

Some products are made/prepared at the kiosk. Some may be prepared centrally.

Use different stock logic depending on product type:

#### Type A — Made at kiosk on demand

Examples:

```text
Juice, coffee, cappuccino, mixed drinks
```

POS sale should consume raw ingredients from the kiosk stock location.

#### Type B — Prepared centrally and sent as finished goods

Examples:

```text
Cake slice, packaged cake box, pre-made dessert
```

Central production can convert raw materials into finished goods. Then finished goods are transferred to kiosks. POS sale consumes finished goods from kiosk stock, not raw cake ingredients.

#### Type C — Hybrid product

Example:

```text
Cake slice + coffee combo
```

The sale consumes:

```text
Cake slice finished item
+ coffee recipe ingredients
+ packaging if applicable
```

The system must support all three types without forcing one model for every product.

### 3.8 Key product truth

For this project, the most important product truth is:

```text
Every sale at a stall must explain what stock decreased at that exact stall.
```

If the system cannot answer this, it has failed the main client requirement.

### 3.9 Non-negotiable workflow invariants for coding agents

Coding agents must preserve these workflow truths:

1. Every kiosk/stall has its own stock location.
2. Every POS session belongs to exactly one kiosk/stall.
3. Every kiosk/stall belongs to a city/area/site.
4. Every sellable product can have a measured recipe.
5. Recipe components include both ingredients and packaging.
6. Every POS sale must resolve the active recipe version at the time of sale.
7. Ingredient consumption must be recorded from the selling kiosk/stall stock location, not from a generic warehouse.
8. Expected stock must update after sales, waste/loss, and transfers.
9. Actual stock is entered through physical counting during daily/shift closing.
10. Variance is the difference between expected stock and actual counted stock.
11. Variance must be stored, investigated, and reported.
12. AI can explain and recommend, but deterministic system logic calculates stock, cash, cost, and variance.

If a feature breaks any of these rules, it is not aligned with the client use case.

### 3.10 Stock deduction policy

The system must define how strict stock control should be at the kiosk POS.

Policy options:

```text
Strict mode:
The POS blocks selling a product if the kiosk does not have enough recipe ingredients.

Warning mode:
The POS warns staff/manager but allows selling with supervisor permission.

Soft mode:
The POS allows selling and creates a negative stock/shortage alert.
```

Recommended Phase 1 setting:

```text
Warning mode for launch, with supervisor override.
Strict mode can be enabled later once recipes, stock counts, and operations are stable.
```

Reason:

At launch, recipes, physical counts, and staff behavior may still be stabilizing. Strict blocking too early can disrupt sales. The system should still record the shortage/variance clearly.

### 3.11 City and kiosk reporting levels

Reports must support these levels:

```text
Business-wide report
City report
Area/site report
Kiosk/stall report
POS session report
Cashier report
Product report
Ingredient report
```

Example questions the system must answer:

- Which city sells the most juice?
- Which kiosk has the highest profit?
- Which kiosk has the most orange variance?
- Which area has the highest waste?
- Which cashier had a cash shortage?
- Which ingredient needs replenishment in Baghdad tomorrow?
- Which kiosk should receive more cups today?
- Which product has the best margin after ingredient cost changes?

---

## 4. Users and Roles

### 4.1 Owner / General Manager

Needs:

- High-level dashboard.
- Sales and profit by kiosk.
- Cash flow visibility.
- Inventory and purchasing overview.
- Waste/loss visibility.
- AI summaries and recommendations.
- Forecasting and business trends.

Should not be forced to use complex ERP screens.

### 4.2 Accountant / Finance User

Needs:

- Sales reports.
- Purchase records.
- Supplier costs.
- Salary/expense records.
- Profit and loss reporting.
- Cash tracking.
- Journal/accounting review.
- Exportable reports.

May use deeper Odoo admin/accounting screens.

### 4.3 Warehouse / Inventory Manager

Needs:

- Raw material inventory.
- Supplier receiving.
- Stock transfers from central warehouse to kiosks.
- Stock adjustment and reconciliation.
- Low-stock alerts.
- Purchase needs.

### 4.4 Operations Manager / Supervisor

Needs:

- Kiosk-by-kiosk performance.
- Daily closing status.
- Waste/loss alerts.
- Staff/cashier accountability.
- Ability to approve stock transfers, adjustments, voids, and losses.

### 4.5 Cashier / Kiosk Staff

Needs a very simple POS panel:

- Open shift.
- Sell products quickly.
- Accept payment.
- Print/generate receipt.
- Record waste/loss with simple reason.
- View limited stock warnings.
- Close shift.
- Enter actual stock count if required.

Cashiers must not see advanced ERP/accounting settings.

---

## 5. Core Product Philosophy

### 5.1 Admin/owner side

The admin dashboard is the **brain of the business**.

It should help management think clearly.

Priorities:

- Control.
- Accuracy.
- Simplicity.
- Financial confidence.
- Kiosk-level visibility.
- Fast understanding of problems.
- No clutter.

### 5.2 POS/kiosk side

The POS is the **hands of the business**.

It should help staff act quickly and avoid mistakes.

Priorities:

- Fast selling.
- Low cognitive load.
- Minimal screens.
- Clear next action.
- No unnecessary ERP complexity.
- Arabic/English readiness.
- Strong role boundaries.

---

## 6. Main System Modules

## 6.1 Odoo Base Configuration Module

Purpose:

Configure Odoo Community as the operational base.

Includes:

- Company setup.
- Users and roles.
- Product categories.
- Units of measure.
- Basic accounting/invoicing configuration.
- Inventory locations.
- POS configuration.
- Purchase configuration.
- Tax/account setup as confirmed by client accountant.

Notes:

- Iraqi tax rules are assumed simple for this client, but the accountant must validate chart of accounts and invoice/reporting expectations.
- Do not rely on Enterprise-only features unless explicitly approved.

---

## 6.2 Kiosk Management Module

Purpose:

Represent each physical kiosk as an operational unit.

Each kiosk should have:

- Name/code.
- City/region.
- Area/site/place.
- Location/address.
- Assigned warehouse or stock location.
- Assigned POS configuration.
- Assigned cashier/staff.
- Assigned supervisor.
- Optional route/supply schedule.
- Cost/profit tracking reference.
- Opening/closing status.
- Current stock status.
- Low-stock status.
- Last stock transfer date.
- Last daily close date.

Example:

```text
Kiosk 001 - Baghdad Mall - Baghdad
Kiosk 002 - Airport Road - Baghdad
Kiosk 003 - University Area - Baghdad
Kiosk 010 - Basra Corniche - Basra
Kiosk 020 - Erbil Mall - Erbil
```

Required features:

- Create/edit kiosks.
- Activate/deactivate kiosk.
- Assign users to kiosk.
- Restrict cashier to own kiosk.
- View kiosk status.
- View stock at kiosk.
- View daily sales and variance.

---

## 6.3 Product + Ingredient Module

Purpose:

Separate sellable products from raw materials/ingredients.

### Raw materials / ingredients

Examples:

- Orange.
- Apple.
- Coffee beans.
- Milk.
- Sugar.
- Ice.
- Water.
- Cake base.
- Cup.
- Lid.
- Straw.
- Napkin.
- Packaging box.

Each ingredient needs:

- Unit of measure.
- Purchase cost.
- Supplier.
- Stock tracking enabled.
- Minimum stock threshold.
- Optional wastage allowance.

### Sellable products

Examples:

- Orange Juice 350ml.
- Mixed Juice 500ml.
- Espresso.
- Cappuccino.
- Cake Slice.
- Cake Box.

Each sellable product needs:

- Sale price.
- Category.
- POS visibility.
- Recipe link.
- Cost calculation.
- Margin calculation.
- Active/inactive status.

---

## 6.4 Recipe Engine Module

Purpose:

Define exactly which ingredients are consumed when a product is sold.

Example recipe:

```text
Product: Orange Juice 350ml
Ingredients:
- Orange: 0.35 kg
- Sugar: 0.01 kg
- Cup: 1 unit
- Straw: 1 unit
- Lid: 1 unit
```

Required features:

- Create recipes per product.
- Support multiple sizes.
- Support add-ons.
- Support packaging as recipe components.
- Support recipe versioning.
- Support effective dates.
- Support active/inactive recipe versions.
- Store cost snapshot for reporting.

Critical rule:

```text
Historical reports must use the recipe and cost assumptions valid at the time of sale.
```

Do not let future recipe edits corrupt past reporting.

---

## 6.5 Kiosk/Stall Stock Allocation Module

Purpose:

Control how raw materials and packaging move from warehouses to each physical kiosk/stall.

This module is critical because every stall operates in a different place and may belong to a different city/area. The system must always know which stock belongs to which stall.

Supported movement structures:

```text
Simple Phase 1:
Main Warehouse → Kiosk/Stall Stock Location

Scaled multi-city:
Main Warehouse → City/Regional Warehouse → Kiosk/Stall Stock Location

Optional direct delivery:
Supplier → Warehouse OR Supplier → Kiosk/Stall, if approved
```

Required features:

- Create stock allocation/transfer to a kiosk/stall.
- Select source warehouse: central warehouse, city warehouse, or approved source.
- Select destination kiosk/stall.
- Track requested quantity.
- Track approved quantity.
- Track shipped quantity.
- Track received quantity.
- Record transfer difference/damage if shipped quantity differs from received quantity.
- Approve stock allocation if required.
- View current stock per kiosk/stall.
- View current stock per city/area.
- View low stock per kiosk/stall.
- View low stock per warehouse.
- View stock transfer history.
- Prevent a kiosk/stall from consuming another kiosk's stock.
- Support replenishment recommendations later.

Example allocation:

```text
Source: Baghdad Main Warehouse
Destination: BG-001 - Baghdad Mall - Juice Stand

Allocated stock:
- Oranges: 40 kg
- Sugar: 5 kg
- Milk: 30 liters
- Cups 350ml: 1,000 units
- Lids: 1,000 units
- Straws: 1,000 units
- Coffee beans: 8 kg
```

Operational rule:

```text
Stock is not considered available at the kiosk/stall until it is received or confirmed according to the selected workflow.
```

---

## 6.6 POS Customization Module

Purpose:

Customize Odoo POS for kiosk staff while preserving the Odoo POS engine.

Required POS features:

- Open shift/session.
- Product selection.
- Fast checkout.
- Cash payment.
- Optional card/payment method support.
- Receipt output.
- Refund/void with permission.
- Kiosk-specific stock context.
- Low-stock warning based on recipe components, not only finished products.
- Arabic/English labels.
- End-of-day close.

Important POS clarification:

```text
Odoo POS can track POS orders and product stock movement.
For this business, that is not enough by itself.
A sale must also consume the raw ingredients and packaging defined in the product recipe from the selling kiosk/stall stock location.
This requires the custom recipe/consumption module.
```

UI rule:

Cashier must see only what is needed to perform the job.

Avoid:

- Generic ERP menus.
- Accounting terms.
- Complex stock screens.
- Unnecessary reports.
- Settings access.

---

## 6.7 Ingredient Consumption Ledger Module

Purpose:

Record expected ingredient usage generated from POS sales.

This is the heart of the project.

Every POS sale should generate consumption records.

Example:

```text
Sale: 10x Orange Juice 350ml at Kiosk 001

Expected ingredient consumption:
- Orange: 3.5 kg
- Sugar: 0.1 kg
- Cups: 10 units
- Straws: 10 units
- Lids: 10 units
```

Required fields:

- POS order reference.
- Kiosk reference.
- Product sold.
- Quantity sold.
- Recipe version used.
- Ingredient consumed.
- Ingredient quantity.
- Unit of measure.
- Cost at time of consumption.
- Timestamp.
- Cashier/user.

Critical rules:

1. Consumption calculation must happen server-side.
2. AI must not calculate official stock/accounting values.
3. Frontend display can show expected stock, but backend ledger is source of truth.
4. Do not allow silent failure of consumption records.

---

## 6.8 Waste / Loss / Spoilage Module

Purpose:

Track non-sale stock reductions.

Waste/loss categories:

- Spoiled fruit.
- Expired ingredients.
- Broken cups/packaging.
- Wrong order.
- Staff meal.
- Free sample.
- Damaged item.
- Missing stock.
- Manual correction.
- Theft/suspected loss.

Required features:

- Simple waste entry by kiosk.
- Reason selection.
- Quantity and item.
- Optional photo/attachment.
- Supervisor approval for sensitive losses.
- Report by kiosk, item, reason, date, staff member.

---

## 6.9 Daily Closing Module

Purpose:

Close the operational day/shift and compare expected vs actual results.

Required closing flow:

```text
1. Cashier closes POS session.
2. Cashier/supervisor enters cash count.
3. Cashier/supervisor enters actual stock count for selected ingredients.
4. System calculates expected closing stock.
5. System compares expected vs actual.
6. System shows variances.
7. Supervisor approves closing or flags issue.
```

Formula:

```text
Opening stock
+ stock received
- recipe consumption from sales
- recorded waste/loss
- transfers out
= expected closing stock
```

Then:

```text
Actual counted stock - expected closing stock = variance
```

Required outputs:

- Cash variance.
- Stock variance.
- Waste/loss summary.
- Sales summary.
- Gross profit estimate.
- Items needing investigation.

---

## 6.10 Reporting Module

Purpose:

Give the owner and managers clear daily, weekly, monthly, and yearly visibility.

Required reports:

### Daily reports

- Total sales.
- Sales by kiosk.
- Sales by product.
- Cash collected.
- Payment method split.
- Raw materials consumed.
- Waste/loss.
- Expected vs actual stock variance.
- Gross margin.
- Best/worst kiosk.

### Weekly reports

- Kiosk comparison.
- Product trend.
- Ingredient consumption trend.
- Supplier cost trend.
- Waste trend.
- Staff/cashier performance.

### Monthly reports

- Profit and loss summary.
- Purchases and supplier costs.
- Salaries/employee expenses.
- Stock movement.
- Waste/loss by category.
- Kiosk profitability.
- Product margin.

### Yearly reports

- Annual sales.
- Annual profit.
- Kiosk growth.
- Supplier spend.
- Product category performance.
- Expansion insights.

---

## 6.11 AI Reporting + Forecasting Module

Purpose:

Use AI as a decision-support layer on top of verified system reports.

AI must never be the source of official accounting or stock calculations.

AI should read deterministic reports and generate:

- Daily management summaries.
- Unusual loss alerts.
- Purchasing recommendations.
- Inventory forecasts.
- Sales trend summaries.
- Product margin insights.
- Kiosk performance explanations.

Example AI output:

```text
Kiosk 003 had 14% higher orange consumption than expected compared to sales.
This equals approximately 11 orange juice units.
Check waste entries, free drinks, unrecorded sales, or recipe compliance.
```

AI capabilities:

- Predict inventory needs.
- Detect unusual spending/losses.
- Forecast sales trends.
- Recommend stock transfers.
- Summarize financial reports.
- Explain why profit changed.

AI constraints:

- Do not invent numbers.
- Do not modify financial records.
- Do not approve transactions.
- Do not replace accountant review.
- Only summarize and recommend based on system data.

---

## 6.12 Salary / Employee Expense Module

Purpose:

Track staff costs and employee payments at a practical level for Phase 1.

Phase 1 features:

- Employee list.
- Kiosk assignment.
- Salary amount.
- Payment status.
- Salary expense report.
- Optional advances/deductions.

Phase 2 features:

- Attendance.
- Shift scheduling.
- Payroll automation.
- Bonus/penalty rules.
- Integration with HR/payroll if required.

---

## 6.13 Supplier + Purchase Cost Module

Purpose:

Track raw material purchases and supplier costs.

Required features:

- Supplier list.
- Purchase order/invoice.
- Item quantities.
- Purchase price.
- Delivery date.
- Payment status.
- Supplier cost history.
- Product cost recalculation based on ingredient price.

Important:

Product margin must update when ingredient costs change.

---

## 7. Odoo Model Mapping

This is an initial mapping. Coding agents must validate against the selected Odoo Community version before implementation.

| Business Concept | Odoo Base Model / Custom Model Direction |
|---|---|
| Sellable product | `product.product` / `product.template` |
| Raw material / ingredient | `product.product` / `product.template` with stock tracking |
| City / Region | Custom model or location/grouping field depending implementation |
| Area / Site / Place | Custom model linked to city/region |
| Kiosk | Custom model, linked to city/site, stock location and POS config |
| Central warehouse | `stock.location` / warehouse configuration |
| Kiosk stock location | `stock.location` |
| POS session | `pos.session` |
| POS order | `pos.order` |
| Supplier | `res.partner` with supplier flag/context |
| Purchase | `purchase.order` / vendor bill as configured |
| Stock transfer | `stock.picking` / `stock.move` |
| Recipe | Custom model |
| Recipe version | Custom model |
| Recipe ingredient line | Custom model |
| Consumption ledger | Custom model |
| Waste/loss entry | Custom model + stock adjustment/stock move |
| Daily closing | Custom model linked to POS session/kiosk |
| AI insight/report | Custom model or generated report table |
| User/staff | `res.users`, optionally employee model if installed |

---

## 8. Required Custom Models

Suggested custom models:

```text
fnb.city
fnb.site
fnb.kiosk
fnb.recipe
fnb.recipe.version
fnb.recipe.line
fnb.kiosk.allocation
fnb.consumption.ledger
fnb.waste.entry
fnb.daily.close
fnb.stock.variance
fnb.cash.variance
fnb.ai.report
fnb.ai.alert
fnb.supplier.price.snapshot
```

Do not finalize names until Odoo module conventions are validated.

---

## 9. Key Workflows



## 9.0 Full End-User Operating Workflow — Do Not Drift

This section describes the exact real-world workflow the end users must follow. Coding agents must implement around this flow and avoid inventing unrelated ERP behavior.

### 9.0.1 Master setup by admin

Before operations start, admin configures:

```text
Cities / regions
Warehouses
Kiosks / stalls
Users and roles
Ingredients / raw materials
Packaging items
Sellable products
Recipes and recipe versions
POS configurations per kiosk
Payment methods
Waste/loss reasons
Stock count templates
Reports and dashboards
```

Each kiosk must be linked to:

```text
One POS configuration
One stock location
One city/area
One or more cashiers
One supervisor/manager
```

### 9.0.2 Supplier purchase and central receiving

Real-world actor:

```text
Warehouse manager / purchasing user
```

Workflow:

```text
1. Business buys ingredients from supplier.
2. Warehouse receives physical goods.
3. User records purchase/receipt in the system.
4. Stock increases in the central warehouse or city warehouse.
5. Purchase price is recorded.
6. Ingredient cost history is updated.
7. Product cost/margin can be recalculated from updated ingredient costs.
```

Example:

```text
Supplier delivers:
- Oranges: 500 kg at $1.10/kg
- Sugar: 100 kg at $0.70/kg
- Cups 350ml: 20,000 units at $0.03/unit
```

System result:

```text
Central Warehouse stock increases.
Supplier cost is recorded.
Future product margin calculations know the latest cost.
```

### 9.0.3 City or regional warehouse distribution

If the business operates in multiple cities, stock may move like this:

```text
Central Warehouse → Baghdad Warehouse → Kiosk 001
Central Warehouse → Basra Warehouse → Kiosk 010
Central Warehouse → Erbil Warehouse → Kiosk 020
```

If Phase 1 operates only in one city, the system can use:

```text
Central Warehouse → Kiosk 001
Central Warehouse → Kiosk 002
```

The system must support both models.

Required behavior:

- Every transfer must have source location and destination location.
- Every transfer must have item, quantity, date, and responsible user.
- Optional: driver/delivery person.
- Optional: transfer status: draft, prepared, dispatched, received, cancelled.
- Kiosk stock should not increase until transfer is confirmed/received, unless the business chooses auto-confirm.

### 9.0.4 Kiosk/stall daily allocation

Real-world actor:

```text
Warehouse manager / area supervisor
```

Purpose:

Send the right ingredients and packaging to each stall before or during the operating day.

Example allocation:

```text
Kiosk 001 - Baghdad Mall receives:
- Oranges: 40 kg
- Sugar: 5 kg
- Coffee beans: 8 kg
- Milk: 20 liters
- Cups 350ml: 1,000 units
- Lids: 1,000 units
- Straws: 1,000 units
- Cake slices: 80 units
```

System result:

```text
Source warehouse stock decreases.
Kiosk 001 stock increases.
Kiosk 001 now has an opening stock balance for the day/shift.
```

Critical rule:

```text
Kiosk allocation is not an expense by itself. It is an internal stock movement.
```

The expense/cost is recognized through consumption, sale, waste, loss, spoilage, or accounting rules configured with the accountant.

### 9.0.5 Kiosk opening shift

Real-world actor:

```text
Cashier / kiosk staff
```

Workflow:

```text
1. Cashier logs into POS.
2. System identifies assigned kiosk.
3. Cashier opens POS session/shift.
4. Cashier confirms opening cash amount.
5. Optional: cashier confirms opening stock for important items.
6. POS loads products available for that kiosk.
7. POS is ready for sales.
```

The cashier should not choose a random warehouse or branch. The system must know the kiosk from the user's assignment/POS configuration.

### 9.0.6 POS sale with recipe-based stock deduction

Real-world actor:

```text
Cashier
```

Workflow:

```text
1. Customer orders product.
2. Cashier selects product on POS.
3. Customer pays.
4. POS order is validated.
5. System identifies the kiosk stock location.
6. System reads the active recipe version for each sold product.
7. System creates consumption ledger records.
8. System reduces expected stock for that kiosk.
9. System records sale, payment, cashier, time, kiosk, and product.
```

Example sale:

```text
Kiosk 001 sells:
- 3x Orange Juice 350ml
- 2x Cappuccino
```

Recipe consumption:

```text
3x Orange Juice 350ml consumes:
- Orange: 1.05 kg
- Sugar: 0.03 kg
- Cup 350ml: 3 units
- Lid: 3 units
- Straw: 3 units

2x Cappuccino consumes:
- Coffee beans: 0.036 kg
- Milk: 0.36 liter
- Cup 350ml: 2 units
```

System result:

```text
Kiosk 001 expected stock decreases by exactly those quantities.
Sales and payment are recorded against Kiosk 001.
Product margin can be calculated from ingredient costs.
```

Critical rule:

```text
The sale must always be connected to a kiosk. Ingredient deduction must happen from that kiosk, not from a generic warehouse.
```

### 9.0.7 Add-ons, sizes, variants, and combos

The POS must support product variations without breaking ingredient logic.

Examples:

```text
Orange Juice 350ml
Orange Juice 500ml
Cappuccino small
Cappuccino large
Extra milk
Extra sugar
Coffee + cake combo
```

Required behavior:

```text
Different size = different recipe quantity.
Add-on = additional recipe component.
Combo = sum of recipes/components of included items.
Discount = affects revenue, not ingredient consumption.
Refund/void = must reverse or adjust sale and consumption according to approved rules.
```

### 9.0.8 Stock warning during sales

The system should warn the cashier/supervisor when a kiosk is low on ingredients.

Example:

```text
Kiosk 001 has only 2 kg oranges left.
Orange Juice requires 0.35 kg orange.
System estimates only 5 orange juices can still be sold.
```

Policy options to decide with client:

```text
Warning only: allow sale but warn cashier.
Hard block: prevent sale when expected stock is insufficient.
Supervisor override: allow sale only with manager approval.
```

For Phase 1, define one default policy and document it.

### 9.0.9 Waste, loss, spoilage, and free items during the day

Real-world actor:

```text
Cashier or supervisor
```

Workflow:

```text
1. User selects waste/loss entry.
2. User chooses kiosk.
3. User chooses ingredient/product.
4. User enters quantity.
5. User selects reason.
6. Optional: upload photo/comment.
7. System records stock reduction or variance reason.
8. Supervisor approval is required for sensitive/high-value entries.
```

Examples:

```text
2 kg oranges spoiled.
20 cups damaged.
1 cake slice used as free sample.
0.5 kg coffee beans spilled.
```

Waste/loss must reduce expected stock separately from sales consumption.

### 9.0.10 Inter-kiosk transfer

Sometimes one kiosk may run out and another kiosk nearby has extra stock.

Workflow:

```text
1. Supervisor creates transfer request.
2. Source kiosk and destination kiosk are selected.
3. Items and quantities are selected.
4. Source kiosk confirms handover.
5. Destination kiosk confirms receipt.
6. Stock decreases at source kiosk and increases at destination kiosk.
```

Example:

```text
Kiosk 002 transfers 5 kg oranges to Kiosk 003.
```

This must be tracked clearly. Otherwise, one kiosk will show missing stock and another will show unexplained extra stock.

### 9.0.11 Daily or shift closing

Real-world actors:

```text
Cashier + supervisor
```

Workflow:

```text
1. Cashier ends shift/POS session.
2. System shows sales total and payment totals.
3. Cashier enters counted cash.
4. Cashier/supervisor enters actual stock count for selected countable items.
5. System calculates expected stock.
6. System compares expected stock vs actual stock.
7. System shows cash variance and stock variance.
8. Cashier adds explanations if required.
9. Supervisor approves or flags the close.
10. Daily close report is generated.
```

Formula:

```text
Expected closing stock per kiosk/item =
Opening stock
+ transfers received
- transfers sent out
- recipe consumption from POS sales
- recorded waste/loss/spoilage
- manual approved adjustments
```

Variance:

```text
Stock variance = actual counted stock - expected closing stock
Cash variance = actual counted cash - expected cash from POS
```

Example:

```text
Kiosk 001 expected oranges: 12.40 kg
Kiosk 001 counted oranges: 11.70 kg
Variance: -0.70 kg
Approximate equivalent: 2 orange juices
```

The system must make this understandable for managers.

### 9.0.12 Manager review after closing

Real-world actor:

```text
Owner / operations manager / area supervisor
```

After kiosks close, manager reviews:

```text
Which kiosks closed?
Which kiosks are still open/unclosed?
Which kiosks had cash variance?
Which kiosks had stock variance?
Which products sold best?
Which ingredients are low?
Which waste entries need approval?
Which kiosk needs replenishment tomorrow?
```

The dashboard should group by:

```text
All kiosks
City
Area
Supervisor
Individual kiosk
```

### 9.0.13 Replenishment planning for next day

The system should convert sales, remaining stock, and forecasts into transfer recommendations.

Example:

```text
Kiosk 001 has 11.70 kg oranges left.
Forecast for tomorrow: 80 orange juices.
Required oranges: 80 × 0.35 kg = 28 kg.
Recommended transfer: 28 kg - 11.70 kg + safety stock.
```

AI can help explain/recommend, but deterministic calculations must exist first.

Output:

```text
Recommended transfers by kiosk:
- Kiosk 001: send 20 kg oranges, 500 cups, 500 straws
- Kiosk 002: send 12 kg oranges, 300 cups, 300 straws
- Kiosk 003: no orange transfer needed
```

### 9.0.14 Owner daily summary

The owner should receive a daily business summary after closing.

Must include:

```text
Total sales
Sales by city
Sales by kiosk
Cash collected
Top products
Ingredient consumption
Waste/loss
Stock variances
Cash variances
Gross profit estimate
Recommended purchases/transfers
AI explanation of unusual events
```

Example AI-supported summary:

```text
Today Baghdad kiosks generated $4,850 in sales. Kiosk 003 had the highest sales, while Kiosk 006 had an unusual orange variance of -3.2 kg, equal to approximately 9 orange juices. Review waste entries or possible unrecorded sales. Tomorrow, the system recommends sending 45 kg oranges and 2,000 cups to the Baghdad kiosks based on forecasted demand.
```

### 9.0.15 End-to-end example scenario

```text
1. Supplier delivers 500 kg oranges to Central Warehouse.
2. Warehouse manager records receipt at $1.10/kg.
3. Operations manager transfers 40 kg oranges to BG-001 - Baghdad Mall.
4. Cashier opens POS session at BG-001.
5. BG-001 sells 60 orange juices.
6. Recipe requires 0.35 kg orange per juice.
7. System records expected orange consumption: 21 kg.
8. Kiosk 001 also records 1.5 kg spoiled oranges.
9. Expected remaining orange stock:
   40 kg - 21 kg - 1.5 kg = 17.5 kg
10. At close, cashier counts 16.8 kg oranges at BG-001.
11. Variance is -0.7 kg at that kiosk/stall.
12. Manager sees this equals about 2 orange juices.
13. Dashboard flags the variance.
14. Replenishment report recommends how much orange stock to send tomorrow.
```

This is the exact business loop the system must prove.

### 9.0.16 Non-negotiable workflow rules

1. A kiosk/stall must always have its own stock location.
2. A POS order must always belong to one kiosk/stall.
3. A sellable product must either have a recipe, be a finished stock item, or be explicitly marked as non-stock/service.
4. Ingredient deduction must happen from the selling kiosk/stall.
5. Product cost must be derived from ingredient quantities and cost snapshots.
6. Stock allocation to kiosks must be traceable.
7. Waste/loss must be recorded separately from sales.
8. Daily close must compare expected vs actual stock.
9. City/area grouping must exist so multi-city expansion does not require a redesign.
10. AI must summarize and recommend; it must not be the source of inventory/accounting truth.

---

## 9.1 Initial setup workflow

```text
Admin creates company
Admin creates users and roles
Admin creates kiosks
Admin creates stock locations for kiosks
Admin creates raw materials
Admin creates sellable products
Admin creates recipes
Admin configures POS per kiosk
Admin configures payment methods
Admin configures reports/dashboard
```

---

## 9.2 Purchase workflow

```text
Warehouse/admin creates supplier purchase
System records raw material quantity and cost
Stock increases in central warehouse
Supplier balance/payment status is tracked
Ingredient cost history is updated
Product cost/margin can be recalculated
```

---

## 9.3 Kiosk/stall allocation workflow

This workflow is how each stall receives the ingredients it will sell from.

```text
1. Warehouse manager selects source location.
   Example: Main Warehouse, Baghdad City Warehouse, Basra City Warehouse.

2. Warehouse manager selects destination kiosk/stall.
   Example: BG-001 - Baghdad Mall.

3. System shows current source stock and recent kiosk consumption.

4. Manager selects ingredients/packaging and quantities.
   Example: oranges, sugar, milk, cups, lids, straws.

5. Transfer request is created.

6. Optional supervisor approval is completed.

7. Warehouse ships stock.

8. Kiosk/stall receives stock and confirms received quantities.

9. System updates kiosk/stall stock balance.

10. Any delivery difference is recorded.
```

Example:

```text
Source: Baghdad Main Warehouse
Destination: BG-001 - Baghdad Mall - Juice Stand

Transfer:
- Oranges: 40 kg
- Sugar: 5 kg
- Milk: 30 liters
- Coffee beans: 8 kg
- Cups 350ml: 1,000 units
- Lids: 1,000 units
- Straws: 1,000 units
```

Rules:

- A kiosk/stall can only sell against its assigned stock location.
- Stock in transit is not available until received.
- Every transfer must be traceable by user, date, source, destination, item, quantity, and status.
- The model must support multiple cities and multiple warehouses from day one.
- Inter-kiosk transfers should require approval if allowed.

---

## 9.4 POS sale workflow with recipe stock tracking

This workflow is the core of the product.

```text
1. Cashier opens POS session for assigned kiosk/stall.

2. Cashier selects a sellable product.
   Example: Orange Juice 350ml.

3. Cashier takes payment and validates the POS order.

4. System identifies:
   - city/area/site
   - kiosk/stall
   - POS session
   - cashier
   - product sold
   - quantity sold
   - kiosk/stall stock location

5. System loads the active recipe version at the sale timestamp.

6. System multiplies recipe lines by quantity sold.

7. System creates consumption ledger entries.

8. System deducts or records component consumption from the kiosk/stall stock location.

9. System updates expected remaining stock.

10. System records sale, cash/payment data, cost, margin, and reporting dimensions.
```

Example:

```text
Sale at BG-001 - Baghdad Mall:
Product sold: 3x Orange Juice 350ml

Recipe per unit:
- Orange: 0.35 kg
- Sugar: 0.01 kg
- Cup 350ml: 1 unit
- Lid: 1 unit
- Straw: 1 unit

Generated consumption:
- Orange: 1.05 kg
- Sugar: 0.03 kg
- Cup 350ml: 3 units
- Lid: 3 units
- Straw: 3 units
```

Important clarification:

```text
The cashier sells the finished product only.
The system automatically consumes the measured ingredients and packaging.
Odoo POS alone should not be assumed to handle this exact F&B recipe logic without the custom module.
```

Failure condition:

```text
If a POS sale is completed but recipe consumption is not generated, the system must flag the sale for repair/reconciliation. Silent failure is not allowed.
```

---

## 9.5 Waste/loss workflow

```text
Cashier or supervisor selects kiosk
Selects item and quantity
Selects waste/loss reason
Submits entry
System records waste/loss
System updates expected stock
Supervisor approval may be required for sensitive reasons
```

---

## 9.6 Daily closing workflow

```text
Cashier closes shift
Cash count is entered
Actual selected stock counts are entered
System calculates expected stock
System compares expected vs actual
System reports variance
Supervisor approves or flags issue
Daily report is generated
AI summary is generated after close
```

---

## 10. Dashboard Requirements

## 10.1 Owner dashboard

Must show:

- Today’s sales.
- Net/gross profit estimate.
- Cash collected.
- Open/closed kiosks.
- Kiosk ranking.
- Product ranking.
- Waste/loss alerts.
- Stock shortage alerts.
- Supplier cost alerts.
- AI summary.

Should answer quickly:

- Which kiosk is doing best?
- Which kiosk has a problem?
- What should we buy tomorrow?
- Where are we losing money?
- Which products have the best margin?

---

## 10.2 Operations dashboard

Must show:

- Kiosk status.
- Stock allocation status.
- Daily close status.
- Waste/loss entries.
- Unapproved variances.
- Low-stock items.
- Staff/cashier activity.

---

## 10.3 Finance/accounting dashboard

Must show:

- Sales totals.
- Purchase totals.
- Supplier balances.
- Salary expenses.
- Cash movement.
- Profit/loss summary.
- Cost of goods sold estimate.
- Exportable reports.

---

## 11. POS Panel Requirements

The POS panel should support:

- Fast product selection.
- Clear cart/order view.
- Cash payment.
- Optional card/payment method.
- Receipt.
- Refund/void with permission.
- Kiosk stock warning.
- Simple waste entry.
- Shift open/close.
- Simple actual stock count at close if required.

Design principles:

- Minimal.
- Focused.
- Staff-friendly.
- Arabic/English-ready.
- No advanced admin access.
- No unnecessary options.

---

## 12. Reporting Logic Requirements

### 12.1 Product cost

```text
Product cost = sum(recipe ingredient quantity × current or historical ingredient cost)
```

Need both:

- Current cost estimate.
- Historical cost at time of sale/consumption.

### 12.2 Gross margin

```text
Gross margin = sale price - recipe-based product cost
```

### 12.3 Kiosk profit estimate

```text
Kiosk profit estimate = kiosk sales - ingredient cost - waste/loss cost - allocated expenses/salaries if configured
```

### 12.4 Expected stock

```text
Expected stock = opening stock + received stock - sold recipe consumption - waste/loss - transfers out
```

### 12.5 Variance

```text
Variance = actual counted stock - expected stock
```

---

## 13. MVP Scope — Phase 1

Phase 1 is for the first ~10 kiosks.

Included:

- Odoo Community setup.
- Self-hosted deployment.
- Basic roles and permissions.
- Kiosk setup.
- POS setup/customization.
- Product and ingredient setup.
- Recipe engine.
- Ingredient consumption from POS sales.
- Kiosk stock allocation.
- Waste/loss module.
- Daily closing module.
- Expected vs actual stock variance.
- Purchase/supplier cost tracking.
- Basic salary/employee expense tracking.
- Daily/weekly/monthly reports.
- Owner dashboard.
- Basic AI daily summary and alerts.
- Training.
- Go-live support period.

Not included unless separately agreed:

- Hardware procurement.
- Receipt printer/cash drawer configuration beyond standard support.
- CCTV.
- Payment gateway/bank integration.
- Full payroll automation.
- Advanced HR scheduling.
- Full mobile app.
- Deep offline-first custom POS rebuild.
- Odoo Enterprise subscription.
- Custom code maintenance after included support period.
- Multi-company setup.
- Advanced BI warehouse.

---

## 14. Phase 2 Scope

Add after Phase 1 is stable:

- Advanced forecasting.
- Advanced anomaly detection.
- Central purchasing optimization.
- Multi-region kiosk grouping.
- Supervisor approval workflows.
- Advanced staff performance reports.
- Better Arabic/English interface polish.
- Attendance and shift scheduling.
- More advanced accounting exports.
- Better offline recovery and POS resilience.
- Mobile owner dashboard.

---

## 15. Phase 3 Scope

For scale to 100+ kiosks:

- Multi-server/scaling strategy.
- Advanced backup and disaster recovery.
- Region/area manager hierarchy.
- Centralized procurement planning.
- Automated stock transfer recommendations.
- Franchise/branch-level dashboards.
- More advanced BI/analytics layer.
- Deeper AI assistant over reports.
- Audit controls and advanced permissions.

---

## 16. Non-Goals / Do Not Drift

Coding agents must not drift into these unless explicitly approved:

1. Do not rebuild a full ERP from scratch.
2. Do not rebuild Odoo POS from scratch in Phase 1.
3. Do not use Odoo Enterprise-only features as dependencies.
4. Do not edit Odoo core directly unless absolutely unavoidable.
5. Do not make AI responsible for official accounting/inventory calculations.
6. Do not create decorative UI before core workflows work.
7. Do not build advanced payroll before Phase 1 scope is complete.
8. Do not build complex BI warehouse before basic reports work.
9. Do not build a mobile app before web/POS flow is stable.
10. Do not expose generic ERP complexity to cashiers.
11. Do not ignore recipe versioning.
12. Do not allow recipe edits to change historical reports.
13. Do not allow POS sales without traceable consumption logic once recipes are enabled.
14. Do not promise zero ongoing cost; only zero Odoo per-user license cost.
15. Do not assume all kiosks have perfect internet.
16. Do not treat all kiosks as one shared stock pool. Each kiosk/stall must have its own stock context.
17. Do not let a sale at one kiosk reduce stock at another kiosk.
18. Do not build reports only at company level; city/site/kiosk reporting is required.
19. Do not ignore warehouse-to-kiosk transfer confirmation.
20. Do not skip daily closing variance logic.

---

## 17. Technical Implementation Rules

### 17.1 Odoo core

- Install and configure Odoo Community.
- Pin one Odoo major version before development.
- Do not mix code from different Odoo versions.
- Avoid direct core modifications.
- Build custom modules/addons.

### 17.2 POS customization

- Extend/customize Odoo POS through custom modules.
- Use Odoo frontend extension patterns.
- Keep the cashier UI minimal.
- Preserve POS session/payment/receipt behavior as much as possible.

### 17.3 Backend business logic

- Recipe calculations must run server-side.
- Consumption ledger must be persisted.
- Stock movements/adjustments must be traceable.
- Daily closing calculations must be deterministic.
- Reports must be based on stored transactions, not frontend-only values.

### 17.4 AI

- AI reads reports/data.
- AI writes summaries/alerts/recommendations.
- AI does not post accounting entries.
- AI does not silently change stock.
- AI outputs should cite/point to the underlying report data where possible.

### 17.5 Security

- Cashiers can only access their kiosk/POS functions.
- Managers can access assigned kiosks.
- Owner/admin can access all kiosks.
- Sensitive actions require permissions: refunds, voids, stock adjustments, high-value waste/loss.
- Audit who did what and when.

---

## 18. Acceptance Criteria for Demo

A successful demo must show the exact client workflow, not only generic POS.

Demo must show:

1. Create at least 2 cities or areas.
2. Create at least 3 kiosks/stalls under those cities/areas.
3. Create central warehouse stock.
4. Create 10 ingredients.
5. Create 5 sellable products.
6. Create measured recipes for those products.
7. Allocate ingredients from central warehouse to kiosk/stall locations.
8. Open a POS session for a specific kiosk.
9. Sell products through POS.
10. Automatically generate ingredient consumption from the active recipe.
11. Deduct/record consumption from that specific kiosk's stock location.
12. Show expected remaining stock per kiosk.
13. Show reports by city/site/kiosk.
14. Record waste/loss at a kiosk.
15. Close a daily shift.
16. Enter actual counted stock.
17. Show expected vs actual variance.
18. Show daily sales/profit/waste report.
19. Generate AI daily management summary.

The demo must prove this example:

```text
Warehouse sends oranges, sugar, cups, and straws to Kiosk 001.
Kiosk 001 sells Orange Juice 350ml.
The system deducts orange, sugar, cup, and straw from Kiosk 001 only.
Kiosk 002 stock is not affected.
At close, actual counted stock is compared against expected Kiosk 001 stock.
```

If the demo cannot prove warehouse → kiosk allocation, POS recipe deduction, and daily variance, it is not solving the main client problem.

## 19. Acceptance Criteria for Phase 1 Go-Live

Phase 1 is go-live ready when:

- Each kiosk can run POS.
- Each kiosk has its own stock location/context.
- Products and ingredients are correctly configured.
- Recipes are active and versioned.
- POS sales create ingredient consumption records.
- Stock allocation works.
- Waste/loss entry works.
- Daily closing works.
- Expected vs actual variance works.
- Reports are available for owner/manager/accountant.
- Users have correct permissions.
- Backup process is configured.
- Admin users are trained.
- Kiosk staff are trained.
- AI summary can generate from real reports.

---

## 20. Commercial/Proposal Notes

Suggested pricing direction:

```text
One-time implementation: USD 22,500
Odoo per-user subscription: USD 0
Hosting/server infrastructure: estimated yearly cost, billed separately/at actual cost
Support after go-live: optional annual package or per-ticket support
```

Important wording:

```text
There are no Odoo per-user subscription fees because the system uses Odoo Community Edition.
The client is still responsible for hosting/server infrastructure and optional support/maintenance.
```

Do not say:

```text
There are zero ongoing costs forever.
```

Say:

```text
There are no recurring Odoo software license fees. Infrastructure and support are separate.
```

---

## 21. Open Questions for Client

Before final implementation, confirm:

1. Exact number of starting kiosks/stalls.
2. Which cities will the first kiosks operate in?
3. Which areas/sites/places inside each city?
4. Will there be one central warehouse or separate city/regional warehouses?
5. Which warehouse supplies each kiosk?
6. How often is stock delivered to kiosks: daily, every 2 days, weekly, or as needed?
7. Who creates stock allocations/transfers?
8. Who confirms that a kiosk received its allocated stock?
9. Does the kiosk count opening stock every day, or only closing stock?
10. Which ingredients must be counted daily?
11. Which ingredients can be counted weekly/monthly?
12. Exact number of products at launch.
13. Exact number of ingredients/raw materials.
14. Which items are made at kiosk vs prepared centrally.
15. Which products need exact recipes.
16. How often recipes change.
17. Whether cashier must enter actual stock daily.
18. Whether every kiosk has stable internet.
19. Required languages: Arabic, English, or both.
20. Payment methods: cash only, card, wallet, mixed.
21. Receipt printer requirement.
22. Accountant’s chart of accounts/tax requirements.
23. Salary/payment process.
24. Supplier purchasing process.
25. Stock count frequency.
26. Who approves waste/loss.
27. Who approves refunds/voids.
28. Whether hardware is included or excluded.
29. Required go-live date.
30. Whether AI reports should be daily, weekly, monthly, or on-demand.
31. Stock selling policy: strict block, warning with override, or soft negative-stock alert.
32. Whether product prices differ by city/kiosk.
33. Whether supplier costs differ by city.
34. Whether transfers between kiosks are allowed.
35. Whether route/delivery planning is required in Phase 1 or later.

## 22. Minimal Demo Dataset

Use this dataset for initial proof of concept.

### Kiosks/Stalls

```text
BG-001 - Baghdad Mall - Baghdad
BG-002 - Airport Road - Baghdad
NJ-001 - Main Street - Najaf
```

### Ingredients

```text
Orange - kg
Apple - kg
Sugar - kg
Coffee beans - kg
Milk - liter
Cup 350ml - unit
Cup 500ml - unit
Straw - unit
Lid - unit
Cake slice - unit
```

### Products

```text
Orange Juice 350ml
Mixed Juice 500ml
Espresso
Cappuccino
Cake Slice
```

### Example recipes

```text
Orange Juice 350ml:
- Orange: 0.35 kg
- Sugar: 0.01 kg
- Cup 350ml: 1
- Straw: 1
- Lid: 1

Mixed Juice 500ml:
- Orange: 0.25 kg
- Apple: 0.20 kg
- Sugar: 0.01 kg
- Cup 500ml: 1
- Straw: 1
- Lid: 1

Espresso:
- Coffee beans: 0.018 kg
- Cup 350ml: 1

Cappuccino:
- Coffee beans: 0.018 kg
- Milk: 0.18 liter
- Cup 350ml: 1

Cake Slice:
- Cake slice: 1 unit
```

---

## 23. Final Product Positioning

The system should be described as:

```text
A custom AI-powered F&B kiosk accounting and operations platform that controls POS sales, recipe-based ingredient consumption, kiosk stock allocation, waste/loss, daily closing, financial reporting, and AI-driven management insights.
```

Do not describe it as:

```text
An Odoo installation.
```

Do not describe it as:

```text
A generic POS.
```

The value is the specialized F&B operating layer.

---

## 24. Source Notes for Developers

Official source assumptions to verify against the pinned Odoo version:

- Odoo has Community and Enterprise editions; Community is open-source and Enterprise is licensed.
- Odoo POS is browser-based and designed for shops/restaurants, with temporary offline operation and stock movement registration.
- Odoo modules are the correct way to add or extend business logic.
- Odoo frontend uses Owl components/QWeb templates, so POS/UI customization should follow Odoo frontend extension conventions.

Coding agents must validate exact model names, extension hooks, and POS customization approach against the selected Odoo Community version before coding.

