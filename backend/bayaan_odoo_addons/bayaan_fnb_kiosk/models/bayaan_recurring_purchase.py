from odoo import api, fields, models
from odoo.exceptions import UserError


class BayaanRecurringPurchase(models.Model):
    _name = "bayaan.recurring.purchase"
    _description = "Bayaan Recurring Purchase"
    _order = "next_date, name"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    partner_id = fields.Many2one("res.partner", required=True, domain=[("supplier_rank", ">", 0)])
    warehouse_id = fields.Many2one("stock.warehouse", required=True)
    frequency = fields.Selection(
        [
            ("weekly", "Weekly"),
            ("biweekly", "Every 2 weeks"),
            ("monthly", "Monthly"),
        ],
        default="weekly",
        required=True,
    )
    weekday = fields.Selection(
        [
            ("0", "Monday"),
            ("1", "Tuesday"),
            ("2", "Wednesday"),
            ("3", "Thursday"),
            ("4", "Friday"),
            ("5", "Saturday"),
            ("6", "Sunday"),
        ],
        default="0",
        required=True,
    )
    next_date = fields.Date(required=True, default=fields.Date.context_today)
    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    line_ids = fields.One2many("bayaan.recurring.purchase.line", "recurring_id")

    @api.constrains("line_ids")
    def _check_line_ids(self):
        for plan in self:
            if not plan.line_ids:
                raise UserError("Recurring purchase needs at least one item.")

    def action_create_purchase_order(self):
        Purchase = self.env["purchase.order"].sudo()
        orders = Purchase.browse()
        for plan in self:
            if not plan.line_ids:
                raise UserError("Recurring purchase %s has no items." % plan.name)
            order_lines = []
            for line in plan.line_ids:
                order_lines.append((0, 0, {
                    "product_id": line.product_id.id,
                    "product_qty": line.qty,
                    "product_uom_id": line.uom_id.id,
                    "price_unit": line.price_unit,
                    "date_planned": plan.next_date,
                }))
            vals = {
                "partner_id": plan.partner_id.id,
                "company_id": plan.company_id.id,
                "date_planned": plan.next_date,
                "order_line": order_lines,
            }
            if plan.warehouse_id.in_type_id:
                vals["picking_type_id"] = plan.warehouse_id.in_type_id.id
            order = Purchase.create(vals)
            order.button_confirm()
            orders |= order
        return orders


class BayaanRecurringPurchaseLine(models.Model):
    _name = "bayaan.recurring.purchase.line"
    _description = "Bayaan Recurring Purchase Line"
    _order = "recurring_id, id"

    recurring_id = fields.Many2one("bayaan.recurring.purchase", required=True, ondelete="cascade")
    product_id = fields.Many2one("product.product", required=True)
    qty = fields.Float(required=True, default=1.0)
    uom_id = fields.Many2one("uom.uom", required=True)
    price_unit = fields.Float(required=True, default=0.0)
    company_id = fields.Many2one(related="recurring_id.company_id", store=True, readonly=True)

    @api.onchange("product_id")
    def _onchange_product_id(self):
        for line in self:
            if line.product_id:
                line.uom_id = line.product_id.uom_id
                line.price_unit = line.price_unit or line.product_id.standard_price
