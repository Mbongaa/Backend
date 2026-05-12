from odoo import api, fields, models


class BayaanConsumptionLedger(models.Model):
    _name = "bayaan.consumption.ledger"
    _description = "Bayaan Ingredient Consumption Ledger"
    _order = "consumed_at desc, id desc"

    name = fields.Char(default="New", copy=False)
    pos_order_id = fields.Many2one("pos.order", required=True, index=True, ondelete="cascade")
    pos_order_line_id = fields.Many2one("pos.order.line", required=True, index=True, ondelete="cascade")
    pos_session_id = fields.Many2one(related="pos_order_id.session_id", store=True)
    pos_config_id = fields.Many2one(related="pos_order_id.config_id", store=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True, index=True)
    cashier_id = fields.Many2one(related="pos_order_id.user_id", store=True)
    product_id = fields.Many2one("product.product", string="Sold Product", required=True, index=True)
    product_qty = fields.Float(string="Sold Quantity", required=True)
    recipe_id = fields.Many2one("bayaan.recipe", required=True, index=True)
    recipe_line_id = fields.Many2one("bayaan.recipe.line", required=True, index=True)
    ingredient_id = fields.Many2one("product.product", required=True, index=True)
    ingredient_qty = fields.Float(required=True)
    uom_id = fields.Many2one("uom.uom", required=True)
    unit_cost = fields.Monetary(currency_field="currency_id", readonly=True)
    total_cost = fields.Monetary(
        compute="_compute_total_cost",
        currency_field="currency_id",
        store=True,
    )
    stock_scrap_id = fields.Many2one("stock.scrap", readonly=True)
    consumed_at = fields.Datetime(default=fields.Datetime.now, required=True, index=True)
    state = fields.Selection(
        [("posted", "Posted"), ("failed", "Failed")],
        default="posted",
        required=True,
        index=True,
    )
    failure_reason = fields.Text()
    currency_id = fields.Many2one(related="company_id.currency_id")
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    _pos_line_recipe_line_unique = models.Constraint(
        "unique(pos_order_line_id, recipe_line_id)",
        "This POS line already has a consumption record for this recipe ingredient.",
    )

    @api.depends("ingredient_qty", "unit_cost")
    def _compute_total_cost(self):
        for record in self:
            record.total_cost = record.ingredient_qty * record.unit_cost
