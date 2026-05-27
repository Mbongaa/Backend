"""Variance loop must honor POS modifier recipe factors.

Selling a Large Orange Juice with factor 1.25 has to deduct 1.25× the base
recipe quantities and record both base + scaled qty in the consumption ledger
so daily-close variance reports stay accurate.
"""

from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestModifierAwareConsumption(BayaanTestBase, HttpCase):

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")
        cash_method = self.env["pos.payment.method"].sudo().search([
            ("is_cash_count", "=", True),
            ("company_id", "=", self.company.id),
        ], limit=1)
        if not cash_method:
            cash_journal = self.env["account.journal"].sudo().search([
                ("type", "=", "cash"),
                ("company_id", "=", self.company.id),
            ], limit=1)
            cash_method = self.env["pos.payment.method"].sudo().create({
                "name": "Cash",
                "journal_id": cash_journal.id if cash_journal else False,
                "company_id": self.company.id,
            })
        self.pos_config.payment_method_ids = [(4, cash_method.id)]

    def _consumption_qty(self, order, ingredient_code):
        ingredient = self.env["product.product"].sudo().search([("default_code", "=", ingredient_code)], limit=1)
        ledger = self.env["bayaan.consumption.ledger"].sudo().search([
            ("pos_order_id", "=", order.id),
            ("ingredient_id", "=", ingredient.id),
        ], limit=1)
        return ledger

    def test_large_modifier_factor_scales_ingredient_consumption(self):
        """A 1.25 factor on a single line deducts 1.25× the base recipe qty.

        Server base price for MENU-OJ is 5500; modifier_price_delta=1000 lifts
        the line to 6500, and the payment matches that. The recipe factor is
        independent of the price delta — it scales ingredient consumption only.
        """
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MOD-LARGE",
            "cashier": self.env.user.name,
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice (Large)",
                "qty": 1,
                "price_unit": 6500.0,
                "modifier_signature": "size:large",
                "modifier_recipe_factor": 1.25,
                "modifier_price_delta": 1000.0,
                "modifier_summary": "Large",
            }],
            "payments": [{"method": "cash", "amount": 6500.0}],
        })
        if "error" in response:
            self.fail("Large sale errored: %s" % response["error"])
        result = response["result"]
        self.assertEqual(result["consumption_state"], "posted")
        order = self.env["pos.order"].sudo().browse(result["id"])

        # POS line carries the modifier metadata.
        line = order.lines
        self.assertEqual(len(line), 1)
        self.assertEqual(line.bayaan_modifier_signature, "size:large")
        self.assertAlmostEqual(line.bayaan_modifier_recipe_factor, 1.25, places=6)
        self.assertEqual(line.bayaan_modifier_summary, "Large")

        # Consumption ledger reflects scaled qty + records base + factor.
        orange = self._consumption_qty(order, "ING-ORANGE")
        sugar = self._consumption_qty(order, "ING-SUGAR")
        cup = self._consumption_qty(order, "ING-CUP")
        self.assertTrue(orange and sugar and cup)
        # Recipe: 0.3 orange, 0.02 sugar, 1 cup. Qty=1, factor=1.25.
        self.assertAlmostEqual(orange.ingredient_qty, 0.3 * 1.25, places=6)
        self.assertAlmostEqual(sugar.ingredient_qty, 0.02 * 1.25, places=6)
        self.assertAlmostEqual(cup.ingredient_qty, 1.0 * 1.25, places=6)
        self.assertAlmostEqual(orange.base_ingredient_qty, 0.3, places=6)
        self.assertAlmostEqual(orange.modifier_recipe_factor, 1.25, places=6)
        self.assertEqual(orange.modifier_signature, "size:large")

    def test_small_modifier_factor_scales_down(self):
        """A 0.8 factor on a Small line deducts 0.8× the base qty."""
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MOD-SMALL",
            "cashier": self.env.user.name,
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice (Small)",
                "qty": 1,
                "price_unit": 5000.0,
                "modifier_signature": "size:small",
                "modifier_recipe_factor": 0.8,
                "modifier_price_delta": -500.0,
            }],
            "payments": [{"method": "cash", "amount": 5000.0}],
        })
        if "error" in response:
            self.fail("Small sale errored: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        orange = self._consumption_qty(order, "ING-ORANGE")
        self.assertAlmostEqual(orange.ingredient_qty, 0.3 * 0.8, places=6)
        self.assertAlmostEqual(orange.modifier_recipe_factor, 0.8, places=6)

    def test_missing_factor_defaults_to_one_for_backwards_compat(self):
        """A sale without modifier fields keeps factor=1.0 — no regression for legacy clients."""
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MOD-NONE",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in response:
            self.fail("Plain sale errored: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        line = order.lines
        self.assertEqual(line.bayaan_modifier_signature or "", "")
        self.assertAlmostEqual(line.bayaan_modifier_recipe_factor, 1.0, places=6)
        orange = self._consumption_qty(order, "ING-ORANGE")
        self.assertAlmostEqual(orange.ingredient_qty, 0.3, places=6)
        self.assertAlmostEqual(orange.modifier_recipe_factor, 1.0, places=6)

    def test_invalid_factor_falls_back_to_one(self):
        """Zero/negative/non-numeric factors fall back to 1.0 — controller must not crash or under-deduct."""
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MOD-BAD",
            "cashier": self.env.user.name,
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 1,
                "price_unit": 5500.0,
                "modifier_recipe_factor": -0.5,
            }],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in response:
            self.fail("Bad-factor sale errored: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        orange = self._consumption_qty(order, "ING-ORANGE")
        self.assertAlmostEqual(orange.ingredient_qty, 0.3, places=6)
        self.assertAlmostEqual(orange.modifier_recipe_factor, 1.0, places=6)

    def test_factor_with_multiple_qty(self):
        """factor and qty multiply correctly: 2 Larges = 2 × 1.25 × base = 2.5× base."""
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MOD-2LARGE",
            "cashier": self.env.user.name,
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice (Large) x2",
                "qty": 2,
                "price_unit": 6500.0,
                "modifier_recipe_factor": 1.25,
                "modifier_price_delta": 1000.0,
            }],
            "payments": [{"method": "cash", "amount": 13000.0}],
        })
        if "error" in response:
            self.fail("Large x2 errored: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        orange = self._consumption_qty(order, "ING-ORANGE")
        self.assertAlmostEqual(orange.ingredient_qty, 0.3 * 2 * 1.25, places=6)
        self.assertAlmostEqual(orange.base_ingredient_qty, 0.3 * 2, places=6)
