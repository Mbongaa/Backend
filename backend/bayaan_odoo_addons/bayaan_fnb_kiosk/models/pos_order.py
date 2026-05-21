import logging

from odoo import _, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare


_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    bayaan_kiosk_id = fields.Many2one("bayaan.kiosk", string="Bayaan Kiosk", index=True)
    bayaan_consumption_state = fields.Selection(
        [
            ("pending", "Pending"),
            ("posted", "Posted"),
            ("not_required", "Not Required"),
            ("missing_recipe", "Missing Recipe"),
            ("failed", "Failed"),
        ],
        default="pending",
        copy=False,
        index=True,
    )
    bayaan_consumption_error = fields.Text(copy=False)
    bayaan_consumption_ledger_ids = fields.One2many(
        "bayaan.consumption.ledger",
        "pos_order_id",
        string="Bayaan Ingredient Consumption",
    )

    def _process_saved_order(self, draft):
        result = super()._process_saved_order(draft)
        if not draft and self.state != "cancel":
            self._bayaan_post_recipe_consumption()
        return result

    def action_bayaan_retry_consumption(self):
        self.write({
            "bayaan_consumption_state": "pending",
            "bayaan_consumption_error": False,
        })
        self._bayaan_post_recipe_consumption()

    def _bayaan_break_glass_pos_void_allowed(self):
        return (
            self.env.context.get("bayaan_break_glass_pos_void")
            and self.env.user.has_group("base.group_system")
        )

    def _bayaan_paid_orders_for_void_guard(self):
        protected_orders = self.env["pos.order"]
        for order in self:
            if order.state not in ("paid", "done", "invoiced"):
                continue
            if order.bayaan_kiosk_id or order._bayaan_resolve_kiosk():
                protected_orders |= order
        return protected_orders

    def _bayaan_guard_paid_void(self, action):
        protected_orders = self._bayaan_paid_orders_for_void_guard()
        if protected_orders and not protected_orders._bayaan_break_glass_pos_void_allowed():
            raise UserError(_(
                "Bayaan policy prohibits %(action)s paid kiosk POS orders. "
                "Use the documented reversal workflow so the audit trail remains intact."
            ) % {"action": action})

    def action_pos_order_cancel(self):
        self._bayaan_guard_paid_void("cancelling")
        return super().action_pos_order_cancel()

    def _refund(self):
        self._bayaan_guard_paid_void("refunding")
        return super()._refund()

    def unlink(self):
        self._bayaan_guard_paid_void("deleting")
        return super().unlink()

    def _bayaan_resolve_kiosk(self):
        self.ensure_one()
        kiosk = self.bayaan_kiosk_id
        if not kiosk:
            kiosk = self.env["bayaan.kiosk"].search([
                ("pos_config_id", "=", self.config_id.id),
                ("company_id", "=", self.company_id.id),
            ], limit=1)
            if kiosk:
                self.bayaan_kiosk_id = kiosk
        return kiosk

    def _bayaan_analytic_distribution(self):
        self.ensure_one()
        kiosk = self._bayaan_resolve_kiosk()
        return kiosk._bayaan_analytic_distribution() if kiosk else {}

    def _get_invoice_lines_values(self, line_values, pos_line, move_type):
        vals = super()._get_invoice_lines_values(line_values, pos_line, move_type)
        if vals.get("display_type") not in ("line_section", "line_note"):
            distribution = pos_line.order_id._bayaan_analytic_distribution()
            if distribution:
                vals["analytic_distribution"] = distribution
        return vals

    def _bayaan_check_stock_policy(self, kiosk, ingredient, qty, uom):
        if kiosk.stock_deduction_policy != "strict":
            return
        qty_in_product_uom = uom._compute_quantity(qty, ingredient.uom_id)
        available_qty = self.env["stock.quant"]._get_available_quantity(
            ingredient,
            kiosk.stock_location_id,
            strict=True,
            allow_negative=False,
        )
        precision = ingredient.uom_id.rounding
        if float_compare(available_qty, qty_in_product_uom, precision_rounding=precision) < 0:
            raise ValueError(
                "Insufficient stock for %s at %s. Required %s %s, available %s %s."
                % (
                    ingredient.display_name,
                    kiosk.display_name,
                    qty_in_product_uom,
                    ingredient.uom_id.display_name,
                    available_qty,
                    ingredient.uom_id.display_name,
                )
            )

    def _bayaan_publish_consumption_event(self, kiosk):
        self.ensure_one()
        state = self.bayaan_consumption_state or "pending"
        severity = "success" if state in ("posted", "not_required") else "warning"
        try:
            self.env["bayaan.realtime"].sudo().publish_event(
                "recipe",
                "recipe.consumption.%s" % state,
                "Recipe consumption %s: %s" % (state.replace("_", " "), self.name),
                self.bayaan_consumption_error or "",
                record=self,
                kiosk=kiosk,
                severity=severity,
                payload={
                    "order": self.name,
                    "amount_total": self.amount_total,
                    "consumption_state": state,
                    "consumption_error": self.bayaan_consumption_error or "",
                },
                company=self.company_id,
            )
        except Exception:
            _logger.exception("Could not publish Bayaan recipe realtime event for POS order %s", self.name)

    def _bayaan_post_recipe_consumption(self):
        Ledger = self.env["bayaan.consumption.ledger"]
        Recipe = self.env["bayaan.recipe"]
        StockScrap = self.env["stock.scrap"]

        for order in self:
            kiosk = order.bayaan_kiosk_id
            try:
                if order.bayaan_consumption_ledger_ids:
                    order.bayaan_consumption_state = "posted"
                    order._bayaan_publish_consumption_event(kiosk or order._bayaan_resolve_kiosk())
                    continue

                kiosk = order._bayaan_resolve_kiosk()
                if not kiosk:
                    raise ValueError(
                        "No Bayaan kiosk is linked to POS configuration %s."
                        % (order.config_id.display_name,)
                    )

                missing_recipes = []
                posted_count = 0

                for order_line in order.lines:
                    if order_line.qty <= 0:
                        continue

                    mode = order_line.product_id.product_tmpl_id.bayaan_consumption_mode
                    if mode not in ("recipe", "hybrid"):
                        continue

                    recipe = Recipe.get_active_recipe(
                        order_line.product_id,
                        order.company_id,
                        order.date_order or fields.Datetime.now(),
                    )
                    if not recipe:
                        missing_recipes.append(order_line.product_id.display_name)
                        continue

                    for recipe_line in recipe.line_ids:
                        ingredient_qty = recipe_line.qty * order_line.qty
                        if ingredient_qty <= 0:
                            continue

                        existing = Ledger.search([
                            ("pos_order_line_id", "=", order_line.id),
                            ("recipe_line_id", "=", recipe_line.id),
                        ], limit=1)
                        if existing:
                            posted_count += 1
                            continue

                        order._bayaan_check_stock_policy(
                            kiosk,
                            recipe_line.ingredient_id,
                            ingredient_qty,
                            recipe_line.uom_id,
                        )
                        scrap = StockScrap.create({
                            "product_id": recipe_line.ingredient_id.id,
                            "product_uom_id": recipe_line.uom_id.id,
                            "scrap_qty": ingredient_qty,
                            "location_id": kiosk.stock_location_id.id,
                            "bayaan_kiosk_id": kiosk.id,
                            "company_id": order.company_id.id,
                            "origin": order.name,
                        })
                        scrap.do_scrap()
                        Ledger.create({
                            "name": "%s - %s" % (order.name, recipe_line.ingredient_id.display_name),
                            "pos_order_id": order.id,
                            "pos_order_line_id": order_line.id,
                            "kiosk_id": kiosk.id,
                            "product_id": order_line.product_id.id,
                            "product_qty": order_line.qty,
                            "recipe_id": recipe.id,
                            "recipe_line_id": recipe_line.id,
                            "ingredient_id": recipe_line.ingredient_id.id,
                            "ingredient_qty": ingredient_qty,
                            "uom_id": recipe_line.uom_id.id,
                            "unit_cost": recipe_line.ingredient_id.standard_price,
                            "stock_scrap_id": scrap.id,
                            "consumed_at": order.date_order or fields.Datetime.now(),
                            "company_id": order.company_id.id,
                        })
                        posted_count += 1

                if missing_recipes:
                    message = "Missing active Bayaan recipe for: %s." % ", ".join(sorted(set(missing_recipes)))
                    order.write({
                        "bayaan_consumption_state": "missing_recipe",
                        "bayaan_consumption_error": message,
                    })
                    order.message_post(body=message)
                    order._bayaan_publish_consumption_event(kiosk)
                elif posted_count:
                    order.write({
                        "bayaan_consumption_state": "posted",
                        "bayaan_consumption_error": False,
                    })
                    order._bayaan_publish_consumption_event(kiosk)
                else:
                    order.write({
                        "bayaan_consumption_state": "not_required",
                        "bayaan_consumption_error": False,
                    })
                    order._bayaan_publish_consumption_event(kiosk)

            except Exception as exc:
                _logger.exception("Bayaan recipe consumption failed for POS order %s", order.name)
                message = str(exc)
                order.write({
                    "bayaan_consumption_state": "failed",
                    "bayaan_consumption_error": message,
                })
                order.message_post(body="Bayaan ingredient consumption failed: %s" % message)
                order._bayaan_publish_consumption_event(kiosk)


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    def unlink(self):
        protected_orders = self.mapped("order_id")._bayaan_paid_orders_for_void_guard()
        if protected_orders and not protected_orders._bayaan_break_glass_pos_void_allowed():
            raise UserError(_(
                "Bayaan policy prohibits deleting lines from paid kiosk POS orders. "
                "Use the documented reversal workflow so the audit trail remains intact."
            ))
        return super().unlink()

    def _prepare_base_line_for_taxes_computation(self):
        base_line = super()._prepare_base_line_for_taxes_computation()
        distribution = self.order_id._bayaan_analytic_distribution()
        if distribution:
            base_line["analytic_distribution"] = distribution
        return base_line

    def _launch_stock_rule_from_pos_order_lines(self):
        stock_lines = self.filtered(
            lambda line: line.product_id.product_tmpl_id.bayaan_consumption_mode not in ("recipe", "none")
        )
        return super(PosOrderLine, stock_lines)._launch_stock_rule_from_pos_order_lines()


class PosSession(models.Model):
    _inherit = "pos.session"

    def _get_sale_key(self, base_line):
        key = super()._get_sale_key(base_line)
        distribution = base_line.get("analytic_distribution") or {}
        if distribution:
            key["bayaan_analytic_distribution"] = tuple(
                sorted((str(account_id), float(percent)) for account_id, percent in distribution.items())
            )
        return key

    def _get_sale_vals(self, key, sale_vals):
        vals = super()._get_sale_vals(key, sale_vals)
        distribution = key.get("bayaan_analytic_distribution")
        if distribution:
            vals["analytic_distribution"] = dict(distribution)
        return vals
