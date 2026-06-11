import pytz

from odoo import api, fields, models
from odoo.exceptions import UserError

# Single timezone authority for business-day boundaries (mirrors the controller's
# _report_datetime / _bayaan_local_datetime — see [[timestamps-baghdad-one-system]]).
BAYAAN_TZ = "Asia/Baghdad"


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
    auto_closed = fields.Boolean(
        default=False,
        copy=False,
        help="Created by the system safety net because the cashier did not submit a manual close.",
    )
    funds_uncounted = fields.Boolean(
        default=False,
        copy=False,
        help="Cash, card, and stock were never physically counted; figures assume the expected amounts and must be verified by a manager.",
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

    # --- Automatic daily-close safety net -------------------------------------
    # Without this, a cashier who forgets to close leaves the Odoo pos.session
    # open forever (no Z-report / accounting settlement) and no variance record
    # exists for the day. These methods finalize the Odoo session AND create a
    # flagged bayaan.shift.close (funds_uncounted) so the day stays auditable and
    # the admin surfaces "needs manager review" instead of silently losing it.

    @api.model
    def _bayaan_local_day(self, value):
        """Baghdad civil date of a stored (naive-UTC) datetime."""
        tz = pytz.timezone(BAYAAN_TZ)
        return pytz.utc.localize(value).astimezone(tz).date()

    @api.model
    def _cron_auto_close_stale_sessions(self):
        """Cron entry: auto-close any open pos.session whose business day (its
        ``start_at`` in Baghdad time) is before today. Current-day sessions stay
        open. The on-open lazy backstop handles the common path; this catches the
        rest (e.g. a kiosk that records no sale the next morning)."""
        Session = self.env["pos.session"].sudo()
        Kiosk = self.env["bayaan.kiosk"].sudo()
        today = self._bayaan_local_day(fields.Datetime.now())
        for session in Session.search([("state", "in", ("opening_control", "opened", "closing_control"))]):
            kiosk = Kiosk.search([("pos_config_id", "=", session.config_id.id)], limit=1)
            if not kiosk:
                continue
            if self._bayaan_local_day(session.start_at or fields.Datetime.now()) >= today:
                continue
            self.sudo()._bayaan_auto_close_session(session, kiosk, reason="cron")

    @api.model
    def _bayaan_auto_close_session(self, session, kiosk, reason="cron"):
        """Finalize one Odoo pos.session with system-estimated balances (so the
        accounting stays balanced) and create a flagged bayaan.shift.close.
        Returns the close record, or None if the Odoo session could not be closed
        (in which case nothing is recorded, to avoid duplicate closes)."""
        session = session.sudo()
        opened_at = session.start_at or fields.Datetime.now()
        try:
            if session.state in ("opening_control", "opened", "closing_control"):
                if session.config_id.cash_control:
                    # No physical count happened; treat counted == expected so the
                    # cash difference is zero and the books stay balanced. Bayaan
                    # flags funds_uncounted separately so the day is not trusted.
                    session.cash_register_balance_end_real = session.cash_register_balance_end
                session.with_company(session.config_id.company_id).action_pos_session_closing_control()
        except Exception as error:  # noqa: BLE001 - a close must never crash the cron
            self._bayaan_emit_close_audit(
                kiosk, None, "critical",
                "Auto-close failed for %s" % kiosk.name,
                "pos.session %s could not be closed automatically (%s): %s" % (session.id, reason, error),
            )
            return None
        session.invalidate_recordset(["state", "stop_at"])
        if session.state != "closed":
            self._bayaan_emit_close_audit(
                kiosk, None, "critical",
                "Auto-close needs attention for %s" % kiosk.name,
                "pos.session %s did not reach the closed state automatically (%s)." % (session.id, reason),
            )
            return None

        closed_at = session.stop_at or fields.Datetime.now()
        business_day = self._bayaan_local_day(opened_at)
        already = self.sudo().search([("kiosk_id", "=", kiosk.id)]).filtered(
            lambda c: c.closed_at and self._bayaan_local_day(c.closed_at) == business_day
        )
        if already:
            # The business day already has a close (e.g. the cashier closed via the
            # UI but the Odoo session stayed open). The session is finalized above;
            # creating a second flagged close would surface a false "never closed"
            # review row for a day that was in fact closed.
            kiosk.sudo().write({"last_daily_close_at": closed_at})
            self._bayaan_emit_close_audit(
                kiosk, already[0], "info",
                "Finalized Odoo session for %s" % kiosk.name,
                "pos.session %s was finalized automatically (%s); close %s already covers %s, "
                "so no duplicate close was created." % (session.id, reason, already[0].name, business_day),
            )
            return already[0]
        orders = session.order_ids.filtered(lambda o: o.state in ("paid", "done", "invoiced"))
        payments = orders.mapped("payment_ids")
        expected_cash = (session.cash_register_balance_start or 0.0) + sum(
            payments.filtered(lambda p: p.payment_method_id.type == "cash").mapped("amount")
        )
        expected_card = sum(
            payments.filtered(lambda p: p.payment_method_id.type != "cash").mapped("amount")
        )
        close = self.sudo().create({
            "kiosk_id": kiosk.id,
            "cashier_id": session.user_id.id or False,
            "opened_at": opened_at,
            "closed_at": closed_at,
            "opening_cash": session.cash_register_balance_start or 0.0,
            "expected_cash": expected_cash,
            "actual_cash": expected_cash,
            "expected_card": expected_card,
            "actual_card": expected_card,
            "pos_order_ids": [(6, 0, orders.ids)],
            "auto_closed": True,
            "funds_uncounted": True,
            "investigation_status": "open",
            "manager_note": (
                "Auto-closed by system (%s): the cashier did not submit a manual close. "
                "Cash, card, and stock were NOT physically counted - figures assume the "
                "expected amounts. A manager must verify the drawer and stock and re-review." % reason
            ),
        })
        close._populate_ingredient_variance()
        # Uncounted -> set counted := expected so the stored variance is zero
        # rather than a false shortage; funds_uncounted marks it unverified.
        for line in close.ingredient_variance_line_ids:
            line.actual_qty = line.expected_qty
        kiosk.sudo().write({"last_daily_close_at": closed_at})
        self._bayaan_emit_close_audit(
            kiosk, close, "warning",
            "Auto-closed %s (funds not counted)" % kiosk.name,
            "System closed %s for the day; cash/card/stock were not counted and need manager verification." % kiosk.name,
        )
        return close

    def _bayaan_emit_close_audit(self, kiosk, close, severity, title, detail):
        """Best-effort audit + realtime emit so an auto-close is never silent."""
        try:
            audit = self.env["bayaan.audit.event"].sudo().create({
                "event_type": "shift_close",
                "action": "shift_close.auto_closed" if close else "shift_close.auto_failed",
                "severity": severity,
                "title": title,
                "detail": detail,
                "kiosk_id": kiosk.id if kiosk else False,
                "model_name": "bayaan.shift.close",
                "res_id": close.id if close else False,
                "reference": close.name if close else False,
            })
            self.env["bayaan.realtime"].sudo().publish_from_audit(audit)
        except Exception:  # noqa: BLE001 - audit / realtime emit is best-effort
            pass


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
