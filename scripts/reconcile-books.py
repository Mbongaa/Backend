"""Read-only reconciliation evidence for the Bayaan accounting demo.

Run against the LIVE bayaan DB through the Odoo shell (never writes):

    ~/bayaan-venv/bin/python ~/bayaan-odoo/odoo-bin shell -c ~/bayaan-odoo.conf \
        -d bayaan --no-http < scripts/reconcile-books.py

It ties the operational source rows (pos.order, consumption ledger, waste,
payroll, opex, vendor bills) to the posted Odoo ledger and prints the headline
balances the remediation handoff requires. It must NOT repair the database.
"""

from odoo import fields  # noqa: F401  (available in the shell env)


def _money(value):
    return "{:,.2f}".format(round(value or 0.0, 2))


def main(env):
    company = env.company
    AML = env["account.move.line"].sudo()
    AM = env["account.move"].sudo()
    PosOrder = env["pos.order"].sudo()
    Session = env["pos.session"].sudo()

    today = fields.Date.context_today(env.user)
    month_start = today.replace(day=1)
    print("=" * 72)
    print("BAYAAN RECONCILIATION  company=%s  period=%s..%s" % (company.name, month_start, today))
    print("=" * 72)

    def acct(code):
        return env["account.account"].sudo().with_context(active_test=False).search([("code", "=", code)], limit=1)

    def posted_net(code, dfrom=None, dto=None):
        account = acct(code)
        if not account:
            return 0.0
        dom = [("account_id", "=", account.id), ("parent_state", "=", "posted"), ("company_id", "=", company.id)]
        if dfrom:
            dom.append(("date", ">=", dfrom))
        if dto:
            dom.append(("date", "<=", dto))
        rows = AML._read_group(dom, aggregates=["debit:sum", "credit:sum"])
        d, c = (rows[0] if rows else (0.0, 0.0))
        return round((d or 0.0) - (c or 0.0), 2)

    # --- 1. POS gross sales vs posted revenue ------------------------------
    paid = PosOrder.search([("company_id", "=", company.id), ("state", "in", ("paid", "done", "invoiced"))])
    gross = sum(p.amount_total for p in paid)
    tax_total = sum(p.amount_tax for p in paid)
    print("\n[1] POS orders: %d paid   gross=%s   tax=%s   net=%s"
          % (len(paid), _money(gross), _money(tax_total), _money(gross - tax_total)))
    revenue_posted = -posted_net("400000")   # income is a credit
    vat_posted = -posted_net("251000")       # VAT payable is a credit
    print("    Posted Product Sales (400000) credit = %s" % _money(revenue_posted))
    print("    Posted VAT Payable   (251000) credit = %s" % _money(vat_posted))
    print("    revenue + VAT = %s  (POS gross = %s)  -> %s"
          % (_money(revenue_posted + vat_posted), _money(gross),
             "TIE" if abs(revenue_posted + vat_posted - gross) < 1.0 else "DIFF"))

    # --- 2. COGS / inventory / waste ---------------------------------------
    cogs = posted_net("500000")
    waste = posted_net("605000")
    inventory = posted_net("115000")
    print("\n[2] COGS (500000) debit = %s   Waste (605000) debit = %s   Inventory (115000) balance = %s"
          % (_money(cogs), _money(waste), _money(inventory)))

    # --- 3. Payroll / opex / AP --------------------------------------------
    wages = posted_net("601000")
    ap = -posted_net("211000")  # AP is a credit balance
    print("\n[3] Salaries (601000) debit = %s   Accounts Payable (211000) credit balance = %s"
          % (_money(wages), _money(ap)))

    # --- 4. Trial balance ---------------------------------------------------
    tb = AML._read_group(
        [("parent_state", "=", "posted"), ("company_id", "=", company.id)],
        aggregates=["debit:sum", "credit:sum"])
    tdeb, tcred = (tb[0] if tb else (0.0, 0.0))
    print("\n[4] Trial balance: debit=%s  credit=%s  -> %s"
          % (_money(tdeb), _money(tcred), "BALANCED" if abs((tdeb or 0) - (tcred or 0)) < 1.0 else "OUT OF BALANCE"))

    # --- 5. Balance sheet (assets vs liabilities+equity) -------------------
    def type_net(types):
        accs = env["account.account"].sudo().search([("account_type", "in", types)])
        if not accs:
            return 0.0
        rows = AML._read_group(
            [("account_id", "in", accs.ids), ("parent_state", "=", "posted"), ("company_id", "=", company.id)],
            aggregates=["debit:sum", "credit:sum"])
        d, c = (rows[0] if rows else (0.0, 0.0))
        return round((d or 0.0) - (c or 0.0), 2)

    assets = type_net(["asset_cash", "asset_current", "asset_non_current", "asset_fixed",
                       "asset_receivable", "asset_prepayments"])
    liabilities = -type_net(["liability_payable", "liability_current", "liability_non_current", "liability_credit_card"])
    equity = -type_net(["equity", "equity_unaffected"])
    income = -type_net(["income", "income_other"])
    expense = type_net(["expense", "expense_depreciation", "expense_direct_cost"])
    net_income = round(income - expense, 2)
    print("\n[5] Assets=%s   Liabilities=%s   Equity=%s   NetIncome(P&L)=%s"
          % (_money(assets), _money(liabilities), _money(equity), _money(net_income)))
    le_plus_ni = round(liabilities + equity + net_income, 2)
    print("    Assets vs (Liab + Equity + NetIncome) = %s vs %s -> %s"
          % (_money(assets), _money(le_plus_ni), "TIE" if abs(assets - le_plus_ni) < 1.0 else "DIFF"))

    # --- 6. Cash/bank closing ----------------------------------------------
    cash_bal = type_net(["asset_cash"])
    print("\n[6] Cash/Bank (asset_cash) closing balance = %s" % _money(cash_bal))

    # --- 7. Every closed session with paid orders has its OFFICIAL Odoo move --
    closed = Session.search([("state", "=", "closed"), ("config_id.company_id", "=", company.id)])
    missing = sum(1 for s in closed
                  if s.order_ids.filtered(lambda o: o.state in ("paid", "done", "invoiced")) and not s.move_id)
    with_move = sum(1 for s in closed if s.move_id)
    print("\n[7] Closed POS sessions=%d  with native session move=%d  paid sessions MISSING a move=%d -> %s"
          % (len(closed), with_move, missing, "OK" if missing == 0 else "GAP"))

    # --- 8. Single revenue source: revenue comes from the OFFICIAL session moves,
    #        and there must be NO legacy 'Bayaan Sales' move (that would double-count) --
    bayaan_sales = AM.search_count([("company_id", "=", company.id), ("ref", "=like", "Bayaan Sales%")])
    print("[8] Legacy 'Bayaan Sales' revenue moves (must be 0 — revenue is the native close) = %d -> %s"
          % (bayaan_sales, "OK (single revenue source)" if bayaan_sales == 0 else "DOUBLE-COUNT RISK"))
    print("\n" + "=" * 72)


main(env)  # noqa: F821  (env is injected by the Odoo shell)
