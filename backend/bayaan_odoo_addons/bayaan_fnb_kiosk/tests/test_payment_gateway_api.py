from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestPaymentGatewayApi(BayaanTestBase, HttpCase):
    """Gateway transactions are a reconciliation ledger, not a second POS sale."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")

    def test_missing_live_credentials_block_direct_gateway_call(self):
        response = self._jsonrpc("/bayaan/api/payment_transaction", {
            "provider": "fib",
            "amount": 1000.0,
            "external_reference": "PAY-LIVE-BLOCK",
        })
        self.assertIn("error", response)
        self.assertIn("Missing server-side credentials", str(response["error"]))

    def test_mock_fib_transaction_is_idempotent_by_external_reference(self):
        payload = {
            "provider": "fib",
            "amount": 1500.0,
            "external_reference": "PAY-FIB-IDEMP",
            "kiosk": "K-TEST",
            "mock": True,
        }
        first = self._jsonrpc("/bayaan/api/payment_transaction", payload)
        second = self._jsonrpc("/bayaan/api/payment_transaction", payload)
        if "error" in first:
            self.fail("mock FIB transaction errored: %s" % first["error"])
        if "error" in second:
            self.fail("mock FIB idempotency errored: %s" % second["error"])

        self.assertEqual(first["result"]["id"], second["result"]["id"])
        self.assertEqual(first["result"]["status"], "pending")
        self.assertTrue(first["result"]["providerTransactionId"])
        self.assertTrue(first["result"]["qrCode"])
        self.assertTrue(first["result"]["readableCode"])
        self.assertIn("mockWebhookSecret", first["result"])

    def test_duplicate_zaincash_webhook_does_not_double_count(self):
        created = self._jsonrpc("/bayaan/api/payment_transaction", {
            "provider": "zain_cash",
            "amount": 2500.0,
            "external_reference": "PAY-ZAIN-WEBHOOK",
            "kiosk": "K-TEST",
            "mock": True,
        })
        if "error" in created:
            self.fail("mock ZainCash transaction errored: %s" % created["error"])
        result = created["result"]
        callback_payload = {
            "eventId": "EVT-ZAIN-0001",
            "transactionId": result["providerTransactionId"],
            "status": "SUCCESS",
            "externalReference": result["externalReference"],
        }
        url = "%s/bayaan/payment/webhook/zain_cash?secret=%s" % (
            self.base_url(),
            result["mockWebhookSecret"],
        )
        first = self.opener.post(url, json=callback_payload).json()
        second = self.opener.post(url, json=callback_payload).json()

        self.assertTrue(first["ok"])
        self.assertFalse(first["duplicate"])
        self.assertEqual(first["status"], "paid")
        self.assertTrue(second["ok"])
        self.assertTrue(second["duplicate"])

        transaction = self.env["bayaan.payment.transaction"].sudo().browse(result["id"])
        self.assertEqual(transaction.status, "paid")
        self.assertEqual(len(transaction.event_ids), 1)

    def test_webhook_requires_transaction_secret(self):
        created = self._jsonrpc("/bayaan/api/payment_transaction", {
            "provider": "fib",
            "amount": 1000.0,
            "external_reference": "PAY-FIB-SECRET",
            "mock": True,
        })
        if "error" in created:
            self.fail("mock FIB transaction errored: %s" % created["error"])
        response = self.opener.post(
            self.base_url() + "/bayaan/payment/webhook/fib?secret=wrong",
            json={
                "eventId": "EVT-FIB-BLOCKED",
                "paymentId": created["result"]["providerTransactionId"],
                "status": "PAID",
            },
        )
        self.assertEqual(response.status_code, 403)
