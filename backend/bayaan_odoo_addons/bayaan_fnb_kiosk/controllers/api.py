import json
from datetime import datetime, time, timedelta
from uuid import uuid4

from odoo import fields, http
from odoo.exceptions import UserError
from odoo.http import request
from odoo.tools import float_compare

from ..payment_gateways import (
    BAYAAN_PAYMENT_GATEWAY_BY_ID,
    classify_payment_gateway,
    serialize_payment_gateway_catalog,
)
from ..models.bayaan_payment_transaction import normalize_provider_status


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

    def _is_bayaan_cashier(self):
        return self._is_bayaan_supervisor() or request.env.user.has_group("bayaan_fnb_kiosk.group_bayaan_cashier")

    def _user_is_assigned_to_kiosk(self, kiosk):
        user = request.env.user
        return (
            kiosk.manager_user_id == user
            or kiosk.supervisor_user_id == user
            or user in kiosk.cashier_user_ids
        )

    def _require_kiosk_scope(self, kiosk, operation):
        """JSON routes use sudo for Odoo writes; enforce Bayaan kiosk scope here."""
        if self._is_bayaan_manager():
            return
        assigned = self._user_is_assigned_to_kiosk(kiosk)
        if operation in ("open_session", "sale", "waste", "shift_close", "transfer_receive"):
            if assigned and self._is_bayaan_cashier():
                return
        elif operation in ("transfer", "review"):
            if assigned and self._is_bayaan_supervisor():
                return
        raise UserError(
            "You are not allowed to %s for kiosk %s."
            % (operation.replace("_", " "), kiosk.kiosk_code)
        )

    def _require_procurement_scope(self):
        self._require_manager_scope("create or process purchase orders")

    def _require_manager_scope(self, action):
        if not self._is_bayaan_manager():
            raise UserError("Only Bayaan managers can %s." % action)

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
        return {
            "id": product.id,
            "name": product.display_name,
            "default_code": product.default_code,
            "barcode": product.barcode,
            "category": product.categ_id.display_name,
            "uom": product.uom_id.name,
            "standard_price": product.standard_price,
            "list_price": product.lst_price,
            "consumption_mode": product.product_tmpl_id.bayaan_consumption_mode,
            "qty_available": product.qty_available,
        }

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
            "monthlySalary": employee.monthly_salary,
            "expectedMonthlyHours": employee.expected_monthly_hours,
            "hourlyRate": employee.hourly_rate,
            "currency": employee.currency_id.name,
            "active": employee.active,
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
            "approvedAt": fields.Datetime.to_string(adjustment.approved_at) if adjustment.approved_at else False,
        }

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

    @http.route("/bayaan/api/warehouse_setup", type="jsonrpc", auth="user")
    def warehouse_setup(self, **kwargs):
        self._require_procurement_scope()
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
        if transaction.kiosk_id:
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
        return request.make_json_response({
            "ok": True,
            "duplicate": False,
            "event": event.id,
            "status": normalize_provider_status(provider, provider_status),
            "transaction": self._serialize_payment_transaction(transaction),
        })

    @http.route("/bayaan/api/hr_employee", type="jsonrpc", auth="user")
    def hr_employee(self, **kwargs):
        self._require_manager_scope("manage staff records")
        payload = self._payload(kwargs)
        Employee = request.env["bayaan.employee"].sudo()
        if not payload.get("name"):
            employees = Employee.search([("company_id", "=", request.env.company.id)], order="name", limit=500)
            return {"employees": [self._serialize_employee(employee) for employee in employees]}

        kiosk = request.env["bayaan.kiosk"].sudo().browse()
        if payload.get("kiosk"):
            kiosk = self._require_kiosk(payload.get("kiosk"))
        employee = Employee.create({
            "name": payload["name"],
            "role": payload.get("role") or "cashier",
            "kiosk_id": kiosk.id if kiosk else False,
            "monthly_salary": self._float_value(payload.get("monthly_salary") or payload.get("monthlySalary"), 0.0),
            "expected_monthly_hours": self._float_value(
                payload.get("expected_monthly_hours") or payload.get("expectedMonthlyHours"),
                176.0,
            ),
            "company_id": request.env.company.id,
            "currency_id": request.env.company.currency_id.id,
        })
        return self._serialize_employee(employee)

    @http.route("/bayaan/api/hr_attendance", type="jsonrpc", auth="user")
    def hr_attendance(self, **kwargs):
        payload = self._payload(kwargs)
        employee = self._employee(payload.get("employee") or payload.get("employee_id") or payload.get("employeeId"))
        if employee.kiosk_id:
            self._require_kiosk_scope(employee.kiosk_id, "shift_close")
        Attendance = request.env["bayaan.attendance"].sudo()
        attendance = Attendance.create({
            "employee_id": employee.id,
            "check_in": payload.get("check_in") or payload.get("checkIn") or fields.Datetime.now(),
            "check_out": payload.get("check_out") or payload.get("checkOut"),
            "manual_hours": self._float_value(payload.get("manual_hours") or payload.get("manualHours"), 0.0),
            "note": payload.get("note"),
        })
        return {
            "id": attendance.id,
            "employee": employee.name,
            "workedHours": attendance.worked_hours,
            "checkIn": fields.Datetime.to_string(attendance.check_in),
            "checkOut": fields.Datetime.to_string(attendance.check_out) if attendance.check_out else False,
        }

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
        adjustment = request.env["bayaan.payroll.adjustment"].sudo().create({
            "employee_id": employee.id,
            "date": payload.get("date") or fields.Date.context_today(request.env.user),
            "type": adjustment_type,
            "amount": amount,
            "reason": payload.get("reason") or "Payroll adjustment",
        })
        if payload.get("approve"):
            self._require_manager_scope("approve payroll adjustments")
            adjustment.action_approve()
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
        action = (payload.get("action") or "").lower()
        if action in ("approve", "approved"):
            adjustment.action_approve()
        elif action in ("reject", "rejected"):
            adjustment.action_reject()
        else:
            raise UserError("Unsupported payroll adjustment action: %s" % (action or "empty value"))
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
        payroll_run = PayrollRun.create({
            "name": payload.get("name") or "Payroll %s - %s" % (date_from, date_to),
            "date_from": date_from,
            "date_to": date_to,
            "company_id": request.env.company.id,
            "currency_id": request.env.company.currency_id.id,
        })
        if payload.get("compute", True):
            payroll_run.action_compute_lines()
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
            payroll_run.action_compute_lines()
        elif action in ("approve", "approved"):
            payroll_run.action_approve()
        elif action in ("paid", "mark_paid"):
            payroll_run.action_mark_paid()
        elif action == "cancel":
            payroll_run.state = "cancelled"
        else:
            raise UserError("Unsupported payroll run action: %s" % (action or "empty value"))
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

        return self._serialize_warehouse_setup(created={
            "type": "kiosk",
            "action": "created",
            "id": kiosk.id,
            "kiosk_code": kiosk.kiosk_code,
            "stock_location_id": location.id,
            "pos_config_id": pos_config.id,
        })

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
            "uom_po_id": uom.id,
            "standard_price": self._float_value(payload.get("unit_cost") or payload.get("standard_price"), 0.0),
            "list_price": self._float_value(payload.get("list_price"), 0.0),
            "available_in_pos": bool(payload.get("available_in_pos") or payload.get("availableInPos")),
            "bayaan_consumption_mode": mode,
            "company_id": request.env.company.id,
        }
        if category:
            template_vals["categ_id"] = category.id

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

        return {
            "engine": "odoo_pos",
            "product": self._serialize_stock_item(product),
        }

    @http.route("/bayaan/api/chain_bootstrap", type="jsonrpc", auth="user")
    def chain_bootstrap(self, **kwargs):
        today = fields.Date.context_today(request.env.user)
        today_start = datetime.combine(today, time.min)
        today_end = today_start + timedelta(days=1)
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

        kiosk_domain = [
            ("active", "=", True),
            ("company_id", "=", company.id),
        ]
        if not self._is_bayaan_manager():
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
            ("scheduled_date", ">=", today_start),
            ("create_date", ">=", today_start),
        ]

        kiosks = Kiosk.search(kiosk_domain, order="kiosk_code", limit=500)
        kiosk_location_ids = kiosks.mapped("stock_location_id").ids
        if not self._is_bayaan_manager():
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
        quant_domain = [
            ("location_id", "in", kiosk_location_ids),
            ("quantity", "!=", 0),
        ]

        products = Product.search(product_domain, order="default_code,name", limit=500)
        recipes = Recipe.search(recipe_domain, order="product_id, effective_from desc, id desc", limit=500)
        purchases = Purchase.search(purchase_domain, order="date_order desc, id desc", limit=200)
        quants = Quant.search(quant_domain, order="location_id, product_id", limit=2000)
        consumption = Consumption.search(consumption_domain, order="consumed_at desc, id desc", limit=1000)
        waste = Waste.search(waste_domain, order="create_date desc, id desc", limit=1000)
        sales = PosOrder.search(sale_domain, order="date_order desc, id desc", limit=1000)
        closings = ShiftClose.search(closing_domain, order="opened_at desc, id desc", limit=500)
        transfers = Picking.search(transfer_domain, order="scheduled_date desc, id desc", limit=500)
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
            row = {
                "kiosk": kiosk.kiosk_code if kiosk else quant.location_id.complete_name,
                "item": quant.product_id.default_code or quant.product_id.display_name,
                "actual_qty": quant.quantity,
                "reserved_qty": quant.reserved_quantity,
                "uom": quant.product_id.uom_id.name,
                "mode": quant.product_id.product_tmpl_id.bayaan_consumption_mode,
                "category": quant.product_id.categ_id.display_name,
            }
            kiosk_stock_rows.append(row)
        kiosk_stock_grouped = {}
        for row in kiosk_stock_rows:
            kiosk_stock_grouped.setdefault(row["kiosk"], []).append(row)

        close_payment_totals = {
            close.id: payment_split(close.pos_order_ids)
            for close in closings
        }

        transfer_rows = []
        for transfer in transfers:
            source_kiosk = kiosk_by_location.get(transfer.location_id.id)
            dest_kiosk = kiosk_by_location.get(transfer.location_dest_id.id)
            transfer_rows.append({
                "id": transfer.id,
                "name": transfer.name,
                "origin": transfer.origin,
                "from": source_kiosk.kiosk_code if source_kiosk else transfer.location_id.complete_name,
                "to": dest_kiosk.kiosk_code if dest_kiosk else transfer.location_dest_id.complete_name,
                "toKioskId": dest_kiosk.kiosk_code if dest_kiosk else False,
                "scheduledAt": fields.Datetime.to_string(transfer.scheduled_date),
                "state": transfer.state,
                "items": len(transfer.move_ids),
                "lines": [{
                    "product": move.product_id.default_code or move.product_id.display_name,
                    "qty": move.product_uom_qty,
                    "doneQty": move.quantity,
                    "uom": move.product_uom.name,
                    "state": move.state,
                } for move in transfer.move_ids],
            })

        suggested_transfer_rows = []
        for quant in quants:
            if quant.quantity > 5:
                continue
            kiosk = kiosk_by_location.get(quant.location_id.id)
            if not kiosk:
                continue
            target_qty = 10.0
            suggested_qty = max(1.0, target_qty - quant.quantity)
            suggested_transfer_rows.append({
                "kiosk": kiosk.kiosk_code,
                "kioskName": kiosk.name,
                "item": quant.product_id.default_code or quant.product_id.display_name,
                "qty": round(suggested_qty, 2),
                "uom": quant.product_id.uom_id.name,
                "cover": "out" if quant.quantity <= 0 else "<1 day",
                "reason": "below safety stock",
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
        expected_cash_total = read_group_sum(ShiftClose, closing_domain, "expected_cash")
        cash_expected = expected_cash_total or today_payments["cash"]
        closed_kiosk_ids = {
            kiosk.id
            for kiosk, in ShiftClose._read_group(closing_domain + [("closed_at", "!=", False)], ["kiosk_id"], [])
            if kiosk
        }
        low_stock_count = Quant.search_count(quant_domain + [("quantity", "<=", 5)])
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
            period_payments = payment_split_from_groups(
                Payment._read_group(period_payment_domain, ["payment_method_id"], ["amount:sum"])
            )
            period_revenue = read_group_sum(PosOrder, period_sale_domain, "amount_total")
            period_cogs = read_group_sum(Consumption, period_consumption_domain, "total_cost")
            period_waste = read_group_sum(Waste, period_waste_domain, "estimated_cost")
            period_cash_expected = read_group_sum(ShiftClose, period_closing_domain, "expected_cash") or period_payments["cash"]
            return {
                "revenue": period_revenue,
                "orders": PosOrder.search_count(period_sale_domain),
                "cogs": period_cogs,
                "wasteCost": period_waste,
                "netProfit": period_revenue - period_cogs - period_waste,
                "cashExpected": period_cash_expected,
                "digitalPayments": period_payments["digital"],
                "payments": period_payments,
                "sourceCounts": {
                    "orders": PosOrder.search_count(period_sale_domain),
                    "payments": Payment.search_count(period_payment_domain),
                    "consumptionRows": Consumption.search_count(period_consumption_domain),
                    "wasteRows": Waste.search_count(period_waste_domain),
                    "closingRows": ShiftClose.search_count(period_closing_domain),
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
            row["stockItems"] += 1
            if quant.quantity <= 5:
                row["lowStockItems"] += 1
            if quant.quantity <= 0:
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
            stock_health = max(0, 100 - row["lowStockItems"] * 12 - row["zeroStockItems"] * 24)
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

        return {
            "engine": "odoo_pos",
            "payment_gateways": self._payment_gateway_catalog(),
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
                },
            },
            "summary": {
                "totals": {
                    "salesToday": revenue_total,
                    "ordersToday": order_count,
                    "profitEstimate": revenue_total - consumption_cost - waste_cost,
                    "cogs": consumption_cost,
                    "wasteCost": waste_cost,
                    "cashExpected": cash_expected,
                    "digitalPayments": today_payments["digital"],
                    "openKiosks": max(len(kiosks) - len(closed_kiosk_ids), 0),
                    "closedKiosks": len(closed_kiosk_ids),
                },
                "payments": today_payments,
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
            "warehouse_stock": [{
                "item": product.default_code or product.display_name,
                "actual_qty": product.qty_available,
                "uom": product.uom_id.name,
                "mode": product.product_tmpl_id.bayaan_consumption_mode,
                "category": product.categ_id.display_name,
            } for product in products],
            "products": [{
                "id": product.id,
                "name": product.display_name,
                "default_code": product.default_code,
                "barcode": product.barcode,
                "category": product.categ_id.display_name,
                "list_price": product.lst_price,
                "standard_price": product.standard_price,
                "uom": product.uom_id.name,
                "consumption_mode": product.product_tmpl_id.bayaan_consumption_mode,
            } for product in products],
            "recipes": [{
                "id": recipe.id,
                "product": recipe.product_id.display_name,
                "product_code": recipe.product_id.default_code,
                "version": recipe.version_label,
                "state": recipe.state,
                "effective_from": fields.Datetime.to_string(recipe.effective_from),
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
                "date_order": fields.Datetime.to_string(order.date_order),
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
                    "planned_date": fields.Datetime.to_string(line.date_planned),
                } for line in order.order_line],
            } for order in purchases],
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
                "openedAt": fields.Datetime.to_string(close.opened_at),
                "closedAt": fields.Datetime.to_string(close.closed_at),
                "sales": sum(close.pos_order_ids.mapped("amount_total")),
                "expectedCash": close.expected_cash,
                "countedCash": close.actual_cash,
                "cashVariance": close.cash_variance,
                "cashPayments": close_payment_totals.get(close.id, {}).get("cash", 0.0),
                "digitalPayments": close_payment_totals.get(close.id, {}).get("digital", 0.0),
                "wasteCost": waste_cost_by_kiosk.get(close.kiosk_id.id, 0.0),
                "status": close_status(close),
                "investigationStatus": close_investigation_status(close),
                "notes": close_notes(close),
                "managerReviewState": close.manager_review_state,
                "managerReviewedBy": close.manager_reviewed_by_id.name,
                "managerReviewedAt": fields.Datetime.to_string(close.manager_reviewed_at) if close.manager_reviewed_at else False,
                "recipePostingIssues": len(close_recipe_posting_issues(close)),
                "recipePostingIssueOrders": close_recipe_posting_issues(close).mapped("name")[:5],
                "stock": [{
                    "item": line.product_id.display_name,
                    "unit": line.uom_id.name,
                    "expected": line.expected_qty,
                    "actual": line.actual_qty,
                    "variance": line.variance_qty,
                    "value": 0,
                } for line in close.stock_count_line_ids],
            } for close in closings],
            "today": {
                "orders": [{
                    "name": sale.name,
                    "kiosk": sale.bayaan_kiosk_id.kiosk_code,
                    "pos_config": sale.config_id.name,
                    "cashier": sale.user_id.name,
                    "date_order": fields.Datetime.to_string(sale.date_order),
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
                    "kiosk": line.kiosk_id.kiosk_code,
                    "sold_product": line.product_id.display_name,
                    "ingredient": line.ingredient_id.display_name,
                    "qty": line.ingredient_qty,
                    "uom": line.uom_id.name,
                    "cost": line.total_cost,
                } for line in consumption],
                "waste": [{
                    "kiosk": entry.kiosk_id.kiosk_code,
                    "product": entry.product_id.display_name,
                    "qty": entry.qty,
                    "reason": entry.reason,
                    "estimated_cost": entry.estimated_cost,
                    "state": entry.state,
                    "create_date": fields.Datetime.to_string(entry.create_date),
                } for entry in waste],
            },
        }

    @http.route("/bayaan/api/recipe_version", type="jsonrpc", auth="user")
    def recipe_version(self, **kwargs):
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
        for item in items:
            product = self._sale_product(
                item.get("product") or item.get("item"),
                item.get("name"),
            )
            qty = self._float_value(item.get("qty"), 1.0)
            if qty <= 0:
                raise UserError("Sale line for %s must have positive qty." % product.display_name)
            price_unit = self._float_value(item.get("price_unit") or item.get("price"), product.list_price)
            tax_ids = product.taxes_id.filtered(lambda tax, c=request.env.company: tax.company_id == c)
            line_subtotal = price_unit * qty
            line_total = line_subtotal
            line_tax = 0.0
            if tax_ids:
                # Bayaan UI sends the customer-facing sticker price. Treat it
                # as tax-included so payment totals stay equal to cashier total.
                tax_calc = tax_ids.with_context(force_price_include=True).compute_all(
                    price_unit,
                    request.env.company.currency_id,
                    qty,
                    product=product,
                )
                line_total = tax_calc["total_included"]
                line_subtotal = tax_calc["total_excluded"]
                line_tax = line_total - line_subtotal
            order_lines.append((0, 0, {
                "name": item.get("name") or product.display_name,
                "product_id": product.id,
                "qty": qty,
                "price_unit": price_unit,
                "price_subtotal": line_subtotal,
                "price_subtotal_incl": line_total,
                "tax_ids": [(6, 0, tax_ids.ids)] if tax_ids else False,
            }))
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
        if external_id:
            order_vals["pos_reference"] = external_id
        if payload.get("posting_date"):
            try:
                posting_date = str(payload["posting_date"])
                if "T" in posting_date or len(posting_date) > 10:
                    order_vals["date_order"] = fields.Datetime.to_datetime(posting_date)
                else:
                    order_vals["date_order"] = fields.Datetime.to_datetime(posting_date + " 00:00:00")
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
        return {"id": entry.id, "state": entry.state, "scrap_ids": entry.scrap_ids.ids}

    @http.route("/bayaan/api/stock_transfer", type="jsonrpc", auth="user")
    def stock_transfer(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        self._require_kiosk_scope(kiosk, "transfer")
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

        picking = request.env["stock.picking"].sudo().create({
            "picking_type_id": picking_type.id,
            "location_id": source_location.id,
            "location_dest_id": kiosk.stock_location_id.id,
            "bayaan_transfer_state": "draft",
            "move_ids": move_commands,
        })
        kiosk.last_stock_transfer_at = fields.Datetime.now()
        return self._serialize_picking_action(picking)

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
            if receive_action and not self._is_bayaan_supervisor() and picking.bayaan_transfer_state != "dispatched":
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
        if payload.get("submit"):
            order.button_confirm()
        return {"id": order.id, "name": order.name, "state": order.state}

    @http.route("/bayaan/api/purchase_order_action", type="jsonrpc", auth="user")
    def purchase_order_action(self, **kwargs):
        self._require_procurement_scope()
        payload = self._payload(kwargs)
        order = self._purchase_order(payload.get("po") or payload.get("purchase_order") or payload.get("order"))
        action = (payload.get("action") or "").lower()

        if action in ("send", "sent"):
            if order.state == "draft":
                order.with_context(mark_rfq_as_sent=True).message_post(body="RFQ marked as sent from Bayaan.")
        elif action in ("confirm", "approve", "approved"):
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
            "opened_at": payload.get("opened_at") or fields.Datetime.now(),
            "opening_cash": payload.get("opening_cash") or 0,
            "expected_cash": payload.get("expected_cash") or 0,
            "actual_cash": payload.get("actual_cash") or 0,
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
        return {
            "id": close.id,
            "name": close.name,
            "managerReviewState": close.manager_review_state,
            "managerReviewedBy": close.manager_reviewed_by_id.name,
            "managerReviewedAt": fields.Datetime.to_string(close.manager_reviewed_at) if close.manager_reviewed_at else False,
            "lockedAt": fields.Datetime.to_string(close.locked_at) if close.locked_at else False,
            "lockedBy": close.locked_by_id.name,
            "investigationStatus": close.investigation_status,
            "notes": close.manager_note or "",
        }
