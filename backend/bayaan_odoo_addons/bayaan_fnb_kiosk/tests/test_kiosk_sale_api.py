from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestKioskSaleApi(BayaanTestBase, HttpCase):
    """The new /bayaan/api/kiosk_sale endpoint must create a real pos.order
    that triggers the consumption ledger. /bayaan/api/pos_sale must remain a
    guardrail returning engine: odoo_pos.
    """

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")
        # Make sure the POS config has a payment method configured.
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

    def test_pos_sale_route_is_a_guardrail(self):
        response = self._jsonrpc("/bayaan/api/pos_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-1",
            "items": [],
            "payments": [],
        })
        result = response.get("result", {})
        self.assertEqual(result.get("engine"), "odoo_pos")
        self.assertFalse(result.get("accepted"))

    def test_kiosk_sale_creates_pos_order_and_ledger(self):
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-2",
            "cashier": self.env.user.name,
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 2,
                "price_unit": 5500.0,
            }],
            "payments": [{"method": "cash", "amount": 11000.0}],
        })
        if "error" in response:
            self.fail("kiosk_sale errored: %s" % response["error"])
        result = response["result"]
        self.assertTrue(result.get("id"), "kiosk_sale must return the created order id")
        self.assertEqual(result.get("external_id"), "EXT-2")
        self.assertEqual(result.get("state"), "paid")
        self.assertEqual(result.get("consumption_state"), "posted")
        self.assertEqual(len(result.get("consumption_lines") or []), 3)

    def test_kiosk_sale_is_idempotent_on_external_id(self):
        payload = {
            "kiosk": "K-TEST",
            "external_id": "EXT-3-IDEMP",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        }
        first = self._jsonrpc("/bayaan/api/kiosk_sale", payload)["result"]
        second = self._jsonrpc("/bayaan/api/kiosk_sale", payload)["result"]
        self.assertEqual(first["id"], second["id"], "Same external_id must return the same order")
        self.assertTrue(second.get("idempotent"), "Second call must report idempotent: true")

    def test_kiosk_sale_rejects_empty_cart(self):
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-EMPTY",
            "cashier": self.env.user.name,
            "items": [],
            "payments": [{"method": "cash", "amount": 0}],
        })
        self.assertIn("error", response)
