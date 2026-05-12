from odoo import fields, models
from odoo.exceptions import UserError


class BayaanWasteEntry(models.Model):
    _name = "bayaan.waste.entry"
    _description = "Bayaan Waste/Loss Entry"
    _order = "create_date desc, id desc"

    name = fields.Char(default="New", copy=False)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True)
    product_id = fields.Many2one("product.product", required=True)
    qty = fields.Float(required=True, default=1.0)
    reason = fields.Char(required=True)
    estimated_cost = fields.Monetary(currency_field="currency_id")
    state = fields.Selection([("draft", "Draft"), ("posted", "Posted")], default="draft")
    currency_id = fields.Many2one(related="company_id.currency_id")
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )
    scrap_ids = fields.Many2many("stock.scrap", string="Generated Scraps", readonly=True)

    def _create_scrap(self, product, qty, uom):
        self.ensure_one()
        scrap = self.env["stock.scrap"].create({
            "product_id": product.id,
            "product_uom_id": uom.id,
            "scrap_qty": qty,
            "location_id": self.kiosk_id.stock_location_id.id,
            "company_id": self.company_id.id,
            "origin": self.name,
        })
        scrap.do_scrap()
        return scrap

    def action_post(self):
        Recipe = self.env["bayaan.recipe"]
        for entry in self:
            if entry.state == "posted":
                continue

            mode = entry.product_id.product_tmpl_id.bayaan_consumption_mode
            scraps = self.env["stock.scrap"]

            if mode in ("recipe", "hybrid"):
                recipe = Recipe.get_active_recipe(entry.product_id, entry.company_id, fields.Datetime.now())
                if not recipe:
                    raise UserError("Cannot post waste: no active Bayaan recipe for %s." % entry.product_id.display_name)
                for line in recipe.line_ids:
                    scraps |= entry._create_scrap(
                        line.ingredient_id,
                        line.qty * entry.qty,
                        line.uom_id,
                    )

            if mode in ("finished", "hybrid") or (mode == "none" and entry.product_id.is_storable):
                scraps |= entry._create_scrap(
                    entry.product_id,
                    entry.qty,
                    entry.product_id.uom_id,
                )

            entry.scrap_ids = scraps
            entry.state = "posted"
