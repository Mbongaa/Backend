from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestWasteNotes(BayaanTestBase, HttpCase):
    """#8 — a waste/loss note is mandatory (server-enforced, not just UI) for uncategorized
    ('Other'), high-value, manager-flagged, unusually-large and repeated-pattern waste."""

    def _waste(self, **payload):
        response = self.opener.post(
            self.base_url() + "/bayaan/api/waste",
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()
        return response.get("result") or {}

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")

    def test_other_reason_requires_a_note(self):
        rejected = self._waste(kiosk="K-TEST", item="ING-CUP", qty=2, reason="Other")
        self.assertIn("error", rejected, "'Other' waste without a note must be rejected")
        accepted = self._waste(kiosk="K-TEST", item="ING-CUP", qty=2, reason="Other",
                               note="Counted spoilage above recipe estimate")
        self.assertNotIn("error", accepted)
        self.assertTrue(accepted.get("id"))

    def test_high_value_waste_requires_a_note(self):
        # Orange standard cost 1500; 40 x 1500 = 60,000 > 50,000 high-value threshold.
        rejected = self._waste(kiosk="K-TEST", item="ING-ORANGE", qty=40, reason="Damaged")
        self.assertIn("error", rejected, "high-value waste without a note must be rejected")

    def test_unusually_large_quantity_requires_a_note(self):
        # 30 cups of 200 on-hand = 15% ... not unusual; 120 of 200 = 60% >= 50% -> unusual.
        ok = self._waste(kiosk="K-TEST", item="ING-CUP", qty=20, reason="Damaged")
        self.assertNotIn("error", ok, "a small write-off with a known reason needs no note")
        rejected = self._waste(kiosk="K-TEST", item="ING-CUP", qty=120, reason="Damaged")
        self.assertIn("error", rejected, "writing off >= half the on-hand at once must need a note")

    def test_manager_flagged_product_requires_a_note(self):
        self.ingredient_sugar.product_tmpl_id.bayaan_waste_requires_note = True
        rejected = self._waste(kiosk="K-TEST", item="ING-SUGAR", qty=0.1, reason="Damaged")
        self.assertIn("error", rejected, "a manager-flagged product must require a waste note")
        accepted = self._waste(kiosk="K-TEST", item="ING-SUGAR", qty=0.1, reason="Damaged",
                               note="Flagged item — verified loss with supervisor")
        self.assertNotIn("error", accepted)

    def test_repeated_pattern_today_requires_a_note(self):
        # 3 prior small same-item wastes today are fine; the 4th needs a note.
        for _ in range(3):
            ok = self._waste(kiosk="K-TEST", item="ING-SUGAR", qty=0.05, reason="Damaged")
            self.assertNotIn("error", ok)
        rejected = self._waste(kiosk="K-TEST", item="ING-SUGAR", qty=0.05, reason="Damaged")
        self.assertIn("error", rejected, "a repeated same-item waste pattern today must need a note")
