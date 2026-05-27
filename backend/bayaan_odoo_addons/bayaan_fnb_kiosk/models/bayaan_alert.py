"""Alert rule + dispatch ledger for proactive operator notifications.

The client explicitly asked for *"تنبيهات ذكية — الحليب أقل من 20 لتر — أكواب الحجم
الكبير قربت تخلص"*. Detection of low stock and variance already exists in
chain_bootstrap/shift_close — what was missing is the delivery layer.

Two models:

  * `bayaan.alert.rule` — what to watch (trigger_type, threshold, scope), who
    to email (recipient_user_ids), how often to fire (cooldown_minutes).
  * `bayaan.alert.dispatched` — fire ledger keyed by (rule, dedup_key). The
    cron checks this ledger before firing again so an alert that's true for
    24 hours doesn't email the manager every 5 minutes.

The cron entry point evaluates rules against the current Odoo/Bayaan state
without re-implementing any business logic — it asks `bayaan.kiosk` for
low-stock items, `bayaan.shift.close` for unresolved variance, etc. SMTP
credentials are a deployment-time concern; the code-side rule engine works
the moment an outgoing mail server is configured.
"""

import logging
from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


ALERT_TRIGGER_TYPES = [
    ("low_stock", "Low stock at a kiosk"),
    ("critical_stock", "Critical / empty stock at a kiosk"),
    ("close_variance", "Daily-close variance unresolved"),
    ("payment_failure", "Payment gateway failure"),
    ("missing_recipe", "POS sale posted without an active recipe"),
    ("high_waste", "Waste exceeded threshold for a kiosk"),
]


class BayaanAlertRule(models.Model):
    _name = "bayaan.alert.rule"
    _description = "Bayaan Alert Rule"
    _order = "active desc, name"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    trigger_type = fields.Selection(ALERT_TRIGGER_TYPES, required=True)
    threshold = fields.Float(
        help="Numeric threshold for trigger types that need one (e.g. low_stock: alert when on-hand drops below this multiple of reorder_qty; high_waste: alert when waste IQD exceeds this value).",
        default=1.0,
    )
    kiosk_ids = fields.Many2many(
        "bayaan.kiosk",
        string="Kiosks (empty = all kiosks in the company)",
    )
    product_ids = fields.Many2many(
        "product.product",
        string="Products (empty = any product)",
    )
    recipient_user_ids = fields.Many2many(
        "res.users",
        "bayaan_alert_rule_recipient_rel",
        "rule_id",
        "user_id",
        string="Email recipients",
        required=True,
    )
    cooldown_minutes = fields.Integer(
        default=120,
        help="Don't re-fire the same key within this many minutes. Default 2 hours.",
    )
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )
    mail_template_id = fields.Many2one(
        "mail.template",
        domain=[("model", "=", "bayaan.alert.dispatched")],
        help="Optional override. If empty, the addon's default Bayaan alert template is used.",
    )
    last_fired_at = fields.Datetime(readonly=True)
    fire_count = fields.Integer(readonly=True)

    @api.constrains("cooldown_minutes")
    def _check_cooldown(self):
        for rule in self:
            if rule.cooldown_minutes < 0:
                raise ValidationError(_("Cooldown minutes must be >= 0."))

    @api.constrains("recipient_user_ids", "active")
    def _check_recipients(self):
        for rule in self:
            if rule.active and not rule.recipient_user_ids:
                raise ValidationError(_("An active alert rule must have at least one recipient."))

    def _resolve_kiosks(self):
        self.ensure_one()
        if self.kiosk_ids:
            return self.kiosk_ids
        return self.env["bayaan.kiosk"].sudo().search([
            ("company_id", "=", self.company_id.id),
            ("active", "=", True),
        ])

    def _resolve_template(self):
        self.ensure_one()
        if self.mail_template_id:
            return self.mail_template_id
        return self.env.ref("bayaan_fnb_kiosk.mail_template_bayaan_alert", raise_if_not_found=False)

    def _should_fire(self, dedup_key):
        """Return True if this rule has not fired the same dedup_key inside cooldown."""
        self.ensure_one()
        if self.cooldown_minutes <= 0:
            return True
        cutoff = fields.Datetime.now() - timedelta(minutes=self.cooldown_minutes)
        existing = self.env["bayaan.alert.dispatched"].sudo().search([
            ("rule_id", "=", self.id),
            ("dedup_key", "=", dedup_key),
            ("fired_at", ">=", cutoff),
        ], limit=1)
        return not existing

    def _fire(self, dedup_key, subject, body_en, body_ar, payload=None, kiosk=None):
        """Record a dispatch row and try to send mail. Returns the dispatched record."""
        self.ensure_one()
        Dispatched = self.env["bayaan.alert.dispatched"].sudo()
        record = Dispatched.create({
            "rule_id": self.id,
            "dedup_key": dedup_key,
            "subject": subject,
            "body_en": body_en,
            "body_ar": body_ar,
            "kiosk_id": kiosk.id if kiosk else False,
            "payload_json": payload or "",
        })
        self.sudo().write({
            "last_fired_at": fields.Datetime.now(),
            "fire_count": self.fire_count + 1,
        })
        try:
            record._send_mail()
        except Exception:
            _logger.exception("Bayaan alert mail send failed for rule %s key %s", self.name, dedup_key)
            record.sudo().write({"send_state": "failed", "send_error": "see server log"})
        return record

    @api.model
    def _cron_evaluate_all(self):
        """Entry point for the ir.cron. Iterates active rules and evaluates each one."""
        rules = self.sudo().search([("active", "=", True)])
        for rule in rules:
            try:
                rule._evaluate()
            except Exception:
                _logger.exception("Bayaan alert rule evaluation failed for %s", rule.name)

    def _evaluate(self):
        """Dispatch to the trigger-specific evaluator."""
        self.ensure_one()
        if self.trigger_type == "low_stock":
            self._evaluate_low_stock(critical_only=False)
        elif self.trigger_type == "critical_stock":
            self._evaluate_low_stock(critical_only=True)
        elif self.trigger_type == "high_waste":
            self._evaluate_high_waste()
        elif self.trigger_type == "close_variance":
            self._evaluate_close_variance()
        # payment_failure and missing_recipe are fired inline by the audit/event
        # hooks, not by the cron — see _trigger_event_rules.

    def _evaluate_low_stock(self, critical_only=False):
        self.ensure_one()
        Quant = self.env["stock.quant"].sudo()
        kiosks = self._resolve_kiosks()
        product_filter = self.product_ids.ids
        for kiosk in kiosks:
            location = kiosk.stock_location_id
            if not location:
                continue
            domain = [("location_id", "=", location.id), ("product_id.type", "!=", "service")]
            if product_filter:
                domain.append(("product_id", "in", product_filter))
            quants = Quant.search(domain)
            for quant in quants:
                product = quant.product_id
                tmpl = product.product_tmpl_id
                reorder = tmpl.bayaan_stock_reorder_qty or 0.0
                critical = tmpl.bayaan_stock_critical_qty or 0.0
                if critical_only:
                    if critical <= 0 or quant.quantity > critical:
                        continue
                    severity = "critical"
                    threshold = critical
                else:
                    if reorder <= 0 or quant.quantity > reorder * (self.threshold or 1.0):
                        continue
                    severity = "low"
                    threshold = reorder
                dedup_key = "low_stock:%s:%s:%s" % (kiosk.id, product.id, severity)
                if not self._should_fire(dedup_key):
                    continue
                subject = "%s stock %s at %s" % (product.display_name, severity, kiosk.display_name)
                body_en = (
                    "Stock for %s at kiosk %s is at %.2f %s, threshold %.2f %s."
                    % (
                        product.display_name,
                        kiosk.display_name,
                        quant.quantity,
                        product.uom_id.name,
                        threshold,
                        product.uom_id.name,
                    )
                )
                body_ar = (
                    "مخزون %s في الكشك %s وصل إلى %.2f %s (الحد %.2f %s)."
                    % (
                        product.display_name,
                        kiosk.display_name,
                        quant.quantity,
                        product.uom_id.name,
                        threshold,
                        product.uom_id.name,
                    )
                )
                self._fire(dedup_key, subject, body_en, body_ar, kiosk=kiosk)

    def _evaluate_high_waste(self):
        self.ensure_one()
        WasteEntry = self.env["bayaan.waste.entry"].sudo()
        kiosks = self._resolve_kiosks()
        today_start = fields.Datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for kiosk in kiosks:
            rows = WasteEntry.search([
                ("kiosk_id", "=", kiosk.id),
                ("create_date", ">=", today_start),
            ])
            cost = sum(row.estimated_cost or 0.0 for row in rows)
            if cost <= (self.threshold or 0.0):
                continue
            dedup_key = "high_waste:%s:%s" % (kiosk.id, today_start.date().isoformat())
            if not self._should_fire(dedup_key):
                continue
            subject = "High waste at %s today" % kiosk.display_name
            body_en = (
                "Today's waste at %s is %.0f, above threshold %.0f."
                % (kiosk.display_name, cost, self.threshold or 0.0)
            )
            body_ar = (
                "الهدر اليوم في %s بلغ %.0f، أعلى من الحد %.0f."
                % (kiosk.display_name, cost, self.threshold or 0.0)
            )
            self._fire(dedup_key, subject, body_en, body_ar, kiosk=kiosk)

    def _evaluate_close_variance(self):
        self.ensure_one()
        ShiftClose = self.env["bayaan.shift.close"].sudo()
        kiosks = self._resolve_kiosks()
        for kiosk in kiosks:
            unresolved = ShiftClose.search([
                ("kiosk_id", "=", kiosk.id),
                ("state", "in", ("submitted", "needs_review")),
            ], limit=10)
            for close in unresolved:
                dedup_key = "close_variance:%s:%s" % (kiosk.id, close.id)
                if not self._should_fire(dedup_key):
                    continue
                subject = "Daily close variance pending at %s" % kiosk.display_name
                body_en = "Close %s is in state %s and awaiting manager review." % (close.display_name, close.state)
                body_ar = "إغلاق اليوم %s بحالة %s ينتظر مراجعة المدير." % (close.display_name, close.state)
                self._fire(dedup_key, subject, body_en, body_ar, kiosk=kiosk)

    @api.model
    def _trigger_event_rules(self, trigger_type, dedup_key, subject, body_en, body_ar, kiosk=None, payload=None):
        """Inline-fire all active rules of a given trigger_type. Called from audit hooks."""
        rules = self.sudo().search([("active", "=", True), ("trigger_type", "=", trigger_type)])
        for rule in rules:
            if kiosk and rule.kiosk_ids and kiosk not in rule.kiosk_ids:
                continue
            if not rule._should_fire(dedup_key):
                continue
            rule._fire(dedup_key, subject, body_en, body_ar, payload=payload, kiosk=kiosk)


class BayaanAlertDispatched(models.Model):
    _name = "bayaan.alert.dispatched"
    _description = "Bayaan Alert Dispatched Event"
    _order = "fired_at desc, id desc"

    rule_id = fields.Many2one("bayaan.alert.rule", required=True, ondelete="cascade", index=True)
    dedup_key = fields.Char(required=True, index=True)
    fired_at = fields.Datetime(default=fields.Datetime.now, required=True, index=True)
    subject = fields.Char()
    body_en = fields.Text()
    body_ar = fields.Text()
    kiosk_id = fields.Many2one("bayaan.kiosk", index=True)
    payload_json = fields.Text()
    send_state = fields.Selection(
        [("queued", "Queued"), ("sent", "Sent"), ("failed", "Failed")],
        default="queued",
        required=True,
    )
    send_error = fields.Text()
    sent_at = fields.Datetime()
    company_id = fields.Many2one(related="rule_id.company_id", store=True)

    def _send_mail(self):
        """Send via res.users mail per recipient. Picks language per user.lang."""
        for record in self:
            recipients = record.rule_id.recipient_user_ids
            if not recipients:
                record.send_state = "failed"
                record.send_error = "No recipients configured"
                continue
            try:
                for user in recipients:
                    body = record.body_ar if (user.lang or "").startswith("ar") else record.body_en
                    mail_values = {
                        "subject": "[Bayaan] %s" % (record.subject or "Alert"),
                        "body_html": "<p>%s</p>" % (body or "").replace("\n", "<br/>"),
                        "email_to": user.email or user.partner_id.email or False,
                        "auto_delete": True,
                    }
                    if not mail_values["email_to"]:
                        continue
                    self.env["mail.mail"].sudo().create(mail_values).send()
                record.send_state = "sent"
                record.sent_at = fields.Datetime.now()
            except Exception as exc:
                _logger.exception("Bayaan alert dispatch %s failed", record.id)
                record.send_state = "failed"
                record.send_error = str(exc)
