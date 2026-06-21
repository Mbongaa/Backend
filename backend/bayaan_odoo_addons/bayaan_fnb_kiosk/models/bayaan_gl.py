"""Bayaan General-Ledger posting layer.

The deterministic Bayaan layers (consumption ledger, payroll runs, operating
expenses, waste, purchases) compute the real economics of the business, but
historically only POS sessions + CapEx + manual entries reached the formal Odoo
double-entry books. That left the income statement with no cost of goods sold and
the balance sheet with no inventory or payables.

This abstract model is the single place that posts those deterministic figures
into real `account.move` records so the formal statements reflect the true cost
structure. It runs a *perpetual* inventory model that mirrors the variance loop:

    purchase receipt        Dr Inventory          Cr Accounts Payable
    recipe/finished sale     Dr COGS               Cr Inventory
    waste / spoilage         Dr Waste expense      Cr Inventory
    payroll (paid)           Dr Salaries & Wages   Cr Bank
    operating expense        Dr <category expense>  Cr Bank
    opening stock            Dr Inventory          Cr Opening Balance Equity

Every income/expense line carries the kiosk (or HQ) branch analytic the
`account_move.py` guard requires. Posting is idempotent through a deterministic
`ref` per source record — re-running a seed or close never double-posts. Numbers
are still computed deterministically; the AI never touches any of this.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError


class BayaanGL(models.AbstractModel):
    _name = "bayaan.gl"
    _description = "Bayaan General Ledger Posting Helper"

    # ------------------------------------------------------------------
    # Account / journal resolution (idempotent get-or-create, company-scoped)
    # ------------------------------------------------------------------
    @api.model
    def _bayaan_gl_account(self, code, name, account_type, company=None):
        company = company or self.env.company
        Account = self.env["account.account"].sudo()
        account = Account.with_context(active_test=False).search([("code", "=", code)], limit=1)
        if account:
            # Make sure it is usable for this company (v19 shares accounts via company_ids).
            if "company_ids" in Account._fields and company.id not in account.company_ids.ids:
                account.write({"company_ids": [(4, company.id)]})
            return account
        values = {"code": code, "name": name, "account_type": account_type}
        if "company_ids" in Account._fields:
            values["company_ids"] = [(6, 0, [company.id])]
        elif "company_id" in Account._fields:
            values["company_id"] = company.id
        return Account.create(values)

    @api.model
    def _bayaan_inventory_account(self, company=None):
        return self._bayaan_gl_account("115000", "Inventory - Stock on hand", "asset_current", company)

    @api.model
    def _bayaan_cogs_account(self, company=None):
        return self._bayaan_gl_account("500000", "Cost of Goods Sold", "expense_direct_cost", company)

    @api.model
    def _bayaan_wages_account(self, company=None):
        # 600000 is Odoo's generic "Expenses" demo account; use a distinct code so
        # the wage line is labelled "Salaries & Wages", not the generic name.
        return self._bayaan_gl_account("601000", "Salaries & Wages", "expense", company)

    @api.model
    def _bayaan_waste_account(self, company=None):
        return self._bayaan_gl_account("605000", "Waste & Spoilage", "expense", company)

    OPEX_ACCOUNTS = {
        "utilities": ("621000", "Utilities"),
        "rent": ("622000", "Rent"),
        "maintenance": ("623000", "Repairs & Maintenance"),
        "repair": ("623000", "Repairs & Maintenance"),
        "transport": ("624000", "Transport & Delivery"),
        "delivery": ("624000", "Transport & Delivery"),
        "staff": ("625000", "Staff Welfare"),
        "marketing": ("626000", "Marketing & Promotion"),
        "operations": ("629000", "General Operating Expenses"),
    }

    @api.model
    def _bayaan_opex_account(self, category, company=None):
        key = (category or "").strip().lower()
        code, name = self.OPEX_ACCOUNTS.get(key, ("629000", "General Operating Expenses"))
        return self._bayaan_gl_account(code, name, "expense", company)

    @api.model
    def _bayaan_opening_equity_account(self, company=None):
        return self._bayaan_gl_account("399000", "Opening Balance Equity", "equity", company)

    @api.model
    def _bayaan_bank_account(self, company=None):
        """The account wages / operating expenses are paid out of. Prefer the bank
        journal's default account, else an existing bank/cash account, else create one."""
        company = company or self.env.company
        Journal = self.env["account.journal"].sudo()
        bank_journal = Journal.search([("type", "=", "bank"), ("company_id", "=", company.id)], limit=1)
        if bank_journal and bank_journal.default_account_id:
            return bank_journal.default_account_id
        Account = self.env["account.account"].sudo()
        existing = Account.search([("code", "=", "101401")], limit=1)
        if existing:
            return existing
        return self._bayaan_gl_account("101400", "Bank", "asset_cash", company)

    @api.model
    def _bayaan_safe_account(self, company=None):
        """The safe/vault cash holding account (distinct from the drawer/bank cash) so a
        drawer-to-safe deposit is an auditable asset transfer, not an unexplained cash drop. #4"""
        return self._bayaan_gl_account("101350", "Cash in Safe", "asset_cash", company)

    @api.model
    def _bayaan_payable_account(self, partner, company=None):
        company = company or self.env.company
        if partner and partner.property_account_payable_id:
            return partner.property_account_payable_id
        return self._bayaan_gl_account("211000", "Accounts Payable", "liability_payable", company)

    @api.model
    def _bayaan_vat_payable_account(self, company=None):
        return self._bayaan_gl_account("251000", "VAT Payable", "liability_current", company)

    @api.model
    def _bayaan_sale_tax(self, orders):
        """The single sale tax actually applied on the contributing POS order lines
        (Iraq's default is 0% = no sale tax, so this is usually empty). Used to mark
        the VAT-return base/tax lines so the tax report (tax_line_id / tax_ids) ties
        to the posted move."""
        taxes = orders.mapped("lines.tax_ids_after_fiscal_position").filtered(
            lambda t: t.type_tax_use == "sale" and t.amount)
        return taxes[:1]

    @api.model
    def _bayaan_gl_journal(self, company=None):
        company = company or self.env.company
        journal = self.env["account.journal"].sudo().search(
            [("type", "=", "general"), ("company_id", "=", company.id)], limit=1)
        if not journal:
            raise UserError("No general (miscellaneous) journal found to post Bayaan accounting entries.")
        return journal

    @api.model
    def _bayaan_hq_distribution(self, company=None):
        account = self.env["bayaan.kiosk"].sudo()._bayaan_hq_analytic_account(company)
        return {str(account.id): 100.0} if account else {}

    @api.model
    def _bayaan_bank_journal(self, company=None):
        company = company or self.env.company
        return self.env["account.journal"].sudo().search(
            [("type", "in", ("bank", "cash")), ("company_id", "=", company.id)], limit=1)

    @staticmethod
    def _bayaan_dt_bounds(date_from, date_to):
        """Bound civil dates as stored-datetime strings, or (None, None)."""
        return (("%s 00:00:00" % date_from) if date_from else None,
                ("%s 23:59:59" % date_to) if date_to else None)

    # ------------------------------------------------------------------
    # Core poster — build + post one balanced move.
    # ------------------------------------------------------------------
    @api.model
    def _bayaan_already_posted(self, ref, company=None):
        company = company or self.env.company
        return bool(self.env["account.move"].sudo().search_count([
            ("company_id", "=", company.id), ("ref", "=", ref), ("state", "=", "posted"),
        ]))

    @api.model
    def _bayaan_posted_net(self, ref_prefix, company, account=None, line_name=None):
        """Net (debit - credit) already posted on lines of posted moves whose ref
        starts with ``ref_prefix`` (the per-kiosk/day source marker), optionally
        narrowed to one account and/or line label.

        This is the core of *source-based* idempotency: instead of treating a
        kiosk/day ``ref`` as a one-shot key (which silently drops a second session,
        a late order, or a back-dated correction once the first move posts), each
        poster recomputes the true total from the source rows and posts only the
        delta versus what the ledger already holds. Re-running posts nothing; a new
        source row posts exactly its increment; a rolled-back transaction leaves no
        partial post so a retry re-posts cleanly."""
        AML = self.env["account.move.line"].sudo()
        domain = [
            ("parent_state", "=", "posted"),
            ("company_id", "=", company.id),
            ("move_id.ref", "=like", ref_prefix + "%"),
        ]
        if account is not None:
            domain.append(("account_id", "=", account.id))
        if line_name is not None:
            domain.append(("name", "=", line_name))
        rows = AML._read_group(domain, aggregates=["debit:sum", "credit:sum"])
        if not rows:
            return 0.0
        return round((rows[0][0] or 0.0) - (rows[0][1] or 0.0), 2)

    @api.model
    def _bayaan_delta_ref(self, base_ref, company):
        """A unique, human-readable ref for a delta post: the base ref for the first
        post of a kiosk/day, then ``· adjN`` for each subsequent increment so the
        ledger keeps an auditable trail and ``_bayaan_already_posted`` never blocks a
        legitimate later increment."""
        n = self.env["account.move"].sudo().search_count([
            ("company_id", "=", company.id), ("state", "=", "posted"),
            ("ref", "=like", base_ref + "%"),
        ])
        return base_ref if not n else "%s · adj%d" % (base_ref, n)

    @api.model
    def _bayaan_gl_post(self, ref, lines, date=None, journal=None, company=None,
                        move_type="entry", partner=None):
        """Create + post a balanced account.move. ``lines`` is a list of dicts:
        {name, account(record), debit, credit, analytic(distribution dict), partner_id}.
        Returns the posted move (or the existing one if ref already posted)."""
        company = company or self.env.company
        if self._bayaan_already_posted(ref, company):
            return self.env["account.move"].sudo().search([
                ("company_id", "=", company.id), ("ref", "=", ref), ("state", "=", "posted")], limit=1)
        journal = journal or self._bayaan_gl_journal(company)
        total_debit = total_credit = 0.0
        commands = []
        for line in lines:
            debit = round(line.get("debit", 0.0) or 0.0, 2)
            credit = round(line.get("credit", 0.0) or 0.0, 2)
            if debit <= 0 and credit <= 0:
                continue
            total_debit += debit
            total_credit += credit
            values = {
                "name": line.get("name") or "/",
                "account_id": line["account"].id,
                "debit": debit,
                "credit": credit,
            }
            if line.get("analytic"):
                values["analytic_distribution"] = line["analytic"]
            if line.get("partner_id"):
                values["partner_id"] = line["partner_id"]
            if line.get("tax_ids"):
                values["tax_ids"] = [(6, 0, line["tax_ids"])]
            if line.get("tax_line_id"):
                values["tax_line_id"] = line["tax_line_id"]
            commands.append((0, 0, values))
        if len(commands) < 2:
            return False
        if abs(total_debit - total_credit) > 0.05:
            raise UserError("Bayaan GL entry %s does not balance: %.2f vs %.2f" % (ref, total_debit, total_credit))
        move = self.env["account.move"].sudo().create({
            "move_type": move_type,
            "journal_id": journal.id,
            "date": date or fields.Date.context_today(self.env.user),
            "ref": ref,
            "company_id": company.id,
            "partner_id": partner.id if partner else False,
            "line_ids": commands,
        })
        move.action_post()
        return move

    # ==================================================================
    # COGS — Dr COGS / Cr Inventory, per kiosk per business day.
    # Recipe products draw on the consumption ledger (ingredient cost at sale
    # time); finished/hybrid products draw on the product standard cost.
    # ==================================================================
    @api.model
    def _bayaan_post_cogs(self, company=None, kiosk=None, date_from=None, date_to=None):
        company = company or self.env.company
        Ledger = self.env["bayaan.consumption.ledger"].sudo()
        PosOrder = self.env["pos.order"].sudo()
        Kiosk = self.env["bayaan.kiosk"].sudo()
        inventory = self._bayaan_inventory_account(company)
        cogs = self._bayaan_cogs_account(company)
        journal = self._bayaan_gl_journal(company)

        start, end = self._bayaan_dt_bounds(date_from, date_to)
        ledger_domain = [("company_id", "=", company.id)]
        order_domain = [("company_id", "=", company.id), ("state", "in", ("paid", "done", "invoiced"))]
        if kiosk:
            ledger_domain.append(("kiosk_id", "=", kiosk.id))
            order_domain.append(("bayaan_kiosk_id", "=", kiosk.id))
        if start:
            ledger_domain.append(("consumed_at", ">=", start))
            order_domain.append(("date_order", ">=", start))
        if end:
            ledger_domain.append(("consumed_at", "<=", end))
            order_domain.append(("date_order", "<=", end))

        # A VOIDED line never produced the good, so it must not carry COGS: exclude its recipe
        # consumption rows here, and net its finished/hybrid qty out below. #5 void
        voided_qty = self.env["bayaan.order.correction"]._bayaan_voided_qty_map(company)
        voided_line_ids = set(voided_qty.keys())
        by_kiosk_day = {}
        for row in Ledger.search(ledger_domain):
            if not row.kiosk_id or not row.consumed_at:
                continue
            if row.pos_order_line_id.id in voided_line_ids:
                continue
            day = fields.Date.to_date(row.consumed_at)
            by_kiosk_day[(row.kiosk_id.id, day)] = by_kiosk_day.get((row.kiosk_id.id, day), 0.0) + (row.total_cost or 0.0)

        # Finished / hybrid goods: COGS = sold qty x standard cost (no recipe ledger row).
        for order in PosOrder.search(order_domain):
            kiosk_rec = order.bayaan_kiosk_id or order._bayaan_resolve_kiosk()
            if not kiosk_rec or not order.date_order:
                continue
            kiosk = kiosk_rec
            day = fields.Date.to_date(order.date_order)
            for line in order.lines:
                mode = line.product_id.product_tmpl_id.bayaan_consumption_mode
                if mode in ("finished", "hybrid") and line.qty > 0:
                    eff_qty = max(0.0, line.qty - voided_qty.get(line.id, 0.0))
                    cost = eff_qty * (line.product_id.standard_price or 0.0)
                    if cost:
                        by_kiosk_day[(kiosk.id, day)] = by_kiosk_day.get((kiosk.id, day), 0.0) + cost

        posted = 0
        for (kiosk_id, day), amount in by_kiosk_day.items():
            target = round(amount, 2)
            kiosk = Kiosk.browse(kiosk_id)
            base_ref = "Bayaan COGS · %s · %s" % (kiosk.kiosk_code or kiosk_id, day)
            already = self._bayaan_posted_net(base_ref, company, account=cogs)
            delta = round(target - already, 2)
            if abs(delta) < 0.01:
                continue
            cogs_line = {"name": "Cost of goods sold — %s" % (kiosk.kiosk_code or ""),
                         "account": cogs, "analytic": kiosk._bayaan_analytic_distribution()}
            inv_line = {"name": "Inventory consumed", "account": inventory}
            if delta > 0:
                cogs_line["debit"] = delta
                inv_line["credit"] = delta
            else:
                cogs_line["credit"] = -delta
                inv_line["debit"] = -delta
            move = self._bayaan_gl_post(
                ref=self._bayaan_delta_ref(base_ref, company), date=day, journal=journal,
                company=company, lines=[cogs_line, inv_line])
            if move:
                posted += 1
        return posted

    # ==================================================================
    # POS revenue — Dr Cash (kiosk drawer) + Dr Bank (card) / Cr Sales income,
    # per kiosk per day, from the deterministic pos.order / pos.payment data.
    # Posting revenue directly (instead of via the Odoo session-close machinery)
    # keeps the books free of the unreconciled POS-receivable / outstanding-
    # receipts clearing accounts. Sales income carries the branch analytic.
    # ==================================================================
    @api.model
    def _bayaan_kiosk_cash_account(self, kiosk):
        """The DRAWER cash account for a kiosk — where the POS cash payment method settles (where
        counted cash actually sits). A safe deposit moves cash OUT of this into the safe, so it
        must be a CASH account, never the generic bank. Falls back to a dedicated Cash-on-Hand
        account (101300) rather than Bank when a kiosk has no cash method configured. #4"""
        config = kiosk.pos_config_id
        methods = config.payment_method_ids if config else self.env["pos.payment.method"]
        pm = methods.filtered(lambda m: m.is_cash_count or m.type == "cash")[:1]
        if pm and pm.journal_id and pm.journal_id.default_account_id:
            return pm.journal_id.default_account_id
        return self._bayaan_gl_account("101300", "Cash on Hand", "asset_cash", kiosk.company_id)

    @api.model
    def _bayaan_post_pos_revenue(self, company=None, kiosk=None, date_from=None, date_to=None):
        company = company or self.env.company
        PosOrder = self.env["pos.order"].sudo()
        Kiosk = self.env["bayaan.kiosk"].sudo()
        income = self._bayaan_gl_account("400000", "Product Sales", "income", company)
        vat_account = self._bayaan_vat_payable_account(company)
        bank = self._bayaan_bank_account(company)
        start, end = self._bayaan_dt_bounds(date_from, date_to)
        order_domain = [("company_id", "=", company.id), ("state", "in", ("paid", "done", "invoiced"))]
        if kiosk:
            order_domain.append(("bayaan_kiosk_id", "=", kiosk.id))
        if start:
            order_domain.append(("date_order", ">=", start))
        if end:
            order_domain.append(("date_order", "<=", end))
        buckets = {}
        for order in PosOrder.search(order_domain):
            order_kiosk = order.bayaan_kiosk_id or order._bayaan_resolve_kiosk()
            if not order_kiosk or not order.date_order:
                continue
            day = fields.Date.to_date(order.date_order)
            bucket = buckets.setdefault(
                (order_kiosk.id, day),
                {"cash": 0.0, "card": 0.0, "tax": 0.0, "orders": PosOrder})
            for payment in order.payment_ids:
                if payment.payment_method_id.is_cash_count:
                    bucket["cash"] += payment.amount
                else:
                    bucket["card"] += payment.amount
            # Odoo's own per-order tax computation is authoritative (works for both
            # tax-inclusive and tax-exclusive pricing); gross payment = net + tax.
            bucket["tax"] += order.amount_tax or 0.0
            bucket["orders"] |= order
        posted = 0
        for (kiosk_id, day), amounts in buckets.items():
            kiosk = Kiosk.browse(kiosk_id)
            target_cash = round(amounts["cash"], 2)
            target_card = round(amounts["card"], 2)
            target_total = round(target_cash + target_card, 2)
            target_tax = round(min(max(amounts["tax"], 0.0), max(target_total, 0.0)), 2)
            base_ref = "Bayaan Sales · %s · %s" % (kiosk.kiosk_code or kiosk_id, day)
            # Post only the delta versus what the ledger already holds for this kiosk/day
            # (a second session, a late order, a refund or a retry never double-posts or
            # drops a row). Cash/card legs are matched by their stable label.
            already_cash = self._bayaan_posted_net(base_ref, company, line_name="Cash sales")
            already_card = self._bayaan_posted_net(base_ref, company, line_name="Card sales")
            already_tax = -self._bayaan_posted_net(base_ref, company, account=vat_account)
            delta_cash = round(target_cash - already_cash, 2)
            delta_card = round(target_card - already_card, 2)
            delta_tax = round(target_tax - already_tax, 2)
            delta_net = round(delta_cash + delta_card - delta_tax, 2)
            if abs(delta_cash) < 0.01 and abs(delta_card) < 0.01 and abs(delta_tax) < 0.01:
                continue
            lines = []

            def _leg(name, account, amount, analytic=None):
                if abs(amount) < 0.01:
                    return
                entry = {"name": name, "account": account}
                if analytic:
                    entry["analytic"] = analytic
                if amount > 0:
                    entry["debit"] = amount
                else:
                    entry["credit"] = -amount
                lines.append(entry)

            cash_account = self._bayaan_kiosk_cash_account(kiosk)
            _leg("Cash sales", cash_account, delta_cash)
            _leg("Card sales", bank, delta_card)
            # Sales income is a credit (negative debit), carrying the branch analytic.
            _leg("Product sales — %s" % (kiosk.kiosk_code or ""), income, -delta_net,
                 analytic=kiosk._bayaan_analytic_distribution())
            # VAT is split out of the gross as a liability (Odoo's per-order amount_tax is
            # the authoritative tax). It is posted as a plain liability line — NOT through
            # Odoo's tax engine (setting tax_ids/tax_line_id on a manual entry makes Odoo
            # auto-generate a duplicate tax line). The VAT return reads this 251000 movement.
            _leg("VAT payable", vat_account, -delta_tax)
            if self._bayaan_gl_post(ref=self._bayaan_delta_ref(base_ref, company),
                                    date=day, company=company, lines=lines):
                posted += 1
        return posted

    # ==================================================================
    # Opening inventory — Dr Inventory / Cr Opening Balance Equity for the
    # value of stock on hand so COGS has a real asset to draw down.
    # ==================================================================
    @api.model
    def _bayaan_post_opening_inventory(self, company=None, date=None):
        company = company or self.env.company
        Kiosk = self.env["bayaan.kiosk"].sudo()
        Quant = self.env["stock.quant"].sudo()
        inventory = self._bayaan_inventory_account(company)
        equity = self._bayaan_opening_equity_account(company)
        locations = self.env["stock.location"].sudo()
        warehouses = self.env["stock.warehouse"].sudo().search([("company_id", "=", company.id)])
        locations |= warehouses.mapped("lot_stock_id")
        locations |= Kiosk.search([("company_id", "=", company.id)]).mapped("stock_location_id")
        value = 0.0
        for quant in Quant.search([("location_id", "in", locations.ids), ("quantity", ">", 0)]):
            value += quant.quantity * (quant.product_id.standard_price or 0.0)
        value = round(value, 2)
        if value <= 0:
            return False
        ref = "Bayaan Opening Inventory"
        # One-time, governed opening posting: never double-post the opening balance
        # if the workflow is triggered again (idempotent by ref, like every other
        # Bayaan GL posting).
        if self._bayaan_already_posted(ref, company):
            return False
        return self._bayaan_gl_post(
            ref=ref, date=date, company=company,
            lines=[
                {"name": "Opening stock on hand", "account": inventory, "debit": value},
                {"name": "Opening balance equity", "account": equity, "credit": value},
            ],
        )

    # ==================================================================
    # Depreciation — straight-line, Dr Depreciation Expense (kiosk analytic) /
    # Cr Accumulated Depreciation. Posts the catch-up delta (to-date minus already-
    # posted) per CapEx so monthly re-runs accrue only the new period.
    # ==================================================================
    @api.model
    def _bayaan_post_depreciation(self, company=None, upto_date=None):
        company = company or self.env.company
        upto = upto_date or fields.Date.context_today(self.env.user)
        AML = self.env["account.move.line"].sudo()
        Capex = self.env["bayaan.kiosk.capex"].sudo()
        dep_expense = self._bayaan_gl_account("680000", "Depreciation Expense", "expense_depreciation", company)
        accumulated = self._bayaan_gl_account("152000", "Accumulated Depreciation", "asset_fixed", company)
        posted = 0
        for capex in Capex.search([("company_id", "=", company.id), ("state", "=", "posted"), ("active", "=", True)]):
            life = capex.useful_life_months or 0
            if life <= 0 or (capex.amount or 0.0) <= 0:
                continue
            elapsed = min(capex._bayaan_months_elapsed(upto), life)
            to_date = round((capex.amount / life) * elapsed, 2)
            tag = "Depr #%s" % capex.id
            done_rows = AML._read_group(
                [("parent_state", "=", "posted"), ("company_id", "=", company.id),
                 ("account_id", "=", dep_expense.id), ("name", "=like", tag + " %")],
                aggregates=["debit:sum"])
            already = round((done_rows[0][0] or 0.0) if done_rows else 0.0, 2)
            delta = round(to_date - already, 2)
            if delta <= 0:
                continue
            ref = "Bayaan Depreciation · #%s · %s" % (capex.id, upto)
            if self._bayaan_already_posted(ref, company):
                continue
            dist = capex.kiosk_id._bayaan_analytic_distribution()
            move = self._bayaan_gl_post(
                ref=ref, date=upto, company=company,
                lines=[
                    {"name": "%s %s" % (tag, capex.name), "account": dep_expense, "debit": delta, "analytic": dist},
                    {"name": "Accumulated depreciation — %s" % (capex.kiosk_id.kiosk_code or ""),
                     "account": accumulated, "credit": delta},
                ])
            if move:
                posted += 1
        return posted

    @api.model
    def _cron_post_depreciation(self):
        """Monthly cron: post the straight-line depreciation catch-up for every
        company. ``_bayaan_post_depreciation`` is source-based and retry-safe (it
        posts only the to-date-minus-already delta per CapEx and ref-guards each
        run), so an extra firing or a retry after rollback accrues nothing extra.
        Runs per-company so a multi-company tenant depreciates each set of books."""
        companies = self.env["res.company"].sudo().search([])
        total = 0
        for company in companies:
            total += self.with_company(company)._bayaan_post_depreciation(company=company)
        return total

    # ==================================================================
    # Payroll — Dr Salaries & Wages (per-kiosk / HQ analytic) / Cr Bank.
    # ==================================================================
    @api.model
    def _bayaan_post_payroll(self, run):
        if run.state != "paid":
            return False
        company = run.company_id
        ref = "Bayaan Payroll · %s" % run.name
        if self._bayaan_already_posted(ref, company):
            return False
        wages = self._bayaan_wages_account(company)
        bank = self._bayaan_bank_account(company)
        Kiosk = self.env["bayaan.kiosk"].sudo()
        by_kiosk = {}
        for line in run.line_ids:
            by_kiosk[line.kiosk_id.id or 0] = by_kiosk.get(line.kiosk_id.id or 0, 0.0) + (line.net_pay or 0.0)
        lines = []
        total = 0.0
        hq = self._bayaan_hq_distribution(company)
        for kiosk_id, amount in by_kiosk.items():
            amount = round(amount, 2)
            if amount <= 0:
                continue
            analytic = Kiosk.browse(kiosk_id)._bayaan_analytic_distribution() if kiosk_id else hq
            lines.append({"name": "Wages %s" % (Kiosk.browse(kiosk_id).kiosk_code or "HQ" if kiosk_id else "HQ"),
                          "account": wages, "debit": amount, "analytic": analytic or hq})
            total += amount
        if total <= 0:
            return False
        lines.append({"name": "Payroll paid", "account": bank, "credit": round(total, 2)})
        # Date the wage expense within the period being reported: for a still-running
        # month (run.date_to in the future) use today so month-to-date P&L includes it.
        pay_date = min(run.date_to, fields.Date.context_today(self.env.user))
        return self._bayaan_gl_post(ref=ref, date=pay_date, company=company, lines=lines)

    # ==================================================================
    # Operating expense — Dr <category expense> (HQ analytic) / Cr Bank.
    # ==================================================================
    @api.model
    def _bayaan_post_expense(self, expense):
        company = expense.company_id
        ref = "Bayaan OpEx · #%s" % expense.id
        if self._bayaan_already_posted(ref, company):
            return False
        account = self._bayaan_opex_account(expense.category, company)
        bank = self._bayaan_bank_account(company)
        hq = self._bayaan_hq_distribution(company)
        amount = round(expense.amount or 0.0, 2)
        if amount <= 0:
            return False
        return self._bayaan_gl_post(
            ref=ref, date=expense.date, company=company,
            lines=[
                {"name": "%s — %s" % (expense.category, expense.name), "account": account,
                 "debit": amount, "analytic": hq},
                {"name": "Paid: %s" % expense.name, "account": bank, "credit": amount},
            ],
        )

    @api.model
    def _bayaan_post_expenses(self, company=None):
        company = company or self.env.company
        posted = 0
        for expense in self.env["bayaan.operating.expense"].sudo().search([("company_id", "=", company.id)]):
            if self._bayaan_post_expense(expense):
                posted += 1
        return posted

    # ==================================================================
    # Waste / spoilage — Dr Waste expense (kiosk analytic) / Cr Inventory.
    # ==================================================================
    @api.model
    def _bayaan_post_waste(self, company=None, kiosk=None, date_from=None, date_to=None):
        company = company or self.env.company
        Waste = self.env["bayaan.waste.entry"].sudo()
        Kiosk = self.env["bayaan.kiosk"].sudo()
        inventory = self._bayaan_inventory_account(company)
        waste_account = self._bayaan_waste_account(company)
        start, end = self._bayaan_dt_bounds(date_from, date_to)
        waste_domain = [("company_id", "=", company.id), ("state", "=", "posted")]
        if kiosk:
            waste_domain.append(("kiosk_id", "=", kiosk.id))
        if start:
            waste_domain.append(("create_date", ">=", start))
        if end:
            waste_domain.append(("create_date", "<=", end))
        by_kiosk_day = {}
        for entry in Waste.search(waste_domain):
            if not entry.kiosk_id:
                continue
            day = fields.Date.to_date(entry.create_date or fields.Datetime.now())
            # Value from the actual scraps so recipe-mode waste (ingredient scraps)
            # is costed at ingredient cost, not the zero-cost finished product.
            if entry.scrap_ids:
                value = sum(s.scrap_qty * (s.product_id.standard_price or 0.0) for s in entry.scrap_ids)
            else:
                value = (entry.qty or 0.0) * (entry.product_id.standard_price or 0.0)
            if value:
                by_kiosk_day[(entry.kiosk_id.id, day)] = by_kiosk_day.get((entry.kiosk_id.id, day), 0.0) + value
        posted = 0
        for (kiosk_id, day), amount in by_kiosk_day.items():
            target = round(amount, 2)
            kiosk = Kiosk.browse(kiosk_id)
            base_ref = "Bayaan Waste · %s · %s" % (kiosk.kiosk_code or kiosk_id, day)
            already = self._bayaan_posted_net(base_ref, company, account=waste_account)
            delta = round(target - already, 2)
            if abs(delta) < 0.01:
                continue
            waste_line = {"name": "Waste / spoilage — %s" % (kiosk.kiosk_code or ""),
                          "account": waste_account, "analytic": kiosk._bayaan_analytic_distribution()}
            inv_line = {"name": "Inventory written off", "account": inventory}
            if delta > 0:
                waste_line["debit"] = delta
                inv_line["credit"] = delta
            else:
                waste_line["credit"] = -delta
                inv_line["debit"] = -delta
            move = self._bayaan_gl_post(
                ref=self._bayaan_delta_ref(base_ref, company), date=day, company=company,
                lines=[waste_line, inv_line])
            if move:
                posted += 1
        return posted

    # ==================================================================
    # Safe deposit — Dr Cash in Safe / Cr Cash on hand (drawer) at shift close.
    # An asset-to-asset transfer recording the physical move of counted cash to the
    # safe, so the drawer reconciliation is auditable in the real ledger. #4
    # ==================================================================
    @api.model
    def _bayaan_post_safe_deposit(self, close):
        company = close.company_id
        amount = round(close.safe_deposit or 0.0, 2)
        if amount <= 0:
            return False
        safe = self._bayaan_safe_account(company)
        drawer = self._bayaan_kiosk_cash_account(close.kiosk_id)
        code = close.kiosk_id.kiosk_code or ""
        # Both legs are balance-sheet (asset_cash) accounts, so no branch analytic is required.
        return self._bayaan_gl_post(
            ref="Bayaan Safe Deposit · %s" % close.name,
            date=fields.Date.to_date(close.closed_at) or fields.Date.context_today(self.env.user),
            company=company,
            lines=[
                {"name": "Cash to safe — %s" % code, "account": safe, "debit": amount},
                {"name": "Cash out of drawer — %s" % code, "account": drawer, "credit": amount},
            ],
        )

    # ==================================================================
    # Per-kiosk daily posting — the live close hook posts revenue + COGS +
    # waste for one kiosk's business day in one scoped, idempotent call.
    # ==================================================================
    @api.model
    def _bayaan_post_kiosk_day(self, kiosk, day):
        """Post the deterministic Bayaan cost side (COGS + waste) for one kiosk-day.
        Revenue + VAT are posted by Odoo's OFFICIAL POS session close (the Z-report
        account.move), NOT here — posting revenue here too would double-count."""
        company = kiosk.company_id
        return {
            "cogs": self._bayaan_post_cogs(company, kiosk=kiosk, date_from=day, date_to=day),
            "waste": self._bayaan_post_waste(company, kiosk=kiosk, date_from=day, date_to=day),
        }

    # ==================================================================
    # Vendor bill — Dr Inventory / Cr Accounts Payable for a received PO.
    # Builds the inventory the perpetual COGS draws from and the payable the
    # balance sheet needs. Optionally registers the cash/bank payment.
    # ==================================================================
    @api.model
    def _bayaan_create_vendor_bill(self, order, pay=False):
        """Bill the RECEIVED-but-not-yet-billed quantity of a PO (Dr Inventory / Cr AP).

        Quantity is ``qty_received - qty_invoiced`` per line — never the ordered
        quantity — so a zero-received line is never billed and a partial receipt
        cannot overstate the payable. Linking each bill line to its
        ``purchase_line_id`` lets Odoo maintain ``qty_invoiced`` natively, so a
        second receipt produces a second bill that only covers the new quantity and
        the cumulative billed quantity never exceeds what was ordered. Supplier
        reference, document date, payment terms, currency and the PO's invoice
        attachments are carried onto the real bill so the accountant sees the source
        document on the AP record."""
        company = order.company_id
        inventory = self._bayaan_inventory_account(company)
        invoice_lines = []
        for line in order.order_line:
            eligible = round((line.qty_received or 0.0) - (line.qty_invoiced or 0.0), 6)
            if eligible <= 0:
                continue
            invoice_lines.append((0, 0, {
                "name": line.product_id.display_name,
                "product_id": line.product_id.id,
                "purchase_line_id": line.id,
                "quantity": eligible,
                "price_unit": line.price_unit,
                "account_id": inventory.id,
                "tax_ids": [(6, 0, line.tax_ids.ids)],
            }))
        if not invoice_lines:
            # Nothing newly received to bill (un-received, or already fully billed).
            return order.invoice_ids.filtered(lambda m: m.state != "cancel")[:1] or False
        vals = {
            "move_type": "in_invoice",
            "partner_id": order.partner_id.id,
            "invoice_origin": order.name,
            "invoice_date": fields.Date.to_date(order.date_order) or fields.Date.context_today(self.env.user),
            "company_id": company.id,
            "currency_id": (order.currency_id or company.currency_id).id,
            "journal_id": self.env["account.journal"].sudo().search(
                [("type", "=", "purchase"), ("company_id", "=", company.id)], limit=1).id,
            "invoice_line_ids": invoice_lines,
        }
        if order.partner_ref:
            vals["ref"] = order.partner_ref
        if order.payment_term_id:
            vals["invoice_payment_term_id"] = order.payment_term_id.id
        bill = self.env["account.move"].sudo().create(vals)
        bill.action_post()
        self._bayaan_copy_po_attachments(order, bill)
        if pay:
            self._bayaan_pay_bill(bill)
        return bill

    @api.model
    def _bayaan_copy_po_attachments(self, order, bill):
        """Copy the supplier-invoice attachment(s) stored on the PO onto the bill so
        the source document is visible on the AP record, not only on the PO."""
        Attachment = self.env["ir.attachment"].sudo()
        for att in Attachment.search([("res_model", "=", "purchase.order"), ("res_id", "=", order.id)]):
            if Attachment.search_count([
                ("res_model", "=", "account.move"), ("res_id", "=", bill.id), ("name", "=", att.name),
            ]):
                continue
            att.copy({"res_model": "account.move", "res_id": bill.id})

    @api.model
    def _bayaan_pay_bill(self, bill, date=None, journal_id=None):
        """Settle a posted vendor bill via a real reconciled account.payment so the
        bill's amount_residual / payment_state update and the GL AP matches the AP
        subledger and aging. A raw Dr-AP/Cr-Bank journal move would leave the bill
        'not_paid' and drift the two ledgers.

        ``journal_id`` selects the bank/cash journal explicitly (validated to belong to
        the bill's company and be a bank/cash type). It is only when the caller does NOT
        choose one that we fall back to the company default bank journal — never a silent
        first-journal pick over an explicit choice."""
        if bill.state != "posted" or bill.payment_state in ("paid", "in_payment", "reversed"):
            return False
        journal = None
        if journal_id:
            journal = self.env["account.journal"].sudo().browse(int(journal_id))
            if not journal.exists() or journal.company_id != bill.company_id or journal.type not in ("bank", "cash"):
                raise UserError("Select a valid bank or cash journal in %s for this payment." % bill.company_id.name)
        if not journal:
            journal = self._bayaan_bank_journal(bill.company_id)
        if not journal:
            return False
        wizard = self.env["account.payment.register"].sudo().with_context(
            active_model="account.move", active_ids=bill.ids,
        ).create({
            "journal_id": journal.id,
            "payment_date": date or fields.Date.context_today(self.env.user),
        })
        wizard._create_payments()
        return True
