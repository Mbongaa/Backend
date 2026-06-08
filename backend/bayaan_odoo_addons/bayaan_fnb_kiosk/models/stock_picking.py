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

    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        """Suppress the finished-SKU delivery move for recipe/none products.

        Odoo 19 POS creates the order delivery through this method (not through
        ``_launch_stock_rule_from_pos_order_lines``, which only runs when a picking
        already exists). Recipe products deduct their measured ingredients through the
        Bayaan consumption ledger, so the finished SKU must not also leave a kiosk stock
        move (which would drive the unstocked finished product negative). 'finished' and
        'hybrid' lines still flow through so Odoo handles their stock normally.
        """
        lines = lines.filtered(
            lambda line: line.product_id.product_tmpl_id.bayaan_consumption_mode not in ("recipe", "none")
        )
        return super()._create_picking_from_pos_order_lines(
            location_dest_id, lines, picking_type, partner=partner
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
