from odoo import fields
from odoo.exceptions import UserError
from odoo.http import request


class BayaanLandedCostService:
    def __init__(self, api):
        self.api = api

    def expense_account(self):
        account = request.env["account.account"].sudo().search([
            ("account_type", "=", "expense"),
            ("company_ids", "in", [request.env.company.id]),
        ], limit=1)
        if not account:
            raise UserError("Configure an expense account before posting landed costs.")
        return account

    def cost_product(self, line):
        product_ref = line.get("product") or line.get("product_id") or line.get("productId")
        Product = request.env["product.product"].sudo().with_company(request.env.company)
        if product_ref:
            product = self.api._require_product(product_ref)
        else:
            product = Product.search([("default_code", "=", "BAYAAN-LANDED-COST")], limit=1)
            if not product:
                product = Product.create({
                    "name": line.get("name") or "Bayaan Landed Cost",
                    "default_code": "BAYAAN-LANDED-COST",
                    "type": "service",
                    "landed_cost_ok": True,
                    "split_method_landed_cost": line.get("split_method") or line.get("splitMethod") or "by_quantity",
                    "property_account_expense_id": self.expense_account().id,
                    "company_id": request.env.company.id,
                })
        if product.type != "service":
            raise UserError("Landed cost product must be a service: %s" % product.display_name)
        values = {}
        if not product.product_tmpl_id.landed_cost_ok:
            values["landed_cost_ok"] = True
        split_method = line.get("split_method") or line.get("splitMethod")
        if split_method:
            values["split_method_landed_cost"] = split_method
        if values:
            product.product_tmpl_id.sudo().write(values)
        return product

    def pickings(self, payload):
        Picking = request.env["stock.picking"].sudo()
        pickings = Picking.browse()
        purchase_ref = payload.get("po") or payload.get("purchase_order") or payload.get("purchaseOrder") or payload.get("order")
        if purchase_ref:
            order = self.api._purchase_order(purchase_ref)
            pickings |= order.picking_ids.filtered(lambda picking: picking.state == "done")

        picking_refs = (
            payload.get("pickings")
            or payload.get("receipts")
            or payload.get("picking_ids")
            or payload.get("pickingIds")
            or payload.get("picking")
            or payload.get("receipt")
        )
        if picking_refs:
            if not isinstance(picking_refs, list):
                picking_refs = [picking_refs]
            for picking_ref in picking_refs:
                pickings |= self.api._picking(picking_ref)

        pickings = pickings.filtered(lambda picking: picking.company_id == request.env.company)
        if not pickings:
            raise UserError("A done purchase receipt is required before posting landed costs.")
        open_pickings = pickings.filtered(lambda picking: picking.state != "done")
        if open_pickings:
            raise UserError("Landed costs can only be posted on done receipts: %s." % ", ".join(open_pickings.mapped("name")))
        return pickings

    def cost_lines(self, payload):
        raw_lines = payload.get("costs") or payload.get("cost_lines") or payload.get("costLines") or payload.get("lines") or []
        if payload.get("amount") not in (None, ""):
            raw_lines = [{
                "name": payload.get("name") or payload.get("description") or "Landed cost",
                "amount": payload.get("amount"),
                "product": payload.get("product"),
                "split_method": payload.get("split_method") or payload.get("splitMethod"),
            }]
        commands = []
        valid_split_methods = {"equal", "by_quantity", "by_current_cost_price", "by_weight", "by_volume"}
        for line in raw_lines:
            amount = self.api._float_value(
                line.get("amount")
                if line.get("amount") is not None
                else line.get("price_unit") if line.get("price_unit") is not None
                else line.get("priceUnit"),
                0.0,
            )
            if not amount:
                raise UserError("Landed cost amount must be non-zero.")
            split_method = line.get("split_method") or line.get("splitMethod") or "by_quantity"
            if split_method not in valid_split_methods:
                raise UserError("Invalid landed cost split method: %s" % split_method)
            product = self.cost_product(line)
            accounts = product.product_tmpl_id.get_product_accounts()
            expense_account = accounts.get("expense") or self.expense_account()
            commands.append((0, 0, {
                "name": line.get("name") or product.display_name,
                "product_id": product.id,
                "price_unit": amount,
                "split_method": split_method,
                "account_id": expense_account.id,
            }))
        if not commands:
            raise UserError("At least one landed cost line is required.")
        return commands

    def create(self, payload):
        pickings = self.pickings(payload)
        landed_cost = request.env["stock.landed.cost"].sudo().with_company(request.env.company).create({
            "date": payload.get("date") or fields.Date.context_today(request.env.user),
            "description": payload.get("description") or payload.get("note") or "",
            "picking_ids": [(6, 0, pickings.ids)],
            "cost_lines": self.cost_lines(payload),
            "company_id": request.env.company.id,
        })
        landed_cost.compute_landed_cost()
        if payload.get("post", True):
            landed_cost.button_validate()
        return landed_cost, pickings

    def serialize(self, landed_cost):
        landed_cost.ensure_one()
        return {
            "engine": "odoo_pos",
            "id": landed_cost.id,
            "name": landed_cost.name,
            "state": landed_cost.state,
            "amountTotal": landed_cost.amount_total,
            "journalEntry": landed_cost.account_move_id.name if landed_cost.account_move_id else False,
            "journalEntryId": landed_cost.account_move_id.id if landed_cost.account_move_id else False,
            "pickings": [{
                "id": picking.id,
                "name": picking.name,
                "state": picking.state,
            } for picking in landed_cost.picking_ids],
            "costLines": [{
                "product": line.product_id.default_code or line.product_id.display_name,
                "name": line.name,
                "amount": line.price_unit,
                "splitMethod": line.split_method,
            } for line in landed_cost.cost_lines],
            "valuationAdjustments": [{
                "product": line.product_id.default_code or line.product_id.display_name,
                "move": line.move_id.id,
                "picking": line.move_id.picking_id.name if line.move_id.picking_id else False,
                "quantity": line.quantity,
                "formerCost": line.former_cost,
                "additionalCost": line.additional_landed_cost,
                "finalCost": line.final_cost,
            } for line in landed_cost.valuation_adjustment_lines],
        }
