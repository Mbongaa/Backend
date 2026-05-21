from odoo import models


class StockValuationAdjustmentLines(models.Model):
    _inherit = "stock.valuation.adjustment.lines"

    def _bayaan_analytic_distribution(self):
        self.ensure_one()
        company = self.cost_id.company_id or self.env.company
        kiosk_model = self.env["bayaan.kiosk"].sudo()
        kiosk = self.env["bayaan.kiosk"]
        if self.move_id:
            kiosk = kiosk_model.search([
                ("company_id", "=", company.id),
                "|",
                ("stock_location_id", "=", self.move_id.location_dest_id.id),
                ("stock_location_id", "=", self.move_id.location_id.id),
            ], limit=1)
        if kiosk:
            return kiosk._bayaan_analytic_distribution()
        hq_account = kiosk_model._bayaan_hq_analytic_account(company)
        return {str(hq_account.id): 100.0} if hq_account else {}

    def _prepare_account_move_line_values(self):
        values = super()._prepare_account_move_line_values()
        if not values.get("analytic_distribution"):
            distribution = self._bayaan_analytic_distribution()
            if distribution:
                values["analytic_distribution"] = distribution
        return values
