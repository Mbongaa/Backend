from datetime import datetime, timedelta

from odoo import api, fields, models
from odoo.exceptions import ValidationError, UserError


HR_ROLE_SELECTION = [
    ("manager", "Manager"),
    ("supervisor", "Supervisor"),
    ("warehouse", "Warehouse"),
    ("cashier", "Cashier"),
    ("barista", "Barista"),
    ("accountant", "Accountant"),
    ("other", "Other"),
]

STAFFING_ROLE_SELECTION = [("any", "Any role")] + HR_ROLE_SELECTION

DAYOFWEEK_SELECTION = [
    ("0", "Monday"),
    ("1", "Tuesday"),
    ("2", "Wednesday"),
    ("3", "Thursday"),
    ("4", "Friday"),
    ("5", "Saturday"),
    ("6", "Sunday"),
]


class BayaanEmployee(models.Model):
    _name = "bayaan.employee"
    _description = "Bayaan Employee"
    _order = "name"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    user_id = fields.Many2one("res.users", string="Odoo User")
    hr_employee_id = fields.Many2one("hr.employee", string="Odoo Employee", index=True, ondelete="restrict")
    resource_calendar_id = fields.Many2one("resource.calendar", string="Odoo Work Calendar")
    role = fields.Selection(HR_ROLE_SELECTION, default="cashier", required=True)
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

    @api.model_create_multi
    def create(self, vals_list):
        employees = super().create(vals_list)
        employees._sync_hr_employee()
        return employees

    def write(self, vals):
        result = super().write(vals)
        if not self.env.context.get("bayaan_skip_hr_sync") and {
            "name",
            "active",
            "user_id",
            "company_id",
            "resource_calendar_id",
        }.intersection(vals):
            self._sync_hr_employee()
        return result

    def _sync_hr_employee(self):
        HrEmployee = self.env["hr.employee"].sudo()
        for employee in self:
            values = {
                "name": employee.name,
                "active": employee.active,
                "company_id": employee.company_id.id,
            }
            if employee.user_id:
                values["user_id"] = employee.user_id.id
            if employee.resource_calendar_id:
                values["resource_calendar_id"] = employee.resource_calendar_id.id

            if employee.hr_employee_id and employee.hr_employee_id.exists():
                employee.hr_employee_id.sudo().write(values)
                hr_employee = employee.hr_employee_id
            else:
                hr_employee = HrEmployee.create(values)
                employee.with_context(bayaan_skip_hr_sync=True).hr_employee_id = hr_employee.id

            pos_config = employee.kiosk_id.pos_config_id
            if pos_config and "basic_employee_ids" in pos_config._fields:
                pos_config.sudo().write({"basic_employee_ids": [(4, hr_employee.id)]})


class BayaanAttendance(models.Model):
    _name = "bayaan.attendance"
    _description = "Bayaan Attendance"
    _order = "check_in desc, id desc"

    employee_id = fields.Many2one("bayaan.employee", required=True, index=True)
    hr_attendance_id = fields.Many2one("hr.attendance", string="Odoo Attendance", readonly=True, copy=False, index=True)
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

    @api.model_create_multi
    def create(self, vals_list):
        attendances = super().create(vals_list)
        attendances._sync_hr_attendance()
        return attendances

    def write(self, vals):
        result = super().write(vals)
        if not self.env.context.get("bayaan_skip_hr_attendance_sync") and {
            "employee_id",
            "check_in",
            "check_out",
            "manual_hours",
        }.intersection(vals):
            self._sync_hr_attendance()
        return result

    def _sync_hr_attendance(self):
        HrAttendance = self.env["hr.attendance"].sudo()
        for attendance in self:
            attendance.employee_id._sync_hr_employee()
            hr_employee = attendance.employee_id.hr_employee_id
            if not hr_employee:
                continue
            check_in = fields.Datetime.to_datetime(attendance.check_in)
            check_out = fields.Datetime.to_datetime(attendance.check_out) if attendance.check_out else False
            if not check_out and attendance.manual_hours:
                check_out = check_in + timedelta(hours=attendance.manual_hours)
            values = {
                "employee_id": hr_employee.id,
                "check_in": check_in,
                "check_out": check_out,
                "in_mode": "manual",
                "out_mode": "manual" if check_out else False,
            }
            if attendance.hr_attendance_id and attendance.hr_attendance_id.exists():
                attendance.hr_attendance_id.sudo().write(values)
                continue
            hr_attendance = HrAttendance.create(values)
            attendance.with_context(bayaan_skip_hr_attendance_sync=True).hr_attendance_id = hr_attendance.id


class BayaanOperatingExpense(models.Model):
    _name = "bayaan.operating.expense"
    _description = "Bayaan Operating Expense"
    _order = "date desc, id desc"

    name = fields.Char(required=True)
    category = fields.Char(required=True, default="General")
    amount = fields.Monetary(required=True)
    date = fields.Date(required=True, default=fields.Date.context_today)
    note = fields.Char()
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    currency_id = fields.Many2one(related="company_id.currency_id", store=True, readonly=True)

    @api.constrains("amount")
    def _check_amount(self):
        for expense in self:
            if expense.amount <= 0:
                raise ValidationError("Operating expense amount must be greater than zero.")


class BayaanStaffingCoverageRule(models.Model):
    _name = "bayaan.staffing.coverage.rule"
    _description = "Bayaan Kiosk Staffing Coverage Rule"
    _order = "kiosk_id, dayofweek, start_hour, role"

    name = fields.Char(compute="_compute_name", store=True)
    active = fields.Boolean(default=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True, index=True, ondelete="cascade")
    dayofweek = fields.Selection(DAYOFWEEK_SELECTION, required=True, index=True)
    role = fields.Selection(STAFFING_ROLE_SELECTION, default="any", required=True, index=True)
    start_hour = fields.Float(required=True, default=8.0)
    end_hour = fields.Float(required=True, default=16.0)
    required_count = fields.Integer(default=1, required=True)
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("kiosk_id", "dayofweek", "role", "start_hour", "end_hour", "required_count")
    def _compute_name(self):
        day_labels = dict(DAYOFWEEK_SELECTION)
        role_labels = dict(STAFFING_ROLE_SELECTION)
        for rule in self:
            rule.name = "%s %s %.2f-%.2f %s x%s" % (
                rule.kiosk_id.kiosk_code or "Kiosk",
                day_labels.get(rule.dayofweek, rule.dayofweek),
                rule.start_hour,
                rule.end_hour,
                role_labels.get(rule.role, rule.role),
                rule.required_count,
            )

    @api.constrains("start_hour", "end_hour", "required_count")
    def _check_slot_values(self):
        for rule in self:
            if rule.start_hour < 0 or rule.end_hour > 24 or rule.end_hour <= rule.start_hour:
                raise ValidationError("Coverage rule times must be within the same day and end after the start time.")
            if rule.required_count < 1:
                raise ValidationError("Coverage rules must require at least one person.")


class BayaanShiftPlan(models.Model):
    _name = "bayaan.shift.plan"
    _description = "Bayaan Staff Shift Plan"
    _order = "date, start_hour, kiosk_id, employee_id"

    name = fields.Char(compute="_compute_name", store=True)
    employee_id = fields.Many2one("bayaan.employee", required=True, index=True, ondelete="cascade")
    hr_employee_id = fields.Many2one(related="employee_id.hr_employee_id", store=True, readonly=True)
    kiosk_id = fields.Many2one("bayaan.kiosk", required=True, index=True, ondelete="cascade")
    date = fields.Date(required=True, index=True, default=fields.Date.context_today)
    role = fields.Selection(HR_ROLE_SELECTION, default="cashier", required=True, index=True)
    start_hour = fields.Float(required=True, default=8.0)
    end_hour = fields.Float(required=True, default=16.0)
    planned_hours = fields.Float(compute="_compute_planned_hours", store=True)
    state = fields.Selection(
        [
            ("planned", "Planned"),
            ("confirmed", "Confirmed"),
            ("cancelled", "Cancelled"),
        ],
        default="planned",
        required=True,
        index=True,
    )
    note = fields.Char()
    company_id = fields.Many2one(
        "res.company",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.onchange("employee_id")
    def _onchange_employee_id(self):
        if not self.employee_id:
            return
        self.role = self.employee_id.role
        if self.employee_id.kiosk_id and not self.kiosk_id:
            self.kiosk_id = self.employee_id.kiosk_id

    @api.depends("employee_id", "kiosk_id", "date", "start_hour", "end_hour", "role")
    def _compute_name(self):
        for shift in self:
            shift.name = "%s / %s / %s %.2f-%.2f" % (
                shift.date or "",
                shift.kiosk_id.kiosk_code or "Kiosk",
                shift.employee_id.name or "Staff",
                shift.start_hour,
                shift.end_hour,
            )

    @api.depends("start_hour", "end_hour")
    def _compute_planned_hours(self):
        for shift in self:
            shift.planned_hours = max((shift.end_hour or 0.0) - (shift.start_hour or 0.0), 0.0)

    @api.constrains("date", "start_hour", "end_hour")
    def _check_shift_values(self):
        for shift in self:
            if shift.start_hour < 0 or shift.end_hour > 24 or shift.end_hour <= shift.start_hour:
                raise ValidationError("Shift times must be within the same day and end after the start time.")


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
        for adjustment in self:
            if adjustment.state == "approved":
                continue
            if adjustment.state == "rejected":
                raise UserError("Rejected payroll adjustments cannot be approved.")
            adjustment.write({
                "state": "approved",
                "approved_by_id": self.env.user.id,
                "approved_at": fields.Datetime.now(),
            })

    def action_reject(self):
        for adjustment in self:
            if adjustment.state == "rejected":
                continue
            if adjustment.state == "approved":
                raise UserError("Approved payroll adjustments cannot be rejected.")
            adjustment.write({
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
        ShiftPlan = self.env["bayaan.shift.plan"].sudo()
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
                shift_rows = ShiftPlan.search([
                    ("employee_id", "=", employee.id),
                    ("date", ">=", run.date_from),
                    ("date", "<=", run.date_to),
                    ("state", "!=", "cancelled"),
                ])
                scheduled_hours = sum(shift_rows.mapped("planned_hours"))
                worked_hours = sum(attendance_rows.mapped("worked_hours"))
                if not attendance_rows and not scheduled_hours:
                    worked_hours = employee.expected_monthly_hours
                expected_hours = scheduled_hours or employee.expected_monthly_hours or worked_hours
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
            if run.state == "paid":
                continue
            if run.state == "approved":
                continue
            if run.state == "cancelled":
                raise UserError("Cancelled payroll cannot be approved.")
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
            if run.state == "paid":
                continue
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
