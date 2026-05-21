from odoo import fields
from odoo.exceptions import UserError
from odoo.tests.common import tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestOdooSecurityHardening(BayaanTestBase):
    def _create_user(self, login, group_xmlid):
        group = self.env.ref(group_xmlid)
        return self.env["res.users"].sudo().create({
            "name": login,
            "login": login,
            "email": "%s@example.test" % login,
            "password": "test",
            "company_id": self.company.id,
            "company_ids": [(6, 0, [self.company.id])],
            "group_ids": [(6, 0, [group.id])],
        })

    def setUp(self):
        super().setUp()
        self.cashier = self._create_user(
            "bayaan_odoo_guard_cashier",
            "bayaan_fnb_kiosk.group_bayaan_cashier",
        )
        self.kiosk.cashier_user_ids = [(4, self.cashier.id)]

    def _open_session(self):
        session = self.env["pos.session"].sudo().create({
            "config_id": self.pos_config.id,
            "user_id": self.env.user.id,
        })
        if session.state == "opening_control":
            session.action_pos_session_open()
        return session

    def _create_paid_pos_order(self, qty=1.0):
        session = self._open_session()
        total = self.product_orange_juice.list_price * qty
        order = self.env["pos.order"].sudo().create({
            "session_id": session.id,
            "company_id": self.company.id,
            "user_id": self.cashier.id,
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

    def _journal(self):
        journal = self.env["account.journal"].sudo().search([
            ("code", "=", "BOSH"),
            ("company_id", "=", self.company.id),
        ], limit=1)
        if journal:
            return journal
        return self.env["account.journal"].sudo().create({
            "name": "Bayaan Odoo Security Hardening",
            "code": "BOSH",
            "type": "general",
            "company_id": self.company.id,
        })

    def _create_journal_entry(self, move_date=None):
        move_date = move_date or fields.Date.today()
        distribution = self.kiosk._bayaan_analytic_distribution()
        expense = self._account("BOSH100", "expense")
        offset = self._account("BOSH200", "income")
        return self.env["account.move"].sudo().create({
            "journal_id": self._journal().id,
            "date": move_date,
            "line_ids": [
                (0, 0, {
                    "name": "Protected expense",
                    "account_id": expense.id,
                    "debit": 10.0,
                    "credit": 0.0,
                    "display_type": "product",
                    "analytic_distribution": distribution,
                }),
                (0, 0, {
                    "name": "Protected offset",
                    "account_id": offset.id,
                    "debit": 0.0,
                    "credit": 10.0,
                    "display_type": "product",
                    "analytic_distribution": distribution,
                }),
            ],
        })

    def test_cashier_cannot_cancel_refund_or_delete_paid_kiosk_order(self):
        order = self._create_paid_pos_order()

        with self.assertRaisesRegex(UserError, "Bayaan policy prohibits cancelling"):
            order.with_user(self.cashier).action_pos_order_cancel()
        with self.assertRaisesRegex(UserError, "Bayaan policy prohibits refunding"):
            order.with_user(self.cashier)._refund()
        with self.assertRaisesRegex(UserError, "Bayaan policy prohibits deleting"):
            order.with_user(self.cashier).unlink()

    def test_cashier_cannot_delete_paid_kiosk_order_lines(self):
        order = self._create_paid_pos_order()

        with self.assertRaisesRegex(UserError, "Bayaan policy prohibits deleting lines"):
            order.lines.with_user(self.cashier).unlink()

    def test_cashier_cannot_delete_invoices_or_journal_entries(self):
        move = self._create_journal_entry()

        with self.assertRaisesRegex(UserError, "Bayaan policy prohibits deleting invoices"):
            move.with_user(self.cashier).unlink()

    def test_locked_period_rejects_retroactive_journal_posting(self):
        move = self._create_journal_entry(move_date=fields.Date.today())
        self.company.sudo().fiscalyear_lock_date = fields.Date.today()

        with self.assertRaisesRegex(UserError, "prior to and inclusive"):
            move.action_post()
