from odoo import fields, models

from ..payment_gateways import BAYAAN_PAYMENT_GATEWAY_SELECTION


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    bayaan_gateway_provider = fields.Selection(
        selection=BAYAAN_PAYMENT_GATEWAY_SELECTION,
        string="Bayaan Gateway Provider",
        help=(
            "Optional provider classification for Bayaan reports. Leave empty "
            "to classify by POS payment method metadata and method name aliases."
        ),
    )
    bayaan_gateway_external_id = fields.Char(
        string="Gateway Merchant/Method ID",
        help="Optional merchant, terminal, wallet, or gateway identifier used for settlement reconciliation.",
    )
    bayaan_gateway_settlement_window = fields.Selection(
        selection=[
            ("instant", "Instant"),
            ("daily", "Daily batch"),
            ("t_plus_1", "T+1"),
            ("manual", "Manual verification"),
        ],
        string="Settlement Window",
        default="daily",
        help="Expected settlement timing for owner-facing payment reconciliation.",
    )
