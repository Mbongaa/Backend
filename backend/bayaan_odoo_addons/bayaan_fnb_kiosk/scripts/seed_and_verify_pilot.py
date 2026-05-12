"""Seed and verify the Bayaan pilot flow in a local Odoo database.

Run from Odoo shell:

    python odoo-bin shell -d bayaan --db_user=hassa \
      --addons-path=addons,../bayaan_odoo_addons \
      < ../bayaan_odoo_addons/bayaan_fnb_kiosk/scripts/seed_and_verify_pilot.py

This script is intentionally deterministic. It proves the core variance loop:

    opening stock + transfers - recipe consumption - waste = expected stock

The script assumes it is executed by `odoo-bin shell`, where `env` is provided.
"""

import json
import math

from odoo import fields


COMPANY = env.company
KG = env.ref("uom.product_uom_kgm")
UNIT = env.ref("uom.product_uom_unit")


def fail(message):
    raise AssertionError(message)


def assert_close(label, actual, expected, tolerance=0.0001):
    if math.fabs(float(actual) - float(expected)) > tolerance:
        fail("%s expected %s, got %s" % (label, expected, actual))


def product(code, name, *, price=0.0, cost=0.0, uom=None, sale_ok=False, purchase_ok=True, storable=True, mode="finished"):
    Product = env["product.product"].sudo()
    Template = env["product.template"].sudo()
    record = Product.search([("default_code", "=", code)], limit=1)
    vals = {
        "name": name,
        "default_code": code,
        "type": "consu",
        "is_storable": bool(storable),
        "sale_ok": bool(sale_ok),
        "purchase_ok": bool(purchase_ok),
        "available_in_pos": bool(sale_ok),
        "list_price": price,
        "standard_price": cost,
        "uom_id": (uom or UNIT).id,
        "taxes_id": [(5, 0, 0)],
        "supplier_taxes_id": [(5, 0, 0)],
        "bayaan_consumption_mode": mode,
    }
    if record:
        record.product_tmpl_id.write(vals)
        return record
    return Template.create(vals).product_variant_id


def set_available_qty(product_record, location, qty):
    Quant = env["stock.quant"].sudo()
    current = Quant._get_available_quantity(product_record, location)
    Quant._update_available_quantity(product_record, location, qty - current)
    return Quant._get_available_quantity(product_record, location)


def ensure_bank_payment_method(name, provider, sequence):
    Journal = env["account.journal"].sudo()
    PaymentMethod = env["pos.payment.method"].sudo()
    journal_code = ("B%s" % provider.replace("_", "").upper())[:5]
    journal = Journal.search([
        ("company_id", "=", COMPANY.id),
        ("code", "=", journal_code),
    ], limit=1)
    if not journal:
        journal = Journal.create({
            "name": "%s Settlement" % name,
            "code": journal_code,
            "type": "bank",
            "company_id": COMPANY.id,
        })

    method = PaymentMethod.search([
        ("company_id", "=", COMPANY.id),
        ("name", "=", name),
    ], limit=1)
    vals = {
        "name": name,
        "journal_id": journal.id,
        "company_id": COMPANY.id,
        "sequence": sequence,
        "bayaan_gateway_provider": provider,
        "bayaan_gateway_settlement_window": "daily",
    }
    if not method:
        method = PaymentMethod.create(vals)
    elif not method.open_session_ids:
        method.write(vals)
    return method


def ensure_kiosk(kiosk_code, name, *, city, area):
    Warehouse = env["stock.warehouse"].sudo()
    Location = env["stock.location"].sudo()
    PickingType = env["stock.picking.type"].sudo()
    PosConfig = env["pos.config"].sudo()
    Kiosk = env["bayaan.kiosk"].sudo()

    warehouse = Warehouse.search([("company_id", "=", COMPANY.id)], limit=1)
    if not warehouse:
        fail("No stock.warehouse exists for company %s" % COMPANY.display_name)

    kiosk = Kiosk.search([
        ("kiosk_code", "=", kiosk_code),
        ("company_id", "=", COMPANY.id),
    ], limit=1)
    if kiosk:
        return kiosk

    location = Location.create({
        "name": "%s Stock" % kiosk_code,
        "usage": "internal",
        "location_id": warehouse.lot_stock_id.id,
        "company_id": COMPANY.id,
    })
    picking_type = PickingType.create({
        "name": "%s POS Delivery" % kiosk_code,
        "code": "outgoing",
        "sequence_code": "%sPOS" % kiosk_code.replace("-", "")[:8],
        "warehouse_id": warehouse.id,
        "default_location_src_id": location.id,
        "default_location_dest_id": env.ref("stock.stock_location_customers").id,
        "company_id": COMPANY.id,
    })
    journal, payment_method_ids = PosConfig._create_journal_and_payment_methods(
        cash_journal_vals={"name": "Cash %s" % kiosk_code},
    )
    zain_cash = ensure_bank_payment_method("Zain Cash", "zain_cash", 11)
    fib = ensure_bank_payment_method("FIB", "fib", 12)
    payment_method_ids = list(dict.fromkeys(payment_method_ids + [zain_cash.id, fib.id]))
    pos_config = PosConfig.create({
        "name": "%s POS" % kiosk_code,
        "company_id": COMPANY.id,
        "picking_type_id": picking_type.id,
        "journal_id": journal.id,
        "payment_method_ids": [(6, 0, payment_method_ids)],
    })
    return Kiosk.create({
        "name": name,
        "kiosk_code": kiosk_code,
        "city": city,
        "area": area,
        "opening_date": fields.Date.context_today(env.user),
        "stock_deduction_policy": "warning",
        "pos_config_id": pos_config.id,
        "stock_location_id": location.id,
        "company_id": COMPANY.id,
    })


def ensure_session(pos_config):
    Session = env["pos.session"].sudo()
    session = Session.search([
        ("config_id", "=", pos_config.id),
        ("state", "!=", "closed"),
    ], limit=1)
    if not session:
        session = Session.create({
            "config_id": pos_config.id,
            "user_id": env.user.id,
        })
    if session.state == "opening_control":
        session.set_opening_control(0, "Bayaan pilot verification")
    if session.state != "opened":
        fail("POS session for %s is not opened: %s" % (pos_config.display_name, session.state))
    return session


def active_recipe(product_record, lines):
    Recipe = env["bayaan.recipe"].sudo()
    recipe = Recipe.search([
        ("product_id", "=", product_record.id),
        ("company_id", "=", COMPANY.id),
        ("state", "=", "active"),
    ], limit=1)
    if recipe:
        return recipe
    recipe = Recipe.create({
        "product_id": product_record.id,
        "version_label": "v1-pilot",
        "effective_from": fields.Datetime.now(),
        "waste_allowance_percent": 0.0,
        "company_id": COMPANY.id,
        "line_ids": [(0, 0, {
            "ingredient_id": ingredient.id,
            "qty": qty,
            "uom_id": uom.id,
        }) for ingredient, qty, uom in lines],
    })
    recipe.action_activate()
    return recipe


def create_paid_order(session, juice, payment_method, qty, unit_price):
    total = qty * unit_price
    Order = env["pos.order"].sudo()
    stamp = fields.Datetime.to_string(fields.Datetime.now()).replace(":", "").replace(" ", "-")
    order = Order.create({
        "name": "/",
        "session_id": session.id,
        "user_id": env.user.id,
        "amount_tax": 0.0,
        "amount_total": total,
        "amount_paid": total,
        "amount_return": 0.0,
        "state": "paid",
        "pos_reference": "BAYAAN-PILOT-%s" % stamp,
        "lines": [(0, 0, {
            "name": "Orange Juice 350ml",
            "product_id": juice.id,
            "qty": qty,
            "price_unit": unit_price,
            "price_subtotal": total,
            "price_subtotal_incl": total,
            "discount": 0.0,
            "full_product_name": "Orange Juice 350ml",
        })],
        "payment_ids": [(0, 0, {
            "amount": total,
            "payment_method_id": payment_method.id,
            "payment_date": fields.Datetime.now(),
            "transaction_id": "FIB-PILOT-%s" % stamp,
            "payment_status": "done",
        })],
    })
    if order.name == "/":
        order.name = order.pos_reference
    order._bayaan_post_recipe_consumption()
    return order


orange = product("BAY-ORANGE-KG", "Orange", cost=1_200.0, uom=KG, sale_ok=False, storable=True, mode="finished")
sugar = product("BAY-SUGAR-KG", "Sugar", cost=900.0, uom=KG, sale_ok=False, storable=True, mode="finished")
cup = product("BAY-CUP-350", "Cup 350ml", cost=65.0, uom=UNIT, sale_ok=False, storable=True, mode="finished")
straw = product("BAY-STRAW", "Straw", cost=20.0, uom=UNIT, sale_ok=False, storable=True, mode="finished")
juice = product(
    "BAY-OJ-350",
    "Orange Juice 350ml",
    price=3_000.0,
    cost=0.0,
    uom=UNIT,
    sale_ok=True,
    purchase_ok=False,
    storable=False,
    mode="recipe",
)

kiosk = ensure_kiosk("K-04", "Zayouna Plaza", city="Baghdad", area="Zayouna")
zain_cash = ensure_bank_payment_method("Zain Cash", "zain_cash", 11)
fib = ensure_bank_payment_method("FIB", "fib", 12)
kiosk.pos_config_id.write({"payment_method_ids": [(4, zain_cash.id), (4, fib.id)]})

recipe = active_recipe(juice, [
    (orange, 0.35, KG),
    (sugar, 0.01, KG),
    (cup, 1.0, UNIT),
    (straw, 1.0, UNIT),
])

opening = {
    orange.id: (10.0, KG),
    sugar.id: (4.0, KG),
    cup.id: (100.0, UNIT),
    straw.id: (100.0, UNIT),
}
for product_record, (qty, _uom) in opening.items():
    set_available_qty(env["product.product"].browse(product_record), kiosk.stock_location_id, qty)

session = ensure_session(kiosk.pos_config_id)
order = create_paid_order(session, juice, fib, 10.0, 3_000.0)

ledger = env["bayaan.consumption.ledger"].sudo().search([("pos_order_id", "=", order.id)])
if len(ledger) != 4:
    fail("Expected 4 consumption ledger rows, got %s" % len(ledger))

ledger_by_code = {line.ingredient_id.default_code: line.ingredient_qty for line in ledger}
assert_close("orange consumption", ledger_by_code["BAY-ORANGE-KG"], 3.5)
assert_close("sugar consumption", ledger_by_code["BAY-SUGAR-KG"], 0.1)
assert_close("cup consumption", ledger_by_code["BAY-CUP-350"], 10.0)
assert_close("straw consumption", ledger_by_code["BAY-STRAW"], 10.0)

expected_after_sale = {
    orange: 6.5,
    sugar: 3.9,
    cup: 90.0,
    straw: 90.0,
}
for product_record, expected_qty in expected_after_sale.items():
    actual_qty = env["stock.quant"].sudo()._get_available_quantity(product_record, kiosk.stock_location_id)
    assert_close("%s expected stock" % product_record.default_code, actual_qty, expected_qty)

close = env["bayaan.shift.close"].sudo().create({
    "kiosk_id": kiosk.id,
    "cashier_id": env.user.id,
    "opened_at": session.start_at or fields.Datetime.now(),
    "opening_cash": 0.0,
    "expected_cash": order.amount_total,
    "actual_cash": order.amount_total - 500.0,
    "pos_order_ids": [(6, 0, [order.id])],
    "stock_count_json": [
        {"item": "BAY-ORANGE-KG", "expected_qty": 6.5, "actual_qty": 6.2},
        {"item": "BAY-SUGAR-KG", "expected_qty": 3.9, "actual_qty": 3.9},
        {"item": "BAY-CUP-350", "expected_qty": 90.0, "actual_qty": 89.0},
        {"item": "BAY-STRAW", "expected_qty": 90.0, "actual_qty": 90.0},
    ],
    "stock_count_line_ids": [
        (0, 0, {"product_id": orange.id, "uom_id": KG.id, "expected_qty": 6.5, "actual_qty": 6.2, "note": "Pilot variance"}),
        (0, 0, {"product_id": sugar.id, "uom_id": KG.id, "expected_qty": 3.9, "actual_qty": 3.9}),
        (0, 0, {"product_id": cup.id, "uom_id": UNIT.id, "expected_qty": 90.0, "actual_qty": 89.0, "note": "Missing cup"}),
        (0, 0, {"product_id": straw.id, "uom_id": UNIT.id, "expected_qty": 90.0, "actual_qty": 90.0}),
    ],
})
assert_close("cash variance", close.cash_variance, -500.0)
variance_by_code = {line.product_id.default_code: line.variance_qty for line in close.stock_count_line_ids}
assert_close("orange variance", variance_by_code["BAY-ORANGE-KG"], -0.3)
assert_close("cup variance", variance_by_code["BAY-CUP-350"], -1.0)

result = {
    "ok": True,
    "kiosk": kiosk.kiosk_code,
    "pos_config": kiosk.pos_config_id.name,
    "order": order.name,
    "pos_reference": order.pos_reference,
    "consumption_state": order.bayaan_consumption_state,
    "recipe": recipe.version_label,
    "ledger_rows": len(ledger),
    "deducted": ledger_by_code,
    "stock_after_sale": {
        product_record.default_code: env["stock.quant"].sudo()._get_available_quantity(product_record, kiosk.stock_location_id)
        for product_record in expected_after_sale
    },
    "shift_close": close.name,
    "cash_variance": close.cash_variance,
    "stock_variance": variance_by_code,
    "payment_provider": fib.bayaan_gateway_provider,
}
env.cr.commit()
print(json.dumps(result, indent=2, sort_keys=True))
