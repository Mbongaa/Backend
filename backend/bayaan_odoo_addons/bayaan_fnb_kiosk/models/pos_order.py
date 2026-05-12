import logging

from odoo import fields, models
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

    def _bayaan_post_recipe_consumption(self):
        Ledger = self.env["bayaan.consumption.ledger"]
        Recipe = self.env["bayaan.recipe"]
        StockScrap = self.env["stock.scrap"]

        for order in self:
            try:
                if order.bayaan_consumption_ledger_ids:
                    order.bayaan_consumption_state = "posted"
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
                elif posted_count:
                    order.write({
                        "bayaan_consumption_state": "posted",
                        "bayaan_consumption_error": False,
                    })
                else:
                    order.write({
                        "bayaan_consumption_state": "not_required",
                        "bayaan_consumption_error": False,
                    })

            except Exception as exc:
                _logger.exception("Bayaan recipe consumption failed for POS order %s", order.name)
                message = str(exc)
                order.write({
                    "bayaan_consumption_state": "failed",
                    "bayaan_consumption_error": message,
                })
                order.message_post(body="Bayaan ingredient consumption failed: %s" % message)


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    def _launch_stock_rule_from_pos_order_lines(self):
        stock_lines = self.filtered(
            lambda line: line.product_id.product_tmpl_id.bayaan_consumption_mode not in ("recipe", "none")
        )
        return super(PosOrderLine, stock_lines)._launch_stock_rule_from_pos_order_lines()
