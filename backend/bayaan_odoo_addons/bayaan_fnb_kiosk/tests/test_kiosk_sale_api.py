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

    def test_chain_bootstrap_exposes_configured_cash_payment_method(self):
        response = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in response:
            self.fail("chain_bootstrap errored: %s" % response["error"])
        result = response["result"]
        config_rows = result.get("pos_configs") or []
        config = next(
            (row for row in config_rows if row.get("id") == self.pos_config.id),
            None,
        )
        self.assertTrue(config, "chain_bootstrap must include the kiosk POS config")
        methods = config.get("payment_methods") or []
        cash = next((method for method in methods if method.get("name") == "Cash"), None)
        self.assertTrue(cash, "chain_bootstrap must expose configured Cash method")
        self.assertEqual(cash.get("provider", {}).get("category"), "cash")

    def test_kiosk_sale_rejects_price_tamper_underpayment(self):
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-PRICE-TAMPER",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 1.0}],
            "payments": [{"method": "cash", "amount": 1.0}],
        })
        self.assertIn("error", response)
        self.assertIn("Payment total", str(response["error"]))
        order = self.env["pos.order"].sudo().search([("pos_reference", "=", "EXT-PRICE-TAMPER")], limit=1)
        self.assertFalse(order, "Tampered underpayment must not create a POS order")

    def test_kiosk_sale_uses_server_pricelist_when_client_price_is_stale(self):
        pricelist = self.env["product.pricelist"].sudo().create({
            "name": "K-TEST Branch Price",
            "currency_id": self.company.currency_id.id,
            "company_id": self.company.id,
        })
        self.env["product.pricelist.item"].sudo().create({
            "pricelist_id": pricelist.id,
            "applied_on": "0_product_variant",
            "product_id": self.product_orange_juice.id,
            "compute_price": "fixed",
            "fixed_price": 6500.0,
        })
        self.pos_config.write({
            "use_pricelist": True,
            "pricelist_id": pricelist.id,
            "available_pricelist_ids": [(6, 0, [pricelist.id])],
        })

        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-STALE-PRICE",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 6500.0}],
        })
        if "error" in response:
            self.fail("stale client price should use server pricelist: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        self.assertAlmostEqual(order.lines.price_unit, 6500.0)
        self.assertAlmostEqual(order.amount_total, 6500.0)
        self.assertEqual(order.pricelist_id, pricelist)

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

    def test_peak_hour_report_groups_item_sales_by_hour(self):
        self.env.ref("base.user_admin").tz = "Asia/Baghdad"
        for external_id, posting_date, qty in (
            ("EXT-PEAK-0815", "2026-05-20 05:15:00", 2),
            ("EXT-PEAK-0840", "2026-05-20 05:40:00", 1),
            ("EXT-PEAK-1510", "2026-05-20 12:10:00", 3),
            ("EXT-PEAK-NEXTDAY", "2026-05-20 21:05:00", 4),
        ):
            response = self._jsonrpc("/bayaan/api/kiosk_sale", {
                "kiosk": "K-TEST",
                "external_id": external_id,
                "cashier": self.env.user.name,
                "posting_date": posting_date,
                "items": [{
                    "product": "MENU-OJ",
                    "name": "Orange Juice",
                    "qty": qty,
                    "price_unit": 5500.0,
                }],
                "payments": [{"method": "cash", "amount": qty * 5500.0}],
            })
            if "error" in response:
                self.fail("peak-hour seed sale errored: %s" % response["error"])

        report = self._jsonrpc("/bayaan/api/peak_hour_report", {
            "date_from": "2026-05-20",
            "date_to": "2026-05-20",
            "kiosk": "K-TEST",
            "product": "MENU-OJ",
        })
        if "error" in report:
            self.fail("peak_hour_report errored: %s" % report["error"])
        rows_by_hour = {row["hour"]: row for row in report["result"]["rows"]}
        self.assertEqual(rows_by_hour[8]["qty"], 3)
        self.assertEqual(rows_by_hour[8]["orders"], 2)
        self.assertEqual(rows_by_hour[8]["revenue"], 16500.0)
        self.assertEqual(rows_by_hour[15]["qty"], 3)
        self.assertEqual(rows_by_hour[15]["orders"], 1)
        self.assertNotIn(0, rows_by_hour)
        self.assertEqual(report["result"]["hourlyTotals"][0]["hour"], 8)
        self.assertEqual(report["result"]["topProducts"][0]["product"], "MENU-OJ")

    def test_kiosk_sale_rejects_empty_cart(self):
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-EMPTY",
            "cashier": self.env.user.name,
            "items": [],
            "payments": [{"method": "cash", "amount": 0}],
        })
        self.assertIn("error", response)

    def test_kiosk_sale_date_order_is_never_midnight(self):
        """A live sale must carry a real time-of-day, never 00:00:00. A midnight
        date_order sorts the order to the bottom of the dashboard feed (sorted by
        date_order desc), so a just-posted sale reads as 'missing' in the admin.
        """
        # No posting_date -> Odoo stamps date_order = now().
        no_date = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-NODATE",
            "cashier": self.env.user.name,
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in no_date:
            self.fail("kiosk_sale errored: %s" % no_date["error"])
        order = self.env["pos.order"].sudo().browse(no_date["result"]["id"])
        self.assertNotEqual(
            order.date_order.strftime("%H:%M:%S"), "00:00:00",
            "Sale without posting_date must be stamped at the real time, not midnight",
        )

        # A bare-date posting_date (legacy/other callers) must fall back to the
        # current time-of-day instead of midnight.
        bare = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-BAREDATE",
            "cashier": self.env.user.name,
            "posting_date": "2026-05-20",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in bare:
            self.fail("kiosk_sale errored: %s" % bare["error"])
        bare_order = self.env["pos.order"].sudo().browse(bare["result"]["id"])
        self.assertEqual(bare_order.date_order.strftime("%Y-%m-%d"), "2026-05-20")
        self.assertNotEqual(
            bare_order.date_order.strftime("%H:%M:%S"), "00:00:00",
            "Bare-date posting_date must fall back to current time-of-day, not midnight",
        )
