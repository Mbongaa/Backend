from odoo import api, fields, models
from odoo.exceptions import ValidationError


class BayaanRecipe(models.Model):
    _name = "bayaan.recipe"
    _description = "Bayaan F&B Recipe"
    _order = "product_id, effective_from desc, id desc"

    product_id = fields.Many2one("product.product", required=True, index=True)
    version_label = fields.Char(default="v1", required=True)
    effective_from = fields.Datetime(default=fields.Datetime.now, required=True)
    waste_allowance_percent = fields.Float(default=0.0)
    state = fields.Selection(
        [("draft", "Draft"), ("active", "Active"), ("archived", "Archived")],
        default="draft",
        required=True,
    )
    line_ids = fields.One2many("bayaan.recipe.line", "recipe_id", string="Ingredients", copy=True)
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )
    currency_id = fields.Many2one(related="company_id.currency_id")
    estimated_unit_cost = fields.Monetary(
        string="Estimated Unit Cost",
        compute="_compute_estimated_unit_cost",
        currency_field="currency_id",
        store=True,
    )

    @api.constrains("line_ids")
    def _check_lines(self):
        for recipe in self:
            if not recipe.line_ids:
                raise ValidationError("A recipe needs at least one ingredient.")

    @api.depends("line_ids.qty", "line_ids.ingredient_id.standard_price")
    def _compute_estimated_unit_cost(self):
        for recipe in self:
            recipe.estimated_unit_cost = sum(
                line.qty * line.ingredient_id.standard_price
                for line in recipe.line_ids
            )

    @api.model
    def get_active_recipe(self, product, company, at_date=None):
        domain = [
            ("product_id", "=", product.id),
            ("company_id", "=", company.id),
            ("state", "=", "active"),
        ]
        if at_date:
            domain.append(("effective_from", "<=", at_date))
        return self.search(domain, order="effective_from desc, id desc", limit=1)

    def action_activate(self):
        for recipe in self:
            self.search([
                ("id", "!=", recipe.id),
                ("product_id", "=", recipe.product_id.id),
                ("company_id", "=", recipe.company_id.id),
                ("state", "=", "active"),
            ]).write({"state": "archived"})
            recipe.state = "active"
            recipe.product_id.product_tmpl_id.bayaan_consumption_mode = "recipe"


class BayaanRecipeLine(models.Model):
    _name = "bayaan.recipe.line"
    _description = "Bayaan Recipe Ingredient"
    _order = "id"

    recipe_id = fields.Many2one("bayaan.recipe", required=True, ondelete="cascade")
    ingredient_id = fields.Many2one("product.product", required=True)
    qty = fields.Float(required=True)
    uom_id = fields.Many2one("uom.uom", required=True)

    @api.constrains("qty")
    def _check_qty(self):
        for line in self:
            if line.qty <= 0:
                raise ValidationError("Ingredient quantity must be greater than zero.")
