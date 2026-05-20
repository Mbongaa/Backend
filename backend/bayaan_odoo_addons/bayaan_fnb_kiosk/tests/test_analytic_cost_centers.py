from odoo import fields
from odoo.exceptions import ValidationError
from odoo.tests.common import tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestAnalyticCostCenters(BayaanTestBase):
    def _open_session(self):
        session = self.env["pos.session"].create({
            "config_id": self.pos_config.id,
            "user_id": self.env.user.id,
        })
        if session.state == "opening_control":
            session.action_pos_session_open()
        return session

    def _create_paid_pos_order(self, qty=1.0):
        session = self._open_session()
        total = self.product_orange_juice.list_price * qty
        order = self.env["pos.order"].create({
            "session_id": session.id,
            "company_id": self.company.id,
            "user_id": self.env.user.id,
            "amount_total": total,
            "amount_paid": total,
            "amount_tax": 0.0,
            "amount_return": 0.0,
            "bayaan_kiosk_id": self.kiosk.id,
            "lines": [(0, 0, {
                "name": self.product_orange_juice.display_name,
                "product_id": self.product_orange_juice.id,
                "qty": qty,
                "price_unit": self.product_orange_juice.list_price,
                "price_subtotal": total,
                "price_subtotal_incl": total,
            })],
        })
        order.write({"state": "paid"})
        order._process_saved_order(False)
        return order

    def _prepared_sale_base_line(self, order):
        AccountTax = self.env["account.tax"]
        base_lines = order.with_context(linked_to_pos=True)._prepare_tax_base_line_values()
        AccountTax._add_tax_details_in_base_lines(base_lines, order.company_id)
        AccountTax._round_base_lines_tax_details(base_lines, order.company_id)
        AccountTax._add_accounting_data_in_base_lines_tax_details(base_lines, order.company_id, include_caba_tags=True)
        tax_results = AccountTax._prepare_tax_lines(base_lines, order.company_id)
        return tax_results["base_lines_to_update"][0][0]

    def _create_extra_kiosk(self):
        location = self.env["stock.location"].create({
            "name": "Kiosk K-HQ2 Location",
            "usage": "internal",
            "location_id": self.warehouse.view_location_id.id,
            "company_id": self.company.id,
        })
        pos_config = self.env["pos.config"].create({
            "name": "K-HQ2 POS",
            "company_id": self.company.id,
            "journal_id": self.pos_journal.id,
            "invoice_journal_id": self.invoice_journal.id,
            "payment_method_ids": [(6, 0, [self.test_payment_method.id])],
        })
        pos_config.picking_type_id.default_location_src_id = location
        return self.env["bayaan.kiosk"].create({
            "name": "Mansour Test Kiosk",
            "kiosk_code": "K-HQ2",
            "pos_config_id": pos_config.id,
            "stock_location_id": location.id,
            "stock_deduction_policy": "warning",
            "company_id": self.company.id,
        })

    def test_kiosk_auto_creates_mandatory_branch_analytic_account(self):
        self.assertTrue(self.kiosk.analytic_account_id)
        self.assertEqual(self.kiosk.analytic_account_id.code, "K-TEST")
        self.assertEqual(self.kiosk.analytic_account_id.company_id, self.company)
        self.assertEqual(self.kiosk.analytic_account_id.plan_id.with_company(self.company).default_applicability, "mandatory")

    def test_pos_sale_base_line_carries_kiosk_analytic_distribution(self):
        order = self._create_paid_pos_order()
        base_line = order.lines[0]._prepare_base_line_for_taxes_computation()
        self.assertEqual(
            base_line["analytic_distribution"],
            {str(self.kiosk.analytic_account_id.id): 100.0},
        )

    def test_pos_session_sales_group_preserves_analytic_distribution(self):
        order = self._create_paid_pos_order()
        session = order.session_id
        base_line = self._prepared_sale_base_line(order)
        sale_key = session._get_sale_key(base_line)
        vals = session._get_sale_vals(sale_key, {
            "amount": -order.amount_total,
            "amount_converted": -order.amount_total,
            "quantity": 1.0,
        })
        self.assertEqual(vals["analytic_distribution"], {str(self.kiosk.analytic_account_id.id): 100.0})

    def test_recipe_scrap_stock_move_uses_kiosk_analytic_distribution_for_cogs(self):
        order = self._create_paid_pos_order()
        move = order.bayaan_consumption_ledger_ids[0].stock_scrap_id.move_ids[0]
        self.assertEqual(
            move._get_analytic_distribution(),
            {str(self.kiosk.analytic_account_id.id): 100.0},
        )

    def test_manual_product_journal_line_without_analytic_is_blocked(self):
        journal = self.env["account.journal"].create({
            "name": "Bayaan Manual Analytic Test",
            "code": "BMAT",
            "type": "general",
            "company_id": self.company.id,
        })
        expense = self.env["account.account"].create({
            "name": "Bayaan Manual Expense",
            "code": "BME100",
            "account_type": "expense",
            "company_ids": [(6, 0, [self.company.id])],
        })
        income = self.env["account.account"].create({
            "name": "Bayaan Manual Offset",
            "code": "BMI100",
            "account_type": "income",
            "company_ids": [(6, 0, [self.company.id])],
        })
        move = self.env["account.move"].create({
            "journal_id": journal.id,
            "date": fields.Date.today(),
            "line_ids": [
                (0, 0, {
                    "name": "Unallocated branch expense",
                    "account_id": expense.id,
                    "debit": 10.0,
                    "credit": 0.0,
                    "display_type": "product",
                }),
                (0, 0, {
                    "name": "Offset",
                    "account_id": income.id,
                    "debit": 0.0,
                    "credit": 10.0,
                    "display_type": "product",
                }),
            ],
        })
        with self.assertRaises(ValidationError):
            move.action_post()

    def test_hq_shared_expense_distribution_posts_to_configured_branch_percentages(self):
        other_kiosk = self._create_extra_kiosk()
        distribution_model = self.env["bayaan.kiosk"]._bayaan_ensure_hq_shared_expense_distribution_model(
            "HQ",
            self.company,
            weights={
                self.kiosk.kiosk_code: 60.0,
                other_kiosk.kiosk_code: 40.0,
            },
        )
        expected_distribution = {
            str(self.kiosk.analytic_account_id.id): 60.0,
            str(other_kiosk.analytic_account_id.id): 40.0,
        }
        self.assertTrue(self.env["bayaan.kiosk"]._bayaan_hq_analytic_account(self.company))
        self.assertEqual(distribution_model.analytic_distribution, expected_distribution)

        journal = self.env["account.journal"].create({
            "name": "Bayaan HQ Expense Test",
            "code": "BHQE",
            "type": "general",
            "company_id": self.company.id,
        })
        expense = self.env["account.account"].create({
            "name": "Bayaan HQ Shared Expense",
            "code": "HQE100",
            "account_type": "expense",
            "company_ids": [(6, 0, [self.company.id])],
        })
        offset = self.env["account.account"].create({
            "name": "Bayaan HQ Expense Offset",
            "code": "HQI100",
            "account_type": "income",
            "company_ids": [(6, 0, [self.company.id])],
        })
        move = self.env["account.move"].create({
            "journal_id": journal.id,
            "date": fields.Date.today(),
            "line_ids": [
                (0, 0, {
                    "name": "HQ shared expense",
                    "account_id": expense.id,
                    "debit": 100.0,
                    "credit": 0.0,
                    "display_type": "product",
                }),
                (0, 0, {
                    "name": "HQ shared expense offset",
                    "account_id": offset.id,
                    "debit": 0.0,
                    "credit": 100.0,
                    "display_type": "product",
                }),
            ],
        })
        self.assertEqual(move.line_ids.mapped("analytic_distribution"), [expected_distribution, expected_distribution])

        move.action_post()

        self.assertEqual(move.state, "posted")
