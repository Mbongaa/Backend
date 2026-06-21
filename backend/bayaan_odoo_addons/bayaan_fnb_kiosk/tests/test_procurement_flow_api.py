from datetime import datetime, timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestProcurementFlowApi(BayaanTestBase, HttpCase):
    """Purchase receipt and stock allocation must move real Odoo stock."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def _qty(self, product, location):
        return self.env["stock.quant"].sudo()._get_available_quantity(product, location)

    def _account(self, code, account_type):
        account = self.env["account.account"].sudo().search([
            ("code", "=", code),
            ("company_ids", "in", [self.company.id]),
        ], limit=1)
        if account:
            return account
        return self.env["account.account"].sudo().create({
            "name": code,
            "code": code,
            "account_type": account_type,
            "company_ids": [(6, 0, [self.company.id])],
        })

    def _landed_cost_fifo_category(self):
        return self.env["product.category"].sudo().create({
            "name": "Bayaan Landed Cost FIFO",
            "property_valuation": "real_time",
            "property_cost_method": "fifo",
            "property_stock_valuation_account_id": self._account("BLCVAL", "asset_current").id,
        })

    def _deliver_to_customer(self, product, qty):
        move = self.env["stock.move"].sudo().create({
            "product_id": product.id,
            "location_id": self.warehouse.lot_stock_id.id,
            "location_dest_id": self.env.ref("stock.stock_location_customers").id,
            "product_uom": product.uom_id.id,
            "product_uom_qty": qty,
            "picking_type_id": self.warehouse.out_type_id.id,
        })
        move._action_confirm()
        move._action_assign()
        move._set_quantity_done(qty)
        move.picked = True
        move._action_done()
        return move

    def _create_cashier_user(self):
        group = self.env.ref("bayaan_fnb_kiosk.group_bayaan_cashier")
        return self.env["res.users"].sudo().create({
            "name": "Procurement Cashier",
            "login": "bayaan_procurement_cashier",
            "email": "bayaan_procurement_cashier@example.test",
            "password": "test",
            "company_id": self.company.id,
            "company_ids": [(6, 0, [self.company.id])],
            "group_ids": [(6, 0, [group.id])],
        })

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")
        self.cashier = self._create_cashier_user()
        self.kiosk.cashier_user_ids = [(4, self.cashier.id)]
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

    def test_purchase_order_receive_moves_stock_into_warehouse(self):
        before = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        created = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Baghdad Test Produce",
            "invoice_ref": "INV-BD-TEST",
            "invoice_name": "invoice-test.pdf",
            "invoice_file": "JVBERi0xLjQK",
            "invoice_mimetype": "application/pdf",
            "items": [{
                "item": "ING-ORANGE",
                "qty": 12.0,
                "rate": 1500.0,
            }],
        })
        if "error" in created:
            self.fail("purchase_order errored: %s" % created["error"])
        order_name = created["result"]["name"]
        order = self.env["purchase.order"].sudo().search([("name", "=", order_name)], limit=1)
        self.assertEqual(order.partner_ref, "INV-BD-TEST")
        attachment = self.env["ir.attachment"].sudo().search([
            ("res_model", "=", "purchase.order"),
            ("res_id", "=", order.id),
            ("name", "=", "invoice-test.pdf"),
        ], limit=1)
        self.assertTrue(attachment)

        self.assertEqual(created["result"]["state"], "purchase")

        received = self._jsonrpc("/bayaan/api/purchase_order_action", {
            "po": order_name,
            "action": "receive",
        })
        if "error" in received:
            self.fail("purchase_order_action receive errored: %s" % received["error"])
        self.assertEqual(received["result"]["receipt_state"], "done")
        self.assertAlmostEqual(
            self._qty(self.ingredient_orange, self.warehouse.lot_stock_id) - before,
            12.0,
        )

    def test_create_supplier_persists_partner_setup_fields(self):
        response = self._jsonrpc("/bayaan/api/create_supplier", {
            "name": "Baghdad Dairy Setup",
            "address": "Karrada, Baghdad",
            "category": "Dairy",
            "delivery_category": "Same day",
        })
        if "error" in response:
            self.fail("create_supplier errored: %s" % response["error"])

        supplier = response["result"]["supplier"]
        self.assertEqual(supplier["name"], "Baghdad Dairy Setup")
        self.assertEqual(supplier["category"], "Dairy")
        self.assertEqual(supplier["deliveryCategory"], "Same day")
        partner = self.env["res.partner"].sudo().browse(supplier["id"])
        self.assertEqual(partner.supplier_rank, 1)
        self.assertEqual(partner.street, "Karrada, Baghdad")
        self.assertEqual(partner.bayaan_supplier_category, "Dairy")
        self.assertEqual(partner.bayaan_delivery_category, "Same day")

    def test_recurring_purchase_run_creates_confirmed_purchase_order(self):
        created = self._jsonrpc("/bayaan/api/recurring_purchase", {
            "name": "Monday fresh produce",
            "supplier": "Baghdad Weekly Produce",
            "warehouse": self.warehouse.name,
            "frequency": "weekly",
            "weekday": "0",
            "next_date": "2026-05-18",
            "items": [{
                "item": "ING-ORANGE",
                "qty": 14.0,
                "rate": 1450.0,
            }],
        })
        if "error" in created:
            self.fail("recurring_purchase create errored: %s" % created["error"])
        plan = created["result"]["recurring_purchase"]
        self.assertEqual(plan["supplier"], "Baghdad Weekly Produce")
        self.assertEqual(plan["warehouse"], self.warehouse.name)
        self.assertEqual(len(plan["lines"]), 1)

        run = self._jsonrpc("/bayaan/api/recurring_purchase", {
            "id": plan["id"],
            "action": "run",
        })
        if "error" in run:
            self.fail("recurring_purchase run errored: %s" % run["error"])
        self.assertEqual(len(run["result"]["purchase_orders"]), 1)

        order = self.env["purchase.order"].sudo().browse(run["result"]["purchase_orders"][0]["id"])
        self.assertTrue(order.exists())
        self.assertEqual(order.state, "purchase")
        self.assertEqual(order.partner_id.name, "Baghdad Weekly Produce")
        self.assertEqual(order.picking_type_id, self.warehouse.in_type_id)
        self.assertEqual(order.order_line.product_id.default_code, "ING-ORANGE")
        self.assertAlmostEqual(order.order_line.product_qty, 14.0)

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap errored: %s" % bootstrap["error"])
        plan_ids = {row["id"] for row in bootstrap["result"]["recurring_purchases"]}
        self.assertIn(plan["id"], plan_ids)

    def test_product_catalog_persists_source_image(self):
        image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
        created = self._jsonrpc("/bayaan/api/product_catalog", {
            "name": "Source Image Latte",
            "code": "SRC-IMG-LATTE",
            "category": "Hot Coffee",
            "list_price": 7500.0,
            "standard_price": 2500.0,
            "consumption_mode": "recipe",
            "available_in_pos": True,
            "image_base64": "data:image/png;base64,%s" % image,
        })
        if "error" in created:
            self.fail("product_catalog image create errored: %s" % created["error"])
        product_row = created["result"]["product"]
        self.assertTrue(product_row["image_128"])
        self.assertTrue(product_row["image_data_url"].startswith("data:image/"))

        product = self.env["product.product"].sudo().search([("default_code", "=", "SRC-IMG-LATTE")], limit=1)
        self.assertTrue(product.product_tmpl_id.image_1920)

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap after product image errored: %s" % bootstrap["error"])
        rows = [
            row for row in bootstrap["result"]["products"]
            if row["default_code"] == "SRC-IMG-LATTE"
        ]
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["image_data_url"].startswith("data:image/"))

    def test_purchase_order_partial_receive_records_shortage(self):
        before = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        created = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Baghdad Short Produce",
            "warehouse": self.warehouse.name,
            "items": [{
                "item": "ING-ORANGE",
                "qty": 100.0,
                "rate": 1500.0,
            }],
        })
        if "error" in created:
            self.fail("purchase_order errored: %s" % created["error"])

        received = self._jsonrpc("/bayaan/api/purchase_order_action", {
            "po": created["result"]["name"],
            "action": "receive",
            "items": [{
                "item": "ING-ORANGE",
                "received_qty": 92.0,
                "note": "Supplier delivered 8 kg short",
            }],
        })
        if "error" in received:
            self.fail("purchase_order_action partial receive errored: %s" % received["error"])

        self.assertEqual(received["result"]["receipt_state"], "done")
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.warehouse.lot_stock_id) - before, 92.0)
        discrepancies = received["result"]["pickings"][0]["discrepancies"]
        self.assertEqual(len(discrepancies), 1)
        self.assertEqual(discrepancies[0]["product"], "ING-ORANGE")
        self.assertAlmostEqual(discrepancies[0]["expectedQty"], 100.0)
        self.assertAlmostEqual(discrepancies[0]["receivedQty"], 92.0)
        self.assertAlmostEqual(discrepancies[0]["shortageQty"], 8.0)
        self.assertIn("8 kg short", discrepancies[0]["note"])

    def test_landed_cost_allocates_after_partial_sale(self):
        category = self._landed_cost_fifo_category()
        green_beans_template = self.env["product.template"].sudo().create({
            "name": "FIFO Green Beans",
            "default_code": "LC-BEANS",
            "type": "consu",
            "is_storable": True,
            "uom_id": self.uom_kgm.id,
            "standard_price": 10.0,
            "categ_id": category.id,
            "bayaan_consumption_mode": "none",
        })
        green_beans = green_beans_template.product_variant_id
        customs = self.env["product.product"].sudo().create({
            "name": "Customs Duty",
            "default_code": "LC-CUSTOMS",
            "type": "service",
            "landed_cost_ok": True,
            "split_method_landed_cost": "by_quantity",
            "property_account_expense_id": self._account("BLCEXP", "expense").id,
            "company_id": self.company.id,
        })

        created = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Baghdad Customs Beans",
            "warehouse": self.warehouse.name,
            "items": [{
                "item": "LC-BEANS",
                "qty": 10.0,
                "rate": 10.0,
            }],
        })
        if "error" in created:
            self.fail("purchase_order errored: %s" % created["error"])
        received = self._jsonrpc("/bayaan/api/purchase_order_action", {
            "po": created["result"]["name"],
            "action": "receive",
        })
        if "error" in received:
            self.fail("purchase_order_action receive errored: %s" % received["error"])

        self._deliver_to_customer(green_beans, 4.0)
        green_beans.invalidate_recordset()
        self.assertAlmostEqual(green_beans.qty_available, 6.0)
        self.assertAlmostEqual(green_beans.total_value, 60.0)

        landed = self._jsonrpc("/bayaan/api/landed_cost", {
            "po": created["result"]["name"],
            "description": "Customs invoice arrived after partial sale",
            "costs": [{
                "product": "LC-CUSTOMS",
                "name": "Customs",
                "amount": 100.0,
                "split_method": "by_quantity",
            }],
        })
        if "error" in landed:
            self.fail("landed_cost errored: %s" % landed["error"])

        result = landed["result"]
        self.assertEqual(result["state"], "done")
        self.assertAlmostEqual(result["amountTotal"], 100.0)
        self.assertEqual(len(result["valuationAdjustments"]), 1)
        self.assertAlmostEqual(result["valuationAdjustments"][0]["additionalCost"], 100.0)

        green_beans.invalidate_recordset()
        self.assertAlmostEqual(green_beans.qty_available, 6.0)
        self.assertAlmostEqual(green_beans.total_value, 120.0)

        landed_cost = self.env["stock.landed.cost"].sudo().browse(result["id"])
        self.assertTrue(landed_cost.account_move_id)
        self.assertEqual(landed_cost.account_move_id.state, "posted")
        product_lines = landed_cost.account_move_id.line_ids.filtered(lambda line: line.display_type == "product")
        self.assertTrue(product_lines)
        self.assertTrue(all(line.analytic_distribution for line in product_lines))
        self.assertEqual(landed_cost.cost_lines.product_id, customs)

    def test_stock_transfer_receive_moves_stock_from_warehouse_to_kiosk(self):
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.warehouse.lot_stock_id, 10.0)
        warehouse_before = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        kiosk_before = self._qty(self.ingredient_orange, self.kiosk_location)

        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 4.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in created:
            self.fail("stock_transfer errored: %s" % created["error"])
        transfer_name = created["result"]["name"]

        approved = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer_name,
            "action": "approve",
        })
        if "error" in approved:
            self.fail("stock_transfer_action approve errored: %s" % approved["error"])
        self.assertIn(approved["result"]["state"], ("confirmed", "assigned", "partially_available"))

        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer_name,
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("stock_transfer_action dispatch errored: %s" % dispatched["error"])
        self.assertEqual(dispatched["result"]["bayaan_state"], "dispatched")

        self.authenticate("bayaan_procurement_cashier", "test")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer_name,
            "action": "receive",
        })
        if "error" in received:
            self.fail("stock_transfer_action receive errored: %s" % received["error"])
        self.assertEqual(received["result"]["state"], "done")
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.warehouse.lot_stock_id), warehouse_before - 4.0)
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.kiosk_location), kiosk_before + 4.0)

    def _create_second_kiosk(self):
        loc = self.env["stock.location"].sudo().create({
            "name": "Kiosk K-TEST2 Location", "usage": "internal",
            "location_id": self.warehouse.view_location_id.id, "company_id": self.company.id,
        })
        pos_config = self.env["pos.config"].sudo().create({
            "name": "K-TEST2 POS", "company_id": self.company.id,
            "journal_id": self.pos_journal.id, "invoice_journal_id": self.invoice_journal.id,
            "payment_method_ids": [(6, 0, [self.test_payment_method.id])],
        })
        pos_config.picking_type_id.default_location_src_id = loc
        kiosk = self.env["bayaan.kiosk"].sudo().create({
            "name": "Mansour Test Kiosk", "kiosk_code": "K-TEST2",
            "pos_config_id": pos_config.id, "stock_location_id": loc.id,
            "stock_deduction_policy": "warning", "company_id": self.company.id,
        })
        return kiosk, loc

    def test_stock_transfer_kiosk_to_kiosk_conserves_stock(self):
        # #3 — a kiosk→kiosk transfer must move stock from the SOURCE kiosk location to the DEST
        # kiosk location (not a warehouse), run the full lifecycle, and conserve total stock.
        Quant = self.env["stock.quant"].sudo()
        _dest_kiosk, dest_loc = self._create_second_kiosk()
        Quant._update_available_quantity(self.ingredient_orange, self.kiosk_location, 20.0)
        src_before = self._qty(self.ingredient_orange, self.kiosk_location)
        dest_before = self._qty(self.ingredient_orange, dest_loc)

        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST2",       # destination kiosk
            "from_kiosk": "K-TEST",   # SOURCE kiosk (not a warehouse)
            "item": "ING-ORANGE",
            "qty": 5.0,
        })
        if "error" in created:
            self.fail("kiosk->kiosk stock_transfer errored: %s" % created["error"])
        transfer_name = created["result"]["name"]

        picking = self.env["stock.picking"].sudo().search([("name", "=", transfer_name)], limit=1)
        self.assertEqual(picking.location_id, self.kiosk_location,
            "source leg must be the SOURCE kiosk location")
        self.assertEqual(picking.location_dest_id, dest_loc,
            "dest leg must be the DEST kiosk location (no warehouse)")

        for action in ("approve", "dispatch", "receive"):
            resp = self._jsonrpc("/bayaan/api/stock_transfer_action", {
                "transfer": transfer_name, "action": action,
            })
            if "error" in resp:
                self.fail("kiosk->kiosk %s errored: %s" % (action, resp["error"]))

        self.assertEqual(self.env["stock.picking"].sudo().browse(picking.id).state, "done")
        src_after = self._qty(self.ingredient_orange, self.kiosk_location)
        dest_after = self._qty(self.ingredient_orange, dest_loc)
        self.assertAlmostEqual(src_after, src_before - 5.0)
        self.assertAlmostEqual(dest_after, dest_before + 5.0)
        self.assertAlmostEqual(src_after + dest_after, src_before + dest_before,
            msg="kiosk→kiosk transfer must conserve total stock")

    def test_stock_transfer_receive_records_discrepancy_reason(self):
        # #7 — a short receive with a structured reason stores both the shortage and the reason.
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.warehouse.lot_stock_id, 10.0)
        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST", "item": "ING-ORANGE", "qty": 6.0, "from_warehouse": self.warehouse.name,
        })
        if "error" in created:
            self.fail("stock_transfer errored: %s" % created["error"])
        transfer_name = created["result"]["name"]
        for action in ("approve", "dispatch"):
            resp = self._jsonrpc("/bayaan/api/stock_transfer_action", {"transfer": transfer_name, "action": action})
            if "error" in resp:
                self.fail("%s errored: %s" % (action, resp["error"]))
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer_name, "action": "receive",
            "items": [{
                "itemId": "ING-ORANGE", "receivedQty": 4.0, "damagedQty": 0.0,
                "reason": "short_delivery", "note": "Driver shorted us 2 units",
            }],
        })
        if "error" in received:
            self.fail("receive errored: %s" % received["error"])
        picking = self.env["stock.picking"].sudo().search([("name", "=", transfer_name)], limit=1)
        disc = picking.bayaan_discrepancy_line_ids.filtered(
            lambda d: d.product_id == self.ingredient_orange)
        self.assertTrue(disc, "a short receive must record a discrepancy line")
        self.assertEqual(disc.reason, "short_delivery")
        self.assertAlmostEqual(disc.shortage_qty, 2.0)
        self.assertIn("Driver shorted", disc.note or "")

    def test_stock_transfer_persists_external_origin_reference(self):
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.warehouse.lot_stock_id, 2.0)
        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
            "origin": "BAYAAN-LIVE-SMOKE-TRACE",
        })
        if "error" in created:
            self.fail("stock_transfer errored: %s" % created["error"])

        picking = self.env["stock.picking"].sudo().search([("name", "=", created["result"]["name"])], limit=1)
        self.assertEqual(picking.origin, "BAYAAN-LIVE-SMOKE-TRACE")
        self.assertEqual(created["result"]["origin"], "BAYAAN-LIVE-SMOKE-TRACE")

    def test_chain_bootstrap_keeps_old_dispatched_transfer_visible_for_pos_receive(self):
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.warehouse.lot_stock_id, 10.0)
        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 1.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in created:
            self.fail("stock_transfer errored: %s" % created["error"])
        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("stock_transfer_action dispatch errored: %s" % dispatched["error"])

        picking = self.env["stock.picking"].sudo().browse(dispatched["result"]["id"])
        old_date = fields.Datetime.now() - timedelta(days=2)
        self.env.cr.execute(
            "UPDATE stock_picking SET scheduled_date = %s, create_date = %s WHERE id = %s",
            (old_date, old_date, picking.id),
        )
        picking.invalidate_recordset()

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap errored: %s" % bootstrap["error"])
        transfer_rows = bootstrap["result"]["transfers"]
        transfer_row = next(
            row for row in transfer_rows
            if row["name"] == created["result"]["name"]
        )
        self.assertEqual(transfer_row["bayaan_state"], "dispatched")
        self.assertEqual(transfer_row["toKioskId"], "K-TEST")

    def test_multiline_transfer_partial_receive_records_shortage(self):
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.warehouse.lot_stock_id, 10.0)
        Quant._update_available_quantity(self.ingredient_sugar, self.warehouse.lot_stock_id, 5.0)
        warehouse_orange_before = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        warehouse_sugar_before = self._qty(self.ingredient_sugar, self.warehouse.lot_stock_id)
        kiosk_orange_before = self._qty(self.ingredient_orange, self.kiosk_location)
        kiosk_sugar_before = self._qty(self.ingredient_sugar, self.kiosk_location)

        created = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "from_warehouse": self.warehouse.name,
            "items": [
                {"item": "ING-ORANGE", "qty": 6.0},
                {"item": "ING-SUGAR", "qty": 2.0},
            ],
        })
        if "error" in created:
            self.fail("stock_transfer multiline errored: %s" % created["error"])
        self.assertEqual(len(created["result"]["lines"]), 2)

        dispatched = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched:
            self.fail("stock_transfer_action dispatch errored: %s" % dispatched["error"])

        self.authenticate("bayaan_procurement_cashier", "test")
        received = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": created["result"]["name"],
            "action": "receive",
            "items": [
                {"item": "ING-ORANGE", "received_qty": 5.5, "note": "0.5 kg missing at kiosk receipt"},
                {"item": "ING-SUGAR", "received_qty": 2.0},
            ],
        })
        if "error" in received:
            self.fail("stock_transfer_action multiline receive errored: %s" % received["error"])

        self.assertEqual(received["result"]["state"], "done")
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.warehouse.lot_stock_id), warehouse_orange_before - 5.5)
        self.assertAlmostEqual(self._qty(self.ingredient_sugar, self.warehouse.lot_stock_id), warehouse_sugar_before - 2.0)
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.kiosk_location), kiosk_orange_before + 5.5)
        self.assertAlmostEqual(self._qty(self.ingredient_sugar, self.kiosk_location), kiosk_sugar_before + 2.0)
        discrepancies = received["result"]["discrepancies"]
        self.assertEqual(len(discrepancies), 1)
        self.assertEqual(discrepancies[0]["product"], "ING-ORANGE")
        self.assertAlmostEqual(discrepancies[0]["expectedQty"], 6.0)
        self.assertAlmostEqual(discrepancies[0]["receivedQty"], 5.5)
        self.assertAlmostEqual(discrepancies[0]["shortageQty"], 0.5)

    def test_chain_bootstrap_stock_health_uses_product_target_quantities(self):
        self.ingredient_orange.product_tmpl_id.write({
            "bayaan_stock_target_qty": 100.0,
            "bayaan_stock_reorder_qty": 40.0,
            "bayaan_stock_critical_qty": 10.0,
        })
        current = self._qty(self.ingredient_orange, self.kiosk_location)
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.kiosk_location,
            20.0 - current,
        )

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap errored: %s" % bootstrap["error"])

        stock_row = next(
            row for row in bootstrap["result"]["kiosk_stock_rows"]
            if row["kiosk"] == "K-TEST" and row["item"] == "ING-ORANGE"
        )
        self.assertEqual(stock_row["target_qty"], 100.0)
        self.assertEqual(stock_row["reorder_qty"], 40.0)
        self.assertEqual(stock_row["critical_qty"], 10.0)
        self.assertEqual(stock_row["stock_percent"], 20.0)
        self.assertEqual(stock_row["stock_status"], "low")
        kiosk_summary = next(
            row for row in bootstrap["result"]["summary"]["byKiosk"]
            if row["kioskId"] == "K-TEST"
        )
        self.assertEqual(kiosk_summary["stockHealth"], 20)
        suggestions = [
            row for row in bootstrap["result"]["suggested_transfers"]
            if row["kiosk"] == "K-TEST" and row["item"] == "ING-ORANGE"
        ]
        self.assertTrue(suggestions)
        self.assertEqual(suggestions[0]["target_qty"], 100.0)
        self.assertEqual(suggestions[0]["qty"], 80.0)

    def test_chain_bootstrap_unconfigured_stock_does_not_auto_mark_100_percent(self):
        self.ingredient_orange.product_tmpl_id.write({
            "bayaan_stock_target_qty": 0.0,
            "bayaan_stock_reorder_qty": 0.0,
            "bayaan_stock_critical_qty": 0.0,
            "bayaan_stock_max_qty": 0.0,
        })
        current = self._qty(self.ingredient_orange, self.kiosk_location)
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange,
            self.kiosk_location,
            20.0 - current,
        )

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap errored: %s" % bootstrap["error"])

        stock_row = next(
            row for row in bootstrap["result"]["kiosk_stock_rows"]
            if row["kiosk"] == "K-TEST" and row["item"] == "ING-ORANGE"
        )
        self.assertEqual(stock_row["target_qty"], 0.0)
        self.assertEqual(stock_row["stock_percent"], 0.0)
        self.assertEqual(stock_row["stock_status"], "unconfigured")
        self.assertEqual(stock_row["target_source"], "unconfigured")
        kiosk_summary = next(
            row for row in bootstrap["result"]["summary"]["byKiosk"]
            if row["kioskId"] == "K-TEST"
        )
        self.assertEqual(kiosk_summary["lowStockItems"], 0)
        self.assertEqual(kiosk_summary["zeroStockItems"], 0)

    def test_chain_bootstrap_warehouse_stock_uses_central_location_not_kiosk_stock(self):
        warehouse_current = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        kiosk_current = self._qty(self.ingredient_orange, self.kiosk_location)
        warehouse_delta = 0.0 - warehouse_current
        if warehouse_delta:
            self.env["stock.quant"].sudo()._update_available_quantity(
                self.ingredient_orange,
                self.warehouse.lot_stock_id,
                warehouse_delta,
            )
        kiosk_delta = 4.0 - kiosk_current
        if kiosk_delta:
            self.env["stock.quant"].sudo()._update_available_quantity(
                self.ingredient_orange,
                self.kiosk_location,
                kiosk_delta,
            )

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain_bootstrap errored: %s" % bootstrap["error"])

        warehouse_row = next(
            row for row in bootstrap["result"]["warehouse_stock"]
            if row["item"] == "ING-ORANGE"
        )
        kiosk_row = next(
            row for row in bootstrap["result"]["kiosk_stock_rows"]
            if row["kiosk"] == "K-TEST" and row["item"] == "ING-ORANGE"
        )
        self.assertEqual(warehouse_row["actual_qty"], 0.0)
        self.assertEqual(kiosk_row["actual_qty"], 4.0)

    def test_full_stock_loop_purchase_transfer_sale_waste_and_close(self):
        opened_at = datetime.now() - timedelta(minutes=10)
        warehouse_open = self._qty(self.ingredient_orange, self.warehouse.lot_stock_id)
        kiosk_open_orange = self._qty(self.ingredient_orange, self.kiosk_location)
        kiosk_open_sugar = self._qty(self.ingredient_sugar, self.kiosk_location)
        kiosk_open_cup = self._qty(self.ingredient_cup, self.kiosk_location)

        po = self._jsonrpc("/bayaan/api/purchase_order", {
            "supplier": "Baghdad Loop Produce",
            "warehouse": self.warehouse.name,
            "items": [{"item": "ING-ORANGE", "qty": 8.0, "rate": 1500.0}],
        })
        if "error" in po:
            self.fail("purchase_order errored: %s" % po["error"])
        received_po = self._jsonrpc("/bayaan/api/purchase_order_action", {
            "po": po["result"]["name"],
            "action": "receive",
        })
        if "error" in received_po:
            self.fail("purchase_order_action receive errored: %s" % received_po["error"])
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.warehouse.lot_stock_id), warehouse_open + 8.0)

        transfer = self._jsonrpc("/bayaan/api/stock_transfer", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "qty": 5.0,
            "from_warehouse": self.warehouse.name,
        })
        if "error" in transfer:
            self.fail("stock_transfer errored: %s" % transfer["error"])
        dispatched_transfer = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer["result"]["name"],
            "action": "dispatch",
        })
        if "error" in dispatched_transfer:
            self.fail("stock_transfer_action dispatch errored: %s" % dispatched_transfer["error"])
        self.authenticate("bayaan_procurement_cashier", "test")
        received_transfer = self._jsonrpc("/bayaan/api/stock_transfer_action", {
            "transfer": transfer["result"]["name"],
            "action": "receive",
        })
        if "error" in received_transfer:
            self.fail("stock_transfer_action receive errored: %s" % received_transfer["error"])
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.warehouse.lot_stock_id), warehouse_open + 3.0)
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.kiosk_location), kiosk_open_orange + 5.0)

        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-FULL-STOCK-LOOP",
            "cashier": self.env.user.name,
            "posting_date": fields.Datetime.to_string(datetime.now()),
            "items": [{
                "product": "MENU-OJ",
                "name": "Orange Juice",
                "qty": 4,
                "price_unit": 5500.0,
            }],
            "payments": [{"method": "cash", "amount": 22000.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        self.assertEqual(sale["result"]["consumption_state"], "posted")
        self.assertAlmostEqual(self._qty(self.ingredient_orange, self.kiosk_location), kiosk_open_orange + 5.0 - 1.2)
        self.assertAlmostEqual(self._qty(self.ingredient_sugar, self.kiosk_location), kiosk_open_sugar - 0.08)
        self.assertAlmostEqual(self._qty(self.ingredient_cup, self.kiosk_location), kiosk_open_cup - 4.0)

        waste = self._jsonrpc("/bayaan/api/waste", {
            "kiosk": "K-TEST",
            "item": "ING-ORANGE",
            "name": "Orange",
            "qty": 0.5,
            "reason": "spoiled_fruit",
        })
        if "error" in waste:
            self.fail("waste errored: %s" % waste["error"])
        self.assertEqual(waste["result"]["state"], "posted")
        self.assertTrue(waste["result"]["scrap_ids"], "Ingredient waste must create a real stock scrap")

        orange_actual = self._qty(self.ingredient_orange, self.kiosk_location)
        sugar_actual = self._qty(self.ingredient_sugar, self.kiosk_location)
        cup_actual = self._qty(self.ingredient_cup, self.kiosk_location)
        self.assertAlmostEqual(orange_actual, kiosk_open_orange + 5.0 - 1.2 - 0.5)

        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(opened_at),
            "expected_cash": 22000.0,
            "actual_cash": 22000.0,
            "pos_invoices": [sale["result"]["name"]],
            "ingredient_counts": [
                {"ingredient": "ING-ORANGE", "actual_qty": orange_actual},
                {"ingredient": "ING-SUGAR", "actual_qty": sugar_actual},
                {"ingredient": "ING-CUP", "actual_qty": cup_actual},
            ],
        })
        if "error" in close:
            self.fail("shift_close errored: %s" % close["error"])

        # #2 blind close: the cashier submit response deliberately omits the variance/expected
        # figures. The variance math is read from the record (manager-visible) instead.
        record = self.env["bayaan.shift.close"].sudo().browse(close["result"]["id"])
        by_ingredient = {line.ingredient_id.id: line for line in record.ingredient_variance_line_ids}
        orange_line = by_ingredient[self.ingredient_orange.id]
        self.assertAlmostEqual(orange_line.received_qty, 5.0)
        self.assertAlmostEqual(orange_line.consumed_qty, 1.2)
        self.assertAlmostEqual(orange_line.waste_qty, 0.5)
        self.assertAlmostEqual(orange_line.expected_qty, orange_actual)
        self.assertAlmostEqual(orange_line.variance_qty, 0.0)
        self.assertAlmostEqual(by_ingredient[self.ingredient_sugar.id].consumed_qty, 0.08)
        self.assertAlmostEqual(by_ingredient[self.ingredient_cup.id].consumed_qty, 4.0)

    def test_shift_close_approval_locks_record(self):
        # opened_at = now (not now-30min): this close must land in TODAY's daily period
        # for the chain_bootstrap cashVariance assertion below. A 30-minutes-ago stamp
        # crosses the day boundary when the suite runs just after midnight, dropping the
        # close out of "today" so the daily aggregate read returns no rows.
        # #4c: expected_cash is now derived SERVER-side, never trusted from the client. With no
        # linked orders the server uses the opening float as the expected drawer, so opening_cash
        # 100 + 0 sales = expected 100; counted 85 => -15 variance (the client expected_cash is
        # ignored). This exercises the server-derivation rather than echoing a client figure.
        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(datetime.now()),
            "opening_cash": 100.0,
            "expected_cash": 100.0,
            "actual_cash": 85.0,
        })
        if "error" in close:
            self.fail("shift_close errored: %s" % close["error"])

        chain = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in chain:
            self.fail("chain_bootstrap after variance close errored: %s" % chain["error"])
        daily = chain["result"]["summary"]["reportPeriods"]["daily"]
        self.assertAlmostEqual(daily["cashVariance"], -15.0)
        self.assertAlmostEqual(daily["varianceImpact"], -15.0)
        self.assertAlmostEqual(
            daily["netProfit"],
            daily["revenue"] - daily["cogs"] - daily["wasteCost"] + daily["varianceImpact"],
        )

        approved = self._jsonrpc("/bayaan/api/shift_close_review", {
            "close_id": close["result"]["id"],
            "decision": "approved",
            "note": "Manager accepted opening cash variance after recount.",
        })
        if "error" in approved:
            self.fail("shift_close_review approve errored: %s" % approved["error"])
        self.assertEqual(approved["result"]["managerReviewState"], "approved")
        self.assertTrue(approved["result"]["lockedAt"])

        record = self.env["bayaan.shift.close"].sudo().browse(close["result"]["id"])
        with self.assertRaisesRegex(UserError, "locked"):
            record.write({"actual_cash": 1.0})

        rejected = self._jsonrpc("/bayaan/api/shift_close_review", {
            "close_id": close["result"]["id"],
            "decision": "rejected",
            "note": "Try to reopen after approval",
        })
        self.assertIn("error", rejected)
        self.assertIn("locked", str(rejected["error"]))

    def test_shift_close_approval_blocks_failed_consumption_orders(self):
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-CLOSE-BLOCKER",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        order = self.env["pos.order"].sudo().search([("name", "=", sale["result"]["name"])], limit=1)
        order.bayaan_consumption_state = "missing_recipe"

        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(datetime.now() - timedelta(minutes=30)),
            "expected_cash": 5500.0,
            "actual_cash": 5500.0,
            "pos_invoices": [sale["result"]["name"]],
        })
        if "error" in close:
            self.fail("shift_close errored: %s" % close["error"])

        approved = self._jsonrpc("/bayaan/api/shift_close_review", {
            "close_id": close["result"]["id"],
            "decision": "approved",
        })
        self.assertIn("error", approved)
        self.assertIn("missing or failed recipe consumption", str(approved["error"]))

    def test_shift_close_without_orders_does_not_batch_close_sessions(self):
        """P0.1: a close with no linked orders (e.g. a cash-only variance close) must
        NOT fall back to closing every open session on the kiosk's pos.config. The old
        config-level fallback could close an unrelated open session by accident."""
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-NO-BATCH-CLOSE",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        session = self.env["pos.session"].sudo().search([
            ("config_id", "=", self.pos_config.id),
            ("state", "in", ("opening_control", "opened")),
        ], limit=1)
        self.assertTrue(session, "a sale must leave an open session on the config")

        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(datetime.now() - timedelta(minutes=30)),
            "expected_cash": 0.0,
            "actual_cash": 0.0,
        })
        if "error" in close:
            self.fail("variance shift_close errored: %s" % close["error"])
        session.invalidate_recordset(["state"])
        self.assertNotEqual(
            session.state, "closed",
            "a close with no linked orders must not batch-close the open session on the config")

    def test_shift_close_safe_deposit_posts_transfer_and_carries_float(self):
        """#4 — the safe deposit posts a real Dr Cash-in-Safe / Cr Cash ledger transfer, and the
        retained float is carried onto the kiosk as the next shift's expected opening balance."""
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-SAFE-DEPOSIT",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(datetime.now()),
            "actual_cash": 5500.0,        # counted drawer (opening 0 + 5500 cash sales)
            "safe_deposit": 4000.0,       # banked to the safe
            "retained_float": 1500.0,     # kept in the drawer for the next shift
            "pos_invoices": [sale["result"]["name"]],
        })
        if "error" in close:
            self.fail("shift_close errored: %s" % close["error"])

        kiosk = self.env["bayaan.kiosk"].sudo().search([("kiosk_code", "=", "K-TEST")], limit=1)
        self.assertAlmostEqual(kiosk.last_retained_float, 1500.0,
                               msg="retained float must carry forward to the next shift")
        safe = self.env["bayaan.gl"].sudo()._bayaan_safe_account(self.company)
        move = self.env["account.move"].sudo().search([
            ("ref", "=like", "Bayaan Safe Deposit%"),
            ("company_id", "=", self.company.id),
        ], limit=1)
        self.assertTrue(move, "safe deposit must post a real ledger transfer")
        self.assertEqual(move.state, "posted")
        self.assertAlmostEqual(sum(move.line_ids.mapped("debit")), 4000.0, places=2)
        self.assertAlmostEqual(sum(move.line_ids.mapped("credit")), 4000.0, places=2)
        safe_debit = sum(move.line_ids.filtered(lambda ml: ml.account_id == safe).mapped("debit"))
        self.assertAlmostEqual(safe_debit, 4000.0, places=2, msg="Cash-in-Safe must be debited by the deposit")
        # The credit must come OUT of the kiosk DRAWER cash account (the POS cash settlement
        # account), not the generic bank — otherwise the deposit reconciles against the wrong asset.
        drawer = self.env["bayaan.gl"].sudo()._bayaan_kiosk_cash_account(kiosk)
        bank = self.env["bayaan.gl"].sudo()._bayaan_bank_account(self.company)
        drawer_credit = sum(move.line_ids.filtered(lambda ml: ml.account_id == drawer).mapped("credit"))
        self.assertAlmostEqual(drawer_credit, 4000.0, places=2, msg="cash must be credited out of the kiosk drawer account")
        if bank != drawer:
            bank_credit = sum(move.line_ids.filtered(lambda ml: ml.account_id == bank).mapped("credit"))
            self.assertEqual(bank_credit, 0.0, "safe deposit must NOT credit the generic bank account")

    def test_submitted_close_counts_frozen_at_submission(self):
        """#2 — counted cash + blind stock counts are frozen the moment the close is SUBMITTED
        (pending review), immutable to EVERYONE including a manager/sudo writer; a recount only
        happens through a controlled reject. (The cashier ACL also blocks them; this proves the
        freeze holds even for elevated roles.)"""
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-FREEZE",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        close = self._jsonrpc("/bayaan/api/shift_close", {
            "kiosk": "K-TEST",
            "opened_at": fields.Datetime.to_string(datetime.now()),
            "actual_cash": 5500.0,
            "safe_deposit": 5500.0,
            "retained_float": 0.0,
            "pos_invoices": [sale["result"]["name"]],
            "stock_counts": [{"item": "ING-ORANGE", "actual_qty": 3.0}],
        })
        if "error" in close:
            self.fail("shift_close errored: %s" % close["error"])
        record = self.env["bayaan.shift.close"].sudo().browse(close["result"]["id"])
        self.assertTrue(record.counts_locked, "counts must be frozen at submission")
        self.assertEqual(record.manager_review_state, "pending", "freeze happens BEFORE approval")
        # Counted cash is frozen even for a sudo/manager write.
        with self.assertRaisesRegex(UserError, "frozen"):
            record.write({"actual_cash": 1.0})
        # The blind stock count line is frozen too.
        if record.stock_count_line_ids:
            with self.assertRaisesRegex(UserError, "frozen"):
                record.stock_count_line_ids[0].write({"actual_qty": 999.0})

    def test_order_correction_void_returns_recipe_stock(self):
        """#5 void — a voided recipe line RETURNS the consumed ingredients to the kiosk (so the
        variance loop has no phantom shortage) and appends a contra consumption-ledger row that
        reverses the recipe COGS. refund/discard/remake are unchanged."""
        Quant = self.env["stock.quant"].sudo()
        Quant._update_available_quantity(self.ingredient_orange, self.kiosk_location, 50.0)
        before = self._qty(self.ingredient_orange, self.kiosk_location)
        sale = self._jsonrpc("/bayaan/api/kiosk_sale", {
            "kiosk": "K-TEST",
            "external_id": "EXT-VOID-STOCK",
            "items": [{"product": "MENU-OJ", "name": "Orange Juice", "qty": 1, "price_unit": 5500.0}],
            "payments": [{"method": "cash", "amount": 5500.0}],
        })
        if "error" in sale:
            self.fail("kiosk_sale errored: %s" % sale["error"])
        after_sale = self._qty(self.ingredient_orange, self.kiosk_location)
        self.assertLess(after_sale, before, "the sale must consume orange from the kiosk")

        order = self.env["pos.order"].sudo().search([("pos_reference", "=", "EXT-VOID-STOCK")], limit=1)
        line = order.lines[:1]
        corr = self._jsonrpc("/bayaan/api/order_correction", {
            "kiosk": "K-TEST", "order": order.id, "line": line.id,
            "outcome": "void", "reason": "duplicate",
        })
        if "error" in corr:
            self.fail("void order_correction errored: %s" % corr["error"])

        after_void = self._qty(self.ingredient_orange, self.kiosk_location)
        self.assertAlmostEqual(after_void, before, places=2,
                               msg="void must return the consumed orange to the kiosk (no phantom shortage)")
        # The voided line is tracked so COGS excludes it (recipe rows skipped; finished qty netted)
        # in both the GL poster (_bayaan_post_cogs) and the operational dashboard.
        voided = self.env["bayaan.order.correction"].sudo()._bayaan_voided_qty_map(self.company)
        self.assertIn(line.id, voided, "the voided line must be tracked so COGS excludes it")
        # A voided-only kiosk-day posts no net COGS (the void excludes its recipe consumption).
        gl = self.env["bayaan.gl"].sudo()
        day = order.date_order.date()
        gl._bayaan_post_cogs(self.company, kiosk=order.bayaan_kiosk_id, date_from=day, date_to=day)
        base_ref = "Bayaan COGS · %s · %s" % (order.bayaan_kiosk_id.kiosk_code, day)
        posted_cogs = gl._bayaan_posted_net(base_ref, self.company, account=gl._bayaan_cogs_account(self.company))
        self.assertAlmostEqual(posted_cogs, 0.0, places=2,
                               msg="a voided-only day must post no net COGS")
