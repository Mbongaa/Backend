from odoo.tests.common import HttpCase, tagged

from odoo.addons.bayaan_fnb_kiosk.controllers.api import BayaanKioskApi

from .common import BayaanTestBase


@tagged("post_install", "-at_install")
class TestInvoiceCommit(BayaanTestBase, HttpCase):
    """AI-scanned supplier invoice -> supplier + PO + warehouse receipt.

    The AI only transcribes a draft; the deterministic /invoice_commit route does
    the atomic supplier+PO+receipt. It must increase warehouse stock, refuse a
    receipt against an unmatched product (and write nothing), and enforce
    procurement scope.
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

    # --- the proposal validator (no HTTP) -------------------------------------

    def test_validate_invoice_proposal_blanks_unknown_product(self):
        controller = BayaanKioskApi()
        index = {"ing-orange": self.ingredient_orange, "orange": self.ingredient_orange}
        proposal = {
            "extractable": True,
            "supplier": {"name": "Test Supplier", "address": "", "category": ""},
            "invoiceRef": "INV-1", "invoiceDate": "", "currency": "IQD", "warehouseHint": "",
            "lines": [
                {"description": "Fresh oranges", "matchedProductCode": "ING-ORANGE", "qty": 5, "unitPrice": 1500},
                {"description": "Mystery item", "matchedProductCode": "ING-NOPE", "qty": 2, "unitPrice": 900},
            ],
            "totals": {"subtotal": 9300, "tax": 0, "total": 9300},
            "notes": "",
        }
        result = controller._ai_validate_invoice_proposal(proposal, index)
        self.assertEqual(result["lines"][0]["matchedProductId"], str(self.ingredient_orange.id))
        # An ingredient the model was not shown is blanked; the human must map or
        # create it, so a hallucinated product can never reach a receipt.
        self.assertEqual(result["lines"][1]["matchedProductId"], "")
        # Numbers pass through as editable drafts.
        self.assertEqual(result["lines"][0]["qty"], 5.0)

    def test_validate_invoice_proposal_handles_unreadable_image(self):
        controller = BayaanKioskApi()
        result = controller._ai_validate_invoice_proposal({"extractable": False, "notes": "blurry"}, {})
        self.assertEqual(result["extractable"], False)
        self.assertEqual(result["lines"], [])

    # --- the deterministic commit route ---------------------------------------

    def test_invoice_commit_creates_supplier_po_and_receives_stock(self):
        cup = self.ingredient_cup
        before = cup.sudo().qty_available
        response = self._jsonrpc("/bayaan/api/invoice_commit", {
            "supplier": {"name": "Baghdad Cup Co", "address": "Karrada", "category": "Packaging"},
            "lines": [{"productId": "ING-CUP", "qty": 24, "unitPrice": 210}],
        })
        if "error" in response:
            self.fail("invoice_commit errored: %s" % response["error"])
        result = response["result"]
        self.assertTrue(result.get("po_id"))
        self.assertEqual(result.get("state"), "purchase")
        self.assertEqual(result.get("receipt_state"), "done")

        partner = self.env["res.partner"].search([("name", "=", "Baghdad Cup Co")], limit=1)
        self.assertTrue(partner, "supplier should be created")
        self.assertEqual(partner.bayaan_supplier_category, "Packaging")

        cup.invalidate_recordset()
        self.assertAlmostEqual(cup.sudo().qty_available, before + 24, places=2)

    def test_invoice_commit_resolves_numeric_string_product_id(self):
        # The real invoice draft form sends the matched product's Odoo id as a STRING
        # (matchedProductId). It must resolve, not hit the "Product not found" wall.
        cup = self.ingredient_cup
        before = cup.sudo().qty_available
        response = self._jsonrpc("/bayaan/api/invoice_commit", {
            "supplier": {"name": "Numeric Cup Co"},
            "lines": [{"productId": str(cup.id), "qty": 10, "unitPrice": 200}],
        })
        if "error" in response:
            self.fail("numeric-string productId must resolve, not error: %s" % response["error"])
        self.assertTrue(response["result"].get("po_id"))
        cup.invalidate_recordset()
        self.assertAlmostEqual(cup.sudo().qty_available, before + 10, places=2)

    def test_invoice_commit_is_idempotent_on_repeated_vendor_ref(self):
        # A retry / double-confirm of the same vendor invoice must not create a second
        # PO + receipt (which would double warehouse stock).
        cup = self.ingredient_cup
        before = cup.sudo().qty_available
        payload = {
            "supplier": {"name": "Idem Supplier"},
            "invoice_ref": "INV-IDEM-001",
            "lines": [{"productId": str(cup.id), "qty": 12, "unitPrice": 150}],
        }
        first = self._jsonrpc("/bayaan/api/invoice_commit", payload)
        if "error" in first:
            self.fail("first invoice_commit errored: %s" % first["error"])
        second = self._jsonrpc("/bayaan/api/invoice_commit", payload)
        if "error" in second:
            self.fail("second invoice_commit errored: %s" % second["error"])
        self.assertTrue(second["result"].get("idempotent"), "repeat must be flagged idempotent")
        self.assertEqual(first["result"]["po_id"], second["result"]["po_id"])
        cup.invalidate_recordset()
        # Stock increased only ONCE despite two commit calls.
        self.assertAlmostEqual(cup.sudo().qty_available, before + 12, places=2)

    def test_invoice_commit_rejects_foreign_currency(self):
        # A non-company-currency invoice is refused rather than booked verbatim.
        company_currency = self.company.currency_id.name
        foreign = "EUR" if company_currency != "EUR" else "USD"
        response = self._jsonrpc("/bayaan/api/invoice_commit", {
            "supplier": {"name": "Foreign Currency Supplier"},
            "currency": foreign,
            "lines": [{"productId": str(self.ingredient_cup.id), "qty": 1, "unitPrice": 5}],
        })
        self.assertIn("error", response)

    def test_invoice_commit_rejects_unknown_product_with_no_writes(self):
        before = self.env["res.partner"].search_count([("name", "=", "Ghost Supplier")])
        response = self._jsonrpc("/bayaan/api/invoice_commit", {
            "supplier": {"name": "Ghost Supplier"},
            "lines": [{"productId": "ING-DOES-NOT-EXIST", "qty": 5, "unitPrice": 100}],
        })
        self.assertIn("error", response)
        # Pre-flight raises before any write -> the supplier is never created.
        self.assertEqual(self.env["res.partner"].search_count([("name", "=", "Ghost Supplier")]), before)

    def test_invoice_commit_requires_procurement_scope(self):
        self._create_user("bayaan_invoice_cashier", "bayaan_fnb_kiosk.group_bayaan_cashier")
        self.authenticate("bayaan_invoice_cashier", "test")
        response = self._jsonrpc("/bayaan/api/invoice_commit", {
            "supplier": {"name": "Scope Test Supplier"},
            "lines": [{"productId": "ING-CUP", "qty": 1, "unitPrice": 100}],
        })
        self.assertIn("error", response)
        self.authenticate("admin", "admin")
        self.assertEqual(self.env["res.partner"].search_count([("name", "=", "Scope Test Supplier")]), 0)
