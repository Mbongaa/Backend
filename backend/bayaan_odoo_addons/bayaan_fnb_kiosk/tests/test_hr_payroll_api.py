from odoo import fields
from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestHrPayrollApi(BayaanTestBase, HttpCase):
    """Staff, attendance, adjustments, and payroll must persist in Odoo."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")

    def test_payroll_run_uses_attendance_and_approved_adjustments(self):
        employee = self._jsonrpc("/bayaan/api/hr_employee", {
            "name": "Maya Payroll Test",
            "role": "cashier",
            "kiosk": "K-TEST",
            "monthly_salary": 1760000.0,
            "expected_monthly_hours": 176.0,
        })
        if "error" in employee:
            self.fail("hr_employee errored: %s" % employee["error"])

        attendance = self._jsonrpc("/bayaan/api/hr_attendance", {
            "employee": employee["result"]["id"],
            "check_in": "2026-05-01 08:00:00",
            "manual_hours": 184.0,
            "note": "May payroll baseline hours",
        })
        if "error" in attendance:
            self.fail("hr_attendance errored: %s" % attendance["error"])
        self.assertAlmostEqual(attendance["result"]["workedHours"], 184.0)
        duplicate_attendance = self._jsonrpc("/bayaan/api/hr_attendance", {
            "employee": employee["result"]["id"],
            "check_in": "2026-05-01 08:00:00",
            "manual_hours": 184.0,
            "note": "May payroll baseline hours",
        })
        if "error" in duplicate_attendance:
            self.fail("duplicate hr_attendance errored: %s" % duplicate_attendance["error"])
        self.assertEqual(duplicate_attendance["result"]["id"], attendance["result"]["id"])
        self.assertEqual(duplicate_attendance["result"]["odooAttendanceId"], attendance["result"]["odooAttendanceId"])
        self.assertAlmostEqual(duplicate_attendance["result"]["workedHours"], 184.0)

        expense = self._jsonrpc("/bayaan/api/operating_expense", {
            "name": "Generator top-up",
            "category": "Utilities",
            "amount": 44000.0,
            "date": "2026-05-10",
            "note": "Payroll-adjacent store operating cost",
        })
        if "error" in expense:
            self.fail("operating_expense errored: %s" % expense["error"])
        duplicate_expense = self._jsonrpc("/bayaan/api/operating_expense", {
            "name": "Generator top-up",
            "category": "Utilities",
            "amount": 44000.0,
            "date": "2026-05-10",
            "note": "Payroll-adjacent store operating cost",
        })
        if "error" in duplicate_expense:
            self.fail("duplicate operating_expense errored: %s" % duplicate_expense["error"])
        self.assertEqual(duplicate_expense["result"]["id"], expense["result"]["id"])
        self.assertAlmostEqual(duplicate_expense["result"]["amount"], 44000.0)

        hr_snapshot = self._jsonrpc("/bayaan/api/hr_snapshot", {})
        if "error" in hr_snapshot:
            self.fail("hr_snapshot errored: %s" % hr_snapshot["error"])
        self.assertEqual(hr_snapshot["result"]["summary"]["operatingExpenses"], 44000.0)
        self.assertGreaterEqual(hr_snapshot["result"]["summary"]["payrollBase"], 1760000.0)
        self.assertGreaterEqual(hr_snapshot["result"]["summary"]["payrollAccrued"], 1760000.0)
        self.assertEqual(
            len([row for row in hr_snapshot["result"]["expenses"] if row["name"] == "Generator top-up"]),
            1,
        )

        pre_run_chain = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in pre_run_chain:
            self.fail("pre-run chain_bootstrap errored: %s" % pre_run_chain["error"])
        pre_run_monthly = pre_run_chain["result"]["summary"]["reportPeriods"]["monthly"]
        self.assertGreater(pre_run_monthly["payrollExpense"], 0.0)
        self.assertEqual(pre_run_monthly["sourceCounts"]["payrollRunRows"], 0)
        self.assertGreaterEqual(pre_run_monthly["operatingExpenses"], 44000.0)
        self.assertAlmostEqual(
            pre_run_monthly["netProfitAfterPayroll"],
            pre_run_monthly["netProfit"] - pre_run_monthly["payrollExpense"] - pre_run_monthly["operatingExpenses"],
        )

        bonus = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "bonus",
            "amount": 100000.0,
            "reason": "Sales target bonus",
            "approve": True,
        })
        if "error" in bonus:
            self.fail("payroll bonus errored: %s" % bonus["error"])
        self.assertEqual(bonus["result"]["state"], "approved")

        duplicate_bonus = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "bonus",
            "amount": 100000.0,
            "reason": "Sales target bonus",
            "approve": True,
        })
        if "error" in duplicate_bonus:
            self.fail("duplicate payroll bonus errored: %s" % duplicate_bonus["error"])
        self.assertEqual(duplicate_bonus["result"]["id"], bonus["result"]["id"])
        self.assertEqual(duplicate_bonus["result"]["state"], "approved")

        shortage = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "cash_shortage",
            "amount": 25000.0,
            "reason": "Approved cash shortage test",
        })
        if "error" in shortage:
            self.fail("payroll shortage errored: %s" % shortage["error"])
        self.assertEqual(shortage["result"]["state"], "draft")
        duplicate_shortage = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "cash_shortage",
            "amount": 25000.0,
            "reason": "Approved cash shortage test",
        })
        if "error" in duplicate_shortage:
            self.fail("duplicate payroll shortage errored: %s" % duplicate_shortage["error"])
        self.assertEqual(duplicate_shortage["result"]["id"], shortage["result"]["id"])
        self.assertEqual(duplicate_shortage["result"]["state"], "draft")

        run = self._jsonrpc("/bayaan/api/payroll_run", {
            "name": "May Payroll Test",
            "date_from": "2026-05-01",
            "date_to": "2026-05-31",
            "compute": True,
        })
        if "error" in run:
            self.fail("payroll_run errored: %s" % run["error"])
        line = run["result"]["lines"][0]
        self.assertAlmostEqual(line["workedHours"], 184.0)
        self.assertAlmostEqual(line["overtimeHours"], 8.0)
        self.assertAlmostEqual(line["overtimeAmount"], 100000.0)
        self.assertAlmostEqual(line["bonusAmount"], 100000.0)
        self.assertAlmostEqual(line["cashShortageAmount"], 0.0)
        self.assertAlmostEqual(line["netPay"], 1960000.0)

        blocked = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "approve",
        })
        self.assertIn("error", blocked)
        self.assertIn("draft payroll adjustments", str(blocked["error"]))

        approved_shortage = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "cash_shortage",
            "amount": 25000.0,
            "reason": "Approved cash shortage test",
            "approve": True,
        })
        if "error" in approved_shortage:
            self.fail("payroll shortage approval errored: %s" % approved_shortage["error"])
        self.assertEqual(approved_shortage["result"]["id"], shortage["result"]["id"])
        self.assertEqual(approved_shortage["result"]["state"], "approved")
        approve_retry = self._jsonrpc("/bayaan/api/payroll_adjustment_action", {
            "adjustment": shortage["result"]["id"],
            "action": "approve",
        })
        if "error" in approve_retry:
            self.fail("payroll shortage approval retry errored: %s" % approve_retry["error"])
        self.assertEqual(approve_retry["result"]["state"], "approved")
        reject_after_approval = self._jsonrpc("/bayaan/api/payroll_adjustment_action", {
            "adjustment": shortage["result"]["id"],
            "action": "reject",
        })
        self.assertIn("error", reject_after_approval)
        self.assertIn("cannot be rejected", str(reject_after_approval["error"]))

        recomputed = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "compute",
        })
        if "error" in recomputed:
            self.fail("payroll recompute errored: %s" % recomputed["error"])
        line = recomputed["result"]["lines"][0]
        self.assertAlmostEqual(line["cashShortageAmount"], 25000.0)
        self.assertAlmostEqual(line["netPay"], 1935000.0)

        approved = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "approve",
        })
        if "error" in approved:
            self.fail("payroll approve errored: %s" % approved["error"])
        self.assertEqual(approved["result"]["state"], "approved")

        paid = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "paid",
        })
        if "error" in paid:
            self.fail("payroll mark paid errored: %s" % paid["error"])
        self.assertEqual(paid["result"]["state"], "paid")

        duplicate_run = self._jsonrpc("/bayaan/api/payroll_run", {
            "name": "May Payroll Test",
            "date_from": "2026-05-01",
            "date_to": "2026-05-31",
            "compute": True,
        })
        if "error" in duplicate_run:
            self.fail("duplicate payroll_run errored: %s" % duplicate_run["error"])
        self.assertEqual(duplicate_run["result"]["id"], run["result"]["id"])
        self.assertEqual(duplicate_run["result"]["state"], "paid")

        paid_retry = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "paid",
        })
        if "error" in paid_retry:
            self.fail("payroll paid retry errored: %s" % paid_retry["error"])
        self.assertEqual(paid_retry["result"]["state"], "paid")
        paid_snapshot = self._jsonrpc("/bayaan/api/hr_snapshot", {})
        if "error" in paid_snapshot:
            self.fail("paid hr_snapshot errored: %s" % paid_snapshot["error"])
        self.assertGreaterEqual(paid_snapshot["result"]["summary"]["payrollAccrued"], paid["result"]["totals"]["net"])

        approve_after_paid = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "approve",
        })
        if "error" in approve_after_paid:
            self.fail("payroll approve retry after paid errored: %s" % approve_after_paid["error"])
        self.assertEqual(approve_after_paid["result"]["state"], "paid")

        recompute_after_paid = self._jsonrpc("/bayaan/api/payroll_run_action", {
            "run": run["result"]["id"],
            "action": "recompute",
        })
        if "error" in recompute_after_paid:
            self.fail("payroll recompute after paid errored: %s" % recompute_after_paid["error"])
        self.assertEqual(recompute_after_paid["result"]["state"], "paid")

        chain = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in chain:
            self.fail("chain_bootstrap errored: %s" % chain["error"])
        monthly = chain["result"]["summary"]["reportPeriods"]["monthly"]
        run_start = fields.Date.to_date("2026-05-01")
        run_end = fields.Date.to_date("2026-05-31")
        month_to_date = fields.Date.context_today(self.env.user)
        overlap_from = max(run_start, month_to_date.replace(day=1))
        overlap_to = min(run_end, month_to_date)
        overlap_days = max((overlap_to - overlap_from).days + 1, 0)
        run_days = (run_end - run_start).days + 1
        self.assertAlmostEqual(
            monthly["payrollExpense"],
            paid["result"]["totals"]["net"] * (overlap_days / run_days),
        )
        self.assertGreaterEqual(monthly["operatingExpenses"], 44000.0)
        self.assertAlmostEqual(
            monthly["netProfitAfterPayroll"],
            monthly["netProfit"] - monthly["payrollExpense"] - monthly["operatingExpenses"],
        )
        self.assertGreaterEqual(monthly["sourceCounts"]["payrollRunRows"], 1)
        self.assertGreaterEqual(monthly["sourceCounts"]["operatingExpenseRows"], 1)
        self.assertGreaterEqual(chain["result"]["summary"]["sourceCounts"]["operatingExpenseRows"], 1)

        late_adjustment = self._jsonrpc("/bayaan/api/payroll_adjustment", {
            "employee": employee["result"]["id"],
            "date": "2026-05-10",
            "type": "cash_shortage",
            "amount": 10000.0,
            "reason": "Late shortage after paid payroll",
        })
        self.assertIn("error", late_adjustment)
        self.assertIn("already approved or paid", str(late_adjustment["error"]))

    def test_chain_bootstrap_accrues_payroll_days_not_covered_by_partial_run(self):
        employee = self._jsonrpc("/bayaan/api/hr_employee", {
            "name": "Partial Payroll Coverage",
            "role": "cashier",
            "kiosk": "K-TEST",
            "monthly_salary": 3100000.0,
            "expected_monthly_hours": 176.0,
        })
        if "error" in employee:
            self.fail("partial payroll employee errored: %s" % employee["error"])

        partial_run = self._jsonrpc("/bayaan/api/payroll_run", {
            "name": "Partial May Payroll",
            "date_from": "2026-05-01",
            "date_to": "2026-05-15",
            "compute": True,
        })
        if "error" in partial_run:
            self.fail("partial payroll_run errored: %s" % partial_run["error"])

        chain = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in chain:
            self.fail("partial chain_bootstrap errored: %s" % chain["error"])
        monthly = chain["result"]["summary"]["reportPeriods"]["monthly"]
        self.assertEqual(monthly["sourceCounts"]["payrollRunRows"], 1)
        self.assertGreater(monthly["payrollExpense"], partial_run["result"]["totals"]["net"])

    def test_kiosk_work_week_flags_missing_coverage_until_staffed(self):
        first_employee = self._jsonrpc("/bayaan/api/hr_employee", {
            "name": "Coverage Cashier One",
            "role": "cashier",
            "kiosk": "K-TEST",
            "monthly_salary": 1500000.0,
            "expected_monthly_hours": 176.0,
        })
        if "error" in first_employee:
            self.fail("first hr_employee errored: %s" % first_employee["error"])
        self.assertTrue(first_employee["result"]["odooEmployeeId"])

        attendance = self._jsonrpc("/bayaan/api/hr_attendance", {
            "employee": first_employee["result"]["id"],
            "check_in": "2026-05-11 08:00:00",
            "manual_hours": 8.0,
        })
        if "error" in attendance:
            self.fail("hr_attendance errored: %s" % attendance["error"])
        self.assertTrue(attendance["result"]["odooAttendanceId"])

        rule = self._jsonrpc("/bayaan/api/hr_schedule", {
            "action": "create_coverage_rule",
            "kiosk": "K-TEST",
            "day_of_week": "0",
            "role": "cashier",
            "start_hour": 8.0,
            "end_hour": 16.0,
            "required_count": 2,
        })
        if "error" in rule:
            self.fail("coverage rule errored: %s" % rule["error"])
        self.assertEqual(rule["result"]["requiredCount"], 2)

        first_shift = self._jsonrpc("/bayaan/api/hr_schedule", {
            "action": "create_shift",
            "employee": first_employee["result"]["id"],
            "kiosk": "K-TEST",
            "date": "2026-05-11",
            "role": "cashier",
            "start_hour": 8.0,
            "end_hour": 16.0,
        })
        if "error" in first_shift:
            self.fail("first shift errored: %s" % first_shift["error"])

        snapshot = self._jsonrpc("/bayaan/api/hr_schedule", {
            "action": "read",
            "date_from": "2026-05-11",
            "date_to": "2026-05-11",
        })
        if "error" in snapshot:
            self.fail("hr schedule snapshot errored: %s" % snapshot["error"])
        self.assertEqual(snapshot["result"]["summary"]["missingPeople"], 1)
        self.assertEqual(snapshot["result"]["coverageGaps"][0]["assignedCount"], 1)
        self.assertEqual(snapshot["result"]["coverageGaps"][0]["requiredCount"], 2)

        second_employee = self._jsonrpc("/bayaan/api/hr_employee", {
            "name": "Coverage Cashier Two",
            "role": "cashier",
            "kiosk": "K-TEST",
            "monthly_salary": 1500000.0,
            "expected_monthly_hours": 176.0,
        })
        if "error" in second_employee:
            self.fail("second hr_employee errored: %s" % second_employee["error"])

        second_shift = self._jsonrpc("/bayaan/api/hr_schedule", {
            "action": "create_shift",
            "employee": second_employee["result"]["id"],
            "kiosk": "K-TEST",
            "date": "2026-05-11",
            "role": "cashier",
            "start_hour": 8.0,
            "end_hour": 16.0,
        })
        if "error" in second_shift:
            self.fail("second shift errored: %s" % second_shift["error"])

        staffed_snapshot = self._jsonrpc("/bayaan/api/hr_schedule", {
            "action": "read",
            "date_from": "2026-05-11",
            "date_to": "2026-05-11",
        })
        if "error" in staffed_snapshot:
            self.fail("staffed hr schedule snapshot errored: %s" % staffed_snapshot["error"])
        self.assertEqual(staffed_snapshot["result"]["summary"]["missingPeople"], 0)
        self.assertFalse(staffed_snapshot["result"]["coverageGaps"])

        bootstrap = self._jsonrpc("/bayaan/api/chain_bootstrap", {})
        if "error" in bootstrap:
            self.fail("chain bootstrap errored: %s" % bootstrap["error"])
        self.assertIn("hr", bootstrap["result"])
        self.assertGreaterEqual(bootstrap["result"]["summary"]["sourceCounts"]["hrEmployees"], 2)
