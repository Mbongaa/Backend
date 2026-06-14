# Bayaan Accounting — Session Handoff (2026-06-13)

Handoff for the next session continuing the accounting work. Everything below is
grounded in code reads + live probes against the running `bayaan` DB (Odoo :8069,
Vite :5174). **All addon + frontend code is uncommitted on the working tree.**

---

## 1. Architecture (read this first)

Bayaan posts the **formal double-entry books into the one real Odoo ledger**
(`account.move` / `account.move.line`) deterministically. The AI never computes
official numbers. The single posting layer is **`models/bayaan_gl.py`** (abstract
model `bayaan.gl`).

**Revenue source-of-truth decision = Option A (deliberate, do NOT change without re-deciding):**
- POS revenue is posted **directly** by `bayaan.gl._bayaan_post_pos_revenue`
  (Dr kiosk Cash / Dr Bank for card · Cr `400000` Product Sales, branch analytic on
  the income leg), per kiosk per day, idempotent by `ref = "Bayaan Sales · <kiosk> · <date>"`.
- Therefore the Odoo `pos.session` is finalized **without** its own Z-report
  `account.move` — Bayaan-closed sessions intentionally have **`move_id = None`**.
  Calling `action_pos_session_closing_control()` would post a SECOND revenue move and
  **double-count** + reintroduce the POS-receivable/outstanding clearing. **Never run
  both revenue sources.**
- Empirically verified (savepoint+rollback on K-01): a *proper* close posts a clean
  balanced move (Cr 400000 / Dr 101300 PoS Receivable, then Dr 101504 Cash / Cr 101300
  → receivable nets to 0; card → 101403 Outstanding Receipts needing bank-rec). So
  Option B (Odoo-native revenue) is viable but requires deleting `_bayaan_post_pos_revenue`
  + a card bank-rec workflow — only adopt with the client's accountant.

**What posts to the GL (all via `bayaan.gl`):** revenue (direct), COGS (Dr `500000` /
Cr `115000` Inventory, from `bayaan.consumption.ledger` + finished-goods std cost),
waste (Dr `605000` / Cr Inventory), payroll (Dr `601000` Salaries & Wages / Cr Bank,
on `action_mark_paid`), opex (Dr `621000`–`629000` by category / Cr Bank), vendor bills
(Dr Inventory / Cr `211000` AP, on PO receipt + invoice_commit), depreciation (Dr
`680000` / Cr `152000` Accumulated Depreciation), opening inventory + owner capital.

**Branch scoping:** kiosk filter applies to **GL + Income Statement only** (true
per-branch P&L). Trial Balance / Balance Sheet / Chart are **company-wide** (counterpart
legs lack the branch analytic, so a single-kiosk TB/BS cannot balance) — `meta.companyWide`
drives a UI note. See `accounting_report` dispatcher in `controllers/api.py`.

---

## 2. Done this session (verified)

**Round 1 — the formal cost side now reaches the GL:** COGS, payroll, opex, vendor
bills/AP, inventory, depreciation, direct revenue. Books moved from "100% gross margin /
only Cash-Difference-Loss expense / −5.88M negative receivable" to real, balanced
statements.

**Round 2 — closed the verified-open audit items:**
- Live POS revenue/COGS/waste now post **at close** (`/shift_close` + `_bayaan_auto_close_session`), scoped per kiosk/day — not seed-only.
- AP payment uses reconciled `account.payment.register` (no GL-vs-subledger drift); `/register_payment` route added.
- `invoice_commit` now creates the vendor bill.
- Branch TB/BS made company-wide.
- 4 new reports (backend + frontend nav/views): **cash flow, aged payables, aged receivables, VAT/tax return**.
- Governance: reverse restricted to manual general-journal entries + reason (blocks Bayaan-system/POS/bank moves); account-type change blocked on posted accounts; clearing/back-dating the fiscal lock requires manager.
- Depreciation posts (straight-line catch-up).

**Round 3 — the session-close regression fix (this is the important one):**
- **Replaced raw `UPDATE pos_session SET state='closed'` with cache-safe ORM
  `session.write({'state':'closed','stop_at':...})`** in all 3 places:
  `controllers/api.py` (shift_close), `models/bayaan_shift_close.py`
  (`_bayaan_auto_close_session`), and `~/seed-miza-accounting.py`. Shared helper
  `bayaan.shift.close._bayaan_finalize_pos_sessions(sessions)`.
  - Empirically confirmed ORM `write({'state':'closed'})` creates **0 account.move**
    (same no-Z-report outcome as raw SQL) and raises no constraint — but is cache-safe
    (the raw SQL had an ORM cache-coherency hazard that blocked same-request reopen).
- **Draft-order guard** added: refuses to close a session with draft orders (raises
  UserError manual / audits on auto-close) instead of silently force-closing.
- **Post-close assertion** in `/shift_close` (search_count of non-closed == 0).
- **AUTH-1 fix:** `payroll_adjustment` route now requires `_require_manager_scope` for
  kiosk-less (HQ) employees (the kiosk-scope path was skipped + `.sudo()` bypassed ACL).
- **HARNESS-1 fix:** `accountant-audit.mjs` now `mkdir -p`s its output dir.

**Live state right now (verified):** TB balanced (all-time 68,607,519 = ; MTD 60,207,519 =),
BS balanced (assets 30,054,181 = L+E+net), revenue 16,726,800 − COGS 4,800,885 −
opex+depr 7,725,784 = **net 4,200,131**; AP 1,440,000 (no drift); 4 new reports return
data + render with no console errors; **vitest 191/191, frontend build clean**.

---

## 3. Remaining backlog (prioritized)

> NOTE on AUTH (per owner, 2026-06-13): keep it simple — **admin/owner, accountant, and
> logistics get the admin UI; staff (cashiers) get the POS only.** Don't over-invest in
> per-button role-gating. The backend already enforces action scopes server-side, and all
> admin-UI roles are trusted. So P0-6 below is LOW priority now.

| # | Item | Why | Where |
|---|------|-----|-------|
| 1 | **Bank reconciliation / outstanding-payment settlement** | `_bayaan_pay_bill` (account.payment) credits `101404` Outstanding Payments — standard Odoo, but no Bayaan surface to reconcile it to `101401` Bank; the demo zeros it via a one-off MISC entry in the reseed. Add a `/bank_settlement` route (manager/accountant) that reconciles `101403`/`101404` lines to bank, replacing the reseed hack. | `bayaan_gl.py` `_bayaan_pay_bill`; new route in `api.py`; reseed step 12 |
| 2 | **Register-payment UI** | `/register_payment` route is real + role-gated but unused by the frontend. Add `sourceOfTruth.registerPayment()` + an accountant-gated "Register payment" action on the **Aged payables** view. | `apps/kiosk-pos/src/services/sourceOfTruth.ts`; `AccountingAged` in `ExactKioskApp.jsx` |
| 3 | **Addon unit tests (lock in the fixes)** | `tests/test_accounting_report_api.py` has NO tests for the 4 new reports nor a double-count tripwire. Add `TransactionCase` tests: cash_flow opening+net==closing & net==asset_cash change; aged_payable total==`211000` residual & buckets sum; tax_report 0% ; **and the critical tripwire: account `400000` must NOT have BOTH a POSS session move AND a "Bayaan Sales" GL move for the same day** (the no-double-count guard); plus a bayaan-closed session has `move_id is None`. | `tests/test_accounting_report_api.py` |
| 4 | **Depreciation cron** | `bayaan.gl._bayaan_post_depreciation` is correct but only runs via reseed/on-demand. Add a monthly `ir.cron` (the addon already has an auto-close cron to model after — `data/` XML). | `data/*.xml`, `bayaan_gl.py` |
| 5 | **CoA cleanup** | ~10 generic l10n_generic_coa template accounts still active with 0 balance (Cash Furn./Clothes/Bakery Shop, Bank Suspense, Outstanding Payments, Liquidity Transfer, Deferred Revenue, Cash Discount Loss/Gain). Archive them in the reseed for a clean Iraqi-looking chart. | `~/seed-miza-accounting.py` |
| 6 | **(LOW) Role-gating UI** | Per the simplified AUTH model above, only cosmetic. If wanted: gate Staff "Save adjustment"/"Add staff"/"Save expense", Settings VAT Apply + Lock/Unlock, daily-close Approve/Reject behind a manager capability flag. Backend already denies. | `ExactKioskApp.jsx` (StaffScreen/SettingsScreen/ClosingScreen) |
| 7 | **(LOW) P1 polish** | Sales subtitle shows stale daily source-counts on monthly scope; "needs review N / all posted" contradiction; GL running-balance only meaningful when one account is filtered; manual-journal modal lacks journal/partner/tax fields (backend already accepts `journal`); server-generated immutable PDF (currently `window.print()`); split TB closing into debit/credit columns; whitelist opex categories. | `ExactKioskApp.jsx`; `api.py` journal_entry |
| 8 | **(SEPARATE) Wiring gate** | `npm run gate:wiring` is RED on **11 pre-existing, non-accounting** violations (Studio dashboard, Overview fiscal sales, admin bootstrap). Unrelated to this work but blocks a green-gate claim. | frontend |

---

## 4. Key files

**Backend addon** (`backend/bayaan_odoo_addons/bayaan_fnb_kiosk/`):
- `models/bayaan_gl.py` — the GL posting layer (revenue/COGS/waste/payroll/opex/bills/depreciation/opening-inventory + `_bayaan_post_kiosk_day` + `_bayaan_pay_bill`).
- `models/bayaan_shift_close.py` — `_bayaan_finalize_pos_sessions` (cache-safe close + draft guard), `_bayaan_auto_close_session`, cron.
- `controllers/api.py` — routes: `accounting_report` (incl. cash_flow/aged_payable/aged_receivable/tax_report + the 3 report helpers), `journal_entry` (reverse governance), `chart_account` (type-change guard), `company_config` (lock authority), `register_payment`, `shift_close` (close hook), `kiosk_capex`, `tax_settings`. `nav_by_role` grants the new report views.
- `models/account_move.py` — lock-date enforcement + branch-analytic-on-P&L + no-delete.

**Frontend** (`apps/kiosk-pos/src/exact-design/ExactKioskApp.jsx`):
- `AccountingScreen` + `ACCOUNTING_REPORT_BY_VIEW` + titles/subtitles + render dispatch.
- New components: `AccountingCashFlow`, `AccountingAged` (kind=payable/receivable), `AccountingTax`.
- `ADMIN_NAV` + `ADMIN_NAV_AR` (the new report nav ids: cashFlow/agedPayable/agedReceivable/taxReport).

**Seed / verify (home dir + repo):**
- `~/seed-miza-demo.sh` — full reseed (steps: unblock→day→history→staff→pos-options→extras→**boost**→**accounting**).
- `~/seed-miza-boost.py` — realistic sales volume; `~/seed-miza-accounting.py` — wipes `account.move`, rebuilds clean books.
- `apps/kiosk-pos/scripts/demo-verify/accountant-audit.mjs` — engine tie-outs + gap probes + screenshots.

---

## 5. Run / verify

```bash
# servers (if down): postgres must be up first
setsid ~/bayaan-venv/bin/python ~/bayaan-odoo/odoo-bin -c ~/bayaan-odoo.conf >> ~/bayaan-odoo.log 2>&1 &
( cd "<repo>/apps/kiosk-pos" && setsid npm run dev >> ~/miza-frontend.log 2>&1 & )

# after addon code changes: restart Odoo (kill by PID on :8069, relaunch) — NO -u needed
#   (no new fields/XML this session; a plain restart re-imports the Python)

# rebuild clean demo books:
bash ~/seed-miza-demo.sh                       # full; or just the accounting layer:
~/bayaan-venv/bin/python ~/bayaan-odoo/odoo-bin shell -c ~/bayaan-odoo.conf -d bayaan --no-http < ~/seed-miza-accounting.py

# verify:
cd <repo>/apps/kiosk-pos && npm test && npm run build
node scripts/demo-verify/accountant-audit.mjs   # logs in as accountant noor@miza.iq, tie-outs + screenshots
```

Logins (all pw `test`): owner@miza.iq (superadmin), layla@ (manager), hassan@ (logistics),
noor@ (accountant), zainab@ (cashier/POS).

---

## 6. Invariants — do not break

1. **One revenue source.** Direct `bayaan.gl` posting is it; do NOT call
   `action_pos_session_closing_control` while direct posting is on (double-count).
2. **System move refs are prefixed** `"Bayaan "` / `"Kiosk CapEx"` — the reversal
   governance keys off this to block undoing system entries. Any new poster must keep the prefix.
3. **Bayaan-closed sessions have `move_id = None` by design** — not an anomaly.
4. **P&L lines need a branch/HQ analytic** or `account_move.py` rejects the post.
5. **Never raw-SQL a pos.session state** — use `_bayaan_finalize_pos_sessions`.
6. Re-seed for a pristine GL; posted moves can't be deleted (reversal-only).
