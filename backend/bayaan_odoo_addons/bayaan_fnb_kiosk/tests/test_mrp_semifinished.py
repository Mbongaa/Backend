from datetime import datetime, timedelta

from odoo.tests.common import tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestMrpSemiFinishedGoods(BayaanTestBase):
    def _available(self, product, location):
        return self.env["stock.quant"]._get_available_quantity(
            product,
            location,
            strict=True,
            allow_negative=True,
        )

    def _open_session(self):
        session = self.env["pos.session"].create({
            "config_id": self.pos_config.id,
            "user_id": self.env.user.id,
        })
        if session.state == "opening_control":
            session.action_pos_session_open()
        return session

    def _create_paid_pos_order(self, product, qty):
        session = self._open_session()
        total = product.list_price * qty
        order = self.env["pos.order"].create({
            "session_id": session.id,
            "company_id": self.company.id,
            "user_id": self.env.user.id,
            "amount_total": total,
            "amount_paid": total,
            "amount_tax": 0.0,
            "amount_return": 0.0,
            "bayaan_kiosk_id": self.kiosk.id,
            "lines": [(0, 0, {
                "name": product.display_name,
                "product_id": product.id,
                "qty": qty,
                "price_unit": product.list_price,
                "price_subtotal": total,
                "price_subtotal_incl": total,
            })],
        })
        order.write({"state": "paid"})
        order._process_saved_order(False)
        return order

    def _create_mix_ingredients(self):
        ingredients = self.env["product.product"]
        for index in range(10):
            ingredient = self.env["product.product"].create({
                "name": "Signature Mix Ingredient %02d" % (index + 1),
                "type": "consu",
                "is_storable": True,
                "uom_id": self.uom_kgm.id,
                "standard_price": 100.0 + index,
                "default_code": "MIX-RAW-%02d" % (index + 1),
                "bayaan_consumption_mode": "none",
            })
            self.env["stock.quant"]._update_available_quantity(
                ingredient,
                self.warehouse.lot_stock_id,
                10.0,
            )
            ingredients |= ingredient
        return ingredients

    def _produce_signature_mix(self, ingredients, signature_mix):
        bom = self.env["mrp.bom"].create({
            "product_id": signature_mix.id,
            "product_tmpl_id": signature_mix.product_tmpl_id.id,
            "product_qty": 1.0,
            "product_uom_id": self.uom_kgm.id,
            "type": "normal",
            "consumption": "flexible",
            "company_id": self.company.id,
            "bom_line_ids": [
                (0, 0, {
                    "product_id": ingredient.id,
                    "product_qty": 0.1,
                    "product_uom_id": self.uom_kgm.id,
                })
                for ingredient in ingredients
            ],
        })
        production = self.env["mrp.production"].create({
            "product_id": signature_mix.id,
            "product_qty": 2.0,
            "product_uom_id": self.uom_kgm.id,
            "bom_id": bom.id,
            "location_src_id": self.warehouse.lot_stock_id.id,
            "location_dest_id": self.warehouse.lot_stock_id.id,
            "company_id": self.company.id,
        })
        production.action_confirm()
        production.qty_producing = 2.0
        for move in production.move_raw_ids:
            move.write({"quantity": move.product_uom_qty, "picked": True})
        production.button_mark_done()
        return bom, production

    def _move_mix_to_kiosk(self, signature_mix, qty):
        move = self.env["stock.move"].create({
            "product_id": signature_mix.id,
            "product_uom_qty": qty,
            "product_uom": self.uom_kgm.id,
            "location_id": self.warehouse.lot_stock_id.id,
            "location_dest_id": self.kiosk_location.id,
            "company_id": self.company.id,
        })
        move._action_confirm()
        move.write({"quantity": qty, "picked": True})
        move._action_done()
        return move

    def test_mrp_produces_stored_mix_then_bayaan_recipe_consumes_it(self):
        ingredients = self._create_mix_ingredients()
        signature_mix = self.env["product.product"].create({
            "name": "Signature Cappuccino Mix",
            "type": "consu",
            "is_storable": True,
            "uom_id": self.uom_kgm.id,
            "standard_price": 1200.0,
            "list_price": 3500.0,
            "available_in_pos": True,
            "default_code": "SEMI-CAP-MIX",
            "bayaan_consumption_mode": "finished",
        })
        first_raw_opening = self._available(ingredients[0], self.warehouse.lot_stock_id)

        bom, production = self._produce_signature_mix(ingredients, signature_mix)

        self.assertEqual(len(bom.bom_line_ids), 10)
        self.assertEqual(production.state, "done")
        self.assertAlmostEqual(
            self._available(ingredients[0], self.warehouse.lot_stock_id),
            first_raw_opening - 0.2,
            places=4,
        )
        self.assertAlmostEqual(
            self._available(signature_mix, self.warehouse.lot_stock_id),
            2.0,
            places=4,
        )
        self.assertEqual(signature_mix.product_tmpl_id.bayaan_consumption_mode, "finished")

        self._move_mix_to_kiosk(signature_mix, 1.0)
        kiosk_mix_opening = self._available(signature_mix, self.kiosk_location)
        self.assertAlmostEqual(kiosk_mix_opening, 1.0, places=4)

        cappuccino_plus = self.env["product.product"].create({
            "name": "Cappuccino Plus",
            "type": "consu",
            "list_price": 7000.0,
            "available_in_pos": True,
            "default_code": "MENU-CAP-PLUS",
            "bayaan_consumption_mode": "recipe",
        })
        recipe = self.env["bayaan.recipe"].create({
            "product_id": cappuccino_plus.id,
            "version_label": "mix-v1",
            "effective_from": datetime.now() - timedelta(days=1),
            "company_id": self.company.id,
            "line_ids": [
                (0, 0, {
                    "ingredient_id": signature_mix.id,
                    "qty": 0.25,
                    "uom_id": self.uom_kgm.id,
                }),
                (0, 0, {
                    "ingredient_id": self.ingredient_cup.id,
                    "qty": 1.0,
                    "uom_id": self.uom_unit.id,
                }),
            ],
        })
        recipe.action_activate()

        order = self._create_paid_pos_order(cappuccino_plus, qty=2.0)
        mix_ledger = order.bayaan_consumption_ledger_ids.filtered(
            lambda line: line.ingredient_id == signature_mix
        )

        self.assertEqual(order.bayaan_consumption_state, "posted")
        self.assertEqual(len(mix_ledger), 1)
        self.assertEqual(mix_ledger.recipe_id, recipe)
        self.assertAlmostEqual(mix_ledger.ingredient_qty, 0.5, places=4)
        self.assertAlmostEqual(mix_ledger.unit_cost, signature_mix.standard_price, places=4)
        self.assertAlmostEqual(
            self._available(signature_mix, self.kiosk_location),
            kiosk_mix_opening - 0.5,
            places=4,
        )

        future_recipe = self.env["bayaan.recipe"].create({
            "product_id": cappuccino_plus.id,
            "version_label": "mix-v2",
            "effective_from": datetime.now() + timedelta(days=1),
            "company_id": self.company.id,
            "line_ids": [
                (0, 0, {
                    "ingredient_id": signature_mix.id,
                    "qty": 0.3,
                    "uom_id": self.uom_kgm.id,
                }),
            ],
        })
        future_recipe.action_activate()
        resolved_historical = self.env["bayaan.recipe"].get_active_recipe(
            cappuccino_plus,
            self.company,
            order.date_order,
        )
        self.assertEqual(resolved_historical, recipe)
