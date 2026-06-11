from odoo.tests.common import HttpCase, tagged

from odoo.addons.bayaan_fnb_kiosk.controllers.api import BayaanKioskApi

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestProductCreateBundle(BayaanTestBase, HttpCase):
    """AI-drafted, human-confirmed product+recipe creation.

    The AI never writes — it only drafts a productProposal. The only write path is
    /bayaan/api/product_create_bundle, which a human confirms. It must create the
    product and recipe in one transaction (atomic), respect the chosen consumption
    mode, and require both procurement and manager scope.
    """

    def _jsonrpc(self, route, payload):
        return self.opener.post(
            self.base_url() + route,
            json={"jsonrpc": "2.0", "method": "call", "params": {"payload": payload}, "id": 1},
        ).json()

    def _create_user(self, login, group_xmlid):
        group = self.env.ref(group_xmlid)
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
        self.authenticate("admin", "admin")
        self.logistics = self._create_user(
            "bayaan_bundle_logistics",
            "bayaan_fnb_kiosk.group_bayaan_logistics",
        )

    # --- the deterministic commit route ---------------------------------------

    def test_bundle_creates_product_with_active_recipe(self):
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Mango Smoothie",
            "consumption_mode": "recipe",
            "uom": "Units",
            "category": "Juice",
            "list_price": 6000,
            "standard_price": 1500,
            "available_in_pos": True,
            "sizes": ["Small", "Medium", "Large"],
            "recipe": {
                "waste_allowance_percent": 5,
                "ingredients": [
                    {"ingredient": "ING-ORANGE", "qty": 0.3, "uom": "kg"},
                    {"ingredient": "ING-CUP", "qty": 1.0, "uom": "Units"},
                ],
            },
        })
        if "error" in response:
            self.fail("product_create_bundle errored: %s" % response["error"])

        result = response["result"]
        self.assertEqual(result.get("engine"), "odoo_pos")
        self.assertTrue(result.get("product_id"))
        self.assertTrue(result.get("recipe_id"))
        self.assertEqual(result.get("recipe_state"), "active")

        product = self.env["product.product"].browse(result["product_id"])
        self.assertEqual(product.product_tmpl_id.bayaan_consumption_mode, "recipe")
        recipe = self.env["bayaan.recipe"].browse(result["recipe_id"])
        self.assertEqual(recipe.product_id, product)
        self.assertEqual(recipe.state, "active")
        self.assertEqual(len(recipe.line_ids), 2)

    def test_bundle_resolves_numeric_string_ingredient_id(self):
        # The real AI->confirm path sends the Odoo product id as a STRING (the
        # validator emits str(product.id)). This is the "Product not found: <id>"
        # repro the demo hit: a digit-only string must resolve to the product, not
        # raise. Guards the _product numeric-string id fix.
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Numeric Id Juice",
            "consumption_mode": "recipe",
            "uom": "Units",
            "list_price": 5000,
            "recipe": {
                "ingredients": [
                    {"ingredient": str(self.ingredient_orange.id), "qty": 0.3, "uom": self.uom_kgm.name},
                ],
            },
        })
        if "error" in response:
            self.fail("numeric-string ingredient id must resolve, not error: %s" % response["error"])
        result = response["result"]
        self.assertTrue(result.get("product_id"))
        recipe = self.env["bayaan.recipe"].browse(result["recipe_id"])
        self.assertEqual(recipe.line_ids[0].ingredient_id, self.ingredient_orange)

    def test_bundle_preserves_hybrid_mode_after_activation(self):
        # A 'hybrid' product consumes BOTH its finished SKU and its recipe components.
        # Activating its recipe must NOT silently flip it to 'recipe' (which would
        # break finished-SKU stock accounting). Guards the action_activate fix.
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Hybrid Combo",
            "consumption_mode": "hybrid",
            "uom": "Units",
            "list_price": 7000,
            "recipe": {
                "ingredients": [
                    {"ingredient": "ING-ORANGE", "qty": 0.1, "uom": self.uom_kgm.name},
                ],
            },
        })
        if "error" in response:
            self.fail("hybrid bundle errored: %s" % response["error"])
        result = response["result"]
        product = self.env["product.product"].browse(result["product_id"])
        self.assertEqual(product.product_tmpl_id.bayaan_consumption_mode, "hybrid")
        self.assertEqual(result.get("recipe_state"), "active")

    def test_bundle_finished_product_skips_recipe(self):
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Cheesecake Slice",
            "consumption_mode": "finished",
            "uom": "Units",
            "list_price": 4000,
        })
        if "error" in response:
            self.fail("product_create_bundle finished errored: %s" % response["error"])

        result = response["result"]
        self.assertTrue(result.get("product_id"))
        self.assertFalse(result.get("recipe_id"))
        product = self.env["product.product"].browse(result["product_id"])
        self.assertEqual(product.product_tmpl_id.bayaan_consumption_mode, "finished")

    def test_bundle_rolls_back_product_when_recipe_is_invalid(self):
        # A recipe line with a non-positive quantity raises AFTER the product
        # template is created. The whole transaction must roll back so no orphan
        # product is left flagged missing_recipe.
        before = self.env["product.template"].search_count([("name", "=", "Bundle Broken Recipe")])
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Broken Recipe",
            "consumption_mode": "recipe",
            "uom": "Units",
            "list_price": 5000,
            "recipe": {
                "ingredients": [
                    {"ingredient": "ING-ORANGE", "qty": 0, "uom": "kg"},
                ],
            },
        })
        self.assertIn("error", response)
        after = self.env["product.template"].search_count([("name", "=", "Bundle Broken Recipe")])
        self.assertEqual(before, after, "product must not persist when its recipe fails")

    def test_bundle_requires_manager_scope(self):
        # Logistics passes procurement scope but fails manager scope; nothing is
        # created because both guards run before any write.
        self.authenticate("bayaan_bundle_logistics", "test")
        response = self._jsonrpc("/bayaan/api/product_create_bundle", {
            "name": "Bundle Logistics Blocked",
            "consumption_mode": "finished",
            "uom": "Units",
            "list_price": 3000,
        })
        self.assertIn("error", response)
        self.authenticate("admin", "admin")
        self.assertEqual(
            self.env["product.template"].search_count([("name", "=", "Bundle Logistics Blocked")]),
            0,
        )

    # --- the proposal validator (no HTTP) -------------------------------------

    def test_validate_product_proposal_blanks_unknown_ingredient(self):
        controller = BayaanKioskApi()
        report_pack = {"catalogReference": {
            "ingredients": [
                {"id": str(self.ingredient_orange.id), "code": "ING-ORANGE", "name": "Orange", "uom": self.uom_kgm.name},
            ],
            "uoms": [{"id": str(self.uom_kgm.id), "name": self.uom_kgm.name}],
        }}
        base = {
            "name": "Validated OJ",
            "consumptionMode": "recipe",
            "uom": "Units",
            "category": "Juice",
            "listPrice": 5000,
            "standardPrice": 1000,
            "availableInPos": True,
            "sizes": ["Small"],
            "modifierGroups": [],
            "modeRationale": "kiosk-made juice",
        }

        good = controller._ai_validate_product_proposal({
            **base,
            "recipe": {
                "ingredients": [{"ingredientId": "ING-ORANGE", "ingredientName": "Orange", "qty": 0.3, "uom": self.uom_kgm.name}],
                "wasteAllowancePercent": 0,
            },
        }, report_pack)
        self.assertIsNotNone(good)
        self.assertEqual(good["recipe"]["ingredients"][0]["ingredientId"], str(self.ingredient_orange.id))
        self.assertEqual(good["ingredientWarnings"], [])

        # An ingredient the model was never shown is DROPPED from the draft (not the
        # whole proposal) and flagged in ingredientWarnings, so the editable draft still
        # reaches the human-confirm form with a visible notice. The dropped line never
        # reaches the deterministic write path.
        flagged = controller._ai_validate_product_proposal({
            **base,
            "recipe": {
                "ingredients": [{"ingredientId": "ING-DOES-NOT-EXIST", "ingredientName": "Ghost", "qty": 0.3, "uom": self.uom_kgm.name}],
                "wasteAllowancePercent": 0,
            },
        }, report_pack)
        self.assertIsNotNone(flagged)
        self.assertIsNone(flagged["recipe"], "the only ingredient was unknown, so the recipe is empty")
        self.assertEqual(len(flagged["ingredientWarnings"]), 1)
        self.assertEqual(flagged["ingredientWarnings"][0]["status"], "missing")
        self.assertEqual(flagged["ingredientWarnings"][0]["requested"], "Ghost")

    def test_validate_product_proposal_passes_through_substitution_warning(self):
        # The model flags a requested-but-absent ingredient (mango) and the catalog
        # substitute it used; the validator keeps the advisory so the UI can warn.
        controller = BayaanKioskApi()
        report_pack = {"catalogReference": {
            "ingredients": [
                {"id": str(self.ingredient_orange.id), "code": "ING-ORANGE", "name": "Orange", "uom": self.uom_kgm.name},
            ],
            "uoms": [{"id": str(self.uom_kgm.id), "name": self.uom_kgm.name}],
        }}
        proposal = controller._ai_validate_product_proposal({
            "name": "Mango Juice",
            "consumptionMode": "recipe",
            "uom": "Units",
            "category": "Juice",
            "listPrice": 5000,
            "standardPrice": 0,
            "availableInPos": True,
            "sizes": ["Small", "Medium", "Large"],
            "modifierGroups": [],
            "modeRationale": "kiosk-made juice",
            "ingredientWarnings": [
                {"requested": "mango", "status": "substituted", "substitutedWithCode": "ING-ORANGE", "note": "no mango in catalog"},
            ],
            "recipe": {
                "ingredients": [{"ingredientId": "ING-ORANGE", "ingredientName": "Orange", "qty": 0.25, "uom": self.uom_kgm.name}],
                "wasteAllowancePercent": 0,
            },
        }, report_pack)
        self.assertIsNotNone(proposal)
        self.assertEqual(len(proposal["ingredientWarnings"]), 1)
        warn = proposal["ingredientWarnings"][0]
        self.assertEqual(warn["status"], "substituted")
        self.assertEqual(warn["requested"], "mango")
        self.assertEqual(warn["substitutedWithCode"], "ING-ORANGE")
