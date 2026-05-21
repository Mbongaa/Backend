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
        cash_journal = self.env["account.journal"].sudo().create({
            "name": "Cash Scope %s" % self.pos_config.id,
            "code": ("CS%s" % self.pos_config.id)[-5:],
            "type": "cash",
            "company_id": self.company.id,
        })
        cash_method = self.env["pos.payment.method"].sudo().create({
            "name": "Cash Scope %s" % self.pos_config.id,
            "journal_id": cash_journal.id,
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
        self.logistics = self._create_user(
            "bayaan_logistics_scope",
            "bayaan_fnb_kiosk.group_bayaan_logistics",
        )
        self.accountant = self._create_user(
            "bayaan_accountant_scope",
            "bayaan_fnb_kiosk.group_bayaan_accountant",
        )
        self.manager = self._create_user(
            "bayaan_manager_scope",
            "bayaan_fnb_kiosk.group_bayaan_manager",
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

    def test_cashier_cannot_apply_pos_discount(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-CASHIER-DISCOUNT",
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 1,
                "price_unit": 5500.0,
                "discount_percent": 10.0,
                "discount_reason": "Not allowed",
            }],
            "payments": [{"method": "cash", "amount": 4950.0}],
        })
        self.assertIn("error", response)
        self.assertIn("Only Bayaan managers", str(response["error"]))
        order = self.env["pos.order"].sudo().search([("pos_reference", "=", "EXT-CASHIER-DISCOUNT")], limit=1)
        self.assertFalse(order, "Cashier discount attempt must not create a POS order")

    def test_manager_discount_requires_reason_and_writes_audit_event(self):
        self.authenticate("bayaan_manager_scope", "test")
        missing_reason = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MANAGER-DISCOUNT-NO-REASON",
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 1,
                "price_unit": 5500.0,
                "discount_percent": 10.0,
            }],
            "payments": [{"method": "cash", "amount": 4950.0}],
        })
        self.assertIn("error", missing_reason)
        self.assertIn("reason", str(missing_reason["error"]).lower())

        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-MANAGER-DISCOUNT",
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 1,
                "price_unit": 5500.0,
                "discount_percent": 10.0,
                "discount_reason": "Manager launch promo",
            }],
            "payments": [{"method": "cash", "amount": 4950.0}],
        })
        if "error" in response:
            self.fail("manager discount sale errored: %s" % response["error"])
        order = self.env["pos.order"].sudo().browse(response["result"]["id"])
        self.assertAlmostEqual(order.lines.discount, 10.0)
        self.assertAlmostEqual(order.amount_total, 4950.0)
        event = self.env["bayaan.audit.event"].sudo().search([
            ("action", "=", "sale.discount.approved"),
            ("model_name", "=", "pos.order"),
            ("res_id", "=", order.id),
        ], limit=1)
        self.assertTrue(event, "Manager discount must write an audit event")
        self.assertEqual(event.actor_id, self.manager)
        self.assertIn("Manager launch promo", event.payload_json)

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
        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("cashier chain_bootstrap errored: %s" % bootstrap["error"])
        transfer_rows = bootstrap["result"]["transfers"]
        transfer_row = next(
            row for row in transfer_rows
            if row["name"] == created["result"]["name"]
        )
        self.assertEqual(transfer_row["bayaan_state"], "dispatched")
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

    def test_manager_cannot_receive_on_behalf_of_kiosk(self):
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

        self.authenticate("bayaan_manager_scope", "test")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "receive",
        })
        self.assertIn("error", received)
        self.assertIn("not allowed", str(received["error"]))

    def test_superadmin_can_receive_transfer_for_pos_testing(self):
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

        self.authenticate("admin", "admin")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "receive",
        })
        if "error" in received:
            self.fail("superadmin receive errored: %s" % received["error"])
        self.assertEqual(received["result"]["bayaan_state"], "received")

    def test_cashier_cannot_create_purchase_order(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Blocked Supplier",
            "items": [{"item": "ING-ORANGE", "qty": 1.0, "rate": 1500.0}],
        })
        self.assertIn("error", response)
        self.assertIn("Only Bayaan logistics or managers", str(response["error"]))

    def test_logistics_can_create_purchase_order(self):
        self.authenticate("bayaan_logistics_scope", "test")
        response = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Baghdad Fruit Test",
            "items": [{"item": "ING-ORANGE", "qty": 1.0, "rate": 1500.0}],
        })
        if "error" in response:
            self.fail("logistics purchase order errored: %s" % response["error"])
        self.assertTrue(response["result"]["name"])

    def test_logistics_can_create_transfer_for_any_kiosk(self):
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.warehouse.lot_stock_id,
            3.0,
        )
        self.authenticate("bayaan_logistics_scope", "test")
        response = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-OTHER",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in response:
            self.fail("logistics transfer errored: %s" % response["error"])
        self.assertTrue(response["result"]["name"])
        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": response["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("logistics dispatch errored: %s" % dispatched["error"])
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": response["result"]["name"],
            "action": "receive",
        })
        self.assertIn("error", received)
        self.assertIn("not allowed", str(received["error"]))

    def test_logistics_cannot_post_pos_sale(self):
        self.authenticate("bayaan_logistics_scope", "test")
        response = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-LOGISTICS-SALE-BLOCKED",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        self.assertIn("error", response)
        self.assertIn("not allowed", str(response["error"]))

    def test_accountant_cannot_create_stock_transfer(self):
        self.authenticate("bayaan_accountant_scope", "test")
        response = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
        })
        self.assertIn("error", response)
        self.assertIn("not allowed", str(response["error"]))

    def test_chain_bootstrap_is_scoped_to_assigned_kiosks(self):
        self.authenticate("bayaan_cashier_scope", "test")
        response = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in response:
            self.fail("chain_bootstrap errored: %s" % response["error"])
        kiosk_codes = {row["kiosk_code"] for row in response["result"]["kiosks"]}
        self.assertEqual(kiosk_codes, {"K-TEST"})

    def test_chain_bootstrap_includes_roles_for_accountant(self):
        self.authenticate("bayaan_accountant_scope", "test")
        response = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in response:
            self.fail("accountant chain_bootstrap errored: %s" % response["error"])
        self.assertEqual(response["result"]["current_user"]["primaryRole"], "accountant")
        kiosk_codes = {row["kiosk_code"] for row in response["result"]["kiosks"]}
        self.assertIn("K-TEST", kiosk_codes)
        self.assertIn("K-OTHER", kiosk_codes)

    def test_auth_status_reports_current_bayaan_role(self):
        self.authenticate("bayaan_logistics_scope", "test")
        response = self._jsonrpc("/bayaan/api/auth_status", {})
        if "error" in response:
            self.fail("auth_status errored: %s" % response["error"])
        self.assertTrue(response["result"]["authenticated"])
        self.assertEqual(response["result"]["user"]["primaryRole"], "logistics")
        self.assertIn("inventory", response["result"]["user"]["allowedNav"])

    def test_superadmin_auth_status_can_open_pos_for_any_kiosk(self):
        self.authenticate("admin", "admin")
        response = self._jsonrpc("/bayaan/api/auth_status", {})
        if "error" in response:
            self.fail("superadmin auth_status errored: %s" % response["error"])
        user = response["result"]["user"]
        self.assertEqual(user["primaryRole"], "superadmin")
        self.assertTrue(user["allowedPanels"]["pos"])
        kiosk_codes = {row["kioskCode"] for row in user["assignedKiosks"]}
        self.assertIn("K-TEST", kiosk_codes)
        self.assertIn("K-OTHER", kiosk_codes)

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
