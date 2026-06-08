# Miza Demo — Live Dashboard & Flow Test Plan

**Purpose:** Verify every live-view dashboard function, every role's scope, and the
cashier / manager / staff flows behave and **calculate** correctly before the demo.
Tests are executed for real in a browser with Playwright (`scripts/demo-verify/`), acting
exactly as an admin, cashier, or manager would.

**Environment under test**
- Backend: native WSL Odoo 19 on `:8069`, DB `bayaan` (the live source of truth).
- Frontend: Vite on `http://127.0.0.1:5174` (proxies `/odoo` → `:8069`), runtime
  `src/exact-design/ExactKioskApp.jsx`, **Live only** mode.
- Logins (all password `test`): `owner@miza.iq` (superadmin), `layla@miza.iq` (manager),
  `hassan@miza.iq` (logistics), `noor@miza.iq` (accountant), `zainab@miza.iq` (cashier).

**How to run**
```bash
cd apps/kiosk-pos
node scripts/demo-verify/run-all.mjs          # full suite, writes report + screenshots
node scripts/demo-verify/run-all.mjs --only A # one group (A read-path, B roles, C cashier, D manager, E staff, F cross-cutting)
```
Results: `apps/kiosk-pos/verification/demo-verify/REPORT.md` + JSON + PNG screenshots.

> ⚠️ Groups C/D/E **mutate** the live demo DB (create orders, waste, transfers, closes).
> Run read-path group A first to capture the clean baseline, then re-seed with
> `~/seed-miza-day.sh` before the demo if the numbers drift.

---

## Ground-truth reference (2026-06-08, owner scope — all 3 kiosks)

Source: `POST /bayaan/api/chain_bootstrap` (authenticated as owner). The UI must match these.

| Metric | Value |
|---|---|
| Sales today | **399,000 IQD** |
| Orders today | **63** |
| Payments — cash / card(digital) | **267,000 / 132,000** (= 399,000) |
| COGS | **51,450** |
| Net profit (pre-payroll) | **302,900** (= sales − COGS − \|variance impact\|) |
| Cash variance | **−40,000** |
| Stock variance value | **−4,650** |
| Variance impact | **−44,650** |
| Cash expected | **980,000** (= 315k + 325k + 340k closings) |
| Open / closed kiosks | **0 / 3** |
| Payroll (daily) | **226,667** → net after payroll **76,233** |
| Unresolved variances (alert) | **3** |
| Employees | **9** (3 cashiers, 3 baristas, 1 mgr, 1 accountant, 1 warehouse) |
| Recipes / Products | **2** (OJ, Cappuccino) / **8** |
| Waste today | **0** rows |

Per kiosk: **K-01 Karrada** 195,000 / 32 orders · **K-02 Mansour** 121,000 / 18 ·
**K-03 Erbil Mall** 83,000 / 13. Closings cash variance: K-01 **0**, K-02 **−12,000**,
K-03 **−28,000**; expected cash 340k / 325k / 315k.

**Known seed quirk to confirm in UI:** the K-01 *closing record* stores `sales = 158,000`
while the live recompute is `195,000` (extra orders added after the close was seeded).
The Daily Close screen may therefore disagree with Today Command for K-01 — verify which
number each screen shows and whether that confuses the variance line.

---

## Group A — Admin read-path & calculation verification (login: owner)

For every screen: (a) renders with **0 console/page errors**, (b) shows **live** data not the
mock K-01..K-10 Karrada chain, (c) headline numbers match ground truth. Screenshot each.

| ID | Screen | Must verify | Status |
|---|---|---|---|
| A1 | Today Command (overview) | Sales 399,000 · 63 orders · cash var −40,000 · profit 302,900 · cash expected 980,000 · digital 132,000 · "3 source kiosks / 63 orders / 3 closes" · 3 closed kiosks | _pending_ |
| A2 | AI Insights | "Today's brief" renders, live AI plan loads (OpenAI) without error, every numeric claim shows a source ref; no crash/timeout spinner stuck | _pending_ |
| A3 | Kiosks | 3 kiosks (Karrada / Mansour / Erbil Mall), not 10; per-kiosk sales 195k/121k/83k | _pending_ |
| A4 | Warehouses | Central warehouse + 8 stock items render from source | _pending_ |
| A5 | Items Catalog | 8 products listed, images load (no broken imgs), consumption modes shown | _pending_ |
| A6 | Sales & POS | Order monitor lists today's orders; totals reconcile to 399,000 | _pending_ |
| A7 | Daily Close | 3 closings; variances 0 / −12,000 / −28,000; expected cash 315/325/340k; K-01 sales figure check | _pending_ |
| A8 | Waste & Loss | 0 waste rows today (nav badge says 3 — confirm badge vs. actual) | _pending_ |
| A9 | Products & Recipes | 2 recipes (OJ, Cappuccino) with versioned lines + unit cost; 8 products | _pending_ |
| A10 | Purchases & Suppliers | 12 suppliers; 0 open POs; spend columns render | _pending_ |
| A11 | Stock & Allocation (inventory) | 18 kiosk-stock rows (6 × 3 kiosks); stock %/status; transfer builder opens | _pending_ |
| A12 | Staff | 9 employees with role + kiosk; payroll summary | _pending_ |
| A13 | Finance | Revenue 399,000 · COGS 51,450 · net 302,900 · payroll 226,667 · net-after-payroll 76,233 | _pending_ |
| A14 | Reports | Renders; source counts (63 orders / 186 consumption / 3 closings) traceable | _pending_ |

---

## Group B — Role scoping (login as each non-owner role)

Server-side scope must be reflected in the UI (RULES: enforcement, not just hiding).

| ID | Role | Must verify | Status |
|---|---|---|---|
| B1 | manager (layla) | All 14 admin nav visible; **POS panel disabled**; data still all 3 kiosks | _pending_ |
| B2 | logistics (hassan) | Exactly 6 nav: overview, warehouses, items, suppliers, inventory, reports; no closing/finance/staff | _pending_ |
| B3 | accountant (noor) | Exactly 8 nav: overview, insights, sales, closing, suppliers, staff, finance, reports; no inventory/warehouses | _pending_ |
| B4 | cashier (zainab) | **No admin nav**; lands on / forced to POS panel; Admin button disabled | _pending_ |

---

## Group C — Cashier POS flow (login: zainab, kiosk K-01) — MUTATES DB

| ID | Step | Must verify | Status |
|---|---|---|---|
| C1 | Start shift | `/open_session` succeeds; sale screen loads with source products | _pending_ |
| C2 | Build cart | Add OJ + Cappuccino; cart line prices correct; **Subtotal + VAT == Total** (VAT-inclusive 5%) | _pending_ |
| C3 | Charge → Cash | Payment screen shows amount due == cart total; configured Cash method available | _pending_ |
| C4 | Complete sale | "Payment complete"; `/kiosk_sale` returns ok; **new pos.order** with matching total in backend | _pending_ |
| C5 | Recipe consumption | New order's `consumption_state == posted`; `bayaan.consumption.ledger` rows created for recipe items | _pending_ |
| C6 | Record waste | Waste entry posts; appears in backend `today.waste` / Waste screen | _pending_ |
| C7 | Daily close (POS) | Count cash, submit close; `/shift_close` creates a `bayaan.shift.close` for K-01 | _pending_ |

---

## Group D — Manager / approval flows (login: manager or owner) — MUTATES DB

| ID | Step | Must verify | Status |
|---|---|---|---|
| D1 | Daily Close review | Open a closing with variance (K-03 −28,000); approve/reject/note via `/shift_close_review`; lock-after-approval | _pending_ |
| D2 | Stock transfer create | Build a multi-line draft transfer warehouse→kiosk; `/stock_transfer` creates it Draft | _pending_ |
| D3 | Transfer state machine | Advance Draft→Approved→…→Received via `/stock_transfer_action`; kiosk stock increases | _pending_ |
| D4 | Purchase receiving | Create PO + receive (full/partial) via `/purchase_order_action`; warehouse stock increases | _pending_ |

---

## Group E — Staff flow (login: owner/manager) — emphasized

| ID | Step | Must verify | Status |
|---|---|---|---|
| E1 | Staff roster | 9 employees with correct role/kiosk; cashiers Zainab(K-01)/Fatima(K-02)/Yusuf(K-03) | _pending_ |
| E2 | Kiosk detail → schedule | Open a kiosk; per-kiosk work-week schedule view loads from `/hr_schedule` | _pending_ |
| E3 | Create / edit shift | Add a dated shift assignment via `/hr_schedule` create/update; it persists on reload | _pending_ |
| E4 | Coverage gaps | Missing-role coverage gaps surface for the work week | _pending_ |
| E5 | Payroll adjustment | Add a payroll adjustment via `/payroll_adjustment`; reflected in payroll summary | _pending_ |
| E6 | Payroll run | Trigger / view a payroll run via `/payroll_run`; persists | _pending_ |

---

## Group F — Cross-cutting

| ID | Check | Must verify | Status |
|---|---|---|---|
| F1 | Arabic RTL | Language toggle flips app to `dir="rtl"`; no mojibake | _pending_ |
| F2 | Dark mode | Theme toggle applies `data-theme="dark"` and restores | _pending_ |
| F3 | Console hygiene | Zero console errors / page errors across the whole sweep | _pending_ |
| F4 | Realtime stream | "STREAM ACTIVE" indicator; a backend sale appears without manual refresh | _pending_ |
| F5 | No Odoo leak | Word "Odoo" never visible in any admin/POS surface | _pending_ |

---

## Results (run 2026-06-08, live backend — after clean restart)

**Bottom line: 62/62 checks pass (groups A–I). The live dashboard, all role scopes, and the
cashier/manager/staff flows work and calculate correctly.** Two consecutive deeper-coverage
rounds (H, I) found zero new product bugs. The suite self-derives ground truth from
`chain_bootstrap`, so it stays correct across re-seeds.

| Group | Result | Notes |
|---|---|---|
| A — admin read-path & math | **17/17** | Every screen renders correct *live* numbers (sales, profit, cash-expected, COGS, variance, by-kiosk) with 0 console errors |
| B — role scoping | **4/4** | manager / logistics / accountant / cashier each scoped exactly; POS/Admin toggles gated server-side |
| C — cashier POS flow | **8/8** | sale posts a real `pos.order` (total exact), VAT-inclusive math (9,524+476=10,000), recipe consumption posted, waste posts a scrap |
| D — manager / approvals | **5/5** | close-review note via `/shift_close_review`; transfer builder opens; full transfer lifecycle Draft→Approved→Dispatched→Received raised K-01 stock +3 |
| E — staff flow | **7/7** | 9-employee roster, work-week schedule, **shift create persists**, coverage, **payroll adjustment persists**, payroll run |
| F — cross-cutting | **5/5** | Arabic RTL, dark mode, realtime stream indicator, no "Odoo" leak, 0 console errors |
| G — gap closure | **3/3** | **PO → confirm → receive** raises warehouse stock; **realtime: a backend sale appears on the admin dashboard with no manual refresh** (377k→382k); **cashier POS daily close** creates a `bayaan.shift.close` |
| H — deeper interactions | **10/10** | **Card payment** posts an order; **live AI LLM** answers citing the real numbers; **manager approve-with-variance** is note-gated + locks; kiosk drill-down; reports export; recipe edit; empty-cart guard; Arabic render (no mojibake); mobile spectator |
| I — payment edge cases | **3/3** | POS offers only the source-configured tenders (Cash/Card/Customer Account, no broken wallet buttons); **Customer Account tender completes**; 0 console errors |

### Findings & actions

1. **CRITICAL (fixed): backend could crash permanently with no recovery.** During the sweep,
   an idle browser keep-alive connection tripped Odoo's default 120s `limit_time_real`
   watchdog, which triggered a server *reload*; the reload re-execs `odoo-bin` via its
   `#!/usr/bin/env python3` shebang = system python3, which lacks `babel`, so the backend
   died (`ModuleNotFoundError`) and never came back — fatal during a paused demo. **Fixed**
   in `~/bayaan-odoo.conf` (`limit_time_real = 0`, `limit_time_real_cron = 0`,
   `limit_time_cpu = 0`); re-verified with zero new watchdog trips across subsequent runs.

2. **Demo polish (fixed): AI Insights starter prompt named a nonexistent kiosk.** The chip
   "Why is Zayouna Plaza 12% behind?" referenced a mock-chain kiosk absent from the live
   Miza data (only Karrada / Mansour / Erbil Mall exist). Changed to the tenant-agnostic
   "Which kiosk is behind today and why?" (`ExactKioskApp.jsx` `SUGGESTED[0]`).

3. **Bug (fixed): cashier POS daily close crashed with a server error.** Submitting the close
   from the POS sent `opened_at` as a browser ISO-8601 string (`2026-06-08T10:00:00.372Z`),
   which the backend's `/shift_close` passed straight into `create()` —
   `ValueError: time data ... does not match format '%Y-%m-%d %H:%M:%S'`. **Fixed** by adding a
   `_client_datetime` normalizer in `controllers/api.py` (handles ISO `Z`/millisecond/offset
   strings) and applying it to `opened_at`. Re-verified end-to-end: the cashier close now
   creates the `bayaan.shift.close` record.

4. **Data hygiene (resolved): K-01 close vs. live mismatch.** Before re-seed, the K-01
   closing stored 158k while live K-01 sales read 195k (stray pre-existing test orders). A
   clean re-seed made K-01 158,000 everywhere — consistent (verified closing == live).

5. **Optics note (no code bug): daily net-after-payroll can be negative.** A full month's
   payroll (~226k/day) is attributed to a single seeded day, so on a lower-sales seed
   (362k) the Finance "net profit daily after payroll" shows negative (−20,882). Correct
   arithmetic, awkward for a demo — re-run `~/seed-miza-day.sh` if a higher-sales day is
   wanted, or present the pre-payroll "Profit estimate" tile on Today Command instead.

6. **Config note (no bug): POS tenders are Cash / Card / Customer Account.** The Iraqi wallet
   providers (Zain Cash, FIB, FastPay, NassWallet, AsiaHawala, Qi Card) are configured as
   gateway providers for settlement/reporting but are **not bound as POS payment methods**, so
   they don't appear as cashier tenders. The POS correctly shows only the configured tenders
   (no broken buttons), and Customer Account completes. If the demo narrative includes a
   cashier taking a wallet payment, bind those `pos.payment.method` rows to the kiosks first.

7. **Bug (fixed): POS showed a fake transfer that couldn't be confirmed.** In live mode the POS
   fell back to `MOCK.pendingTransfers` — a hardcoded dispatched transfer **TR-2040 "Milk → K-01"** —
   because `loadPosTransfers` derived rows from an *unmarked* bootstrap (`canUseDemoFallback`
   returned true). Tapping "Confirm receipt" sent the fake id `TR-2040` to the backend →
   `Stock transfer not found`. **Fixed** by marking the snapshot live-only before deriving rows
   (`ExactKioskApp.jsx` `loadPosTransfers`). Traced end-to-end (`scripts/demo-verify/trace-transfer.mjs`):
   the fake transfer is gone, a real dispatched transfer now shows ("WH/INT/… · WH/Stock → K-01"),
   and **"Confirm arrived" receives it — K-01 stock rose by exactly the transferred qty.**

8. **Feature added: POS low-stock alert + request-from-warehouse.** The cashier POS now shows a
   **"N item(s) low on stock — request from warehouse"** banner (amber/critical) when a kiosk
   item is at/below its reorder or critical level, with a **"Request stock"** button. Tapping it
   tops each low item back to target via a new cashier-allowed endpoint
   **`/bayaan/api/stock_request`** (`api.py`), which creates a **draft warehouse→kiosk transfer**
   that logistics/manager approves → dispatches → the kiosk receives (the loop in #7). New
   gateway method `requestStock` in `sourceOfTruth.ts`. Traced end-to-end
   (`scripts/demo-verify/trace-lowstock.mjs`): drained K-01 milk below reorder → alert appeared →
   request created a draft transfer (`Kiosk stock request - K-01`) → success toast.

9. **Feature added: kiosk requests are visible to warehouse workers in Stock & Allocation.**
   Requested transfers now carry a `requested` flag (backend `transfer_rows`, origin-based). The
   "Warehouse transfers" card shows a **"N open kiosk requests"** header badge and a per-row
   **"Kiosk request"** amber badge (`StudioInventoryWorkspace.tsx`), and the low item already
   shows under "Kiosk stock needs". Full loop traced via UI
   (`scripts/demo-verify/trace-request-loop.mjs`): cashier requests → warehouse sees the badge +
   count → **Approve → Dispatch** → cashier **Confirm arrived** → K-01 stock rose by exactly the
   requested qty (7 → 20).

10. **Feature added: card-payment reconciliation in the daily close.** End of day, the cashier
    now reconciles **card (terminal) next to cash** at the POS close — a **"Counted card
    (terminal)"** input beside "Counted cash", each showing its expected amount. New model fields
    `expected_card` / `actual_card` / `card_variance` on `bayaan.shift.close` (module upgraded),
    populated by `/shift_close` and the seed. The admin **Daily Close** table now groups **Cash
    (expected/counted/variance)** then **Card (expected/counted/variance)** then stock variance.
    Traced (`scripts/demo-verify/trace-card-close.mjs`): a card sale → close with counted card
    3,000 vs expected 4,000 → **card variance −1,000** stored and shown. (Online/wallet payment
    reconciliation is explicitly deferred — "feature for later" per the client.)

### Post-test state
Groups C/D/E mutated the demo DB during testing; afterward the day was re-seeded
(`~/seed-miza-day.sh`) and test artifacts (shifts, payroll adjustment, waste, transfers)
were removed (`~/cleanup-demo-tests.py`). Final clean baseline: **362,000 sales / 57 orders /
−40,000 cash variance / 3 closes / 0 waste / 0 stray artifacts**, backend healthy.

Re-run anytime: `node scripts/demo-verify/run-all.mjs` →
`apps/kiosk-pos/verification/demo-verify/REPORT.md` + screenshots.
