from odoo import api, fields, models


class StockPicking(models.Model):
    _inherit = "stock.picking"

    bayaan_transfer_state = fields.Selection(
        [
            ("draft", "Draft"),
            ("approved", "Approved"),
            ("picked", "Picked"),
            ("dispatched", "Dispatched"),
            ("received", "Received"),
            ("cancelled", "Cancelled"),
        ],
        default="draft",
        readonly=True,
        copy=False,
    )
    bayaan_discrepancy_line_ids = fields.One2many(
        "bayaan.stock.receipt.discrepancy",
        "picking_id",
        string="Bayaan Receipt Discrepancies",
        readonly=True,
    )
    bayaan_has_discrepancy = fields.Boolean(
        compute="_compute_bayaan_has_discrepancy",
        store=True,
    )

    @api.depends("bayaan_discrepancy_line_ids.shortage_qty", "bayaan_discrepancy_line_ids.damaged_qty")
    def _compute_bayaan_has_discrepancy(self):
        for picking in self:
            picking.bayaan_has_discrepancy = any(
                line.shortage_qty or line.damaged_qty
                for line in picking.bayaan_discrepancy_line_ids
            )


class BayaanStockReceiptDiscrepancy(models.Model):
    _name = "bayaan.stock.receipt.discrepancy"
    _description = "Bayaan Stock Receipt Discrepancy"
    _order = "picking_id, product_id"

    picking_id = fields.Many2one("stock.picking", required=True, ondelete="cascade", index=True)
    product_id = fields.Many2one("product.product", required=True)
    uom_id = fields.Many2one("uom.uom", required=True)
    expected_qty = fields.Float(required=True)
    received_qty = fields.Float(required=True)
    damaged_qty = fields.Float(default=0.0)
    shortage_qty = fields.Float(compute="_compute_shortage_qty", store=True)
    note = fields.Char()
    company_id = fields.Many2one(related="picking_id.company_id", store=True)

    @api.depends("expected_qty", "received_qty", "damaged_qty")
    def _compute_shortage_qty(self):
        for line in self:
            line.shortage_qty = max(
                line.expected_qty - line.received_qty - line.damaged_qty,
                0.0,
            )
