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
        if kiosk:
            return kiosk._bayaan_analytic_distribution()
        hq_account = self.env["bayaan.kiosk"].sudo()._bayaan_hq_analytic_account(self.company_id)
        return {str(hq_account.id): 100.0} if hq_account else {}

    def _prepare_analytic_line_values(self, account_field_values, amount, unit_amount):
        values = super()._prepare_analytic_line_values(account_field_values, amount, unit_amount)
        if not values.get("name"):
            self.ensure_one()
            values["name"] = (
                self.reference
                or self.description_picking
                or self.origin
                or self.product_id.display_name
                or "Stock Move"
            )
        return values
