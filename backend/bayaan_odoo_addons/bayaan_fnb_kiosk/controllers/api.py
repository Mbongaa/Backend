import base64
import binascii
import json
import logging
import math
import os
from datetime import datetime, time, timedelta
from uuid import uuid4

import requests
import pytz

from odoo import SUPERUSER_ID, api, fields, http
from odoo.exceptions import UserError
from odoo.http import request, Response
from odoo.tools import float_compare

from ..payment_gateways import (
    BAYAAN_PAYMENT_GATEWAY_BY_ID,
    classify_payment_gateway,
    serialize_payment_gateway_catalog,
)
from ..models.bayaan_payment_transaction import normalize_provider_status
from .landed_cost_service import BayaanLandedCostService


_logger = logging.getLogger(__name__)


class BayaanKioskApi(http.Controller):
    def _payload(self, kwargs):
        payload = kwargs.get("payload")
        return payload if isinstance(payload, dict) else kwargs

    def _product(self, code_or_name):
        Product = request.env["product.product"].sudo()
        if not code_or_name:
            return Product.browse()
        if isinstance(code_or_name, int):
            product = Product.browse(code_or_name)
            return product if product.exists() else Product.browse()
        product = Product.search([("default_code", "=", code_or_name)], limit=1)
        if product:
            return product
        product = Product.search([("barcode", "=", code_or_name)], limit=1)
        if product:
            return product
        product = Product.search([("name", "=", code_or_name)], limit=1)
        if product:
            return product
        return Product.search([("name", "ilike", code_or_name)], limit=1)

    def _require_product(self, code_or_name):
        product = self._product(code_or_name)
        if not product:
            raise UserError("Product not found: %s" % (code_or_name or "empty value"))
        return product

    def _sale_product_refs(self, code_or_name, fallback_name=None):
        refs = []
        for value in (code_or_name, fallback_name):
            if value in (None, "") or value in refs:
                continue
            refs.append(value)
            if isinstance(value, str):
                normalized = value.strip().upper().replace(" ", "-")
                if normalized and normalized not in refs:
                    refs.append(normalized)
                if normalized.startswith("MENU-") or normalized.startswith("ING-"):
                    continue
                for prefix in ("MENU-", "ING-"):
                    candidate = prefix + normalized
                    if candidate not in refs:
                        refs.append(candidate)
        return refs

    def _sale_product(self, code_or_name, fallback_name=None):
        Product = request.env["product.product"].sudo()
        for ref in self._sale_product_refs(code_or_name, fallback_name):
            if isinstance(ref, int):
                product = Product.browse(ref)
                if product.exists() and product.available_in_pos:
                    return product
                continue
            ref = str(ref).strip()
            if not ref:
                continue
            for domain in (
                [("available_in_pos", "=", True), ("default_code", "=ilike", ref)],
                [("available_in_pos", "=", True), ("barcode", "=", ref)],
                [("available_in_pos", "=", True), ("name", "=ilike", ref)],
                [("available_in_pos", "=", True), ("name", "ilike", ref)],
                [("default_code", "=ilike", ref)],
                [("barcode", "=", ref)],
                [("name", "=ilike", ref)],
                [("name", "ilike", ref)],
            ):
                product = Product.search(domain, limit=1)
                if product:
                    return product
        raise UserError(
            "Sale product not found in Odoo POS catalog: %s"
            % (fallback_name or code_or_name or "empty value")
        )

    def _require_kiosk(self, kiosk_code):
        kiosk = request.env["bayaan.kiosk"].sudo().search([("kiosk_code", "=", kiosk_code)], limit=1)
        if not kiosk:
            raise UserError("Kiosk not found: %s" % (kiosk_code or "empty value"))
        return kiosk

    def _is_system_user(self):
        return request.env.user.has_group("base.group_system")

    def _is_bayaan_manager(self):
        return self._is_system_user() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_manager")

    def _is_bayaan_supervisor(self):
        return self._is_bayaan_manager() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_supervisor")

    def _is_bayaan_logistics(self):
        return self._is_bayaan_manager() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_logistics")

    def _is_bayaan_stock_operator(self):
        return self._is_bayaan_logistics() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_supervisor")

    def _is_bayaan_accountant(self):
        return self._is_bayaan_manager() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_accountant")

    def _is_bayaan_spectator(self):
        return request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_spectator")

    def _is_chain_read_user(self):
        return (
            self._is_bayaan_manager()
            or self._is_bayaan_logistics()
            or self._is_bayaan_accountant()
            or self._is_bayaan_spectator()
        )

    def _is_bayaan_cashier(self):
        return self._is_bayaan_supervisor() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_cashier")

    def _current_user_is_authenticated(self):
        user = request.env.user
        is_public = getattr(user, "_is_public", lambda: False)
        return bool(request.session.uid) and not is_public()

    def _bayaan_roles(self):
        if not self._current_user_is_authenticated():
            return []
        roles = []
        if self._is_system_user():
            roles.append("superadmin")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_manager"):
            roles.append("manager")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_logistics"):
            roles.append("logistics")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_accountant"):
            roles.append("accountant")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_supervisor"):
            roles.append("supervisor")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_cashier"):
            roles.append("cashier")
        if request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_spectator"):
            roles.append("spectator")
        return roles

    def _role_payload(self):
        user = request.env.user
        roles = self._bayaan_roles()
        primary = next(
            (role for role in ("superadmin", "manager", "logistics", "accountant", "supervisor", "cashier", "spectator") if role in roles),
            None,
        )
        nav_by_role = {
            "cashier": [],
            "spectator": [
                "overview", "insights", "kiosks", "sales", "closing", "waste",
                "products", "suppliers", "inventory", "staff", "finance", "reports",
            ],
            "supervisor": ["overview", "kiosks", "sales", "closing", "waste", "inventory", "reports"],
            "logistics": ["overview", "warehouses", "items", "suppliers", "inventory", "reports"],
            "accountant": ["overview", "insights", "sales", "closing", "suppliers", "staff", "finance", "reports"],
            "manager": [
                "overview", "insights", "kiosks", "warehouses", "items", "sales", "closing",
                "waste", "products", "suppliers", "inventory", "staff", "finance", "reports",
            ],
            "superadmin": [
                "overview", "insights", "kiosks", "warehouses", "items", "sales", "closing",
                "waste", "products", "suppliers", "inventory", "staff", "finance", "reports",
            ],
        }
        allowed_nav = []
        for role in roles:
            for item in nav_by_role.get(role, []):
                if item not in allowed_nav:
                    allowed_nav.append(item)
        assigned_kiosks = []
        if roles:
            Kiosk = request.env["bayaan.kiosk"].sudo()
            sees_full_chain = "superadmin" in roles or "spectator" in roles
            if sees_full_chain:
                kiosks = Kiosk.search([
                    ("company_id", "=", request.env.company.id),
                    ("active", "=", True),
                ], order="kiosk_code", limit=200)
            else:
                kiosks = Kiosk.search([
                    ("company_id", "=", request.env.company.id),
                    "|", "|",
                    ("manager_user_id", "=", user.id),
                    ("supervisor_user_id", "=", user.id),
                    ("cashier_user_ids", "in", [user.id]),
                ], order="kiosk_code", limit=200)
            assigned_kiosks = [{
                "id": kiosk.id,
                "kioskCode": kiosk.kiosk_code,
                "name": kiosk.name,
                "city": kiosk.city,
                "area": kiosk.area,
            } for kiosk in kiosks]
            if sees_full_chain:
                pos_kiosk_count = Kiosk.search_count([
                    ("company_id", "=", request.env.company.id),
                    ("active", "=", True),
                ])
            else:
                pos_kiosk_count = Kiosk.search_count([
                    ("company_id", "=", request.env.company.id),
                    "|",
                    ("supervisor_user_id", "=", user.id),
                    ("cashier_user_ids", "in", [user.id]),
                ])
        else:
            pos_kiosk_count = 0
        return {
            "authenticated": bool(roles),
            "user": {
                "id": user.id if roles else False,
                "name": user.name if roles else "",
                "login": user.login if roles else "",
                "roles": roles,
                "primaryRole": primary,
                "allowedNav": allowed_nav,
                "allowedPanels": {
                    "admin": bool(allowed_nav),
                    "pos": bool(pos_kiosk_count) and bool(
                        {"superadmin", "manager", "supervisor", "cashier"} & set(roles)
                    ),
                },
                "assignedKiosks": assigned_kiosks,
            },
        }

    def _user_is_assigned_to_kiosk(self, kiosk):
        user = request.env.user
        return (
            kiosk.manager_user_id == user
            or kiosk.supervisor_user_id == user
            or user in kiosk.cashier_user_ids
        )

    def _user_can_receive_for_kiosk(self, kiosk):
        user = request.env.user
        return (
            self._is_system_user()
            or
            (
                kiosk.supervisor_user_id == user
                and user.has_group("bayaan_fnb_kiosk.group_bayaan_supervisor")
            )
            or (
                user in kiosk.cashier_user_ids
                and user.has_group("bayaan_fnb_kiosk.group_bayaan_cashier")
            )
        )

    def _require_kiosk_scope(self, kiosk, operation):
        """JSON routes use sudo for Odoo writes; enforce Bayaan kiosk scope here."""
        if operation == "transfer_receive":
            if self._user_can_receive_for_kiosk(kiosk):
                return
            raise UserError(
                "You are not allowed to %s for kiosk %s."
                % (operation.replace("_", " "), kiosk.kiosk_code)
            )
        if self._is_bayaan_manager():
            return
        if operation == "transfer" and self._is_bayaan_logistics():
            return
        assigned = self._user_is_assigned_to_kiosk(kiosk)
        if operation in ("open_session", "sale", "waste", "shift_close", "stock_request"):
            if assigned and self._is_bayaan_cashier():
                return
        elif operation in ("transfer", "review"):
            if assigned and self._is_bayaan_stock_operator():
                return
        raise UserError(
            "You are not allowed to %s for kiosk %s."
            % (operation.replace("_", " "), kiosk.kiosk_code)
        )

    def _require_procurement_scope(self):
        if not self._is_bayaan_logistics():
            raise UserError("Only Bayaan logistics or managers can create or process purchase orders.")

    def _require_chain_read_scope(self, action):
        if not self._is_chain_read_user():
            raise UserError("Only Bayaan managers, logistics, or accountants can %s." % action)

    def _require_manager_scope(self, action):
        if not self._is_bayaan_manager():
            raise UserError("Only Bayaan managers can %s." % action)

    def _require_superadmin_scope(self, action):
        if not self._is_system_user():
            raise UserError("Only Bayaan superadmins can %s." % action)

    def _audit_payload(self, payload):
        if not isinstance(payload, dict):
            return payload
        redacted = {}
        sensitive_tokens = ("password", "token", "secret", "file", "base64", "credential")
        for key, value in payload.items():
            if any(token in str(key).lower() for token in sensitive_tokens):
                redacted[key] = "[redacted]"
            elif isinstance(value, dict):
                redacted[key] = self._audit_payload(value)
            elif isinstance(value, list):
                redacted[key] = [
                    self._audit_payload(item) if isinstance(item, dict) else item
                    for item in value[:20]
                ]
            else:
                redacted[key] = value
        return redacted

    def _audit_event(self, event_type, action, title, detail="", record=None, kiosk=None, severity="info", payload=None):
        try:
            values = {
                "event_type": event_type,
                "action": action,
                "severity": severity,
                "title": title,
                "detail": detail or "",
                "actor_id": request.env.user.id,
                "company_id": request.env.company.id,
                "occurred_at": fields.Datetime.now(),
            }
            if kiosk:
                values["kiosk_id"] = kiosk.id
            if record:
                values.update({
                    "model_name": record._name,
                    "res_id": record.id,
                    "reference": getattr(record, "name", False) or getattr(record, "display_name", False) or str(record.id),
                })
            if payload is not None:
                values["payload_json"] = json.dumps(self._audit_payload(payload), default=str, ensure_ascii=False)[:8000]
            event = request.env["bayaan.audit.event"].sudo().create(values)
            try:
                request.env["bayaan.realtime"].sudo().publish_from_audit(event)
            except Exception:
                _logger.exception("Could not publish Bayaan realtime event: %s", title)
            return event
        except Exception:
            _logger.exception("Could not write Bayaan audit event: %s", title)
        return False

    def _serialize_audit_event(self, event):
        return {
            "id": event.id,
            "eventType": event.event_type,
            "action": event.action,
            "severity": event.severity,
            "title": event.title,
            "detail": event.detail or "",
            "actor": event.actor_id.name,
            "actorLogin": event.actor_id.login,
            "occurredAt": self._bayaan_local_datetime(event.occurred_at),
            "kiosk": event.kiosk_id.kiosk_code if event.kiosk_id else "",
            "kioskName": event.kiosk_id.name if event.kiosk_id else "",
            "model": event.model_name or "",
            "resId": event.res_id or False,
            "reference": event.reference or "",
        }

    def _kiosk_for_picking(self, picking):
        return request.env["bayaan.kiosk"].sudo().search([
            ("stock_location_id", "=", picking.location_dest_id.id),
            ("company_id", "=", request.env.company.id),
        ], limit=1)

    def _require_shift_close(self, value):
        ShiftClose = request.env["bayaan.shift.close"].sudo()
        if not value:
            raise UserError("Shift close id is required.")
        if isinstance(value, int):
            close = ShiftClose.browse(value)
        else:
            close = ShiftClose.search(["|", ("name", "=", value), ("id", "=", int(value) if str(value).isdigit() else 0)], limit=1)
        if not close.exists():
            raise UserError("Shift close not found: %s" % value)
        return close

    def _uom(self, name, fallback):
        if not name:
            return fallback
        uom = request.env["uom.uom"].sudo().search([("name", "=", name)], limit=1)
        return uom or fallback

    def _float_value(self, value, default=0.0):
        if value in (None, ""):
            return default
        return float(value)

    def _payload_float(self, payload, keys, default=None):
        for key in keys:
            if payload.get(key) not in (None, ""):
                return self._float_value(payload.get(key), default or 0.0)
        return default

    def _stock_plan_payload_values(self, payload, include_defaults=False):
        values = {}
        field_keys = {
            "bayaan_stock_target_qty": (
                "target_qty", "targetQty", "stock_target_qty", "stockTargetQty",
                "kiosk_target_qty", "kioskTargetQty", "bayaan_stock_target_qty",
            ),
            "bayaan_stock_reorder_qty": (
                "reorder_qty", "reorderQty", "reorder", "stock_reorder_qty",
                "stockReorderQty", "bayaan_stock_reorder_qty",
            ),
            "bayaan_stock_critical_qty": (
                "critical_qty", "criticalQty", "critical", "safety_qty",
                "safetyQty", "bayaan_stock_critical_qty",
            ),
            "bayaan_stock_max_qty": (
                "max_qty", "maxQty", "stock_max_qty", "stockMaxQty",
                "bayaan_stock_max_qty",
            ),
            "bayaan_stock_priority_weight": (
                "priority_weight", "priorityWeight", "stock_priority_weight",
                "stockPriorityWeight", "bayaan_stock_priority_weight",
            ),
        }
        for field_name, keys in field_keys.items():
            value = self._payload_float(payload, keys)
            if value is not None:
                values[field_name] = max(value, 0.0)
        if include_defaults:
            target = values.get("bayaan_stock_target_qty", 0.0)
            reorder = values.get("bayaan_stock_reorder_qty", 0.0)
            critical = values.get("bayaan_stock_critical_qty", 0.0)
            if target and not reorder:
                values["bayaan_stock_reorder_qty"] = target * 0.5
                reorder = values["bayaan_stock_reorder_qty"]
            if reorder and not target:
                values["bayaan_stock_target_qty"] = reorder * 2
                target = values["bayaan_stock_target_qty"]
            if reorder and not critical:
                values["bayaan_stock_critical_qty"] = reorder * 0.5
            if target and not values.get("bayaan_stock_max_qty"):
                values["bayaan_stock_max_qty"] = target
            if not values.get("bayaan_stock_priority_weight"):
                values["bayaan_stock_priority_weight"] = 1.0
        return values

    def _product_stock_plan(self, product, actual_qty=0.0):
        template = product.product_tmpl_id
        configured_target = max(template.bayaan_stock_target_qty or 0.0, 0.0)
        configured_reorder = max(template.bayaan_stock_reorder_qty or 0.0, 0.0)
        configured_critical = max(template.bayaan_stock_critical_qty or 0.0, 0.0)
        configured_max = max(template.bayaan_stock_max_qty or 0.0, 0.0)
        target_qty = configured_target
        target_source = "configured" if target_qty else "unconfigured"
        if not target_qty:
            target_qty = max(configured_reorder * 2, configured_critical * 4, configured_max, 0.0)
            if target_qty:
                target_source = "derived"
        reorder_qty = configured_reorder or (target_qty * 0.5 if target_qty else 0.0)
        critical_qty = configured_critical or (reorder_qty * 0.5 if reorder_qty else 0.0)
        max_qty = max(configured_max, target_qty)
        priority_weight = max(template.bayaan_stock_priority_weight or 1.0, 0.1)
        stock_percent = 0.0
        if target_qty:
            stock_percent = max(0.0, min(100.0, (actual_qty / target_qty) * 100.0))
        status = "ok"
        if target_qty <= 0:
            status = "unconfigured"
        elif actual_qty <= 0:
            status = "empty"
        elif critical_qty and actual_qty <= critical_qty:
            status = "critical"
        elif reorder_qty and actual_qty <= reorder_qty:
            status = "low"
        elif max_qty and actual_qty > max_qty:
            status = "over_target"
        return {
            "target_qty": round(target_qty, 3),
            "reorder_qty": round(reorder_qty, 3),
            "critical_qty": round(critical_qty, 3),
            "max_qty": round(max_qty, 3),
            "priority_weight": round(priority_weight, 3),
            "stock_percent": round(stock_percent, 1),
            "status": status,
            "target_source": target_source,
        }

    def _hour_value(self, value, default=0.0):
        if value in (None, ""):
            return default
        if isinstance(value, str) and ":" in value:
            hours, minutes = value.split(":", 1)
            return float(hours) + (float(minutes) / 60.0)
        return self._float_value(value, default)

    def _report_datetime(self, value, default, end_of_day=False):
        if value in (None, ""):
            return default
        text = str(value)
        if len(text) <= 10 and "T" not in text and ":" not in text:
            date_value = fields.Date.to_date(text)
            local_dt = datetime.combine(date_value, time.min) + (timedelta(days=1) if end_of_day else timedelta())
            try:
                timezone = pytz.timezone(request.env.user.tz or "UTC")
            except pytz.UnknownTimeZoneError:
                timezone = pytz.UTC
            return timezone.localize(local_dt).astimezone(pytz.UTC).replace(tzinfo=None)
        return fields.Datetime.to_datetime(text)

    def _hr_week_window(self, payload=None):
        payload = payload or {}
        today = fields.Date.context_today(request.env.user)
        date_from = payload.get("date_from") or payload.get("dateFrom")
        date_to = payload.get("date_to") or payload.get("dateTo")
        if date_from:
            date_from = fields.Date.to_date(date_from)
        else:
            date_from = today - timedelta(days=today.weekday())
        if date_to:
            date_to = fields.Date.to_date(date_to)
        else:
            date_to = date_from + timedelta(days=int(payload.get("days") or 7) - 1)
        if date_to < date_from:
            raise UserError("HR schedule date_to must be on or after date_from.")
        return date_from, date_to

    def _unique_product_code(self, code, name):
        base = (code or name or "ITEM").strip()
        candidate = "".join(ch if ch.isalnum() else "-" for ch in base.upper()).strip("-") or "ITEM"
        candidate = candidate[:48]
        Product = request.env["product.product"].sudo()
        if not Product.search([("default_code", "=", candidate)], limit=1):
            return candidate
        index = 2
        while Product.search([("default_code", "=", "%s-%s" % (candidate[:42], index))], limit=1):
            index += 1
        return "%s-%s" % (candidate[:42], index)

    def _serialize_stock_item(self, product):
        plan = self._product_stock_plan(product, product.qty_available)
        image = product.product_tmpl_id.image_128
        image_base64 = image.decode() if isinstance(image, bytes) else (image or "")
        return {
            "id": product.id,
            "name": product.display_name,
            "default_code": product.default_code,
            "barcode": product.barcode,
            "category": product.categ_id.display_name,
            "uom": product.uom_id.name,
            "standard_price": product.standard_price,
            "list_price": product.lst_price,
            "available_in_pos": product.available_in_pos,
            "image_128": image_base64,
            "image_data_url": "data:image/webp;base64,%s" % image_base64 if image_base64 else "",
            "consumption_mode": product.product_tmpl_id.bayaan_consumption_mode,
            "pos_options": product.product_tmpl_id.bayaan_pos_options_dict(),
            "qty_available": product.qty_available,
            "target_qty": plan["target_qty"],
            "reorder_qty": plan["reorder_qty"],
            "critical_qty": plan["critical_qty"],
            "max_qty": plan["max_qty"],
            "stock_priority_weight": plan["priority_weight"],
        }

    def _product_image_value(self, payload):
        image = (
            payload.get("image_1920")
            or payload.get("image1920")
            or payload.get("image_base64")
            or payload.get("imageBase64")
        )
        if not image:
            return False if payload.get("clear_image") or payload.get("clearImage") else None
        if not isinstance(image, str):
            raise UserError("Product image must be a base64 string.")
        image = image.strip()
        if image.startswith("data:"):
            if "," not in image:
                raise UserError("Product image data URL is malformed.")
            header, image = image.split(",", 1)
            if not header.lower().startswith("data:image/"):
                raise UserError("Product image must be an image data URL.")
        try:
            base64.b64decode(image, validate=True)
        except binascii.Error as exc:
            raise UserError("Product image must be valid base64.") from exc
        return image

    def _pos_options_value(self, payload):
        """Normalize per-product POS options (sizes + modifier groups) into a JSON
        string for product.template.bayaan_pos_options. Returns None when the caller
        supplied nothing (so the stored value is left unchanged on update)."""
        import json
        raw = payload.get("pos_options")
        if raw is None:
            raw = payload.get("posOptions")
        sizes_in = payload.get("sizes")
        groups_in = payload.get("modifier_groups")
        if groups_in is None:
            groups_in = payload.get("modifierGroups")
        if raw is None and sizes_in is None and groups_in is None:
            return None
        if isinstance(raw, str):
            try:
                raw = json.loads(raw) if raw.strip() else {}
            except (ValueError, TypeError) as exc:
                raise UserError("pos_options must be a JSON object.") from exc
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise UserError("pos_options must be a JSON object.")
        sizes = sizes_in if sizes_in is not None else raw.get("sizes")
        groups = groups_in if groups_in is not None else (raw.get("modifier_groups") or raw.get("modifierGroups"))
        return json.dumps(self._normalize_pos_options(sizes, groups), ensure_ascii=False)

    def _normalize_pos_options(self, sizes, groups):
        def _label(value):
            if isinstance(value, dict):
                en = str(value.get("en") or "").strip()
                ar = str(value.get("ar") or "").strip()
                return {"en": en or ar, "ar": ar or en}
            text = str(value or "").strip()
            return {"en": text, "ar": text}

        def _slug(value):
            base = "".join(ch if ch.isalnum() else "-" for ch in str(value or "").lower()).strip("-")
            return base or "opt"

        out_sizes = []
        if isinstance(sizes, list):
            for size in sizes:
                token = str(size).strip()
                if token and token not in out_sizes:
                    out_sizes.append(token)

        out_groups = []
        if isinstance(groups, list):
            for group in groups:
                if not isinstance(group, dict):
                    continue
                name = _label(group.get("name") or group.get("label"))
                if not name["en"]:
                    continue
                selection = "multi" if str(group.get("selection") or "single").lower() == "multi" else "single"
                values = []
                seen = set()
                for value in (group.get("values") or group.get("options") or []):
                    if not isinstance(value, dict):
                        value = {"name": value}
                    vname = _label(value.get("name") or value.get("label"))
                    if not vname["en"]:
                        continue
                    vid = _slug(value.get("id") or vname["en"])
                    if vid in seen:
                        continue
                    seen.add(vid)
                    entry = {"id": vid, "name": vname}
                    price_delta = value.get("priceDelta", value.get("price_delta"))
                    if price_delta not in (None, ""):
                        try:
                            entry["priceDelta"] = int(round(float(price_delta)))
                        except (ValueError, TypeError):
                            pass
                    recipe_factor = value.get("recipeFactor", value.get("recipe_factor"))
                    if recipe_factor not in (None, ""):
                        try:
                            entry["recipeFactor"] = float(recipe_factor)
                        except (ValueError, TypeError):
                            pass
                    if value.get("default"):
                        entry["default"] = True
                    values.append(entry)
                if not values:
                    continue
                out_groups.append({
                    "id": _slug(group.get("id") or name["en"]),
                    "name": name,
                    "selection": selection,
                    "required": bool(group.get("required")),
                    "values": values,
                })
        return {"sizes": out_sizes, "modifier_groups": out_groups}

    def _serialize_supplier_partner(self, partner, spend30=0.0, last_order="-"):
        return {
            "id": partner.id,
            "name": partner.name,
            "category": partner.bayaan_supplier_category or "Supplier",
            "address": partner.street or partner.contact_address or "",
            "deliveryCategory": partner.bayaan_delivery_category or "Review",
            "spend30": spend30,
            "lastOrder": last_order,
            "status": "good",
        }

    def _serialize_recurring_purchase(self, plan):
        lines = [{
            "product": line.product_id.default_code or line.product_id.display_name,
            "qty": line.qty,
            "uom": line.uom_id.name,
            "priceUnit": line.price_unit,
        } for line in plan.line_ids]
        return {
            "id": plan.id,
            "name": plan.name,
            "supplier": plan.partner_id.name,
            "warehouse": plan.warehouse_id.name,
            "frequency": plan.frequency,
            "weekday": plan.weekday,
            "nextDate": fields.Date.to_string(plan.next_date),
            "active": plan.active,
            "lines": lines,
            "items": lines,
        }

    def _serialize_hr_snapshot(self):
        company = request.env.company
        Employee = request.env["bayaan.employee"].sudo()
        Attendance = request.env["bayaan.attendance"].sudo()
        Adjustment = request.env["bayaan.payroll.adjustment"].sudo()
        PayrollRun = request.env["bayaan.payroll.run"].sudo()
        Expense = request.env["bayaan.operating.expense"].sudo()
        today = fields.Date.context_today(request.env.user)
        month_start = today.replace(day=1)
        employees = Employee.search([("company_id", "=", company.id)], order="name", limit=500)
        attendance = Attendance.search([
            ("company_id", "=", company.id),
            ("check_in", ">=", datetime.combine(month_start, time.min)),
        ], order="check_in desc, id desc", limit=500)
        adjustments = Adjustment.search([
            ("company_id", "=", company.id),
            ("date", ">=", month_start),
        ], order="date desc, id desc", limit=500)
        payroll_runs = PayrollRun.search([("company_id", "=", company.id)], order="date_from desc, id desc", limit=24)
        expenses = Expense.search([
            ("company_id", "=", company.id),
            ("date", ">=", month_start),
        ], order="date desc, id desc", limit=500)
        approved_adjustments = adjustments.filtered(lambda adjustment: adjustment.state == "approved")
        payroll_base = sum(employees.mapped("monthly_salary"))
        payroll_adjustment_impact = (
            sum(approved_adjustments.filtered(lambda adj: adj.type == "bonus").mapped("amount"))
            - sum(approved_adjustments.filtered(lambda adj: adj.type in ("deduction", "advance", "cash_shortage")).mapped("amount"))
        )
        latest_payroll_run = payroll_runs[:1]
        payroll_accrued = (
            latest_payroll_run.total_net
            if latest_payroll_run and latest_payroll_run.state in ("review", "approved", "paid")
            else max(payroll_base + payroll_adjustment_impact, 0.0)
        )
        return {
            "engine": "odoo_pos",
            "employees": [self._serialize_employee(employee) for employee in employees],
            "attendance": [{
                "id": row.id,
                "employee": row.employee_id.name,
                "kiosk": row.kiosk_id.kiosk_code,
                "checkIn": self._bayaan_local_datetime(row.check_in),
                "checkOut": self._bayaan_local_datetime(row.check_out),
                "workedHours": row.worked_hours,
                "note": row.note,
            } for row in attendance],
            "adjustments": [self._serialize_payroll_adjustment(adjustment) for adjustment in adjustments],
            "payrollRuns": [self._serialize_payroll_run(run) for run in payroll_runs],
            "expenses": [self._serialize_operating_expense(expense) for expense in expenses],
            "summary": {
                "payrollAccrued": payroll_accrued,
                "payrollBase": payroll_base,
                "payrollAdjustmentImpact": payroll_adjustment_impact,
                "operatingExpenses": sum(expenses.mapped("amount")),
            },
        }

    def _attach_purchase_invoice(self, order, payload):
        invoice_ref = (payload.get("invoice_ref") or payload.get("invoiceRef") or "").strip()
        invoice_name = (payload.get("invoice_name") or payload.get("invoiceName") or "").strip()
        invoice_file = payload.get("invoice_file") or payload.get("invoiceFile") or payload.get("invoiceFileBase64")
        invoice_mimetype = payload.get("invoice_mimetype") or payload.get("invoiceMimeType")
        attachment = False

        if invoice_ref:
            order.partner_ref = invoice_ref

        if invoice_file and invoice_name:
            attachment = request.env["ir.attachment"].sudo().create({
                "name": invoice_name,
                "res_model": "purchase.order",
                "res_id": order.id,
                "datas": invoice_file,
                "mimetype": invoice_mimetype or "application/octet-stream",
            })

        if invoice_ref or attachment:
            body = "Bayaan invoice uploaded."
            if invoice_ref:
                body += " Vendor reference: %s" % invoice_ref
            order.message_post(
                body=body,
                attachment_ids=attachment.ids if attachment else [],
            )

    def _payment_gateway_catalog(self):
        return serialize_payment_gateway_catalog()

    def _payment_gateway_info(self, payment_method=None, method_name=None):
        method = payment_method if payment_method and payment_method.exists() else None
        return classify_payment_gateway(
            method_name=method_name or (method.name if method else None),
            configured_provider=method.bayaan_gateway_provider if method else None,
            payment_method_type=method.payment_method_type if method else None,
            method_type=method.type if method else None,
        )

    def _payment_token(self, value):
        return "".join(ch for ch in (value or "").lower() if ch.isalnum())

    def _payment_method_tokens(self, method):
        gateway = self._payment_gateway_info(method)
        provider = BAYAAN_PAYMENT_GATEWAY_BY_ID.get(
            method.bayaan_gateway_provider or gateway.get("id")
        )
        values = [
            method.name,
            method.bayaan_gateway_provider,
            gateway.get("id"),
            gateway.get("label"),
            gateway.get("category"),
        ]
        if provider:
            values.extend(provider.get("aliases", ()))
        if method.is_cash_count or method.type == "cash":
            values.append("cash")
        return {self._payment_token(value) for value in values if value}

    def _require_payment_provider(self, provider):
        provider = self._payment_token(provider)
        provider_map = {
            self._payment_token(key): key
            for key in BAYAAN_PAYMENT_GATEWAY_BY_ID
        }
        provider_id = provider_map.get(provider)
        if not provider_id:
            raise UserError("Unsupported payment provider: %s" % (provider or "empty value"))
        if provider_id == "cash":
            raise UserError("Cash does not use a payment gateway transaction.")
        return provider_id

    def _payment_provider_credentials_missing(self, provider):
        ICP = request.env["ir.config_parameter"].sudo()
        if provider == "fib":
            keys = ("bayaan.payment.fib.client_id", "bayaan.payment.fib.client_secret")
        elif provider == "zain_cash":
            keys = (
                "bayaan.payment.zain_cash.client_id",
                "bayaan.payment.zain_cash.client_secret",
                "bayaan.payment.zain_cash.api_key",
                "bayaan.payment.zain_cash.service_type",
            )
        else:
            keys = ("bayaan.payment.%s.enabled" % provider,)
        return [key for key in keys if not ICP.get_param(key)]

    def _payment_callback_base_url(self, provider, transaction):
        base = request.httprequest.url_root.rstrip("/")
        return "%s/bayaan/payment/webhook/%s?secret=%s" % (
            base,
            provider,
            transaction.callback_secret,
        )

    def _mock_payment_provider_payload(self, provider, transaction):
        callback_url = self._payment_callback_base_url(provider, transaction)
        if provider == "fib":
            return {
                "paymentId": transaction.provider_transaction_id,
                "readableCode": "FIB-%s" % transaction.external_reference[-8:].upper(),
                "qrCode": "mock:fib:%s" % transaction.external_reference,
                "validUntil": fields.Datetime.to_string(datetime.now() + timedelta(minutes=15)),
                "personalAppLink": "https://fib.iq/mock/pay/%s" % transaction.provider_transaction_id,
                "businessAppLink": "https://fib.iq/mock/business/%s" % transaction.provider_transaction_id,
                "corporateAppLink": "https://fib.iq/mock/corporate/%s" % transaction.provider_transaction_id,
                "statusCallbackUrl": callback_url,
            }
        if provider == "zain_cash":
            return {
                "transactionId": transaction.provider_transaction_id,
                "redirectUrl": "https://docs.zaincash.iq/mock/pay/%s" % transaction.provider_transaction_id,
                "externalReferenceId": transaction.external_reference,
                "notificationUrl": callback_url,
            }
        return {
            "transactionId": transaction.provider_transaction_id,
            "statusCallbackUrl": callback_url,
        }

    def _payment_provider_transaction_id(self, provider, external_reference):
        return "%s-%s" % (provider.replace("_", "-"), external_reference)

    def _serialize_payment_transaction(self, transaction, expose_callback_secret=False):
        gateway = BAYAAN_PAYMENT_GATEWAY_BY_ID.get(transaction.provider, {})
        result = {
            "id": transaction.id,
            "name": transaction.name,
            "provider": transaction.provider,
            "providerLabel": gateway.get("label", transaction.provider),
            "externalReference": transaction.external_reference,
            "providerTransactionId": transaction.provider_transaction_id,
            "providerStatus": transaction.provider_status,
            "status": transaction.status,
            "amount": transaction.amount,
            "currency": transaction.currency_id.name,
            "kiosk": transaction.kiosk_id.kiosk_code,
            "posOrder": transaction.pos_order_id.name,
            "posPaymentId": transaction.pos_payment_id.id,
            "paymentMethod": transaction.payment_method_id.name,
            "redirectUrl": transaction.redirect_url,
            "qrCode": transaction.qr_code,
            "readableCode": transaction.readable_code,
            "latestPayload": transaction.latest_payload_json or {},
            "eventCount": len(transaction.event_ids),
        }
        if expose_callback_secret:
            result["mockWebhookSecret"] = transaction.callback_secret
            result["mockWebhookUrl"] = self._payment_callback_base_url(transaction.provider, transaction)
        return result

    def _serialize_employee(self, employee):
        return {
            "id": employee.id,
            "name": employee.name,
            "role": employee.role,
            "kiosk": employee.kiosk_id.kiosk_code,
            "kioskName": employee.kiosk_id.name,
            "odooEmployeeId": employee.hr_employee_id.id,
            "odooEmployee": employee.hr_employee_id.name,
            "monthlySalary": employee.monthly_salary,
            "expectedMonthlyHours": employee.expected_monthly_hours,
            "hourlyRate": employee.hourly_rate,
            "currency": employee.currency_id.name,
            "active": employee.active,
        }

    def _serialize_hr_attendance(self, attendance):
        return {
            "id": attendance.id,
            "employeeId": attendance.employee_id.id,
            "employee": attendance.employee_id.name,
            "kiosk": attendance.kiosk_id.kiosk_code,
            "kioskName": attendance.kiosk_id.name,
            "workedHours": attendance.worked_hours,
            "checkIn": self._bayaan_local_datetime(attendance.check_in),
            "checkOut": self._bayaan_local_datetime(attendance.check_out),
            "odooAttendanceId": attendance.hr_attendance_id.id,
        }

    def _serialize_operating_expense(self, expense):
        return {
            "id": expense.id,
            "name": expense.name,
            "category": expense.category,
            "amount": expense.amount,
            "date": fields.Date.to_string(expense.date),
            "note": expense.note or "",
        }

    def _serialize_hr_shift(self, shift):
        return {
            "id": shift.id,
            "employeeId": shift.employee_id.id,
            "employee": shift.employee_id.name,
            "odooEmployeeId": shift.hr_employee_id.id,
            "kiosk": shift.kiosk_id.kiosk_code,
            "kioskName": shift.kiosk_id.name,
            "date": fields.Date.to_string(shift.date),
            "role": shift.role,
            "startHour": shift.start_hour,
            "endHour": shift.end_hour,
            "plannedHours": shift.planned_hours,
            "state": shift.state,
            "note": shift.note,
        }

    def _serialize_coverage_rule(self, rule):
        return {
            "id": rule.id,
            "kiosk": rule.kiosk_id.kiosk_code,
            "kioskName": rule.kiosk_id.name,
            "dayOfWeek": rule.dayofweek,
            "role": rule.role,
            "startHour": rule.start_hour,
            "endHour": rule.end_hour,
            "requiredCount": rule.required_count,
            "active": rule.active,
        }

    def _serialize_coverage_gap(self, rule, date_value, assigned_shifts):
        assigned = [
            {
                "shiftId": shift.id,
                "employeeId": shift.employee_id.id,
                "employee": shift.employee_id.name,
                "role": shift.role,
                "startHour": shift.start_hour,
                "endHour": shift.end_hour,
            }
            for shift in assigned_shifts
        ]
        missing_count = max(rule.required_count - len(assigned), 0)
        return {
            "ruleId": rule.id,
            "date": fields.Date.to_string(date_value),
            "dayOfWeek": rule.dayofweek,
            "kiosk": rule.kiosk_id.kiosk_code,
            "kioskName": rule.kiosk_id.name,
            "role": rule.role,
            "startHour": rule.start_hour,
            "endHour": rule.end_hour,
            "requiredCount": rule.required_count,
            "assignedCount": len(assigned),
            "missingCount": missing_count,
            "assigned": assigned,
            "severity": "critical" if missing_count >= rule.required_count else "warning",
        }

    def _serialize_payroll_adjustment(self, adjustment):
        return {
            "id": adjustment.id,
            "employee": adjustment.employee_id.name,
            "kiosk": adjustment.kiosk_id.kiosk_code,
            "date": fields.Date.to_string(adjustment.date),
            "type": adjustment.type,
            "amount": adjustment.amount,
            "reason": adjustment.reason,
            "state": adjustment.state,
            "approvedBy": adjustment.approved_by_id.name,
            "approvedAt": self._bayaan_local_datetime(adjustment.approved_at),
        }

    def _ensure_payroll_adjustment_period_open(self, adjustment_date):
        locked_run = request.env["bayaan.payroll.run"].sudo().search([
            ("company_id", "=", request.env.company.id),
            ("date_from", "<=", adjustment_date),
            ("date_to", ">=", adjustment_date),
            ("state", "in", ["approved", "paid"]),
        ], limit=1)
        if locked_run:
            raise UserError(
                "Payroll period is already approved or paid; create an adjustment for the next payroll run."
            )

    def _serialize_payroll_run(self, payroll_run):
        return {
            "id": payroll_run.id,
            "name": payroll_run.name,
            "dateFrom": fields.Date.to_string(payroll_run.date_from),
            "dateTo": fields.Date.to_string(payroll_run.date_to),
            "state": payroll_run.state,
            "currency": payroll_run.currency_id.name,
            "totals": {
                "base": payroll_run.total_base,
                "overtime": payroll_run.total_overtime,
                "bonus": payroll_run.total_bonus,
                "deductions": payroll_run.total_deductions,
                "net": payroll_run.total_net,
            },
            "lines": [{
                "id": line.id,
                "employee": line.employee_id.name,
                "kiosk": line.kiosk_id.kiosk_code,
                "workedHours": line.worked_hours,
                "expectedHours": line.expected_hours,
                "overtimeHours": line.overtime_hours,
                "baseSalary": line.base_salary,
                "overtimeAmount": line.overtime_amount,
                "bonusAmount": line.bonus_amount,
                "deductionAmount": line.deduction_amount,
                "advanceAmount": line.advance_amount,
                "cashShortageAmount": line.cash_shortage_amount,
                "netPay": line.net_pay,
            } for line in payroll_run.line_ids],
        }

    def _http_payload(self):
        request_obj = request.httprequest
        data = {}
        if request_obj.data:
            try:
                data = json.loads(request_obj.data.decode("utf-8"))
            except Exception:
                data = {}
        if not isinstance(data, dict):
            data = {}
        data.update(request_obj.form.to_dict())
        data.update(request_obj.args.to_dict())
        return data

    def _warehouse_code(self, value, fallback="BAY"):
        code = "".join(ch for ch in (value or fallback).upper() if ch.isalnum())[:5]
        return code or fallback

    def _unique_warehouse_code(self, value):
        Warehouse = request.env["stock.warehouse"].sudo()
        base = self._warehouse_code(value)
        for index in range(100):
            code = base if index == 0 else ("%s%s" % (base[: max(1, 5 - len(str(index)))], index))[:5]
            if not Warehouse.search_count([("code", "=", code), ("company_id", "=", request.env.company.id)]):
                return code
        raise UserError("Could not generate a unique warehouse code for %s." % value)

    def _warehouse(self, value=None):
        Warehouse = request.env["stock.warehouse"].sudo()
        domain = [("company_id", "=", request.env.company.id)]
        if not value:
            return Warehouse.search(domain, limit=1)
        if isinstance(value, int):
            warehouse = Warehouse.browse(value)
            return warehouse if warehouse.exists() and warehouse.company_id == request.env.company else Warehouse.browse()
        return Warehouse.search(domain + ["|", ("code", "=", value), ("name", "=", value)], limit=1)

    def _purchase_order(self, value):
        Purchase = request.env["purchase.order"].sudo()
        if not value:
            raise UserError("Purchase order reference is required.")
        if isinstance(value, int) or str(value).isdigit():
            order = Purchase.browse(int(value))
        else:
            order = Purchase.search([("name", "=", str(value))], limit=1)
        if not order.exists() or order.company_id != request.env.company:
            raise UserError("Purchase order not found: %s" % value)
        return order

    def _picking(self, value):
        Picking = request.env["stock.picking"].sudo()
        if not value:
            raise UserError("Stock transfer reference is required.")
        if isinstance(value, int) or str(value).isdigit():
            picking = Picking.browse(int(value))
        else:
            picking = Picking.search([("name", "=", str(value))], limit=1)
        if not picking.exists() or picking.company_id != request.env.company:
            raise UserError("Stock transfer not found: %s" % value)
        return picking

    def _employee(self, value):
        Employee = request.env["bayaan.employee"].sudo()
        if not value:
            raise UserError("Employee reference is required.")
        if isinstance(value, int) or str(value).isdigit():
            employee = Employee.browse(int(value))
        else:
            employee = Employee.search([("name", "=", str(value))], limit=1)
        if not employee.exists() or employee.company_id != request.env.company:
            raise UserError("Employee not found: %s" % value)
        return employee

    def _hr_schedule_snapshot(self, payload=None):
        payload = payload or {}
        date_from, date_to = self._hr_week_window(payload)
        company = request.env.company
        Kiosk = request.env["bayaan.kiosk"].sudo()
        Employee = request.env["bayaan.employee"].sudo()
        Attendance = request.env["bayaan.attendance"].sudo()
        CoverageRule = request.env["bayaan.staffing.coverage.rule"].sudo()
        ShiftPlan = request.env["bayaan.shift.plan"].sudo()

        kiosk_domain = [
            ("active", "=", True),
            ("company_id", "=", company.id),
        ]
        if payload.get("kiosk"):
            kiosk_domain += [("kiosk_code", "=", payload.get("kiosk"))]
        if not self._is_chain_read_user():
            user = request.env.user
            kiosk_domain += [
                "|", "|",
                ("manager_user_id", "=", user.id),
                ("supervisor_user_id", "=", user.id),
                ("cashier_user_ids", "in", [user.id]),
            ]

        kiosks = Kiosk.search(kiosk_domain, order="kiosk_code", limit=500)
        kiosk_ids = kiosks.ids or [0]
        employee_domain = [
            ("company_id", "=", company.id),
            "|",
            ("kiosk_id", "=", False),
            ("kiosk_id", "in", kiosk_ids),
        ]
        if not self._is_chain_read_user():
            employee_domain = [
                ("company_id", "=", company.id),
                ("kiosk_id", "in", kiosk_ids),
            ]
        shift_domain = [
            ("company_id", "=", company.id),
            ("date", ">=", date_from),
            ("date", "<=", date_to),
            ("kiosk_id", "in", kiosk_ids),
        ]
        coverage_domain = [
            ("company_id", "=", company.id),
            ("active", "=", True),
            ("kiosk_id", "in", kiosk_ids),
        ]
        attendance_domain = [
            ("company_id", "=", company.id),
            ("check_in", ">=", datetime.combine(date_from, time.min)),
            ("check_in", "<=", datetime.combine(date_to, time.max)),
            "|",
            ("kiosk_id", "=", False),
            ("kiosk_id", "in", kiosk_ids),
        ]

        employees = Employee.search(employee_domain, order="name", limit=500)
        shifts = ShiftPlan.search(shift_domain, order="date, start_hour, kiosk_id, employee_id", limit=1000)
        coverage_rules = CoverageRule.search(coverage_domain, order="kiosk_id, dayofweek, start_hour, role", limit=1000)
        attendance = Attendance.search(attendance_domain, order="check_in desc, id desc", limit=1000)
        coverage_gaps = []
        span_days = (date_to - date_from).days + 1
        for day_index in range(span_days):
            date_value = date_from + timedelta(days=day_index)
            dayofweek = str(date_value.weekday())
            for rule in coverage_rules.filtered(lambda item: item.dayofweek == dayofweek):
                assigned_shifts = shifts.filtered(lambda shift, rule=rule, date_value=date_value: (
                    shift.state != "cancelled"
                    and shift.date == date_value
                    and shift.kiosk_id == rule.kiosk_id
                    and shift.start_hour < rule.end_hour
                    and shift.end_hour > rule.start_hour
                    and (rule.role == "any" or shift.role == rule.role)
                ))
                if len(assigned_shifts) < rule.required_count:
                    coverage_gaps.append(self._serialize_coverage_gap(rule, date_value, assigned_shifts))

        return {
            "dateFrom": fields.Date.to_string(date_from),
            "dateTo": fields.Date.to_string(date_to),
            "employees": [self._serialize_employee(employee) for employee in employees],
            "coverageRules": [self._serialize_coverage_rule(rule) for rule in coverage_rules],
            "shifts": [self._serialize_hr_shift(shift) for shift in shifts],
            "attendance": [self._serialize_hr_attendance(row) for row in attendance],
            "coverageGaps": coverage_gaps,
            "summary": {
                "employeeCount": len(employees),
                "plannedShiftCount": len(shifts.filtered(lambda shift: shift.state != "cancelled")),
                "plannedHours": sum(shifts.filtered(lambda shift: shift.state != "cancelled").mapped("planned_hours")),
                "coverageGapCount": len(coverage_gaps),
                "missingPeople": sum(gap["missingCount"] for gap in coverage_gaps),
            },
        }

    def _picking_lines_from_payload(self, items):
        quantities_by_product = {}
        for line in items or []:
            product = self._require_product(line.get("item") or line.get("itemId") or line.get("product"))
            qty = self._float_value(
                line.get("received_qty")
                if line.get("received_qty") is not None
                else line.get("receivedQty") if line.get("receivedQty") is not None
                else line.get("qty") if line.get("qty") is not None
                else line.get("quantity") if line.get("quantity") is not None
                else line.get("done_qty") if line.get("done_qty") is not None
                else line.get("doneQty"),
                0.0,
            )
            if qty < 0:
                raise UserError("Received quantity cannot be negative for %s." % product.display_name)
            quantities_by_product[product.id] = quantities_by_product.get(product.id, 0.0) + qty
        return quantities_by_product

    def _picking_discrepancy_inputs(self, items):
        lines_by_product = {}
        for line in items or []:
            product = self._require_product(line.get("item") or line.get("itemId") or line.get("product"))
            received_qty = self._float_value(
                line.get("received_qty")
                if line.get("received_qty") is not None
                else line.get("receivedQty") if line.get("receivedQty") is not None
                else line.get("qty") if line.get("qty") is not None
                else line.get("quantity") if line.get("quantity") is not None
                else line.get("done_qty") if line.get("done_qty") is not None
                else line.get("doneQty"),
                0.0,
            )
            damaged_qty = self._float_value(
                line.get("damaged_qty")
                if line.get("damaged_qty") is not None
                else line.get("damagedQty"),
                0.0,
            )
            if received_qty < 0 or damaged_qty < 0:
                raise UserError("Received and damaged quantities cannot be negative for %s." % product.display_name)
            row = lines_by_product.setdefault(product.id, {
                "received_qty": 0.0,
                "damaged_qty": 0.0,
                "notes": [],
            })
            row["received_qty"] += received_qty
            row["damaged_qty"] += damaged_qty
            note = line.get("note") or line.get("discrepancy_note") or line.get("discrepancyNote")
            if note:
                row["notes"].append(str(note))
        return lines_by_product

    def _prepare_picking_done_quantities(self, picking, quantities_by_product=None):
        picking.ensure_one()
        if picking.state == "cancel":
            raise UserError("Cannot process a cancelled transfer: %s" % picking.name)
        if picking.state == "done":
            return picking
        if picking.state == "draft":
            picking.action_confirm()
        picking.action_assign()

        remaining = dict(quantities_by_product or {})
        partial = quantities_by_product is not None
        active_moves = picking.move_ids.filtered(lambda move: move.state not in ("done", "cancel"))
        for move in active_moves:
            if partial:
                qty = min(remaining.get(move.product_id.id, 0.0), move.product_uom_qty)
                remaining[move.product_id.id] = max(remaining.get(move.product_id.id, 0.0) - qty, 0.0)
            else:
                qty = move.product_uom_qty
            move._set_quantity_done(qty)
            move.picked = bool(qty)

        unknown_qty = {
            product_id: qty
            for product_id, qty in remaining.items()
            if float_compare(qty, 0.0, precision_rounding=request.env["product.product"].browse(product_id).uom_id.rounding) > 0
        }
        if unknown_qty:
            names = request.env["product.product"].sudo().browse(list(unknown_qty)).mapped("display_name")
            raise UserError("Received quantities exceed open transfer demand for: %s" % ", ".join(names))
        return picking

    def _validate_picking(self, picking, items=None):
        quantities = self._picking_lines_from_payload(items) if items else None
        expected_by_product, uom_by_product = self._picking_expected_quantities(picking) if items else ({}, {})
        self._prepare_picking_done_quantities(picking, quantities)
        if picking.state == "done":
            self._record_picking_discrepancies(picking, items, expected_by_product, uom_by_product)
            return picking
        validation_context = {"skip_backorder": True}
        if items:
            validation_context["picking_ids_not_to_backorder"] = picking.ids
        result = picking.with_context(**validation_context).button_validate()
        if isinstance(result, dict):
            raise UserError("Odoo returned a validation wizard for %s; complete it in Odoo." % picking.name)
        picking.invalidate_recordset()
        self._record_picking_discrepancies(picking, items, expected_by_product, uom_by_product)
        return picking

    def _picking_expected_quantities(self, picking):
        expected_by_product = {}
        uom_by_product = {}
        for move in picking.move_ids.filtered(lambda move: move.state != "cancel"):
            product = move.product_id
            expected_by_product[product.id] = expected_by_product.get(product.id, 0.0) + move.product_uom_qty
            uom_by_product[product.id] = move.product_uom
        return expected_by_product, uom_by_product

    def _record_picking_discrepancies(self, picking, items=None, expected_by_product=None, uom_by_product=None):
        picking.ensure_one()
        picking.bayaan_discrepancy_line_ids.unlink()
        if not items:
            return

        inputs = self._picking_discrepancy_inputs(items)
        expected_by_product = expected_by_product or {}
        uom_by_product = uom_by_product or {}
        if not expected_by_product:
            expected_by_product, uom_by_product = self._picking_expected_quantities(picking)

        line_commands = []
        product_ids = set(expected_by_product) | set(inputs)
        for product_id in product_ids:
            product = request.env["product.product"].sudo().browse(product_id)
            uom = uom_by_product.get(product_id) or product.uom_id
            expected_qty = expected_by_product.get(product_id, 0.0)
            received_qty = inputs.get(product_id, {}).get("received_qty", 0.0)
            damaged_qty = inputs.get(product_id, {}).get("damaged_qty", 0.0)
            note = "; ".join(inputs.get(product_id, {}).get("notes", []))
            shortage_qty = max(expected_qty - received_qty - damaged_qty, 0.0)
            has_shortage = float_compare(shortage_qty, 0.0, precision_rounding=uom.rounding) > 0
            has_damage = float_compare(damaged_qty, 0.0, precision_rounding=uom.rounding) > 0
            if has_shortage or has_damage or note:
                line_commands.append((0, 0, {
                    "product_id": product_id,
                    "uom_id": uom.id,
                    "expected_qty": expected_qty,
                    "received_qty": received_qty,
                    "damaged_qty": damaged_qty,
                    "note": note,
                }))
        if line_commands:
            picking.write({"bayaan_discrepancy_line_ids": line_commands})

    def _serialize_picking_action(self, picking):
        picking.ensure_one()
        return {
            "id": picking.id,
            "name": picking.name,
            "origin": picking.origin or "",
            "state": picking.state,
            "bayaan_state": picking.bayaan_transfer_state,
            "from": picking.location_id.complete_name,
            "to": picking.location_dest_id.complete_name,
            "lines": [{
                "product": move.product_id.default_code or move.product_id.display_name,
                "qty": move.product_uom_qty,
                "doneQty": move.quantity,
                "uom": move.product_uom.name,
                "state": move.state,
            } for move in picking.move_ids],
            "discrepancies": [{
                "product": line.product_id.default_code or line.product_id.display_name,
                "expectedQty": line.expected_qty,
                "receivedQty": line.received_qty,
                "damagedQty": line.damaged_qty,
                "shortageQty": line.shortage_qty,
                "uom": line.uom_id.name,
                "note": line.note or "",
            } for line in picking.bayaan_discrepancy_line_ids],
        }

    def _serialize_warehouse_setup(self, created=None):
        company = request.env.company
        Warehouse = request.env["stock.warehouse"].sudo()
        Location = request.env["stock.location"].sudo()
        Quant = request.env["stock.quant"].sudo()
        Kiosk = request.env["bayaan.kiosk"].sudo()
        PosConfig = request.env["pos.config"].sudo()

        warehouses = Warehouse.search([("company_id", "=", company.id)], order="sequence,id")
        warehouse_location_ids = warehouses.mapped("view_location_id").ids
        locations = Location.search([
            ("usage", "=", "internal"),
            ("company_id", "in", [False, company.id]),
            ("id", "child_of", warehouse_location_ids or [0]),
        ], order="complete_name", limit=500)
        kiosks = Kiosk.search([("company_id", "=", company.id)], order="kiosk_code")
        pos_configs = PosConfig.search([("company_id", "=", company.id)], order="name", limit=500)

        quant_by_location = {
            location.id: {
                "quantity": quantity,
                "reserved_quantity": reserved_quantity,
            }
            for location, quantity, reserved_quantity in Quant._read_group(
                [("location_id", "in", locations.ids)],
                ["location_id"],
                ["quantity:sum", "reserved_quantity:sum"],
            )
            if location
        }
        kiosk_location_ids = set(kiosks.mapped("stock_location_id").ids)
        central_location_ids = set(warehouses.mapped("lot_stock_id").ids)

        return {
            "engine": "odoo_pos",
            "company": {"id": company.id, "name": company.name},
            "payment_gateways": self._payment_gateway_catalog(),
            "warehouses": [{
                "id": warehouse.id,
                "name": warehouse.name,
                "code": warehouse.code,
                "stock_location_id": warehouse.lot_stock_id.id,
                "stock_location": warehouse.lot_stock_id.complete_name,
                "view_location_id": warehouse.view_location_id.id,
                "receipt_type_id": warehouse.in_type_id.id,
                "internal_type_id": warehouse.int_type_id.id,
                "pos_type_id": warehouse.pos_type_id.id,
            } for warehouse in warehouses],
            "locations": [{
                "id": location.id,
                "name": location.name,
                "complete_name": location.complete_name,
                "parent_id": location.location_id.id,
                "warehouse_id": location.warehouse_id.id,
                "usage": location.usage,
                "kind": "central" if location.id in central_location_ids else "kiosk" if location.id in kiosk_location_ids else "internal",
                "quantity": quant_by_location.get(location.id, {}).get("quantity", 0.0),
                "reserved_quantity": quant_by_location.get(location.id, {}).get("reserved_quantity", 0.0),
            } for location in locations],
            "kiosks": [{
                "id": kiosk.id,
                "name": kiosk.name,
                "kiosk_code": kiosk.kiosk_code,
                "active": kiosk.active,
                "city": kiosk.city,
                "area": kiosk.area,
                "stock_location_id": kiosk.stock_location_id.id,
                "stock_location": kiosk.stock_location_id.complete_name,
                "pos_config_id": kiosk.pos_config_id.id,
                "pos_config": kiosk.pos_config_id.name,
                "picking_type_id": kiosk.pos_config_id.picking_type_id.id,
                "picking_type": kiosk.pos_config_id.picking_type_id.display_name,
                "stock_deduction_policy": kiosk.stock_deduction_policy,
            } for kiosk in kiosks],
            "pos_configs": [{
                "id": config.id,
                "name": config.name,
                "picking_type_id": config.picking_type_id.id,
                "picking_type": config.picking_type_id.display_name,
                "source_location_id": config.picking_type_id.default_location_src_id.id,
                "source_location": config.picking_type_id.default_location_src_id.complete_name,
                "active": config.active,
                "payment_methods": [{
                    "id": method.id,
                    "name": method.name,
                    "provider": self._payment_gateway_info(method),
                    "external_id": method.bayaan_gateway_external_id,
                    "settlement_window": method.bayaan_gateway_settlement_window,
                } for method in config.payment_method_ids],
            } for config in pos_configs],
            "created": created or {},
        }

    def _ai_plan_templates(self):
        return {
            "executive-summary": {
                "dataPacks": ["overview", "sales", "kiosks", "finance", "reports"],
                "components": [
                    {"componentId": "overview.kpi_panel", "size": "wide", "mode": "read-only", "dataBinding": "overview", "title": "Today command metrics"},
                    {"componentId": "overview.top_performers_rank", "size": "medium", "mode": "read-only", "dataBinding": "kiosks", "title": "Top performers"},
                    {"componentId": "overview.alerts", "size": "medium", "mode": "read-only", "dataBinding": "overview", "title": "Signals needing attention"},
                    {"componentId": "overview.ai_summary", "size": "wide", "mode": "read-only", "dataBinding": "reports", "title": "Traceable summary"},
                ],
                "sourceRefsRequired": ["pos.order", "pos.payment", "bayaan.consumption.ledger", "bayaan.shift.close", "report.pack"],
                "explanationStyle": "brief",
            },
            "kiosk-diagnosis": {
                "dataPacks": ["kiosks", "sales", "inventory", "closing"],
                "components": [
                    {"componentId": "canvas.headline", "size": "wide", "mode": "read-only", "dataBinding": "kiosks", "title": "Kiosk diagnosis"},
                    {"componentId": "canvas.stack", "size": "wide", "mode": "read-only", "dataBinding": "sales", "title": "Variance breakdown"},
                    {"componentId": "canvas.hourly", "size": "full", "mode": "read-only", "dataBinding": "sales", "title": "Hourly pattern"},
                    {"componentId": "inventory.studio_stock_needs_panel", "size": "medium", "mode": "proposal-only", "dataBinding": "inventory", "title": "Stock proof"},
                ],
                "sourceRefsRequired": ["pos.order", "stock.quant", "bayaan.shift.close", "bayaan.waste.entry"],
                "explanationStyle": "diagnostic",
            },
            "waste-anomaly-review": {
                "dataPacks": ["waste", "closing", "sales"],
                "components": [
                    {"componentId": "canvas.wastegrid", "size": "wide", "mode": "read-only", "dataBinding": "waste", "title": "Waste heatmap"},
                    {"componentId": "waste.reason_bar_chart", "size": "wide", "mode": "read-only", "dataBinding": "waste", "title": "Reason control"},
                    {"componentId": "waste.entries_flag_table", "size": "full", "mode": "read-only", "dataBinding": "waste", "title": "Flagged entries"},
                    {"componentId": "canvas.actions", "size": "medium", "mode": "proposal-only", "dataBinding": "waste", "title": "Recommended next steps"},
                ],
                "sourceRefsRequired": ["bayaan.waste.entry", "bayaan.shift.close", "pos.order"],
                "explanationStyle": "diagnostic",
            },
            "stock-allocation": {
                "dataPacks": ["inventory", "warehouses", "items"],
                "components": [
                    {"componentId": "inventory.studio_health_donut", "size": "medium", "mode": "read-only", "dataBinding": "inventory", "title": "Inventory health"},
                    {"componentId": "inventory.studio_stock_needs_panel", "size": "wide", "mode": "proposal-only", "dataBinding": "inventory", "title": "Kiosk live stock needs"},
                    {"componentId": "inventory.studio_transfers_panel", "size": "wide", "mode": "proposal-only", "dataBinding": "inventory", "title": "Transfer queue"},
                    {"componentId": "canvas.actions", "size": "medium", "mode": "proposal-only", "dataBinding": "inventory", "title": "Proposal only"},
                ],
                "sourceRefsRequired": ["stock.quant", "stock.location", "stock.picking", "bayaan.kiosk"],
                "explanationStyle": "diagnostic",
            },
            "close-review": {
                "dataPacks": ["closing", "waste", "inventory", "products", "staff"],
                "components": [
                    {"componentId": "closing.today_closes_table", "size": "full", "mode": "read-only", "dataBinding": "closing", "title": "Closes needing review"},
                    {"componentId": "closing.variance_inputs_expanded", "size": "full", "mode": "read-only", "dataBinding": "closing", "title": "Variance inputs"},
                    {"componentId": "closing.recipe_posting_review", "size": "wide", "mode": "read-only", "dataBinding": "products", "title": "Recipe posting blockers"},
                    {"componentId": "staff.cashier_performance_table", "size": "wide", "mode": "read-only", "dataBinding": "staff", "title": "Cashier overlap"},
                ],
                "sourceRefsRequired": ["bayaan.shift.close", "bayaan.shift.close.line", "pos.session", "bayaan.consumption.ledger"],
                "explanationStyle": "audit",
            },
            "recipe-margin-review": {
                "dataPacks": ["products", "suppliers", "sales", "finance"],
                "components": [
                    {"componentId": "products.recipe_margin_table", "size": "full", "mode": "read-only", "dataBinding": "products", "title": "Recipe margin proof"},
                    {"componentId": "suppliers.item_catalog_table", "size": "wide", "mode": "read-only", "dataBinding": "suppliers", "title": "Supplier cost driver"},
                    {"componentId": "canvas.bars", "size": "medium", "mode": "read-only", "dataBinding": "sales", "title": "Trend comparison"},
                    {"componentId": "reports.pnl_table", "size": "wide", "mode": "read-only", "dataBinding": "finance", "title": "P&L impact"},
                ],
                "sourceRefsRequired": ["product.template", "bayaan.recipe", "purchase.order", "report.pack"],
                "explanationStyle": "diagnostic",
            },
            "payment-reconciliation": {
                "dataPacks": ["sales", "finance", "reports"],
                "components": [
                    {"componentId": "sales.payment_split", "size": "medium", "mode": "read-only", "dataBinding": "sales", "title": "Payment split"},
                    {"componentId": "reports.payment_methods_table", "size": "medium", "mode": "read-only", "dataBinding": "reports", "title": "Payment methods"},
                    {"componentId": "reports.gateway_settlement_table", "size": "wide", "mode": "read-only", "dataBinding": "finance", "title": "Gateway settlement"},
                    {"componentId": "sales.live_orders_table", "size": "full", "mode": "read-only", "dataBinding": "sales", "title": "Order-level proof"},
                ],
                "sourceRefsRequired": ["pos.order", "pos.payment", "account.move", "report.pack"],
                "explanationStyle": "audit",
            },
            "staff-coaching": {
                "dataPacks": ["staff", "closing", "sales"],
                "components": [
                    {"componentId": "staff.cashier_performance_table", "size": "full", "mode": "read-only", "dataBinding": "staff", "title": "Cashier performance"},
                    {"componentId": "closing.today_closes_table", "size": "wide", "mode": "read-only", "dataBinding": "closing", "title": "Close variance overlap"},
                    {"componentId": "canvas.rank", "size": "medium", "mode": "read-only", "dataBinding": "staff", "title": "Peer comparison"},
                ],
                "sourceRefsRequired": ["hr.employee", "hr.attendance", "pos.order", "bayaan.shift.close"],
                "explanationStyle": "diagnostic",
            },
            "warehouse-topology": {
                "dataPacks": ["warehouses", "inventory"],
                "components": [
                    {"componentId": "warehouses.realtime_card", "size": "wide", "mode": "read-only", "dataBinding": "warehouses", "title": "Stock source cards"},
                    {"componentId": "warehouses.topology_table", "size": "full", "mode": "read-only", "dataBinding": "warehouses", "title": "Topology table"},
                    {"componentId": "inventory.studio_transfers_panel", "size": "wide", "mode": "proposal-only", "dataBinding": "inventory", "title": "Transfer queue"},
                ],
                "sourceRefsRequired": ["stock.location", "stock.quant", "bayaan.kiosk", "stock.picking"],
                "explanationStyle": "audit",
            },
            "catalog-lookup": {
                "dataPacks": ["items", "products", "inventory"],
                "components": [
                    {"componentId": "items.catalog_table", "size": "full", "mode": "read-only", "dataBinding": "items", "title": "Stock item catalog"},
                    {"componentId": "products.product_list_table", "size": "full", "mode": "read-only", "dataBinding": "products", "title": "Menu product catalog"},
                    {"componentId": "inventory.studio_ledger_table", "size": "wide", "mode": "read-only", "dataBinding": "inventory", "title": "Inventory ledger"},
                ],
                "sourceRefsRequired": ["product.template", "stock.quant", "stock.location"],
                "explanationStyle": "brief",
            },
        }

    def _ai_infer_intent(self, query):
        text = " ".join((query or "").lower().split())
        checks = [
            ("close-review", ("close", "closing", "variance", "approve", "approval", "counted", "expected", "drawer", "إغلاق", "اغلاق", "فرق", "فروقات", "اعتماد", "معدود", "متوقع", "درج")),
            ("waste-anomaly-review", ("waste", "loss", "spoil", "spoiled", "anomaly", "anomalies", "tossed", "هدر", "خسارة", "شذوذ", "تالف")),
            ("catalog-lookup", ("catalog", "uom", "ingredient", "ingredients", "menu", "كتالوج", "صنف", "أصناف", "مكون", "مكونات", "قائمة")),
            ("stock-allocation", ("transfer", "allocate", "allocation", "stock", "inventory", "reorder", "runout", "cover", "تحويل", "مخزون", "إرسال", "ارسال", "أرسل", "ارسل", "نرسل", "تزويد", "نفاد", "تغطية")),
            ("recipe-margin-review", ("recipe", "margin", "product", "profitability", "pistachio", "price", "supplier cost", "وصفة", "هامش", "منتج", "ربحية", "فستق", "سعر", "تكلفة المورد")),
            ("staff-coaching", ("cashier", "staff", "employee", "coach", "training", "payroll", "shortage", "كاشير", "موظف", "موظفين", "تدريب", "رواتب", "عجز")),
            ("payment-reconciliation", ("payment", "cash", "card", "online", "electronic", "e-payment", "epayment", "gateway", "settlement", "fib", "zain", "qi", "wallet", "دفع", "مدفوعات", "نقد", "بطاقة", "بوابة", "تسوية", "محفظة", "زين")),
            ("warehouse-topology", ("warehouse", "topology", "location", "source", "reserved", "مستودع", "موقع", "مصدر", "محجوز", "هيكل")),
            ("kiosk-diagnosis", ("kiosk", "zayouna", "mansour", "karrada", "majidi", "behind", "underperform", "why", "كشك", "زيونة", "زايونة", "منصور", "كرادة", "مجيدي", "متأخر", "متاخر", "لماذا", "ليش")),
        ]
        for intent, terms in checks:
            if any(term in text for term in terms):
                return intent
        return "executive-summary"

    def _ai_scope(self, query, payload):
        text = " ".join((query or "").lower().split())
        payload_scope = payload.get("scope") if isinstance(payload.get("scope"), dict) else {}
        time_range = "today"
        if any(term in text for term in ("month", "monthly", "april", "شهر", "شهري", "أبريل", "ابريل")):
            time_range = "month"
        elif any(term in text for term in ("week", "weekly", "7 day", "7-day", "أسبوع", "اسبوع", "أسبوعي", "اسبوعي")):
            time_range = "week"
        kiosk_id = payload.get("kioskId") or payload.get("kiosk_id") or payload_scope.get("kioskId") or payload_scope.get("kiosk_id")
        if not kiosk_id:
            import re
            match = re.search(r"\bK-?\d{1,3}\b", query or "", re.IGNORECASE)
            if match:
                kiosk_id = match.group(0).upper().replace("K", "K-", 1) if "-" not in match.group(0) else match.group(0).upper()
        return {
            "kioskId": kiosk_id or False,
            "sectionId": payload.get("sectionId") or payload.get("section_id") or payload_scope.get("sectionId") or payload_scope.get("section_id") or "insights",
            "timeRange": payload.get("timeRange") or payload.get("time_range") or payload_scope.get("timeRange") or payload_scope.get("time_range") or time_range,
        }

    def _ai_template_plan(self, query, payload):
        templates = self._ai_plan_templates()
        intent = self._ai_infer_intent(query)
        template = templates[intent]
        return {
            "intent": intent,
            "query": query,
            "scope": self._ai_scope(query, payload),
            "requiredDataPacks": template["dataPacks"],
            "components": template["components"],
            "sourceRefsRequired": template["sourceRefsRequired"],
            "explanationStyle": template["explanationStyle"],
        }

    def _ai_answer_mode(self, query, plan):
        text = " ".join((query or "").lower().split())
        if not text:
            return "analysis"
        greetings = {
            "hi", "hello", "hey", "yo", "salam", "salaam", "مرحبا", "هلا", "السلام عليكم",
        }
        if text in greetings or any(text.startswith("%s " % greeting) for greeting in greetings):
            return "conversation"
        operational_terms = (
            "today", "happened", "sales", "orders", "cash", "payment", "stock", "inventory",
            "waste", "close", "closing", "variance", "kiosk", "warehouse", "recipe", "margin",
            "staff", "cashier", "supplier", "purchase", "transfer", "report", "profit", "loss",
            "approve", "create", "record", "odoo", "bayaan",
        )
        if plan.get("intent") == "executive-summary" and not any(term in text for term in operational_terms):
            return "conversation"
        return "analysis"

    def _ai_compact_report_pack(self, query, payload):
        bootstrap = self.chain_bootstrap()
        summary = bootstrap.get("summary", {})
        today = bootstrap.get("today", {})
        source_counts = summary.get("sourceCounts", {})
        rows = {
            "orders": (today.get("orders") or [])[:80],
            "payments": (today.get("payments") or [])[:80],
            "sales": (today.get("sales") or [])[:80],
            "consumption": (today.get("consumption") or [])[:80],
            "waste": (today.get("waste") or [])[:80],
            "closings": (bootstrap.get("closings") or [])[:80],
            "stock": (bootstrap.get("kiosk_stock_rows") or [])[:120],
            "transfers": (bootstrap.get("transfers") or [])[:50],
            "suggestedTransfers": (bootstrap.get("suggested_transfers") or [])[:25],
            "products": (bootstrap.get("products") or [])[:80],
            "recipes": (bootstrap.get("recipes") or [])[:60],
            "purchaseOrders": (bootstrap.get("purchase_orders") or [])[:50],
            "staff": ((bootstrap.get("hr") or {}).get("employees") or [])[:80],
        }
        row_sources = {
            "bayaan.kiosk": bootstrap.get("kiosks") or [],
            "pos.order": rows["orders"],
            "pos.payment": rows["payments"],
            "bayaan.consumption.ledger": rows["consumption"],
            "bayaan.waste.entry": rows["waste"],
            "bayaan.shift.close": rows["closings"],
            "bayaan.shift.close.line": [
                line
                for close in rows["closings"]
                for line in close.get("stock", []) or []
            ],
            "stock.quant": rows["stock"],
            "stock.location": bootstrap.get("kiosks") or [],
            "stock.picking": rows["transfers"],
            "product.template": rows["products"],
            "bayaan.recipe": rows["recipes"],
            "purchase.order": rows["purchaseOrders"],
            "hr.employee": rows["staff"],
            "hr.attendance": (bootstrap.get("hr") or {}).get("attendance") or [],
        }
        source_models = {
            "bayaan.kiosk": source_counts.get("kiosks", len(bootstrap.get("kiosks") or [])),
            "pos.order": source_counts.get("orders", len(rows["orders"])),
            "pos.payment": source_counts.get("payments", len(rows["payments"])),
            "bayaan.consumption.ledger": source_counts.get("consumptionRows", len(rows["consumption"])),
            "bayaan.waste.entry": source_counts.get("wasteRows", len(rows["waste"])),
            "bayaan.shift.close": source_counts.get("closingRows", len(rows["closings"])),
            "bayaan.shift.close.line": len(row_sources["bayaan.shift.close.line"]),
            "stock.quant": source_counts.get("stockRows", len(rows["stock"])),
            "stock.location": len(row_sources["stock.location"]),
            "stock.picking": source_counts.get("transferRows", len(rows["transfers"])),
            "product.template": source_counts.get("products", len(rows["products"])),
            "bayaan.recipe": source_counts.get("recipes", len(rows["recipes"])),
            "purchase.order": source_counts.get("purchaseOrders", len(rows["purchaseOrders"])),
            "hr.employee": source_counts.get("hrEmployeeRows", len(rows["staff"])),
            "hr.attendance": source_counts.get("hrAttendanceRows", len(row_sources["hr.attendance"])),
            "pos.session": source_counts.get("orders", len(rows["orders"])),
            "account.move": source_counts.get("accountMoveRows", 0),
            "report.pack": 1 if summary.get("reportPeriods") else 0,
        }
        source_evidence = [{
            "model": model,
            "rowCount": int(count or 0),
            "filter": "company/current user scope, %s" % self._ai_scope(query, payload).get("timeRange", "today"),
            "generatedAt": (bootstrap.get("meta") or {}).get("generated_at") or fields.Datetime.to_string(fields.Datetime.now()),
            "sampleRefs": self._ai_source_sample_refs(row_sources.get(model, [])),
        } for model, count in source_models.items()]
        return {
            "engine": "odoo_pos",
            "query": query,
            "scope": self._ai_scope(query, payload),
            "generatedAt": (bootstrap.get("meta") or {}).get("generated_at") or fields.Datetime.to_string(fields.Datetime.now()),
            "limits": {
                "orders": 80,
                "payments": 80,
                "stock": 120,
                "otherRows": 80,
                "rawPosOrderPagination": False,
            },
            "metrics": {
                "totals": summary.get("totals", {}),
                "payments": summary.get("payments", {}),
                "alerts": summary.get("alerts", {}),
                "sourceCounts": source_counts,
                "byKiosk": (summary.get("byKiosk") or [])[:25],
                "reportPeriods": summary.get("reportPeriods", {}),
            },
            "rows": rows,
            "sourceEvidence": source_evidence,
        }

    def _ai_source_sample_refs(self, rows):
        refs = []
        for row in (rows or [])[:5]:
            if not isinstance(row, dict):
                continue
            for key in ("id", "name", "order", "kiosk", "kiosk_code", "item", "product", "ingredient"):
                value = row.get(key)
                if value not in (None, "", False):
                    text = str(value)
                    if text not in refs:
                        refs.append(text)
                    break
        return refs

    def _ai_provider_config(self):
        ICP = request.env["ir.config_parameter"].sudo()
        provider = (ICP.get_param("bayaan.ai.provider") or os.environ.get("BAYAAN_AI_PROVIDER") or "openai").strip().lower()
        model = (
            ICP.get_param("bayaan.ai.openai.model")
            or os.environ.get("BAYAAN_AI_OPENAI_MODEL")
            or os.environ.get("OPENAI_MODEL")
            or "gpt-5.4-mini"
        ).strip()
        reasoning_model = (
            ICP.get_param("bayaan.ai.openai.reasoning_model")
            or os.environ.get("BAYAAN_AI_OPENAI_REASONING_MODEL")
            or "gpt-5.4"
        ).strip()
        reasoning_effort = (
            ICP.get_param("bayaan.ai.openai.reasoning_effort")
            or os.environ.get("BAYAAN_AI_OPENAI_REASONING_EFFORT")
            or "high"
        ).strip().lower()
        api_key = (
            ICP.get_param("bayaan.ai.openai.api_key")
            or os.environ.get("BAYAAN_OPENAI_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or ""
        ).strip()
        return {
            "provider": provider,
            "model": model,
            "reasoning_model": reasoning_model,
            "reasoning_effort": reasoning_effort,
            "api_key": api_key,
            "configured": bool(api_key) and provider == "openai",
        }

    def _ai_parse_reasoning_pref(self, payload):
        """Manual override from the UI: True (force deep), False (force fast), or None (auto)."""
        raw = payload.get("reasoning")
        if raw is None:
            raw = payload.get("deepReasoning")
        if isinstance(raw, bool):
            return raw
        if raw is None:
            return None
        text = str(raw).strip().lower()
        if text in ("true", "1", "on", "deep", "yes"):
            return True
        if text in ("false", "0", "off", "fast", "no"):
            return False
        return None

    def _ai_reasoning_decision(self, plan, pref, query=""):
        """User-controlled: the deep-reasoning model runs only when the user
        explicitly selects it (Deep). No automatic escalation."""
        return pref is True

    def _ai_int_config(self, key, env_name, default):
        ICP = request.env["ir.config_parameter"].sudo()
        raw_value = ICP.get_param(key)
        if raw_value in (None, ""):
            raw_value = os.environ.get(env_name)
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            value = default
        return max(0, value)

    def _ai_feature_config(self):
        ICP = request.env["ir.config_parameter"].sudo()
        tier = (
            ICP.get_param("bayaan.ai.feature_tier")
            or os.environ.get("BAYAAN_AI_FEATURE_TIER")
            or "daily-only"
        ).strip().lower()
        allowed_time_ranges = {
            "alerts-only": ["today"],
            "daily-only": ["today"],
            "daily-weekly": ["today", "week"],
            "full-chat": ["today", "week", "month", "custom"],
        }
        allowed_intents = {
            "alerts-only": ["waste-anomaly-review", "close-review", "stock-allocation", "payment-reconciliation"],
            "daily-only": ["executive-summary", "kiosk-diagnosis", "waste-anomaly-review", "stock-allocation", "close-review", "recipe-margin-review", "payment-reconciliation", "staff-coaching", "warehouse-topology", "catalog-lookup"],
            "daily-weekly": ["executive-summary", "kiosk-diagnosis", "waste-anomaly-review", "stock-allocation", "close-review", "recipe-margin-review", "payment-reconciliation", "staff-coaching", "warehouse-topology", "catalog-lookup"],
            "full-chat": ["executive-summary", "kiosk-diagnosis", "waste-anomaly-review", "stock-allocation", "close-review", "recipe-margin-review", "payment-reconciliation", "staff-coaching", "warehouse-topology", "catalog-lookup"],
        }
        if tier not in allowed_time_ranges:
            tier = "daily-only"
        return {
            "tier": tier,
            "allowedTimeRanges": allowed_time_ranges[tier],
            "allowedIntents": allowed_intents[tier],
            "tokenBudgetRequired": True,
        }

    def _ai_usage_period(self):
        today = fields.Date.context_today(request.env.user)
        return "%04d-%02d" % (today.year, today.month)

    def _ai_usage_key(self, period=None):
        return "bayaan.ai.usage.%s" % (period or self._ai_usage_period())

    def _ai_read_usage(self, period=None):
        ICP = request.env["ir.config_parameter"].sudo()
        try:
            usage = json.loads(ICP.get_param(self._ai_usage_key(period)) or "{}")
        except ValueError:
            usage = {}
        return {
            "input_tokens": int(usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("output_tokens") or 0),
            "total_tokens": int(usage.get("total_tokens") or 0),
            "requests": int(usage.get("requests") or 0),
        }

    def _ai_estimate_request_tokens(self, query, report_pack, plan):
        packed = json.dumps({
            "query": query,
            "draftPlan": plan,
            "reportPack": report_pack,
        }, ensure_ascii=False, default=str)
        return max(1, len(packed) // 4) + 1400

    def _ai_budget_payload(self, period, monthly_budget, usage, estimated_request_tokens=0):
        total_tokens = int((usage or {}).get("total_tokens") or 0)
        remaining = False if monthly_budget <= 0 else max(0, monthly_budget - total_tokens)
        status = "unlimited" if monthly_budget <= 0 else "exhausted" if remaining <= 0 else "within_budget"
        return {
            "period": period,
            "monthlyTokenBudget": monthly_budget,
            "usedTokens": total_tokens,
            "inputTokens": int((usage or {}).get("input_tokens") or 0),
            "outputTokens": int((usage or {}).get("output_tokens") or 0),
            "requests": int((usage or {}).get("requests") or 0),
            "remainingTokens": remaining,
            "estimatedRequestTokens": estimated_request_tokens,
            "status": status,
        }

    def _ai_budget_snapshot(self, estimated_request_tokens=0):
        budget = self._ai_int_config("bayaan.ai.monthly_token_budget", "BAYAAN_AI_MONTHLY_TOKEN_BUDGET", 100000)
        period = self._ai_usage_period()
        usage = self._ai_read_usage(period)
        return self._ai_budget_payload(period, budget, usage, estimated_request_tokens)

    def _ai_record_usage(self, usage, estimated_request_tokens):
        ICP = request.env["ir.config_parameter"].sudo()
        period = self._ai_usage_period()
        current = self._ai_read_usage(period)
        input_tokens = int((usage or {}).get("input_tokens") or 0)
        output_tokens = int((usage or {}).get("output_tokens") or 0)
        total_tokens = int((usage or {}).get("total_tokens") or input_tokens + output_tokens or estimated_request_tokens)
        current["input_tokens"] += input_tokens
        current["output_tokens"] += output_tokens
        current["total_tokens"] += total_tokens
        current["requests"] += 1
        ICP.set_param(self._ai_usage_key(period), json.dumps(current, sort_keys=True))
        return self._ai_budget_snapshot()

    def _ai_record_usage_from_registry(self, registry, user_id, context, period, monthly_budget, usage, estimated_request_tokens):
        with registry.cursor() as cr:
            env = api.Environment(cr, user_id or SUPERUSER_ID, context or {})
            ICP = env["ir.config_parameter"].sudo()
            try:
                current = json.loads(ICP.get_param(self._ai_usage_key(period)) or "{}")
            except ValueError:
                current = {}
            current = {
                "input_tokens": int(current.get("input_tokens") or 0),
                "output_tokens": int(current.get("output_tokens") or 0),
                "total_tokens": int(current.get("total_tokens") or 0),
                "requests": int(current.get("requests") or 0),
            }
            input_tokens = int((usage or {}).get("input_tokens") or 0)
            output_tokens = int((usage or {}).get("output_tokens") or 0)
            total_tokens = int((usage or {}).get("total_tokens") or input_tokens + output_tokens or estimated_request_tokens)
            current["input_tokens"] += input_tokens
            current["output_tokens"] += output_tokens
            current["total_tokens"] += total_tokens
            current["requests"] += 1
            ICP.set_param(self._ai_usage_key(period), json.dumps(current, sort_keys=True))
            cr.commit()
            return self._ai_budget_payload(period, monthly_budget, current, estimated_request_tokens)

    def _ai_provider_guard(self, query, report_pack, plan):
        feature = self._ai_feature_config()
        estimate = self._ai_estimate_request_tokens(query, report_pack, plan)
        budget = self._ai_budget_snapshot(estimate)
        answer_mode = self._ai_answer_mode(query, plan)
        scope = plan.get("scope") or {}
        time_range = scope.get("timeRange") or "today"
        if time_range not in feature["allowedTimeRanges"] or plan.get("intent") not in feature["allowedIntents"]:
            provider_config = self._ai_provider_config()
            return {
                "status": "tier_limited",
                "provider": provider_config["provider"],
                "model": provider_config["model"],
                "plan": plan,
                "answerMode": answer_mode,
                "featureTier": feature,
                "budget": budget,
                "claims": self._ai_deterministic_claims(report_pack, plan),
                "visualizations": [],
                "explanation": "This tenant's AI feature tier allows %s time ranges for %s intents. Bayaan did not ask the model for an answer or visualization." % (
                    ", ".join(feature["allowedTimeRanges"]),
                    feature["tier"],
                ),
            }
        if budget["monthlyTokenBudget"] > 0 and budget["remainingTokens"] is not False and estimate > budget["remainingTokens"]:
            provider_config = self._ai_provider_config()
            return {
                "status": "budget_exhausted",
                "provider": provider_config["provider"],
                "model": provider_config["model"],
                "plan": plan,
                "answerMode": answer_mode,
                "featureTier": feature,
                "budget": budget,
                "claims": self._ai_deterministic_claims(report_pack, plan),
                "visualizations": [],
                "explanation": "The tenant AI token budget is exhausted or too low for this request. Bayaan did not ask the model for an answer or visualization.",
            }
        return None

    def _ai_visualization_types(self):
        return (
            "metric-card",
            "metric-grid",
            "bar-chart",
            "pie-chart",
            "table",
            "rank-list",
            "callout",
            "timeline",
            "proposal-list",
        )

    def _ai_openai_schema(self):
        templates = self._ai_plan_templates()
        component_ids = sorted({
            component["componentId"]
            for template in templates.values()
            for component in template["components"]
        })
        data_pack_ids = sorted({
            pack
            for template in templates.values()
            for pack in template["dataPacks"]
        })
        source_refs = sorted({
            ref
            for template in templates.values()
            for ref in template["sourceRefsRequired"]
        })
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["intent", "scope", "requiredDataPacks", "components", "sourceRefsRequired", "explanationStyle", "summary", "claims", "visualizations"],
            "properties": {
                "intent": {"type": "string", "enum": sorted(templates.keys())},
                "scope": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["kioskId", "sectionId", "timeRange"],
                    "properties": {
                        "kioskId": {"type": "string"},
                        "sectionId": {"type": "string"},
                        "timeRange": {"type": "string", "enum": ["today", "week", "month", "custom"]},
                    },
                },
                "requiredDataPacks": {
                    "type": "array",
                    "items": {"type": "string", "enum": data_pack_ids},
                },
                "components": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["componentId", "size", "mode", "dataBinding", "title"],
                        "properties": {
                            "componentId": {"type": "string", "enum": component_ids},
                            "size": {"type": "string", "enum": ["small", "medium", "wide", "full"]},
                            "mode": {"type": "string", "enum": ["read-only", "proposal-only"]},
                            "dataBinding": {"type": "string", "enum": data_pack_ids},
                            "title": {"type": "string"},
                        },
                    },
                },
                "sourceRefsRequired": {
                    "type": "array",
                    "items": {"type": "string", "enum": source_refs},
                },
                "explanationStyle": {"type": "string", "enum": ["brief", "diagnostic", "audit"]},
                "summary": {"type": "string"},
                "claims": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["text", "numericValues", "sourceRefs"],
                        "properties": {
                            "text": {"type": "string"},
                            "numericValues": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["label", "value", "unit"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "unit": {"type": "string"},
                                    },
                                },
                            },
                            "sourceRefs": {
                                "type": "array",
                                "items": {"type": "string", "enum": source_refs},
                            },
                        },
                    },
                },
                "visualizations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["id", "type", "title", "reason", "series", "sourceRefs"],
                        "properties": {
                            "id": {"type": "string"},
                            "type": {"type": "string", "enum": list(self._ai_visualization_types())},
                            "title": {"type": "string"},
                            "reason": {"type": "string"},
                            "series": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["label", "value", "unit", "category"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "unit": {"type": "string"},
                                        "category": {"type": "string"},
                                    },
                                },
                            },
                            "sourceRefs": {
                                "type": "array",
                                "items": {"type": "string", "enum": source_refs},
                            },
                        },
                    },
                },
            },
        }

    def _ai_openai_stream_schema(self):
        schema = dict(self._ai_openai_schema())
        properties = schema.get("properties") or {}
        ordered_properties = {}
        if "summary" in properties:
            ordered_properties["summary"] = properties["summary"]
        for key, value in properties.items():
            if key != "summary":
                ordered_properties[key] = value
        required = schema.get("required") or []
        schema["required"] = ["summary"] + [key for key in required if key != "summary"]
        schema["properties"] = ordered_properties
        return schema

    def _ai_deterministic_claims(self, report_pack, plan):
        metrics = report_pack.get("metrics") or {}
        totals = metrics.get("totals") or {}
        alerts = metrics.get("alerts") or {}
        source_refs = set(plan.get("sourceRefsRequired") or [])
        claims = []

        def append(text, label, value, unit, refs):
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                return
            allowed_refs = [ref for ref in refs if ref in source_refs or ref == "report.pack"]
            if not allowed_refs:
                return
            claims.append({
                "text": text,
                "numericValues": [{
                    "label": label,
                    "value": numeric_value,
                    "unit": unit,
                }],
                "sourceRefs": allowed_refs,
            })

        append(
            "Sales today comes from the compact Bayaan/Odoo report pack.",
            "salesToday",
            totals.get("salesToday"),
            "currency",
            ["pos.order", "report.pack"],
        )
        append(
            "Order count is sourced from official POS orders.",
            "ordersToday",
            totals.get("ordersToday"),
            "orders",
            ["pos.order"],
        )
        append(
            "Unresolved variance alerts come from close and recipe posting evidence.",
            "unresolvedVariances",
            alerts.get("unresolvedVariances"),
            "alerts",
            ["bayaan.shift.close", "bayaan.consumption.ledger"],
        )
        append(
            "Low stock alerts come from scoped stock quant evidence.",
            "lowStockItems",
            alerts.get("lowStockItems"),
            "items",
            ["stock.quant"],
        )
        if not claims:
            evidence_count = sum(int(ref.get("rowCount") or 0) for ref in report_pack.get("sourceEvidence") or [])
            append(
                "The AI report pack was built from deterministic source evidence rows.",
                "sourceEvidenceRows",
                evidence_count,
                "rows",
                ["report.pack"],
            )
        return claims[:4]

    def _ai_validate_provider_claims(self, candidate_claims, report_pack, plan, fallback=True):
        allowed_refs = {ref.get("model") for ref in report_pack.get("sourceEvidence") or []}
        allowed_refs.update(plan.get("sourceRefsRequired") or [])
        claims = []
        for claim in candidate_claims or []:
            if not isinstance(claim, dict):
                continue
            numeric_values = []
            for numeric in claim.get("numericValues") or []:
                if not isinstance(numeric, dict):
                    continue
                try:
                    value = float(numeric.get("value"))
                except (TypeError, ValueError):
                    continue
                numeric_values.append({
                    "label": str(numeric.get("label") or "value")[:80],
                    "value": value,
                    "unit": str(numeric.get("unit") or "")[:32],
                })
            source_refs = [
                str(ref)
                for ref in claim.get("sourceRefs") or []
                if str(ref) in allowed_refs
            ]
            text = str(claim.get("text") or "").strip()
            if not text or (numeric_values and not source_refs):
                continue
            claims.append({
                "text": text[:280],
                "numericValues": numeric_values[:4],
                "sourceRefs": source_refs[:6],
            })
        if claims:
            return claims[:6]
        return self._ai_deterministic_claims(report_pack, plan) if fallback else []

    def _ai_validate_provider_visualizations(self, candidate_visualizations, report_pack):
        allowed_refs = {
            str(ref.get("model"))
            for ref in report_pack.get("sourceEvidence") or []
            if ref.get("model")
        }
        allowed_refs.add("report.pack")
        allowed_types = set(self._ai_visualization_types())
        visualizations = []
        for candidate in candidate_visualizations or []:
            if not isinstance(candidate, dict):
                continue
            visual_type = str(candidate.get("type") or "").strip()
            if visual_type not in allowed_types:
                continue
            title = str(candidate.get("title") or "").strip()
            reason = str(candidate.get("reason") or "").strip()
            if not title:
                continue
            source_refs = [
                str(ref)
                for ref in candidate.get("sourceRefs") or []
                if str(ref) in allowed_refs
            ]
            series = []
            for item in candidate.get("series") or []:
                if not isinstance(item, dict):
                    continue
                try:
                    value = float(item.get("value"))
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(value):
                    continue
                series.append({
                    "label": str(item.get("label") or "value")[:80],
                    "value": value,
                    "unit": str(item.get("unit") or "")[:32],
                    "category": str(item.get("category") or "")[:48],
                })
            if series and not source_refs:
                continue
            visualizations.append({
                "id": str(candidate.get("id") or "visual-%d" % (len(visualizations) + 1))[:80],
                "type": visual_type,
                "title": title[:120],
                "reason": reason[:220],
                "series": series[:12],
                "sourceRefs": source_refs[:6],
            })
        return visualizations[:4]

    def _ai_openai_output_text(self, response_json):
        if response_json.get("output_text"):
            return response_json["output_text"]
        chunks = []
        for item in response_json.get("output", []) or []:
            if item.get("type") != "message":
                continue
            for content in item.get("content", []) or []:
                if content.get("type") == "output_text":
                    chunks.append(content.get("text", ""))
        return "\n".join(chunk for chunk in chunks if chunk)

    def _ai_openai_instructions(self, language):
        return (
            "You are Bayaan's live conversational AI assistant for an F&B kiosk operating system. "
            "%s "
            "Answer the user's actual message first, like a helpful human assistant, not like a canned dashboard scene. "
            "For greetings, capability questions, or general non-operational questions, respond conversationally and do not force an executive operations brief unless the user asks for one. "
            "When answerMode is conversation, do not summarize operational metrics unless the user specifically asks for them. "
            "Official numbers come only from the supplied deterministic reportPack. "
            "For Bayaan operational questions, ground the answer in the supplied reportPack and cite numeric claims through the claims array. "
            "You, the model, author the visualizations array. Choose only visuals that directly help the user's question; return an empty visualizations array for greetings, capability questions, or when the reportPack does not contain enough evidence. "
            "Every visualization series value must be copied or derived directly from reportPack metrics or rows, and every numeric visualization must include matching sourceRefs from reportPack.sourceEvidence. "
            "The draftPlan and components are compatibility hints only; do not force a dashboard template when the user's question needs a different focused chart, table, ranking, or no visual at all. "
            "Return ONLY valid JSON. Do not create, approve, update, delete, or execute actions. "
            "If the user asks you to execute a business action, explain what you can prepare or inspect, but keep action-looking items in proposal-only mode. "
            "Do not make numeric claims unless they are traceable to reportPack.metrics, reportPack.rows, or reportPack.sourceEvidence. "
            "Keep action-looking items in proposal-only mode."
        ) % language["systemInstruction"]

    def _ai_openai_body(self, query, report_pack, plan, language, answer_mode, stream=False, model=None, reasoning_effort=None):
        body = {
            "model": model or self._ai_provider_config()["model"],
            "instructions": self._ai_openai_instructions(language),
            "input": json.dumps({
                "query": query,
                "locale": language["locale"],
                "responseLanguage": language["language"],
                "answerMode": answer_mode,
                "draftPlan": plan,
                "reportPack": report_pack,
                "outputContract": {
                    "intent": "string",
                    "scope": "object",
                    "requiredDataPacks": "array",
                    "components": "array",
                    "sourceRefsRequired": "array",
                    "explanationStyle": "brief|diagnostic|audit",
                    "claims": "array of numeric claims, each with sourceRefs from reportPack.sourceEvidence",
                    "visualizations": "model-authored array of focused visuals: metric-card, metric-grid, bar-chart, pie-chart, table, rank-list, callout, timeline, or proposal-list. Use empty array when no visual is useful or supported by source evidence.",
                    "summary": "natural assistant response in responseLanguage; for operations, ground it in sourceEvidence",
                },
            }, ensure_ascii=False, default=str),
            "max_output_tokens": 32000 if reasoning_effort else 2400,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "bayaan_ai_dashboard_plan",
                    "strict": True,
                    "schema": self._ai_openai_stream_schema() if stream else self._ai_openai_schema(),
                },
            },
        }
        if reasoning_effort:
            body["reasoning"] = {"effort": reasoning_effort}
        if stream:
            body["stream"] = True
        return body

    def _ai_language_contract(self, locale):
        normalized = str(locale or "en").lower()
        if normalized.startswith("ar"):
            return {
                "locale": "ar",
                "language": "Arabic",
                "systemInstruction": (
                    "Respond to the user in Arabic. Keep JSON keys, componentId values, source model names, "
                    "record IDs, currency codes, and technical identifiers in English exactly as provided. "
                    "The summary and claim text must be natural Arabic unless the user explicitly asks for another language."
                ),
            }
        return {
            "locale": "en",
            "language": "English",
            "systemInstruction": (
                "Respond to the user in English. Keep JSON keys, componentId values, source model names, "
                "record IDs, currency codes, and technical identifiers exactly as provided."
            ),
        }

    def _ai_call_openai(self, query, report_pack, plan, locale="en", reasoning_pref=None):
        guard_result = self._ai_provider_guard(query, report_pack, plan)
        if guard_result:
            return guard_result
        config = self._ai_provider_config()
        feature = self._ai_feature_config()
        estimate = self._ai_estimate_request_tokens(query, report_pack, plan)
        budget = self._ai_budget_snapshot(estimate)
        answer_mode = self._ai_answer_mode(query, plan)
        language = self._ai_language_contract(locale)
        if not config["configured"]:
            return {
                "status": "missing_credentials",
                "provider": config["provider"],
                "model": config["model"],
                "plan": plan,
                "answerMode": answer_mode,
                "locale": language["locale"],
                "featureTier": feature,
                "budget": budget,
                "claims": self._ai_deterministic_claims(report_pack, plan),
                "visualizations": [],
                "explanation": "Server-side AI provider credentials are not configured. The backend built a source-backed report pack, but no LLM-authored answer or visualization was made.",
            }
        use_reasoning = self._ai_reasoning_decision(plan, reasoning_pref, query)
        active_model = config["reasoning_model"] if use_reasoning else config["model"]
        active_effort = config["reasoning_effort"] if use_reasoning else None
        body = self._ai_openai_body(query, report_pack, plan, language, answer_mode, model=active_model, reasoning_effort=active_effort)
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": "Bearer %s" % config["api_key"],
                "Content-Type": "application/json",
            },
            json=body,
            timeout=300 if active_effort else 30,
        )
        response.raise_for_status()
        data = response.json()
        text = self._ai_openai_output_text(data)
        if not text:
            _logger.warning(
                "Bayaan AI empty output (model=%s reasoning=%s): status=%s incomplete=%s usage=%s",
                active_model, bool(active_effort), data.get("status"),
                data.get("incomplete_details"), data.get("usage"),
            )
        parsed = json.loads(text)
        merged_plan = self._ai_validate_provider_plan(parsed, plan)
        claims = self._ai_validate_provider_claims(parsed.get("claims"), report_pack, merged_plan, fallback=answer_mode != "conversation")
        visualizations = self._ai_validate_provider_visualizations(parsed.get("visualizations"), report_pack)
        final_budget = self._ai_record_usage(data.get("usage", {}), estimate)
        return {
            "status": "llm_called",
            "provider": config["provider"],
            "model": active_model,
            "reasoningUsed": use_reasoning,
            "responseId": data.get("id"),
            "requestId": response.headers.get("x-request-id"),
            "usage": data.get("usage", {}),
            "plan": merged_plan,
            "answerMode": answer_mode,
            "locale": language["locale"],
            "featureTier": feature,
            "budget": final_budget,
            "claims": claims,
            "visualizations": visualizations,
            "explanation": parsed.get("summary") or parsed.get("explanation") or "",
        }

    def _ai_validate_provider_plan(self, candidate, fallback_plan):
        if not isinstance(candidate, dict):
            return fallback_plan
        templates = self._ai_plan_templates()
        intent = candidate.get("intent") if candidate.get("intent") in templates else fallback_plan["intent"]
        template = templates[intent]
        allowed_components = {component["componentId"] for component in template["components"]}
        components = []
        for component in candidate.get("components") or []:
            if not isinstance(component, dict):
                continue
            if component.get("componentId") not in allowed_components:
                continue
            if component.get("mode") == "human-action":
                continue
            data_binding = component.get("dataBinding")
            if data_binding not in template["dataPacks"]:
                data_binding = template["dataPacks"][0]
            components.append({
                "componentId": component.get("componentId"),
                "size": component.get("size") if component.get("size") in ("small", "medium", "wide", "full") else "wide",
                "mode": component.get("mode") if component.get("mode") in ("read-only", "proposal-only") else "read-only",
                "dataBinding": data_binding,
                "title": str(component.get("title") or "")[:120],
            })
        scope = dict(fallback_plan["scope"])
        candidate_scope = candidate.get("scope")
        if isinstance(candidate_scope, dict):
            if candidate_scope.get("timeRange") in ("today", "week", "month", "custom"):
                scope["timeRange"] = candidate_scope.get("timeRange")
            if candidate_scope.get("sectionId"):
                scope["sectionId"] = str(candidate_scope.get("sectionId"))[:64]
            if candidate_scope.get("kioskId"):
                scope["kioskId"] = str(candidate_scope.get("kioskId"))[:64]
        return {
            "intent": intent,
            "query": fallback_plan["query"],
            "scope": scope,
            "requiredDataPacks": template["dataPacks"],
            "components": components or template["components"],
            "sourceRefsRequired": template["sourceRefsRequired"],
            "explanationStyle": candidate.get("explanationStyle") if candidate.get("explanationStyle") in ("brief", "diagnostic", "audit") else template["explanationStyle"],
        }

    def _ai_dashboard_response(self, query, locale, plan, report_pack, provider_result, audit=True, event_name="ai_dashboard_plan"):
        if audit:
            self._audit_event(
                "ai",
                event_name,
                "AI dashboard insight requested",
                detail=query[:240],
                severity="info",
                payload={
                    "query": query,
                    "provider": provider_result.get("provider"),
                    "model": provider_result.get("model"),
                    "status": provider_result.get("status"),
                    "answerMode": provider_result.get("answerMode"),
                    "intent": provider_result.get("plan", plan).get("intent"),
                    "featureTier": (provider_result.get("featureTier") or {}).get("tier"),
                    "budgetPeriod": (provider_result.get("budget") or {}).get("period"),
                    "claimCount": len(provider_result.get("claims") or []),
                },
            )
        return {
            "engine": "odoo_pos",
            "readonly": True,
            "query": query,
            "locale": provider_result.get("locale") or self._ai_language_contract(locale)["locale"],
            "plan": provider_result.get("plan", plan),
            "answerMode": provider_result.get("answerMode") or self._ai_answer_mode(query, provider_result.get("plan", plan)),
            "explanation": provider_result.get("explanation") or "",
            "llm": {
                "status": provider_result.get("status"),
                "provider": provider_result.get("provider"),
                "model": provider_result.get("model"),
                "reasoningUsed": provider_result.get("reasoningUsed", False),
                "responseId": provider_result.get("responseId"),
                "requestId": provider_result.get("requestId"),
                "usage": provider_result.get("usage", {}),
                "error": provider_result.get("error", ""),
            },
            "featureTier": provider_result.get("featureTier") or self._ai_feature_config(),
            "budget": provider_result.get("budget") or self._ai_budget_snapshot(),
            "claims": provider_result["claims"] if "claims" in provider_result else self._ai_deterministic_claims(report_pack, provider_result.get("plan", plan)),
            "visualizations": provider_result.get("visualizations") or [],
            "reportPack": report_pack,
            "sourceEvidence": report_pack["sourceEvidence"],
        }

    def _ai_sse(self, event, payload):
        message = (
            "event: %s\n"
            "data: %s\n\n"
        ) % (event, json.dumps(payload, ensure_ascii=False, default=str))
        return message.encode("utf-8")

    def _ai_json_string_field_delta(self, json_text, field, emitted_length):
        marker = '"%s"' % field
        marker_index = json_text.find(marker)
        if marker_index < 0:
            return "", emitted_length
        colon_index = json_text.find(":", marker_index + len(marker))
        if colon_index < 0:
            return "", emitted_length
        quote_index = json_text.find('"', colon_index + 1)
        if quote_index < 0:
            return "", emitted_length
        decoded = []
        index = quote_index + 1
        escape_map = {
            '"': '"',
            "\\": "\\",
            "/": "/",
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
        }
        while index < len(json_text):
            char = json_text[index]
            if char == '"':
                break
            if char == "\\":
                index += 1
                if index >= len(json_text):
                    break
                escaped = json_text[index]
                if escaped == "u":
                    sequence = json_text[index + 1:index + 5]
                    if len(sequence) < 4:
                        break
                    try:
                        decoded.append(chr(int(sequence, 16)))
                    except ValueError:
                        decoded.append("\\u%s" % sequence)
                    index += 5
                    continue
                decoded.append(escape_map.get(escaped, escaped))
                index += 1
                continue
            decoded.append(char)
            index += 1
        summary = "".join(decoded)
        if len(summary) <= emitted_length:
            return "", emitted_length
        return summary[emitted_length:], len(summary)

    def _ai_provider_error_result(self, query, locale, plan, report_pack, error, provider_config=None, feature=None, budget=None, claims=None):
        provider_config = provider_config or self._ai_provider_config()
        return {
            "status": "provider_error",
            "provider": provider_config["provider"],
            "model": provider_config["model"],
            "plan": plan,
            "answerMode": self._ai_answer_mode(query, plan),
            "locale": self._ai_language_contract(locale)["locale"],
            "featureTier": feature or self._ai_feature_config(),
            "budget": budget or self._ai_budget_snapshot(),
            "claims": claims if claims is not None else self._ai_deterministic_claims(report_pack, plan),
            "visualizations": [],
            "error": str(error),
            "explanation": "The server-side AI provider failed, so Bayaan did not invent an LLM-authored answer or visualization.",
        }

    def _ai_dashboard_stream_events(self, query, locale, plan, report_pack, stream_context):
        guard_result = stream_context.get("guardResult")
        if guard_result:
            yield "final", self._ai_dashboard_response(query, locale, plan, report_pack, guard_result, audit=False)
            return

        config = stream_context["config"]
        feature = stream_context["feature"]
        estimate = stream_context["estimate"]
        budget = stream_context["budget"]
        answer_mode = stream_context["answerMode"]
        language = stream_context["language"]
        claims = stream_context["claims"]
        if not config["configured"]:
            provider_result = {
                "status": "missing_credentials",
                "provider": config["provider"],
                "model": config["model"],
                "plan": plan,
                "answerMode": answer_mode,
                "locale": language["locale"],
                "featureTier": feature,
                "budget": budget,
                "claims": claims,
                "visualizations": [],
                "explanation": "Server-side AI provider credentials are not configured. The backend built a source-backed report pack, but no LLM-authored answer or visualization was made.",
            }
            yield "final", self._ai_dashboard_response(query, locale, plan, report_pack, provider_result, audit=False)
            return

        body = stream_context["body"]
        output_text = ""
        emitted_summary_length = 0
        completed_response = {}
        with requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": "Bearer %s" % config["api_key"],
                "Content-Type": "application/json",
            },
            json=body,
            timeout=300 if stream_context.get("reasoningUsed") else 45,
            stream=True,
        ) as response:
            response.raise_for_status()
            request_id = response.headers.get("x-request-id")
            for line in response.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if raw == "[DONE]":
                    break
                event = json.loads(raw)
                event_type = event.get("type")
                if event_type == "response.output_text.delta":
                    output_text += event.get("delta") or ""
                    delta, emitted_summary_length = self._ai_json_string_field_delta(output_text, "summary", emitted_summary_length)
                    if delta:
                        yield "text_delta", {"text": delta}
                elif event_type == "response.completed":
                    completed_response = event.get("response") or {}
                elif event_type == "error":
                    raise UserError(event.get("message") or "OpenAI stream failed.")

        if not output_text and completed_response:
            output_text = self._ai_openai_output_text(completed_response)
        parsed = json.loads(output_text)
        merged_plan = self._ai_validate_provider_plan(parsed, plan)
        claims = self._ai_validate_provider_claims(parsed.get("claims"), report_pack, merged_plan, fallback=answer_mode != "conversation")
        visualizations = self._ai_validate_provider_visualizations(parsed.get("visualizations"), report_pack)
        usage = completed_response.get("usage", {}) if isinstance(completed_response, dict) else {}
        try:
            final_budget = self._ai_record_usage_from_registry(
                stream_context["registry"],
                stream_context["userId"],
                stream_context["envContext"],
                budget["period"],
                budget["monthlyTokenBudget"],
                usage,
                estimate,
            )
        except Exception:
            _logger.exception("Could not record Bayaan AI stream usage.")
            final_budget = budget
        provider_result = {
            "status": "llm_called",
            "provider": config["provider"],
            "model": stream_context.get("model") or config["model"],
            "reasoningUsed": stream_context.get("reasoningUsed", False),
            "responseId": completed_response.get("id") if isinstance(completed_response, dict) else None,
            "requestId": request_id,
            "usage": usage,
            "plan": merged_plan,
            "answerMode": answer_mode,
            "locale": language["locale"],
            "featureTier": feature,
            "budget": final_budget,
            "claims": claims,
            "visualizations": visualizations,
            "explanation": parsed.get("summary") or parsed.get("explanation") or "",
        }
        yield "final", self._ai_dashboard_response(query, locale, plan, report_pack, provider_result, audit=False)

    @http.route("/bayaan/api/ai_dashboard_plan", type="jsonrpc", auth="user")
    def ai_dashboard_plan(self, **kwargs):
        self._require_chain_read_scope("use AI dashboard insights")
        payload = self._payload(kwargs)
        query = (payload.get("query") or payload.get("question") or "").strip()
        if not query:
            raise UserError("AI dashboard query is required.")
        locale = payload.get("locale") or payload.get("lang") or "en"
        plan = self._ai_template_plan(query, payload)
        report_pack = self._ai_compact_report_pack(query, payload)
        reasoning_pref = self._ai_parse_reasoning_pref(payload)
        try:
            provider_result = self._ai_call_openai(query, report_pack, plan, locale, reasoning_pref)
        except Exception as error:
            _logger.exception("Bayaan AI provider call failed.")
            provider_result = self._ai_provider_error_result(query, locale, plan, report_pack, error)
        return self._ai_dashboard_response(query, locale, plan, report_pack, provider_result)

    @http.route("/bayaan/api/ai_dashboard_stream", type="http", auth="user", methods=["POST"], csrf=False)
    def ai_dashboard_stream(self, **kwargs):
        self._require_chain_read_scope("use AI dashboard insights")
        payload = self._payload(self._http_payload())
        query = (payload.get("query") or payload.get("question") or "").strip()
        locale = payload.get("locale") or payload.get("lang") or "en"

        def stream_error(message):
            yield self._ai_sse("error", {"error": message})

        if not query:
            return Response(
                stream_error("AI dashboard query is required."),
                headers=[
                    ("Content-Type", "text/event-stream; charset=utf-8"),
                    ("Cache-Control", "no-cache, no-transform"),
                ],
                direct_passthrough=True,
            )

        plan = self._ai_template_plan(query, payload)
        report_pack = self._ai_compact_report_pack(query, payload)
        guard_result = self._ai_provider_guard(query, report_pack, plan)
        config = self._ai_provider_config()
        feature = self._ai_feature_config()
        estimate = self._ai_estimate_request_tokens(query, report_pack, plan)
        budget = self._ai_budget_snapshot(estimate)
        answer_mode = self._ai_answer_mode(query, plan)
        language = self._ai_language_contract(locale)
        claims = self._ai_deterministic_claims(report_pack, plan)
        reasoning_pref = self._ai_parse_reasoning_pref(payload)
        use_reasoning = self._ai_reasoning_decision(plan, reasoning_pref, query)
        active_model = config["reasoning_model"] if use_reasoning else config["model"]
        active_effort = config["reasoning_effort"] if use_reasoning else None
        stream_context = {
            "guardResult": guard_result,
            "config": config,
            "feature": feature,
            "estimate": estimate,
            "budget": budget,
            "answerMode": answer_mode,
            "language": language,
            "claims": claims,
            "model": active_model,
            "reasoningUsed": use_reasoning,
            "body": None if guard_result or not config["configured"] else self._ai_openai_body(
                query,
                report_pack,
                plan,
                language,
                answer_mode,
                stream=True,
                model=active_model,
                reasoning_effort=active_effort,
            ),
            "registry": request.env.registry,
            "userId": request.env.user.id,
            "envContext": dict(request.env.context),
        }
        self._audit_event(
            "ai",
            "ai_dashboard_stream",
            "AI dashboard insight stream requested",
            detail=query[:240],
            severity="info",
            payload={
                "query": query,
                "provider": config.get("provider"),
                "model": active_model,
                "reasoningUsed": use_reasoning,
                "status": "started",
                "answerMode": answer_mode,
                "intent": plan.get("intent"),
                "featureTier": feature.get("tier"),
                "budgetPeriod": budget.get("period"),
                "claimCount": len(claims),
            },
        )

        def generate():
            yield self._ai_sse("open", {"engine": "odoo_pos", "readonly": True})
            try:
                for event, data in self._ai_dashboard_stream_events(query, locale, plan, report_pack, stream_context):
                    yield self._ai_sse(event, data)
            except Exception as error:
                _logger.exception("Bayaan AI provider stream failed.")
                provider_result = self._ai_provider_error_result(
                    query,
                    locale,
                    plan,
                    report_pack,
                    error,
                    provider_config=config,
                    feature=feature,
                    budget=budget,
                    claims=claims,
                )
                yield self._ai_sse("final", self._ai_dashboard_response(
                    query,
                    locale,
                    plan,
                    report_pack,
                    provider_result,
                    audit=False,
                ))

        return Response(
            generate(),
            headers=[
                ("Content-Type", "text/event-stream; charset=utf-8"),
                ("Cache-Control", "no-cache, no-transform"),
                ("X-Accel-Buffering", "no"),
            ],
            direct_passthrough=True,
        )

    @http.route("/bayaan/api/auth_status", type="jsonrpc", auth="public")
    def auth_status(self, **kwargs):
        return self._role_payload()

    @http.route("/bayaan/api/auth_logout", type="jsonrpc", auth="public")
    def auth_logout(self, **kwargs):
        if self._current_user_is_authenticated():
            self._audit_event(
                "auth",
                "logout",
                "User signed out",
                request.env.user.login or request.env.user.name,
                record=request.env.user,
                severity="info",
            )
        request.session.logout(keep_db=True)
        return {"authenticated": False}

    @http.route("/bayaan/api/audit_log", type="jsonrpc", auth="user")
    def audit_log(self, **kwargs):
        self._require_superadmin_scope("read the Bayaan audit log")
        payload = self._payload(kwargs)
        limit = int(payload.get("limit") or 80)
        limit = max(1, min(limit, 200))
        domain = [("company_id", "=", request.env.company.id)]
        after_id = payload.get("after_id") or payload.get("afterId")
        if after_id:
            domain.append(("id", ">", int(after_id)))
        event_type = payload.get("event_type") or payload.get("eventType")
        if event_type:
            domain.append(("event_type", "=", event_type))
        events = request.env["bayaan.audit.event"].sudo().search(domain, order="id desc", limit=limit)
        return {
            "engine": "odoo_pos",
            "events": [self._serialize_audit_event(event) for event in events],
        }

    @http.route("/bayaan/api/realtime_config", type="jsonrpc", auth="user")
    def realtime_config(self, **kwargs):
        if not self._bayaan_roles():
            raise UserError("Only Bayaan users can subscribe to realtime events.")
        return request.env["bayaan.realtime"].sudo().realtime_config()

    def _serialize_alert_rule(self, rule):
        return {
            "id": rule.id,
            "name": rule.name,
            "active": rule.active,
            "trigger_type": rule.trigger_type,
            "threshold": rule.threshold,
            "cooldown_minutes": rule.cooldown_minutes,
            "kiosk_codes": [k.kiosk_code for k in rule.kiosk_ids],
            "product_codes": [p.default_code for p in rule.product_ids if p.default_code],
            "recipients": [{"id": u.id, "name": u.name, "email": u.email or "", "lang": u.lang or ""} for u in rule.recipient_user_ids],
            "last_fired_at": self._bayaan_local_datetime(rule.last_fired_at) or "",
            "fire_count": rule.fire_count,
        }

    @http.route("/bayaan/api/alert_rules", type="jsonrpc", auth="user")
    def alert_rules(self, **kwargs):
        """List + create + update + delete alert rules. Manager-only writes; chain-read for reads."""
        payload = self._payload(kwargs)
        action = (payload.get("action") or "list").strip().lower()
        Rule = request.env["bayaan.alert.rule"].sudo()

        if action == "list":
            if not self._is_chain_read_user():
                raise UserError("Only Bayaan managers/accountants/spectators can read alert rules.")
            rules = Rule.search([("company_id", "=", request.env.company.id)], order="active desc, name")
            return {"engine": "odoo_pos", "rules": [self._serialize_alert_rule(r) for r in rules]}

        if action in ("create", "update", "delete", "toggle"):
            if not self._is_bayaan_manager():
                raise UserError("Only Bayaan managers can edit alert rules.")

        if action == "create":
            recipient_logins = payload.get("recipient_logins") or []
            users = request.env["res.users"].sudo().search([
                ("login", "in", recipient_logins),
                ("company_ids", "in", [request.env.company.id]),
            ])
            if not users:
                raise UserError("At least one valid recipient login is required.")
            kiosk_codes = payload.get("kiosk_codes") or []
            kiosks = request.env["bayaan.kiosk"].sudo().search([("kiosk_code", "in", kiosk_codes)]) if kiosk_codes else False
            product_codes = payload.get("product_codes") or []
            products = request.env["product.product"].sudo().search([("default_code", "in", product_codes)]) if product_codes else False
            vals = {
                "name": payload.get("name") or "Untitled rule",
                "trigger_type": payload.get("trigger_type") or "low_stock",
                "threshold": float(payload.get("threshold") or 1.0),
                "cooldown_minutes": int(payload.get("cooldown_minutes") or 120),
                "active": bool(payload.get("active", True)),
                "recipient_user_ids": [(6, 0, users.ids)],
                "company_id": request.env.company.id,
            }
            if kiosks:
                vals["kiosk_ids"] = [(6, 0, kiosks.ids)]
            if products:
                vals["product_ids"] = [(6, 0, products.ids)]
            rule = Rule.create(vals)
            return {"engine": "odoo_pos", "rule": self._serialize_alert_rule(rule)}

        if action == "toggle":
            rule = Rule.browse(int(payload.get("id") or 0))
            if not rule.exists():
                raise UserError("Alert rule not found.")
            rule.active = not rule.active
            return {"engine": "odoo_pos", "rule": self._serialize_alert_rule(rule)}

        if action == "delete":
            rule = Rule.browse(int(payload.get("id") or 0))
            if not rule.exists():
                raise UserError("Alert rule not found.")
            rule.unlink()
            return {"engine": "odoo_pos", "deleted": True}

        raise UserError("Unknown alert_rules action %r" % action)

    @http.route("/bayaan/api/warehouse_setup", type="jsonrpc", auth="user")
    def warehouse_setup(self, **kwargs):
        self._require_chain_read_scope("read warehouse setup")
        return self._serialize_warehouse_setup()

    @http.route("/bayaan/api/payment_gateways", type="jsonrpc", auth="user")
    def payment_gateways(self, **kwargs):
        PaymentMethod = request.env["pos.payment.method"].sudo()
        methods = PaymentMethod.search([
            ("company_id", "in", [False, request.env.company.id]),
        ], order="sequence,name", limit=500)
        return {
            "engine": "odoo_pos",
            "payment_gateways": self._payment_gateway_catalog(),
            "payment_methods": [{
                "id": method.id,
                "name": method.name,
                "provider": self._payment_gateway_info(method),
                "external_id": method.bayaan_gateway_external_id,
                "settlement_window": method.bayaan_gateway_settlement_window,
            } for method in methods],
        }

    @http.route("/bayaan/api/payment_transaction", type="jsonrpc", auth="user")
    def payment_transaction(self, **kwargs):
        payload = self._payload(kwargs)
        provider = self._require_payment_provider(payload.get("provider"))
        amount = self._float_value(payload.get("amount"), 0.0)
        if amount <= 0:
            raise UserError("Payment transaction amount must be greater than zero.")

        kiosk = request.env["bayaan.kiosk"].sudo().browse()
        if payload.get("kiosk"):
            kiosk = self._require_kiosk(payload.get("kiosk"))
            self._require_kiosk_scope(kiosk, "sale")

        external_reference = payload.get("external_reference") or payload.get("externalReference")
        if not external_reference:
            external_reference = "BAY-%s" % uuid4().hex[:12].upper()

        mock = bool(payload.get("mock"))
        missing_credentials = self._payment_provider_credentials_missing(provider)
        if not mock and missing_credentials:
            raise UserError(
                "Missing server-side credentials for %s: %s."
                % (BAYAAN_PAYMENT_GATEWAY_BY_ID[provider]["label"], ", ".join(missing_credentials))
            )
        if not mock:
            raise UserError(
                "Live %s API calls require merchant activation and should be enabled only after sandbox credential verification."
                % BAYAAN_PAYMENT_GATEWAY_BY_ID[provider]["label"]
            )

        provider_transaction_id = (
            payload.get("provider_transaction_id")
            or payload.get("providerTransactionId")
            or self._payment_provider_transaction_id(provider, external_reference)
        )
        Transaction = request.env["bayaan.payment.transaction"].sudo()
        existing = Transaction.search([
            ("provider", "=", provider),
            ("external_reference", "=", external_reference),
            ("company_id", "=", request.env.company.id),
        ], limit=1)
        if existing:
            return self._serialize_payment_transaction(existing, expose_callback_secret=mock)

        payment_method = request.env["pos.payment.method"].sudo().browse()
        if payload.get("payment_method") or payload.get("paymentMethod"):
            method_ref = payload.get("payment_method") or payload.get("paymentMethod")
            method_domain = [("company_id", "in", [False, request.env.company.id])]
            if isinstance(method_ref, int) or str(method_ref).isdigit():
                payment_method = request.env["pos.payment.method"].sudo().browse(int(method_ref))
                if not payment_method.exists():
                    payment_method = request.env["pos.payment.method"].sudo().browse()
            if not payment_method:
                payment_method = request.env["pos.payment.method"].sudo().search(
                    method_domain + [("name", "ilike", str(method_ref))],
                    limit=1,
                )

        transaction = Transaction.create({
            "provider": provider,
            "external_reference": external_reference,
            "provider_transaction_id": provider_transaction_id,
            "provider_status": "MOCK_PENDING" if mock else "PENDING",
            "status": "pending",
            "amount": amount,
            "currency_id": request.env.company.currency_id.id,
            "company_id": request.env.company.id,
            "kiosk_id": kiosk.id if kiosk else False,
            "payment_method_id": payment_method.id if payment_method else False,
        })
        provider_payload = self._mock_payment_provider_payload(provider, transaction)
        write_vals = {"latest_payload_json": provider_payload}
        if provider == "fib":
            write_vals.update({
                "qr_code": provider_payload.get("qrCode"),
                "readable_code": provider_payload.get("readableCode"),
                "redirect_url": provider_payload.get("personalAppLink"),
            })
        elif provider == "zain_cash":
            write_vals["redirect_url"] = provider_payload.get("redirectUrl")
        transaction.write(write_vals)
        self._audit_event(
            "payment",
            "transaction.created",
            "Payment transaction created: %s" % transaction.external_reference,
            "%s %.2f via %s" % (request.env.company.currency_id.name, transaction.amount, transaction.provider),
            record=transaction,
            kiosk=kiosk if kiosk else None,
            severity="info",
            payload=payload,
        )
        return self._serialize_payment_transaction(transaction, expose_callback_secret=mock)

    @http.route("/bayaan/api/payment_transaction_action", type="jsonrpc", auth="user")
    def payment_transaction_action(self, **kwargs):
        payload = self._payload(kwargs)
        transaction_ref = payload.get("transaction") or payload.get("id") or payload.get("external_reference")
        Transaction = request.env["bayaan.payment.transaction"].sudo()
        if not transaction_ref:
            raise UserError("Payment transaction reference is required.")
        if isinstance(transaction_ref, int) or str(transaction_ref).isdigit():
            transaction = Transaction.browse(int(transaction_ref))
        else:
            transaction = Transaction.search([
                "|",
                ("external_reference", "=", str(transaction_ref)),
                ("provider_transaction_id", "=", str(transaction_ref)),
            ], limit=1)
        if not transaction.exists() or transaction.company_id != request.env.company:
            raise UserError("Payment transaction not found: %s" % transaction_ref)
        if transaction.kiosk_id and not self._is_bayaan_accountant():
            self._require_kiosk_scope(transaction.kiosk_id, "sale")

        action = (payload.get("action") or "status").lower()
        if action in ("status", "poll"):
            provider_status = payload.get("provider_status") or payload.get("providerStatus") or transaction.provider_status
            transaction.bayaan_apply_provider_status(provider_status, payload)
        elif action in ("cancel", "cancelled", "canceled"):
            if not self._is_bayaan_supervisor():
                raise UserError("Only a supervisor or manager can cancel a gateway transaction.")
            transaction.bayaan_apply_provider_status("cancelled", payload)
        elif action in ("refund", "refunded"):
            if not self._is_bayaan_manager():
                raise UserError("Only a Bayaan manager can refund a gateway transaction.")
            transaction.bayaan_apply_provider_status("refunded", payload)
        else:
            raise UserError("Unsupported payment transaction action: %s" % action)
        self._audit_event(
            "payment",
            "transaction.%s" % action,
            "Payment transaction %s: %s" % (action, transaction.external_reference),
            "Status %s" % transaction.status,
            record=transaction,
            kiosk=transaction.kiosk_id,
            severity="warning" if action in ("cancel", "cancelled", "canceled", "refund", "refunded") else "info",
            payload=payload,
        )
        return self._serialize_payment_transaction(transaction)

    @http.route("/bayaan/payment/webhook/<string:provider>", type="http", auth="public", csrf=False, methods=["POST"])
    def payment_webhook(self, provider, **kwargs):
        provider = self._require_payment_provider(provider)
        payload = self._http_payload()
        secret = payload.get("secret") or request.httprequest.args.get("secret")
        provider_transaction_id = (
            payload.get("provider_transaction_id")
            or payload.get("providerTransactionId")
            or payload.get("paymentId")
            or payload.get("transactionId")
            or payload.get("id")
        )
        external_reference = payload.get("external_reference") or payload.get("externalReference")
        transaction_domain = [("provider", "=", provider), ("company_id", "=", request.env.company.id)]
        Transaction = request.env["bayaan.payment.transaction"].sudo()
        transaction = Transaction.browse()
        if provider_transaction_id:
            transaction = Transaction.search(transaction_domain + [
                ("provider_transaction_id", "=", str(provider_transaction_id)),
            ], limit=1)
        if not transaction and external_reference:
            transaction = Transaction.search(transaction_domain + [
                ("external_reference", "=", str(external_reference)),
            ], limit=1)
        if not transaction:
            return request.make_json_response({"ok": False, "error": "transaction_not_found"}, status=404)
        if transaction.callback_secret and secret != transaction.callback_secret:
            return request.make_json_response({"ok": False, "error": "invalid_callback_secret"}, status=403)

        provider_status = payload.get("status") or payload.get("provider_status") or payload.get("providerStatus")
        if not provider_status:
            provider_status = "unknown"
        event_key = (
            payload.get("eventId")
            or payload.get("event_id")
            or payload.get("webhookId")
            or "%s:%s:%s" % (provider, transaction.provider_transaction_id, provider_status)
        )
        Event = request.env["bayaan.payment.webhook.event"].sudo()
        existing_event = Event.search([
            ("provider", "=", provider),
            ("event_key", "=", str(event_key)),
            ("company_id", "=", request.env.company.id),
        ], limit=1)
        if existing_event:
            existing_event.write({"duplicate": True})
            return request.make_json_response({
                "ok": True,
                "duplicate": True,
                "transaction": self._serialize_payment_transaction(transaction),
            })

        event = Event.create({
            "transaction_id": transaction.id,
            "event_key": str(event_key),
            "provider_status": str(provider_status),
            "payload_json": payload,
            "processed": True,
        })
        transaction.bayaan_apply_provider_status(str(provider_status), payload)
        self._audit_event(
            "payment",
            "webhook.received",
            "Payment webhook received: %s" % transaction.external_reference,
            "%s -> %s" % (provider, provider_status),
            record=event,
            kiosk=transaction.kiosk_id,
            severity="info",
            payload=payload,
        )
        return request.make_json_response({
            "ok": True,
            "duplicate": False,
            "event": event.id,
            "status": normalize_provider_status(provider, provider_status),
            "transaction": self._serialize_payment_transaction(transaction),
        })

    @http.route("/bayaan/api/hr_snapshot", type="jsonrpc", auth="user")
    def hr_snapshot(self, **kwargs):
        if not (self._is_bayaan_manager() or self._is_bayaan_accountant()):
            raise UserError("Only Bayaan managers or accountants can read HR/payroll.")
        return self._serialize_hr_snapshot()

    @http.route("/bayaan/api/hr_employee", type="jsonrpc", auth="user")
    def hr_employee(self, **kwargs):
        payload = self._payload(kwargs)
        Employee = request.env["bayaan.employee"].sudo()
        if not payload.get("name"):
            if not (self._is_bayaan_manager() or self._is_bayaan_accountant()):
                raise UserError("Only Bayaan managers or accountants can read staff records.")
            employees = Employee.search([("company_id", "=", request.env.company.id)], order="name", limit=500)
            return {"employees": [self._serialize_employee(employee) for employee in employees]}
        self._require_manager_scope("manage staff records")

        kiosk = request.env["bayaan.kiosk"].sudo().browse()
        if payload.get("kiosk"):
            kiosk = self._require_kiosk(payload.get("kiosk"))
        role = str(payload.get("role") or "cashier").lower()
        if role not in ("manager", "supervisor", "warehouse", "cashier", "barista", "accountant", "other"):
            role = "other"
        employee = Employee.create({
            "name": payload["name"],
            "role": role,
            "kiosk_id": kiosk.id if kiosk else False,
            "monthly_salary": self._float_value(payload.get("monthly_salary") or payload.get("monthlySalary"), 0.0),
            "expected_monthly_hours": self._float_value(
                payload.get("expected_monthly_hours") or payload.get("expectedMonthlyHours"),
                176.0,
            ),
            "company_id": request.env.company.id,
            "currency_id": request.env.company.currency_id.id,
        })
        self._audit_event(
            "hr",
            "employee.created",
            "Staff record created: %s" % employee.name,
            employee.role,
            record=employee,
            kiosk=kiosk if kiosk else None,
            severity="success",
            payload=payload,
        )
        return self._serialize_employee(employee)

    @http.route("/bayaan/api/hr_attendance", type="jsonrpc", auth="user")
    def hr_attendance(self, **kwargs):
        payload = self._payload(kwargs)
        employee = self._employee(payload.get("employee") or payload.get("employee_id") or payload.get("employeeId"))
        if employee.kiosk_id:
            self._require_kiosk_scope(employee.kiosk_id, "shift_close")
        Attendance = request.env["bayaan.attendance"].sudo()
        check_in = payload.get("check_in") or payload.get("checkIn") or fields.Datetime.now()
        check_out = payload.get("check_out") or payload.get("checkOut")
        manual_hours = self._float_value(payload.get("manual_hours") or payload.get("manualHours"), 0.0)
        note = payload.get("note")
        attendance = Attendance.search([
            ("company_id", "=", request.env.company.id),
            ("employee_id", "=", employee.id),
            ("check_in", "=", check_in),
            ("check_out", "=", check_out or False),
            ("manual_hours", "=", manual_hours),
            ("note", "=", note or False),
        ], limit=1)
        created = not bool(attendance)
        if not attendance:
            attendance = Attendance.create({
                "employee_id": employee.id,
                "check_in": check_in,
                "check_out": check_out,
                "manual_hours": manual_hours,
                "note": note,
            })
        self._audit_event(
            "hr",
            "attendance.created" if created else "attendance.reused",
            "Attendance %s: %s" % ("logged" if created else "reused", employee.name),
            "Worked hours %.2f" % attendance.worked_hours,
            record=attendance,
            kiosk=employee.kiosk_id,
            severity="info",
            payload=payload,
        )
        return {
            "id": attendance.id,
            "employee": employee.name,
            "workedHours": attendance.worked_hours,
            "checkIn": self._bayaan_local_datetime(attendance.check_in),
            "checkOut": self._bayaan_local_datetime(attendance.check_out),
            "odooAttendanceId": attendance.hr_attendance_id.id,
        }

    @http.route("/bayaan/api/operating_expense", type="jsonrpc", auth="user")
    def operating_expense(self, **kwargs):
        self._require_manager_scope("record operating expenses")
        payload = self._payload(kwargs)
        name = (payload.get("name") or "").strip()
        category = (payload.get("category") or "General").strip()
        amount = self._float_value(payload.get("amount"), 0.0)
        expense_date = payload.get("date") or fields.Date.context_today(request.env.user)
        note = payload.get("note")
        if not name or amount <= 0:
            raise UserError("Operating expense requires a name and positive amount.")
        Expense = request.env["bayaan.operating.expense"].sudo()
        expense = Expense.search([
            ("company_id", "=", request.env.company.id),
            ("name", "=", name),
            ("category", "=", category),
            ("amount", "=", amount),
            ("date", "=", expense_date),
            ("note", "=", note or False),
        ], limit=1)
        created = not bool(expense)
        if not expense:
            expense = Expense.create({
                "name": name,
                "category": category,
                "amount": amount,
                "date": expense_date,
                "note": note,
                "company_id": request.env.company.id,
            })
        self._audit_event(
            "hr",
            "operating_expense.created" if created else "operating_expense.reused",
            "Operating expense %s: %s" % ("created" if created else "reused", expense.name),
            "%s %.2f" % (expense.category, expense.amount),
            record=expense,
            severity="warning",
            payload=payload,
        )
        return self._serialize_operating_expense(expense)

    @http.route("/bayaan/api/hr_schedule", type="jsonrpc", auth="user")
    def hr_schedule(self, **kwargs):
        payload = self._payload(kwargs)
        action = (payload.get("action") or payload.get("type") or "read").lower()
        if action in ("read", "list", "snapshot"):
            if not (self._is_chain_read_user() or self._is_bayaan_supervisor()):
                raise UserError("Only Bayaan managers, supervisors, logistics, or accountants can read HR schedules.")
            return self._hr_schedule_snapshot(payload)

        self._require_manager_scope("manage HR schedules")
        if action in ("coverage_rule", "create_coverage_rule", "rule"):
            kiosk = self._require_kiosk(payload.get("kiosk"))
            role = str(payload.get("role") or "any").lower()
            if role == "all":
                role = "any"
            if role not in ("any", "manager", "supervisor", "warehouse", "cashier", "barista", "accountant", "other"):
                raise UserError("Unsupported coverage role: %s" % role)
            rule = request.env["bayaan.staffing.coverage.rule"].sudo().create({
                "kiosk_id": kiosk.id,
                "dayofweek": str(payload.get("day_of_week") or payload.get("dayOfWeek") or "0"),
                "role": role,
                "start_hour": self._hour_value(payload.get("start_hour") or payload.get("startHour"), 8.0),
                "end_hour": self._hour_value(payload.get("end_hour") or payload.get("endHour"), 16.0),
                "required_count": int(payload.get("required_count") or payload.get("requiredCount") or 1),
                "company_id": request.env.company.id,
            })
            self._audit_event(
                "hr",
                "coverage_rule.created",
                "Coverage rule created: %s" % kiosk.kiosk_code,
                "%s %.2f-%.2f x%s" % (rule.role, rule.start_hour, rule.end_hour, rule.required_count),
                record=rule,
                kiosk=kiosk,
                severity="info",
                payload=payload,
            )
            return self._serialize_coverage_rule(rule)

        if action in ("shift", "create_shift", "assign_shift"):
            employee = self._employee(payload.get("employee") or payload.get("employee_id") or payload.get("employeeId"))
            kiosk = self._require_kiosk(payload.get("kiosk") or employee.kiosk_id.kiosk_code)
            role = str(payload.get("role") or employee.role or "cashier").lower()
            if role not in ("manager", "supervisor", "warehouse", "cashier", "barista", "accountant", "other"):
                raise UserError("Unsupported shift role: %s" % role)
            shift = request.env["bayaan.shift.plan"].sudo().create({
                "employee_id": employee.id,
                "kiosk_id": kiosk.id,
                "date": payload.get("date") or fields.Date.context_today(request.env.user),
                "role": role,
                "start_hour": self._hour_value(payload.get("start_hour") or payload.get("startHour"), 8.0),
                "end_hour": self._hour_value(payload.get("end_hour") or payload.get("endHour"), 16.0),
                "state": payload.get("state") or "planned",
                "note": payload.get("note"),
                "company_id": request.env.company.id,
            })
            self._audit_event(
                "hr",
                "shift.created",
                "Shift planned: %s" % employee.name,
                "%s %s %.2f-%.2f" % (kiosk.kiosk_code, shift.date, shift.start_hour, shift.end_hour),
                record=shift,
                kiosk=kiosk,
                severity="success",
                payload=payload,
            )
            return self._serialize_hr_shift(shift)

        if action in ("update_shift", "edit_shift", "reschedule_shift"):
            shift_ref = payload.get("id") or payload.get("shift_id") or payload.get("shiftId")
            if not shift_ref:
                raise UserError("Shift reference is required.")
            ShiftPlan = request.env["bayaan.shift.plan"].sudo()
            shift = ShiftPlan.browse(int(shift_ref)) if str(shift_ref).isdigit() else ShiftPlan.browse()
            if not shift.exists() or shift.company_id != request.env.company:
                raise UserError("Shift not found: %s" % shift_ref)
            employee = self._employee(payload.get("employee") or payload.get("employee_id") or payload.get("employeeId"))
            kiosk = self._require_kiosk(payload.get("kiosk") or employee.kiosk_id.kiosk_code or shift.kiosk_id.kiosk_code)
            role = str(payload.get("role") or employee.role or shift.role or "cashier").lower()
            if role not in ("manager", "supervisor", "warehouse", "cashier", "barista", "accountant", "other"):
                raise UserError("Unsupported shift role: %s" % role)
            state = payload.get("state") or shift.state or "planned"
            if state not in ("planned", "confirmed", "cancelled"):
                raise UserError("Unsupported shift state: %s" % state)
            shift.write({
                "employee_id": employee.id,
                "kiosk_id": kiosk.id,
                "date": payload.get("date") or shift.date,
                "role": role,
                "start_hour": self._hour_value(payload.get("start_hour") or payload.get("startHour"), shift.start_hour),
                "end_hour": self._hour_value(payload.get("end_hour") or payload.get("endHour"), shift.end_hour),
                "state": state,
                "note": payload.get("note"),
            })
            self._audit_event(
                "hr",
                "shift.updated",
                "Shift updated: %s" % employee.name,
                "%s %s %.2f-%.2f" % (kiosk.kiosk_code, shift.date, shift.start_hour, shift.end_hour),
                record=shift,
                kiosk=kiosk,
                severity="info",
                payload=payload,
            )
            return self._serialize_hr_shift(shift)

        raise UserError("Unsupported HR schedule action: %s" % action)

    @http.route("/bayaan/api/payroll_adjustment", type="jsonrpc", auth="user")
    def payroll_adjustment(self, **kwargs):
        payload = self._payload(kwargs)
        employee = self._employee(payload.get("employee") or payload.get("employee_id") or payload.get("employeeId"))
        if employee.kiosk_id:
            self._require_kiosk_scope(employee.kiosk_id, "review")
        adjustment_type = payload.get("type") or payload.get("kind")
        if adjustment_type not in ("bonus", "deduction", "advance", "cash_shortage"):
            raise UserError("Unsupported payroll adjustment type: %s" % (adjustment_type or "empty value"))
        amount = self._float_value(payload.get("amount"), 0.0)
        if amount <= 0:
            raise UserError("Payroll adjustment amount must be greater than zero.")
        adjustment_date = payload.get("date") or fields.Date.context_today(request.env.user)
        self._ensure_payroll_adjustment_period_open(adjustment_date)
        reason = payload.get("reason") or "Payroll adjustment"
        Adjustment = request.env["bayaan.payroll.adjustment"].sudo()
        adjustment = Adjustment.search([
            ("company_id", "=", request.env.company.id),
            ("employee_id", "=", employee.id),
            ("date", "=", adjustment_date),
            ("type", "=", adjustment_type),
            ("amount", "=", amount),
            ("reason", "=", reason),
        ], limit=1)
        created = not bool(adjustment)
        if not adjustment:
            adjustment = Adjustment.create({
                "employee_id": employee.id,
                "date": adjustment_date,
                "type": adjustment_type,
                "amount": amount,
                "reason": reason,
            })
        if payload.get("approve"):
            self._require_manager_scope("approve payroll adjustments")
            adjustment.action_approve()
        self._audit_event(
            "payroll",
            "adjustment.created" if created else "adjustment.reused",
            "Payroll adjustment %s: %s" % ("created" if created else "reused", employee.name),
            "%s %.2f" % (adjustment_type, amount),
            record=adjustment,
            kiosk=employee.kiosk_id,
            severity="warning" if adjustment_type in ("deduction", "cash_shortage") else "info",
            payload=payload,
        )
        return self._serialize_payroll_adjustment(adjustment)

    @http.route("/bayaan/api/payroll_adjustment_action", type="jsonrpc", auth="user")
    def payroll_adjustment_action(self, **kwargs):
        self._require_manager_scope("approve payroll adjustments")
        payload = self._payload(kwargs)
        adjustment = request.env["bayaan.payroll.adjustment"].sudo().browse(
            int(payload.get("adjustment") or payload.get("id") or 0)
        )
        if not adjustment.exists() or adjustment.company_id != request.env.company:
            raise UserError("Payroll adjustment not found.")
        self._ensure_payroll_adjustment_period_open(adjustment.date)
        action = (payload.get("action") or "").lower()
        if action in ("approve", "approved"):
            adjustment.action_approve()
        elif action in ("reject", "rejected"):
            adjustment.action_reject()
        else:
            raise UserError("Unsupported payroll adjustment action: %s" % (action or "empty value"))
        self._audit_event(
            "payroll",
            "adjustment.%s" % action,
            "Payroll adjustment %s: %s" % (action, adjustment.employee_id.name),
            "%s %.2f" % (adjustment.type, adjustment.amount),
            record=adjustment,
            kiosk=adjustment.employee_id.kiosk_id,
            severity="success" if action in ("approve", "approved") else "warning",
            payload=payload,
        )
        return self._serialize_payroll_adjustment(adjustment)

    @http.route("/bayaan/api/payroll_run", type="jsonrpc", auth="user")
    def payroll_run(self, **kwargs):
        self._require_manager_scope("run payroll")
        payload = self._payload(kwargs)
        PayrollRun = request.env["bayaan.payroll.run"].sudo()
        date_from = payload.get("date_from") or payload.get("dateFrom")
        date_to = payload.get("date_to") or payload.get("dateTo")
        if not date_from or not date_to:
            raise UserError("Payroll run needs date_from and date_to.")
        run_name = payload.get("name") or "Payroll %s - %s" % (date_from, date_to)
        payroll_run = PayrollRun.search([
            ("company_id", "=", request.env.company.id),
            ("name", "=", run_name),
            ("date_from", "=", date_from),
            ("date_to", "=", date_to),
        ], limit=1)
        created = not bool(payroll_run)
        if not payroll_run:
            payroll_run = PayrollRun.create({
                "name": run_name,
                "date_from": date_from,
                "date_to": date_to,
                "company_id": request.env.company.id,
                "currency_id": request.env.company.currency_id.id,
            })
        if payload.get("compute", True) and payroll_run.state in ("draft", "review"):
            payroll_run.action_compute_lines()
        self._audit_event(
            "payroll",
            "run.created" if created else "run.reused",
            "Payroll run %s: %s" % ("created" if created else "reused", payroll_run.name),
            "%s to %s" % (date_from, date_to),
            record=payroll_run,
            severity="info",
            payload=payload,
        )
        return self._serialize_payroll_run(payroll_run)

    @http.route("/bayaan/api/payroll_run_action", type="jsonrpc", auth="user")
    def payroll_run_action(self, **kwargs):
        self._require_manager_scope("approve payroll")
        payload = self._payload(kwargs)
        payroll_run = request.env["bayaan.payroll.run"].sudo().browse(int(payload.get("run") or payload.get("id") or 0))
        if not payroll_run.exists() or payroll_run.company_id != request.env.company:
            raise UserError("Payroll run not found.")
        action = (payload.get("action") or "").lower()
        if action in ("compute", "recompute"):
            if payroll_run.state in ("draft", "review"):
                payroll_run.action_compute_lines()
        elif action in ("approve", "approved"):
            payroll_run.action_approve()
        elif action in ("paid", "mark_paid"):
            payroll_run.action_mark_paid()
        elif action == "cancel":
            payroll_run.state = "cancelled"
        else:
            raise UserError("Unsupported payroll run action: %s" % (action or "empty value"))
        self._audit_event(
            "payroll",
            "run.%s" % action,
            "Payroll run %s: %s" % (action, payroll_run.name),
            "State %s" % payroll_run.state,
            record=payroll_run,
            severity="success" if action in ("approve", "approved", "paid", "mark_paid") else "warning",
            payload=payload,
        )
        return self._serialize_payroll_run(payroll_run)

    @http.route("/bayaan/api/create_warehouse", type="jsonrpc", auth="user")
    def create_warehouse(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        name = payload.get("name")
        if not name:
            raise UserError("Warehouse name is required.")
        warehouse = request.env["stock.warehouse"].sudo().create({
            "name": name,
            "code": self._unique_warehouse_code(payload.get("code") or name),
            "company_id": request.env.company.id,
            "reception_steps": payload.get("reception_steps") or "one_step",
            "delivery_steps": payload.get("delivery_steps") or "ship_only",
        })
        self._audit_event(
            "setup",
            "warehouse.created",
            "Warehouse created: %s" % warehouse.name,
            "Code %s" % warehouse.code,
            record=warehouse,
            severity="success",
            payload=payload,
        )
        return self._serialize_warehouse_setup(created={
            "type": "warehouse",
            "id": warehouse.id,
            "name": warehouse.name,
            "code": warehouse.code,
        })

    @http.route("/bayaan/api/create_kiosk", type="jsonrpc", auth="user")
    def create_kiosk(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        kiosk_code = payload.get("kiosk_code") or payload.get("kioskCode")
        name = payload.get("name")
        if not kiosk_code or not name:
            raise UserError("Kiosk code and name are required.")

        warehouse = self._warehouse(payload.get("warehouse_id") or payload.get("warehouse") or payload.get("warehouse_code"))
        if not warehouse:
            raise UserError("Create or select a source warehouse before creating kiosk locations.")

        Kiosk = request.env["bayaan.kiosk"].sudo()
        existing = Kiosk.search([
            ("kiosk_code", "=", kiosk_code),
            ("company_id", "=", request.env.company.id),
        ], limit=1)
        if existing:
            existing.write({
                "name": name,
                "city": payload.get("city") or existing.city,
                "area": payload.get("area") or existing.area,
                "street": payload.get("street") or existing.street,
                "stock_deduction_policy": payload.get("stock_deduction_policy") or existing.stock_deduction_policy,
                "active": payload.get("active", existing.active),
            })
            self._audit_event(
                "setup",
                "kiosk.updated",
                "Kiosk updated: %s" % existing.kiosk_code,
                existing.name,
                record=existing,
                kiosk=existing,
                severity="success",
                payload=payload,
            )
            return self._serialize_warehouse_setup(created={
                "type": "kiosk",
                "action": "updated",
                "id": existing.id,
                "kiosk_code": existing.kiosk_code,
            })

        location_name = payload.get("location_name") or "%s Stock" % kiosk_code
        location = request.env["stock.location"].sudo().create({
            "name": location_name,
            "usage": "internal",
            "location_id": warehouse.lot_stock_id.id,
            "company_id": request.env.company.id,
        })

        picking_type = request.env["stock.picking.type"].sudo().create({
            "name": "%s POS Delivery" % kiosk_code,
            "code": "outgoing",
            "sequence_code": "%sPOS" % kiosk_code.replace("-", "")[:8],
            "warehouse_id": warehouse.id,
            "default_location_src_id": location.id,
            "default_location_dest_id": request.env.ref("stock.stock_location_customers").id,
            "company_id": request.env.company.id,
        })

        PosConfig = request.env["pos.config"].sudo()
        journal, payment_methods = PosConfig._create_journal_and_payment_methods(
            cash_journal_vals={
                "name": "Cash %s" % kiosk_code,
                "show_on_dashboard": False,
            },
        )
        pos_config = PosConfig.create({
            "name": "%s POS" % kiosk_code,
            "company_id": request.env.company.id,
            "picking_type_id": picking_type.id,
            "journal_id": journal.id,
            "payment_method_ids": payment_methods,
        })

        kiosk = Kiosk.create({
            "name": name,
            "kiosk_code": kiosk_code,
            "city": payload.get("city"),
            "area": payload.get("area"),
            "street": payload.get("street"),
            "opening_date": payload.get("opening_date") or fields.Date.context_today(request.env.user),
            "stock_deduction_policy": payload.get("stock_deduction_policy") or "warning",
            "pos_config_id": pos_config.id,
            "stock_location_id": location.id,
            "company_id": request.env.company.id,
        })

        self._audit_event(
            "setup",
            "kiosk.created",
            "Kiosk created: %s" % kiosk.kiosk_code,
            "%s linked to %s" % (kiosk.name, warehouse.name),
            record=kiosk,
            kiosk=kiosk,
            severity="success",
            payload=payload,
        )
        return self._serialize_warehouse_setup(created={
            "type": "kiosk",
            "action": "created",
            "id": kiosk.id,
            "kiosk_code": kiosk.kiosk_code,
            "stock_location_id": location.id,
            "pos_config_id": pos_config.id,
        })

    @http.route("/bayaan/api/create_supplier", type="jsonrpc", auth="user")
    def create_supplier(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserError("Supplier name is required.")

        Partner = request.env["res.partner"].sudo()
        partner = Partner.search([
            ("name", "=", name),
            "|",
            ("company_id", "=", False),
            ("company_id", "=", request.env.company.id),
        ], limit=1)
        vals = {
            "name": name,
            "supplier_rank": 1,
            "street": (payload.get("address") or "").strip(),
            "bayaan_supplier_category": (payload.get("category") or "").strip(),
            "bayaan_delivery_category": (
                payload.get("delivery_category")
                or payload.get("deliveryCategory")
                or ""
            ).strip(),
        }
        if partner:
            partner.write(vals)
            action = "supplier.updated"
            title = "Supplier updated: %s" % partner.name
        else:
            vals["company_id"] = request.env.company.id
            partner = Partner.create(vals)
            action = "supplier.created"
            title = "Supplier created: %s" % partner.name

        self._audit_event(
            "procurement",
            action,
            title,
            partner.bayaan_delivery_category or partner.bayaan_supplier_category or "",
            record=partner,
            severity="success",
            payload=payload,
        )

        return {
            "engine": "odoo_pos",
            "supplier": self._serialize_supplier_partner(partner),
        }

    @http.route("/bayaan/api/create_stock_item", type="jsonrpc", auth="user")
    def create_stock_item(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserError("Stock item name is required.")

        mode = payload.get("consumption_mode") or payload.get("consumptionMode") or "finished"
        if mode not in ("recipe", "finished", "hybrid", "none"):
            raise UserError("Invalid Bayaan consumption mode: %s" % mode)

        Uom = request.env["uom.uom"].sudo()
        fallback_uom = request.env.ref("uom.product_uom_unit", raise_if_not_found=False) or Uom.search([], limit=1)
        uom = self._uom(payload.get("uom"), fallback_uom)
        category_name = (payload.get("category") or "").strip()
        category = request.env.ref("product.product_category_all", raise_if_not_found=False)
        if category_name:
            category = request.env["product.category"].sudo().search([("name", "=", category_name)], limit=1)
            if not category:
                category = request.env["product.category"].sudo().create({"name": category_name})

        default_code = self._unique_product_code(payload.get("code"), name)
        template_vals = {
            "name": name,
            "default_code": default_code,
            "type": "consu",
            "is_storable": True,
            "uom_id": uom.id,
            "standard_price": self._float_value(payload.get("unit_cost") or payload.get("standard_price"), 0.0),
            "list_price": self._float_value(payload.get("list_price"), 0.0),
            "available_in_pos": bool(payload.get("available_in_pos") or payload.get("availableInPos")),
            "bayaan_consumption_mode": mode,
            "company_id": request.env.company.id,
        }
        template_vals.update(self._stock_plan_payload_values(payload, include_defaults=True))
        if category:
            template_vals["categ_id"] = category.id
        image_value = self._product_image_value(payload)
        if image_value is not None:
            template_vals["image_1920"] = image_value

        template = request.env["product.template"].sudo().create(template_vals)
        product = template.product_variant_id

        supplier_name = (payload.get("supplier") or "").strip()
        purchase_price = self._float_value(payload.get("purchase_price") or payload.get("purchasePrice"), template.standard_price)
        if supplier_name:
            partner = request.env["res.partner"].sudo().search([("name", "=", supplier_name)], limit=1)
            if not partner:
                partner = request.env["res.partner"].sudo().create({
                    "name": supplier_name,
                    "supplier_rank": 1,
                })
            else:
                partner.sudo().supplier_rank = max(partner.supplier_rank, 1)
            request.env["product.supplierinfo"].sudo().create({
                "partner_id": partner.id,
                "product_tmpl_id": template.id,
                "product_id": product.id,
                "price": purchase_price,
                "company_id": request.env.company.id,
            })

        self._audit_event(
            "catalog",
            "stock_item.created",
            "Stock item created: %s" % product.display_name,
            "Mode %s, UoM %s" % (mode, product.uom_id.name),
            record=product,
            severity="success",
            payload=payload,
        )
        return {
            "engine": "odoo_pos",
            "product": self._serialize_stock_item(product),
        }

    @http.route("/bayaan/api/product_catalog", type="jsonrpc", auth="user")
    def product_catalog(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        name = (payload.get("name") or "").strip()
        product_ref = payload.get("id") or payload.get("product") or payload.get("code") or payload.get("default_code")
        product = self._product(product_ref) if product_ref else request.env["product.product"].sudo().browse()
        if not product and not name:
            raise UserError("Product name is required.")

        mode = payload.get("consumption_mode") or payload.get("consumptionMode") or (
            product.product_tmpl_id.bayaan_consumption_mode if product else "recipe"
        )
        if mode not in ("recipe", "finished", "hybrid", "none"):
            raise UserError("Invalid Bayaan consumption mode: %s" % mode)

        category = request.env.ref("product.product_category_all", raise_if_not_found=False)
        category_name = (payload.get("category") or "").strip()
        if category_name:
            category = request.env["product.category"].sudo().search([("name", "=", category_name)], limit=1)
            if not category:
                category = request.env["product.category"].sudo().create({"name": category_name})

        uom = self._uom(payload.get("uom"), product.uom_id if product else request.env.ref("uom.product_uom_unit"))
        values = {
            "name": name or product.name,
            "list_price": self._float_value(payload.get("list_price") or payload.get("listPrice"), product.lst_price if product else 0.0),
            "standard_price": self._float_value(payload.get("standard_price") or payload.get("standardPrice"), product.standard_price if product else 0.0),
            "available_in_pos": payload.get("available_in_pos", payload.get("availableInPos", True)),
            "bayaan_consumption_mode": mode,
            "uom_id": uom.id,
        }
        values.update(self._stock_plan_payload_values(payload, include_defaults=not bool(product)))
        if category:
            values["categ_id"] = category.id
        image_value = self._product_image_value(payload)
        if image_value is not None:
            values["image_1920"] = image_value
        pos_options_value = self._pos_options_value(payload)
        if pos_options_value is not None:
            values["bayaan_pos_options"] = pos_options_value

        if product:
            product.product_tmpl_id.sudo().write(values)
            action = "product.updated"
        else:
            default_code = self._unique_product_code(payload.get("code") or payload.get("default_code"), name)
            values.update({
                "default_code": default_code,
                "type": "consu",
                "is_storable": True,
                "company_id": request.env.company.id,
            })
            template = request.env["product.template"].sudo().create(values)
            product = template.product_variant_id
            action = "product.created"

        self._audit_event(
            "catalog",
            action,
            "Product catalog saved: %s" % product.display_name,
            "Mode %s, POS %s" % (product.product_tmpl_id.bayaan_consumption_mode, product.available_in_pos),
            record=product,
            severity="success",
            payload=payload,
        )
        return {
            "engine": "odoo_pos",
            "product": self._serialize_stock_item(product),
        }

    def _bayaan_local_datetime(self, value):
        """Single timezone authority for every UI-facing timestamp.

        Odoo stores datetimes in UTC; ``to_string`` emits that UTC wall-clock
        verbatim, while aggregations use ``context_timestamp`` (local). Mixing the
        two made the dashboard show UTC in some places and Baghdad in others. This
        converts a stored datetime to the user's timezone (Asia/Baghdad for this
        client) and returns a naive wall-clock string, so slice/Date display the
        same local clock everywhere. Returns ``False`` for empty values."""
        if not value:
            return False
        return fields.Datetime.to_string(fields.Datetime.context_timestamp(request.env.user, value))

    @http.route("/bayaan/api/chain_bootstrap", type="jsonrpc", auth="user")
    def chain_bootstrap(self, **kwargs):
        today = fields.Date.context_today(request.env.user)
        # The day window is the user-tz (Asia/Baghdad) civil day converted to UTC, not a
        # naive UTC day — so salesToday/hourly buckets line up with local time. Reuses the
        # same tz-aware boundary helper the reports use (_report_datetime).
        today_start = self._report_datetime(today, None)
        today_end = self._report_datetime(today, None, end_of_day=True)
        company = request.env.company
        Kiosk = request.env["bayaan.kiosk"].sudo()
        Product = request.env["product.product"].sudo()
        Recipe = request.env["bayaan.recipe"].sudo()
        Purchase = request.env["purchase.order"].sudo()
        Quant = request.env["stock.quant"].sudo()
        Consumption = request.env["bayaan.consumption.ledger"].sudo()
        Waste = request.env["bayaan.waste.entry"].sudo()
        PosOrder = request.env["pos.order"].sudo()
        Payment = request.env["pos.payment"].sudo()
        PaymentMethod = request.env["pos.payment.method"].sudo()
        ShiftClose = request.env["bayaan.shift.close"].sudo()
        Picking = request.env["stock.picking"].sudo()
        Partner = request.env["res.partner"].sudo()
        RecurringPurchase = request.env["bayaan.recurring.purchase"].sudo()
        PayrollRun = request.env["bayaan.payroll.run"].sudo()
        Attendance = request.env["bayaan.attendance"].sudo()
        Adjustment = request.env["bayaan.payroll.adjustment"].sudo()
        Expense = request.env["bayaan.operating.expense"].sudo()
        Employee = request.env["bayaan.employee"].sudo()
        can_read_chain = self._is_chain_read_user()

        kiosk_domain = [
            ("active", "=", True),
            ("company_id", "=", company.id),
        ]
        if not can_read_chain:
            user = request.env.user
            kiosk_domain += [
                "|", "|",
                ("manager_user_id", "=", user.id),
                ("supervisor_user_id", "=", user.id),
                ("cashier_user_ids", "in", [user.id]),
            ]
        product_domain = [
            ("type", "!=", "service"),
            "|",
            ("product_tmpl_id.company_id", "=", False),
            ("product_tmpl_id.company_id", "=", company.id),
        ]
        recipe_domain = [
            ("company_id", "=", company.id),
        ]
        purchase_domain = [
            ("company_id", "=", company.id),
            ("date_order", ">=", today_start - timedelta(days=30)),
            ("date_order", "<", today_end),
        ]
        consumption_domain = [
            ("company_id", "=", company.id),
            ("consumed_at", ">=", today_start),
            ("consumed_at", "<", today_end),
        ]
        waste_domain = [
            ("company_id", "=", company.id),
            ("create_date", ">=", today_start),
            ("create_date", "<", today_end),
        ]
        sale_domain = [
            ("company_id", "=", company.id),
            ("date_order", ">=", today_start),
            ("date_order", "<", today_end),
            ("state", "not in", ["draft", "cancel"]),
        ]
        payment_domain = [
            ("company_id", "=", company.id),
            ("payment_date", ">=", today_start),
            ("payment_date", "<", today_end),
            ("pos_order_id.state", "not in", ["draft", "cancel"]),
        ]
        closing_domain = [
            ("company_id", "=", company.id),
            ("opened_at", ">=", today_start),
            ("opened_at", "<", today_end),
        ]
        transfer_domain = [
            ("company_id", "=", company.id),
            ("picking_type_id.code", "=", "internal"),
            ("state", "not in", ["cancel"]),
            "|",
            ("state", "!=", "done"),
            "|", "|",
            ("scheduled_date", ">=", today_start),
            ("create_date", ">=", today_start),
            ("date_done", ">=", today_start),
        ]
        supplier_domain = [
            ("supplier_rank", ">", 0),
            "|",
            ("company_id", "=", False),
            ("company_id", "=", company.id),
        ]

        kiosks = Kiosk.search(kiosk_domain, order="kiosk_code", limit=500)
        pos_configs = kiosks.mapped("pos_config_id").sudo()
        kiosk_location_ids = kiosks.mapped("stock_location_id").ids
        if not can_read_chain:
            kiosk_ids = kiosks.ids or [0]
            kiosk_location_ids_for_domain = kiosk_location_ids or [0]
            pos_config_ids = kiosks.mapped("pos_config_id").ids or [0]
            purchase_domain += [("id", "=", 0)]
            consumption_domain += [("kiosk_id", "in", kiosk_ids)]
            waste_domain += [("kiosk_id", "in", kiosk_ids)]
            sale_domain += [
                "|",
                ("bayaan_kiosk_id", "in", kiosk_ids),
                ("config_id", "in", pos_config_ids),
            ]
            payment_domain += [
                "|",
                ("pos_order_id.bayaan_kiosk_id", "in", kiosk_ids),
                ("pos_order_id.config_id", "in", pos_config_ids),
            ]
            closing_domain += [("kiosk_id", "in", kiosk_ids)]
            transfer_domain += [("location_dest_id", "in", kiosk_location_ids_for_domain)]
        payroll_employee_domain = [
            ("active", "=", True),
            ("company_id", "=", company.id),
        ]
        if not can_read_chain:
            payroll_employee_domain += [("kiosk_id", "in", kiosks.ids or [0])]
        payroll_employees = Employee.search(payroll_employee_domain, order="name", limit=1000)
        payroll_employee_ids = payroll_employees.ids or [0]
        quant_domain = [
            ("location_id", "in", kiosk_location_ids),
            ("quantity", "!=", 0),
        ]

        products = Product.search(product_domain, order="default_code,name", limit=500)
        warehouses = request.env["stock.warehouse"].sudo().search([("company_id", "=", company.id)], order="sequence,id")
        warehouse_stock_location_ids = warehouses.mapped("lot_stock_id").ids
        recipes = Recipe.search(recipe_domain, order="product_id, effective_from desc, id desc", limit=500)
        purchases = Purchase.search(purchase_domain, order="date_order desc, id desc", limit=200)
        warehouse_quants = Quant.search([
            ("location_id", "in", warehouse_stock_location_ids or [0]),
            ("product_id", "in", products.ids or [0]),
            ("quantity", "!=", 0),
        ], order="location_id, product_id", limit=2000)
        warehouse_stock_by_product = {}
        warehouse_reserved_by_product = {}
        for quant in warehouse_quants:
            product_id = quant.product_id.id
            warehouse_stock_by_product[product_id] = warehouse_stock_by_product.get(product_id, 0.0) + quant.quantity
            warehouse_reserved_by_product[product_id] = warehouse_reserved_by_product.get(product_id, 0.0) + quant.reserved_quantity
        quants = Quant.search(quant_domain, order="location_id, product_id", limit=2000)
        consumption = Consumption.search(consumption_domain, order="consumed_at desc, id desc", limit=1000)
        waste = Waste.search(waste_domain, order="create_date desc, id desc", limit=1000)
        sales = PosOrder.search(sale_domain, order="date_order desc, id desc", limit=1000)
        closings = ShiftClose.search(closing_domain, order="opened_at desc, id desc", limit=500)
        transfers = Picking.search(transfer_domain, order="scheduled_date desc, id desc", limit=500)
        suppliers = Partner.search(supplier_domain, order="name", limit=500)
        recurring_purchases = RecurringPurchase.search([("company_id", "=", company.id)], order="next_date, name", limit=200)
        kiosk_by_location = {
            kiosk.stock_location_id.id: kiosk
            for kiosk in kiosks
        }
        waste_cost_by_kiosk = {}
        for entry in waste:
            waste_cost_by_kiosk[entry.kiosk_id.id] = waste_cost_by_kiosk.get(entry.kiosk_id.id, 0.0) + entry.estimated_cost

        def close_status(close):
            if close.manager_review_state == "approved":
                return "approved"
            if close.manager_review_state == "rejected":
                return "issue"
            if not close.closed_at:
                return "open"
            has_cash_variance = bool(close.cash_variance)
            has_stock_variance = any(line.variance_qty for line in close.stock_count_line_ids)
            return "issue" if has_cash_variance or has_stock_variance else "pending"

        def close_investigation_status(close):
            if not close.closed_at:
                return "Waiting for count"
            if close.manager_review_state == "approved":
                return "Approved by %s" % (close.manager_reviewed_by_id.name or "manager")
            if close.manager_review_state == "rejected":
                return "Rejected - investigation open"
            if close.investigation_status == "open":
                return "Investigation open"
            return "Manager review" if close_status(close) == "pending" else "Investigation open"

        def close_notes(close):
            if close.manager_note:
                return close.manager_note
            snapshot = close.stock_count_json if isinstance(close.stock_count_json, dict) else {}
            return snapshot.get("manager_notes") or snapshot.get("notes") or ""

        def close_recipe_posting_issues(close):
            return close.pos_order_ids.filtered(
                lambda order: order.bayaan_consumption_state in ("missing_recipe", "failed")
            )

        def read_group_sum(model, domain, field_name):
            rows = model._read_group(domain, [], ["%s:sum" % field_name])
            return rows[0][0] if rows else 0.0

        def payment_gateway_name(method_name):
            return classify_payment_gateway(method_name=method_name)

        def payment_gateway_method(method):
            return self._payment_gateway_info(method)

        def payment_category_name(method_name):
            return payment_gateway_name(method_name)["category"]

        def payment_category_method(method):
            return payment_gateway_method(method)["category"]

        def payment_category(payment):
            return payment_category_method(payment.payment_method_id)

        def first_day_next_month(date_value):
            if date_value.month == 12:
                return date_value.replace(year=date_value.year + 1, month=1, day=1)
            return date_value.replace(month=date_value.month + 1, day=1)

        def days_in_month(date_value):
            return (first_day_next_month(date_value) - date_value.replace(day=1)).days

        def prorated_salary_accrual(start_date, end_inclusive):
            if end_inclusive < start_date:
                return 0.0
            monthly_salary_total = sum(payroll_employees.mapped("monthly_salary"))
            if not monthly_salary_total:
                return 0.0
            total = 0.0
            cursor = start_date
            while cursor <= end_inclusive:
                month_end = first_day_next_month(cursor) - timedelta(days=1)
                chunk_end = min(month_end, end_inclusive)
                chunk_days = max((chunk_end - cursor).days + 1, 0)
                total += monthly_salary_total * (chunk_days / max(days_in_month(cursor), 1))
                cursor = chunk_end + timedelta(days=1)
            return total

        def approved_adjustment_impact(adjustments):
            bonus = sum(adjustments.filtered(lambda adj: adj.type == "bonus").mapped("amount"))
            deductions = sum(adjustments.filtered(lambda adj: adj.type != "bonus").mapped("amount"))
            return bonus - deductions

        def uncovered_date_ranges(start_date, end_inclusive, covered_ranges):
            cursor = start_date
            uncovered = []
            normalized_ranges = []
            for range_start, range_end in covered_ranges:
                clipped_start = max(range_start, start_date)
                clipped_end = min(range_end, end_inclusive)
                if clipped_end >= clipped_start:
                    normalized_ranges.append((clipped_start, clipped_end))
            for range_start, range_end in sorted(normalized_ranges):
                if range_end < cursor:
                    continue
                if range_start > cursor:
                    uncovered.append((cursor, range_start - timedelta(days=1)))
                cursor = max(cursor, range_end + timedelta(days=1))
                if cursor > end_inclusive:
                    break
            if cursor <= end_inclusive:
                uncovered.append((cursor, end_inclusive))
            return uncovered

        def salary_accrual_for_ranges(date_ranges):
            return sum(prorated_salary_accrual(range_start, range_end) for range_start, range_end in date_ranges)

        def approved_adjustment_impact_for_ranges(base_domain, date_ranges):
            total = 0.0
            for range_start, range_end in date_ranges:
                adjustments = Adjustment.search(base_domain + [
                    ("state", "=", "approved"),
                    ("date", ">=", range_start),
                    ("date", "<=", range_end),
                ])
                total += approved_adjustment_impact(adjustments)
            return total

        def payment_gateway(payment):
            return payment_gateway_method(payment.payment_method_id)

        def empty_payment_split():
            return {
                "cash": 0.0,
                "card": 0.0,
                "qr": 0.0,
                "mobile_wallet": 0.0,
                "bank_app": 0.0,
                "manual_digital": 0.0,
                "digital_other": 0.0,
                "digital": 0.0,
                "total": 0.0,
                "_by_method": {},
                "_by_provider": {},
            }

        def add_payment_amount(split, method_name, gateway, amount):
            category = gateway.get("category", "digital_other")
            if category not in split:
                category = "digital_other"
            split[category] += amount
            if category != "cash":
                split["digital"] += amount
            split["total"] += amount
            method_name = method_name or category
            method = split["_by_method"].setdefault(method_name, {
                "method": method_name,
                "category": category,
                "provider": gateway["id"],
                "providerLabel": gateway["label"],
                "amount": 0.0,
            })
            method["amount"] += amount
            provider = split["_by_provider"].setdefault(gateway["id"], {
                "provider": gateway["id"],
                "label": gateway["label"],
                "category": category,
                "kind": gateway["kind"],
                "settlement": gateway["settlement"],
                "amount": 0.0,
            })
            provider["amount"] += amount

        def add_payment(split, payment):
            add_payment_amount(
                split,
                payment.payment_method_id.name,
                payment_gateway(payment),
                payment.amount,
            )

        def finalize_payment_split(split):
            by_method = split.pop("_by_method", {})
            by_provider = split.pop("_by_provider", {})
            split["by_method"] = sorted(
                by_method.values(),
                key=lambda row: (-row["amount"], row["method"]),
            )
            split["by_provider"] = sorted(
                by_provider.values(),
                key=lambda row: (-row["amount"], row["label"]),
            )
            return split

        def payment_split(orders):
            split = empty_payment_split()
            for payment in orders.mapped("payment_ids"):
                add_payment(split, payment)
            return finalize_payment_split(split)

        def payment_split_from_groups(rows):
            split = empty_payment_split()
            for row in rows:
                if isinstance(row, dict):
                    method = row.get("payment_method_id")
                    method_name = method[1] if method else "Unassigned digital"
                    method_record = PaymentMethod.browse(method[0]) if method else PaymentMethod.browse()
                    amount = row.get("amount", 0.0)
                else:
                    method_record, amount = row
                    method_name = method_record.name if method_record else "Unassigned digital"
                add_payment_amount(
                    split,
                    method_name,
                    payment_gateway_method(method_record) if method_record else payment_gateway_name(method_name),
                    amount,
                )
            return finalize_payment_split(split)

        sales_by_kiosk = {}
        for kiosk, amount_total, order_count_for_kiosk in PosOrder._read_group(
            sale_domain,
            ["bayaan_kiosk_id"],
            ["amount_total:sum", "__count"],
        ):
            if kiosk:
                sales_by_kiosk[kiosk.id] = {
                    "orders": order_count_for_kiosk,
                    "sales": amount_total,
                }

        kiosk_stock_rows = []
        for quant in quants:
            kiosk = kiosk_by_location.get(quant.location_id.id)
            stock_plan = self._product_stock_plan(quant.product_id, quant.quantity)
            row = {
                "kiosk": kiosk.kiosk_code if kiosk else quant.location_id.complete_name,
                "item": quant.product_id.default_code or quant.product_id.display_name,
                "actual_qty": quant.quantity,
                "reserved_qty": quant.reserved_quantity,
                "uom": quant.product_id.uom_id.name,
                "mode": quant.product_id.product_tmpl_id.bayaan_consumption_mode,
                "category": quant.product_id.categ_id.display_name,
                "target_qty": stock_plan["target_qty"],
                "reorder_qty": stock_plan["reorder_qty"],
                "critical_qty": stock_plan["critical_qty"],
                "max_qty": stock_plan["max_qty"],
                "stock_percent": stock_plan["stock_percent"],
                "stock_status": stock_plan["status"],
                "target_source": stock_plan["target_source"],
            }
            kiosk_stock_rows.append(row)
        kiosk_stock_grouped = {}
        for row in kiosk_stock_rows:
            kiosk_stock_grouped.setdefault(row["kiosk"], []).append(row)

        close_payment_totals = {
            close.id: payment_split(close.pos_order_ids)
            for close in closings
        }
        supplier_spend30 = {}
        supplier_last_order = {}
        for order in purchases:
            partner_id = order.partner_id.id
            supplier_spend30[partner_id] = supplier_spend30.get(partner_id, 0.0) + order.amount_total
            supplier_last_order.setdefault(partner_id, order.name)

        transfer_rows = []
        for transfer in transfers:
            source_kiosk = kiosk_by_location.get(transfer.location_id.id)
            dest_kiosk = kiosk_by_location.get(transfer.location_dest_id.id)
            transfer_rows.append({
                "id": transfer.id,
                "name": transfer.name,
                "origin": transfer.origin,
                "requested": bool(transfer.origin and str(transfer.origin).startswith("Kiosk stock request")),
                "from": source_kiosk.kiosk_code if source_kiosk else transfer.location_id.complete_name,
                "to": dest_kiosk.kiosk_code if dest_kiosk else transfer.location_dest_id.complete_name,
                "toKioskId": dest_kiosk.kiosk_code if dest_kiosk else False,
                "scheduledAt": self._bayaan_local_datetime(transfer.scheduled_date),
                "doneAt": self._bayaan_local_datetime(transfer.date_done),
                "createdAt": self._bayaan_local_datetime(transfer.create_date),
                "state": transfer.state,
                "bayaan_state": transfer.bayaan_transfer_state,
                "items": len(transfer.move_ids),
                "lines": [{
                    "product": move.product_id.default_code or move.product_id.display_name,
                    "qty": move.product_uom_qty,
                    "doneQty": move.quantity,
                    "uom": move.product_uom.name,
                    "state": move.state,
                } for move in transfer.move_ids],
            })

        target_low_stock_count = 0
        suggested_transfer_rows = []
        for quant in quants:
            stock_plan = self._product_stock_plan(quant.product_id, quant.quantity)
            kiosk = kiosk_by_location.get(quant.location_id.id)
            if stock_plan["status"] in ("empty", "critical", "low"):
                target_low_stock_count += 1
            if stock_plan["status"] not in ("empty", "critical", "low"):
                continue
            if not kiosk:
                continue
            target_qty = stock_plan["target_qty"] or max(stock_plan["reorder_qty"] * 2, quant.quantity, 1.0)
            suggested_qty = max(1.0, target_qty - quant.quantity)
            suggested_transfer_rows.append({
                "kiosk": kiosk.kiosk_code,
                "kioskName": kiosk.name,
                "item": quant.product_id.default_code or quant.product_id.display_name,
                "qty": round(suggested_qty, 2),
                "uom": quant.product_id.uom_id.name,
                "cover": "out" if quant.quantity <= 0 else "<1 day",
                "reason": "below configured reorder target",
                "actual_qty": quant.quantity,
                "target_qty": stock_plan["target_qty"],
                "reorder_qty": stock_plan["reorder_qty"],
                "critical_qty": stock_plan["critical_qty"],
                "stock_percent": stock_plan["stock_percent"],
            })
            if len(suggested_transfer_rows) >= 25:
                break

        today_payments = payment_split_from_groups(
            Payment._read_group(payment_domain, ["payment_method_id"], ["amount:sum"])
        )
        consumption_cost = read_group_sum(Consumption, consumption_domain, "total_cost")
        waste_cost = read_group_sum(Waste, waste_domain, "estimated_cost")
        revenue_total = read_group_sum(PosOrder, sale_domain, "amount_total")
        order_count = PosOrder.search_count(sale_domain)
        # Today's revenue bucketed by local hour (0-23) for the overview hourly view.
        # Uses the same sale_domain as salesToday so the buckets reconcile to the daily total.
        hourly_sales = [0.0] * 24
        for sale_order in PosOrder.search(sale_domain, order="date_order", limit=20000):
            if not sale_order.date_order:
                continue
            local_dt = fields.Datetime.context_timestamp(request.env.user, sale_order.date_order)
            hourly_sales[local_dt.hour] += sale_order.amount_total or 0.0
        hourly_sales = [round(value, 2) for value in hourly_sales]
        expected_cash_total = read_group_sum(ShiftClose, closing_domain, "expected_cash")
        cash_expected = expected_cash_total or today_payments["cash"]
        cash_variance_total = read_group_sum(ShiftClose, closing_domain, "cash_variance")
        stock_variance_value = read_group_sum(ShiftClose, closing_domain, "ingredient_variance_value")
        variance_impact = cash_variance_total + stock_variance_value
        closed_kiosk_ids = {
            kiosk.id
            for kiosk, in ShiftClose._read_group(closing_domain + [("closed_at", "!=", False)], ["kiosk_id"], [])
            if kiosk
        }
        low_stock_count = target_low_stock_count
        variance_issue_count = sum(1 for close in closings if close_status(close) == "issue")
        recipe_issue_count = PosOrder.search_count(
            sale_domain + [("bayaan_consumption_state", "in", ["missing_recipe", "failed"])]
        )
        waste_alert_count = Waste.search_count(waste_domain + [
            "|",
            ("reason", "in", ["unknown_loss", "missing_stock"]),
            ("estimated_cost", ">", 50000),
        ])

        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)
        year_start = today_start.replace(month=1, day=1)

        def report_period_summary(start, end):
            start_date = start.date()
            end_date = end.date()
            end_inclusive = end_date - timedelta(days=1)
            period_sale_domain = [
                ("company_id", "=", company.id),
                ("state", "in", ["paid", "done", "invoiced"]),
                ("date_order", ">=", start),
                ("date_order", "<", end),
            ]
            period_payment_domain = [
                ("company_id", "=", company.id),
                ("payment_date", ">=", start),
                ("payment_date", "<", end),
                ("pos_order_id.state", "not in", ["draft", "cancel"]),
            ]
            period_consumption_domain = [
                ("company_id", "=", company.id),
                ("consumed_at", ">=", start),
                ("consumed_at", "<", end),
            ]
            period_waste_domain = [
                ("company_id", "=", company.id),
                ("create_date", ">=", start),
                ("create_date", "<", end),
            ]
            period_closing_domain = [
                ("company_id", "=", company.id),
                ("opened_at", ">=", start),
                ("opened_at", "<", end),
            ]
            period_attendance_domain = [
                ("company_id", "=", company.id),
                ("check_in", ">=", start),
                ("check_in", "<", end),
            ]
            period_adjustment_domain = [
                ("company_id", "=", company.id),
                ("date", ">=", start_date),
                ("date", "<", end_date),
            ]
            period_adjustment_scope_domain = [
                ("company_id", "=", company.id),
            ]
            period_expense_domain = [
                ("company_id", "=", company.id),
                ("date", ">=", start_date),
                ("date", "<", end_date),
            ]
            period_payroll_domain = [
                ("company_id", "=", company.id),
                ("state", "in", ["review", "approved", "paid"]),
                ("date_from", "<=", end_inclusive),
                ("date_to", ">=", start_date),
            ]
            if not can_read_chain:
                period_attendance_domain += [("employee_id", "in", payroll_employee_ids)]
                period_adjustment_domain += [("employee_id", "in", payroll_employee_ids)]
                period_adjustment_scope_domain += [("employee_id", "in", payroll_employee_ids)]
                period_payroll_domain += [("id", "=", 0)]
            period_payments = payment_split_from_groups(
                Payment._read_group(period_payment_domain, ["payment_method_id"], ["amount:sum"])
            )
            period_revenue = read_group_sum(PosOrder, period_sale_domain, "amount_total")
            period_cogs = read_group_sum(Consumption, period_consumption_domain, "total_cost")
            period_waste = read_group_sum(Waste, period_waste_domain, "estimated_cost")
            period_cash_expected = read_group_sum(ShiftClose, period_closing_domain, "expected_cash") or period_payments["cash"]
            period_cash_variance = read_group_sum(ShiftClose, period_closing_domain, "cash_variance")
            period_stock_variance = read_group_sum(ShiftClose, period_closing_domain, "ingredient_variance_value")
            period_variance_impact = period_cash_variance + period_stock_variance
            period_expenses = read_group_sum(Expense, period_expense_domain, "amount")
            payroll_runs = PayrollRun.search(period_payroll_domain)
            period_payroll = 0.0
            payroll_covered_ranges = []
            for payroll_run in payroll_runs:
                run_days = max((payroll_run.date_to - payroll_run.date_from).days + 1, 1)
                overlap_from = max(payroll_run.date_from, start_date)
                overlap_to = min(payroll_run.date_to, end_inclusive)
                overlap_days = max((overlap_to - overlap_from).days + 1, 0)
                period_payroll += payroll_run.total_net * (overlap_days / run_days)
                if overlap_days:
                    payroll_covered_ranges.append((overlap_from, overlap_to))
            uncovered_payroll_ranges = uncovered_date_ranges(start_date, end_inclusive, payroll_covered_ranges)
            if uncovered_payroll_ranges:
                period_payroll += salary_accrual_for_ranges(uncovered_payroll_ranges)
                period_payroll += approved_adjustment_impact_for_ranges(
                    period_adjustment_scope_domain,
                    uncovered_payroll_ranges,
                )
            period_payroll = max(period_payroll, 0.0)
            period_net_profit = period_revenue - period_cogs - period_waste + period_variance_impact
            return {
                "revenue": period_revenue,
                "orders": PosOrder.search_count(period_sale_domain),
                "cogs": period_cogs,
                "wasteCost": period_waste,
                "cashVariance": period_cash_variance,
                "stockVarianceValue": period_stock_variance,
                "varianceImpact": period_variance_impact,
                "netProfit": period_net_profit,
                "payrollExpense": period_payroll,
                "operatingExpenses": period_expenses,
                "netProfitAfterPayroll": period_net_profit - period_payroll - period_expenses,
                "cashExpected": period_cash_expected,
                "digitalPayments": period_payments["digital"],
                "payments": period_payments,
                "sourceCounts": {
                    "orders": PosOrder.search_count(period_sale_domain),
                    "payments": Payment.search_count(period_payment_domain),
                    "consumptionRows": Consumption.search_count(period_consumption_domain),
                    "wasteRows": Waste.search_count(period_waste_domain),
                    "closingRows": ShiftClose.search_count(period_closing_domain),
                    "hrAttendanceRows": Attendance.search_count(period_attendance_domain),
                    "payrollAdjustmentRows": Adjustment.search_count(period_adjustment_domain),
                    "payrollRunRows": len(payroll_runs),
                    "operatingExpenseRows": Expense.search_count(period_expense_domain),
                },
            }

        report_periods = {
            "daily": report_period_summary(today_start, today_end),
            "weekly": report_period_summary(week_start, today_end),
            "monthly": report_period_summary(month_start, today_end),
            "yearly": report_period_summary(year_start, today_end),
        }

        kiosk_summaries = {
            kiosk.id: {
                "kioskId": kiosk.kiosk_code,
                "name": kiosk.name,
                "city": kiosk.city,
                "orders": 0,
                "sales": 0.0,
                "payments": empty_payment_split(),
                "wasteCost": 0.0,
                "stockItems": 0,
                "lowStockItems": 0,
                "zeroStockItems": 0,
                "_stockHealthWeightedTotal": 0.0,
                "_stockHealthWeight": 0.0,
                "cashVariance": 0.0,
                "stockVarianceLines": 0,
                "closingStatus": "open",
            }
            for kiosk in kiosks
        }
        for kiosk_id, sale_totals in sales_by_kiosk.items():
            row = kiosk_summaries.get(kiosk_id)
            if not row:
                continue
            row["orders"] = sale_totals["orders"]
            row["sales"] = sale_totals["sales"]
        for sale in sales:
            row = kiosk_summaries.get(sale.bayaan_kiosk_id.id)
            if not row:
                continue
            for payment in sale.payment_ids:
                add_payment(row["payments"], payment)
        for quant in quants:
            kiosk = kiosk_by_location.get(quant.location_id.id)
            row = kiosk_summaries.get(kiosk.id if kiosk else False)
            if not row:
                continue
            stock_plan = self._product_stock_plan(quant.product_id, quant.quantity)
            row["stockItems"] += 1
            if stock_plan["target_qty"] > 0:
                row["_stockHealthWeightedTotal"] += stock_plan["stock_percent"] * stock_plan["priority_weight"]
                row["_stockHealthWeight"] += stock_plan["priority_weight"]
            if stock_plan["status"] in ("empty", "critical", "low"):
                row["lowStockItems"] += 1
            if stock_plan["target_qty"] > 0 and quant.quantity <= 0:
                row["zeroStockItems"] += 1
        for entry in waste:
            row = kiosk_summaries.get(entry.kiosk_id.id)
            if row:
                row["wasteCost"] += entry.estimated_cost
        for close in closings:
            row = kiosk_summaries.get(close.kiosk_id.id)
            if not row:
                continue
            row["cashVariance"] += close.cash_variance
            row["stockVarianceLines"] += sum(1 for line in close.stock_count_line_ids if line.variance_qty)
            row["closingStatus"] = "closed" if close.closed_at else "needs_closing"

        by_kiosk_summary = []
        for row in kiosk_summaries.values():
            stock_weight = row.pop("_stockHealthWeight", 0.0)
            stock_weighted_total = row.pop("_stockHealthWeightedTotal", 0.0)
            stock_health = round(stock_weighted_total / stock_weight) if stock_weight else 0
            if row["cashVariance"] or row["stockVarianceLines"]:
                status = "variance_issue"
            elif row["lowStockItems"]:
                status = "low_stock"
            elif row["closingStatus"] == "needs_closing":
                status = "needs_closing"
            else:
                status = row["closingStatus"]
            row["stockHealth"] = stock_health
            row["status"] = status
            row["payments"] = finalize_payment_split(row["payments"])
            by_kiosk_summary.append(row)

        hr_snapshot = self._hr_schedule_snapshot({})
        hr_payroll_snapshot = self._serialize_hr_snapshot()
        hr_snapshot["adjustments"] = hr_payroll_snapshot["adjustments"]
        hr_snapshot["payrollRuns"] = hr_payroll_snapshot["payrollRuns"]
        hr_snapshot["expenses"] = hr_payroll_snapshot["expenses"]
        hr_snapshot["summary"]["operatingExpenses"] = hr_payroll_snapshot["summary"]["operatingExpenses"]

        return {
            "engine": "odoo_pos",
            "payment_gateways": self._payment_gateway_catalog(),
            "current_user": self._role_payload()["user"],
            "hr": hr_snapshot,
            "meta": {
                "date": fields.Date.to_string(today),
                "generated_at": fields.Datetime.to_string(fields.Datetime.now()),
                "limits": {
                    "products": 500,
                    "recipes": 500,
                    "purchase_orders": 200,
                    "kiosk_stock_quants": 2000,
                    "orders": 1000,
                    "consumption": 1000,
                    "waste": 1000,
                    "closings": 500,
                    "transfers": 500,
                    "suggested_transfers": 25,
                    "hr_employees": 500,
                    "hr_shifts": 1000,
                    "hr_coverage_rules": 1000,
                    "operating_expenses": 500,
                },
                "rows_returned": {
                    "products": len(products),
                    "recipes": len(recipes),
                    "purchase_orders": len(purchases),
                    "kiosk_stock_quants": len(quants),
                    "orders": len(sales),
                    "consumption": len(consumption),
                    "waste": len(waste),
                    "closings": len(closings),
                    "transfers": len(transfers),
                    "suggested_transfers": len(suggested_transfer_rows),
                    "recurring_purchases": len(recurring_purchases),
                    "hr_employees": len(hr_snapshot["employees"]),
                    "hr_shifts": len(hr_snapshot["shifts"]),
                    "hr_coverage_gaps": len(hr_snapshot["coverageGaps"]),
                    "payroll_adjustments": len(hr_snapshot["adjustments"]),
                    "payroll_runs": len(hr_snapshot["payrollRuns"]),
                    "operating_expenses": len(hr_snapshot["expenses"]),
                },
            },
            "summary": {
                "totals": {
                    "salesToday": revenue_total,
                    "ordersToday": order_count,
                    "profitEstimate": revenue_total - consumption_cost - waste_cost + variance_impact,
                    "cogs": consumption_cost,
                    "wasteCost": waste_cost,
                    "cashVariance": cash_variance_total,
                    "stockVarianceValue": stock_variance_value,
                    "varianceImpact": variance_impact,
                    "cashExpected": cash_expected,
                    "digitalPayments": today_payments["digital"],
                    "openKiosks": max(len(kiosks) - len(closed_kiosk_ids), 0),
                    "closedKiosks": len(closed_kiosk_ids),
                },
                "payments": today_payments,
                "hourlySales": hourly_sales,
                "reportPeriods": report_periods,
                "alerts": {
                    "lowStockItems": low_stock_count,
                    "unresolvedVariances": variance_issue_count + recipe_issue_count,
                    "wasteLossAlerts": waste_alert_count,
                    "recipePostingIssues": recipe_issue_count,
                },
                "sourceCounts": {
                    "kiosks": Kiosk.search_count(kiosk_domain),
                    "orders": order_count,
                    "payments": Payment.search_count(payment_domain),
                    "consumptionRows": Consumption.search_count(consumption_domain),
                    "wasteRows": Waste.search_count(waste_domain),
                    "closingRows": ShiftClose.search_count(closing_domain),
                    "stockRows": Quant.search_count(quant_domain),
                    "transferRows": Picking.search_count(transfer_domain),
                    "products": Product.search_count(product_domain),
                    "recipes": Recipe.search_count(recipe_domain),
                    "purchaseOrders": Purchase.search_count(purchase_domain),
                    "recurringPurchases": len(recurring_purchases),
                    "hrEmployees": len(hr_snapshot["employees"]),
                    "hrEmployeeRows": len(hr_snapshot["employees"]),
                    "hrShiftRows": len(hr_snapshot["shifts"]),
                    "hrCoverageRuleRows": len(hr_snapshot["coverageRules"]),
                    "hrAttendanceRows": len(hr_payroll_snapshot["attendance"]),
                    "hrCoverageGaps": len(hr_snapshot["coverageGaps"]),
                    "payrollAdjustments": len(hr_snapshot["adjustments"]),
                    "payrollAdjustmentRows": len(hr_snapshot["adjustments"]),
                    "payrollRuns": len(hr_snapshot["payrollRuns"]),
                    "payrollRunRows": len(hr_snapshot["payrollRuns"]),
                    "operatingExpenses": len(hr_snapshot["expenses"]),
                    "operatingExpenseRows": len(hr_snapshot["expenses"]),
                },
                "byKiosk": sorted(by_kiosk_summary, key=lambda row: (-row["sales"], row["kioskId"])),
            },
            "kiosks": [{
                "name": kiosk.name,
                "kiosk_code": kiosk.kiosk_code,
                "country": kiosk.country_id.name,
                "city": kiosk.city,
                "area": kiosk.area,
                "address": kiosk.street,
                "policy": kiosk.stock_deduction_policy,
                "pos_config_id": kiosk.pos_config_id.id,
                "warehouse": kiosk.stock_location_id.complete_name,
                "manager": kiosk.manager_user_id.name,
                "supervisor": kiosk.supervisor_user_id.name,
            } for kiosk in kiosks],
            "pos_configs": [{
                "id": config.id,
                "name": config.name,
                "active": config.active,
                "picking_type_id": config.picking_type_id.id,
                "picking_type": config.picking_type_id.display_name,
                "source_location_id": config.picking_type_id.default_location_src_id.id,
                "source_location": config.picking_type_id.default_location_src_id.complete_name,
                "payment_methods": [{
                    "id": method.id,
                    "name": method.name,
                    "provider": self._payment_gateway_info(method),
                    "external_id": method.bayaan_gateway_external_id,
                    "settlement_window": method.bayaan_gateway_settlement_window,
                } for method in config.payment_method_ids],
            } for config in pos_configs],
            "warehouse_stock": [{
                "item": product.default_code or product.display_name,
                "actual_qty": warehouse_stock_by_product.get(product.id, 0.0),
                "reserved_qty": warehouse_reserved_by_product.get(product.id, 0.0),
                "uom": product.uom_id.name,
                "mode": product.product_tmpl_id.bayaan_consumption_mode,
                "category": product.categ_id.display_name,
            } for product in products],
            "products": [self._serialize_stock_item(product) for product in products],
            "recipes": [{
                "id": recipe.id,
                "product": recipe.product_id.display_name,
                "product_code": recipe.product_id.default_code,
                "version": recipe.version_label,
                "state": recipe.state,
                "effective_from": self._bayaan_local_datetime(recipe.effective_from),
                "waste_allowance_percent": recipe.waste_allowance_percent,
                "estimated_unit_cost": recipe.estimated_unit_cost,
                "lines": [{
                    "ingredient": line.ingredient_id.display_name,
                    "ingredient_code": line.ingredient_id.default_code,
                    "qty": line.qty,
                    "uom": line.uom_id.name,
                    "unit_cost": line.ingredient_id.standard_price,
                    "line_cost": line.qty * line.ingredient_id.standard_price,
                } for line in recipe.line_ids],
            } for recipe in recipes],
            "purchase_orders": [{
                "id": order.id,
                "name": order.name,
                "supplier": order.partner_id.name,
                "invoice": order.partner_ref or "",
                "warehouse": order.picking_type_id.warehouse_id.name if order.picking_type_id.warehouse_id else "",
                "date_order": self._bayaan_local_datetime(order.date_order),
                "state": order.state,
                "receipt_state": (
                    "none" if not order.picking_ids
                    else "done" if all(picking.state == "done" for picking in order.picking_ids)
                    else "open"
                ),
                "amount_total": order.amount_total,
                "currency": order.currency_id.name,
                "pickings": [self._serialize_picking_action(picking) for picking in order.picking_ids],
                "lines": [{
                    "product": line.product_id.default_code or line.product_id.display_name,
                    "qty": line.product_qty,
                    "uom": line.product_uom_id.name,
                    "price_unit": line.price_unit,
                    "subtotal": line.price_subtotal,
                    "planned_date": self._bayaan_local_datetime(line.date_planned),
                } for line in order.order_line],
            } for order in purchases],
            "suppliers": [
                self._serialize_supplier_partner(
                    partner,
                    supplier_spend30.get(partner.id, 0.0),
                    supplier_last_order.get(partner.id, "-"),
                )
                for partner in suppliers
            ],
            "recurring_purchases": [
                self._serialize_recurring_purchase(plan)
                for plan in recurring_purchases
            ],
            "kiosk_stock": kiosk_stock_grouped,
            "kiosk_stock_rows": kiosk_stock_rows,
            "transfers": transfer_rows,
            "suggested_transfers": suggested_transfer_rows,
            "closings": [{
                "id": close.id,
                "name": close.name,
                "kioskId": close.kiosk_id.kiosk_code,
                "kioskName": close.kiosk_id.name,
                "city": close.kiosk_id.city,
                "cashier": close.cashier_id.name,
                "openedAt": self._bayaan_local_datetime(close.opened_at),
                "closedAt": self._bayaan_local_datetime(close.closed_at),
                "sales": sum(close.pos_order_ids.mapped("amount_total")),
                "expectedCash": close.expected_cash,
                "countedCash": close.actual_cash,
                "cashVariance": close.cash_variance,
                "cashPayments": close_payment_totals.get(close.id, {}).get("cash", 0.0),
                "digitalPayments": close_payment_totals.get(close.id, {}).get("digital", 0.0),
                "expectedCard": close.expected_card or close_payment_totals.get(close.id, {}).get("card", close_payment_totals.get(close.id, {}).get("digital", 0.0)),
                "countedCard": close.actual_card,
                "cardVariance": close.card_variance,
                "wasteCost": waste_cost_by_kiosk.get(close.kiosk_id.id, 0.0),
                "status": close_status(close),
                "investigationStatus": close_investigation_status(close),
                "notes": close_notes(close),
                "managerReviewState": close.manager_review_state,
                "managerReviewedBy": close.manager_reviewed_by_id.name,
                "managerReviewedAt": self._bayaan_local_datetime(close.manager_reviewed_at),
                "recipePostingIssues": len(close_recipe_posting_issues(close)),
                "recipePostingIssueOrders": close_recipe_posting_issues(close).mapped("name")[:5],
                "stock": [{
                    "item": line.product_id.display_name,
                    "unit": line.uom_id.name,
                    "expected": line.expected_qty,
                    "actual": line.actual_qty,
                    "variance": line.variance_qty,
                    "value": line.variance_qty * line.product_id.standard_price,
                } for line in close.stock_count_line_ids],
            } for close in closings],
            "today": {
                "orders": [{
                    "name": sale.name,
                    "kiosk": sale.bayaan_kiosk_id.kiosk_code,
                    "pos_config": sale.config_id.name,
                    "cashier": sale.user_id.name,
                    "date_order": self._bayaan_local_datetime(sale.date_order),
                    "amount_total": sale.amount_total,
                    "state": sale.state,
                    "consumption_state": sale.bayaan_consumption_state,
                    "payments": [{
                        "method": payment.payment_method_id.name,
                        "category": payment_category(payment),
                        "provider": payment_gateway(payment),
                        "amount": payment.amount,
                    } for payment in sale.payment_ids],
                    "lines": [{
                        "product": line.product_id.display_name,
                        "qty": line.qty,
                        "price_subtotal_incl": line.price_subtotal_incl,
                    } for line in sale.lines],
                } for sale in sales],
                "payments": [{
                    "order": sale.name,
                    "kiosk": sale.bayaan_kiosk_id.kiosk_code,
                    "method": payment.payment_method_id.name,
                    "category": payment_category(payment),
                    "provider": payment_gateway(payment),
                    "amount": payment.amount,
                } for sale in sales for payment in sale.payment_ids],
                "sales": [{
                    "name": sale.name,
                    "kiosk": sale.bayaan_kiosk_id.kiosk_code,
                    "pos_config": sale.config_id.name,
                    "revenue": sale.amount_total,
                    "orders": 1,
                    "amount_total": sale.amount_total,
                    "consumption_state": sale.bayaan_consumption_state,
                } for sale in sales],
                "consumption": [{
                    "id": line.id,
                    "order": line.pos_order_id.name,
                    "kiosk": line.kiosk_id.kiosk_code,
                    "sold_product": line.product_id.display_name,
                    "ingredient": line.ingredient_id.display_name,
                    "qty": line.ingredient_qty,
                    "uom": line.uom_id.name,
                    "cost": line.total_cost,
                    "consumed_at": self._bayaan_local_datetime(line.consumed_at),
                } for line in consumption],
                "waste": [{
                    "id": entry.id,
                    "name": entry.name,
                    "kiosk": entry.kiosk_id.kiosk_code,
                    "product": entry.product_id.display_name,
                    "qty": entry.qty,
                    "uom": entry.product_id.uom_id.name,
                    "reason": entry.reason,
                    "estimated_cost": entry.estimated_cost,
                    "state": entry.state,
                    "create_date": self._bayaan_local_datetime(entry.create_date),
                } for entry in waste],
            },
        }

    @http.route("/bayaan/api/peak_hour_report", type="jsonrpc", auth="user")
    def peak_hour_report(self, **kwargs):
        self._require_chain_read_scope("read peak-hour item sales")
        payload = self._payload(kwargs)
        today = fields.Date.context_today(request.env.user)
        start = self._report_datetime(payload.get("date_from") or payload.get("dateFrom"), datetime.combine(today, time.min))
        end = self._report_datetime(payload.get("date_to") or payload.get("dateTo"), datetime.combine(today, time.min) + timedelta(days=1), end_of_day=True)
        kiosk = self._require_kiosk(payload.get("kiosk")) if payload.get("kiosk") else False
        product = self._product(payload.get("product") or payload.get("item")) if payload.get("product") or payload.get("item") else False
        if payload.get("product") or payload.get("item"):
            if not product:
                raise UserError("Product not found for peak-hour report.")

        line_domain = [
            ("order_id.company_id", "=", request.env.company.id),
            ("order_id.date_order", ">=", start),
            ("order_id.date_order", "<", end),
            ("order_id.state", "not in", ["draft", "cancel"]),
        ]
        if kiosk:
            line_domain += [
                "|",
                ("order_id.bayaan_kiosk_id", "=", kiosk.id),
                ("order_id.config_id", "=", kiosk.pos_config_id.id),
            ]
        if product:
            line_domain += [("product_id", "=", product.id)]

        OrderLine = request.env["pos.order.line"].sudo()
        Kiosk = request.env["bayaan.kiosk"].sudo()
        kiosk_by_config = {
            row.pos_config_id.id: row
            for row in Kiosk.search([
                ("company_id", "=", request.env.company.id),
                ("pos_config_id", "!=", False),
            ])
        }
        grouped = {}
        order_lines = OrderLine.search(line_domain, order="id", limit=20000)
        for line in sorted(order_lines, key=lambda row: (row.order_id.date_order, row.order_id.id, row.id)):
            order = line.order_id
            order_kiosk = order.bayaan_kiosk_id or kiosk_by_config.get(order.config_id.id)
            local_date = fields.Datetime.context_timestamp(request.env.user, order.date_order)
            hour = local_date.hour
            key = (
                order_kiosk.kiosk_code if order_kiosk else "",
                line.product_id.id,
                hour,
                order.user_id.id,
                order.session_id.id,
            )
            row = grouped.setdefault(key, {
                "kiosk": order_kiosk.kiosk_code if order_kiosk else "",
                "kioskName": order_kiosk.name if order_kiosk else "",
                "product": line.product_id.default_code or line.product_id.display_name,
                "productName": line.product_id.display_name,
                "hour": hour,
                "hourLabel": "%02d:00" % hour,
                "cashier": order.user_id.name,
                "shift": order.session_id.name,
                "qty": 0.0,
                "revenue": 0.0,
                "_orders": set(),
            })
            row["qty"] += line.qty
            row["revenue"] += line.price_subtotal_incl
            row["_orders"].add(order.id)

        rows = []
        hourly = {}
        products = {}
        for row in grouped.values():
            order_count = len(row.pop("_orders"))
            row["orders"] = order_count
            row["qty"] = round(row["qty"], 4)
            row["revenue"] = round(row["revenue"], 2)
            rows.append(row)
            hour_row = hourly.setdefault(row["hour"], {"hour": row["hour"], "hourLabel": row["hourLabel"], "qty": 0.0, "revenue": 0.0, "orders": 0})
            hour_row["qty"] += row["qty"]
            hour_row["revenue"] += row["revenue"]
            hour_row["orders"] += order_count
            product_row = products.setdefault(row["product"], {"product": row["product"], "productName": row["productName"], "qty": 0.0, "revenue": 0.0, "orders": 0})
            product_row["qty"] += row["qty"]
            product_row["revenue"] += row["revenue"]
            product_row["orders"] += order_count

        for collection in (hourly.values(), products.values()):
            for row in collection:
                row["qty"] = round(row["qty"], 4)
                row["revenue"] = round(row["revenue"], 2)

        return {
            "engine": "odoo_pos",
            "dateFrom": fields.Datetime.to_string(start),
            "dateTo": fields.Datetime.to_string(end),
            "filters": {
                "kiosk": kiosk.kiosk_code if kiosk else "",
                "product": product.default_code if product else "",
            },
            "rows": sorted(rows, key=lambda row: (row["kiosk"], row["productName"], row["hour"], row["cashier"], row["shift"])),
            "hourlyTotals": sorted(hourly.values(), key=lambda row: row["hour"]),
            "topProducts": sorted(products.values(), key=lambda row: (-row["qty"], -row["revenue"], row["productName"])),
        }

    @http.route("/bayaan/api/recipe_version", type="jsonrpc", auth="user")
    def recipe_version(self, **kwargs):
        self._require_manager_scope("manage product recipes")
        payload = self._payload(kwargs)
        product = self._require_product(payload.get("item") or payload.get("itemId"))
        ingredients = payload.get("ingredients", [])
        if not ingredients:
            raise UserError("A Bayaan recipe needs at least one ingredient.")

        recipe_lines = []
        for line in ingredients:
            ingredient = self._require_product(line.get("ingredient") or line.get("ingredientId"))
            qty = self._float_value(line.get("qty"))
            if qty <= 0:
                raise UserError("Recipe quantity must be greater than zero for %s." % ingredient.display_name)
            recipe_lines.append((0, 0, {
                "ingredient_id": ingredient.id,
                "qty": qty,
                "uom_id": self._uom(line.get("uom"), ingredient.uom_id).id,
            }))

        recipe = request.env["bayaan.recipe"].sudo().create({
            "product_id": product.id,
            "version_label": payload.get("version") or payload.get("version_label") or "v1",
            "effective_from": payload.get("effective_from") or payload.get("effectiveFrom") or fields.Datetime.now(),
            "waste_allowance_percent": payload.get("waste_allowance_percent") or payload.get("wasteAllowancePercent") or 0,
            "line_ids": recipe_lines,
        })
        product.product_tmpl_id.sudo().bayaan_consumption_mode = "recipe"
        if payload.get("submit", True):
            recipe.action_activate()
        self._audit_event(
            "catalog",
            "recipe.%s" % recipe.state,
            "Recipe %s for %s" % (recipe.state, product.display_name),
            "%s ingredient line(s)" % len(recipe.line_ids),
            record=recipe,
            severity="success",
            payload=payload,
        )
        return {
            "id": recipe.id,
            "state": recipe.state,
            "estimated_unit_cost": recipe.estimated_unit_cost,
        }

    @http.route("/bayaan/api/pos_sale", type="jsonrpc", auth="user")
    def pos_sale(self, **kwargs):
        # Guardrail kept for backwards compatibility. The Bayaan dashboard
        # cashier flow now goes through /bayaan/api/kiosk_sale (below). The
        # customized Odoo POS Owl interface continues to write pos.order
        # records directly through the standard POS path.
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        return {
            "accepted": False,
            "engine": "odoo_pos",
            "external_id": payload.get("external_id"),
            "kiosk": kiosk.kiosk_code,
            "note": "This endpoint is a guardrail. Use /bayaan/api/kiosk_sale to create a sale from the Bayaan kiosk dashboard, or use the customized Odoo POS interface directly.",
        }

    def _resolve_kiosk_payment_method(self, session, method_name):
        """Find a pos.payment.method on this session that matches a name like
        'card' / 'cash' / 'zain cash' / 'fib' from the Bayaan POS UI."""
        if not session:
            raise UserError("Cannot resolve payment method without an open POS session.")
        norm = (method_name or "").strip().lower()
        methods = session.config_id.payment_method_ids
        if not methods:
            raise UserError("POS configuration %s has no payment methods configured." % session.config_id.display_name)
        if norm:
            token = self._payment_token(norm)
            for method in methods:
                if token in self._payment_method_tokens(method):
                    return method
        raise UserError(
            "Payment method '%s' is not configured on POS %s. Configure it in Odoo first."
            % (method_name or "empty", session.config_id.display_name)
        )

    def _resolve_kiosk_price_unit(self, kiosk, product, qty):
        pricelist = kiosk.pos_config_id.pricelist_id
        if pricelist:
            return pricelist.sudo()._get_product_price(
                product.sudo(),
                qty,
                currency=request.env.company.currency_id,
                uom=product.uom_id,
                date=fields.Datetime.now(),
            )
        return product.list_price

    def _line_discount_percent(self, item, product):
        discount_percent = None
        for key in ("discount_percent", "discountPercent", "discount"):
            if item.get(key) not in (None, ""):
                discount_percent = self._float_value(item.get(key), 0.0)
                break
        discount_percent = discount_percent if discount_percent is not None else 0.0
        if discount_percent < 0.0 or discount_percent > 100.0:
            raise UserError("Discount for %s must be between 0 and 100 percent." % product.display_name)
        return discount_percent

    def _line_discount_reason(self, item):
        return (item.get("discount_reason") or item.get("discountReason") or item.get("manager_note") or "").strip()

    def _waste_estimated_cost(self, product, qty):
        mode = product.product_tmpl_id.bayaan_consumption_mode
        total = 0.0
        if mode in ("recipe", "hybrid"):
            recipe = request.env["bayaan.recipe"].sudo().get_active_recipe(
                product, request.env.company, fields.Datetime.now()
            )
            if recipe:
                total += recipe.estimated_unit_cost * qty
        if mode in ("finished", "hybrid", "none"):
            total += product.standard_price * qty
        return total

    def _open_kiosk_session(self, kiosk, cashier_user, opening_cash=0.0):
        """Find an open pos.session for this kiosk's pos.config, or open one."""
        Session = request.env["pos.session"].sudo()
        existing = Session.search([
            ("config_id", "=", kiosk.pos_config_id.id),
            ("state", "in", ("opening_control", "opened")),
        ], order="start_at desc", limit=1)
        if existing:
            if existing.state == "opening_control":
                existing.action_pos_session_open()
            return existing
        session = Session.with_user(cashier_user.id).create({
            "config_id": kiosk.pos_config_id.id,
            "user_id": cashier_user.id,
        })
        if session.state == "opening_control":
            if hasattr(session, "set_opening_control"):
                session.set_opening_control(opening_cash or 0.0, "")
            else:
                session.action_pos_session_open()
        return session

    @http.route("/bayaan/api/open_session", type="jsonrpc", auth="user")
    def open_session(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "open_session")
        cashier = request.env.user
        opening_cash = self._float_value(payload.get("opening_cash"), 0.0)
        session = self._open_kiosk_session(kiosk, cashier, opening_cash)
        self._audit_event(
            "pos",
            "session.opened",
            "POS session opened: %s" % kiosk.kiosk_code,
            "Cashier %s" % cashier.name,
            record=session,
            kiosk=kiosk,
            severity="success",
            payload=payload,
        )
        return {
            "id": session.id,
            "name": session.name,
            "state": session.state,
            "kiosk": kiosk.kiosk_code,
            "config_id": session.config_id.id,
        }

    @http.route("/bayaan/api/kiosk_sale", type="jsonrpc", auth="user")
    def kiosk_sale(self, **kwargs):
        """Create a real pos.order from the Bayaan kiosk dashboard. Triggers
        the recipe consumption hook (writes stock.scrap + bayaan.consumption.ledger).
        """
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "sale")
        items = payload.get("items") or []
        payments = payload.get("payments") or []
        if not items:
            raise UserError("Cannot create a sale with no items.")
        if not payments:
            raise UserError("Cannot create a sale with no payment.")
        cashier = request.env.user

        session = self._open_kiosk_session(kiosk, cashier)

        # Idempotency: if external_id has already been posted, return the existing order.
        external_id = payload.get("external_id") or ""
        PosOrder = request.env["pos.order"].sudo()
        if external_id:
            existing = PosOrder.search([("pos_reference", "=", external_id), ("session_id.config_id", "=", kiosk.pos_config_id.id)], limit=1)
            if existing:
                return self._serialize_kiosk_order(existing, idempotent=True)

        order_lines = []
        amount_total = 0.0
        amount_tax = 0.0
        discount_audit_rows = []
        for item in items:
            product = self._sale_product(
                item.get("product") or item.get("item"),
                item.get("name"),
            )
            qty = self._float_value(item.get("qty"), 1.0)
            if qty <= 0:
                raise UserError("Sale line for %s must have positive qty." % product.display_name)
            price_unit = self._resolve_kiosk_price_unit(kiosk, product, qty)
            client_price_unit = self._float_value(
                item.get("price_unit") if item.get("price_unit") not in (None, "") else item.get("price"),
                price_unit,
            )
            discount_percent = self._line_discount_percent(item, product)
            discount_reason = self._line_discount_reason(item)
            if discount_percent:
                if not self._is_bayaan_manager():
                    raise UserError("Only Bayaan managers can authorize POS discounts.")
                if not discount_reason:
                    raise UserError("Manager discount reason is required.")
            tax_ids = product.taxes_id.filtered(lambda tax, c=request.env.company: tax.company_id == c)
            try:
                modifier_price_delta = float(item.get("modifier_price_delta") or 0.0)
            except (TypeError, ValueError):
                modifier_price_delta = 0.0
            # Modifier delta adjusts the pricelist-resolved unit price; pricelist remains
            # the source of truth for the base, the cashier just adds variant deltas.
            modified_unit = price_unit + modifier_price_delta
            if modified_unit < 0:
                modified_unit = 0.0
            effective_price_unit = modified_unit * (1.0 - (discount_percent / 100.0))
            line_subtotal = effective_price_unit * qty
            line_total = line_subtotal
            line_tax = 0.0
            if tax_ids:
                # Bayaan UI sends the customer-facing sticker price. Treat it
                # as tax-included so payment totals stay equal to cashier total.
                tax_calc = tax_ids.with_context(force_price_include=True).compute_all(
                    effective_price_unit,
                    request.env.company.currency_id,
                    qty,
                    product=product,
                )
                line_total = tax_calc["total_included"]
                line_subtotal = tax_calc["total_excluded"]
                line_tax = line_total - line_subtotal
            modifier_signature = (item.get("modifier_signature") or "").strip()
            try:
                modifier_recipe_factor = float(item.get("modifier_recipe_factor") or 1.0)
            except (TypeError, ValueError):
                modifier_recipe_factor = 1.0
            if modifier_recipe_factor <= 0:
                modifier_recipe_factor = 1.0
            modifier_summary = (item.get("modifier_summary") or "").strip()
            line_vals = {
                "name": item.get("name") or product.display_name,
                "product_id": product.id,
                "qty": qty,
                # Persist the modified unit price so reports/receipts show the actual
                # cashier-displayed amount, including modifier delta. The pricelist-
                # resolved base remains in the audit row (server_price_unit) on discount.
                "price_unit": modified_unit,
                "discount": discount_percent,
                "price_subtotal": line_subtotal,
                "price_subtotal_incl": line_total,
                "tax_ids": [(6, 0, tax_ids.ids)] if tax_ids else False,
                "bayaan_modifier_recipe_factor": modifier_recipe_factor,
            }
            if modifier_signature:
                line_vals["bayaan_modifier_signature"] = modifier_signature
            if modifier_summary:
                line_vals["bayaan_modifier_summary"] = modifier_summary
            order_lines.append((0, 0, line_vals))
            if discount_percent:
                discount_audit_rows.append({
                    "product": product.default_code or product.display_name,
                    "product_id": product.id,
                    "qty": qty,
                    "server_price_unit": price_unit,
                    "client_price_unit": client_price_unit,
                    "discount_percent": discount_percent,
                    "discount_reason": discount_reason,
                    "discounted_unit": effective_price_unit,
                    "line_total": line_total,
                })
            amount_total += line_total
            amount_tax += line_tax

        payment_rows = []
        payment_total = 0.0
        for payment in payments:
            method = self._resolve_kiosk_payment_method(session, payment.get("method"))
            amount = self._float_value(payment.get("amount"), 0.0)
            if amount <= 0:
                raise UserError("Payment amount for %s must be positive." % method.display_name)
            payment_rows.append((method, amount))
            payment_total += amount

        precision = request.env.company.currency_id.rounding or 0.01
        if float_compare(payment_total, amount_total, precision_rounding=precision) != 0:
            raise UserError(
                "Payment total %s does not match order total %s."
                % (payment_total, amount_total)
            )

        order_vals = {
            "session_id": session.id,
            "company_id": request.env.company.id,
            "user_id": cashier.id,
            "amount_total": amount_total,
            "amount_tax": amount_tax,
            "amount_paid": amount_total,
            "amount_return": 0.0,
            "lines": order_lines,
            "bayaan_kiosk_id": kiosk.id,
        }
        if kiosk.pos_config_id.pricelist_id:
            order_vals["pricelist_id"] = kiosk.pos_config_id.pricelist_id.id
        if external_id:
            order_vals["pos_reference"] = external_id
        if payload.get("posting_date"):
            try:
                posting_date = str(payload["posting_date"])
                if "T" in posting_date or len(posting_date) > 10:
                    order_vals["date_order"] = fields.Datetime.to_datetime(posting_date)
                else:
                    # Bare date (no time): stamp the current time-of-day rather than midnight.
                    # A 00:00:00 date_order sorts a live sale to the bottom of the day's order
                    # feed (dashboards sort by date_order desc), so it reads as "missing" in the
                    # admin even though the order posted correctly.
                    bare_date = fields.Date.to_date(posting_date)
                    order_vals["date_order"] = datetime.combine(bare_date, fields.Datetime.now().time())
            except Exception:
                pass

        order = PosOrder.create(order_vals)

        for method, amount in payment_rows:
            request.env["pos.payment"].sudo().create({
                "pos_order_id": order.id,
                "amount": amount,
                "payment_method_id": method.id,
                "session_id": session.id,
            })

        order.write({"state": "paid"})
        order._process_saved_order(False)

        for discount_row in discount_audit_rows:
            self._audit_event(
                "pos",
                "sale.discount.approved",
                "POS discount approved: %s" % order.name,
                "%s approved %.2f%% on %s: %s"
                % (
                    cashier.name,
                    discount_row["discount_percent"],
                    discount_row["product"],
                    discount_row["discount_reason"],
                ),
                record=order,
                kiosk=kiosk,
                severity="warning",
                payload={
                    "order": order.name,
                    "external_id": external_id,
                    "manager_id": cashier.id,
                    "manager_login": cashier.login,
                    **discount_row,
                },
            )

        self._audit_event(
            "pos",
            "sale.paid",
            "Sale paid: %s" % order.name,
            "%s - %.2f" % (kiosk.kiosk_code, order.amount_total),
            record=order,
            kiosk=kiosk,
            severity="success",
            payload={
                "external_id": external_id,
                "items": items,
                "payment_count": len(payments),
                "amount_total": order.amount_total,
                "pricelist": kiosk.pos_config_id.pricelist_id.display_name if kiosk.pos_config_id.pricelist_id else "",
                "discount_count": len(discount_audit_rows),
            },
        )
        return self._serialize_kiosk_order(order)

    def _serialize_kiosk_order(self, order, idempotent=False):
        return {
            "id": order.id,
            "name": order.name,
            "external_id": order.pos_reference or "",
            "state": order.state,
            "amount_total": order.amount_total,
            "amount_tax": order.amount_tax,
            "session_id": order.session_id.id,
            "consumption_state": order.bayaan_consumption_state,
            "consumption_error": order.bayaan_consumption_error or "",
            "consumption_lines": [{
                "ingredient": ledger.ingredient_id.display_name,
                "qty": ledger.ingredient_qty,
                "uom": ledger.uom_id.name,
            } for ledger in order.bayaan_consumption_ledger_ids],
            "idempotent": idempotent,
        }

    @http.route("/bayaan/api/waste", type="jsonrpc", auth="user")
    def waste(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "waste")
        product = self._sale_product(payload.get("item"), payload.get("name"))
        qty = self._float_value(payload.get("qty"), 1.0)
        entry = request.env["bayaan.waste.entry"].sudo().create({
            "kiosk_id": kiosk.id,
            "product_id": product.id,
            "qty": qty,
            "reason": payload.get("reason") or "Waste",
            "estimated_cost": self._waste_estimated_cost(product, qty),
        })
        entry.action_post()
        self._audit_event(
            "stock",
            "waste.posted",
            "Waste posted: %s" % product.display_name,
            "%s x %s at %s" % (qty, product.uom_id.name, kiosk.kiosk_code),
            record=entry,
            kiosk=kiosk,
            severity="warning",
            payload=payload,
        )
        return {"id": entry.id, "state": entry.state, "scrap_ids": entry.scrap_ids.ids}

    @http.route("/bayaan/api/stock_transfer", type="jsonrpc", auth="user")
    def stock_transfer(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "transfer")
        return self._create_kiosk_draft_transfer(kiosk, payload)

    @http.route("/bayaan/api/stock_request", type="jsonrpc", auth="user")
    def stock_request(self, **kwargs):
        """Cashier-initiated low-stock request. Creates a DRAFT warehouse->kiosk transfer
        that logistics/manager approves and dispatches; the kiosk then confirms receipt at
        the POS. Lets a cashier flag low stock without holding transfer-create rights."""
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "stock_request")
        if not payload.get("origin") and not payload.get("external_id") and not payload.get("externalId"):
            payload = dict(payload, origin="Kiosk stock request - %s" % kiosk.kiosk_code)
        return self._create_kiosk_draft_transfer(kiosk, payload, requested=True)

    def _create_kiosk_draft_transfer(self, kiosk, payload, requested=False):
        transfer_items = payload.get("items") or [{
            "item": payload.get("item"),
            "qty": payload.get("qty"),
            "uom": payload.get("uom"),
        }]

        Warehouse = request.env["stock.warehouse"].sudo()
        requested_warehouse = payload.get("from_warehouse") or payload.get("warehouse")
        warehouse = False
        company_domain = [("company_id", "=", request.env.company.id)]
        if requested_warehouse:
            requested_warehouse = str(requested_warehouse)
            if requested_warehouse.isdigit():
                warehouse = Warehouse.search(company_domain + [("id", "=", int(requested_warehouse))], limit=1)
            if not warehouse:
                warehouse = Warehouse.search(company_domain + [
                    "|",
                    ("code", "=", requested_warehouse),
                    ("name", "ilike", requested_warehouse),
                ], limit=1)
        if not warehouse:
            warehouse = Warehouse.search(company_domain, limit=1)
        if not warehouse or not warehouse.int_type_id:
            raise UserError("No internal transfer operation type is configured for this company.")
        picking_type = warehouse.int_type_id
        source_location = warehouse.lot_stock_id or picking_type.default_location_src_id

        move_commands = []
        for line in transfer_items:
            product = self._require_product(line.get("item") or line.get("itemId") or line.get("product"))
            qty = self._float_value(
                line.get("qty")
                if line.get("qty") is not None
                else line.get("quantity"),
                0.0,
            )
            if not qty or qty <= 0:
                raise UserError("Stock transfer quantity must be greater than zero for %s." % product.display_name)
            uom = self._uom(line.get("uom"), product.uom_id)
            move_commands.append((0, 0, {
                "product_id": product.id,
                "product_uom_qty": qty,
                "product_uom": uom.id,
                "location_id": source_location.id,
                "location_dest_id": kiosk.stock_location_id.id,
            }))
        if not move_commands:
            raise UserError("Stock transfer needs at least one item.")

        transfer_origin = payload.get("origin") or payload.get("external_id") or payload.get("externalId")
        picking_vals = {
            "picking_type_id": picking_type.id,
            "location_id": source_location.id,
            "location_dest_id": kiosk.stock_location_id.id,
            "bayaan_transfer_state": "draft",
            "move_ids": move_commands,
        }
        if transfer_origin:
            picking_vals["origin"] = str(transfer_origin)[:255]
        picking = request.env["stock.picking"].sudo().create(picking_vals)
        kiosk.last_stock_transfer_at = fields.Datetime.now()
        self._audit_event(
            "stock",
            "transfer.requested" if requested else "transfer.created",
            "%s: %s" % ("Stock requested by kiosk" if requested else "Transfer created", picking.name),
            "%s to %s" % (source_location.complete_name, kiosk.kiosk_code),
            record=picking,
            kiosk=kiosk,
            severity="warning" if requested else "success",
            payload=payload,
        )
        result = self._serialize_picking_action(picking)
        if isinstance(result, dict):
            result["requested"] = requested
        return result

    @http.route("/bayaan/api/stock_transfer_action", type="jsonrpc", auth="user")
    def stock_transfer_action(self, **kwargs):
        payload = self._payload(kwargs)
        picking = self._picking(payload.get("transfer") or payload.get("picking"))
        if picking.picking_type_id.code != "internal":
            raise UserError("%s is not an internal warehouse-to-kiosk transfer." % picking.name)
        action = (payload.get("action") or "").lower()
        kiosk = self._kiosk_for_picking(picking)
        if kiosk:
            receive_action = action in ("receive", "received", "done", "complete")
            self._require_kiosk_scope(kiosk, "transfer_receive" if receive_action else "transfer")
            if receive_action and picking.bayaan_transfer_state != "dispatched":
                raise UserError("Kiosk users can only receive dispatched transfers.")

        if action in ("approve", "confirm"):
            if picking.state == "draft":
                picking.action_confirm()
            if picking.state in ("confirmed", "waiting", "partially_available"):
                picking.action_assign()
            picking.bayaan_transfer_state = "approved"
        elif action in ("pick", "picked", "dispatch", "dispatched"):
            if picking.state == "draft":
                picking.action_confirm()
            picking.action_assign()
            for move in picking.move_ids.filtered(lambda move: move.state not in ("done", "cancel")):
                if action in ("dispatch", "dispatched") and not move.quantity:
                    move._set_quantity_done(move.product_uom_qty)
                move.picked = True
            picking.bayaan_transfer_state = "dispatched" if action in ("dispatch", "dispatched") else "picked"
        elif action in ("receive", "received", "done", "complete"):
            self._validate_picking(picking, payload.get("items"))
            picking.bayaan_transfer_state = "received"
        elif action == "cancel":
            picking.action_cancel()
            picking.bayaan_transfer_state = "cancelled"
        else:
            raise UserError("Unsupported transfer action: %s" % (payload.get("action") or "empty value"))

        picking.invalidate_recordset()
        status_label = picking.bayaan_transfer_state or picking.state
        self._audit_event(
            "stock",
            "transfer.%s" % status_label,
            "Transfer %s: %s" % (status_label, picking.name),
            "%s to %s" % (picking.location_id.complete_name, picking.location_dest_id.complete_name),
            record=picking,
            kiosk=kiosk,
            severity="success" if status_label not in ("cancelled", "cancel") else "warning",
            payload=payload,
        )
        return self._serialize_picking_action(picking)

    @http.route("/bayaan/api/purchase_order", type="jsonrpc", auth="user")
    def purchase_order(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        supplier_name = payload.get("supplier")
        if not supplier_name:
            raise UserError("Supplier is required.")
        partner = request.env["res.partner"].sudo().search([("name", "=", supplier_name)], limit=1)
        if not partner:
            partner = request.env["res.partner"].sudo().create({
                "name": supplier_name,
                "supplier_rank": 1,
            })

        order_lines = []
        for line in payload.get("items", []):
            product = self._require_product(line.get("item"))
            qty = self._float_value(line.get("qty"))
            if not qty or qty <= 0:
                raise UserError("Purchase quantity must be greater than zero for %s." % product.display_name)
            order_lines.append((0, 0, {
                "product_id": product.id,
                "product_qty": qty,
                "product_uom_id": product.uom_id.id,
                "price_unit": self._float_value(line.get("rate"), 0.0),
                "date_planned": payload.get("schedule_date") or fields.Datetime.now(),
            }))
        if not order_lines:
            raise UserError("Purchase order needs at least one item.")

        warehouse = self._warehouse(payload.get("warehouse") or payload.get("to_warehouse"))
        order_vals = {
            "partner_id": partner.id,
            "date_order": fields.Datetime.now(),
            "date_planned": payload.get("schedule_date") or fields.Datetime.now(),
            "order_line": order_lines,
        }
        if warehouse and warehouse.in_type_id:
            order_vals["picking_type_id"] = warehouse.in_type_id.id

        order = request.env["purchase.order"].sudo().create(order_vals)
        self._attach_purchase_invoice(order, payload)
        order.button_confirm()
        self._audit_event(
            "procurement",
            "purchase.created",
            "Purchase order created: %s" % order.name,
            "%s - %s line(s)" % (partner.name, len(order.order_line)),
            record=order,
            severity="success",
            payload=payload,
        )
        return {"id": order.id, "name": order.name, "state": order.state}

    @http.route("/bayaan/api/recurring_purchase", type="jsonrpc", auth="user")
    def recurring_purchase(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        Recurring = request.env["bayaan.recurring.purchase"].sudo()
        if not payload:
            plans = Recurring.search([("company_id", "=", request.env.company.id)], order="next_date, name", limit=200)
            return {"engine": "odoo_pos", "recurring_purchases": [self._serialize_recurring_purchase(plan) for plan in plans]}

        action = (payload.get("action") or "save").lower()
        plan = Recurring.browse()
        if payload.get("id") or payload.get("recurring"):
            plan = Recurring.browse(int(payload.get("id") or payload.get("recurring")))
            if not plan.exists() or plan.company_id != request.env.company:
                raise UserError("Recurring purchase not found.")

        if action in ("run", "create_po"):
            if not plan:
                raise UserError("Recurring purchase id is required to create a PO.")
            orders = plan.action_create_purchase_order()
            self._audit_event(
                "procurement",
                "recurring_purchase.run",
                "Recurring purchase created PO: %s" % plan.name,
                ", ".join(orders.mapped("name")),
                record=plan,
                severity="success",
                payload=payload,
            )
            return {
                "engine": "odoo_pos",
                "recurring_purchase": self._serialize_recurring_purchase(plan),
                "purchase_orders": [{"id": order.id, "name": order.name, "state": order.state} for order in orders],
            }

        supplier_name = payload.get("supplier")
        if not supplier_name:
            raise UserError("Supplier is required.")
        partner = request.env["res.partner"].sudo().search([("name", "=", supplier_name)], limit=1)
        if not partner:
            partner = request.env["res.partner"].sudo().create({
                "name": supplier_name,
                "supplier_rank": 1,
                "company_id": request.env.company.id,
            })
        else:
            partner.supplier_rank = max(partner.supplier_rank, 1)

        warehouse = self._warehouse(payload.get("warehouse"))
        if not warehouse:
            raise UserError("Warehouse is required.")

        line_commands = []
        for line in payload.get("items", []):
            product = self._require_product(line.get("item") or line.get("itemId"))
            qty = self._float_value(line.get("qty"), 0.0)
            if qty <= 0:
                raise UserError("Recurring purchase quantity must be greater than zero for %s." % product.display_name)
            line_commands.append((0, 0, {
                "product_id": product.id,
                "qty": qty,
                "uom_id": self._uom(line.get("uom"), product.uom_id).id,
                "price_unit": self._float_value(line.get("rate") or line.get("priceUnit"), product.standard_price),
            }))
        if not line_commands:
            raise UserError("Recurring purchase needs at least one item.")

        vals = {
            "name": payload.get("name") or "%s recurring purchase" % partner.name,
            "partner_id": partner.id,
            "warehouse_id": warehouse.id,
            "frequency": payload.get("frequency") or "weekly",
            "weekday": str(payload.get("weekday") if payload.get("weekday") is not None else "0"),
            "next_date": payload.get("next_date") or payload.get("nextDate") or fields.Date.context_today(request.env.user),
            "active": payload.get("active", True),
            "company_id": request.env.company.id,
            "line_ids": [(5, 0, 0)] + line_commands,
        }
        if plan:
            plan.write(vals)
            audit_action = "recurring_purchase.updated"
        else:
            plan = Recurring.create(vals)
            audit_action = "recurring_purchase.created"

        self._audit_event(
            "procurement",
            audit_action,
            "Recurring purchase saved: %s" % plan.name,
            "%s, %s line(s)" % (plan.partner_id.name, len(plan.line_ids)),
            record=plan,
            severity="success",
            payload=payload,
        )
        return {"engine": "odoo_pos", "recurring_purchase": self._serialize_recurring_purchase(plan)}

    @http.route("/bayaan/api/purchase_order_action", type="jsonrpc", auth="user")
    def purchase_order_action(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        order = self._purchase_order(payload.get("po") or payload.get("purchase_order") or payload.get("order"))
        action = (payload.get("action") or "").lower()

        if action in ("confirm", "approve", "approved"):
            if order.state in ("draft", "sent"):
                order.button_confirm()
        elif action in ("receive", "received", "complete", "done"):
            if order.state in ("draft", "sent"):
                order.button_confirm()
            open_pickings = order.picking_ids.filtered(lambda picking: picking.state not in ("done", "cancel"))
            if not open_pickings:
                raise UserError("No open warehouse receipt exists for %s." % order.name)
            if payload.get("items"):
                self._validate_picking(open_pickings[:1], payload.get("items"))
            else:
                for picking in open_pickings:
                    self._validate_picking(picking)
        elif action == "cancel":
            order.button_cancel()
        else:
            raise UserError("Unsupported purchase order action: %s" % (payload.get("action") or "empty value"))

        order.invalidate_recordset()
        self._audit_event(
            "procurement",
            "purchase.%s" % action,
            "Purchase order %s: %s" % (action or "updated", order.name),
            "%s - receipt %s" % (order.partner_id.name, "done" if order.picking_ids and all(picking.state == "done" for picking in order.picking_ids) else "open"),
            record=order,
            severity="success" if action != "cancel" else "warning",
            payload=payload,
        )
        return {
            "id": order.id,
            "name": order.name,
            "state": order.state,
            "receipt_state": (
                "none" if not order.picking_ids
                else "done" if all(picking.state == "done" for picking in order.picking_ids)
                else "open"
            ),
            "pickings": [self._serialize_picking_action(picking) for picking in order.picking_ids],
        }

    @http.route("/bayaan/api/landed_cost", type="jsonrpc", auth="user")
    def landed_cost(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        service = BayaanLandedCostService(self)
        landed_cost, pickings = service.create(payload)
        self._audit_event(
            "procurement",
            "landed_cost.%s" % landed_cost.state,
            "Landed cost %s: %s" % (landed_cost.state, landed_cost.name),
            "%s on %s receipt(s)" % (landed_cost.amount_total, len(pickings)),
            record=landed_cost,
            severity="success" if landed_cost.state == "done" else "info",
            payload=payload,
        )
        return service.serialize(landed_cost)

    def _client_datetime(self, value):
        """Normalize a client-supplied datetime. Browsers send ISO-8601 with a
        trailing 'Z' and milliseconds (e.g. '2026-06-08T10:00:00.372Z'), which
        Odoo's fields.Datetime.to_datetime rejects (it only accepts
        '%Y-%m-%d %H:%M:%S'). Return a naive UTC datetime or False."""
        if not value:
            return False
        if isinstance(value, datetime):
            return value
        text = str(value).strip()
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(pytz.UTC).replace(tzinfo=None)
            return parsed
        except ValueError:
            return fields.Datetime.to_datetime(text)

    @http.route("/bayaan/api/shift_close", type="jsonrpc", auth="user")
    def shift_close(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "shift_close")
        orders = request.env["pos.order"].sudo().search([("name", "in", payload.get("pos_invoices", []))])
        stock_counts = payload.get("stock_counts", [])
        line_commands = []
        for count in stock_counts:
            product = self._require_product(count.get("item") or count.get("itemId"))
            expected_qty = count.get("expected_qty")
            if expected_qty is None:
                expected_qty = product.with_context(location=kiosk.stock_location_id.id).qty_available
            else:
                expected_qty = self._float_value(expected_qty)
            line_commands.append((0, 0, {
                "product_id": product.id,
                "uom_id": self._uom(count.get("uom"), product.uom_id).id,
                "expected_qty": expected_qty,
                "actual_qty": self._float_value(
                    count.get("actual_qty") if count.get("actual_qty") is not None else count.get("actualQty"),
                    0.0,
                ),
                "note": count.get("note"),
            }))

        record = request.env["bayaan.shift.close"].sudo().create({
            "kiosk_id": kiosk.id,
            "cashier_id": request.env.user.id,
            "opened_at": self._client_datetime(payload.get("opened_at")) or fields.Datetime.now(),
            "opening_cash": payload.get("opening_cash") or 0,
            "expected_cash": payload.get("expected_cash") or 0,
            "actual_cash": payload.get("actual_cash") or 0,
            "expected_card": self._float_value(payload.get("expected_card"), 0.0),
            "actual_card": self._float_value(payload.get("actual_card"), 0.0),
            "pos_order_ids": [(6, 0, orders.ids)],
            "stock_count_json": stock_counts,
            "stock_count_line_ids": line_commands,
        })
        kiosk.last_daily_close_at = record.closed_at

        # Build the ingredient-level variance from consumption ledger + waste + transfers.
        # Honor any ingredient_counts provided by the dashboard (manager UI).
        ingredient_counts = payload.get("ingredient_counts") or []
        counted_overrides = {}
        for count in ingredient_counts:
            product = self._product(count.get("ingredient") or count.get("item"))
            if product:
                counted_overrides[product.id] = self._float_value(
                    count.get("actual_qty") if count.get("actual_qty") is not None else count.get("actualQty"),
                    0.0,
                )
        record._populate_ingredient_variance(
            counted_overrides=counted_overrides or None,
            preserve_counted=False,
        )

        self._audit_event(
            "closing",
            "shift_close.created",
            "Shift close submitted: %s" % record.name,
            "%s cash variance %.2f, stock variance %.2f" % (
                kiosk.kiosk_code,
                record.cash_variance,
                record.ingredient_variance_value,
            ),
            record=record,
            kiosk=kiosk,
            severity="warning" if record.cash_variance or record.ingredient_variance_value else "success",
            payload=payload,
        )
        return {
            "id": record.id,
            "name": record.name,
            "cash_variance": record.cash_variance,
            "ingredient_variance_value": record.ingredient_variance_value,
            "stock_lines": [{
                "item": line.product_id.display_name,
                "expected_qty": line.expected_qty,
                "actual_qty": line.actual_qty,
                "variance_qty": line.variance_qty,
            } for line in record.stock_count_line_ids],
            "ingredient_lines": [{
                "ingredient": line.ingredient_id.display_name,
                "ingredient_id": line.ingredient_id.id,
                "uom": line.uom_id.name,
                "opening_qty": line.opening_qty,
                "received_qty": line.received_qty,
                "consumed_qty": line.consumed_qty,
                "waste_qty": line.waste_qty,
                "expected_qty": line.expected_qty,
                "actual_qty": line.actual_qty,
                "variance_qty": line.variance_qty,
                "unit_cost": line.unit_cost,
                "variance_value": line.variance_value,
            } for line in record.ingredient_variance_line_ids],
        }

    @http.route("/bayaan/api/shift_close_review", type="jsonrpc", auth="user")
    def shift_close_review(self, **kwargs):
        payload = self._payload(kwargs)
        close = self._require_shift_close(payload.get("close_id") or payload.get("id") or payload.get("name"))
        self._require_kiosk_scope(close.kiosk_id, "review")
        if close.locked_at:
            raise UserError("Approved shift close %s is locked." % close.name)
        decision = (payload.get("decision") or "note").lower()
        note = payload.get("note")
        if note is None:
            note = payload.get("manager_note")

        vals = {
            "manager_reviewed_by_id": request.env.user.id,
            "manager_reviewed_at": fields.Datetime.now(),
        }
        if note is not None:
            vals["manager_note"] = note

        if decision in ("approve", "approved"):
            self._require_manager_scope("approve daily closes")
            blocking_orders = close.pos_order_ids.filtered(
                lambda order: order.bayaan_consumption_state in ("missing_recipe", "failed")
            )
            if blocking_orders:
                raise UserError(
                    "Cannot approve %s: %s POS order(s) still have missing or failed recipe consumption."
                    % (close.name, len(blocking_orders))
                )
            has_variance = bool(close.cash_variance or close.ingredient_variance_value)
            if has_variance and not note:
                raise UserError("A manager note is required before approving a close with cash or stock variance.")
            vals.update({
                "manager_review_state": "approved",
                "investigation_status": "closed",
                "locked_at": fields.Datetime.now(),
                "locked_by_id": request.env.user.id,
            })
        elif decision in ("reject", "rejected"):
            self._require_manager_scope("reject daily closes")
            if not note:
                raise UserError("A manager note is required when rejecting a daily close.")
            vals.update({
                "manager_review_state": "rejected",
                "investigation_status": "open",
            })
        elif decision in ("note", "comment", "investigate"):
            if close.manager_review_state != "approved":
                vals["investigation_status"] = "open"
        else:
            raise UserError("Unsupported close review decision: %s" % decision)

        close.write(vals)
        self._audit_event(
            "closing",
            "shift_close.%s" % decision,
            "Shift close %s: %s" % (decision, close.name),
            note or "",
            record=close,
            kiosk=close.kiosk_id,
            severity="success" if decision in ("approve", "approved") else "warning",
            payload=payload,
        )
        return {
            "id": close.id,
            "name": close.name,
            "managerReviewState": close.manager_review_state,
            "managerReviewedBy": close.manager_reviewed_by_id.name,
            "managerReviewedAt": self._bayaan_local_datetime(close.manager_reviewed_at),
            "lockedAt": self._bayaan_local_datetime(close.locked_at),
            "lockedBy": close.locked_by_id.name,
            "investigationStatus": close.investigation_status,
            "notes": close.manager_note or "",
        }
