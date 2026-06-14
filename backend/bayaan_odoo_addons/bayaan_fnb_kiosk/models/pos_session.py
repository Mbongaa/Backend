import pytz

from odoo import fields, models

BAYAAN_TZ = "Asia/Baghdad"


class PosSession(models.Model):
    _inherit = "pos.session"

    def _bayaan_kiosk(self):
        self.ensure_one()
        return self.env["bayaan.kiosk"].sudo().search(
            [("pos_config_id", "=", self.config_id.id)], limit=1
        )

    def _bayaan_branch_distribution(self):
        """The branch cost-center analytic distribution for this session's kiosk
        (or the HQ analytic if the session has no kiosk)."""
        self.ensure_one()
        kiosk = self._bayaan_kiosk()
        if kiosk:
            return kiosk._bayaan_analytic_distribution()
        return self.env["bayaan.gl"].sudo()._bayaan_hq_distribution(self.company_id)

    def _create_account_move(self, *args, **kwargs):
        """The official POS session close builds the Z-report account.move (revenue +
        native VAT + cash/card clearing). Stamp the kiosk branch analytic on its P&L
        (income/expense) lines so (a) Bayaan's account_move branch-analytic guard
        accepts the official close and (b) the per-branch income statement attributes
        POS revenue to the right kiosk. Balance-sheet legs (receivable/cash/outstanding)
        correctly stay analytic-free."""
        res = super()._create_account_move(*args, **kwargs)
        if self.move_id:
            # Date the Z-report move on the business day of the session's actual SALES,
            # not on the close moment. Odoo defaults the session move to today, and a
            # rebuild/late close stamps stop_at = now — either way the revenue would land
            # on the wrong day and per-day reports (POS vs GL) would disagree. We take the
            # Baghdad-local day of the latest paid order in the session (a Bayaan session
            # is one trading day), falling back to start_at/stop_at for an order-less close.
            tz = pytz.timezone(BAYAAN_TZ)
            paid_orders = self.order_ids.filtered(
                lambda o: o.state in ("paid", "done", "invoiced") and o.date_order)
            if paid_orders:
                ref_dt = max(paid_orders.mapped("date_order"))
            else:
                ref_dt = self.start_at or self.stop_at or fields.Datetime.now()
            business_day = pytz.utc.localize(ref_dt).astimezone(tz).date()
            if self.move_id.date != business_day:
                self.move_id.date = business_day
            # Stamp the kiosk branch analytic on the P&L lines so Bayaan's account_move
            # branch-analytic guard accepts the official close and the per-branch income
            # statement attributes POS revenue to the right kiosk.
            distribution = self._bayaan_branch_distribution()
            if distribution:
                pl_lines = self.move_id.line_ids.filtered(
                    lambda line: (line.account_id.account_type or "").startswith(("income", "expense"))
                    and not line.analytic_distribution
                )
                if pl_lines:
                    pl_lines.write({"analytic_distribution": distribution})
        return res

    def _post_statement_difference(self, amount):
        """Stamp the kiosk's branch cost center on the cash over/short P&L line.

        Odoo books the counted-vs-expected cash difference to the cash journal's
        loss/profit account when a session closes. That is a P&L posting, so the
        Bayaan branch-analytic guard (account_move.py) rightly demands a cost
        center — but this line is machine-generated, so the distribution has to
        be injected here rather than typed by a human. Without this, every close
        of a session with a real cash variance raises and the session wedges in
        closing_control, which in turn blocks opening the next session
        ("Another session is already opened for this point of sale").
        """
        kiosk = self._bayaan_kiosk()
        distribution = kiosk._bayaan_analytic_distribution() if kiosk else {}
        session = self.with_context(validate_analytic=False) if distribution else self
        res = super(PosSession, session)._post_statement_difference(amount)
        if amount and distribution:
            lines = self.env["account.move.line"].sudo().search([
                ("move_id.statement_line_id.pos_session_id", "=", self.id),
            ]).filtered(
                lambda line: (line.account_id.account_type or "").startswith(("income", "expense"))
                and not line.analytic_distribution
            )
            if lines:
                lines.write({"analytic_distribution": distribution})
        return res
