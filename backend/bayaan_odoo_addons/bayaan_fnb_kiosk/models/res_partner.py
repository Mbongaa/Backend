from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    bayaan_supplier_category = fields.Char(copy=False)
    bayaan_delivery_category = fields.Char(copy=False)
