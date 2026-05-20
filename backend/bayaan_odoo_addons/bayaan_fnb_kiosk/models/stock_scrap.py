from odoo import fields, models


class StockScrap(models.Model):
    _inherit = "stock.scrap"

    bayaan_kiosk_id = fields.Many2one(
        "bayaan.kiosk",
        string="Bayaan Kiosk",
        index=True,
        check_company=True,
        copy=False,
    )


class StockMove(models.Model):
    _inherit = "stock.move"

    def _bayaan_kiosk_for_analytic(self):
        self.ensure_one()
        if self.scrap_id.bayaan_kiosk_id:
            return self.scrap_id.bayaan_kiosk_id
        return self.env["bayaan.kiosk"].sudo().search([
            ("stock_location_id", "=", self.location_id.id),
            ("company_id", "=", self.company_id.id),
        ], limit=1)

    def _get_analytic_distribution(self):
        distribution = super()._get_analytic_distribution()
        if distribution:
            return distribution
        self.ensure_one()
        kiosk = self._bayaan_kiosk_for_analytic()
        return kiosk._bayaan_analytic_distribution() if kiosk else {}
