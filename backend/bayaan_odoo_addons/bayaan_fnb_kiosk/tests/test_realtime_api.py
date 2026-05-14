from odoo.addons.bus.models.bus import channel_with_db
from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestRealtimeApi(BayaanTestBase, HttpCase):
    """Realtime is a release gate: backend writes must publish scoped bus events."""

    def _jsonrpc(self, route, payload=None):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload or {}}, "id": 1},
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

    def test_realtime_config_returns_signed_user_channel(self):
        response = self._jsonrpc("/bayaan/api/realtime_config")
        if "error" in response:
            self.fail("realtime_config errored: %s" % response["error"])
        result = response["result"]
        self.assertEqual(result["engine"], "odoo_bus")
        self.assertEqual(result["notificationType"], "bayaan.realtime")
        self.assertTrue(result["channels"])
        self.assertTrue(result["channels"][0].startswith("bayaan.realtime."))
        self.assertTrue(result["last"] >= 0)

    def test_kiosk_sale_publishes_realtime_bus_event(self):
        config = self._jsonrpc("/bayaan/api/realtime_config")["result"]
        channel = config["channels"][0]
        last = config["last"]
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-REALTIME-1",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in response:
            self.fail("kiosk_sale errored: %s" % response["error"])

        notifications = self.env["bus.bus"].sudo()._poll([
            channel_with_db(self.env.cr.dbname, channel),
        ], last=last)
        realtime = [
            notification["message"]["payload"]
            for notification in notifications
            if notification["message"].get("type") == "bayaan.realtime"
        ]
        self.assertTrue(realtime, "kiosk_sale should publish at least one realtime event")
        self.assertIn("sale.paid", {event.get("action") for event in realtime})
        sale_event = next(event for event in realtime if event.get("action") == "sale.paid")
        self.assertEqual(sale_event["kiosk"], "K-TEST")
        self.assertEqual(sale_event["model"], "pos.order")
