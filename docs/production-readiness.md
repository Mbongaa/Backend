# Production Readiness

## Current Status

The Bayaan kiosk project is demo-ready and MVP-foundation ready. It is not ready to process live business transactions until the real Odoo Community backend, authentication, deployment, and hardware flows are connected and tested.

## Verified Today

- Frontend domain tests pass.
- Production frontend build passes.
- Browser smoke test passes for the exact admin shell, admin sections, POS login, paired customer-facing display, sale, payment prompt, payment completion, waste entry, Arabic RTL, and narrow-screen rendering.
- The exact Anthropic design bundle was ported into a production Vite module instead of relying on browser Babel/CDN React at runtime.
- High-severity npm audit passes with zero vulnerabilities.
- Bayaan Odoo addon Python files compile.
- Bayaan Odoo XML views parse.

## Hardening Already Added

- Recipe-based stock deduction is deterministic and covered by domain tests.
- The exact design runtime has a clean POS sale, payment, waste, and customer-facing display flow.
- Customer-facing display mirrors the POS cart, payment prompt, and payment completion states without exposing cashier/admin controls.
- Narrow-screen rendering avoids crushed text by preserving the exact desktop/tablet canvas and allowing horizontal scroll.
- Frontend source-of-truth gateway now targets Bayaan Odoo controller routes.
- Frontend can hydrate one shared chain state from the backend bootstrap snapshot.
- Recipe publish action maps to submitted Bayaan recipe-version records.
- Odoo `pos.order` hook posts recipe ingredient consumption from the selected kiosk location.
- `bayaan.consumption.ledger` now records the official expected ingredient consumption for POS sales.
- Bayaan product consumption modes distinguish kiosk-made recipe products, finished stock products, hybrid products, and non-stock products.
- Recipe products are excluded from Odoo's standard finished-SKU stock movement so drinks do not double-consume stock.
- Recipe, waste, stock transfer, purchase, and shift-close server validations were added.
- Shift close now stores counted-stock lines with expected, actual, and variance quantities.

## Launch Blockers Before Live Production

- Install and configure real Odoo Community with POS, Inventory, Purchase, Accounting/Invoicing, and the Bayaan addon.
- Configure one `bayaan.kiosk`, Odoo POS config, and Odoo internal stock location per kiosk.
- Connect the existing bootstrap adapter to authenticated production API resources and validate real item/kiosk code mapping.
- Validate paid Odoo `pos.order` ingredient deduction and stock/accounting postings.
- Validate that recipe products, finished goods, and hybrid products are configured with the correct Bayaan consumption mode.
- Build/polish the Odoo POS Owl UI patches that make the cashier screen match Bayaan's minimal design while retaining the Odoo POS engine.
- Implement real login, roles, user permissions, and kiosk scoping.
- Add offline queue/sync conflict handling for weak kiosk internet.
- Test receipt printers, cash drawers, tablets, and browser/device constraints.
- Test the physical customer-facing display hardware, orientation, brightness, and network/session pairing in a real kiosk setup.
- Configure backups, monitoring, logs, deployment, and restore drills.
- Validate chart of accounts, tax treatment, reports, and invoice formats with the client's accountant.

## Practical Verdict

Ready for a serious client demo and technical pilot planning. Not ready for live production operations yet.
