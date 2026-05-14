from odoo import fields, models


class BayaanAuditEvent(models.Model):
    _name = "bayaan.audit.event"
    _description = "Bayaan Audit Event"
    _order = "occurred_at desc, id desc"
    _rec_name = "title"

    event_type = fields.Char(required=True, index=True)
    action = fields.Char(required=True, index=True)
    severity = fields.Selection([
        ("info", "Info"),
        ("success", "Success"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    ], default="info", required=True, index=True)
    title = fields.Char(required=True)
    detail = fields.Text()
    actor_id = fields.Many2one("res.users", required=True, index=True, default=lambda self: self.env.user)
    kiosk_id = fields.Many2one("bayaan.kiosk", index=True, ondelete="set null")
    model_name = fields.Char(index=True)
    res_id = fields.Integer(index=True)
    reference = fields.Char(index=True)
    payload_json = fields.Text()
    occurred_at = fields.Datetime(required=True, index=True, default=fields.Datetime.now)
    company_id = fields.Many2one("res.company", required=True, index=True, default=lambda self: self.env.company)
