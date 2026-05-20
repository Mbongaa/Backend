from odoo import api, fields, models
from odoo.exceptions import ValidationError


class BayaanKiosk(models.Model):
    _name = "bayaan.kiosk"
    _description = "Bayaan Kiosk"
    _order = "kiosk_code"

    name = fields.Char(required=True)
    kiosk_code = fields.Char(required=True, index=True)
    active = fields.Boolean(default=True)
    country_id = fields.Many2one("res.country", string="Country")
    city = fields.Char(index=True)
    area = fields.Char(string="Area / Site", index=True)
    street = fields.Char(string="Address")
    latitude = fields.Float(digits=(10, 7))
    longitude = fields.Float(digits=(10, 7))
    pos_config_id = fields.Many2one("pos.config", string="POS Configuration", required=True)
    stock_location_id = fields.Many2one(
        "stock.location",
        string="Kiosk Stock Location",
        domain="[('usage', '=', 'internal')]",
        required=True,
    )
    manager_user_id = fields.Many2one("res.users", string="Manager")
    supervisor_user_id = fields.Many2one("res.users", string="Supervisor")
    cashier_user_ids = fields.Many2many("res.users", string="Allowed Cashiers")
    analytic_account_id = fields.Many2one(
        "account.analytic.account",
        string="Branch Cost Center",
        check_company=True,
        copy=False,
        help="Analytic cost center used for branch P&L allocation.",
    )
    stock_deduction_policy = fields.Selection(
        [
            ("warning", "Warning with supervisor override"),
            ("strict", "Strict stock blocking"),
            ("soft", "Soft negative-stock alert"),
        ],
        default="warning",
        required=True,
    )
    opening_date = fields.Date()
    last_stock_transfer_at = fields.Datetime(readonly=True)
    last_daily_close_at = fields.Datetime(readonly=True)
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    _kiosk_code_unique = models.Constraint(
        "unique(kiosk_code, company_id)",
        "Kiosk code must be unique per company.",
    )
    _pos_config_unique = models.Constraint(
        "unique(pos_config_id, company_id)",
        "Each POS configuration can belong to only one Bayaan kiosk.",
    )
    _stock_location_unique = models.Constraint(
        "unique(stock_location_id, company_id)",
        "Each kiosk stock location can belong to only one Bayaan kiosk.",
    )

    @api.model_create_multi
    def create(self, vals_list):
        kiosks = super().create(vals_list)
        kiosks._bayaan_ensure_analytic_accounts()
        return kiosks

    def write(self, vals):
        result = super().write(vals)
        if {"name", "kiosk_code", "company_id", "analytic_account_id"} & set(vals):
            self._bayaan_ensure_analytic_accounts()
        return result

    @api.model
    def _bayaan_branch_plan(self, company=None):
        company = company or self.env.company
        key = "bayaan.branch_analytic_plan_id.%s" % company.id
        params = self.env["ir.config_parameter"].sudo()
        plan_id = int(params.get_param(key) or 0)
        plan = self.env["account.analytic.plan"].sudo().browse(plan_id).exists()
        if not plan:
            plan = self.env["account.analytic.plan"].sudo().with_company(company).create({
                "name": "Bayaan Branch Cost Centers",
                "default_applicability": "mandatory",
            })
            params.set_param(key, str(plan.id))
        elif plan.with_company(company).default_applicability != "mandatory":
            plan.with_company(company).sudo().default_applicability = "mandatory"
        return plan

    def _bayaan_ensure_analytic_accounts(self):
        Analytic = self.env["account.analytic.account"].sudo()
        for kiosk in self:
            plan = self._bayaan_branch_plan(kiosk.company_id)
            account = kiosk.analytic_account_id
            if account:
                updates = {}
                if account.plan_id != plan:
                    updates["plan_id"] = plan.id
                if account.company_id != kiosk.company_id:
                    updates["company_id"] = kiosk.company_id.id
                if updates:
                    account.sudo().write(updates)
                continue

            account = Analytic.search([
                ("code", "=", kiosk.kiosk_code),
                ("company_id", "=", kiosk.company_id.id),
                ("plan_id", "=", plan.id),
            ], limit=1)
            if not account:
                account = Analytic.create({
                    "name": "%s Cost Center" % kiosk.display_name,
                    "code": kiosk.kiosk_code,
                    "company_id": kiosk.company_id.id,
                    "plan_id": plan.id,
                })
            kiosk.sudo().analytic_account_id = account

    def _bayaan_analytic_distribution(self):
        self.ensure_one()
        self._bayaan_ensure_analytic_accounts()
        return {str(self.analytic_account_id.id): 100.0} if self.analytic_account_id else {}

    @api.model
    def _bayaan_hq_analytic_account(self, company=None):
        company = company or self.env.company
        plan = self._bayaan_branch_plan(company)
        key = "bayaan.hq_analytic_account_id.%s" % company.id
        params = self.env["ir.config_parameter"].sudo()
        account_id = int(params.get_param(key) or 0)
        account = self.env["account.analytic.account"].sudo().browse(account_id).exists()
        if not account:
            account = self.env["account.analytic.account"].sudo().search([
                ("code", "=", "HQ"),
                ("company_id", "=", company.id),
                ("plan_id", "=", plan.id),
            ], limit=1)
        if not account:
            account = self.env["account.analytic.account"].sudo().with_company(company).create({
                "name": "HQ Cost Center",
                "code": "HQ",
                "company_id": company.id,
                "plan_id": plan.id,
            })
        elif account.plan_id != plan or account.company_id != company:
            account.sudo().write({
                "plan_id": plan.id,
                "company_id": company.id,
            })
        params.set_param(key, str(account.id))
        return account

    @api.model
    def _bayaan_shared_expense_distribution(self, company=None, weights=None):
        company = company or self.env.company
        kiosks = self.sudo().search([
            ("company_id", "=", company.id),
            ("active", "=", True),
        ])
        if not kiosks:
            return {}

        kiosks._bayaan_ensure_analytic_accounts()
        weights = weights or {}
        weighted_kiosks = []
        total_weight = 0.0
        for kiosk in kiosks:
            weight = float(weights.get(kiosk.kiosk_code, weights.get(kiosk.id, 1.0)))
            if weight <= 0:
                continue
            weighted_kiosks.append((kiosk, weight))
            total_weight += weight
        if not weighted_kiosks or total_weight <= 0:
            return {}

        distribution = {}
        remaining = 100.0
        precision = self.env["decimal.precision"].precision_get("Percentage Analytic")
        for index, (kiosk, weight) in enumerate(weighted_kiosks):
            account_id = str(kiosk.analytic_account_id.id)
            if index == len(weighted_kiosks) - 1:
                percentage = remaining
            else:
                percentage = round((weight / total_weight) * 100.0, precision)
                remaining -= percentage
            distribution[account_id] = percentage
        return distribution

    @api.model
    def _bayaan_ensure_hq_shared_expense_distribution_model(self, account_prefix, company=None, weights=None):
        company = company or self.env.company
        if not account_prefix:
            raise ValidationError("An account prefix is required for HQ shared expense distribution.")
        self._bayaan_hq_analytic_account(company)
        distribution = self._bayaan_shared_expense_distribution(company, weights)
        if not distribution:
            raise ValidationError("At least one active kiosk is required for HQ shared expense distribution.")

        DistributionModel = self.env["account.analytic.distribution.model"].sudo().with_company(company).with_context(
            validate_analytic=True
        )
        model = DistributionModel.search([
            ("company_id", "=", company.id),
            ("account_prefix", "=", account_prefix),
        ], limit=1)
        values = {
            "company_id": company.id,
            "account_prefix": account_prefix,
            "analytic_distribution": distribution,
        }
        if model:
            model.write(values)
        else:
            model = DistributionModel.create(values)
        return model

    @api.constrains("stock_location_id", "pos_config_id")
    def _check_kiosk_stock_location_matches_pos_config(self):
        for kiosk in self:
            picking_type = kiosk.pos_config_id.picking_type_id
            if picking_type and picking_type.default_location_src_id and picking_type.default_location_src_id != kiosk.stock_location_id:
                raise ValidationError(
                    "The POS operation type source location must be the same as the kiosk stock location. "
                    "This keeps Odoo POS stock movement and Bayaan recipe consumption in the same kiosk context."
                )

    @api.constrains("analytic_account_id", "company_id")
    def _check_analytic_account_company(self):
        for kiosk in self:
            if kiosk.analytic_account_id and kiosk.analytic_account_id.company_id != kiosk.company_id:
                raise ValidationError("The kiosk analytic cost center must belong to the same company as the kiosk.")
