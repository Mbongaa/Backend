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

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if "bayaan_consumption_mode" not in fields_list:
            fields_list.append("bayaan_consumption_mode")
        return fields_list
