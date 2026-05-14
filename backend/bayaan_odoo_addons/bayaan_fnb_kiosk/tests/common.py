from datetime import datetime, timedelta

from odoo.tests.common import TransactionCase


class BayaanTestBase(TransactionCase):
    """Shared fixtures for Bayaan addon tests.

    Builds a minimal but realistic kiosk + recipe + ingredients setup so the
    variance-loop tests don't each duplicate ten lines of setup.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.uom_unit = cls.env.ref("uom.product_uom_unit")
        cls.uom_kgm = cls.env.ref("uom.product_uom_kgm")

        # Stock locations: a central warehouse + a kiosk-specific internal location.
        cls.warehouse = cls.env["stock.warehouse"].search(
            [("company_id", "=", cls.company.id)], limit=1
        )
        cls.kiosk_location = cls.env["stock.location"].create({
            "name": "Kiosk K-TEST Location",
            "usage": "internal",
            "location_id": cls.warehouse.view_location_id.id,
            "company_id": cls.company.id,
        })

        # POS config bound to the kiosk location. Use explicit test journals and
        # a journal-less payment method so clean databases without a chart of
        # accounts can load POS without triggering default bank-journal setup.
        cls.pos_journal = cls.env["account.journal"]._ensure_company_account_journal()
        cls.invoice_journal = cls.env["account.journal"].search([
            ("code", "=", "BTST"),
            ("company_id", "=", cls.company.id),
        ], limit=1)
        if not cls.invoice_journal:
            cls.invoice_journal = cls.env["account.journal"].create({
                "name": "Bayaan Test Sales",
                "code": "BTST",
                "type": "sale",
                "company_id": cls.company.id,
            })
        cls.test_payment_method = cls.env["pos.payment.method"].create({
            "name": "Bayaan Test Pay Later",
            "company_id": cls.company.id,
        })
        cls.pos_config = cls.env["pos.config"].create({
            "name": "K-TEST POS",
            "company_id": cls.company.id,
            "journal_id": cls.pos_journal.id,
            "invoice_journal_id": cls.invoice_journal.id,
            "payment_method_ids": [(6, 0, [cls.test_payment_method.id])],
        })
        # Wire the POS picking type to use the kiosk location as source.
        cls.pos_config.picking_type_id.default_location_src_id = cls.kiosk_location

        cls.kiosk = cls.env["bayaan.kiosk"].create({
            "name": "Karrada Test Kiosk",
            "kiosk_code": "K-TEST",
            "pos_config_id": cls.pos_config.id,
            "stock_location_id": cls.kiosk_location.id,
            "stock_deduction_policy": "warning",
            "company_id": cls.company.id,
        })

        # Ingredients (orange, sugar, cup) and a sellable product (orange juice).
        cls.ingredient_orange = cls.env["product.product"].create({
            "name": "Orange",
            "type": "consu",
            "is_storable": True,
            "uom_id": cls.uom_kgm.id,
            "standard_price": 1500.0,
            "default_code": "ING-ORANGE",
            "bayaan_consumption_mode": "none",
        })
        cls.ingredient_sugar = cls.env["product.product"].create({
            "name": "Sugar",
            "type": "consu",
            "is_storable": True,
            "uom_id": cls.uom_kgm.id,
            "standard_price": 800.0,
            "default_code": "ING-SUGAR",
            "bayaan_consumption_mode": "none",
        })
        cls.ingredient_cup = cls.env["product.product"].create({
            "name": "Cup 12oz",
            "type": "consu",
            "is_storable": True,
            "uom_id": cls.uom_unit.id,
            "standard_price": 200.0,
            "default_code": "ING-CUP",
            "bayaan_consumption_mode": "none",
        })

        cls.product_orange_juice = cls.env["product.product"].create({
            "name": "Orange Juice",
            "type": "consu",
            "list_price": 5500.0,
            "available_in_pos": True,
            "default_code": "MENU-OJ",
            "bayaan_consumption_mode": "recipe",
        })

        # Stock the kiosk location with starting quantities.
        Quant = cls.env["stock.quant"].sudo()
        Quant._update_available_quantity(cls.ingredient_orange, cls.kiosk_location, 50.0)
        Quant._update_available_quantity(cls.ingredient_sugar, cls.kiosk_location, 5.0)
        Quant._update_available_quantity(cls.ingredient_cup, cls.kiosk_location, 200.0)

        # Active recipe: 1 OJ = 0.3kg orange + 0.02kg sugar + 1 cup
        cls.recipe_v1 = cls.env["bayaan.recipe"].create({
            "product_id": cls.product_orange_juice.id,
            "version_label": "v1",
            "effective_from": datetime.now() - timedelta(days=30),
            "company_id": cls.company.id,
            "line_ids": [
                (0, 0, {
                    "ingredient_id": cls.ingredient_orange.id,
                    "qty": 0.3,
                    "uom_id": cls.uom_kgm.id,
                }),
                (0, 0, {
                    "ingredient_id": cls.ingredient_sugar.id,
                    "qty": 0.02,
                    "uom_id": cls.uom_kgm.id,
                }),
                (0, 0, {
                    "ingredient_id": cls.ingredient_cup.id,
                    "qty": 1.0,
                    "uom_id": cls.uom_unit.id,
                }),
            ],
        })
        cls.recipe_v1.action_activate()
