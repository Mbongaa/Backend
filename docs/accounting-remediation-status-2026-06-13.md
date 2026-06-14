# Accounting Remediation — Status & Evidence (2026-06-13, overnight session)

This records the work done against
`docs/accounting-remediation-handoff-2026-06-13.md`, with verified commands and
results. Every claim below was reproduced with a read, a test run, or a live
read-only reconciliation. Re-run the gates before trusting any line.

## Gate status (verified this session)

| Gate | Command | Result |
| --- | --- | --- |
| Frontend unit tests | `npm test` | **192 passed** (was 191; +1 reversal-payload test) |
| Wiring gate | `npm run gate:wiring` | **passed** (11 stale assertions corrected to verify the real guards) |
| Frontend build | `npm run build` | **passed** (large-chunk warning only) |
| Demo smoke | `npm run smoke` | **passed, exits 0** (fixed: modifier resolution + clean exit) |
| Full frontend gate | `npm run verify` | **passes** (test + wiring + build + smoke) |
| Clean disposable Odoo addon tests | `scripts/odoo-addon-test.sh` | **152 tests, 0 failed, 0 errors** (was 146/3-failing) |
| Live source→ledger reconciliation | `scripts/reconcile-books.py` (Odoo shell) | **all tie-outs PASS** (see below) |

Addon test runner now works in this environment via the new `PYTHON_BIN` /
`ADDONS_PATH` overrides (`scripts/odoo-addon-test.sh`):

```bash
ODOO_DIR=/home/hassan/bayaan-odoo PYTHON_BIN=/home/hassan/bayaan-venv/bin/python \
ADDONS_PATH="/home/hassan/bayaan-odoo/addons,/mnt/c/Users/HP/Desktop/Erbil project/Backend/backend/bayaan_odoo_addons" \
DROP_FAILED_DB=1 DB=bayaan_codex_round4 HTTP_PORT=8081 bash scripts/odoo-addon-test.sh
```

## Live reconciliation (read-only, against the demo `bayaan` DB after reseed)

`~/bayaan-venv/bin/python ~/bayaan-odoo/odoo-bin shell -c ~/bayaan-odoo.conf -d bayaan --no-http < scripts/reconcile-books.py`

```
[1] POS orders: 2276 paid   gross=16,726,800   tax=3,522   net=16,723,278
    Posted Product Sales (400000) credit = 16,723,278
    Posted VAT Payable   (251000) credit = 3,522
    revenue + VAT = 16,726,800  (POS gross = 16,726,800)  -> TIE
[2] COGS 4,800,885   Waste 32,450   Inventory 4,570,715
[3] Salaries 6,775,000   Accounts Payable 1,440,000
[4] Trial balance: 68,157,519 == 68,157,519  -> BALANCED
[5] Assets 30,054,181 == Liab 1,443,522 + Equity 24,414,050 + NetIncome 4,196,609  -> TIE
[6] Cash/Bank closing 17,316,800
[7] 23 closed POS sessions, 0 paid-order days WITHOUT a Bayaan Sales move  -> OK
[8] Income (400000) lines NOT from a 'Bayaan Sales' move = 0  -> OK (single revenue source)
```

This is the end-to-end proof: sale → posted net revenue + VAT → COGS/inventory →
balanced statements, with no lost transactions and no double-counted revenue.

## Stop-ship findings

### P0.1 — POS session close / single revenue source
- The raw `UPDATE pos_session` SQL was **already removed** before this session
  (`bayaan_shift_close.py:_bayaan_finalize_pos_sessions` uses a cache-safe ORM
  write with a draft-order guard; `rg "UPDATE pos_session"` returns nothing).
- **Decision (documented exception, allowed by the handoff):** Bayaan keeps the
  deliberate single revenue source — `bayaan.gl._bayaan_post_pos_revenue` posts
  revenue directly; the Odoo session intentionally has no Z-report move. This was
  the prior engineer's empirically-validated choice (switching to the native POS
  close needs a card bank-rec workflow and the client's accountant). The handoff
  permits a custom move if no duplicate/missing revenue is proven — reconciliation
  items [7] (0 sessions missing a revenue move) and [8] (0 non-Bayaan income
  lines) are that proof, plus the addon double-count tripwire test.

### P0.2 — Source-based idempotency (no lost transactions) — FIXED
- `bayaan_gl.py` revenue/COGS/waste no longer treat a per-kiosk/day `ref` as a
  one-shot key. Each poster recomputes the true total from source rows and posts
  only the **delta** vs. what the ledger already holds (`_bayaan_posted_net` +
  `_bayaan_delta_ref`). A second session, a late order, a refund or a retry now
  posts/corrects exactly once. Markerless (GL-derived), so **no schema change and
  no `-u`** — works on the live data immediately.
- Tests: `tests/test_bayaan_gl.py::test_revenue_delta_posts_each_source_once_and_retry_is_idempotent`,
  `::test_cogs_delta_tracks_new_consumption`,
  `::test_bayaan_close_posts_no_session_move_no_double_count`.

### P0.3 — VAT posted by POS revenue — FIXED
- `_bayaan_post_pos_revenue` splits gross into net (Product Sales) + VAT Payable
  (251000) using Odoo's authoritative per-order `amount_tax`; degenerates to the
  old behaviour at 0%. VAT is posted as a plain liability line (NOT through Odoo's
  tax engine, which would auto-generate a duplicate tax line on a manual entry).
- The VAT return (`_accounting_tax_report`) surfaces this 251000/400000 movement
  so the filing ties. Live proof: net 16,723,278 + VAT 3,522 = gross 16,726,800.
- Tests: `::test_revenue_splits_inclusive_vat_into_liability`,
  `::test_revenue_zero_vat_posts_no_liability_line`.

### P0.4 — Accountant capability model
- **Server enforcement (the real boundary) is correct** and was verified route by
  route: VAT change → `_require_manager_scope` (accountant denied); fiscal-lock
  clear → manager-only (accountant can tighten, not re-open — `company_config`
  lines ~5240); payroll/staff → manager; PO/supplier/receive → procurement scope;
  close approve/reject → kiosk/manager scope.
- Added a server **capability map** (`_role_capabilities`) on `auth_status`/
  `chain_bootstrap` mirroring those guards so the UI can hide controls a role
  cannot use.
- **Remaining (follow-up):** wiring the capability map into per-button
  hide/disable across closing/suppliers/staff/settings. Per the product owner's
  recorded decision (keep AUTH simple; admin-UI roles trusted) this is cosmetic —
  the server already denies the actions. Tracked, not done tonight.

### P0.5 — Manual-journal reversal contract — FIXED
- Backend already required a reason; added a shared `_journal_reverse_eligibility`
  helper used by BOTH the reverse action and the detail endpoint, which now
  serializes `canReverse` + `reverseBlockedReason`.
- Frontend gateway `reverseJournalEntry(id, reason, date?)` now sends the reason;
  the detail modal has a required reason field + confirm, and only offers Reverse
  for backend-eligible (manual general-journal) entries.
- Tests: addon `test_accounting_report_api` (missing reason blocked, system entry
  blocked, eligible reverses with reason); frontend `sourceOfTruth.test.ts`
  reversal-payload test.

### P0.6 — Vendor bill partial-receipt overbilling — FIXED
- `_bayaan_create_vendor_bill` now bills `qty_received - qty_invoiced` per line
  (never the ordered quantity), links `purchase_line_id` so Odoo maintains
  `qty_invoiced` natively (partial + second receipt + multiple bills), and carries
  supplier ref / document date / payment terms / currency / PO attachments onto the
  real bill. (Also fixed the Odoo-19 field name `taxes_id` → `tax_ids`.)
- Test: `::test_vendor_bill_does_not_bill_unreceived_quantity`.
- **Remaining (follow-up):** `register_payment` route + capability exist and are
  used to settle AP; surfacing a "Register payment" button on the Aged-payables
  view is a small frontend follow-up.

## Completeness items

- **Cash flow** — rewritten with operating/investing/financing classification,
  proportional multi-line allocation (no more `others[:1]`), opening/net/closing,
  and a `reconciled` flag vs. the cash/bank balance (`_accounting_cash_flow`).
- **Report titles** — `cashFlow`/`agedPayable`/`agedReceivable`/`taxReport` are in
  both EN and AR nav maps and have AccountingScreen titles+subtitles (already done).
- **Period close** — company lock + separation-of-duties governance exists
  (accountant tightens, manager re-opens). A dedicated checklist UI is a follow-up.
- **Bank reconciliation** — not implemented (deferred). The "accountant never opens
  Odoo" promise must be narrowed in Settings copy before claiming completeness.

## Verification infrastructure repaired

- `scripts/odoo-addon-test.sh` — `PYTHON_BIN` + `ADDONS_PATH` overrides for this env.
- Time-dependent HR/accounting tests — dates derived from `context_today` (not
  May→June); reversal test sends the now-required reason.
- `scripts/smoke.mjs` — two real bugs fixed: (1) menu items carry their category so
  modifier resolution works on the "All" tab (coffee no longer loses milk/extras);
  (2) the success path now tears down the dev server and exits 0 (was hanging).
- `scripts/demo-verify/accountant-audit.mjs` — visits the 4 new report pages,
  replaced the stale `period_lock`/`register_payment` probes with the live
  `company_config`/`tax_settings` routes + capability check, and now FAILS non-zero
  on a missing page, a broken report tie-out, or a console/page error.

## Live deploy performed
1. Restarted Odoo (8069) so the HTTP server runs the new addon code (no `-u` — the
   only new account, 251000 VAT Payable, is created on demand; no schema/XML change).
2. Reseeded the books: `~/seed-miza-accounting.py` (wipes `account.move`, re-posts
   the whole ledger via `bayaan.gl`). Result: TB balanced, BS balanced, net 4.2M.
3. Restarted the frontend dev server (5174).

## Addendum (2026-06-14): Finance overview rooted-in-ledger check

Verified the **operational** Finance overview (`ReportsScreen mode="finance"`, which reads
`chain_bootstrap` → `odooReportMetrics`/`odooSummary`) against the **formal** ledger
(`account.move` via `accounting_report`). Tool: `scripts/demo-verify/verify-finance-vs-ledger.mjs`.

It IS rooted in the real Odoo DB (not demo — `sourceDriven`/`canUseDemoFallback` guards), and
**revenue ties** (operational gross 16,726,800 = ledger net 16,723,278 + VAT 3,522). But the
check surfaced a real bug, now **fixed**:

- **COGS was understated.** The operational COGS summed only the recipe consumption ledger
  (2,007,885) and **omitted finished/hybrid std-cost COGS** (2,793,000 — e.g. cake slices). The
  GL poster includes it, so the books were right but the Finance overview overstated gross margin
  (~88% instead of the real ~71%). Fixed in `chain_bootstrap` (`report_period_summary` for
  daily/weekly/monthly/yearly **and** the daily per-kiosk `kiosk_summaries`) to add finished-goods
  std cost, mirroring `_bayaan_post_cogs`. Re-verified: **operational COGS 4,800,885 = ledger
  4,800,885 (delta 0)**.
- **Payroll is a deliberate difference, not a bug.** The Finance overview shows a month-to-date
  **prorated payroll accrual** (3,108,333) while the formal P&L has the **full posted run**
  (6,775,000). This is the documented managerial accrual-vs-posted treatment. Consequence: the
  Finance-overview *net* profit is higher than the formal P&L net (which also folds payroll, waste
  and depreciation into "opex"). **Decision needed:** keep the managerial run-rate accrual (and
  label the Finance overview as operational, distinct from the Income Statement) or switch it to
  the posted figure. Gross profit reconciles either way.

## Definition of Done — status
- [x] No raw SQL changes Odoo workflow states.
- [x] Same-day multiple sessions / late transactions cannot be lost (delta posting + live proof [7]).
- [x] Revenue, VAT, payments, COGS, inventory reconcile (live proof [1][2][5]).
- [x] Partial receipts cannot overstate vendor bills.
- [x] Manual reversals require reasons; system moves protected.
- [x] Cash flow classified (operating/investing/financing) and reconciles.
- [x] Accountant write routes server-denied (verified); capability map surfaced.
- [x] `npm run verify` passes; clean addon tests pass (152/0/0).
- [x] Accounting pages have titles, Arabic labels, no console errors (audit script).
- [x] Live source→ledger reconciliation passes.
- [x] AGENTS.md and CLAUDE.md still match.
- [ ] Bank reconciliation in Bayaan (deferred — narrow the Settings promise).
- [ ] Per-button accountant UI gating wired from the capability map (server already enforces).
- [ ] AP "Register payment" button on Aged payables (route + capability exist).
- [ ] Refund / refund-VAT browser scenario captured (delta posting handles negative deltas; not browser-walked).
```
