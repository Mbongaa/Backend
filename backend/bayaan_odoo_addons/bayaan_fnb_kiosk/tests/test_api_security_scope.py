from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestApiSecurityScope(BayaanTestBase, HttpCase):
    """Bayaan JSON routes must enforce kiosk assignment despite sudo writes."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def _create_user(self, login, group_xmlid):
        group = self.env.ref(group_xmlid)
        user = self.env["res.users"].sudo().create({
            "name": login,
            "login": login,
            "email": "%s@example.test" % login,
            "password": "test",
            "company_id": self.company.id,
            "company_ids": [(6, 0, [self.company.id])],
            "group_ids": [(6, 0, [group.id])],
        })
        return user

    def _create_other_kiosk(self):
        location = self.env["stock.location"].sudo().create({
            "name": "Kiosk K-OTHER Location",
            "usage": "internal",
            "location_id": self.warehouse.view_location_id.id,
            "company_id": self.company.id,
        })
        pos_config = self.env["pos.config"].sudo().create({
            "name": "K-OTHER POS",
            "company_id": self.company.id,
        })
        pos_config.picking_type_id.default_location_src_id = location
        return self.env["bayaan.kiosk"].sudo().create({
            "name": "Unassigned Test Kiosk",
            "kiosk_code": "K-OTHER",
            "pos_config_id": pos_config.id,
            "stock_location_id": location.id,
            "stock_deduction_policy": "warning",
            "company_id": self.company.id,
        })

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

        self.cashier = self._create_user(
            "bayaan_cashier_scope",
            "bayaan_fnb_kiosk.group_bayaan_cashier",
        )
        self.supervisor = self._create_user(
            "bayaan_supervisor_scope",
            "bayaan_fnb_kiosk.group_bayaan_supervisor",
        )
        self.other_kiosk = self._create_other_kiosk()
        self.kiosk.cashier_user_ids = [(4, self.cashier.id)]
        self.kiosk.supervisor_user_id = self.supervisor

    def test_cashier_can_post_sale_for_assigned_kiosk(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-SCOPE-ALLOWED",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in response:
            self.fail("assigned cashier sale errored: %s" % response["error"])
        self.assertEqual(response["result"]["state"], "paid")

    def test_cashier_cannot_post_sale_for_unassigned_kiosk(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-OTHER",
            "external_id": "EXT-SCOPE-BLOCKED",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        self.assertIn("error", response)
        self.assertIn("not allowed", str(response["error"]))

    def test_cashier_cannot_create_stock_transfer(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
        })
        self.assertIn("error", response)
        self.assertIn("not allowed", str(response["error"]))

    def test_supervisor_can_create_transfer_for_assigned_kiosk(self):
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.warehouse.lot_stock_id,
            3.0,
        )
        self.authenticate("bayaan_supervisor_scope", "test")
        response = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in response:
            self.fail("assigned supervisor transfer errored: %s" % response["error"])
        self.assertTrue(response["result"]["name"])

    def test_cashier_can_receive_dispatched_transfer_for_assigned_kiosk(self):
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.warehouse.lot_stock_id,
            3.0,
        )
        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in created:
            self.fail("admin transfer create errored: %s" % created["error"])
        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("admin transfer dispatch errored: %s" % dispatched["error"])

        self.authenticate("bayaan_cashier_scope", "test")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "receive",
        })
        if "error" in received:
            self.fail("assigned cashier receive errored: %s" % received["error"])
        self.assertEqual(received["result"]["bayaan_state"], "received")

    def test_cashier_cannot_receive_transfer_for_unassigned_kiosk(self):
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.warehouse.lot_stock_id,
            3.0,
        )
        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-OTHER",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in created:
            self.fail("admin transfer create errored: %s" % created["error"])
        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("admin transfer dispatch errored: %s" % dispatched["error"])

        self.authenticate("bayaan_cashier_scope", "test")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "receive",
        })
        self.assertIn("error", received)
        self.assertIn("not allowed", str(received["error"]))

    def test_cashier_cannot_create_purchase_order(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Blocked Supplier",
            "items": [{"item": "ING-ORANGE", "qty": 1.0, "rate": 1500.0}],
        })
        self.assertIn("error", response)
        self.assertIn("Only Bayaan managers", str(response["error"]))

    def test_chain_bootstrap_is_scoped_to_assigned_kiosks(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in response:
            self.fail("chain_bootstrap errored: %s" % response["error"])
        kiosk_codes = {row["kiosk_code"] for row in response["result"]["kiosks"]}
        self.assertEqual(kiosk_codes, {"K-TEST"})

    def test_supervisor_cannot_approve_daily_close(self):
        close = self.env["bayaan.shift.close"].sudo().create({
            "kiosk_id": self.kiosk.id,
            "cashier_id": self.cashier.id,
            "opened_at": "2026-05-12 08:00:00",
            "expected_cash": 0.0,
            "actual_cash": 0.0,
        })

        self.authenticate("bayaan_supervisor_scope", "test")
        response = self._jsonrpc("/bayaan/api/shift_close_review", {
            "close_id": close.id,
            "decision": "approved",
        })
        self.assertIn("error", response)
        self.assertIn("Only Bayaan managers", str(response["error"]))
