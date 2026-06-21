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
    bayaan_waste_requires_note = fields.Boolean(
        string="Waste Always Needs a Note",
        help=(
            "When set, every waste/loss entry for this product requires an investigation note "
            "(manager-flagged item). Enforced server-side by the Bayaan waste route, alongside "
            "the automatic 'Other'/high-value/unusual-quantity/repeated-pattern rules."
        ),
    )
    bayaan_pos_options = fields.Text(
        string="Bayaan POS Options",
        help=(
            "JSON describing per-product POS customisation, sourced to the POS instead of "
            "frontend hardcoding. Shape: {\"sizes\": [\"S\",\"M\",\"L\"], \"modifier_groups\": "
            "[{\"id\",\"name\":{\"en\",\"ar\"},\"selection\":\"single|multi\",\"required\":bool,"
            "\"values\":[{\"id\",\"name\":{\"en\",\"ar\"},\"priceDelta\":int,\"recipeFactor\":float,"
            "\"default\":bool}]}]}. The cashier's pick drives bayaan_modifier_signature / "
            "bayaan_modifier_recipe_factor on the sale line."
        ),
    )

    def bayaan_pos_options_dict(self):
        """Parse bayaan_pos_options into a dict; never raise on bad/empty data."""
        self.ensure_one()
        import json
        raw = (self.bayaan_pos_options or "").strip()
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return {}
        if not isinstance(data, dict):
            return {}
        sizes = data.get("sizes")
        groups = data.get("modifier_groups")
        return {
            "sizes": [str(s) for s in sizes if str(s).strip()] if isinstance(sizes, list) else [],
            "modifier_groups": groups if isinstance(groups, list) else [],
        }

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if "bayaan_consumption_mode" not in fields_list:
            fields_list.append("bayaan_consumption_mode")
        return fields_list
