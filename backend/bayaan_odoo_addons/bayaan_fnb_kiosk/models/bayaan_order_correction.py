from odoo import api, fields, models


class BayaanOrderCorrection(models.Model):
    """#5 — an order-linked 'wrong order' correction. Two outcomes, both reverse the money to the
    customer (a real reversing account.move crediting the original payment channel); they differ
    ONLY in the stock treatment:

      void    -> the order was NOT made: reverse the revenue AND RETURN the consumed stock to the
                 kiosk, and exclude the line from COGS — so it is as if the sale never happened
                 (no revenue, no consumption, no phantom variance).
      remake  -> the item WAS already made (ingredients consumed): reverse the revenue (the
                 customer gets their money back) but the stock stays DEDUCTED and COGS STANDS —
                 the kiosk ate the cost of a made-but-not-paid product.

    Wrong orders are deliberately a SEPARATE channel from waste so a sold drink is never
    re-scrapped through the waste workflow (which would double-count the stock loss)."""

    _name = "bayaan.order.correction"
    _description = "Bayaan Wrong-Order Correction"
    _order = "create_date desc, id desc"

    name = fields.Char(default="New", copy=False)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True, index=True)
    cashier_id = fields.Many2one("res.users")
    pos_order_id = fields.Many2one("pos.order", required=True, index=True, ondelete="cascade")
    pos_order_line_id = fields.Many2one("pos.order.line")
    product_id = fields.Many2one("product.product")
    qty = fields.Float(default=1.0)
    amount = fields.Monetary(currency_field="currency_id", help="Line revenue affected by this correction.")
    reason = fields.Selection(
        [
            ("wrong_item", "Incorrect item"),
            ("wrong_size", "Incorrect size"),
            ("duplicate", "Duplicate order"),
            ("customer_rejected", "Customer rejection"),
        ],
        required=True,
    )
    outcome = fields.Selection(
        [
            ("void", "Void (not made — refund + return stock)"),
            ("remake", "Remake (already made — refund, keep stock consumed)"),
        ],
        required=True,
    )
    note = fields.Text()
    state = fields.Selection([("draft", "Draft"), ("posted", "Posted")], default="draft")
    scrap_ids = fields.Many2many("stock.scrap", string="Generated Scraps", readonly=True)
    # Legacy: retained so old data + the field reference survive, but void/refund now post a real
    # reversing account.move (see reversal_move_id) instead of a Bayaan-side P&L adjustment.
    finance_adjustment_id = fields.Many2one("bayaan.finance.adjustment", readonly=True)
    reversal_move_id = fields.Many2one(
        "account.move", readonly=True,
        help="The real reversing journal entry posted for a void/refund (revenue reversed in the formal books).")
    currency_id = fields.Many2one(related="company_id.currency_id")
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if not record.name or record.name == "New":
                record.name = "WO-%s-%05d" % (record.kiosk_id.kiosk_code or "K", record.id)
        return records

    def _refund_credit_account(self, payment_method, gl, company):
        """The GL account a refund should CREDIT for a given payment channel — i.e. the same
        account the original payment DEBITED, so the reversal returns money to the real channel:
          cash       -> the cash journal's account (money leaves the drawer)
          bank/card  -> the method's outstanding/clearing account (the processor reverses)
          pay_later  -> the customer's receivable account (their account balance is restored)
        Falls back to the generic bank account only if a method is mis-configured."""
        pm = payment_method
        if pm and pm.type == "pay_later":
            return (pm.receivable_account_id
                    or company.partner_id.property_account_receivable_id
                    or gl._bayaan_bank_account(company))
        if pm and pm.type == "bank":
            return (pm.outstanding_account_id
                    or (pm.journal_id and pm.journal_id.default_account_id)
                    or gl._bayaan_bank_account(company))
        if pm and pm.type == "cash":
            return ((pm.journal_id and pm.journal_id.default_account_id)
                    or gl._bayaan_bank_account(company))
        return gl._bayaan_bank_account(company)

    def _post_revenue_reversal(self):
        """Reverse the corrected revenue in the REAL Odoo ledger (account.move), not a side
        table — so the formal books are never overstated by a voided/refunded paid order.

        Mirrors the native POS Z-report move with opposite signs:
            Dr Product Sales (net) + Dr VAT (tax)   Cr <original payment channel(s)> (incl)
        The credit goes to the SAME channel(s) the customer paid with (cash drawer / card
        clearing / customer-account receivable), split proportionally when an order mixed
        tenders — never a generic bank lump. Uses existing Bayaan/POS accounts (no client chart
        of accounts required). The income line carries the kiosk branch analytic the
        account_move guard requires. Idempotent through a per-correction ``ref``; dated on the
        correction's own day so it lands in the current open period."""
        self.ensure_one()
        order = self.pos_order_id
        company = self.company_id
        gl = self.env["bayaan.gl"].sudo()
        incl = round(abs(self.amount or 0.0), 2)
        if incl <= 0:
            return False
        line = self.pos_order_line_id
        # Split the tax-incl amount into net + VAT from the source line (Iraq default 0% => no VAT).
        if line and line.price_subtotal_incl:
            net = round(line.price_subtotal * (incl / line.price_subtotal_incl), 2)
        elif order.amount_total:
            net = round(incl * ((order.amount_total - order.amount_tax) / order.amount_total), 2)
        else:
            net = incl
        tax = round(incl - net, 2)
        income = gl._bayaan_gl_account("400000", "Product Sales", "income", company)
        vat = gl._bayaan_vat_payable_account(company)
        analytic = self.kiosk_id._bayaan_analytic_distribution()
        outcome_label = dict(self._fields["outcome"].selection).get(self.outcome, self.outcome)
        lines = [
            {"name": "Revenue reversal — %s (%s)" % (order.name, outcome_label),
             "account": income, "debit": net, "analytic": analytic},
        ]
        if tax > 0.005:
            lines.append({"name": "VAT reversal — %s" % order.name, "account": vat, "debit": tax})
        # CREDIT the original payment channel(s), proportional to how the order was actually paid.
        payments = order.payment_ids
        total_paid = round(sum(payments.mapped("amount")), 2)
        credit_by_account = {}
        if payments and total_paid > 0:
            for pay in payments:
                acct = self._refund_credit_account(pay.payment_method_id, gl, company)
                share = round(incl * (pay.amount / total_paid), 2)
                if acct and share:
                    credit_by_account[acct] = round(credit_by_account.get(acct, 0.0) + share, 2)
        else:
            credit_by_account[gl._bayaan_bank_account(company)] = incl
        # Fix any rounding drift so total credit == incl exactly.
        drift = round(incl - sum(credit_by_account.values()), 2)
        if drift and credit_by_account:
            first = next(iter(credit_by_account))
            credit_by_account[first] = round(credit_by_account[first] + drift, 2)
        for acct, amt in credit_by_account.items():
            if amt:
                lines.append({"name": "Refund to %s — %s (%s)" % (acct.name, order.name, self.name),
                              "account": acct, "credit": amt})
        ref = "Bayaan Revenue Reversal · %s · %s" % (order.name, self.name)
        move = gl._bayaan_gl_post(
            ref=ref, lines=lines,
            date=fields.Date.context_today(self.env.user), company=company, move_type="entry")
        if move:
            self.reversal_move_id = move
        return move

    @api.model
    def _bayaan_voided_qty_map(self, company):
        """{pos_order_line_id: total voided sold-qty} from posted VOID corrections — so the COGS
        computations (recipe ledger handles itself via the contra row; finished/hybrid goods are
        priced off pos.order.line.qty) can net out a voided line's cost. #5 void."""
        rows = self.sudo()._read_group(
            [
                ("company_id", "=", company.id),
                ("state", "=", "posted"),
                ("outcome", "=", "void"),
                ("pos_order_line_id", "!=", False),
            ],
            ["pos_order_line_id"],
            ["qty:sum"],
        )
        return {line.id: qty for line, qty in rows if line}

    def _reverse_consumption_for_void(self):
        """VOID = the line was rung by mistake (never made), so RETURN the recipe ingredients (and/
        or finished stock) the sale's consumption hook deducted, back to the kiosk. This restores
        the kiosk on-hand so the variance loop has no phantom shortage (expected == counted). The
        immutable original consumption-ledger rows are NOT mutated; instead the voided line is
        EXCLUDED from the recipe COGS sum and its finished qty is netted out (see the COGS
        computations, keyed on _bayaan_voided_qty_map), so COGS reverses consistently in both the
        formal ledger and the operational dashboard. Only VOID does this."""
        self.ensure_one()
        product = self.product_id
        if not product or not self.kiosk_id:
            return
        line = self.pos_order_line_id
        mode = product.product_tmpl_id.bayaan_consumption_mode
        location = self.kiosk_id.stock_location_id
        Quant = self.env["stock.quant"].sudo()
        factor = self.qty or 1.0

        def _add_back(prod, qty):
            if qty > 0 and prod.is_storable and location:
                Quant._update_available_quantity(prod, location, qty)

        if mode in ("recipe", "hybrid"):
            recipe = self.env["bayaan.recipe"].get_active_recipe(
                product, self.company_id, self.pos_order_id.date_order or fields.Datetime.now())
            if recipe:
                modifier_factor = (line.bayaan_modifier_recipe_factor or 1.0) if line else 1.0
                if modifier_factor <= 0:
                    modifier_factor = 1.0
                for rl in recipe.line_ids:
                    ing_qty = rl.qty * factor * modifier_factor
                    if ing_qty <= 0:
                        continue
                    # add stock back in the ingredient's own stock UoM
                    stock_qty = ing_qty
                    if rl.uom_id and rl.ingredient_id.uom_id and rl.uom_id.id != rl.ingredient_id.uom_id.id:
                        stock_qty = rl.uom_id._compute_quantity(ing_qty, rl.ingredient_id.uom_id)
                    _add_back(rl.ingredient_id, stock_qty)
        if mode in ("finished", "hybrid") or (mode == "none" and product.is_storable):
            _add_back(product, factor)

    def action_post(self):
        for record in self:
            if record.state == "posted":
                continue
            # Both outcomes refund the money to the customer via a real reversing account.move.
            record._post_revenue_reversal()
            if record.outcome == "void":
                # Order NOT made -> also return the consumed stock + exclude the line from COGS,
                # so it is as if the sale never happened.
                record._reverse_consumption_for_void()
            # remake: the item WAS made -> stock stays consumed and COGS stands; only money reversed.
            record.state = "posted"
        return True
