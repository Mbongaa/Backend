from odoo import api, fields, models
from odoo.exceptions import ValidationError


class BayaanKiosk(models.Model):
    _name = "bayaan.kiosk"
    _description = "Bayaan Kiosk"
    _order = "kiosk_code"

    name = fields.Char(required=True)
    kiosk_code = fields.Char(required=True, index=True)
    active = fields.Boolean(default=True)
    country_id = fields.Many2one("res.country", string="Country")
    city = fields.Char(index=True)
    area = fields.Char(string="Area / Site", index=True)
    street = fields.Char(string="Address")
    latitude = fields.Float(digits=(10, 7))
    longitude = fields.Float(digits=(10, 7))
    pos_config_id = fields.Many2one("pos.config", string="POS Configuration", required=True)
    stock_location_id = fields.Many2one(
        "stock.location",
        string="Kiosk Stock Location",
        domain="[('usage', '=', 'internal')]",
        required=True,
    )
    manager_user_id = fields.Many2one("res.users", string="Manager")
    supervisor_user_id = fields.Many2one("res.users", string="Supervisor")
    cashier_user_ids = fields.Many2many("res.users", string="Allowed Cashiers")
    stock_deduction_policy = fields.Selection(
        [
            ("warning", "Warning with supervisor override"),
            ("strict", "Strict stock blocking"),
            ("soft", "Soft negative-stock alert"),
        ],
        default="warning",
        required=True,
    )
    opening_date = fields.Date()
    last_stock_transfer_at = fields.Datetime(readonly=True)
    last_daily_close_at = fields.Datetime(readonly=True)
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    _kiosk_code_unique = models.Constraint(
        "unique(kiosk_code, company_id)",
        "Kiosk code must be unique per company.",
    )
    _pos_config_unique = models.Constraint(
        "unique(pos_config_id, company_id)",
        "Each POS configuration can belong to only one Bayaan kiosk.",
    )
    _stock_location_unique = models.Constraint(
        "unique(stock_location_id, company_id)",
        "Each kiosk stock location can belong to only one Bayaan kiosk.",
    )

    @api.constrains("stock_location_id", "pos_config_id")
    def _check_kiosk_stock_location_matches_pos_config(self):
        for kiosk in self:
            picking_type = kiosk.pos_config_id.picking_type_id
            if picking_type and picking_type.default_location_src_id and picking_type.default_location_src_id != kiosk.stock_location_id:
                raise ValidationError(
                    "The POS operation type source location must be the same as the kiosk stock location. "
                    "This keeps Odoo POS stock movement and Bayaan recipe consumption in the same kiosk context."
                )
