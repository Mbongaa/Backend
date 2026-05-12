# Odoo POS Engine Wiring

Bayaan production cashier sales must go through Odoo POS records.

The Bayaan React/Vite cashier UI can be the live operator surface, but Odoo remains the transaction engine and source of truth. The UI may submit to Bayaan's Odoo controller; it must not maintain a parallel sales, payment, stock, or accounting ledger.

## Runtime Flow

```text
Cashier uses Bayaan POS UI
-> Bayaan Odoo controller opens/uses a real pos.session
-> Odoo validates order, payment method, paid total, and POS catalog product
-> Odoo writes pos.order and pos.payment
-> Bayaan resolves bayaan.kiosk from pos.config
-> Bayaan reads product.template.bayaan_consumption_mode
-> Bayaan resolves active bayaan.recipe at sale time
-> Bayaan creates stock.scrap records from the kiosk stock location
-> Bayaan writes bayaan.consumption.ledger rows
-> Daily close compares expected stock against actual counted stock
```

## Product Modes

`recipe`

Use for juice, coffee, cappuccino, and other products made at the kiosk. Odoo POS handles the sale/payment/session. Bayaan consumes raw ingredients and packaging. The addon skips Odoo's standard stock move for the sellable SKU to avoid double consumption.

`finished`

Use for cake slices, packaged desserts, or any product delivered to the kiosk as finished stock. Odoo POS consumes finished stock normally. Bayaan does not consume recipe components.

`hybrid`

Use when one POS line should consume both a finished item and recipe components. Odoo handles finished stock and Bayaan handles the recipe components.

`none`

Use for service/non-stock items.

## Failure Handling

Silent failure is not allowed.

If a paid POS order needs recipe consumption but the recipe is missing, the order is marked `missing_recipe`.

If stock policy or posting fails, the order is marked `failed` and the error is written on the POS order chatter.

Managers can repair configuration and run the retry action on the POS order.
