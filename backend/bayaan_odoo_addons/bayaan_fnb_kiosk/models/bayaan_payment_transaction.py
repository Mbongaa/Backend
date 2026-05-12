from uuid import uuid4

from odoo import api, fields, models


BAYAAN_PAYMENT_STATUS_SELECTION = [
    ("draft", "Draft"),
    ("pending", "Pending"),
    ("authorized", "Authorized"),
    ("paid", "Paid"),
    ("failed", "Failed"),
    ("expired", "Expired"),
    ("cancelled", "Cancelled"),
    ("refund_requested", "Refund requested"),
    ("refunded", "Refunded"),
    ("unknown", "Unknown"),
]


def normalize_provider_status(provider, status):
    token = str(status or "").strip().lower()
    provider = str(provider or "").strip().lower()
    if provider == "fib":
        return {
            "unpaid": "pending",
            "paid": "paid",
            "declined": "failed",
            "refunded": "refunded",
            "refund_requested": "refund_requested",
        }.get(token, "unknown")
    if provider == "zain_cash":
        return {
            "success": "paid",
            "completed": "paid",
            "paid": "paid",
            "pending": "pending",
            "otp_sent": "pending",
            "customer_authentication_required": "pending",
            "failed": "failed",
            "expired": "expired",
            "cancelled": "cancelled",
            "canceled": "cancelled",
            "refunded": "refunded",
            "reversed": "refunded",
        }.get(token, "unknown")
    return {
        "paid": "paid",
        "success": "paid",
        "pending": "pending",
        "failed": "failed",
        "cancelled": "cancelled",
        "canceled": "cancelled",
        "refunded": "refunded",
    }.get(token, "unknown")


class BayaanPaymentTransaction(models.Model):
    _name = "bayaan.payment.transaction"
    _description = "Bayaan Payment Gateway Transaction"
    _order = "create_date desc, id desc"

    name = fields.Char(required=True, default=lambda self: "BPT-%s" % uuid4().hex[:10].upper())
    provider = fields.Selection(
        selection=[
            ("zain_cash", "Zain Cash"),
            ("fib", "FIB"),
            ("qi_card", "Qi Card / SuperQi"),
            ("nass_wallet", "NassWallet / NASS Pay"),
            ("fastpay", "FastPay"),
            ("asia_hawala", "AsiaHawala"),
            ("bank_card", "Bank card terminal"),
            ("generic_qr", "Generic QR"),
            ("manual_bank_transfer", "Manual bank transfer"),
            ("other_digital", "Other digital"),
        ],
        required=True,
        index=True,
    )
    external_reference = fields.Char(required=True, index=True)
    provider_transaction_id = fields.Char(index=True)
    provider_status = fields.Char()
    status = fields.Selection(BAYAAN_PAYMENT_STATUS_SELECTION, default="draft", required=True, index=True)
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
        required=True,
    )
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )
    kiosk_id = fields.Many2one("bayaan.kiosk", index=True)
    pos_order_id = fields.Many2one("pos.order", index=True)
    pos_payment_id = fields.Many2one("pos.payment", index=True)
    payment_method_id = fields.Many2one("pos.payment.method", index=True)
    redirect_url = fields.Char()
    qr_code = fields.Text()
    readable_code = fields.Char()
    callback_secret = fields.Char(default=lambda self: uuid4().hex, copy=False)
    paid_at = fields.Datetime()
    cancelled_at = fields.Datetime()
    refunded_at = fields.Datetime()
    latest_payload_json = fields.Json()
    event_ids = fields.One2many("bayaan.payment.webhook.event", "transaction_id")

    _external_reference_unique = models.Constraint(
        "unique(provider, external_reference, company_id)",
        "Payment external reference must be unique per provider and company.",
    )

    @api.depends("provider", "external_reference")
    def _compute_display_name(self):
        for record in self:
            record.display_name = "%s %s" % (record.provider, record.external_reference)

    def bayaan_apply_provider_status(self, provider_status, payload=None):
        now = fields.Datetime.now()
        for transaction in self:
            status = normalize_provider_status(transaction.provider, provider_status)
            vals = {
                "provider_status": provider_status or transaction.provider_status,
                "status": status,
                "latest_payload_json": payload or transaction.latest_payload_json,
            }
            if status == "paid" and not transaction.paid_at:
                vals["paid_at"] = now
            elif status == "cancelled" and not transaction.cancelled_at:
                vals["cancelled_at"] = now
            elif status == "refunded" and not transaction.refunded_at:
                vals["refunded_at"] = now
            transaction.write(vals)
        return True


class BayaanPaymentWebhookEvent(models.Model):
    _name = "bayaan.payment.webhook.event"
    _description = "Bayaan Payment Gateway Webhook Event"
    _order = "create_date desc, id desc"

    transaction_id = fields.Many2one("bayaan.payment.transaction", required=True, ondelete="cascade", index=True)
    provider = fields.Selection(related="transaction_id.provider", store=True, readonly=True)
    event_key = fields.Char(required=True, index=True)
    provider_status = fields.Char()
    payload_json = fields.Json()
    processed = fields.Boolean(default=False)
    duplicate = fields.Boolean(default=False)
    company_id = fields.Many2one(related="transaction_id.company_id", store=True)

    _event_key_unique = models.Constraint(
        "unique(provider, event_key, company_id)",
        "Payment webhook event has already been processed.",
    )
