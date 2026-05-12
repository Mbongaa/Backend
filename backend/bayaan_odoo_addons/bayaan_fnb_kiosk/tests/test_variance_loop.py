from odoo.tests.common import tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestVarianceLoop(BayaanTestBase):
    """The core promise: when a sellable product with a recipe is sold, the
    addon must (a) write immutable consumption ledger rows, (b) create a
    stock.scrap from the kiosk location for each ingredient, and (c) NOT
    let Odoo's standard finished-SKU stock move fire.
    """

    def _open_session(self):
        session = self.env["pos.session"].create({
            "config_id": self.pos_config.id,
            "user_id": self.env.user.id,
        })
        if session.state == "opening_control":
            session.action_pos_session_open()
        return session

    def _create_paid_pos_order(self, qty):
        session = self._open_session()
        order = self.env["pos.order"].create({
            "session_id": session.id,
            "company_id": self.company.id,
            "user_id": self.env.user.id,
            "amount_total": self.product_orange_juice.list_price * qty,
            "amount_paid": self.product_orange_juice.list_price * qty,
            "amount_tax": 0.0,
            "amount_return": 0.0,
            "bayaan_kiosk_id": self.kiosk.id,
            "lines": [(0, 0, {
                "name": self.product_orange_juice.display_name,
                "product_id": self.product_orange_juice.id,
                "qty": qty,
                "price_unit": self.product_orange_juice.list_price,
                "price_subtotal": self.product_orange_juice.list_price * qty,
                "price_subtotal_incl": self.product_orange_juice.list_price * qty,
            })],
        })
        order.write({"state": "paid"})
        order._process_saved_order(False)
        return order

    def test_pos_sale_writes_consumption_ledger(self):
        order = self._create_paid_pos_order(qty=2.0)
        ledger = self.env["bayaan.consumption.ledger"].search([("pos_order_id", "=", order.id)])
        # 3 ingredients in the recipe → 3 ledger rows
        self.assertEqual(len(ledger), 3, "Each recipe ingredient should produce one ledger row")
        by_ing = {row.ingredient_id.id: row for row in ledger}
        self.assertAlmostEqual(by_ing[self.ingredient_orange.id].ingredient_qty, 0.6)  # 0.3 * 2
        self.assertAlmostEqual(by_ing[self.ingredient_sugar.id].ingredient_qty, 0.04)
        self.assertAlmostEqual(by_ing[self.ingredient_cup.id].ingredient_qty, 2.0)
        self.assertEqual(order.bayaan_consumption_state, "posted")

    def test_pos_sale_creates_stock_scrap_on_kiosk_location(self):
        order = self._create_paid_pos_order(qty=1.0)
        ledger = self.env["bayaan.consumption.ledger"].search([("pos_order_id", "=", order.id)])
        for row in ledger:
            self.assertTrue(row.stock_scrap_id, "Each ledger row should link a stock.scrap")
            self.assertEqual(
                row.stock_scrap_id.location_id,
                self.kiosk_location,
                "Scrap must originate from the kiosk's stock location, not a generic one",
            )

    def test_finished_sku_stock_move_is_suppressed_when_mode_is_recipe(self):
        # The finished OJ SKU is mode='recipe', so Odoo's _launch_stock_rule_from_pos_order_lines
        # must NOT create a stock move for the OJ product itself — only the ingredient scraps.
        order = self._create_paid_pos_order(qty=1.0)
        finished_moves = self.env["stock.move"].search([
            ("product_id", "=", self.product_orange_juice.id),
            ("origin", "=", order.name),
        ])
        self.assertEqual(
            len(finished_moves), 0,
            "Recipe-mode product should not produce a stock.move for the finished SKU; "
            "only ingredient scraps should fire.",
        )

    def test_quants_decrease_by_recipe_amount(self):
        Quant = self.env["stock.quant"]
        opening_orange = Quant._get_available_quantity(
            self.ingredient_orange, self.kiosk_location, strict=True, allow_negative=True,
        )
        self._create_paid_pos_order(qty=3.0)
        closing_orange = Quant._get_available_quantity(
            self.ingredient_orange, self.kiosk_location, strict=True, allow_negative=True,
        )
        # 3 OJ * 0.3kg orange = 0.9kg deducted
        self.assertAlmostEqual(opening_orange - closing_orange, 0.9, places=4)

    def test_idempotent_no_duplicate_ledger_when_processed_twice(self):
        order = self._create_paid_pos_order(qty=1.0)
        order._bayaan_post_recipe_consumption()  # second invocation
        ledger = self.env["bayaan.consumption.ledger"].search([("pos_order_id", "=", order.id)])
        self.assertEqual(len(ledger), 3, "Re-invoking consumption posting must not create duplicates")
