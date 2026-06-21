from odoo.exceptions import AccessError
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

    def test_cashier_wrong_order_workflow_and_real_ledger_reversal(self):
        """#5 regression — the exact blocker the demo gate missed: an assigned cashier must be
        able to call /recent_orders and /order_correction (both were excluded from the cashier
        whitelist). Also locks in determinism: a remake/void reverses revenue in the REAL ledger
        (account.move), and the corrected amount is DERIVED server-side (an inflated client
        amount/qty is ignored)."""
        self.authenticate("bayaan_cashier_scope", "test")
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-WRONG-ORDER",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("cashier sale errored: %s" % sale["error"])
        order = self.env["pos.order"].sudo().search([("pos_reference", "=", "EXT-WRONG-ORDER")], limit=1)
        self.assertTrue(order, "sale must create the order to correct")
        line = order.lines[:1]

        # /recent_orders — was rejected for cashiers before the whitelist fix.
        recent = self._jsonrpc("/bayaan/api/recent_orders", {"kiosk": "K-TEST", "limit": 5})
        if "error" in recent:
            self.fail("assigned cashier recent_orders errored (whitelist regression): %s" % recent["error"])
        self.assertIn(order.id, [o["id"] for o in recent["result"]["orders"]])

        # /order_correction remake — was rejected for cashiers; also feeds a forged amount/qty
        # that the server must ignore in favour of the real line value.
        correction = self._jsonrpc("/bayaan/api/order_correction", {
            "kiosk": "K-TEST",
            "order": order.id,
            "line": line.id,
            "outcome": "remake",
            "reason": "customer_rejected",
            "qty": 99,            # forged — server clamps to the line qty (1)
            "amount": 999999.0,   # forged — server derives from the line (5500)
            "note": "wrong drink",
        })
        if "error" in correction:
            self.fail("assigned cashier order_correction errored (whitelist regression): %s" % correction["error"])
        result = correction["result"]
        self.assertEqual(result["state"], "posted")
        self.assertAlmostEqual(result["qty"], 1.0, msg="qty must be clamped to the line, not the forged 99")
        self.assertAlmostEqual(result["amount"], 5500.0, msg="amount must be derived from the line, not the forged 999999")
        self.assertTrue(result["reversal_move_id"], "remake/void must post a REAL reversing account.move")

        move = self.env["account.move"].sudo().browse(result["reversal_move_id"])
        self.assertEqual(move.state, "posted")
        self.assertAlmostEqual(sum(move.line_ids.mapped("debit")), 5500.0, places=2)
        self.assertAlmostEqual(sum(move.line_ids.mapped("credit")), 5500.0, places=2)
        income = self.env["bayaan.gl"].sudo()._bayaan_gl_account("400000", "Product Sales", "income", self.company)
        income_debit = sum(move.line_ids.filtered(lambda l: l.account_id == income).mapped("debit"))
        self.assertAlmostEqual(income_debit, 5500.0, places=2, msg="revenue (Product Sales) must be reversed in the ledger")
        # #3a — the money reversal must CREDIT the ORIGINAL payment channel (cash), not generic bank.
        cash_account = order.payment_ids[:1].payment_method_id.journal_id.default_account_id
        self.assertTrue(cash_account, "the cash payment method must have a settlement account")
        channel_credit = sum(move.line_ids.filtered(lambda l: l.account_id == cash_account).mapped("credit"))
        self.assertAlmostEqual(channel_credit, 5500.0, places=2,
                               msg="the reversal must credit the cash channel that was actually paid")

        # A SECOND correction on the same (now fully-corrected) line must be rejected — no double reversal.
        repeat = self._jsonrpc("/bayaan/api/order_correction", {
            "kiosk": "K-TEST", "order": order.id, "line": line.id,
            "outcome": "remake", "reason": "duplicate",
        })
        # A returned {"error": ...} dict rides under result; a raised UserError is top-level.
        repeat_err = (repeat.get("result") or {}).get("error") or repeat.get("error")
        self.assertTrue(repeat_err, "a second correction on a fully-corrected line must be rejected")
        self.assertIn("already", str(repeat_err).lower())

    def test_cashier_cannot_write_submitted_close(self):
        """#2 — once a close is submitted the cashier cannot alter the (blind) counts or cash:
        the cashier's model WRITE permission on bayaan.shift.close is revoked, so a direct write
        is denied. The submission itself still works because the route runs via sudo."""
        close = self.env["bayaan.shift.close"].sudo().create({
            "kiosk_id": self.kiosk.id,
            "cashier_id": self.cashier.id,
            "opened_at": "2026-05-12 08:00:00",
            "actual_cash": 100.0,
        })
        self.authenticate("bayaan_cashier_scope", "test")
        with self.assertRaises(AccessError):
            close.with_user(self.cashier).write({"actual_cash": 0.0})

    def test_cashier_cannot_correct_order_for_unassigned_kiosk(self):
        """The wrong-order whitelist must not have widened cross-kiosk scope: a cashier may only
        correct orders for a kiosk they are assigned to."""
        self.authenticate("bayaan_cashier_scope", "test")
        blocked = self._jsonrpc("/bayaan/api/recent_orders", {"kiosk": "K-OTHER", "limit": 5})
        self.assertIn("error", blocked)
        self.assertIn("not allowed", str(blocked["error"]).lower())

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

    # ============================================================== P0.4 RBAC
    # Accounting write routes must be server-enforced, not just UI-hidden. These
    # lock the capability matrix: only accountant/manager may post/reverse manual
    # journals, manage the chart, register payments, and run accounting maintenance;
    # only manager may change VAT. A broken guard must fail a test here.

    def _expect_denied(self, route, payload, phrase=None):
        response = self._jsonrpc(route, payload)
        self.assertIn("error", response, "%s must be denied for this role" % route)
        if phrase:
            self.assertIn(phrase, str(response["error"]))
        return response

    def _ensure_account(self, code, name, account_type):
        Account = self.env["account.account"].sudo().with_context(active_test=False)
        account = Account.search([("code", "=", code), ("company_ids", "in", [self.company.id])], limit=1)
        if not account:
            account = Account.create({"code": code, "name": name, "account_type": account_type,
                                      "company_ids": [(6, 0, [self.company.id])]})
        return account

    def _make_manual_move(self, ref):
        """A balanced manual general-journal entry (two balance-sheet legs, so the
        branch-analytic guard does not apply), posted — i.e. reversal-eligible."""
        Journal = self.env["account.journal"].sudo()
        journal = Journal.search([("type", "=", "general"), ("company_id", "=", self.company.id)], limit=1) or \
            Journal.create({"name": "Misc RBAC", "code": "MRBAC", "type": "general", "company_id": self.company.id})
        inv = self._ensure_account("115000", "Inventory", "asset_current")
        ap = self._ensure_account("211000", "Accounts Payable", "liability_payable")
        move = self.env["account.move"].sudo().create({
            "move_type": "entry", "journal_id": journal.id, "ref": ref, "company_id": self.company.id,
            "line_ids": [
                (0, 0, {"name": "dr", "account_id": inv.id, "debit": 1000.0, "credit": 0.0}),
                (0, 0, {"name": "cr", "account_id": ap.id, "debit": 0.0, "credit": 1000.0}),
            ],
        })
        move.action_post()
        return move

    def test_cashier_denied_every_accounting_write_route(self):
        self.authenticate("bayaan_cashier_scope", "test")
        bal = {"lines": [{"account": "115000", "debit": 100.0}, {"account": "211000", "credit": 100.0}]}
        self._expect_denied("/bayaan/api/journal_entry", bal, "Only Bayaan accountants or managers")
        self._expect_denied("/bayaan/api/journal_entry", {"action": "reverse", "id": 1, "reason": "x"},
                            "Only Bayaan accountants or managers")
        self._expect_denied("/bayaan/api/register_payment", {"move": 1},
                            "Only Bayaan accountants or managers")
        self._expect_denied("/bayaan/api/chart_account",
                            {"action": "create", "code": "490001", "name": "X", "type": "income"},
                            "Only Bayaan accountants or managers")
        self._expect_denied("/bayaan/api/accounting_control", {"action": "post_opening_balance"},
                            "Only Bayaan accountants or managers")

    def test_supervisor_and_logistics_denied_accounting_writes(self):
        bal = {"lines": [{"account": "115000", "debit": 100.0}, {"account": "211000", "credit": 100.0}]}
        for login in ("bayaan_supervisor_scope", "bayaan_logistics_scope"):
            self.authenticate(login, "test")
            self._expect_denied("/bayaan/api/journal_entry", bal, "Only Bayaan accountants or managers")
            self._expect_denied("/bayaan/api/accounting_control", {"action": "post_opening_balance"},
                                "Only Bayaan accountants or managers")

    def test_only_manager_changes_vat(self):
        self.authenticate("bayaan_cashier_scope", "test")
        self._expect_denied("/bayaan/api/tax_settings", {"rate": 5})
        self.authenticate("bayaan_accountant_scope", "test")
        self._expect_denied("/bayaan/api/tax_settings", {"rate": 5})  # accountant cannot change VAT
        self.authenticate("bayaan_manager_scope", "test")
        ok = self._jsonrpc("/bayaan/api/tax_settings", {"rate": 0, "priceInclude": True})
        self.assertNotIn("error", ok)

    def test_accountant_can_reverse_manual_entry_with_reason(self):
        move = self._make_manual_move("RBAC manual A")
        self.authenticate("bayaan_accountant_scope", "test")
        no_reason = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": move.id})
        self.assertIn("error", no_reason)
        self.assertIn("reason", str(no_reason["error"]).lower())
        ok = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": move.id, "reason": "correcting"})
        if "error" in ok:
            self.fail("accountant reverse with reason errored: %s" % ok["error"])

    def test_cashier_cannot_reverse_manual_entry(self):
        move = self._make_manual_move("RBAC manual B")
        self.authenticate("bayaan_cashier_scope", "test")
        resp = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": move.id, "reason": "x"})
        self.assertIn("error", resp)
        self.assertIn("Only Bayaan accountants or managers", str(resp["error"]))

    def test_system_entry_cannot_be_reversed_even_by_accountant(self):
        move = self._make_manual_move("Bayaan Sales · K-TEST · 2026-06-13")
        self.authenticate("bayaan_accountant_scope", "test")
        resp = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": move.id, "reason": "try"})
        self.assertIn("error", resp)
        self.assertIn("system entries", str(resp["error"]).lower())

    def test_auth_status_capabilities_match_role_matrix(self):
        expected = {
            "bayaan_cashier_scope": {"postJournal": False, "reverseJournal": False, "registerPayment": False,
                                     "manageChart": False, "approveClose": False, "changeVat": False},
            "bayaan_accountant_scope": {"postJournal": True, "reverseJournal": True, "registerPayment": True,
                                        "manageChart": True, "approveClose": False, "changeVat": False},
            "bayaan_manager_scope": {"postJournal": True, "reverseJournal": True, "registerPayment": True,
                                     "manageChart": True, "approveClose": True, "changeVat": True},
        }
        for login, caps in expected.items():
            self.authenticate(login, "test")
            status = self._jsonrpc("/bayaan/api/auth_status", {})
            got = status["result"]["user"]["capabilities"]
            for key, val in caps.items():
                self.assertEqual(got[key], val, "%s.%s expected %s, got %s" % (login, key, val, got.get(key)))
