from odoo import Command, fields
from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestAccountingReportApi(BayaanTestBase, HttpCase):
    """The formal-books routes must read the REAL Odoo ledger (account.move /
    account.move.line) and per-kiosk capital costs must post a real, balanced
    fixed-asset entry tagged to the kiosk cost center."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def _ok(self, response, label):
        if "error" in response:
            self.fail("%s errored: %s" % (label, response["error"]))
        return response["result"]

    def _account(self, code, account_type, name=None):
        Account = self.env["account.account"].sudo()
        account = Account.search([("code", "=", code), ("company_ids", "in", [self.company.id])], limit=1)
        if account:
            return account
        return Account.create({
            "name": name or code,
            "code": code,
            "account_type": account_type,
            "company_ids": [(6, 0, [self.company.id])],
        })

    def _general_journal(self):
        Journal = self.env["account.journal"].sudo()
        journal = Journal.search([("type", "=", "general"), ("company_id", "=", self.company.id)], limit=1)
        if not journal:
            journal = Journal.create({
                "name": "Bayaan Test Misc",
                "code": "BMSC",
                "type": "general",
                "company_id": self.company.id,
            })
        return journal

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")
        self.acc_cash = self._account("BCASH", "asset_cash", "Test Cash")
        self.acc_income = self._account("BINC", "income", "Test Sales Income")
        self.acc_fixed = self._account("BFIX", "asset_fixed", "Test Fixed Asset")
        self.acc_capital = self._account("BCAP", "equity", "Test Capital")
        self.gj = self._general_journal()
        params = self.env["ir.config_parameter"].sudo()
        params.set_param("bayaan.capex_asset_account_id.%s" % self.company.id, str(self.acc_fixed.id))
        params.set_param("bayaan.capex_funding_account_id.%s" % self.company.id, str(self.acc_capital.id))

        # A real posted journal entry: Dr Cash 100,000 / Cr Income 100,000,
        # with the kiosk branch cost center on the income (P&L) line.
        distribution = self.kiosk._bayaan_analytic_distribution()
        self.move = self.env["account.move"].sudo().create({
            "move_type": "entry",
            "journal_id": self.gj.id,
            "date": fields.Date.context_today(self.env.user),
            "ref": "Bayaan test sale",
            "line_ids": [
                Command.create({"name": "Cash in", "account_id": self.acc_cash.id, "debit": 100000.0, "credit": 0.0}),
                Command.create({
                    "name": "Sales",
                    "account_id": self.acc_income.id,
                    "debit": 0.0,
                    "credit": 100000.0,
                    "analytic_distribution": distribution or False,
                }),
            ],
        })
        self.move.action_post()

    # ------------------------------------------------------------------
    # Formal books
    # ------------------------------------------------------------------
    def test_general_ledger_lists_posted_lines(self):
        result = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "ledger"}), "ledger")
        self.assertEqual(result["meta"]["engine"], "odoo_account")
        names = {row["move"] for row in result["rows"]}
        self.assertIn(self.move.name, names)
        # A complete posted ledger always nets to equal debits and credits.
        self.assertAlmostEqual(result["totals"]["debit"], result["totals"]["credit"], places=2)

    def test_trial_balance_balances(self):
        result = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "trial_balance"}), "trial_balance")
        self.assertAlmostEqual(result["totals"]["debit"], result["totals"]["credit"], places=2)
        by_code = {row["code"]: row for row in result["rows"]}
        self.assertAlmostEqual(by_code["BCASH"]["debit"], 100000.0, places=2)
        self.assertAlmostEqual(by_code["BINC"]["credit"], 100000.0, places=2)

    def test_income_statement(self):
        result = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "pnl"}), "pnl")
        self.assertGreaterEqual(result["totals"]["revenue"], 100000.0)
        self.assertAlmostEqual(result["totals"]["netProfit"], result["totals"]["revenue"] - result["totals"]["cogs"] - result["totals"]["opex"], places=2)

    def test_balance_sheet_balances(self):
        result = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "balance_sheet"}), "balance_sheet")
        self.assertTrue(result["totals"]["balanced"], "Balance sheet must balance: %s" % result["totals"])
        self.assertAlmostEqual(
            result["totals"]["assets"],
            result["totals"]["liabilitiesAndEquity"],
            places=2,
        )

    def test_chart_of_accounts(self):
        result = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "chart"}), "chart")
        codes = {row["code"] for row in result["rows"]}
        self.assertIn("BCASH", codes)
        self.assertIn("BFIX", codes)

    def test_kiosk_filter_scopes_to_cost_center(self):
        result = self._ok(
            self._jsonrpc("/bayaan/api/accounting_report", {"report": "ledger", "kiosk": "K-TEST"}),
            "ledger kiosk filter",
        )
        codes = {row["code"] for row in result["rows"]}
        # Only the income line carried the kiosk analytic; the cash line did not.
        self.assertIn("BINC", codes)
        self.assertNotIn("BCASH", codes)

    # ------------------------------------------------------------------
    # Per-kiosk capital expenditure
    # ------------------------------------------------------------------
    def test_capex_capitalizes_to_fixed_asset(self):
        created = self._ok(self._jsonrpc("/bayaan/api/kiosk_capex", {
            "kiosk": "K-TEST",
            "name": "Espresso machine",
            "amount": 480000.0,
            "category": "equipment",
            "usefulLifeMonths": 24,
        }), "kiosk_capex create")
        self.assertEqual(created["state"], "posted", "capex should capitalize: %s" % created.get("error"))
        self.assertEqual(created["assetAccount"], "BFIX")
        self.assertEqual(created["fundingAccount"], "BCAP")
        self.assertAlmostEqual(created["monthlyDepreciation"], 20000.0, places=2)

        capex = self.env["bayaan.kiosk.capex"].sudo().browse(created["id"])
        move = capex.move_id
        self.assertEqual(move.state, "posted")
        self.assertAlmostEqual(sum(move.line_ids.mapped("debit")), sum(move.line_ids.mapped("credit")), places=2)
        asset_line = move.line_ids.filtered(lambda l: l.account_id == self.acc_fixed)
        self.assertAlmostEqual(asset_line.debit, 480000.0, places=2)
        analytic_key = str(self.kiosk.analytic_account_id.id)
        self.assertIn(analytic_key, asset_line.analytic_distribution or {})

    def test_capex_list_totals_and_reverse(self):
        created = self._ok(self._jsonrpc("/bayaan/api/kiosk_capex", {
            "kiosk": "K-TEST",
            "name": "Kiosk fit-out",
            "amount": 1000000.0,
            "category": "fit_out",
        }), "kiosk_capex create")
        listed = self._ok(self._jsonrpc("/bayaan/api/kiosk_capex", {"action": "list", "kiosk": "K-TEST"}), "kiosk_capex list")
        self.assertGreaterEqual(listed["totals"]["invested"], 1000000.0)
        self.assertGreaterEqual(listed["totals"]["posted"], 1)

        reversed_resp = self._ok(self._jsonrpc("/bayaan/api/kiosk_capex", {"action": "reverse", "id": created["id"]}), "kiosk_capex reverse")
        self.assertTrue(reversed_resp["reversed"])
        capex = self.env["bayaan.kiosk.capex"].sudo().browse(created["id"])
        self.assertEqual(capex.state, "reversed")
        self.assertFalse(capex.active)

    # ------------------------------------------------------------------
    # Tax / VAT settings
    # ------------------------------------------------------------------
    def test_tax_settings_apply_rate_and_reset_to_zero(self):
        template = self.product_orange_juice.product_tmpl_id

        settings = self._ok(self._jsonrpc("/bayaan/api/tax_settings", {}), "tax read")
        self.assertIn("rate", settings)
        self.assertIn("posProductCount", settings)
        self.assertGreaterEqual(settings["posProductCount"], 1)

        applied = self._ok(self._jsonrpc("/bayaan/api/tax_settings", {"rate": 15, "priceInclude": True}), "tax apply 15")
        self.assertEqual(applied["rate"], 15.0)
        self.assertEqual(applied["productsOther"], 0)
        self.assertGreaterEqual(applied["updated"], 1)
        template.invalidate_recordset()
        sale_rates = template.taxes_id.filtered(lambda t: t.type_tax_use == "sale").mapped("amount")
        self.assertIn(15.0, sale_rates)

        # The rate is broadcast on auth_status (the channel the POS receipt reads).
        auth = self._ok(self._jsonrpc("/bayaan/api/auth_status", {}), "auth_status")
        self.assertEqual(auth["vatRate"], 15.0)

        # Back to Iraq's 0% — POS products drop their sale tax.
        zero = self._ok(self._jsonrpc("/bayaan/api/tax_settings", {"rate": 0}), "tax apply 0")
        self.assertEqual(zero["rate"], 0.0)
        template.invalidate_recordset()
        self.assertFalse(template.taxes_id.filtered(lambda t: t.type_tax_use == "sale"))
        auth0 = self._ok(self._jsonrpc("/bayaan/api/auth_status", {}), "auth_status zero")
        self.assertEqual(auth0["vatRate"], 0.0)

    # ------------------------------------------------------------------
    # Manual journal entries
    # ------------------------------------------------------------------
    def test_journal_entry_balance_post_and_drilldown(self):
        # Unbalanced entries are rejected.
        bad = self._jsonrpc("/bayaan/api/journal_entry", {"lines": [
            {"account": self.acc_cash.code, "debit": 1000},
            {"account": self.acc_capital.code, "credit": 500},
        ]})
        self.assertIn("error", bad, "unbalanced entry must be rejected")

        # A balanced entry posts straight into the ledger.
        ok = self._ok(self._jsonrpc("/bayaan/api/journal_entry", {"ref": "Owner injection test", "lines": [
            {"account": self.acc_cash.code, "debit": 90000, "label": "cash in"},
            {"account": self.acc_capital.code, "credit": 90000, "label": "owner capital"},
        ]}), "journal_entry post")
        self.assertEqual(ok["state"], "posted")
        self.assertTrue(ok["balanced"])
        move = self.env["account.move"].sudo().browse(ok["id"])
        self.assertEqual(move.state, "posted")

        # Drill-down returns the balanced lines.
        detail = self._ok(self._jsonrpc("/bayaan/api/journal_entry", {"action": "detail", "id": ok["id"]}), "journal detail")
        self.assertEqual(len(detail["lines"]), 2)
        self.assertAlmostEqual(detail["totals"]["debit"], detail["totals"]["credit"], places=2)

        # The entry now shows up in the general ledger.
        ledger = self._ok(self._jsonrpc("/bayaan/api/accounting_report", {"report": "ledger"}), "ledger after post")
        self.assertIn(move.name, {row["move"] for row in ledger["rows"]})

        # Reversal requires a non-empty reason; a missing reason is blocked server-side.
        no_reason = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": ok["id"]})
        self.assertIn("error", no_reason, "reversal without a reason must be blocked")

        # System-generated Bayaan entries (sales / COGS / payroll / capex) must NOT be
        # reversible from the manual-journal endpoint, even with a reason.
        sys_move = self.env["account.move"].sudo().create({
            "move_type": "entry",
            "journal_id": self.gj.id,
            "date": fields.Date.context_today(self.env.user),
            "ref": "Bayaan Sales · K-TEST · system",
            "line_ids": [
                Command.create({"name": "Cash", "account_id": self.acc_cash.id, "debit": 1000.0, "credit": 0.0}),
                Command.create({
                    "name": "Sales", "account_id": self.acc_income.id, "debit": 0.0, "credit": 1000.0,
                    "analytic_distribution": self.kiosk._bayaan_analytic_distribution() or False,
                }),
            ],
        })
        sys_move.action_post()
        blocked = self._jsonrpc("/bayaan/api/journal_entry", {"action": "reverse", "id": sys_move.id, "reason": "nope"})
        self.assertIn("error", blocked, "system Bayaan entries must not be reversible from this endpoint")

        # An eligible manual entry reverses with a reason (deletion is blocked by policy).
        reversed_resp = self._ok(self._jsonrpc("/bayaan/api/journal_entry", {
            "action": "reverse", "id": ok["id"], "reason": "correcting the test owner injection",
        }), "journal reverse")
        self.assertEqual(reversed_resp["reversedFrom"], move.name)
        self.assertEqual(reversed_resp["state"], "posted")
        reversal = self.env["account.move"].sudo().browse(reversed_resp["id"])
        self.assertAlmostEqual(sum(reversal.line_ids.mapped("credit")), 90000.0, places=2)
