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
            "manual_hours": 184.0,
        })
        if "error" in attendance:
            self.fail("hr_attendance errored: %s" % attendance["error"])
        self.assertAlmostEqual(attendance["result"]["workedHours"], 184.0)

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

        approved_shortage = self._jsonrpc("/bayaan/api/payroll_adjustment_action", {
            "adjustment": shortage["result"]["id"],
            "action": "approve",
        })
        if "error" in approved_shortage:
            self.fail("payroll shortage approval errored: %s" % approved_shortage["error"])

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
