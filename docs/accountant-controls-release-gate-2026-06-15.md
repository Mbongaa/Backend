# Accountant Controls — Release Gate (2026-06-15)

**Status: 🔴 RED — 13 verified open gaps. Do not promote to green until every P0 + P1 acceptance criterion below passes _and_ the existing gates stay green.**

This gate tracks the accountant's formal internal-control / fraud-prevention / auditability
requirements (not cosmetic feedback). Each item was independently ground-truthed against the
**current** code (read/grep + live read-only checks), not from cached belief. Codex's original
report was re-verified: **all 13 findings CONFIRMED**; several are worse than Codex stated
(extra defects called out as "⚠ beyond Codex"). Codex's cited line numbers had drifted — the
**corrected current anchors** are below; re-grep by symbol before editing (the worktree is dirty
and lines keep moving).

Verification method (2026-06-15): 13 parallel read-only auditors, one per finding, each tracing
the backend producer (`api.py`) → gateway (`sourceOfTruth.ts`) → frontend consumer
(`ExactKioskApp.jsx`). Servers were up (odoo `:8069`, vite `:5174`); live DB confirmed e.g. 356
closed `pos.session` rows behind the empty Sessions tab.

---

## Scoreboard

Priority tier is the **accountant's** stated priority (governing for this gate). The auditor's
technical effort / demo-risk is shown alongside; where the auditor's risk rating differs from the
accountant's tier it is noted in the item.

| # | Item | Tier | Effort | Demo risk | Status |
|---|------|------|--------|-----------|--------|
| 1 | POS session history is empty | **P0** | L | high | 🔴 open |
| 2 | End-of-shift stock count not blind | **P0** | M | high | 🔴 open |
| 4 | Cash float + safe-deposit controls missing | **P0** | L | high | 🔴 open |
| 5 | "Wrong order" not linked to a real sale | **P0** | L | high | 🔴 open |
| 9 | Invisible / low-contrast buttons (dark mode) | **P0** | S | high | 🔴 open |
| 10 | Search non-functional (Ctrl-K decorative) | **P0** | L | high | 🔴 open |
| 11 | Kiosk current-stock colour from status/period | **P0** | M | medium | 🔴 open |
| 3 | Kiosk-to-kiosk stock transfers don't exist | P1 | M | medium | 🔴 open |
| 6 | Stock variance financial impact uses live cost | P1 | M | medium | 🔴 open |
| 7 | Receiving discrepancy capture unreachable from UI | P1 | M | high | 🔴 open |
| 8 | Waste notes missing end-to-end | P1 | M | medium | 🔴 open |
| 12 | Realtime: no reconnect/backoff/heartbeat; fake badge | P1 | L | medium | 🔴 open |
| 13 | AI Assistant not connected to the formal books | P1 | L | high | 🔴 open |

**Headline demo risks** (an experienced accountant exposes these in minutes): empty Sessions tab
(#1), non-blind close (#2), no cash-float/safe flow (#4), wrong-order leaves money untouched and
**double-counts stock** (#5), near-invisible "Approve close" button in dark mode (#9).

---

# P0 — Demo / accountant credibility

## #1 — POS session history is empty 🔴
**Verdict: CONFIRMED (high). Understated — live DB has 356 closed `pos.session` rows; 0 today.**

The kiosk page's **POS Sessions** tab is permanently empty in live mode because no session rows
are ever produced and there is no read/history route.

- `odooPosSessionRows` reads `snapshot.today.sessions|sessions|posSessions|pos_sessions` —
  **none of which exist in the payload** — `ExactKioskApp.jsx:3132`.
- `chain_bootstrap` never queries `pos.session`; its `today` sub-object (`api.py:7236-7298`)
  and top-level keys have no `sessions` key — `api.py:6183`.
- `renderSessions` therefore shows the empty state; the table is 5 columns with no row
  `onClick` drill-down — `ExactKioskApp.jsx:12144-12174`.
- The only session route is the **write** path `open_session` — `api.py:7768`. No read/history route.

**Gap:** Need full session history **per kiosk** (not today-scoped): number, cashier, open/close
time, opening float, cash/card/customer-account sales split, expected vs counted cash, amount to
safe, cash variance, status, linked Z-report/journal entry (`move_id`), manager approval — plus a
drill-down to that session's orders/payments/stock-count/variances/accounting entry. A
`chain_bootstrap` addition is **insufficient** (it's today-scoped, 0 sessions today).

**Plan / affected files:**
- `api.py` — **new read-only `pos_session_history` route** modelled on `shift_close_history`
  (`api.py:7301`): query `pos.session` scoped by company/role/kiosk (via `config_id` → `bayaan.kiosk`),
  serialize float/counted/variance/state/`move_id`/approval; add a per-session detail action returning
  orders, payments, stock variances, `account.move` lines. (Card vs customer-account split and
  amount-to-safe must be derived from `pos.payment` categories + the linked `bayaan.shift.close`.)
- `sourceOfTruth.ts` — add `getPosSessionHistory` + `getPosSessionDetail` near `openSession`.
- `ExactKioskApp.jsx` — repoint `odooPosSessionRows` (`:3132`) at the new route; expand
  `renderSessions` columns; add row `onClick` → session detail panel.

**Acceptance:** one row per real session for a kiosk with closed sessions (verify against the 356
live rows); each row shows number/cashier/open/close/opening-float/counted/variance/status scoped
by `config_id`; links to `move_id` + Z-report + manager approval; clicking opens orders/payments/
stock/variances/accounting entry from real Odoo records; **server-side** role+kiosk scoping mirroring
`chain_bootstrap`'s `_is_chain_read_user` gating.

---

## #2 — End-of-shift stock count is not blind 🔴 (anti-fraud control)
**Verdict: CONFIRMED (high).** A cashier can submit a perfect zero-variance close without counting anything.

- Close screen is the single `POSClose` component (`ExactKioskApp.jsx:21780`, rendered at `:21129`),
  **no role gate, no blind variant**.
- It **shows the cashier the expected on-hand qty** in a muted cell (`{row.actual_qty} {row.uom}`,
  `:21941`), and the count input's placeholder is that same expected qty (`:21947`).
  `row.actual_qty` = live on-hand from `kiosk_stock_rows[].actual_qty = quant.quantity`
  (`api.py:6571-6591`, shipped `:7225`).
- A **"Correct"** button (`confirmRow`, `:21837-21840`; label at `:21957-21958`) one-taps the
  count to the expected qty. Untouched rows auto-fill to expected:
  `Number(counts[row.item] ?? row.actual_qty ?? 0)` (`:21866`). Cash mirrors this
  (`confirmCash/confirmCard` set actual := expected; "Expected cash/card" shown `:21912/21922`).
- The client also **sends** a client-computed `expected_qty` (`:21865`) which the gateway forwards
  (`sourceOfTruth.ts:1093`) and the **backend trusts** — stored directly onto the close line
  (`api.py:8680-8688`); `bayaan_shift_close.py:455` `expected_qty` is a plain stored Float and
  variance is `actual_qty - expected_qty` (`:483`) — fully client-driven.
- ⚠ **beyond Codex:** the deterministic ingredient track *does* compute expected server-side
  (`bayaan_shift_close.py:531-533`) — but the UI feeds it the **same expected-defaulted counted
  value** (`:21882-21885`), so a "Correct"/skipped close reads zero variance **everywhere**.
- ⚠ Lock guards exist (`locked_at`, `:59/114-118/465-471`) but only fire at **manager approval**,
  not at cashier submit — a cashier can resubmit before review.

**Gap → required blind count:** cashier sees only item name, UoM, an **empty** counted-qty field,
optional notes. Never expected qty / usage / consumption / expected variance / value. Lock at
submit. Expected + variance computed **server-side** from `opening + received − consumed − waste`.

**Plan / affected files:**
- `ExactKioskApp.jsx` `POSClose` — remove expected display (`:21941`), the Correct/"matches
  expected" shortcuts (`:21837-21846`, `:21957-21959`), expected placeholders (`:21947/21910/21920`),
  expected/variance subtitle copy; stop defaulting untouched counts (`:21866`); require an explicit
  typed count per row.
- `sourceOfTruth.ts` — `submitShiftClose` (`:1075-1098`) stop sending client `expected_qty/cash/card`;
  drop `expected_qty` from `ShiftClosePayload.stockCounts` (`:26-31`).
- `api.py` — `shift_close` (`:8670-8694`) ignore client expected; always derive expected server-side.
- `bayaan_shift_close.py` — make `expected_qty` (`:455`) computed/derived (mirror ingredient line
  `:531-533`); lock counts at submit, not only approval.

**Acceptance:** cashier close shows only item/UoM/empty count input (no expected/usage/variance/
value, no "Correct" button); blank rows block a clean zero-variance submit; a POST with a bogus
client `expected_qty` is overridden by the server-computed value; counts lock at submit; no cashier
UI path reveals expected/consumption/value (EN + Arabic RTL).

---

## #4 — Cash float and safe-deposit controls missing 🔴
**Verdict: CONFIRMED (high).** Live shifts always open with cash = 0; no safe-deposit / retained-float concept.

- **Opening:** live login hardcodes `openingCash: 0` (`ExactKioskApp.jsx:21206`), passed as
  `sourceBackedShift ? 0 : picked.openingCash` (`:21242`) — always 0 in real mode. No standard-float
  config, no confirm input, no opening-discrepancy capture. (The "Cash float: IQD …" text at `:21349`
  renders **only** in the archived simulation branch.) `open_session` does accept `opening_cash`
  (`api.py:7774-7775`) but the UI always sends 0.
- **Closing:** only Counted cash + Counted card inputs (`:21909-21927`); `expectedCash = openingCash
  + cash sales` (`:21820-21824`). **No "cash to safe" and no "retained float" inputs.** The entire
  counted-vs-expected difference posts to cash over/short.
- Model `bayaan_shift_close.py:21-24/88-91` has no `safe_deposit` / `retained_float` /
  `opening_discrepancy` fields. (✓ `opening_cash` is already treated as a drawer **balance**, not
  income — `:388-401`.)

**Gap:** Opening — show configured standard float (e.g. IQD 50,000), require confirm of actual
opening, record discrepancy. Closing — capture counted cash, cash to safe, retained next float,
**isolate** the unexplained difference. Accounting — opening float = cash transfer (not rev/exp);
safe deposit = transfer between cash locations (not income); **only** the unexplained diff hits
cash over/short.

**Plan / affected files:**
- `bayaan_shift_close.py` — add `safe_deposit`, `retained_float`, `opening_discrepancy`; recompute
  cash variance / unexplained diff; fix `_bayaan_auto_close_session` expected-cash math.
- `bayaan_kiosk.py` (or `pos.config`) — standard/default cash-float config.
- `api.py` — `open_session` accept+confirm opening float + record discrepancy; `shift_close` accept
  `safe_deposit`/`retained_float`; expose standard float on `auth_status`/`chain_bootstrap`.
- `bayaan_gl.py` / `pos_session.py` `_post_statement_difference` — post opening float + safe deposit
  as cash-location transfers; route only unexplained diff to cash over/short.
- `ExactKioskApp.jsx` — login: show standard float + actual-opening confirm; close: "cash to safe"
  + "retained float" inputs + unexplained-diff display.
- `sourceOfTruth.ts` + `BayaanProvider.tsx` — plumb the new fields; carry confirmed opening amount.

**Acceptance:** opening shows standard float + requires actual-opening confirm (discrepancy
persisted, manager-visible); close captures counted/safe/retained + shows unexplained diff =
counted − expected − retained, with safe/retained **excluded** from over/short; ledger shows
opening float + safe deposit as cash-location **transfers** and only unexplained diff in over/short
(verify via `/accounting_report` GL); fields round-trip UI ↔ `open_session`/`shift_close` ↔ model ↔
`shift_close_history`; next-day expected opening = retained float, zero spurious over/short when
counts reconcile.

---

## #5 — "Wrong order" must reference an actual sale 🔴
**Verdict: CONFIRMED (high).** ⚠ Also a **variance-loop integrity bug** (double-counts stock) and corrections are currently **blocked**.

- "Wrong order" is just a static label in the waste reason picker (`ExactKioskApp.jsx:22259-22261`);
  selecting it behaves like any waste reason — form collects only item+qty+reason, submits
  `bayaan.submitWaste({item,qty,reason})` (`:22274`).
- Gateway forwards `{kiosk,item,qty,reason,estimated_cost}` (`sourceOfTruth.ts:1061-1070`) →
  `/bayaan/api/waste` (`api.py:8043-8080`) → creates `bayaan.waste.entry` + scraps stock.
- Model `bayaan_waste.py:5-67` has **no `pos.order`/line/outcome** field; `action_post` (`:39-67`)
  re-scraps stock from the kiosk location, never touching revenue/payments.
- ⚠ **beyond Codex (double counting):** the original sale already ran recipe consumption at sale
  time, so tagging a sold drink "Wrong order" waste **double-counts the stock loss** — a direct
  variance-loop integrity bug.
- ⚠ **beyond Codex (no correction path):** `pos_order.py:47-76` actively **prohibits** paid-order
  void/refund/cancel for cashiers and points to a "documented reversal workflow" that **does not
  exist**. `RecentPosOrdersTable` (`:2616`) is read-only.

**Gap:** dedicated workflow — show cashier's last 3 completed orders → select order → select line →
reason (incorrect item/size/duplicate/customer rejection) → outcome (remake/void/refund/discard) →
note; correctly adjust revenue/payments/stock/waste/audit with **no double counting**.

**Plan / affected files:**
- `ExactKioskApp.jsx` — new WrongOrder/correction screen + recent-orders picker (reasons `:22259`).
- `sourceOfTruth.ts` — `correctOrder`/`submitWrongOrder` + recent-orders fetch (`submitWaste:1061`).
- `domain/pos.ts` — `WasteRecord` (`:44-51`) add `posOrderId/lineId/outcome` + correction logic + tests.
- `api.py` — new `/bayaan/api/order_correction` + recent-orders endpoint; waste route (`:8043`) for
  the discard-only branch.
- `bayaan_waste.py` — add `pos_order_id`/`pos_order_line_id`/`outcome` (or a new
  `bayaan.order.correction` model).
- `pos_order.py` — `_bayaan_guard_paid_void` (`:62-76`) expose a **sanctioned reversal path** the
  workflow can call (authorized role) instead of break-glass.
- `bayaan.consumption.ledger` — reversal entries to avoid double-counting recipe consumption.

**Acceptance:** action lists the cashier's last 3 `pos.order` rows (kiosk-scoped) with line select;
each correction stores structured reason + outcome with M2o link to the order/line + audit event;
outcome accounting is correct & non-double-counting (void/refund reverses revenue+payment; remake
adds consumption once; discard scraps without re-deducting); a test proves expected closing stock +
revenue match after each outcome; authorized role works without break-glass, unauthorized cashier
still blocked from raw void/refund; live test in EN + Arabic RTL.

---

## #9 — Invisible / low-contrast buttons (dark mode `.btn-accent`) 🔴
**Verdict: CONFIRMED (high). Measured 1.259:1 — matches Codex's ~1.26:1.**

- `.btn-accent { background: var(--accent); color: #fff }` (`exact.css:835`). In dark mode `--accent`
  flips to a near-white `oklch(0.922 0 0)` (`:98`) → white-on-near-white **1.259:1** (AA needs 4.5:1).
  Hover is worse: `.btn-accent:hover` uses `--accent-ink` (`:836` + `:100`) → **1.04:1**. Light mode
  is fine (`:39` → 17.9:1).
- Root cause: `#fff` is hardcoded instead of a theme-aware token. Sibling `.btn-primary` already uses
  `color: var(--ink-inverse)` (`:833`) → 17.16:1 in dark mode (the fix pattern).
- Shared class sits on **the accountant/manager "Approve close" CTA** (`ExactKioskApp.jsx:14827`),
  "New product" (`:15159`), product Save (`:15430/15733`), AI image (`:9283`), AI plan (`:7332`).
- ⚠ **beyond Codex:** there is **no `:disabled` rule for any `.btn`**, and the focus ring is a
  hardcoded blue (`exact.css:2438-2442`) not tied to `--accent`. No destructive `.btn-danger` variant.

**Gap:** every variant/state (primary, secondary, destructive, disabled, hover, focus, dark, RTL,
modal) must meet AA (~4.5:1) and read as clickable.

**Plan / affected files:** `exact.css` — `.btn-accent` (`:835`) `#fff` → `var(--ink-inverse)`
(gives 14.22:1) + fix hover; add `.btn:disabled`/`.btn-accent:disabled` (≥3:1, signals
non-interactive); `.btn:focus-visible` (`:2438-2442`) derive ring from `var(--accent)`; add a
destructive variant if approve/reject needs one. Consumers inherit automatically.

**Acceptance:** dark-mode `.btn-accent` ≥4.5:1 at rest **and** hover; Approve close / New product /
Save legible & clickable in dark + light + Arabic RTL; disabled has explicit ≥3:1 style; a
repeatable contrast check (Playwright in demo-verify) guards all variants in both themes; focus ring
visible in both themes.

---

## #10 — Search is non-functional (Ctrl-K decorative) 🔴
**Verdict: CONFIRMED (high). The Ctrl-K pill is actively misleading.**

- `AdminTopBar` (`ExactKioskApp.jsx:20424`, rendered for every admin page at `:20889`) renders a
  **non-interactive `<div>`** with a fake "Ctrl K" badge (`:20442-20450`) — no `<input>`, no
  `onClick`, no handler. The only keydown listener in the 22,825-line file is Modal Escape
  (`:2198-2199`); there is **no Ctrl/Cmd+K handler anywhere**.
- Only two real searches exist (name-substring only): Products mgmt (`:15155-15156`/`14937`) and POS
  catalogue (`:21553-21554`/`21390-21391`).
- **Zero** list-search on Suppliers (`:15755`), HR/employees (`:16612`), Inventory (`:13615`), Items
  (`:14201`), Orders (`:2616`). AccountingScreen GL has a real **account-code** server filter
  (`:18938/19045/19118`) but not journal-entry numbers / account names / customers/vendors.

**Gap:** working search across orders/session numbers, products/ingredients, kiosks, suppliers, POs,
transfers, employees, journal entries, accounts, customers/vendors — partial terms, codes, names,
**Arabic + English**, with filters persisting across record open/return.

**Plan / affected files:**
- `ExactKioskApp.jsx` — `AdminTopBar` (`:20424`) make the pill a real control + global Ctrl/Cmd+K
  listener + command-palette overlay; add search state to Suppliers/HR/Inventory/Items/Orders;
  extend AccountingScreen filter to JE number/ref + account name; broaden Kiosks/Products to codes +
  Arabic name field.
- `sourceOfTruth.ts` + `api.py` — accept `search`/`term` params on server-paged list routes
  (`pos_orders_history`, `accounting_report`, `product_catalog`, `hr_snapshot`, `purchase_order`,
  `stock_transfer`) and filter server-side.

**Acceptance:** Ctrl/Cmd+K opens a working palette that finds product/supplier/order-session/JE-
number/account-name and navigates to the record (pill clickable, no longer a dead div); each
required table has a working search by partial term/code/name; Arabic **and** English names both
match; filters persist across open/return; demo-verify types a partial term into the palette and one
table and asserts the filtered set (EN + Arabic RTL).

---

## #11 — Kiosk current-stock colour comes from status/period 🔴
**Verdict: CONFIRMED (high). Dominant pre-close tint is AMBER (needs_closing), RED for variance — not stock level.**

- Kiosk-card "Inventory" bar shows a current-stock **percentage** (`ops.inv`) but colours from the
  kiosk's **overall status**: `InventoryMeter` (`ExactKioskApp.jsx:11207-11224`) uses
  `status==="crit" ? crit : status==="warn" ? warn : pos` and **ignores its own `pct`** for colour.
  Call sites pass `status={k.status}`: card (`:11338`, label "Inventory"/المخزون at `:11335`) and
  table row (`:11601-11602`).
- The % is genuinely current stock (`inv = clamp(k.stockHealth)`, `:11204`; live `liveStock =
  k.stockHealth`, `:5613`), but `k.status` is conflated: `variance_issue → crit`,
  `low_stock|needs_closing → warn` (`:2413-2418`). Backend confirms the precedence chain
  `variance_issue → low_stock → needs_closing → closed` (`api.py:7002-7011`), `needs_closing` set
  whenever `close.closed_at` is falsy (`:6995`).
- ⚠ **beyond Codex (period-sensitivity):** Daily uses backend status (incl. `needs_closing`);
  Weekly/Monthly fall through to a stockHealth threshold because per-period `byKiosk` omits
  `status`/`stockHealth` (`ExactKioskApp.jsx:2326` + `api.py:6842-6854`) — so colour/% change per
  period under an unchanged "current stock" label. (Per-item detail `inventoryStatusFor` `:2457` is
  already correct.)

**Gap:** a CURRENT-stock bar must derive qty **and** colour from current stock health only, be
constant across Daily/Weekly/Monthly, and never inherit closing/variance colours. Any period-
performance indicator must be a separately-labelled element computed from the selected period.

**Plan / affected files:** `ExactKioskApp.jsx` — `InventoryMeter` colour from a stock-health tier of
`pct`/`stockHealth`, not `status`; pass a stock-only status from `RealtimeKioskCard` (`:11338`) and
the kiosk table (`:11601`); in `odooKioskRows` (`:2403-2418`) expose a `stockStatus` distinct from
`k.status`. `api.py` — optionally emit a discrete `stockStatus` in `chain_bootstrap` `byKiosk`
(`:7002-7011`) and include `stockHealth/stockStatus` in per-period `byKiosk` (`:6842-6854`) so the
bar stays constant across periods.

**Acceptance:** bar colour from current stock health (90% stock → green even when not yet closed /
has a close-time variance); toggling Daily/Weekly/Monthly leaves each card's bar % **and** colour
unchanged; needs_closing/variance no longer tint the current-stock bar; a fresh pre-close day shows
a real spread of stockHealth colours, not uniform amber; same behaviour in Arabic RTL.

---

# P1 — Operational controls

## #3 — Kiosk-to-kiosk stock transfers don't exist 🔴
**Verdict: CONFIRMED (high). The state machine exists and is direction-agnostic; only SOURCE selection is missing.**

- Every transfer the system can create is warehouse→kiosk: `_create_kiosk_draft_transfer`
  (`api.py:8118`) resolves only a source **warehouse** (`source_location = warehouse.lot_stock_id`,
  `:8144`) and hard-codes the kiosk as destination (`:8163/8172`). Both `/stock_transfer` (`:8082`)
  and cashier `/stock_request` (`:8089`) funnel here; neither takes a source kiosk.
- `_kiosk_for_picking` resolves the kiosk **only by `location_dest_id`** (`:506-510`), so scoping +
  the "kiosk can only receive" guard structurally assume kiosk=destination; error string says
  "...warehouse-to-kiosk transfer" (`:8200`).
- Frontend: `submitStockTransfer` sends only dest `kiosk` + `from_warehouse`
  (`sourceOfTruth.ts:875-887`; `StockTransferPayload` `:46-57`); modal "from" is a read-only
  warehouse (`ExactKioskApp.jsx:14118-14150`).
- ✓ The **read/display** layer is already kiosk-source-aware (`api.py:6609`), so this is a
  write+scoping+UI extension, not a from-scratch build (effort M). The full
  Draft→Approved→Picked→Dispatched→Received state machine + short/damaged capture already exist.

**Gap:** source kiosk initiates → manager approves → source confirms dispatched → destination
confirms received (short/damaged/rejected recorded) → stock moves only after confirmations → both
kiosks keep an audit trail.

**Plan / affected files:** `api.py` — `_create_kiosk_draft_transfer` add source-kiosk resolution +
dual-kiosk audit; `/stock_transfer` + `/stock_request` accept source kiosk; `_kiosk_for_picking`
resolve by source **or** dest; `stock_transfer_action` scope dispatch→source / receive→dest;
ensure `chain_bootstrap` transfer domain selects kiosk-source pickings. `sourceOfTruth.ts` —
`StockTransferPayload.sourceKioskId` + send `from_kiosk` + action scoping. `ExactKioskApp.jsx` —
source-kiosk selector replacing read-only warehouse; relabel modal. Add a kiosk→kiosk lifecycle test.

**Acceptance:** a transfer with kiosk SOURCE + different kiosk DEST yields a picking with
`location_id` = source kiosk loc, `location_dest_id` = dest kiosk loc (not a warehouse); full state
machine runs (source user dispatches, dest user receives, scoping authorizes the right side); short/
damaged recorded as discrepancy lines; source on-hand −dispatched, dest on-hand +received only after
confirmations; both kiosks have audit entries; `chain_bootstrap` returns from=source/to=dest;
warehouse→kiosk still works (no regression).

## #6 — Stock variance financial impact uses live cost, not close-time cost 🔴
**Verdict: CONFIRMED (high). The correct frozen value is computed and sent, but never displayed.**

- Displayed money (summary Variance-value column `ExactKioskApp.jsx:14670-14674` and the Stock-lines
  money cell `:14793-14818`/`:14812-14814`) is fed by `c.stock` (`:14620`), produced in
  `_serialize_shift_close` as `variance_qty × product_id.standard_price` — the **live** standard cost
  recomputed at read time (`api.py:6163`). Re-opening a historical close after a cost change re-prices
  old variances at today's cost.
- `bayaan.shift.close.line` has **no `unit_cost`** (`bayaan_shift_close.py:446-459`) — nothing frozen.
- ✓ A correct frozen path exists in parallel: `bayaan.shift.close.ingredient.line` freezes
  `unit_cost` at populate (`:237`) and stores `variance_value = variance_qty × unit_cost`
  (`:540-543`); serializer emits `varianceInputs.value` (`api.py:6178-6180`) and the frontend
  normalizes it (`:2886`) — but the recon table (`:14756-14790`) has **no money column**, so the
  correct value is discarded.
- ⚠ Secondary: displayed money comes from cashier-entered count lines (can diverge in qty from
  server-derived ingredient lines), and `standard_price` is per reference UoM with no guard the
  counted line's UoM matches (kg-vs-g mispricing risk).

**Gap:** show physical variance (✓ done) **and** an IQD impact from the cost stored **at close
time**; cashier sees physical, financial is manager/accountant info; correct UoM/cost/recipe/
finished-COGS/rounding.

**Plan:** display the already-correct `varianceInputs.value` and stop using the stock-array live-cost
value for money (`api.py:6163` serializer; `bayaan_shift_close.py:446-483`; recon/stock tables
`ExactKioskApp.jsx:14620/14670/14756/14793`). Normalize per-line `unit_cost` to the line UoM. Add a
cost-stability assertion to `accountant-audit.mjs`.

**Acceptance:** after a close, editing a product's `standard_price` and re-opening that close leaves
per-line + total Variance value **unchanged** (reads frozen cost); recon shows per-line physical
variance (e.g. −2.4 kg) **and** IQD from stored `unit_cost`; total = Σ stored `variance_value`, no
read-time `× standard_price` in `_serialize_shift_close`; UoM-normalized cost; a demo-verify assertion
fails if any served value is reproducible by `variance_qty × current standard_price` after a cost edit.

## #7 — Receiving discrepancy capture is backend-only / unreachable 🔴
**Verdict: CONFIRMED (high). Backend is further along than Codex implied; the UI just never sends line items.**

- ✓ Backend fully supports it: model `bayaan.stock.receipt.discrepancy`
  (`stock_picking.py:57-78`); the `receive` branch calls `_validate_picking(picking, items)`
  (`api.py:8224-8226`); `_picking_discrepancy_inputs` parses `received_qty`/`damaged_qty`/`note`
  (`:1422-1454`); `_record_picking_discrepancies` writes lines on shortage/damage/note
  (`:1514-1548`); `_serialize_picking_action` returns a `discrepancies` array (`:1567-1575`).
- ✗ Frontend never sends items: admin `advanceTransferStatus` posts only `{transfer, action:"receive"}`
  (`ExactKioskApp.jsx:14024-14027`); kiosk `receivePosTransfer` posts only `{transfer, action:"receive"}`
  (`:21073-21081`); receive button calls `onReceive(transfer)` with no per-line input (`:21756`).
- ✗ Gateway can't carry it: `StockTransferActionPayload.items` type + forwarder
  (`sourceOfTruth.ts:59-66` & `894-897`) lack `damagedQty`/`note`/`reason`.

**Gap:** per-line receive UI (dispatched/received/damaged/missing + reason + note); notes mandatory
when received ≠ dispatched; short delivery must **not** post as fully received; surface discrepancies
to the manager.

**Plan:** `ExactKioskApp.jsx` — per-line receive/discrepancy modal (admin `receivePosTransfer:21073`,
kiosk button `:21756`, `advanceTransferStatus:14015-14050`, StudioInventory receive) passing `items`.
`sourceOfTruth.ts` — extend `StockTransferActionPayload.items` (`:59-66`) + forwarder (`:889-898`)
to map `damaged_qty`/`note`/`reason`. `api.py` — `_validate_picking` (`:1488`) /
`_prepare_picking_done_quantities` (`:1456`) reject a clean "received" on short/missing lines.
`stock_picking.py` — optional `discrepancy_reason`/`missing_qty` enum field.

**Acceptance:** receive opens per-line dispatched/received/damaged/missing + reason + note, posts
`items`; received ≠ dispatched requires a note (UI **and** backend-enforced); short receipt creates
discrepancy line(s) with correct shortage and does **not** set moves to full qty (reflects partial);
damaged/shortage surfaced to manager; gateway carries damaged/note/reason end-to-end (test asserts
posted payload).

## #8 — Waste notes missing end-to-end 🔴
**Verdict: CONFIRMED (high).** No notes field in UI, React types/payload, gateway, route, model, or Odoo views.

- UI `WasteWorkspace` is a 3-step item/qty/reason form (`ExactKioskApp.jsx:22227-22264`); reasons are
  a fixed picker (`:22259-22261`); submit is `submitWaste({item,qty,reason})` (`:22274`).
- Provider `submitWaste({item,qty,reason})` (`BayaanProvider.tsx:68-72/380-386`) → `buildWastePayload`
  (no notes; `buildPosSale.ts:170-211`) → gateway POST `{kiosk,item,qty,reason,estimated_cost}`
  (`sourceOfTruth.ts:1061-1073`, type `:486-496`) → route `/bayaan/api/waste` (`api.py:8043-8068`) →
  model `bayaan_waste.py:10-24` (no notes) → views `bayaan_waste_views.xml:12-19,34-41`.
- ⚠ Separation concern: "Wrong order" still routes through the waste channel (see #5); transfer
  damage **is** already separated via `damaged_qty` (`api.py:1436-1450`).

**Gap:** optional notes end-to-end; **mandatory** for "Other"/uncategorized, high-value (cost >
threshold), unusual quantity, repeated pattern, manager-flagged product.

**Plan:** add notes through `WasteWorkspace` (`:22225-22384`, + an "Other" reason, remove/relabel
"Wrong order"), `BayaanProvider.submitWaste` (`:68-72/370-386`), `buildPosSale.ts` `WastePayload`/
builder (`:170-211`, + conditional-required validation), `sourceOfTruth.ts` (`:486-496`/`:1061-1073`),
`api.py` waste route (`:8043-8068`, enforce mandatory-note rules server-side), `bayaan_waste.py`
(Text field + constraint), `bayaan_waste_views.xml`. (Repeated-pattern + manager-flag triggers need
new concepts → effort M.)

**Acceptance:** waste with reason "Other" is blocked server-side without a note; a note round-trips
(stored, returned in read path/AI packs, visible in Odoo views); high-value/unusual/repeated/flagged
cases require a note (unit test on `buildWastePayload` + backend test); "Wrong order" no longer goes
through waste; a smoke step records high-value waste, confirms enforcement + the stored note.

---

# P1 — Production readiness

## #12 — Realtime: no reconnect/backoff/heartbeat; fake "STREAM ACTIVE" badge 🔴
**Verdict: CONFIRMED (high). Both halves true; header badge is genuinely live (Codex understated that).**

- `start()` (`realtime.ts:174-185`) calls `/bayaan/api/realtime_config` once; on failure it
  `fail()` + `setStatus("error")` with **no retry/backoff/timer** — dead until remount/re-auth.
- WS `error`/`close` (`:161-169`) just `setStatus("reconnecting")` + one-shot `startPolling(...)` —
  permanently degrades to ~2s bus polling. **No heartbeat, no WS re-open** (grep finds no
  backoff/retry/heartbeat).
- Snapshot resync is **event-triggered only** (`ExactKioskApp.jsx:20701-20714`), not reconnect-
  triggered, so events dropped during a silent outage may never backfill.
- ✓ The **header** badge is wired to real `realtime.status` (`:20912-20926`). ✗ The **Overview**
  terminal bar hard-codes a green dot + "STREAM ACTIVE" (`:6088`) + fake "42 ms LATENCY" (`:6101`)
  regardless of true state.
- ✓ Single-engine rule intact — streams never write official numbers.

**Gap:** auto-reconnect with backoff; heartbeat/health; reconnect-time resync; Live/Reconnecting/
Offline statuses; no manual refresh; no dup/missing events after recovery.

**Plan:** `realtime.ts` — reconnect-with-backoff loop around `start()`/`openSocket()`, heartbeat
ping/timeout, `onReconnect` resync hook, real `reconnecting→live` lifecycle + terminal `offline`.
`ExactKioskApp.jsx` — Overview bar (`:6086-6101`) show live status (replace hardcoded STREAM ACTIVE/
42ms/online count); thread status into `OverviewScreen` (`:5538`); trigger `refreshOdoo()` on
reconnect/status-change (`:20697-20721`); add reconnecting/offline cases to header badge
(`:20912-20926`). `bayaan_realtime.py` (`:108-116`) optionally expose heartbeat/backoff hints.

**Acceptance:** killing the bus mid-demo → auto reconnect with backoff, no reload, badges
Live→Reconnecting→Live; after reconnect a `chain_bootstrap` resync runs and the bus cursor advances
so outage events appear exactly once (no missing/dup); a half-open socket flips to Reconnecting via
heartbeat within ~30s; Overview bar reflects real status; distinct localized Live/Reconnecting/
Offline (EN + Arabic).

## #13 — AI Assistant not connected to the formal books 🔴
**Verdict: CONFIRMED (high). `accountMoveRows` hardcoded to 0; no ledger data reaches the model.**

- `ai_dashboard_plan` (`api.py:3509-3525`) builds context from `_ai_compact_report_pack`
  (`:1867-1986`), which wraps `chain_bootstrap` and carries only operational data (`:1872-1886`).
- `account.move` is `source_counts.get('accountMoveRows', 0)` (`:1925`) and `chain_bootstrap`'s
  sourceCounts (`:6894/7102`) **never** produce `accountMoveRows` → always 0, no ledger rows.
- The formal books live in a **separate** `accounting_report` route (`:4631`, helpers `:4289-4608`)
  never called from the AI path. Intent inference has **no accounting branch** (`:1791-1812`) →
  accountant questions fall to executive-summary. Deterministic claims emit only operational figures
  (`:2497-2559`). The `account.move` labels in two plan templates' `sourceRefsRequired`
  (`:1681/1747`) are allowlist labels with **no backing data** (red herring).

**Gap:** AI answers revenue/gross profit, COGS/margins, opex, payroll, GL, trial balance, income
statement, balance sheet, cash flow, AP/AR, VAT/tax, kiosk profitability, cash & stock variances —
each numeric answer cites report/date-range/accounts/source records. AI **explains/investigates,
never computes** (per CLAUDE.md AI rule — feed existing deterministic `accounting_report` output, no
new math).

**Plan:** `api.py` — `_ai_compact_report_pack` populate real `accountMoveRows` + add GL/TB/IS/BS/
AP-AR/VAT sections (reusing an internal accessor over `accounting_report`/`_accounting_*` helpers);
`_ai_infer_intent`/`_ai_plan_templates` add an accounting-aware intent; `_ai_deterministic_claims`
emit ledger-cited claims; `_ai_openai_instructions` updated. `ExactKioskApp.jsx` surfaces the
accounting answers.

**Acceptance:** an accounting question (e.g. net profit + gross margin this month per the income
statement) returns figures sourced from `account.move`-backed reports, claims' `sourceRefs` include
`account.move`/named report + date range; `_ai_compact_report_pack` shows a real `accountMoveRows`
and GL/TB/IS/BS/AP-AR/VAT sections in `ai_dashboard_plan`; TB / aged-payables route to an
accounting-aware intent; a live check confirms AI-cited figures **equal** `/accounting_report` for
the same range/accounts (AI does not recompute); claim validation rejects any `account.move`-tagged
number not traceable to the supplied report pack.

---

# Gate definition — what "green" means

The gate is **green only when all of the following hold** (per CLAUDE.md: tests alone never promote
a gate — a full dashboard walkthrough with screenshots, dark mode, console/page-error checks, and
EN + Arabic RTL is required):

1. **Every P0 acceptance block passes** (#1, #2, #4, #5, #9, #10, #11) — verified live, in EN **and**
   Arabic RTL, in light **and** dark mode, with screenshots in `apps/kiosk-pos/verification/`.
2. **Every P1 acceptance block passes** (#3, #6, #7, #8, #12, #13).
3. **Variance-loop integrity preserved** — no double counting (#5), close-time frozen cost (#6),
   server-derived blind variance (#2). The loop in CLAUDE.md still holds end-to-end.
4. **Existing gates stay green** (re-run, don't infer):
   - `npm run verify` (vitest + wiring gate + build) — and any new domain tests added for #5/#6/#8.
   - Addon test suite on a **disposable** `bayaan_codex_*` DB (never the live `bayaan` DB).
   - `npm run demo:verify:full` (groups A–I) — update assertions for renamed UI / new flows.
   - `npm run verify:live` (accounting trio + `smoke:live`) — books still tie (revenue+VAT == POS
     gross, TB balanced, assets == L+E+NI, 0 missing moves, 0 open sessions).
5. **No Odoo leak** in any new user-facing string (EN or AR) — say "accounting engine"/"the ledger".
6. **Server-side scoping** on every new read route (#1) and new write/correction path (#5, #3, #4)
   — role + kiosk enforced in the backend, not UI hiding.
7. Pristine reseed (`~/seed-miza-demo.sh`) before any green claim or demo.

# Suggested sequencing

- **Wave A (fast credibility wins):** #9 (S, contrast) → #11 (M, stock colour) → #2 (M, blind close).
  These are high-visibility, lower-coupling, and harden the fraud control the product is sold on.
- **Wave B (cash + sessions):** #4 (cash float/safe) + #1 (session history) — both touch
  `shift_close`/`pos.session` serialization; do together to avoid double-touching the close path.
- **Wave C (corrections + receiving + waste):** #5 (wrong-order, includes the double-count + reversal
  fix) → #7 (receiving discrepancy) → #8 (waste notes) → #6 (frozen variance cost). Shared
  waste/transfer/close surfaces; #5 and #8 both edit `WasteWorkspace`.
- **Wave D (platform):** #3 (kiosk↔kiosk transfers) → #10 (search) → #12 (realtime) → #13 (AI books).

Re-run the relevant gate after each item; re-grep anchors before editing (lines drift).

---

_Verified 2026-06-15 against the live tree (odoo :8069, vite :5174) by a 13-way read-only audit.
All findings CONFIRMED. Re-verify each item's anchors before implementing — do not trust the line
numbers blind. This doc is the authoritative backlog for the accountant-controls work session._
