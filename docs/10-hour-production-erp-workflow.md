# 10-Hour Production ERP Workflow

This is the execution framework for a minimum 10-hour autonomous Bayaan production-readiness run. It is meant to be started later when the user explicitly says to execute it.

The 10 hours are a minimum, not a stopping point. If the release gate is not green after Hour 10, continue iterating in additional hourly cycles until the system is truthfully production-ready for the defined pilot scope or a real external blocker is reached and documented.

Start phrase:

```text
Start the 10-hour production ERP run using docs/10-hour-production-erp-workflow.md
```

## Mission

Turn Bayaan from a polished dashboard prototype with partial wiring into a tested, locally live, Odoo Community-backed F&B kiosk operating system prototype that proves the client workflow end to end:

Central Warehouse -> optional City/Area Warehouse -> Kiosk stock allocation -> POS sale -> recipe-based ingredient deduction -> expected remaining stock -> actual closing count -> variance/loss/waste report -> daily/weekly/monthly management reports.

Bayaan remains the visible product. Odoo Community is the hidden deterministic engine for POS, stock, payments, purchases, accounting, and audit records.

## Non-Negotiables

- Do not edit `backend/odoo/`.
- Add backend logic only under `backend/bayaan_odoo_addons/bayaan_fnb_kiosk/`.
- Do not introduce paid per-user SaaS dependencies.
- Do not make React POS a second production POS path.
- Every kiosk must have its own stock location.
- Every paid POS order must resolve the kiosk and deduct recipe ingredients from that kiosk location.
- Recipe versioning must remain effective-date based.
- Daily close must compare expected vs actual stock and cash.
- Payment methods and Iraqi gateway providers must stay separated in reports.
- AI is read-only commentary over verified deterministic records.

## Production-Ready Definition For This Run

For this run, "production ready" means ready for a serious pilot demo and technical handoff, not magically ready for unattended live stores without client credentials/accountant input.

Required proof:

- Odoo Community can start locally with the Bayaan addon installed.
- A fresh local database can be initialized or upgraded with the addon.
- Seed data exists for the 10-kiosk Baghdad pilot: kiosks, stock locations, products, recipes, ingredients, payment methods, suppliers, and basic staff.
- The dashboard can run in live mode against Odoo, not only mock mode.
- At least one end-to-end variance loop is proven from source data.
- The dashboard buttons that matter for operations are wired or explicitly disabled with honest state.
- Frontend tests, build, smoke, backend syntax checks, XML checks, and at least one live Odoo API verification pass are green or documented with blocker evidence.
- Hourly reports exist with time stamps and verification sections.

Do not stop while known fixable issues remain in core flows. Keep iterating through implementation, edge cases, verification, and polish until the remaining items are either solved or explicitly external to the codebase.

Out of scope unless credentials are provided:

- Real Zain Cash, FIB, Qi, NassWallet, FastPay, or AsiaHawala merchant API settlement calls.
- Iraqi chart of accounts final mapping.
- Production hosting, domain, SSL, backups, and live payment credentials.

## Hourly Report Rule

Create one report every hour, minimum 10 reports. If the work continues past Hour 10, keep creating reports with increasing numbers:

```text
docs/hourly-reports/production-erp/YYYY-MM-DD-report-01.md
docs/hourly-reports/production-erp/YYYY-MM-DD-report-02.md
...
docs/hourly-reports/production-erp/YYYY-MM-DD-report-10.md
docs/hourly-reports/production-erp/YYYY-MM-DD-report-11.md
...
```

Each report starts with exact current local time:

```md
# Report 01

Current time: 2026-05-12 HH:MM Europe/Amsterdam

## Produced

## Verify

## Findings

## Blockers / Risks

## Next Plan
```

The `Verify` section must include concrete commands, screenshots, API calls, or database observations. If a step cannot be verified, say why and adjust the next plan.

## Operating Rhythm

Before edits:

- Read the relevant current code.
- Check current git status.
- Protect user changes.
- Create or update a short task checklist.

During each hour:

- Implement, verify, write report.
- Prefer narrow, functional changes over broad redesign.
- Keep dashboard flow calm, direct, and operational.
- Avoid fake-working buttons. Wire them, disable them, or label the real state.

After each report:

- Re-plan the next hour from verified reality, not from the original plan.
- If the release gate is red, identify the next highest-risk edge case or broken flow and keep going.

## Continue-Until-Ready Loop

After Hour 10, repeat this loop every hour until all production gates are green or a true external blocker exists:

1. Re-run the current release gate or the failing subset.
2. Pick the highest-risk failing item.
3. Fix the smallest real slice that moves the system toward production readiness.
4. Test the fix directly.
5. Run broader regression checks when the fix touches shared logic.
6. Update the hourly report with proof.
7. Reassess remaining blockers and continue.

The system is not considered done just because the dashboard renders. Done means the operational workflow is natural, core buttons work or are honestly unavailable, data comes from Odoo in live mode, deterministic accounting/stock/payment records agree, and edge cases have been tested.

## Payment Gateway Direct-Integration Rule

ZainCash and FIB must be treated as real provider integrations, not only payment labels, when the production-readiness run reaches payments.

Implementation rules:

- Re-check official developer documentation during the run because payment APIs and sandbox rules can change.
- Provider secrets live only server-side in Odoo/Bayaan configuration or environment variables.
- The React dashboard may initiate an action through Bayaan APIs, but must never call ZainCash/FIB directly with secrets.
- Every provider transaction needs an idempotent Bayaan reference that links back to the POS order/session/payment method.
- Gateway success alone must not invent a sale. The sale remains official only when reconciled into the hidden POS/Odoo payment lifecycle.
- Webhooks and callbacks must be idempotent; duplicate provider events must not double-post payments, stock moves, or ledger rows.
- Pending, failed, expired, canceled, refunded, and callback-mismatch states must be visible to managers.
- If merchant credentials are missing, implement the provider abstraction, config fields, mocked/sandbox-compatible tests, and activation checklist, then mark real production activation blocked on credentials.

Provider docs to consult at execution time:

- ZainCash Payment Gateway v2: `https://docs.zaincash.iq/`
- ZainCash business gateway FAQ: `https://www.zaincash.iq/business/payment-gateway-faq`
- FIB Web Payments: `https://fib.iq/integrations/web-payments/`
- FIB Node.js SDK: `https://first-iraqi-bank.github.io/fib-nodejs-payment-sdk/`

## Required Edge Case Pass

Before declaring the run complete, test or document every item below:

- Paid order with active recipe deducts correct ingredient and packaging quantities.
- Paid order with missing recipe is visibly flagged, not silently accepted.
- Recipe version change does not rewrite historical consumption.
- Finished SKU product does not double-deduct recipe ingredients.
- Hybrid product consumes both finished SKU and recipe components when configured.
- Kiosk stock shortage respects the configured warning/strict/soft policy.
- Stock transfer to wrong or missing kiosk is rejected with a useful error.
- Daily close with missing cash count remains unresolved.
- Daily close approval/rejection preserves cashier count and manager review separately.
- Cash expected excludes card, QR, wallet, FIB, Zain Cash, and manual digital payments.
- Refunds/voids/discounts remain visible in POS monitor and reports.
- Zain Cash, FIB, Qi Card/SuperQi, NassWallet/NASS Pay, FastPay, AsiaHawala, card, QR, and manual bank transfer classify correctly.
- Report CSV exports method and provider payment rows.
- ZainCash and FIB direct gateway adapters are implemented backend-side against current developer docs, or are blocked only by missing merchant credentials after sandbox/mock verification.
- Dashboard handles empty live database states gracefully.
- Dashboard handles backend route errors with visible error state.
- Arabic RTL smoke still passes.
- No visible Odoo branding appears in the Bayaan dashboard.
- No text overlap in desktop and mobile screenshots.
- AI insight cards only cite deterministic source counts/rows and do not invent official totals.

Each edge case must be marked `passed`, `blocked`, or `deferred with reason` in the final report.

## Hour 0 / Start Gate

Goal: establish exact starting state and choose the live Odoo strategy.

Tasks:

- Record current time and create `report-01.md`.
- Inspect `git status --short`.
- Run frontend baseline: `npm run verify`.
- Run backend syntax/XML baseline.
- Confirm whether Odoo will run through WSL, Docker, or an already-installed local server.
- Check `.env` and decide live URL strategy:
  - local Vite proxy: `VITE_ODOO_URL=/odoo`
  - target: `VITE_ODOO_TARGET=http://127.0.0.1:8069`
  - no browser-exposed production secret.

Verify:

- Baseline command outputs.
- Clear list of broken/unwired dashboard buttons.
- Clear list of live Odoo blockers, if any.

## Hour 1 / Local Odoo Bring-Up

Goal: make Odoo Community run with Bayaan addon available.

Tasks:

- Add or repair local run documentation and scripts as needed.
- Prefer Docker/WSL if Windows-native Odoo dependencies block progress.
- Start Odoo with addons path:
  - `backend/odoo/addons`
  - `backend/bayaan_odoo_addons`
- Create or upgrade database `bayaan`.
- Install required modules: `point_of_sale`, `stock`, `purchase`, `account`, `bayaan_fnb_kiosk`.

Verify:

- Odoo web is reachable.
- Bayaan addon is installed.
- No Odoo core edits.
- `/bayaan/api/warehouse_setup` or another authenticated route responds after login.

## Hour 2 / Pilot Data Foundation

Goal: seed a believable 10-kiosk Baghdad pilot.

Tasks:

- Add deterministic demo/seed tooling inside the addon or a safe script.
- Create central warehouse and kiosk locations.
- Create 10 kiosks/stalls with POS configs.
- Create ingredients, packaging, finished SKUs, recipes, suppliers, and costs.
- Create payment methods for Cash, Card, QR, Zain Cash, FIB, Qi Card/SuperQi, NassWallet, FastPay, AsiaHawala, manual bank transfer.

Verify:

- Each kiosk has a unique `stock.location`.
- POS configs map to kiosk stock locations.
- Payment methods have Bayaan gateway providers.
- Products have correct consumption modes: `recipe`, `finished`, `hybrid`, or `none`.

## Hour 3 / Live Dashboard Bootstrap

Goal: dashboard reads real Odoo data when live mode is configured.

Tasks:

- Harden `chain_bootstrap` payload for all admin pages.
- Make frontend distinguish live vs demo clearly in code and behavior.
- Ensure fallback mock mode remains available for design review.
- Add visible operational empty states where live data is missing.

Verify:

- Frontend can load through Vite proxy while logged into Odoo.
- Network calls hit `/bayaan/api/chain_bootstrap`.
- Dashboard values change from Odoo seed data.
- Smoke still passes.

## Hour 4 / Operational Button Audit And Wiring

Goal: eliminate fake controls from core operations.

Tasks:

- Audit every visible admin button/dropdown/filter.
- Wire or disable:
  - stock transfer create
  - recipe save/version activate
  - purchase order draft/confirm
  - daily close approve/reject/note
  - waste entry review
  - report export
  - payment/provider filters
  - kiosk drilldowns
- Add honest loading/error/toast states.

Verify:

- Button audit table in hourly report.
- All core buttons either perform an action or show disabled/unavailable state.
- No misleading success states.

## Hour 5 / POS Sale And Recipe Deduction Proof

Goal: prove deterministic recipe deduction through the hidden POS engine.

Tasks:

- Create or simulate paid Odoo POS orders through the Odoo POS-compatible path.
- Ensure `pos.order` resolves `bayaan.kiosk`.
- Verify `_bayaan_post_recipe_consumption` creates immutable ledger rows.
- Verify kiosk `stock.location` loses ingredients/packaging according to active recipe version.
- Verify missing recipe and failed posting states are visible.

Verify:

- One orange juice sale deducts exact ingredients.
- Ten orange juices deduct:
  - Orange: 3.5 kg
  - Sugar: 0.1 kg
  - Cups: 10
  - Straws: 10
- Ledger rows reference order, kiosk, product, recipe version, ingredient, qty, and cost.

## Hour 6 / Daily Closing And Variance Loop

Goal: make expected-vs-actual closing operational.

Tasks:

- Wire daily close creation/review from Odoo data.
- Ensure stock count lines compare expected vs actual.
- Ensure cash expected uses cash-only payment totals.
- Keep digital/gateway totals separated from cash drawer count.
- Add investigation status and manager decision states.

Verify:

- Closing calculation matches:
  `opening + transfers - recipe consumption - waste = expected closing stock`.
- Actual counts create variance lines.
- Manager approval/rejection is auditable.
- Reports and kiosk detail reflect the close.

## Hour 7 / Purchases, Suppliers, And Stock Allocation

Goal: make warehouse-to-kiosk flow natural.

Tasks:

- Improve stock allocation UI around central warehouse -> kiosk transfer.
- Add pending transfer status clarity.
- Wire purchase order draft/confirm for suppliers.
- Show low-stock and suggested-transfer logic from deterministic stock and consumption data.

Verify:

- Transfer action creates Odoo `stock.picking` or documented pilot state.
- Purchase draft creates Odoo `purchase.order`.
- Suggested transfers are traceable to stock levels and consumption pace.

## Hour 8 / Payments And Iraqi Gateway Reconciliation

Goal: make ZainCash, FIB, and local providers operational in reporting, and implement direct gateway adapters where public/sandbox docs and credentials allow.

Tasks:

- Verify payment methods classify by configured provider first, alias second.
- Add settlement/provider views where useful.
- Ensure reports separate cash, card, QR, wallet, bank app, manual digital, other digital.
- Ensure provider split separates Zain Cash, FIB, Qi, NassWallet, FastPay, AsiaHawala.
- Look up the latest official developer docs before coding provider-specific flows:
  - ZainCash: `https://docs.zaincash.iq/`
  - FIB Web Payments: `https://fib.iq/integrations/web-payments/`
  - FIB Node SDK: `https://first-iraqi-bank.github.io/fib-nodejs-payment-sdk/`
- Add a backend-only payment gateway abstraction. Browser code must never hold `client_secret`, API secret, merchant secret, or production payment credentials.
- Implement `zain_cash` adapter requirements from docs:
  - OAuth token request.
  - Transaction init.
  - Redirect URL handling.
  - Transaction inquiry.
  - Reverse/refund.
  - Redirect callback token verification.
  - Webhook receiver with idempotency.
  - IQD-only amount validation.
- Implement `fib` adapter requirements from docs:
  - OAuth2 client credentials.
  - Create payment.
  - Check payment status.
  - Cancel active payment.
  - Refund if SDK/API supports it.
  - Callback URL handling.
  - Sandbox vs production environment config.
- Store provider transaction IDs, external references, status, raw status payload hash/reference, and Odoo `pos.payment`/order link in a Bayaan model.
- Add admin settlement views for pending, successful, failed, expired, canceled, refunded, and callback-mismatch statuses.
- If real merchant credentials are unavailable, build adapters behind mocked/sandbox-compatible tests and mark production credential activation as an external blocker.

Verify:

- Seed payments show by category and by provider.
- Cash expected excludes all digital providers.
- Report CSV includes provider rows.
- ZainCash adapter tests cover token, init, inquiry, reverse/refund, callback/webhook idempotency, and error statuses.
- FIB adapter tests cover token, create payment, status, cancel, refund where available, callback, and sandbox/production env switching.
- Payment secrets are not present in frontend `.env`, `VITE_*`, browser bundles, screenshots, or logs.
- Provider-created payments do not create a second official sale path; they attach to the existing POS/Odoo payment lifecycle or remain pending until the source POS order is reconciled.

## Hour 9 / Dashboard Polish And Natural Workflow

Goal: make the dashboard feel like a calm command center, not disconnected screens.

Tasks:

- Smooth the owner workflow:
  - Today Command Center -> issue -> kiosk detail -> close/transfer/action.
  - Stock alert -> suggested transfer -> transfer created.
  - Recipe margin issue -> product recipe -> version saved.
  - Payment issue -> provider settlement view.
- Improve empty/loading/error states.
- Keep visual polish restrained and operational.
- Remove or disable non-functional decorative controls.

Verify:

- Browser screenshots for desktop and mobile.
- No visible Odoo branding.
- No text overlap.
- Core workflows are clickable end to end.

## Hour 10 / Release Gate And Handoff

Goal: produce a truthful production-readiness package.

Tasks:

- Run full frontend verify.
- Run backend Python/XML checks.
- Run live Odoo API verification.
- Update `HANDOFF.md`, `docs/production-readiness.md`, and demo script if needed.
- Create final hourly report and final summary.

Verify:

- `npm run verify` passes.
- Backend syntax/XML checks pass.
- Live Odoo route proof exists.
- Known gaps are listed honestly.
- Final report includes what is ready, what is pilot-ready, and what still requires credentials/client input.

If any release gate remains red, Hour 10 is not the end. Start Hour 11 using the Continue-Until-Ready Loop.

## Stop / Escalation Conditions

Pause and report clearly if:

- Odoo cannot run because dependencies are missing and no Docker/WSL route is available.
- Database creation requires credentials not present.
- A real payment provider API requires merchant credentials.
- A change would require editing Odoo core.
- The requested production claim would be dishonest without accountant/payment/provider input.

## Final Deliverables

At the end of the run:

- Minimum 10 hourly reports.
- Working live-mode dashboard against local Odoo, or blocker evidence.
- Seeded pilot dataset or seed tooling.
- Wired core admin actions.
- Verified recipe deduction and variance loop.
- Payment gateway provider reconciliation.
- Updated documentation and demo script.
- Clear list of remaining production blockers.
