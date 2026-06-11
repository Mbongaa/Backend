from odoo import api, fields, models
from odoo.exceptions import ValidationError


FINANCE_ADJUSTMENT_CATEGORIES = [
    ("revenue", "Revenue"),
    ("cogs", "COGS / ingredient cost"),
    ("waste_loss", "Waste & loss"),
    ("other", "Other"),
]


class BayaanFinanceAdjustment(models.Model):
    """Manual correction to a P&L line. Real operations deviate from the deterministic
    calculation (e.g. counted waste differs from recipe-implied loss), so managers can
    record an explicit, auditable adjustment instead of editing the source records.

    `amount` is signed and represents the change to the named line's value:
      revenue +  -> more revenue (profit up)
      cogs/waste_loss + -> more cost/loss (profit down)
      other +    -> direct profit adjustment up
    """

    _name = "bayaan.finance.adjustment"
    _description = "Bayaan Manual Finance Adjustment"
    _order = "date desc, id desc"

    name = fields.Char(compute="_compute_name", store=True)
    date = fields.Date(required=True, default=fields.Date.context_today, index=True)
    category = fields.Selection(FINANCE_ADJUSTMENT_CATEGORIES, required=True, default="waste_loss", index=True)
    amount = fields.Monetary(required=True)
    note = fields.Char(required=True)
    created_by_id = fields.Many2one("res.users", readonly=True, default=lambda self: self.env.user)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    currency_id = fields.Many2one(related="company_id.currency_id", store=True, readonly=True)

    @api.depends("category", "amount", "date")
    def _compute_name(self):
        labels = dict(FINANCE_ADJUSTMENT_CATEGORIES)
        for rec in self:
            rec.name = "%s %s (%s)" % (labels.get(rec.category, rec.category), rec.amount, rec.date or "")

    @api.constrains("amount")
    def _check_amount(self):
        for rec in self:
            if not rec.amount:
                raise ValidationError("Finance adjustment amount cannot be zero.")

    @api.model
    def net_profit_impact(self, records):
        """Signed effect of a set of adjustments on net profit."""
        total = 0.0
        for rec in records:
            if rec.category == "revenue":
                total += rec.amount
            elif rec.category in ("cogs", "waste_loss"):
                total -= rec.amount
            else:  # other
                total += rec.amount
        return total
