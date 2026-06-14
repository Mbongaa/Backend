from datetime import timedelta

from odoo import fields
from odoo.tests.common import tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestBayaanGl(BayaanTestBase):
    """The GL posting layer must post the formal books *source-based and idempotent*:
    a second session, a late order or a retry posts the delta exactly once and never
    double-counts; VAT is split out of the gross; and a vendor bill never bills more
    than was received. These lock the P0.2 / P0.3 / P0.6 remediation fixes.
    """

    def setUp(self):
        super().setUp()
        self.today = fields.Date.context_today(self.env.user)
        # The GL poster needs a general (miscellaneous) journal; create one if the
        # disposable test DB has no chart-installed default.
        Journal = self.env["account.journal"].sudo()
        if not Journal.search([("type", "=", "general"), ("company_id", "=", self.company.id)], limit=1):
            Journal.create({"name": "Bayaan Misc", "code": "BMSC", "type": "general",
                            "company_id": self.company.id})
        self.gl = self.env["bayaan.gl"].sudo()

    # ------------------------------------------------------------------ helpers
    def _open_session(self):
        # Odoo allows only one open session per POS config, so close any prior one first
        # (Bayaan finalize, no draft orders) before opening a fresh "next session".
        existing = self.env["pos.session"].search([
            ("config_id", "=", self.pos_config.id),
            ("state", "in", ("opening_control", "opened", "closing_control")),
        ])
        if existing:
            self.env["bayaan.shift.close"].sudo()._bayaan_finalize_pos_sessions(existing)
        session = self.env["pos.session"].create({
            "config_id": self.pos_config.id,
            "user_id": self.env.user.id,
        })
        if session.state == "opening_control":
            session.action_pos_session_open()
        return session

    def _paid_order(self, qty=1.0, unit=None, tax=0.0, taxes=None):
        unit = self.product_orange_juice.list_price if unit is None else unit
        total = unit * qty
        session = self._open_session()
        line_vals = {
            "name": self.product_orange_juice.display_name,
            "product_id": self.product_orange_juice.id,
            "qty": qty,
            "price_unit": unit,
            "price_subtotal": total - tax,
            "price_subtotal_incl": total,
        }
        if taxes:
            line_vals["tax_ids"] = [(6, 0, taxes.ids)]
        order = self.env["pos.order"].create({
            "session_id": session.id,
            "company_id": self.company.id,
            "user_id": self.env.user.id,
            "amount_total": total,
            "amount_paid": total,
            "amount_tax": tax,
            "amount_return": 0.0,
            "bayaan_kiosk_id": self.kiosk.id,
            "lines": [(0, 0, line_vals)],
        })
        order.write({"state": "paid"})
        self.env["pos.payment"].create({
            "pos_order_id": order.id,
            "payment_method_id": self.test_payment_method.id,
            "amount": total,
        })
        order._process_saved_order(False)
        return order

    def _credit(self, code):
        """Net credit (credit - debit) posted to an account code, company-scoped."""
        account = self.env["account.account"].sudo().with_context(active_test=False).search(
            [("code", "=", code)], limit=1)
        if not account:
            return 0.0
        lines = self.env["account.move.line"].sudo().search([
            ("account_id", "=", account.id), ("parent_state", "=", "posted"),
            ("company_id", "=", self.company.id)])
        return round(sum(lines.mapped("credit")) - sum(lines.mapped("debit")), 2)

    def _sales_moves(self):
        return self.env["account.move"].sudo().search([
            ("company_id", "=", self.company.id), ("state", "=", "posted"),
            ("ref", "=like", "Bayaan Sales · %")])

    def _bayaan_revenue(self):
        """Net income credited specifically by the Bayaan Sales moves. This isolates the
        legacy source-based revenue poster (the unit under test here) from the native POS
        session close, which posts its OWN revenue to the same income account as a side
        effect of `_open_session`. In production these never coexist — the native close is
        the sole revenue source and `_bayaan_post_pos_revenue` is unused — so measuring the
        Bayaan moves' own credits is the faithful, non-polluted assertion."""
        lines = self._sales_moves().line_ids.filtered(
            lambda line: (line.account_id.account_type or "").startswith("income"))
        return round(sum(lines.mapped("credit")) - sum(lines.mapped("debit")), 2)

    # ------------------------------------------------------------------ P0.2
    def test_revenue_delta_posts_each_source_once_and_retry_is_idempotent(self):
        # First session: revenue posts the first move.
        self._paid_order(qty=1.0)  # 5500
        self.gl._bayaan_post_pos_revenue(self.company, kiosk=self.kiosk,
                                         date_from=self.today, date_to=self.today)
        self.assertAlmostEqual(self._bayaan_revenue(), 5500.0, places=2)
        self.assertEqual(len(self._sales_moves()), 1)

        # Second session SAME kiosk/day: the old per-day ref idempotency would have
        # silently dropped this; source-based delta posting must add exactly 5500 more.
        self._paid_order(qty=1.0)  # +5500
        self.gl._bayaan_post_pos_revenue(self.company, kiosk=self.kiosk,
                                         date_from=self.today, date_to=self.today)
        self.assertAlmostEqual(self._bayaan_revenue(), 11000.0, places=2)
        self.assertEqual(len(self._sales_moves()), 2, "the late session must post a delta move")

        # Retry with no new source rows: idempotent — no new move, no double count.
        self.gl._bayaan_post_pos_revenue(self.company, kiosk=self.kiosk,
                                         date_from=self.today, date_to=self.today)
        self.assertAlmostEqual(self._bayaan_revenue(), 11000.0, places=2)
        self.assertEqual(len(self._sales_moves()), 2)

    def test_cogs_delta_tracks_new_consumption(self):
        self._paid_order(qty=1.0)
        self.gl._bayaan_post_cogs(self.company, kiosk=self.kiosk,
                                  date_from=self.today, date_to=self.today)
        first = -self._credit("500000")  # COGS is a debit; _credit returns credit-debit
        self.assertGreater(first, 0.0)
        self._paid_order(qty=2.0)
        self.gl._bayaan_post_cogs(self.company, kiosk=self.kiosk,
                                  date_from=self.today, date_to=self.today)
        second = -self._credit("500000")
        self.assertAlmostEqual(second, first * 3, places=2)  # 1 OJ then +2 OJ → 3x
        # Retry: idempotent.
        self.gl._bayaan_post_cogs(self.company, kiosk=self.kiosk,
                                  date_from=self.today, date_to=self.today)
        self.assertAlmostEqual(-self._credit("500000"), second, places=2)

    # ------------------------------------------------------------------ tripwire
    def test_native_close_posts_session_move_single_revenue_source(self):
        """Native architecture: the official Odoo POS close posts the Z-report
        account.move and IS the single source of POS revenue. Bayaan posts only the
        deterministic COGS/waste. The double-count tripwire is now inverted — revenue
        must come from the native session move and NEVER from a legacy 'Bayaan Sales'
        custom revenue move (both posting the same sales would double-count)."""
        order = self._paid_order(qty=1.0)
        # Bayaan posts COGS/waste only — revenue is the native close, not bayaan.gl.
        self.gl._bayaan_post_kiosk_day(self.kiosk, self.today)
        self.env["bayaan.shift.close"].sudo()._bayaan_finalize_pos_sessions(order.session_id)
        order.session_id.invalidate_recordset(["state", "move_id"])
        self.assertEqual(order.session_id.state, "closed")
        session_move = order.session_id.move_id
        self.assertTrue(session_move, "the native close must post an official session Z-report move")
        # The revenue (income) leg must live ON the native session move, exactly once,
        # at the sale's net (5500 at 0% VAT) — that move IS the single revenue source.
        income_lines = session_move.line_ids.filtered(
            lambda line: (line.account_id.account_type or "").startswith("income"))
        self.assertTrue(income_lines, "the native session move must carry a revenue (income) line")
        net_revenue = sum(income_lines.mapped("credit")) - sum(income_lines.mapped("debit"))
        self.assertAlmostEqual(net_revenue, 5500.0, places=2)
        # No legacy 'Bayaan Sales' custom revenue move may co-exist (double-count guard).
        self.assertFalse(self._sales_moves(),
                         "revenue must come ONLY from the native close, not a Bayaan Sales move")

    # ------------------------------------------------------------------ P0.3
    def test_revenue_zero_vat_posts_no_liability_line(self):
        self._paid_order(qty=1.0)  # tax 0
        self.gl._bayaan_post_pos_revenue(self.company, kiosk=self.kiosk,
                                         date_from=self.today, date_to=self.today)
        self.assertAlmostEqual(self._credit("400000"), 5500.0, places=2)
        self.assertAlmostEqual(self._credit("251000"), 0.0, places=2)  # no VAT payable at 0%

    def test_revenue_splits_inclusive_vat_into_liability(self):
        tax = self.env["account.tax"].sudo().create({
            "name": "VAT 10% incl",
            "amount": 10.0,
            "amount_type": "percent",
            "type_tax_use": "sale",
            "price_include_override": "tax_included",
            "company_id": self.company.id,
        })
        # Gross 11000 incl 10% → net 10000, tax 1000.
        order = self._paid_order(qty=1.0, unit=11000.0, tax=1000.0, taxes=tax)
        self.gl._bayaan_post_pos_revenue(self.company, kiosk=self.kiosk,
                                         date_from=self.today, date_to=self.today)
        # Books: revenue = net, VAT payable = tax, and revenue + tax = gross paid.
        net = self._credit("400000")
        vat = self._credit("251000")
        self.assertAlmostEqual(vat, order.amount_tax, places=2)
        self.assertAlmostEqual(net + vat, order.amount_total, places=2)
        self.assertGreater(vat, 0.0, "a non-zero VAT order must post a tax-liability line")

    # ------------------------------------------------------------------ P0.6
    def test_vendor_bill_does_not_bill_unreceived_quantity(self):
        partner = self.env["res.partner"].sudo().create({"name": "Test Supplier", "supplier_rank": 1})
        po = self.env["purchase.order"].sudo().create({
            "partner_id": partner.id,
            "company_id": self.company.id,
            "order_line": [(0, 0, {
                "product_id": self.ingredient_orange.id,
                "name": self.ingredient_orange.display_name,
                "product_qty": 10.0,
                "price_unit": 1000.0,
                "product_uom_id": self.uom_kgm.id,
            })],
        })
        po.button_confirm()
        # Nothing received yet → the old `qty_received or product_qty` fallback would have
        # billed all 10 units. The fix must bill nothing.
        result = self.gl._bayaan_create_vendor_bill(po)
        self.assertFalse(
            result and result.invoice_line_ids,
            "a PO with zero received quantity must not produce a vendor bill")
        self.assertFalse(
            po.invoice_ids.filtered(lambda m: m.state == "posted"),
            "no posted vendor bill may exist for an un-received PO")

    # ------------------------------------------------------------- opening/depreciation
    def test_opening_inventory_posts_once_idempotent(self):
        """The one-time opening-balance workflow posts the on-hand stock value Dr
        Inventory / Cr Opening Equity exactly once; a second run is a no-op (it must
        never double-post the opening balance)."""
        first = self.gl._bayaan_post_opening_inventory(company=self.company, date=self.today)
        self.assertTrue(first, "opening inventory must post when on-hand stock has value")
        self.assertAlmostEqual(
            sum(first.line_ids.mapped("debit")), sum(first.line_ids.mapped("credit")), places=2,
            msg="the opening-balance entry must be balanced")
        again = self.gl._bayaan_post_opening_inventory(company=self.company, date=self.today)
        self.assertFalse(again, "opening balance must not double-post on a second run")

    def test_depreciation_cron_posts_delta_once(self):
        """The monthly depreciation cron posts straight-line depreciation to-date for a
        posted CapEx, and is retry-safe: a second run on the same day posts nothing
        extra (source-based delta + ref guard)."""
        capex = self.env["bayaan.kiosk.capex"].sudo().create({
            "name": "Test espresso machine",
            "kiosk_id": self.kiosk.id,
            "category": "equipment",
            "amount": 1_200_000.0,
            "useful_life_months": 12,
            "date": self.today - timedelta(days=95),  # ~3 months in the past
            "company_id": self.company.id,
            "state": "posted",
        })
        elapsed = min(capex._bayaan_months_elapsed(self.today), 12)
        expected = round((capex.amount / 12) * elapsed, 2)
        self.assertGreater(expected, 0.0)
        self.gl._cron_post_depreciation()
        self.assertAlmostEqual(-self._credit("680000"), expected, places=2)  # expense is a debit
        # Idempotent: a second cron run on the same day accrues nothing extra.
        self.gl._cron_post_depreciation()
        self.assertAlmostEqual(-self._credit("680000"), expected, places=2)
