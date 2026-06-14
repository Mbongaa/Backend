from odoo import Command, api, fields, models
from odoo.exceptions import UserError, ValidationError


CAPEX_CATEGORIES = [
    ("equipment", "Equipment (machines, fridges)"),
    ("fit_out", "Fit-out / construction"),
    ("manufacturing", "Kiosk manufacturing / build"),
    ("signage", "Signage & branding"),
    ("furniture", "Furniture & fixtures"),
    ("license_deposit", "License / rent deposit"),
    ("other", "Other one-time cost"),
]

CAPEX_STATES = [
    ("draft", "Draft"),
    ("posted", "Capitalized"),
    ("failed", "Posting failed"),
    ("reversed", "Reversed"),
]


class BayaanKioskCapex(models.Model):
    """A one-time capital purchase tied to a single kiosk — the physical build/
    "manufacturing" of the stall, espresso machines, fridges, fit-out, signage,
    deposits. Unlike a recurring operating expense, this is capitalized as a real
    fixed asset on the Odoo books (Dr Fixed Asset @ the kiosk's branch cost center,
    Cr a funding account) so it appears in the General Ledger and Balance Sheet.

    Odoo Community has no `account_asset` depreciation engine, so straight-line
    depreciation and the per-kiosk payback view are computed deterministically in
    Bayaan (`_bayaan_depreciation_snapshot`). The capital entry itself is real
    double-entry accounting the client's accountant can audit.
    """

    _name = "bayaan.kiosk.capex"
    _description = "Bayaan Kiosk Capital Expenditure"
    _order = "date desc, id desc"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True, index=True, ondelete="cascade")
    category = fields.Selection(CAPEX_CATEGORIES, required=True, default="equipment", index=True)
    amount = fields.Monetary(required=True)
    date = fields.Date(required=True, default=fields.Date.context_today, index=True)
    useful_life_months = fields.Integer(
        default=36,
        help="Straight-line depreciation horizon for the managerial payback view. 0 = do not depreciate.",
    )
    supplier_id = fields.Many2one("res.partner", string="Supplier / Vendor")
    note = fields.Char()
    state = fields.Selection(CAPEX_STATES, default="draft", required=True, index=True)
    error_message = fields.Char(readonly=True)
    move_id = fields.Many2one("account.move", string="Capitalization Entry", readonly=True, copy=False)
    asset_account_id = fields.Many2one("account.account", string="Fixed Asset Account", readonly=True)
    funding_account_id = fields.Many2one("account.account", string="Funding Account", readonly=True)
    created_by_id = fields.Many2one("res.users", readonly=True, default=lambda self: self.env.user)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    currency_id = fields.Many2one(related="company_id.currency_id", store=True, readonly=True)

    @api.constrains("amount")
    def _check_amount(self):
        for rec in self:
            if rec.amount <= 0:
                raise ValidationError("Kiosk capital expenditure amount must be greater than zero.")

    @api.constrains("useful_life_months")
    def _check_useful_life(self):
        for rec in self:
            if rec.useful_life_months < 0:
                raise ValidationError("Useful life cannot be negative.")

    # ------------------------------------------------------------------
    # Account / journal resolution
    # ------------------------------------------------------------------
    def _bayaan_config_account(self, key, account_types):
        """Resolve a configured account id, else the first account of the given
        type for this company. account.account is shared across companies in
        Odoo 19 (company_ids), so we filter through that relation when present."""
        self.ensure_one()
        company = self.company_id
        params = self.env["ir.config_parameter"].sudo()
        account_id = int(params.get_param("%s.%s" % (key, company.id)) or 0)
        Account = self.env["account.account"].sudo()
        account = Account.browse(account_id).exists()
        if account:
            return account
        domain = [("account_type", "in", account_types)]
        if "active" in Account._fields:
            domain.append(("active", "=", True))
        if "company_ids" in Account._fields:
            domain.append(("company_ids", "in", company.id))
        elif "company_id" in Account._fields:
            domain.append(("company_id", "=", company.id))
        return Account.search(domain, limit=1)

    def _bayaan_asset_account(self):
        return self._bayaan_config_account("bayaan.capex_asset_account_id", ["asset_fixed", "asset_non_current"])

    def _bayaan_funding_account(self):
        """Credit side. A supplier purchase lands in that supplier's payable;
        an owner-funded build lands in owner equity (capital contribution)."""
        self.ensure_one()
        if self.supplier_id and self.supplier_id.property_account_payable_id:
            return self.supplier_id.property_account_payable_id
        account = self._bayaan_config_account("bayaan.capex_funding_account_id", ["equity"])
        if account:
            return account
        # Last-resort fallbacks so a misconfigured chart never blocks the record.
        return self._bayaan_config_account("bayaan.capex_funding_account_id", ["liability_payable", "asset_cash"])

    def _bayaan_general_journal(self):
        self.ensure_one()
        Journal = self.env["account.journal"].sudo()
        journal = Journal.search([
            ("type", "=", "general"),
            ("company_id", "=", self.company_id.id),
        ], limit=1)
        return journal

    # ------------------------------------------------------------------
    # Posting
    # ------------------------------------------------------------------
    def _bayaan_post_capitalization(self):
        """Post the real capitalization entry. Records failure on the row instead
        of raising — silent failure is not allowed, but one bad row must not abort
        the request (mirrors pos_order recipe-posting behaviour)."""
        self.ensure_one()
        if self.state == "posted" and self.move_id:
            return True
        try:
            asset_account = self._bayaan_asset_account()
            funding_account = self._bayaan_funding_account()
            journal = self._bayaan_general_journal()
            if not asset_account:
                raise UserError("No fixed-asset account found in the chart of accounts to capitalize against.")
            if not funding_account:
                raise UserError("No funding (equity/payable) account found to balance the capitalization.")
            if not journal:
                raise UserError("No general (miscellaneous) journal found to post the capitalization entry.")

            distribution = self.kiosk_id._bayaan_analytic_distribution()
            asset_label = "%s — %s" % (self.kiosk_id.kiosk_code or self.kiosk_id.display_name, self.name)
            move = self.env["account.move"].sudo().create({
                "move_type": "entry",
                "journal_id": journal.id,
                "date": self.date,
                "ref": "Kiosk CapEx: %s (%s)" % (self.name, self.kiosk_id.kiosk_code or self.kiosk_id.display_name),
                "company_id": self.company_id.id,
                "line_ids": [
                    Command.create({
                        "name": asset_label,
                        "account_id": asset_account.id,
                        "debit": self.amount,
                        "credit": 0.0,
                        # Tag the asset to the kiosk cost center so per-branch
                        # reporting attributes the invested capital correctly.
                        "analytic_distribution": distribution or False,
                    }),
                    Command.create({
                        "name": "Funding: %s" % self.name,
                        "account_id": funding_account.id,
                        "partner_id": self.supplier_id.id or False,
                        "debit": 0.0,
                        "credit": self.amount,
                    }),
                ],
            })
            move.action_post()
            self.write({
                "move_id": move.id,
                "asset_account_id": asset_account.id,
                "funding_account_id": funding_account.id,
                "state": "posted",
                "error_message": False,
            })
            return True
        except Exception as error:  # noqa: BLE001 — failure must stay visible, not crash the request
            message = str(error)
            self.write({"state": "failed", "error_message": message[:500]})
            return False

    def _bayaan_reverse(self):
        """Reverse the capitalization entry (deletion of posted moves is blocked
        by Bayaan policy) and retire the record."""
        self.ensure_one()
        if self.move_id and self.move_id.state == "posted":
            self.move_id._reverse_moves(
                [{"date": fields.Date.context_today(self), "ref": "Reversal of %s" % (self.move_id.ref or self.name)}],
                cancel=True,
            )
        self.write({"state": "reversed", "active": False})

    # ------------------------------------------------------------------
    # Deterministic depreciation / payback (managerial, no account_asset)
    # ------------------------------------------------------------------
    def _bayaan_months_elapsed(self, as_of=None):
        self.ensure_one()
        as_of = as_of or fields.Date.context_today(self)
        if not self.date:
            return 0
        months = (as_of.year - self.date.year) * 12 + (as_of.month - self.date.month)
        if as_of.day < self.date.day:
            months -= 1
        return max(0, months)

    def _bayaan_depreciation_snapshot(self, as_of=None):
        self.ensure_one()
        life = self.useful_life_months or 0
        amount = self.amount or 0.0
        if life <= 0:
            return {
                "monthlyDepreciation": 0.0,
                "monthsElapsed": 0,
                "depreciatedToDate": 0.0,
                "netBookValue": amount,
            }
        monthly = amount / life
        elapsed = min(self._bayaan_months_elapsed(as_of), life)
        depreciated = round(monthly * elapsed, 2)
        return {
            "monthlyDepreciation": round(monthly, 2),
            "monthsElapsed": elapsed,
            "depreciatedToDate": depreciated,
            "netBookValue": round(amount - depreciated, 2),
        }
