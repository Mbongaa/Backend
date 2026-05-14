import hashlib
import hmac
import json

from odoo import api, fields, models
from odoo.tools import config


class BayaanRealtime(models.AbstractModel):
    _name = "bayaan.realtime"
    _description = "Bayaan Realtime Event Publisher"

    def _secret(self):
        secret = config.get("database.secret")
        if not secret:
            secret = self.env["ir.config_parameter"].sudo().get_param("database.secret")
        return secret or self.env.cr.dbname

    def _channel_for_user(self, user, company=None):
        user = user.sudo()
        company = company or user.company_id or self.env.company
        base = "%s:%s:%s" % (self.env.cr.dbname, company.id, user.id)
        digest = hmac.new(
            self._secret().encode("utf-8"),
            base.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:24]
        return "bayaan.realtime.%s.%s.%s" % (company.id, user.id, digest)

    def _channels_for_user(self, user=None, company=None):
        user = (user or self.env.user).sudo()
        company = company or self.env.company
        if not user or not user.active:
            return []
        if company and company not in user.company_ids:
            return []
        return [self._channel_for_user(user, company)]

    def _user_has_group(self, user, xmlid):
        return user.sudo().has_group(xmlid)

    def _is_chain_user(self, user):
        return (
            self._user_has_group(user, "base.group_system")
            or self._user_has_group(user, "bayaan_fnb_kiosk.group_bayaan_manager")
            or self._user_has_group(user, "bayaan_fnb_kiosk.group_bayaan_logistics")
            or self._user_has_group(user, "bayaan_fnb_kiosk.group_bayaan_accountant")
        )

    def _is_kiosk_user(self, user, kiosk):
        return bool(
            kiosk
            and (
                kiosk.manager_user_id == user
                or kiosk.supervisor_user_id == user
                or user in kiosk.cashier_user_ids
            )
        )

    def _target_users(self, company, kiosk=None):
        Users = self.env["res.users"].sudo()
        candidates = Users.search([
            ("active", "=", True),
            ("company_ids", "in", [company.id]),
        ])
        targets = Users.browse()
        for user in candidates:
            if self._is_chain_user(user) or self._is_kiosk_user(user, kiosk):
                targets |= user
        return targets

    def _safe_payload(self, payload):
        if not isinstance(payload, dict):
            return payload
        redacted = {}
        sensitive_tokens = ("password", "token", "secret", "file", "base64", "credential")
        for key, value in payload.items():
            if any(token in str(key).lower() for token in sensitive_tokens):
                redacted[key] = "[redacted]"
            elif isinstance(value, dict):
                redacted[key] = self._safe_payload(value)
            elif isinstance(value, list):
                redacted[key] = [
                    self._safe_payload(item) if isinstance(item, dict) else item
                    for item in value[:20]
                ]
            else:
                redacted[key] = value
        return redacted

    @api.model
    def realtime_config(self):
        return {
            "engine": "odoo_bus",
            "channels": self._channels_for_user(self.env.user, self.env.company),
            "last": self.env["bus.bus"].sudo()._bus_last_id(),
            "notificationType": "bayaan.realtime",
            "websocketVersion": "19.0-2",
            "pollIntervalMs": 2000,
        }

    @api.model
    def publish_event(
        self,
        event_type,
        action,
        title,
        detail="",
        record=None,
        kiosk=None,
        severity="info",
        payload=None,
        company=None,
        audit_event=None,
    ):
        company = (
            company
            or (audit_event.company_id if audit_event else None)
            or (record.company_id if record and "company_id" in record._fields else None)
            or self.env.company
        )
        kiosk = kiosk or (audit_event.kiosk_id if audit_event else None)
        event_payload = {
            "id": audit_event.id if audit_event else "%s:%s:%s" % (event_type, action, fields.Datetime.now()),
            "type": action,
            "eventType": event_type,
            "action": action,
            "severity": severity,
            "title": title,
            "detail": detail or "",
            "occurredAt": fields.Datetime.to_string(audit_event.occurred_at) if audit_event and audit_event.occurred_at else fields.Datetime.to_string(fields.Datetime.now()),
            "companyId": company.id,
            "kiosk": kiosk.kiosk_code if kiosk else "",
            "kioskName": kiosk.name if kiosk else "",
            "model": record._name if record else (audit_event.model_name if audit_event else ""),
            "resId": record.id if record else (audit_event.res_id if audit_event else False),
            "reference": (
                getattr(record, "name", False)
                or getattr(record, "display_name", False)
                or (audit_event.reference if audit_event else "")
            ),
            "payload": self._safe_payload(payload or {}),
        }
        Bus = self.env["bus.bus"].sudo()
        for user in self._target_users(company, kiosk=kiosk):
            Bus._sendone(self._channel_for_user(user, company), "bayaan.realtime", event_payload)
        return event_payload

    @api.model
    def publish_from_audit(self, audit_event):
        payload = {}
        if audit_event.payload_json:
            try:
                payload = json.loads(audit_event.payload_json)
            except Exception:
                payload = {}
        record = None
        if audit_event.model_name and audit_event.res_id:
            record = self.env[audit_event.model_name].sudo().browse(audit_event.res_id)
        return self.publish_event(
            audit_event.event_type,
            audit_event.action,
            audit_event.title,
            detail=audit_event.detail,
            record=record,
            kiosk=audit_event.kiosk_id,
            severity=audit_event.severity,
            payload=payload,
            company=audit_event.company_id,
            audit_event=audit_event,
        )
