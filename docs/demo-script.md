# Bayaan Client Demo Script

Use this flow to present Bayaan as a custom F&B kiosk operating system, not as generic Odoo.

## 1. Start With Control

Open the admin overview.

Show:

- Total sales across the pilot kiosks.
- Kiosks needing stock attention.
- AI brief based on deterministic stock and sales data.
- Kiosk performance table.

Message:

```text
The owner sees all stands from one operational dashboard. The system is not guessing numbers. It reads sales, stock, waste, and cost data from the same source.
```

## 2. Show The Operations Sections

Open `Inventory`, `Waste & Loss`, `Suppliers`, `Staff`, and `Reports`.

Show:

- The admin shell already has the sections a chain operator expects.
- Inventory shows stock health and AI purchase suggestions.
- Waste/loss highlights patterns and anomalies.
- Suppliers and reports show purchase and P&L views.

Message:

```text
The demo UI is intentionally calm and operational. The complex accounting and recipe logic stays behind the scenes while management gets clean control panels.
```

## 3. Show Warehouse To Kiosk Allocation

Open `Inventory`.

Show:

- Central warehouse quantity.
- Remaining stock across kiosks.
- POS consumption.
- Waste.
- Days of cover.
- Transfer action.

Click a transfer.

Message:

```text
In production this creates an Odoo internal stock transfer from the main warehouse location to the kiosk stock location, so accounting and stock do not go out of sync.
```

## 4. Show POS Consumption

Switch to `POS`.

Start the shift with PIN `1234`.

Point out the two-device layout:

- The cashier uses the main POS tablet.
- The customer-facing display shows the live order, total, payment instruction, and thank-you screen.

Sell:

- Latte
- Orange

Show:

- The customer-facing screen mirrors the order without exposing staff controls.
- The payment screen turns into a customer-facing pay prompt.
- Card payment shows the thank-you state.

Message:

```text
The cashier only sees a fast POS. The customer sees a clean confirmation display. In production this cashier flow is implemented as a customized Odoo POS screen, and Bayaan records recipe consumption from the selling kiosk stock location.
```

## 5. Show Waste Capture

Switch to `POS`.

Record waste.

Show:

- Cashier can record waste without entering the admin system.
- The workflow is simple enough for kiosk staff.

Message:

```text
Waste, spoilage, wrong orders, and missing stock become structured data instead of WhatsApp messages or paper notes.
```

## 6. Show Financial Reports

Open `Reports`.

Show:

- Revenue
- Net profit
- P&L categories
- AI month summary

Message:

```text
AI explains the reports, but the calculations remain deterministic and auditable.
```

## Demo Positioning

Say this clearly:

```text
Bayaan is the custom system your team uses daily. Odoo Community is the hidden POS, accounting, and stock engine underneath. This gives us speed, reliability, and auditability without selling you a generic ERP interface.
```

## Current Demo Caveat

This prototype is ready for client demonstration and pilot planning.

Before live operation, connect it to a real Odoo Community deployment, configure users and permissions, connect printers/cash drawers, and validate Iraqi accounting reports with the accountant.
