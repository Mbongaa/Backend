from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestSpectatorRole(BayaanTestBase, HttpCase):
    """Bayaan / Spectator: read-only, chain-wide visibility, zero write access."""

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
        self.other_kiosk = self._create_other_kiosk()
        self.spectator = self._create_user(
            "bayaan_spectator_scope",
            "bayaan_fnb_kiosk.group_bayaan_spectator",
        )

    def test_spectator_auth_status_reports_spectator_role(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/auth_status", {})
        self.assertNotIn("error", response, msg=str(response))
        user = response["result"]["user"]
        self.assertTrue(response["result"]["authenticated"])
        self.assertEqual(user["primaryRole"], "spectator")
        self.assertIn("overview", user["allowedNav"])
        self.assertIn("reports", user["allowedNav"])
        # Spectator UI must not expose the cashier POS panel.
        self.assertFalse(user["allowedPanels"].get("pos", False))

    def test_spectator_chain_bootstrap_sees_full_chain(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        self.assertNotIn("error", response, msg=str(response))
        kiosk_codes = {row["kiosk_code"] for row in response["result"]["kiosks"]}
        # Spectator is not assigned to any kiosk, yet still sees the full chain.
        self.assertIn("K-TEST", kiosk_codes)
        self.assertIn("K-OTHER", kiosk_codes)

    def test_spectator_assigned_kiosks_list_returns_all_kiosks(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/auth_status", {})
        self.assertNotIn("error", response, msg=str(response))
        kiosks = response["result"]["user"]["assignedKiosks"]
        codes = {row["kioskCode"] for row in kiosks}
        self.assertIn("K-TEST", codes)
        self.assertIn("K-OTHER", codes)

    def test_spectator_cannot_open_pos_session(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/open_session", {
            "kiosk": "K-TEST",
            "cashier": "Owner Watch",
        })
        self.assertIn("error", response)

    def test_spectator_cannot_post_pos_sale(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "SPECTATOR-BLOCK-1",
            "lines": [{"product": "PRD-ORANGE-JUICE", "qty": 1.0, "price_unit": 5.0}],
            "payments": [{"method": "cash", "amount": 5.0}],
        })
        self.assertIn("error", response)

    def test_spectator_cannot_create_stock_transfer(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
        })
        self.assertIn("error", response)

    def test_spectator_cannot_create_waste(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/waste", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "reason": "spectator-block-test",
        })
        self.assertIn("error", response)

    def test_spectator_cannot_create_purchase_order(self):
        self.authenticate("bayaan_spectator_scope", "test")
        response = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Acme Co",
            "lines": [{"item": "ING-ORANGE", "qty": 10.0, "unit_cost": 1.0}],
        })
        self.assertIn("error", response)

    def test_spectator_cannot_write_to_kiosk_record(self):
        # Direct ORM check: spectator must not be able to update bayaan.kiosk fields.
        spectator_env = self.env(user=self.spectator)
        kiosk = spectator_env["bayaan.kiosk"].search([("kiosk_code", "=", "K-TEST")], limit=1)
        self.assertTrue(kiosk, "Spectator should see K-TEST via ir.rule")
        # Read works.
        self.assertEqual(kiosk.kiosk_code, "K-TEST")
        from odoo.exceptions import AccessError
        with self.assertRaises(AccessError):
            kiosk.write({"name": "Spectator hijack"})

    def test_spectator_cannot_create_or_unlink_kiosk(self):
        spectator_env = self.env(user=self.spectator)
        from odoo.exceptions import AccessError
        with self.assertRaises(AccessError):
            spectator_env["bayaan.kiosk"].create({
                "name": "Hijacked",
                "kiosk_code": "K-HIJACK",
                "company_id": self.company.id,
            })
        kiosk = spectator_env["bayaan.kiosk"].search([("kiosk_code", "=", "K-TEST")], limit=1)
        with self.assertRaises(AccessError):
            kiosk.unlink()
