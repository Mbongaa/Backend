from datetime import datetime

from odoo import api, fields, models
from odoo.exceptions import UserError


class BayaanEmployee(models.Model):
    _name = "bayaan.employee"
    _description = "Bayaan Employee"
    _order = "name"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    user_id = fields.Many2one("res.users", string="Odoo User")
    role = fields.Selection(
        [
            ("manager", "Manager"),
            ("supervisor", "Supervisor"),
            ("warehouse", "Warehouse"),
            ("cashier", "Cashier"),
            ("barista", "Barista"),
            ("accountant", "Accountant"),
            ("other", "Other"),
        ],
        default="cashier",
        required=True,
    )
    kiosk_id = fields.Many2one("bayaan.kiosk", index=True)
    monthly_salary = fields.Monetary(default=0.0)
    expected_monthly_hours = fields.Float(default=176.0)
    hourly_rate = fields.Monetary(compute="_compute_hourly_rate", store=True)
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
        required=True,
    )
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("monthly_salary", "expected_monthly_hours")
    def _compute_hourly_rate(self):
        for employee in self:
            hours = employee.expected_monthly_hours or 0.0
            employee.hourly_rate = employee.monthly_salary / hours if hours else 0.0


class BayaanAttendance(models.Model):
    _name = "bayaan.attendance"
    _description = "Bayaan Attendance"
    _order = "check_in desc, id desc"

    employee_id = fields.Many2one("bayaan.employee", required=True, index=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", related="employee_id.kiosk_id", store=True, readonly=True)
    check_in = fields.Datetime(required=True, default=fields.Datetime.now)
    check_out = fields.Datetime()
    manual_hours = fields.Float()
    worked_hours = fields.Float(compute="_compute_worked_hours", store=True)
    note = fields.Char()
    company_id = fields.Many2one(related="employee_id.company_id", store=True, readonly=True)

    @api.depends("check_in", "check_out", "manual_hours")
    def _compute_worked_hours(self):
        for attendance in self:
            if attendance.manual_hours:
                attendance.worked_hours = attendance.manual_hours
            elif attendance.check_in and attendance.check_out:
                delta = fields.Datetime.to_datetime(attendance.check_out) - fields.Datetime.to_datetime(attendance.check_in)
                attendance.worked_hours = max(delta.total_seconds() / 3600.0, 0.0)
            else:
                attendance.worked_hours = 0.0


class BayaanPayrollAdjustment(models.Model):
    _name = "bayaan.payroll.adjustment"
    _description = "Bayaan Payroll Adjustment"
    _order = "date desc, id desc"

    employee_id = fields.Many2one("bayaan.employee", required=True, index=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", related="employee_id.kiosk_id", store=True, readonly=True)
    date = fields.Date(required=True, default=fields.Date.context_today)
    type = fields.Selection(
        [
            ("bonus", "Bonus"),
            ("deduction", "Deduction"),
            ("advance", "Advance"),
            ("cash_shortage", "Cash shortage"),
        ],
        required=True,
    )
    amount = fields.Monetary(required=True)
    reason = fields.Char(required=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
        ],
        default="draft",
        required=True,
        index=True,
    )
    approved_by_id = fields.Many2one("res.users", readonly=True)
    approved_at = fields.Datetime(readonly=True)
    currency_id = fields.Many2one(related="employee_id.currency_id", store=True, readonly=True)
    company_id = fields.Many2one(related="employee_id.company_id", store=True, readonly=True)

    def action_approve(self):
        self.write({
            "state": "approved",
            "approved_by_id": self.env.user.id,
            "approved_at": fields.Datetime.now(),
        })

    def action_reject(self):
        self.write({
            "state": "rejected",
            "approved_by_id": self.env.user.id,
            "approved_at": fields.Datetime.now(),
        })


class BayaanPayrollRun(models.Model):
    _name = "bayaan.payroll.run"
    _description = "Bayaan Payroll Run"
    _order = "date_from desc, id desc"

    name = fields.Char(required=True, default=lambda self: "Payroll")
    date_from = fields.Date(required=True)
    date_to = fields.Date(required=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("review", "Review"),
            ("approved", "Approved"),
            ("paid", "Paid"),
            ("cancelled", "Cancelled"),
        ],
        default="draft",
        required=True,
        index=True,
    )
    line_ids = fields.One2many("bayaan.payroll.line", "run_id")
    total_base = fields.Monetary(compute="_compute_totals", store=True)
    total_overtime = fields.Monetary(compute="_compute_totals", store=True)
    total_bonus = fields.Monetary(compute="_compute_totals", store=True)
    total_deductions = fields.Monetary(compute="_compute_totals", store=True)
    total_net = fields.Monetary(compute="_compute_totals", store=True)
    approved_by_id = fields.Many2one("res.users", readonly=True)
    approved_at = fields.Datetime(readonly=True)
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
        required=True,
    )
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends(
        "line_ids.base_salary",
        "line_ids.overtime_amount",
        "line_ids.bonus_amount",
        "line_ids.deduction_amount",
        "line_ids.advance_amount",
        "line_ids.cash_shortage_amount",
        "line_ids.net_pay",
    )
    def _compute_totals(self):
        for run in self:
            run.total_base = sum(run.line_ids.mapped("base_salary"))
            run.total_overtime = sum(run.line_ids.mapped("overtime_amount"))
            run.total_bonus = sum(run.line_ids.mapped("bonus_amount"))
            run.total_deductions = sum(
                line.deduction_amount + line.advance_amount + line.cash_shortage_amount
                for line in run.line_ids
            )
            run.total_net = sum(run.line_ids.mapped("net_pay"))

    def action_compute_lines(self):
        Employee = self.env["bayaan.employee"].sudo()
        Attendance = self.env["bayaan.attendance"].sudo()
        Adjustment = self.env["bayaan.payroll.adjustment"].sudo()
        for run in self:
            if run.state not in ("draft", "review"):
                raise UserError("Only draft or review payroll runs can be recomputed.")
            run.line_ids.unlink()
            date_from_dt = datetime.combine(run.date_from, datetime.min.time())
            date_to_dt = datetime.combine(run.date_to, datetime.max.time())
            employees = Employee.search([
                ("active", "=", True),
                ("company_id", "=", run.company_id.id),
            ], order="name")
            line_commands = []
            for employee in employees:
                attendance_rows = Attendance.search([
                    ("employee_id", "=", employee.id),
                    ("check_in", ">=", date_from_dt),
                    ("check_in", "<=", date_to_dt),
                ])
                worked_hours = sum(attendance_rows.mapped("worked_hours")) or employee.expected_monthly_hours
                expected_hours = employee.expected_monthly_hours or worked_hours
                overtime_hours = max(worked_hours - expected_hours, 0.0)
                overtime_amount = overtime_hours * employee.hourly_rate * 1.25
                adjustments = Adjustment.search([
                    ("employee_id", "=", employee.id),
                    ("date", ">=", run.date_from),
                    ("date", "<=", run.date_to),
                    ("state", "=", "approved"),
                ])
                bonus = sum(adjustments.filtered(lambda adj: adj.type == "bonus").mapped("amount"))
                deduction = sum(adjustments.filtered(lambda adj: adj.type == "deduction").mapped("amount"))
                advance = sum(adjustments.filtered(lambda adj: adj.type == "advance").mapped("amount"))
                cash_shortage = sum(adjustments.filtered(lambda adj: adj.type == "cash_shortage").mapped("amount"))
                line_commands.append((0, 0, {
                    "employee_id": employee.id,
                    "kiosk_id": employee.kiosk_id.id,
                    "worked_hours": worked_hours,
                    "expected_hours": expected_hours,
                    "overtime_hours": overtime_hours,
                    "base_salary": employee.monthly_salary,
                    "overtime_amount": overtime_amount,
                    "bonus_amount": bonus,
                    "deduction_amount": deduction,
                    "advance_amount": advance,
                    "cash_shortage_amount": cash_shortage,
                }))
            run.write({
                "line_ids": line_commands,
                "state": "review",
            })

    def action_approve(self):
        Adjustment = self.env["bayaan.payroll.adjustment"].sudo()
        for run in self:
            draft_adjustments = Adjustment.search_count([
                ("date", ">=", run.date_from),
                ("date", "<=", run.date_to),
                ("state", "=", "draft"),
                ("company_id", "=", run.company_id.id),
            ])
            if draft_adjustments:
                raise UserError("Approve or reject draft payroll adjustments before approving payroll.")
            if not run.line_ids:
                raise UserError("Compute payroll lines before approval.")
            run.write({
                "state": "approved",
                "approved_by_id": self.env.user.id,
                "approved_at": fields.Datetime.now(),
            })

    def action_mark_paid(self):
        for run in self:
            if run.state != "approved":
                raise UserError("Only approved payroll can be marked paid.")
            run.state = "paid"


class BayaanPayrollLine(models.Model):
    _name = "bayaan.payroll.line"
    _description = "Bayaan Payroll Line"
    _order = "run_id, employee_id"

    run_id = fields.Many2one("bayaan.payroll.run", required=True, ondelete="cascade", index=True)
    employee_id = fields.Many2one("bayaan.employee", required=True, index=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", index=True)
    worked_hours = fields.Float()
    expected_hours = fields.Float()
    overtime_hours = fields.Float()
    base_salary = fields.Monetary()
    overtime_amount = fields.Monetary()
    bonus_amount = fields.Monetary()
    deduction_amount = fields.Monetary()
    advance_amount = fields.Monetary()
    cash_shortage_amount = fields.Monetary()
    net_pay = fields.Monetary(compute="_compute_net_pay", store=True)
    currency_id = fields.Many2one(related="run_id.currency_id", store=True, readonly=True)
    company_id = fields.Many2one(related="run_id.company_id", store=True, readonly=True)

    @api.depends(
        "base_salary",
        "overtime_amount",
        "bonus_amount",
        "deduction_amount",
        "advance_amount",
        "cash_shortage_amount",
    )
    def _compute_net_pay(self):
        for line in self:
            line.net_pay = (
                line.base_salary
                + line.overtime_amount
                + line.bonus_amount
                - line.deduction_amount
                - line.advance_amount
                - line.cash_shortage_amount
            )
