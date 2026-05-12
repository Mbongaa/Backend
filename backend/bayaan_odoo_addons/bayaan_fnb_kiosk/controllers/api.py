from datetime import datetime, time, timedelta

from odoo import fields, http
from odoo.exceptions import UserError
from odoo.http import request

from ..payment_gateways import classify_payment_gateway, serialize_payment_gateway_catalog


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

    def _require_kiosk(self, kiosk_code):
        kiosk = request.env["bayaan.kiosk"].sudo().search([("kiosk_code", "=", kiosk_code)], limit=1)
        if not kiosk:
            raise UserError("Kiosk not found: %s" % (kiosk_code or "empty value"))
        return kiosk

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
            row["location_id"][0]: row
            for row in Quant.read_group(
                [("location_id", "in", locations.ids)],
                ["quantity:sum", "reserved_quantity:sum"],
                ["location_id"],
            )
            if row.get("location_id")
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

    @http.route("/bayaan/api/create_warehouse", type="jsonrpc", auth="user")
    def create_warehouse(self, **kwargs):
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
            rows = model.read_group(domain, ["%s:sum" % field_name], [])
            return rows[0].get(field_name, 0.0) if rows else 0.0

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
                method = row.get("payment_method_id")
                method_name = method[1] if method else "Unassigned digital"
                method_record = PaymentMethod.browse(method[0]) if method else PaymentMethod.browse()
                amount = row.get("amount", 0.0)
                add_payment_amount(
                    split,
                    method_name,
                    payment_gateway_method(method_record) if method_record else payment_gateway_name(method_name),
                    amount,
                )
            return finalize_payment_split(split)

        sales_by_kiosk = {}
        for row in PosOrder.read_group(sale_domain, ["amount_total:sum"], ["bayaan_kiosk_id"]):
            kiosk_value = row.get("bayaan_kiosk_id")
            if kiosk_value:
                sales_by_kiosk[kiosk_value[0]] = {
                    "orders": row.get("__count", 0),
                    "sales": row.get("amount_total", 0.0),
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
                "items": len(transfer.move_ids_without_package),
                "lines": [{
                    "product": move.product_id.default_code or move.product_id.display_name,
                    "qty": move.product_uom_qty,
                    "doneQty": move.quantity,
                    "uom": move.product_uom.name,
                    "state": move.state,
                } for move in transfer.move_ids_without_package],
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
            Payment.read_group(payment_domain, ["amount:sum"], ["payment_method_id"])
        )
        consumption_cost = read_group_sum(Consumption, consumption_domain, "total_cost")
        waste_cost = read_group_sum(Waste, waste_domain, "estimated_cost")
        revenue_total = read_group_sum(PosOrder, sale_domain, "amount_total")
        order_count = PosOrder.search_count(sale_domain)
        expected_cash_total = read_group_sum(ShiftClose, closing_domain, "expected_cash")
        cash_expected = expected_cash_total or today_payments["cash"]
        closed_kiosk_ids = {
            row["kiosk_id"][0]
            for row in ShiftClose.read_group(closing_domain + [("closed_at", "!=", False)], ["kiosk_id"], ["kiosk_id"])
            if row.get("kiosk_id")
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
                Payment.read_group(period_payment_domain, ["amount:sum"], ["payment_method_id"])
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
            } for product in products],
            "products": [{
                "id": product.id,
                "name": product.display_name,
                "default_code": product.default_code,
                "barcode": product.barcode,
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
                "amount_total": order.amount_total,
                "currency": order.currency_id.name,
                "lines": [{
                    "product": line.product_id.default_code or line.product_id.display_name,
                    "qty": line.product_qty,
                    "uom": line.product_uom.name,
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
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        return {
            "accepted": False,
            "engine": "odoo_pos",
            "external_id": payload.get("external_id"),
            "kiosk": kiosk.kiosk_code,
            "note": "Production cashier sales must be created by the customized source POS engine so sessions, payments, receipts, stock, and Bayaan consumption stay in one database.",
        }

    @http.route("/bayaan/api/waste", type="jsonrpc", auth="user")
    def waste(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        product = self._require_product(payload.get("item"))
        entry = request.env["bayaan.waste.entry"].sudo().create({
            "kiosk_id": kiosk.id,
            "product_id": product.id,
            "qty": self._float_value(payload.get("qty"), 1.0),
            "reason": payload.get("reason") or "Waste",
            "estimated_cost": self._float_value(payload.get("estimated_cost") or payload.get("estimatedCost"), 0.0),
        })
        entry.action_post()
        return {"id": entry.id, "state": entry.state, "scrap_ids": entry.scrap_ids.ids}

    @http.route("/bayaan/api/stock_transfer", type="jsonrpc", auth="user")
    def stock_transfer(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
        product = self._require_product(payload.get("item"))
        qty = self._float_value(payload.get("qty"))
        if not qty or qty <= 0:
            raise UserError("Stock transfer quantity must be greater than zero.")
        uom = self._uom(payload.get("uom"), product.uom_id)

        warehouse = request.env["stock.warehouse"].sudo().search([("company_id", "=", request.env.company.id)], limit=1)
        if not warehouse or not warehouse.int_type_id:
            raise UserError("No internal transfer operation type is configured for this company.")
        picking_type = warehouse.int_type_id
        source_location = picking_type.default_location_src_id or warehouse.lot_stock_id
        picking = request.env["stock.picking"].sudo().create({
            "picking_type_id": picking_type.id,
            "location_id": source_location.id,
            "location_dest_id": kiosk.stock_location_id.id,
            "move_ids": [(0, 0, {
                "name": product.display_name,
                "product_id": product.id,
                "product_uom_qty": qty,
                "product_uom": uom.id,
                "location_id": source_location.id,
                "location_dest_id": kiosk.stock_location_id.id,
            })],
        })
        kiosk.last_stock_transfer_at = fields.Datetime.now()
        return {"id": picking.id, "name": picking.name, "state": picking.state}

    @http.route("/bayaan/api/purchase_order", type="jsonrpc", auth="user")
    def purchase_order(self, **kwargs):
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
                "product_uom": product.uom_id.id,
                "price_unit": self._float_value(line.get("rate"), 0.0),
                "date_planned": payload.get("schedule_date") or fields.Datetime.now(),
            }))
        if not order_lines:
            raise UserError("Purchase order needs at least one item.")

        order = request.env["purchase.order"].sudo().create({
            "partner_id": partner.id,
            "date_order": fields.Datetime.now(),
            "date_planned": payload.get("schedule_date") or fields.Datetime.now(),
            "order_line": order_lines,
        })
        if payload.get("submit"):
            order.button_confirm()
        return {"id": order.id, "name": order.name, "state": order.state}

    @http.route("/bayaan/api/shift_close", type="jsonrpc", auth="user")
    def shift_close(self, **kwargs):
        payload = self._payload(kwargs)
        kiosk = self._require_kiosk(payload.get("kiosk"))
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
        return {
            "id": record.id,
            "cash_variance": record.cash_variance,
            "stock_lines": [{
                "item": line.product_id.display_name,
                "expected_qty": line.expected_qty,
                "actual_qty": line.actual_qty,
                "variance_qty": line.variance_qty,
            } for line in record.stock_count_line_ids],
        }

    @http.route("/bayaan/api/shift_close_review", type="jsonrpc", auth="user")
    def shift_close_review(self, **kwargs):
        payload = self._payload(kwargs)
        close = self._require_shift_close(payload.get("close_id") or payload.get("id") or payload.get("name"))
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
            vals.update({
                "manager_review_state": "approved",
                "investigation_status": "closed",
            })
        elif decision in ("reject", "rejected"):
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
            "investigationStatus": close.investigation_status,
            "notes": close.manager_note or "",
        }
