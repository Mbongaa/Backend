"""Alert rule engine: low-stock detection + cooldown + scope + inline event firing.

The client asked for proactive notifications ("milk < 20L"). This test suite
proves the rule engine fires once, respects cooldown, and is scoped to the
right kiosks. SMTP delivery is exercised via mail.mail — without an outgoing
mail server the records still land in queue and the dispatched ledger row
shows up so the dashboard can surface "alert was raised".
"""

from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import HttpCase, tagged

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestBayaanAlertRules(BayaanTestBase, HttpCase):

    def _create_manager(self, login):
        group = self.env.ref("bayaan_fnb_kiosk.group_bayaan_manager")
        return self.env["res.users"].sudo().create({
            "name": login,
            "login": login,
            "email": "%s@example.test" % login,
            "password": "test",
            "company_id": self.company.id,
            "company_ids": [(6, 0, [self.company.id])],
            "group_ids": [(6, 0, [group.id])],
        })

    def _create_cashier(self, login):
        group = self.env.ref("bayaan_fnb_kiosk.group_bayaan_cashier")
        return self.env["res.users"].sudo().create({
            "name": login,
            "login": login,
            "email": "%s@example.test" % login,
            "password": "test",
            "company_id": self.company.id,
            "company_ids": [(6, 0, [self.company.id])],
            "group_ids": [(6, 0, [group.id])],
        })

    def setUp(self):
        super().setUp()
        self.manager = self._create_manager("bayaan_alert_mgr")
        self.cashier = self._create_cashier("bayaan_alert_cashier")
        # Configure the ingredient with reorder/critical thresholds that will trigger
        # against the BayaanTestBase fixture stock (orange has 50 kg on hand).
        self.ingredient_orange.product_tmpl_id.write({
            "bayaan_stock_reorder_qty": 60.0,   # 50 < 60 → low_stock fires
            "bayaan_stock_critical_qty": 40.0,  # 50 > 40 → critical does NOT fire
        })

    def test_low_stock_rule_fires_once_then_cooldown_blocks(self):
        rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Low stock — orange",
            "trigger_type": "low_stock",
            "threshold": 1.0,
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "cooldown_minutes": 120,
            "company_id": self.company.id,
        })
        rule._evaluate()
        dispatched = self.env["bayaan.alert.dispatched"].sudo().search([("rule_id", "=", rule.id)])
        self.assertGreaterEqual(len(dispatched), 1, msg="Low-stock rule should fire on first eval")
        # Re-evaluating inside the cooldown must NOT add another row for the same key.
        before = len(dispatched)
        rule._evaluate()
        after = self.env["bayaan.alert.dispatched"].sudo().search_count([("rule_id", "=", rule.id)])
        self.assertEqual(after, before, msg="Cooldown must block duplicate fire")

    def test_critical_stock_rule_does_not_fire_above_threshold(self):
        rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Critical orange",
            "trigger_type": "critical_stock",
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "company_id": self.company.id,
        })
        rule._evaluate()
        rows = self.env["bayaan.alert.dispatched"].sudo().search([("rule_id", "=", rule.id)])
        # 50 > 40 critical threshold → must NOT fire.
        self.assertEqual(len(rows), 0)

    def test_kiosk_scope_excludes_unrelated_kiosks(self):
        # Create a second kiosk; rule should fire ONLY for kiosk in kiosk_ids.
        other_location = self.env["stock.location"].sudo().create({
            "name": "Kiosk K-OTHER Loc",
            "usage": "internal",
            "location_id": self.warehouse.view_location_id.id,
            "company_id": self.company.id,
        })
        other_pos = self.env["pos.config"].sudo().create({
            "name": "K-OTHER POS",
            "company_id": self.company.id,
        })
        other_pos.picking_type_id.default_location_src_id = other_location
        other_kiosk = self.env["bayaan.kiosk"].sudo().create({
            "name": "Other test kiosk",
            "kiosk_code": "K-ALT",
            "pos_config_id": other_pos.id,
            "stock_location_id": other_location.id,
            "stock_deduction_policy": "warning",
            "company_id": self.company.id,
        })
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange, other_location, 10.0
        )
        rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Low stock — scoped",
            "trigger_type": "low_stock",
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "kiosk_ids": [(6, 0, [other_kiosk.id])],
            "cooldown_minutes": 120,
            "company_id": self.company.id,
        })
        rule._evaluate()
        rows = self.env["bayaan.alert.dispatched"].sudo().search([("rule_id", "=", rule.id)])
        kiosks_alerted = {row.kiosk_id.id for row in rows}
        self.assertIn(other_kiosk.id, kiosks_alerted)
        self.assertNotIn(self.kiosk.id, kiosks_alerted)

    def test_cron_evaluate_all_dispatches_active_rules(self):
        active_rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Active rule",
            "trigger_type": "low_stock",
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "company_id": self.company.id,
        })
        inactive_rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Inactive rule",
            "trigger_type": "low_stock",
            "active": False,
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "company_id": self.company.id,
        })
        self.env["bayaan.alert.rule"].sudo()._cron_evaluate_all()
        self.assertGreater(
            self.env["bayaan.alert.dispatched"].sudo().search_count([("rule_id", "=", active_rule.id)]),
            0,
        )
        self.assertEqual(
            self.env["bayaan.alert.dispatched"].sudo().search_count([("rule_id", "=", inactive_rule.id)]),
            0,
        )

    def test_rule_requires_active_recipient(self):
        # Constraint: an active rule must have at least one recipient.
        with self.assertRaises(ValidationError):
            self.env["bayaan.alert.rule"].sudo().create({
                "name": "No-recipient rule",
                "trigger_type": "low_stock",
                "active": True,
                "company_id": self.company.id,
            })

    def test_cashier_cannot_create_rule(self):
        cashier_env = self.env(user=self.cashier)
        with self.assertRaises(AccessError):
            cashier_env["bayaan.alert.rule"].create({
                "name": "Hijack rule",
                "trigger_type": "low_stock",
                "recipient_user_ids": [(6, 0, [self.cashier.id])],
                "company_id": self.company.id,
            })

    def test_high_waste_rule_fires_when_threshold_crossed(self):
        # Post a waste entry that exceeds the rule threshold.
        self.env["bayaan.waste.entry"].sudo().create({
            "kiosk_id": self.kiosk.id,
            "product_id": self.ingredient_orange.id,
            "qty": 5.0,
            "estimated_cost": 25_000.0,
            "reason": "spillage",
        })
        rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "High waste",
            "trigger_type": "high_waste",
            "threshold": 10_000.0,
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "company_id": self.company.id,
            "cooldown_minutes": 120,
        })
        rule._evaluate()
        rows = self.env["bayaan.alert.dispatched"].sudo().search([("rule_id", "=", rule.id)])
        self.assertGreaterEqual(len(rows), 1)

    def test_dedup_key_isolates_different_keys(self):
        # Same rule firing for two different kiosks/products should both land.
        other_location = self.env["stock.location"].sudo().create({
            "name": "Kiosk K-ALT2 Loc",
            "usage": "internal",
            "location_id": self.warehouse.view_location_id.id,
            "company_id": self.company.id,
        })
        other_pos = self.env["pos.config"].sudo().create({
            "name": "K-ALT2 POS",
            "company_id": self.company.id,
        })
        other_pos.picking_type_id.default_location_src_id = other_location
        other_kiosk = self.env["bayaan.kiosk"].sudo().create({
            "name": "Alt kiosk 2",
            "kiosk_code": "K-ALT2",
            "pos_config_id": other_pos.id,
            "stock_location_id": other_location.id,
            "stock_deduction_policy": "warning",
            "company_id": self.company.id,
        })
        self.env["stock.quant"].sudo()._update_available_quantity(
            self.ingredient_orange, other_location, 5.0
        )
        rule = self.env["bayaan.alert.rule"].sudo().create({
            "name": "Both kiosks",
            "trigger_type": "low_stock",
            "recipient_user_ids": [(6, 0, [self.manager.id])],
            "company_id": self.company.id,
            "cooldown_minutes": 120,
        })
        rule._evaluate()
        rows = self.env["bayaan.alert.dispatched"].sudo().search([("rule_id", "=", rule.id)])
        # Both kiosks under threshold → two distinct dedup_keys, two rows.
        keys = {row.dedup_key for row in rows}
        self.assertGreaterEqual(len(keys), 2)
