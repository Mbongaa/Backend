from odoo import api, fields, models


class BayaanShiftClose(models.Model):
    _name = "bayaan.shift.close"
    _description = "Bayaan Shift Close"
    _order = "opened_at desc, id desc"

    name = fields.Char(default="New", copy=False)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True)
    cashier_id = fields.Many2one("res.users")
    opened_at = fields.Datetime(required=True)
    closed_at = fields.Datetime(default=fields.Datetime.now)
    opening_cash = fields.Monetary(currency_field="currency_id")
    expected_cash = fields.Monetary(currency_field="currency_id")
    actual_cash = fields.Monetary(currency_field="currency_id")
    cash_variance = fields.Monetary(currency_field="currency_id", compute="_compute_cash_variance", store=True)
    pos_order_ids = fields.Many2many("pos.order", string="POS Orders")
    stock_count_line_ids = fields.One2many(
        "bayaan.shift.close.line",
        "shift_close_id",
        string="Stock Counts",
    )
    stock_count_json = fields.Json(string="Stock Count Snapshot")
    manager_review_state = fields.Selection(
        [
            ("pending", "Pending Review"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
        ],
        default="pending",
        required=True,
        copy=False,
    )
    manager_note = fields.Text(copy=False)
    manager_reviewed_by_id = fields.Many2one("res.users", copy=False, readonly=True)
    manager_reviewed_at = fields.Datetime(copy=False, readonly=True)
    investigation_status = fields.Selection(
        [
            ("none", "None"),
            ("open", "Open"),
            ("closed", "Closed"),
        ],
        default="none",
        required=True,
        copy=False,
    )
    currency_id = fields.Many2one(related="company_id.currency_id")
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("actual_cash", "expected_cash")
    def _compute_cash_variance(self):
        for record in self:
            record.cash_variance = record.actual_cash - record.expected_cash

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if not record.name or record.name == "New":
                kiosk_code = record.kiosk_id.kiosk_code or "KIOSK"
                record.name = "BSC-%s-%05d" % (kiosk_code, record.id)
        return records


class BayaanShiftCloseLine(models.Model):
    _name = "bayaan.shift.close.line"
    _description = "Bayaan Shift Close Stock Count"
    _order = "product_id"

    shift_close_id = fields.Many2one("bayaan.shift.close", required=True, ondelete="cascade")
    kiosk_id = fields.Many2one(related="shift_close_id.kiosk_id", store=True)
    product_id = fields.Many2one("product.product", required=True)
    uom_id = fields.Many2one("uom.uom", required=True)
    expected_qty = fields.Float(string="Expected Quantity")
    actual_qty = fields.Float(string="Actual Count")
    variance_qty = fields.Float(compute="_compute_variance_qty", store=True)
    note = fields.Char()
    company_id = fields.Many2one(related="shift_close_id.company_id", store=True)

    @api.depends("actual_qty", "expected_qty")
    def _compute_variance_qty(self):
        for line in self:
            line.variance_qty = line.actual_qty - line.expected_qty
