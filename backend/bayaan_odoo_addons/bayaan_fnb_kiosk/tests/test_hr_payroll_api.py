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
