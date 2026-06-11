from odoo import _, models
from odoo.exceptions import UserError, ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    def _bayaan_break_glass_account_delete_allowed(self):
        return (
            self.env.context.get("bayaan_break_glass_account_delete")
            and self.env.user.has_group("base.group_system")
        )

    def _bayaan_check_lock_dates_before_post(self):
        for move in self:
            journal = move.journal_id
            violated_lock_dates = move.company_id._get_lock_date_violations(
                move.date,
                fiscalyear=True,
                sale=journal and journal.type == "sale",
                purchase=journal and journal.type == "purchase",
                tax=any(move.line_ids.mapped("tax_ids")),
                hard=True,
            )
            if violated_lock_dates:
                raise UserError(_(
                    "Bayaan policy prohibits posting journal entries prior to and inclusive of: %(lock_date_info)s."
                ) % {
                    "lock_date_info": self.env["res.company"]._format_lock_dates(violated_lock_dates),
                })

    def _post(self, soft=True):
        self._bayaan_check_lock_dates_before_post()
        if self.env.context.get("validate_analytic", True):
            self._bayaan_validate_branch_analytic_distribution()
        return super()._post(soft=soft)

    def unlink(self):
        if self and not self._bayaan_break_glass_account_delete_allowed():
            raise UserError(_(
                "Bayaan policy prohibits deleting invoices or journal entries. "
                "Use reversal/cancellation workflows so the audit trail remains intact."
            ))
        return super().unlink()

    def _bayaan_validate_branch_analytic_distribution(self):
        missing_lines = self.env["account.move.line"]
        for line in self.line_ids.filtered(lambda move_line: move_line.display_type == "product"):
            # Branch cost-center analytic applies to P&L (income / expense) lines.
            # Balance-sheet lines — receivable, payable, cash, bank (e.g. the POS
            # payment "combine" entries created when a pos.session is closed) — do
            # not take a cost center and must not block posting; otherwise every
            # session close (manual or automatic) is impossible.
            account_type = line.account_id.account_type or ""
            if not (account_type.startswith("income") or account_type.startswith("expense")):
                continue
            if not line.analytic_distribution:
                missing_lines |= line
        if not missing_lines:
            return

        sample = ", ".join(missing_lines[:5].mapped("name"))
        raise ValidationError(_(
            "Bayaan requires a branch cost center analytic distribution before posting journal items. "
            "Missing analytic distribution on: %(lines)s"
        ) % {"lines": sample})
