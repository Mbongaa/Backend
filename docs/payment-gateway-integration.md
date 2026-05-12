# Payment Gateway Integration

Bayaan treats payment gateways as configurable settlement providers behind POS payment methods. The official sale, session, receipt, and payment row still come from the POS engine. Bayaan reads those rows, classifies the payment method, and reports category and provider totals for reconciliation.

## Seed Provider Catalog

| Provider ID | Visible label | Category | Settlement bucket | Typical aliases |
| --- | --- | --- | --- | --- |
| `zain_cash` | Zain Cash | Mobile wallet | Gateway batch | Zain Cash, ZainCash, Zain Wallet |
| `fib` | FIB | Bank app | Gateway batch | FIB, First Iraqi Bank, FIB QR |
| `qi_card` | Qi Card / SuperQi | Card | Bank batch | Qi Card, SuperQi |
| `nass_wallet` | NassWallet / NASS Pay | Mobile wallet | Gateway batch | NassWallet, NASS Pay, NassPay |
| `fastpay` | FastPay | Mobile wallet | Gateway batch | FastPay, Fast Pay |
| `asia_hawala` | AsiaHawala | Mobile wallet | Gateway batch | AsiaHawala, Asia Hawala, Asiacell Hawala |
| `bank_card` | Bank card terminal | Card | Bank batch | Card, Visa, Mastercard, terminal |
| `generic_qr` | Generic QR | QR | Gateway batch | QR, QR code |
| `manual_bank_transfer` | Manual bank transfer | Manual digital | Manager verified | Bank transfer, manual bank |
| `other_digital` | Other digital | Other digital | Gateway batch | Online, e-payment |

## Backend Contract

- `pos.payment.method.bayaan_gateway_provider` stores the optional provider ID.
- `pos.payment.method.bayaan_gateway_external_id` stores an optional merchant, terminal, wallet, or gateway identifier for settlement reconciliation.
- `pos.payment.method.bayaan_gateway_settlement_window` stores expected settlement timing.
- `/bayaan/api/payment_gateways` returns the catalog and configured POS payment methods.
- `/bayaan/api/chain_bootstrap` returns `summary.payments.by_provider` alongside the existing cash/card/QR/wallet/manual category totals.
- `/bayaan/api/payment_transaction` creates a Bayaan gateway transaction record. In `mock: true` mode it returns sandbox-safe FIB/ZainCash-style payloads for UI and webhook testing. Without mock mode it refuses to run until server-side merchant credentials are configured.
- `/bayaan/api/payment_transaction_action` polls or updates a transaction status, and protects cancel/refund actions by role.
- `/bayaan/payment/webhook/<provider>` records provider callbacks with an idempotent event key and a transaction-specific callback secret. Duplicate callbacks do not double-count payment status.
- Direct gateway credentials, such as ZainCash or FIB client secrets, must be stored server-side only. Do not put payment secrets in `VITE_*` variables or browser code.

If `bayaan_gateway_provider` is empty, Bayaan falls back to POS payment metadata and method-name aliases. This keeps the pilot usable while still giving production a deterministic configuration point.

## Direct Gateway Adapter Scope

The payment provider catalog is the reporting layer. Direct collection flows require provider adapters behind Bayaan APIs.

### ZainCash

Use the current official ZainCash docs during implementation: <https://docs.zaincash.iq/>.

The adapter should support:

- OAuth token request.
- Transaction init with a unique external reference and IQD amount.
- Redirect URL handling.
- Transaction inquiry by transaction ID.
- Reverse/refund flow.
- Redirect callback token verification.
- Webhook receiver with idempotent event handling.
- Status mapping for `SUCCESS`, `FAILED`, `PENDING`, `OTP_SENT`, `CUSTOMER_AUTHENTICATION_REQUIRED`, `EXPIRED`, and `REFUNDED`.

### FIB

Use the current official FIB web payments docs and SDK docs during implementation:

- <https://fib.iq/integrations/web-payments/>
- <https://first-iraqi-bank.github.io/fib-nodejs-payment-sdk/>

The adapter should support:

- OAuth2 client credentials.
- Create payment.
- Check payment status.
- Cancel active payment.
- Refund when available in the selected API/SDK path.
- Callback URL handling.
- Sandbox vs production environment switching.

### Bayaan Rules

- Provider success must reconcile to the POS/Odoo payment lifecycle; it must not create a parallel official sale.
- Every provider payment attempt needs a Bayaan transaction record with provider, external reference, provider transaction ID, status, amount, currency, kiosk, order/session/payment link, and latest provider payload reference.
- Duplicate callbacks/webhooks must be safe.
- Missing credentials are an external blocker only after the adapter contracts, mocked tests, and activation checklist exist.

Current implementation status:

- Provider catalog and POS payment-method classification are implemented.
- Bayaan transaction and webhook-event models are implemented.
- Mock FIB and ZainCash transaction payloads are implemented for deterministic tests.
- Live FIB/ZainCash calls are deliberately blocked until merchant sandbox/production credentials are configured server-side and verified.

## Reporting Rules

- Cash stays separate from all digital methods.
- Digital totals split into card, QR, mobile wallet, bank app, manual digital, and other digital.
- Provider totals split into Zain Cash, FIB, Qi Card / SuperQi, NassWallet / NASS Pay, FastPay, AsiaHawala, bank card terminal, generic QR, manual bank transfer, and other digital.
- Cash shortages use cash-only expected totals.
- Gateway settlement reports use provider totals from `pos.payment`, not AI-generated estimates.
- Refunds, voids, discounts, and manual digital payments must retain their original POS trace.

## Production Integration Path

1. Configure one POS payment method per accepted provider or settlement lane.
2. Assign `bayaan_gateway_provider` and the gateway merchant or terminal ID.
3. Keep direct gateway SDK/API code outside the sale-posting path unless the client explicitly approves provider-specific scope.
4. Reconcile settlement exports against `pos.payment` provider totals.
5. Treat AI summaries as read-only commentary over these deterministic totals.
