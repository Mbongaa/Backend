from odoo.tests.common import HttpCase, tagged

from odoo.addons.bayaan_fnb_kiosk.controllers.api import BayaanKioskApi

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestAiDashboardApi(BayaanTestBase, HttpCase):
    """AI dashboard endpoint is read-only and source-backed."""

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def setUp(self):
        super().setUp()
        self.authenticate("admin", "admin")
        ICP = self.env["ir.config_parameter"].sudo()
        ICP.set_param("bayaan.ai.provider", "disabled")
        ICP.set_param("bayaan.ai.openai.api_key", "")
        ICP.set_param("bayaan.ai.feature_tier", "daily-only")
        ICP.set_param("bayaan.ai.monthly_token_budget", "100000")

    def test_ai_dashboard_plan_is_read_only_source_backed_without_credentials(self):
        response = self._jsonrpc("/bayaan/api/ai_dashboard_plan", {
            "query": "What happened today?",
            "locale": "en",
            "scope": {"sectionId": "insights", "timeRange": "today"},
        })
        if "error" in response:
            self.fail("ai_dashboard_plan errored: %s" % response["error"])

        result = response["result"]
        self.assertEqual(result.get("engine"), "odoo_pos")
        self.assertTrue(result.get("readonly"))
        self.assertEqual(result.get("llm", {}).get("status"), "missing_credentials")
        self.assertEqual(result.get("answerMode"), "analysis")
        self.assertEqual(result.get("plan", {}).get("intent"), "executive-summary")
        self.assertTrue(result.get("reportPack", {}).get("sourceEvidence"))
        self.assertTrue(result.get("claims"))
        self.assertEqual(result.get("visualizations"), [])
        self.assertEqual(result.get("featureTier", {}).get("tier"), "daily-only")
        self.assertEqual(result.get("budget", {}).get("status"), "within_budget")
        self.assertIn("pos.order", result.get("plan", {}).get("sourceRefsRequired", []))
        for component in result.get("plan", {}).get("components", []):
            self.assertNotEqual(component.get("mode"), "human-action")
        for claim in result.get("claims", []):
            self.assertTrue(claim.get("sourceRefs"))
            for numeric in claim.get("numericValues", []):
                self.assertIsInstance(numeric.get("value"), float)

    def test_ai_dashboard_plan_respects_feature_tier_before_provider(self):
        response = self._jsonrpc("/bayaan/api/ai_dashboard_plan", {
            "query": "Show the monthly kiosk trend.",
            "locale": "en",
        })
        if "error" in response:
            self.fail("ai_dashboard_plan tier guard errored: %s" % response["error"])

        result = response["result"]
        self.assertEqual(result.get("llm", {}).get("status"), "tier_limited")
        self.assertEqual(result.get("plan", {}).get("scope", {}).get("timeRange"), "month")
        self.assertEqual(result.get("featureTier", {}).get("allowedTimeRanges"), ["today"])
        self.assertTrue(result.get("claims"))
        self.assertEqual(result.get("visualizations"), [])

    def test_ai_dashboard_plan_respects_monthly_token_budget_before_provider(self):
        ICP = self.env["ir.config_parameter"].sudo()
        ICP.set_param("bayaan.ai.provider", "openai")
        ICP.set_param("bayaan.ai.openai.api_key", "test-key-not-called")
        ICP.set_param("bayaan.ai.feature_tier", "full-chat")
        ICP.set_param("bayaan.ai.monthly_token_budget", "1")

        response = self._jsonrpc("/bayaan/api/ai_dashboard_plan", {
            "query": "What happened today?",
            "locale": "en",
        })
        if "error" in response:
            self.fail("ai_dashboard_plan budget guard errored: %s" % response["error"])

        result = response["result"]
        self.assertEqual(result.get("llm", {}).get("status"), "budget_exhausted")
        self.assertEqual(result.get("budget", {}).get("monthlyTokenBudget"), 1)
        self.assertGreater(result.get("budget", {}).get("estimatedRequestTokens"), 1)
        self.assertTrue(result.get("claims"))
        self.assertEqual(result.get("visualizations"), [])

    def test_ai_dashboard_plan_rejects_empty_query(self):
        response = self._jsonrpc("/bayaan/api/ai_dashboard_plan", {
            "query": "",
        })
        self.assertIn("error", response)

    def test_ai_image_generate_degrades_without_credentials(self):
        """The image-draft route is read-only: with no provider configured it must
        return the graceful unconfigured contract (no crash, no record created)."""
        response = self._jsonrpc("/bayaan/api/ai_image_generate", {
            "name": "Espresso",
            "category": "Coffee",
        })
        if "error" in response:
            self.fail("ai_image_generate errored: %s" % response["error"])
        result = response["result"]
        self.assertEqual(result.get("engine"), "odoo_pos")
        self.assertFalse(result.get("configured"))
        self.assertIsNone(result.get("imageBase64"))
        self.assertTrue(result.get("error"))

    def test_ai_image_generate_requires_product_name(self):
        response = self._jsonrpc("/bayaan/api/ai_image_generate", {"name": "  "})
        self.assertIn("error", response)

    def test_ai_dashboard_stream_returns_final_source_backed_event_without_credentials(self):
        response = self.opener.post(
            self.base_url() + "/bayaan/api/ai_dashboard_stream",
            json={"payload": {
                "query": "What happened today?",
                "locale": "en",
                "scope": {"sectionId": "insights", "timeRange": "today"},
            }},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers.get("Content-Type", ""))
        self.assertIn("event: final", response.text)
        self.assertIn('"status": "missing_credentials"', response.text)
        self.assertIn('"engine": "odoo_pos"', response.text)
        self.assertIn('"visualizations": []', response.text)

    def test_ai_dashboard_openai_schema_requires_model_authored_visualizations(self):
        api = BayaanKioskApi()
        schema = api._ai_openai_schema()

        self.assertIn("visualizations", schema.get("required", []))
        visual_schema = schema.get("properties", {}).get("visualizations", {}).get("items", {})
        self.assertIn("series", visual_schema.get("required", []))
        self.assertIn("sourceRefs", visual_schema.get("required", []))

    def test_ai_dashboard_visualization_validation_keeps_only_source_backed_specs(self):
        api = BayaanKioskApi()
        report_pack = {
            "sourceEvidence": [
                {"model": "pos.payment", "rowCount": 2},
                {"model": "pos.order", "rowCount": 2},
            ],
        }

        visuals = api._ai_validate_provider_visualizations([
            {
                "id": "payment-split",
                "type": "pie-chart",
                "title": "Payment split",
                "reason": "Cash versus online payments from the report pack.",
                "series": [
                    {"label": "Cash", "value": 72000, "unit": "IQD", "category": "cash"},
                    {"label": "Online", "value": 31000, "unit": "IQD", "category": "online"},
                ],
                "sourceRefs": ["pos.payment"],
            },
            {
                "id": "invented",
                "type": "bar-chart",
                "title": "Invented",
                "reason": "Unsupported source.",
                "series": [{"label": "Fake", "value": 1, "unit": "IQD", "category": "fake"}],
                "sourceRefs": ["external.spreadsheet"],
            },
        ], report_pack)

        self.assertEqual(len(visuals), 1)
        self.assertEqual(visuals[0]["type"], "pie-chart")
        self.assertEqual(visuals[0]["sourceRefs"], ["pos.payment"])

    def test_ai_dashboard_classifies_greetings_as_conversation(self):
        api = BayaanKioskApi()
        greeting_plan = api._ai_template_plan("hi", {"scope": {"sectionId": "insights", "timeRange": "today"}})
        today_plan = api._ai_template_plan("What happened today?", {"scope": {"sectionId": "insights", "timeRange": "today"}})

        self.assertEqual(greeting_plan.get("intent"), "executive-summary")
        self.assertEqual(api._ai_answer_mode("hi", greeting_plan), "conversation")
        self.assertEqual(api._ai_answer_mode("What happened today?", today_plan), "analysis")

    def test_ai_dashboard_language_contract_tracks_requested_locale(self):
        api = BayaanKioskApi()
        arabic_contract = api._ai_language_contract("ar")
        english_contract = api._ai_language_contract("en")

        self.assertEqual(arabic_contract.get("locale"), "ar")
        self.assertEqual(arabic_contract.get("language"), "Arabic")
        self.assertIn("Respond to the user in Arabic", arabic_contract.get("systemInstruction"))
        self.assertIn("JSON keys", arabic_contract.get("systemInstruction"))
        self.assertEqual(english_contract.get("locale"), "en")
        self.assertEqual(english_contract.get("language"), "English")

    def test_ai_dashboard_arabic_quick_prompts_keep_deterministic_intent(self):
        api = BayaanKioskApi()

        self.assertEqual(api._ai_infer_intent("لماذا ساحة زيونة متأخرة 12%؟"), "kiosk-diagnosis")
        self.assertEqual(api._ai_infer_intent("اعرض شذوذ الهدر"), "waste-anomaly-review")
        self.assertEqual(api._ai_infer_intent("ما المخزون الذي يجب إرساله لـ K-07 غداً؟"), "stock-allocation")
        self.assertEqual(api._ai_infer_intent("هل أستطيع اعتماد الإغلاق؟"), "close-review")
        self.assertEqual(api._ai_infer_intent("How much cash and online payments did we have?"), "payment-reconciliation")
        self.assertEqual(api._ai_scope("ما الذي أركز عليه هذا الأسبوع؟", {}).get("timeRange"), "week")
