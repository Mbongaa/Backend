from datetime import datetime, time, timedelta

from odoo import api, fields, models


class BayaanDemoSeed(models.AbstractModel):
    _name = "bayaan.demo.seed"
    _description = "Bayaan realistic demo catalog seed"

    SUPPLIERS = [
        ("Baghdad Dairy", "Dairy", "Karrada, Baghdad", "Same day"),
        ("Babel Roasters", "Coffee", "Erbil industrial zone", "Weekly"),
        ("Najaf Fresh", "Produce", "Najaf wholesale market", "Next morning"),
        ("Iraq Pack", "Packaging", "Baghdad industrial area", "Weekly"),
        ("Tigris Bakery", "Bakery", "Al Jadriya, Baghdad", "Next morning"),
        ("Mesopotamia Foods", "Bakery / Nuts", "Mansour, Baghdad", "2-3 days"),
        ("Erbil Syrups", "Syrups", "Erbil", "2-3 days"),
    ]

    STOCK_ITEMS = [
        ("ING-MILK-1L", "Milk (whole) 1L", "Dairy", "uom.product_uom_litre", 3500, "Baghdad Dairy", 720, 36),
        ("ING-OAT-MILK-1L", "Oat milk 1L", "Dairy", "uom.product_uom_litre", 5200, "Baghdad Dairy", 288, 12),
        ("ING-CONDENSED-MILK", "Condensed milk", "Dairy", "uom.product_uom_kgm", 8500, "Baghdad Dairy", 15, 1.2),
        ("ING-COFFEE-HOUSE", "Espresso beans - house", "Coffee", "uom.product_uom_kgm", 42000, "Babel Roasters", 90, 7),
        ("ING-COLD-BREW", "Cold brew concentrate", "Coffee", "uom.product_uom_litre", 9500, "Babel Roasters", 24, 3),
        ("ING-PISTACHIO-PASTE", "Pistachio paste", "Bakery", "uom.product_uom_kgm", 262500, "Mesopotamia Foods", 18, 1.2),
        ("ING-CHOCOLATE-70", "Chocolate - 70%", "Bakery", "uom.product_uom_kgm", 18000, "Mesopotamia Foods", 24, 2),
        ("ING-CHOCOLATE-SAUCE", "Chocolate sauce 1L", "Syrups", "uom.product_uom_litre", 7000, "Erbil Syrups", 18, 1.5),
        ("ING-VANILLA-SYRUP", "Vanilla syrup 750ml", "Syrups", "uom.product_uom_litre", 6000, "Erbil Syrups", 13.5, 1.2),
        ("ING-SUGAR", "Sugar", "Pantry", "uom.product_uom_kgm", 800, "Mesopotamia Foods", 90, 6),
        ("ING-ICE", "Ice", "Prep", "uom.product_uom_kgm", 200, "Baghdad Dairy", 240, 20),
        ("ING-ORANGE", "Oranges", "Produce", "uom.product_uom_kgm", 1500, "Najaf Fresh", 160, 24),
        ("ING-MANGO-PULP", "Mango pulp", "Produce", "uom.product_uom_kgm", 4200, "Najaf Fresh", 48, 8),
        ("ING-STRAWBERRY-PUREE", "Strawberry puree", "Produce", "uom.product_uom_kgm", 4800, "Najaf Fresh", 48, 8),
        ("ING-AVOCADO", "Avocado", "Produce", "uom.product_uom_kgm", 5200, "Najaf Fresh", 42, 7),
        ("ING-LEMON", "Lemons", "Produce", "uom.product_uom_kgm", 1800, "Najaf Fresh", 44, 8),
        ("ING-MINT", "Mint - fresh", "Produce", "uom.product_uom_kgm", 175000, "Najaf Fresh", 12, 1.5),
        ("ING-HONEY", "Honey", "Pantry", "uom.product_uom_kgm", 6500, "Mesopotamia Foods", 14, 1),
        ("ING-CUP-12", "Cups 12oz", "Packaging", "uom.product_uom_unit", 700, "Iraq Pack", 5000, 700),
        ("ING-CUP-16", "Cups 16oz", "Packaging", "uom.product_uom_unit", 900, "Iraq Pack", 4500, 600),
        ("ING-STRAW", "Straws", "Packaging", "uom.product_uom_unit", 60, "Iraq Pack", 6000, 800),
        ("ING-CROISSANT-PLAIN", "Croissant - frozen", "Bakery", "uom.product_uom_unit", 7000, "Tigris Bakery", 140, 18),
        ("ING-CROISSANT-CHOC", "Croissant - chocolate frozen", "Bakery", "uom.product_uom_unit", 7800, "Tigris Bakery", 110, 16),
        ("ING-CROISSANT-ALMOND", "Croissant - almond frozen", "Bakery", "uom.product_uom_unit", 8500, "Tigris Bakery", 90, 14),
        ("ING-CINNAMON-ROLL", "Cinnamon roll - frozen", "Bakery", "uom.product_uom_unit", 7200, "Tigris Bakery", 90, 14),
        ("ING-ZAATAR-MANAKEESH", "Za'atar manakeesh - frozen", "Bakery", "uom.product_uom_unit", 6500, "Tigris Bakery", 80, 12),
        ("ING-PISTACHIO-CAKE-BASE", "Pistachio cake base", "Cake", "uom.product_uom_unit", 6500, "Mesopotamia Foods", 60, 8),
        ("ING-CHOC-FONDANT-BASE", "Chocolate fondant base", "Cake", "uom.product_uom_unit", 5800, "Mesopotamia Foods", 50, 7),
        ("ING-CHEESECAKE-BASE", "Cheesecake base", "Cake", "uom.product_uom_unit", 5200, "Mesopotamia Foods", 55, 7),
        ("ING-CARROT-CAKE-BASE", "Carrot cake base", "Cake", "uom.product_uom_unit", 4300, "Mesopotamia Foods", 45, 6),
        ("ING-TIRAMISU-CUP", "Tiramisu cup", "Cake", "uom.product_uom_unit", 5400, "Mesopotamia Foods", 45, 6),
        ("ING-LOTUS-CAKE-BASE", "Lotus cake base", "Cake", "uom.product_uom_unit", 5000, "Mesopotamia Foods", 50, 7),
        ("ING-LOTUS-SPREAD", "Lotus biscuit spread", "Cake", "uom.product_uom_kgm", 9000, "Mesopotamia Foods", 12, 1),
        ("ING-CREAM-CHEESE", "Cream cheese", "Cake", "uom.product_uom_kgm", 7800, "Mesopotamia Foods", 18, 1.5),
    ]

    MENU_ITEMS = [
        ("MENU-ESPRESSO", "Espresso", "Hot Coffee", 4000),
        ("MENU-AMERICANO", "Americano", "Hot Coffee", 5500),
        ("MENU-FLAT-WHITE", "Flat White", "Hot Coffee", 7000),
        ("MENU-LATTE", "Latte", "Hot Coffee", 7500),
        ("MENU-CAPPUCCINO", "Cappuccino", "Hot Coffee", 7500),
        ("MENU-CORTADO", "Cortado", "Hot Coffee", 6500),
        ("MENU-MOCHA", "Mocha", "Hot Coffee", 8000),
        ("MENU-SPANISH-LATTE", "Spanish Latte", "Hot Coffee", 8500),
        ("MENU-ICED-AMERICANO", "Iced Americano", "Iced Coffee", 6500),
        ("MENU-ICED-LATTE", "Iced Latte", "Iced Coffee", 8000),
        ("MENU-ICED-MOCHA", "Iced Mocha", "Iced Coffee", 8500),
        ("MENU-COLD-BREW", "Cold Brew", "Iced Coffee", 9000),
        ("MENU-ICED-SPANISH", "Iced Spanish", "Iced Coffee", 9000),
        ("MENU-OJ", "Orange Juice 350ml", "Juice", 7500),
        ("MENU-MANGO-JUICE", "Mango Juice", "Juice", 8000),
        ("MENU-STRAWBERRY-JUICE", "Strawberry Juice", "Juice", 8000),
        ("MENU-AVOCADO-JUICE", "Avocado Juice", "Juice", 9000),
        ("MENU-MINT-LEMONADE", "Mint Lemonade", "Juice", 7500),
        ("MENU-PISTACHIO-CAKE", "Pistachio Cake", "Dessert", 11000),
        ("MENU-CHOC-FONDANT", "Chocolate Fondant", "Dessert", 10000),
        ("MENU-CHEESECAKE", "Cheesecake", "Dessert", 9500),
        ("MENU-CARROT-CAKE", "Carrot Cake", "Dessert", 8500),
        ("MENU-TIRAMISU", "Tiramisu", "Dessert", 10000),
        ("MENU-LOTUS-CAKE", "Lotus Cake", "Dessert", 9500),
        ("MENU-CROISSANT-PLAIN", "Croissant - Plain", "Bakery", 4500),
        ("MENU-CROISSANT-CHOC", "Croissant - Chocolate", "Bakery", 5000),
        ("MENU-CROISSANT-ALMOND", "Croissant - Almond", "Bakery", 5500),
        ("MENU-CINNAMON-ROLL", "Cinnamon Roll", "Bakery", 5000),
        ("MENU-ZAATAR-MANAKEESH", "Za'atar Manakeesh", "Bakery", 4500),
    ]

    RECIPES = {
        "MENU-ESPRESSO": [("ING-COFFEE-HOUSE", 0.018), ("ING-CUP-12", 1)],
        "MENU-AMERICANO": [("ING-COFFEE-HOUSE", 0.020), ("ING-CUP-12", 1)],
        "MENU-FLAT-WHITE": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.18), ("ING-CUP-12", 1)],
        "MENU-LATTE": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.22), ("ING-CUP-12", 1)],
        "MENU-CAPPUCCINO": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.18), ("ING-CUP-12", 1)],
        "MENU-CORTADO": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.08), ("ING-CUP-12", 1)],
        "MENU-MOCHA": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.18), ("ING-CHOCOLATE-SAUCE", 0.03), ("ING-CUP-12", 1)],
        "MENU-SPANISH-LATTE": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.16), ("ING-CONDENSED-MILK", 0.025), ("ING-CUP-12", 1)],
        "MENU-ICED-AMERICANO": [("ING-COFFEE-HOUSE", 0.020), ("ING-ICE", 0.18), ("ING-CUP-16", 1)],
        "MENU-ICED-LATTE": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.24), ("ING-ICE", 0.16), ("ING-CUP-16", 1)],
        "MENU-ICED-MOCHA": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.20), ("ING-CHOCOLATE-SAUCE", 0.04), ("ING-ICE", 0.16), ("ING-CUP-16", 1)],
        "MENU-COLD-BREW": [("ING-COLD-BREW", 0.12), ("ING-ICE", 0.18), ("ING-CUP-16", 1)],
        "MENU-ICED-SPANISH": [("ING-COFFEE-HOUSE", 0.018), ("ING-MILK-1L", 0.20), ("ING-CONDENSED-MILK", 0.03), ("ING-ICE", 0.16), ("ING-CUP-16", 1)],
        "MENU-OJ": [("ING-ORANGE", 0.35), ("ING-SUGAR", 0.02), ("ING-CUP-16", 1), ("ING-STRAW", 1)],
        "MENU-MANGO-JUICE": [("ING-MANGO-PULP", 0.25), ("ING-SUGAR", 0.02), ("ING-CUP-16", 1), ("ING-STRAW", 1)],
        "MENU-STRAWBERRY-JUICE": [("ING-STRAWBERRY-PUREE", 0.24), ("ING-SUGAR", 0.02), ("ING-CUP-16", 1), ("ING-STRAW", 1)],
        "MENU-AVOCADO-JUICE": [("ING-AVOCADO", 0.28), ("ING-MILK-1L", 0.20), ("ING-HONEY", 0.02), ("ING-CUP-16", 1), ("ING-STRAW", 1)],
        "MENU-MINT-LEMONADE": [("ING-LEMON", 0.18), ("ING-MINT", 0.02), ("ING-SUGAR", 0.03), ("ING-CUP-16", 1), ("ING-STRAW", 1)],
        "MENU-PISTACHIO-CAKE": [("ING-PISTACHIO-CAKE-BASE", 1), ("ING-PISTACHIO-PASTE", 0.012), ("ING-CREAM-CHEESE", 0.04)],
        "MENU-CHOC-FONDANT": [("ING-CHOC-FONDANT-BASE", 1), ("ING-CHOCOLATE-70", 0.08)],
        "MENU-CHEESECAKE": [("ING-CHEESECAKE-BASE", 1), ("ING-CREAM-CHEESE", 0.06)],
        "MENU-CARROT-CAKE": [("ING-CARROT-CAKE-BASE", 1)],
        "MENU-TIRAMISU": [("ING-TIRAMISU-CUP", 1)],
        "MENU-LOTUS-CAKE": [("ING-LOTUS-CAKE-BASE", 1), ("ING-LOTUS-SPREAD", 0.04)],
        "MENU-CROISSANT-PLAIN": [("ING-CROISSANT-PLAIN", 1)],
        "MENU-CROISSANT-CHOC": [("ING-CROISSANT-CHOC", 1)],
        "MENU-CROISSANT-ALMOND": [("ING-CROISSANT-ALMOND", 1)],
        "MENU-CINNAMON-ROLL": [("ING-CINNAMON-ROLL", 1)],
        "MENU-ZAATAR-MANAKEESH": [("ING-ZAATAR-MANAKEESH", 1)],
    }

    OBSOLETE_POS_CODES = ["MENU-ICED-COFFEE", "MENU-CROISSANT"]

    @api.model
    def seed_full_catalog(self):
        suppliers_by_name = self._seed_suppliers()
        categories = self._seed_categories()
        products_by_code = self._seed_products(suppliers_by_name, categories)
        self._seed_recipes(products_by_code)
        self._hide_obsolete_demo_products()
        self._seed_stock(products_by_code)
        self._seed_shift_close_variance(products_by_code)
        return True

    def _seed_suppliers(self):
        Partner = self.env["res.partner"].sudo()
        suppliers = {}
        for name, category, street, delivery in self.SUPPLIERS:
            partner = Partner.search([("name", "=", name)], limit=1)
            vals = {
                "name": name,
                "company_type": "company",
                "supplier_rank": max(partner.supplier_rank, 1) if partner else 1,
                "street": street,
                "bayaan_supplier_category": category,
                "bayaan_delivery_category": delivery,
            }
            if partner:
                partner.write(vals)
            else:
                partner = Partner.create(vals)
            suppliers[name] = partner
        return suppliers

    def _seed_categories(self):
        ProductCategory = self.env["product.category"].sudo()
        root = self.env.ref("product.product_category_all", raise_if_not_found=False)
        categories = {}
        names = {item[2] for item in self.STOCK_ITEMS} | {item[2] for item in self.MENU_ITEMS}
        for name in sorted(names):
            domain = [("name", "=", name)]
            if root:
                domain.append(("parent_id", "=", root.id))
            category = ProductCategory.search(domain, limit=1)
            if not category:
                category = ProductCategory.create({
                    "name": name,
                    "parent_id": root.id if root else False,
                })
            categories[name] = category
        return categories

    def _seed_products(self, suppliers_by_name, categories):
        products_by_code = {}
        for code, name, category, uom_xmlid, cost, supplier, warehouse_qty, kiosk_qty in self.STOCK_ITEMS:
            products_by_code[code] = self._upsert_product(
                code=code,
                name=name,
                category=categories[category],
                uom_xmlid=uom_xmlid,
                cost=cost,
                list_price=cost,
                available_in_pos=False,
                consumption_mode="none",
                purchase_ok=True,
                sale_ok=False,
                supplier=suppliers_by_name.get(supplier),
                warehouse_qty=warehouse_qty,
                kiosk_qty=kiosk_qty,
            )
        for code, name, category, price in self.MENU_ITEMS:
            products_by_code[code] = self._upsert_product(
                code=code,
                name=name,
                category=categories[category],
                uom_xmlid="uom.product_uom_unit",
                cost=0,
                list_price=price,
                available_in_pos=True,
                consumption_mode="recipe",
                purchase_ok=False,
                sale_ok=True,
            )
        return products_by_code

    def _upsert_product(
        self,
        code,
        name,
        category,
        uom_xmlid,
        cost,
        list_price,
        available_in_pos,
        consumption_mode,
        purchase_ok,
        sale_ok,
        supplier=False,
        warehouse_qty=0.0,
        kiosk_qty=0.0,
    ):
        Product = self.env["product.product"].sudo()
        uom = self.env.ref(uom_xmlid)
        product = Product.search([("default_code", "=", code)], limit=1)
        vals = {
            "name": name,
            "default_code": code,
            "type": "consu",
            "is_storable": True,
            "categ_id": category.id,
            "standard_price": cost,
            "list_price": list_price,
            "available_in_pos": available_in_pos,
            "bayaan_consumption_mode": consumption_mode,
            "purchase_ok": purchase_ok,
            "sale_ok": sale_ok,
        }
        if product:
            vals.update(self._safe_uom_vals(product, uom))
            product.write(vals)
        else:
            vals.update({"uom_id": uom.id})
            product = Product.create(vals)
        if supplier:
            self._ensure_supplierinfo(product, supplier, cost)
        return product

    def _safe_uom_vals(self, product, target_uom):
        if product.uom_id == target_uom:
            return {}
        StockMove = self.env["stock.move"].sudo()
        MoveLine = self.env["stock.move.line"].sudo()
        has_moves = (
            StockMove.search_count([("product_id", "=", product.id)], limit=1)
            or MoveLine.search_count([("product_id", "=", product.id)], limit=1)
        )
        if has_moves:
            return {}
        return {"uom_id": target_uom.id}

    def _ensure_supplierinfo(self, product, supplier, price):
        SupplierInfo = self.env["product.supplierinfo"].sudo()
        info = SupplierInfo.search([
            ("partner_id", "=", supplier.id),
            ("product_tmpl_id", "=", product.product_tmpl_id.id),
        ], limit=1)
        vals = {
            "partner_id": supplier.id,
            "product_tmpl_id": product.product_tmpl_id.id,
            "min_qty": 1.0,
            "price": price,
        }
        if info:
            info.write(vals)
        else:
            SupplierInfo.create(vals)

    def _seed_recipes(self, products_by_code):
        Recipe = self.env["bayaan.recipe"].sudo()
        effective_from = fields.Datetime.now() - timedelta(days=30)
        for menu_code, lines in self.RECIPES.items():
            product = products_by_code[menu_code]
            commands = []
            for ingredient_code, qty in lines:
                ingredient = products_by_code[ingredient_code]
                commands.append((0, 0, {
                    "ingredient_id": ingredient.id,
                    "qty": qty,
                    "uom_id": ingredient.uom_id.id,
                }))
            recipe = Recipe.search([
                ("product_id", "=", product.id),
                ("version_label", "=", "v1-realistic"),
            ], limit=1)
            vals = {
                "product_id": product.id,
                "version_label": "v1-realistic",
                "effective_from": effective_from,
                "waste_allowance_percent": 2.0,
                "state": "draft",
                "line_ids": [(5, 0, 0)] + commands,
            }
            if recipe:
                recipe.write(vals)
            else:
                recipe = Recipe.create(vals)
            recipe.action_activate()

    def _hide_obsolete_demo_products(self):
        products = self.env["product.product"].sudo().search([
            ("default_code", "in", self.OBSOLETE_POS_CODES),
        ])
        for product in products:
            product.write({
                "available_in_pos": False,
                "bayaan_consumption_mode": "none",
            })

    def _seed_stock(self, products_by_code):
        stock_targets = {
            code: (warehouse_qty, kiosk_qty)
            for code, _name, _category, _uom_xmlid, _cost, _supplier, warehouse_qty, kiosk_qty in self.STOCK_ITEMS
        }
        warehouses = self.env["stock.warehouse"].sudo().search([
            ("company_id", "=", self.env.company.id),
        ])
        for warehouse in warehouses:
            location = warehouse.lot_stock_id
            if not location:
                continue
            for code, product in products_by_code.items():
                target = stock_targets.get(code, (0.0, 0.0))[0]
                if target:
                    self._ensure_qty_at_least(product, location, target)

        kiosks = self.env["bayaan.kiosk"].sudo().search([
            ("company_id", "=", self.env.company.id),
            ("active", "=", True),
        ], order="kiosk_code")
        for index, kiosk in enumerate(kiosks):
            factor = max(0.55, 1.0 - (index * 0.08))
            for code, product in products_by_code.items():
                target = stock_targets.get(code, (0.0, 0.0))[1]
                if target and kiosk.stock_location_id:
                    self._ensure_qty_at_least(product, kiosk.stock_location_id, round(target * factor, 3))

    def _ensure_qty_at_least(self, product, location, target_qty):
        Quant = self.env["stock.quant"].sudo()
        current = Quant._get_available_quantity(
            product,
            location,
            strict=True,
            allow_negative=True,
        )
        if current < target_qty:
            Quant._update_available_quantity(product, location, target_qty - current)

    def _seed_shift_close_variance(self, products_by_code):
        kiosks = self.env["bayaan.kiosk"].sudo().search([
            ("company_id", "=", self.env.company.id),
            ("active", "=", True),
        ], order="kiosk_code")
        scenarios = [
            {
                "cash": (4180000, 4180000),
                "status": "none",
                "lines": [
                    ("ING-COFFEE-HOUSE", 6.4, 6.4, 3.0, 0.0, "matches expected"),
                    ("ING-MILK-1L", 18.0, 18.0, 18.0, 0.0, "matches expected"),
                    ("ING-CUP-12", 412.0, 410.0, 412.0, 4.0, "minor cup breakage"),
                ],
            },
            {
                "cash": (4854000, 4770000),
                "status": "open",
                "lines": [
                    ("ING-MINT", 1.8, 1.5, 1.1, 0.0, "negative mint variance"),
                    ("ING-LEMON", 6.4, 6.4, 3.6, 0.0, "matches expected"),
                    ("ING-CROISSANT-CHOC", 22.0, 8.0, 26.0, 14.0, "overproduction waste check"),
                    ("ING-CUP-12", 488.0, 485.0, 488.0, 3.0, "minor cup loss"),
                ],
            },
            {
                "cash": (2557000, 2415000),
                "status": "open",
                "lines": [
                    ("ING-ORANGE", 28.0, 26.6, 10.5, 1.5, "unexplained orange gap"),
                    ("ING-MILK-1L", 12.0, 9.0, 4.0, 0.0, "milk count short"),
                    ("ING-CUP-12", 267.0, 251.0, 267.0, 106.0, "cup variance requires review"),
                    ("ING-PISTACHIO-PASTE", 0.4, 0.2, 2.4, 0.2, "critical paste variance"),
                ],
            },
            {
                "cash": (2755000, 2755000),
                "status": "open",
                "lines": [
                    ("ING-ORANGE", 15.4, 14.7, 11.9, 0.7, "watch orange loss"),
                    ("ING-OAT-MILK-1L", 3.0, 3.0, 6.0, 0.0, "low but matched"),
                    ("ING-CUP-16", 256.0, 248.0, 298.0, 6.0, "cup count short"),
                ],
            },
        ]
        now = fields.Datetime.now()
        today = fields.Date.context_today(self.env.user)
        today_start = datetime.combine(today, time.min)
        opened_at = today_start + timedelta(hours=7)
        closed_at = max(now - timedelta(hours=1), today_start + timedelta(hours=10))
        Close = self.env["bayaan.shift.close"].sudo()
        for kiosk, scenario in zip(kiosks, scenarios):
            name = "BSC-DEMO-%s" % kiosk.kiosk_code
            existing = Close.search([("name", "=", name)])
            locked_existing = existing.filtered("locked_at")
            existing.filtered(lambda close: not close.locked_at).unlink()
            if locked_existing:
                continue
            expected_cash, actual_cash = scenario["cash"]
            line_commands = []
            ingredient_commands = []
            for code, expected, actual, consumed, waste, note in scenario["lines"]:
                product = products_by_code.get(code)
                if not product:
                    continue
                line_commands.append((0, 0, {
                    "product_id": product.id,
                    "uom_id": product.uom_id.id,
                    "expected_qty": expected,
                    "actual_qty": actual,
                    "note": note,
                }))
                opening = expected + consumed + waste
                ingredient_commands.append((0, 0, {
                    "ingredient_id": product.id,
                    "uom_id": product.uom_id.id,
                    "opening_qty": opening,
                    "received_qty": 0.0,
                    "consumed_qty": consumed,
                    "waste_qty": waste,
                    "actual_qty": actual,
                    "unit_cost": product.standard_price,
                }))
            Close.create({
                "name": name,
                "kiosk_id": kiosk.id,
                "cashier_id": kiosk.cashier_user_ids[:1].id or False,
                "opened_at": opened_at,
                "closed_at": closed_at,
                "opening_cash": 500000,
                "expected_cash": expected_cash,
                "actual_cash": actual_cash,
                "manager_review_state": "pending",
                "investigation_status": scenario["status"],
                "manager_note": "Seeded realistic demo close for stock variance testing.",
                "stock_count_line_ids": line_commands,
                "ingredient_variance_line_ids": ingredient_commands,
            })
