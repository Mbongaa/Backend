from odoo import _, models
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    def _post(self, soft=True):
        if self.env.context.get("validate_analytic", True):
            self._bayaan_validate_branch_analytic_distribution()
        return super()._post(soft=soft)

    def _bayaan_validate_branch_analytic_distribution(self):
        missing_lines = self.env["account.move.line"]
        for line in self.line_ids.filtered(lambda move_line: move_line.display_type == "product"):
            if not line.analytic_distribution:
                missing_lines |= line
        if not missing_lines:
            return

        sample = ", ".join(missing_lines[:5].mapped("name"))
        raise ValidationError(_(
            "Bayaan requires a branch cost center analytic distribution before posting journal items. "
            "Missing analytic distribution on: %(lines)s"
        ) % {"lines": sample})
