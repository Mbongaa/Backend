# Restaurant Kiosk Admin Dashboard

_Started 2026-05-09 19:21 UTC_

---

## User



## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: questions_v2]_

Before I start designing, I want to make sure I build the right thing for you. The brief is rich and clear on philosophy, but a few decisions will steer the whole direction.

## User

Questions answered:
- deliverable_shape: Skip the doc — go straight to a hi-fi interactive prototype of both panels
- screens_admin: Overview / command center (today + alerts), Kiosk performance comparison, Sales & financial reports, Inventory / stock & ingredients, Waste & loss detection, Suppliers & purchases, Staff & salaries, AI insights feed, Single-kiosk drilldown
- screens_pos: Sale / order taking, Payment & receipt, Waste entry, Login + role permissions
- pos_device: Tablet, landscape (most common for F&B kiosks)
- language_demo: Both — show key screens in both directions side-by-side
- aesthetic: Linear / Notion modern — soft neutrals, subtle depth, generous space, i want minimilsitc
- variations: One strong direction, polished

## Assistant

_[tool: update_todos]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: snip]_

The hi-fi prototype is live at **Kiosk POS.html** — admin command center on the left toggle, POS on the right, EN/AR language switch up top.

**Admin panel** (sidebar nav): Overview with AI brief, hourly chart, alerts, kiosk performance table, stock health & cash flow · AI Insights feed · Kiosks list + drill-down · Inventory with auto-PO suggestion · Waste & Loss with anomaly detection · Suppliers · Staff · Reports (P&L).

**POS panel** (1180×800 tablet bezel): Login with PIN pad → Sale (categorized menu, search, cart with VAT) → Payment (card / cash + quick-cash + processing → success with change) → Waste entry (3-step: item → qty → reason).

**Design DNA:** warm paper background, hairline borders, Geist + Geist Mono for tabular numbers, IBM Plex Sans Arabic for RTL, single restrained accent blue, AI surfaced as a subtle "AI" tag + 2px ink left-rule (never a chatbot bubble). Status dots and badges only where they earn it.

