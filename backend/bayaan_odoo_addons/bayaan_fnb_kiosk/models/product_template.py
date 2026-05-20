from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    bayaan_consumption_mode = fields.Selection(
        [
            ("recipe", "Recipe components"),
            ("finished", "Finished stock item"),
            ("hybrid", "Finished item + recipe components"),
            ("none", "No stock consumption"),
        ],
        string="Bayaan Consumption Mode",
        default="finished",
        required=True,
        help=(
            "Recipe products consume measured ingredients through the Bayaan ledger. "
            "Finished products keep Odoo POS stock handling. Hybrid products do both. "
            "No stock consumption skips Bayaan and Odoo stock movement for the sellable SKU."
        ),
    )
    bayaan_stock_target_qty = fields.Float(
        string="Bayaan Kiosk Target Qty",
        help="Quantity that represents 100% stock for one kiosk location.",
    )
    bayaan_stock_reorder_qty = fields.Float(
        string="Bayaan Kiosk Reorder Qty",
        help="When kiosk stock is at or below this quantity, Bayaan suggests a replenishment transfer.",
    )
    bayaan_stock_critical_qty = fields.Float(
        string="Bayaan Kiosk Critical Qty",
        help="When kiosk stock is at or below this quantity, Bayaan treats the item as critical.",
    )
    bayaan_stock_max_qty = fields.Float(
        string="Bayaan Kiosk Max Qty",
        help="Operational upper bound used to flag overfilled kiosk stock.",
    )
    bayaan_stock_priority_weight = fields.Float(
        string="Bayaan Stock Priority Weight",
        default=1.0,
        help="Weight used when averaging item stock percentages into kiosk stock health.",
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if "bayaan_consumption_mode" not in fields_list:
            fields_list.append("bayaan_consumption_mode")
        return fields_list
