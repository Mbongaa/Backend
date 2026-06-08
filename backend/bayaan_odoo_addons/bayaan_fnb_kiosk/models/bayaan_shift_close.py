from odoo import api, fields, models
from odoo.exceptions import UserError


class BayaanShiftClose(models.Model):
    _name = "bayaan.shift.close"
    _description = "Bayaan Shift Close"
    _order = "opened_at desc, id desc"

    name = fields.Char(default="New", copy=False)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True)
    cashier_id = fields.Many2one("res.users")
    opened_at = fields.Datetime(required=True)
    closed_at = fields.Datetime(default=fields.Datetime.now)
    opening_cash = fields.Monetary(currency_field="currency_id")
    expected_cash = fields.Monetary(currency_field="currency_id")
    actual_cash = fields.Monetary(currency_field="currency_id")
    cash_variance = fields.Monetary(currency_field="currency_id", compute="_compute_cash_variance", store=True)
    # Card terminal reconciliation (counted via the PIN pad at end of day, next to cash).
    expected_card = fields.Monetary(currency_field="currency_id")
    actual_card = fields.Monetary(currency_field="currency_id")
    card_variance = fields.Monetary(currency_field="currency_id", compute="_compute_card_variance", store=True)
    pos_order_ids = fields.Many2many("pos.order", string="POS Orders")
    stock_count_line_ids = fields.One2many(
        "bayaan.shift.close.line",
        "shift_close_id",
        string="Stock Counts",
    )
    ingredient_variance_line_ids = fields.One2many(
        "bayaan.shift.close.ingredient.line",
        "shift_close_id",
        string="Ingredient Variance",
    )
    ingredient_variance_value = fields.Monetary(
        currency_field="currency_id",
        compute="_compute_ingredient_variance_value",
        store=True,
    )
    stock_count_json = fields.Json(string="Stock Count Snapshot")
    manager_review_state = fields.Selection(
        [
            ("pending", "Pending Review"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
        ],
        default="pending",
        required=True,
        copy=False,
    )
    manager_note = fields.Text(copy=False)
    manager_reviewed_by_id = fields.Many2one("res.users", copy=False, readonly=True)
    manager_reviewed_at = fields.Datetime(copy=False, readonly=True)
    locked_at = fields.Datetime(copy=False, readonly=True)
    locked_by_id = fields.Many2one("res.users", copy=False, readonly=True)
    investigation_status = fields.Selection(
        [
            ("none", "None"),
            ("open", "Open"),
            ("closed", "Closed"),
        ],
        default="none",
        required=True,
        copy=False,
    )
    currency_id = fields.Many2one(related="company_id.currency_id")
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("actual_cash", "expected_cash")
    def _compute_cash_variance(self):
        for record in self:
            record.cash_variance = record.actual_cash - record.expected_cash

    @api.depends("actual_card", "expected_card")
    def _compute_card_variance(self):
        for record in self:
            record.card_variance = record.actual_card - record.expected_card

    @api.depends("ingredient_variance_line_ids.variance_value")
    def _compute_ingredient_variance_value(self):
        for record in self:
            record.ingredient_variance_value = sum(
                line.variance_value for line in record.ingredient_variance_line_ids
            )

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if not record.name or record.name == "New":
                kiosk_code = record.kiosk_id.kiosk_code or "KIOSK"
                record.name = "BSC-%s-%05d" % (kiosk_code, record.id)
        return records

    def _check_not_locked(self, vals=None):
        locked = self.filtered("locked_at")
        if locked and vals:
            raise UserError(
                "Approved shift closes are locked. Reopen through a controlled manager workflow before changing counts or cash."
            )

    def write(self, vals):
        self._check_not_locked(vals)
        return super().write(vals)

    def unlink(self):
        if self.filtered("locked_at"):
            raise UserError("Approved shift closes cannot be deleted.")
        return super().unlink()

    def action_recompute_ingredient_variance(self):
        """Recompute the ingredient-level variance lines from consumption ledger,
        waste entries, and stock transfers within the shift window. Counted
        quantities are preserved if already entered.
        """
        for close in self:
            close._populate_ingredient_variance(preserve_counted=True)

    def _populate_ingredient_variance(self, counted_overrides=None, preserve_counted=False):
        """Build ingredient_variance_line_ids from:
           - opening = stock at opened_at (best effort)
           - received = transfers IN to kiosk between opened_at and closed_at
           - consumed = sum(bayaan.consumption.ledger) for kiosk in window
           - waste = sum(bayaan.waste.entry scrap) for kiosk in window
           - expected = opening + received - consumed - waste
           - actual = counted_overrides[ingredient_id] (else preserved or 0)
        """
        self.ensure_one()
        Ledger = self.env["bayaan.consumption.ledger"].sudo()
        Waste = self.env["bayaan.waste.entry"].sudo()
        Quant = self.env["stock.quant"].sudo()
        Move = self.env["stock.move"].sudo()
        IngredientLine = self.env["bayaan.shift.close.ingredient.line"].sudo()

        opened_at = self.opened_at or fields.Datetime.now()
        closed_at = self.closed_at or fields.Datetime.now()

        # Discover the ingredient set: union of all consumption + waste + transferred ingredients
        # PLUS anything already counted manually.
        consumption_rows = Ledger._read_group(
            [
                ("kiosk_id", "=", self.kiosk_id.id),
                ("consumed_at", ">=", opened_at),
                ("consumed_at", "<=", closed_at),
            ],
            ["ingredient_id"],
            ["ingredient_qty:sum"],
        )
        waste_rows = Waste._read_group(
            [
                ("kiosk_id", "=", self.kiosk_id.id),
                ("create_date", ">=", opened_at),
                ("create_date", "<=", closed_at),
            ],
            ["product_id"],
            ["qty:sum"],
        )

        consumed_by_ing = {ingredient.id: qty for ingredient, qty in consumption_rows if ingredient}
        waste_by_product = {product.id: qty for product, qty in waste_rows if product}

        # Stock transfers IN to kiosk (received) within window — match on stock.move.location_dest_id
        moves = Move.search([
            ("location_dest_id", "=", self.kiosk_id.stock_location_id.id),
            ("state", "=", "done"),
            ("date", ">=", opened_at),
            ("date", "<=", closed_at),
        ])
        received_by_product = {}
        for move in moves:
            received_by_product[move.product_id.id] = received_by_product.get(move.product_id.id, 0.0) + move.quantity

        ingredient_ids = set(consumed_by_ing.keys()) | set(waste_by_product.keys()) | set(received_by_product.keys())
        if counted_overrides:
            ingredient_ids |= set(counted_overrides.keys())
        if preserve_counted:
            ingredient_ids |= set(self.ingredient_variance_line_ids.mapped("ingredient_id").ids)

        existing_counted = {}
        if preserve_counted:
            for line in self.ingredient_variance_line_ids:
                existing_counted[line.ingredient_id.id] = line.actual_qty

        # Wipe and rebuild
        self.ingredient_variance_line_ids.unlink()
        new_line_vals = []
        for ing_id in ingredient_ids:
            ingredient = self.env["product.product"].sudo().browse(ing_id)
            if not ingredient.exists():
                continue
            consumed = consumed_by_ing.get(ing_id, 0.0)
            wasted = waste_by_product.get(ing_id, 0.0)
            received = received_by_product.get(ing_id, 0.0)

            # Opening: stock at the beginning of the shift = quant_now + consumed + wasted - received
            current_qty = Quant._get_available_quantity(
                ingredient,
                self.kiosk_id.stock_location_id,
                strict=True,
                allow_negative=True,
            )
            opening = current_qty + consumed + wasted - received
            expected = opening + received - consumed - wasted

            actual = (counted_overrides or {}).get(ing_id)
            if actual is None:
                actual = existing_counted.get(ing_id, 0.0) if preserve_counted else 0.0

            new_line_vals.append((0, 0, {
                "shift_close_id": self.id,
                "ingredient_id": ing_id,
                "uom_id": ingredient.uom_id.id,
                "opening_qty": opening,
                "received_qty": received,
                "consumed_qty": consumed,
                "waste_qty": wasted,
                "actual_qty": actual,
                "unit_cost": ingredient.standard_price,
            }))
        if new_line_vals:
            self.write({"ingredient_variance_line_ids": new_line_vals})


class BayaanShiftCloseLine(models.Model):
    _name = "bayaan.shift.close.line"
    _description = "Bayaan Shift Close Stock Count"
    _order = "product_id"

    shift_close_id = fields.Many2one("bayaan.shift.close", required=True, ondelete="cascade")
    kiosk_id = fields.Many2one(related="shift_close_id.kiosk_id", store=True)
    product_id = fields.Many2one("product.product", required=True)
    uom_id = fields.Many2one("uom.uom", required=True)
    expected_qty = fields.Float(string="Expected Quantity")
    actual_qty = fields.Float(string="Actual Count")
    variance_qty = fields.Float(compute="_compute_variance_qty", store=True)
    note = fields.Char()
    company_id = fields.Many2one(related="shift_close_id.company_id", store=True)

    @api.model_create_multi
    def create(self, vals_list):
        close_ids = [vals.get("shift_close_id") for vals in vals_list if vals.get("shift_close_id")]
        if close_ids:
            locked = self.env["bayaan.shift.close"].browse(close_ids).filtered("locked_at")
            if locked:
                raise UserError("Approved shift closes cannot receive new stock-count lines.")
        return super().create(vals_list)

    def write(self, vals):
        if self.mapped("shift_close_id").filtered("locked_at"):
            raise UserError("Approved shift close stock-count lines cannot be edited.")
        return super().write(vals)

    def unlink(self):
        if self.mapped("shift_close_id").filtered("locked_at"):
            raise UserError("Approved shift close stock-count lines cannot be deleted.")
        return super().unlink()

    @api.depends("actual_qty", "expected_qty")
    def _compute_variance_qty(self):
        for line in self:
            line.variance_qty = line.actual_qty - line.expected_qty


class BayaanShiftCloseIngredientLine(models.Model):
    _name = "bayaan.shift.close.ingredient.line"
    _description = "Bayaan Shift Close Ingredient Variance"
    _order = "ingredient_id"

    shift_close_id = fields.Many2one("bayaan.shift.close", required=True, ondelete="cascade")
    kiosk_id = fields.Many2one(related="shift_close_id.kiosk_id", store=True)
    ingredient_id = fields.Many2one("product.product", required=True, string="Ingredient")
    uom_id = fields.Many2one("uom.uom", required=True)
    opening_qty = fields.Float(string="Opening Stock")
    received_qty = fields.Float(string="Received Today")
    consumed_qty = fields.Float(string="Consumed by Sales")
    waste_qty = fields.Float(string="Waste/Loss")
    expected_qty = fields.Float(string="Expected Closing", compute="_compute_expected_qty", store=True)
    actual_qty = fields.Float(string="Counted")
    variance_qty = fields.Float(compute="_compute_variance_qty", store=True)
    unit_cost = fields.Monetary(currency_field="currency_id")
    variance_value = fields.Monetary(
        currency_field="currency_id",
        compute="_compute_variance_value",
        store=True,
    )
    currency_id = fields.Many2one(related="shift_close_id.currency_id")
    company_id = fields.Many2one(related="shift_close_id.company_id", store=True)

    @api.model_create_multi
    def create(self, vals_list):
        close_ids = [vals.get("shift_close_id") for vals in vals_list if vals.get("shift_close_id")]
        if close_ids:
            locked = self.env["bayaan.shift.close"].browse(close_ids).filtered("locked_at")
            if locked:
                raise UserError("Approved shift closes cannot receive new ingredient-variance lines.")
        return super().create(vals_list)

    def write(self, vals):
        if self.mapped("shift_close_id").filtered("locked_at"):
            raise UserError("Approved shift close ingredient-variance lines cannot be edited.")
        return super().write(vals)

    def unlink(self):
        if self.mapped("shift_close_id").filtered("locked_at"):
            raise UserError("Approved shift close ingredient-variance lines cannot be deleted.")
        return super().unlink()

    @api.depends("opening_qty", "received_qty", "consumed_qty", "waste_qty")
    def _compute_expected_qty(self):
        for line in self:
            line.expected_qty = line.opening_qty + line.received_qty - line.consumed_qty - line.waste_qty

    @api.depends("actual_qty", "expected_qty")
    def _compute_variance_qty(self):
        for line in self:
            line.variance_qty = line.actual_qty - line.expected_qty

    @api.depends("variance_qty", "unit_cost")
    def _compute_variance_value(self):
        for line in self:
            line.variance_value = line.variance_qty * line.unit_cost
