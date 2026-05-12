"""Provider-agnostic payment gateway catalog for Bayaan POS reporting.

Bayaan does not implement gateway settlement here. Odoo POS remains the source
of paid orders and payment rows; this catalog only classifies configured POS
payment methods so cash, cards, wallets, bank apps, QR, and manual transfers can
be reconciled separately.
"""

BAYAAN_PAYMENT_GATEWAYS = (
    {
        "id": "cash",
        "label": "Cash",
        "category": "cash",
        "kind": "cash_drawer",
        "settlement": "drawer_count",
        "aliases": ("cash",),
    },
    {
        "id": "bank_card",
        "label": "Bank card terminal",
        "category": "card",
        "kind": "card_terminal",
        "settlement": "bank_batch",
        "aliases": ("card", "visa", "mastercard", "master card", "terminal", "pos terminal"),
    },
    {
        "id": "generic_qr",
        "label": "Generic QR",
        "category": "qr",
        "kind": "qr",
        "settlement": "gateway_batch",
        "aliases": ("qr", "qr code", "qrcode"),
    },
    {
        "id": "zain_cash",
        "label": "Zain Cash",
        "category": "mobile_wallet",
        "kind": "wallet",
        "settlement": "gateway_batch",
        "aliases": ("zain cash", "zaincash", "zain wallet", "zain"),
    },
    {
        "id": "fib",
        "label": "FIB",
        "category": "bank_app",
        "kind": "bank_app",
        "settlement": "gateway_batch",
        "aliases": ("fib", "first iraqi bank", "first iraqi", "fib pay", "fib qr"),
    },
    {
        "id": "qi_card",
        "label": "Qi Card / SuperQi",
        "category": "card",
        "kind": "card_wallet",
        "settlement": "bank_batch",
        "aliases": ("qi card", "qicard", "superqi", "super qi", "qi"),
    },
    {
        "id": "nass_wallet",
        "label": "NassWallet / NASS Pay",
        "category": "mobile_wallet",
        "kind": "wallet",
        "settlement": "gateway_batch",
        "aliases": ("nasswallet", "nass wallet", "nasspay", "nass pay", "nass"),
    },
    {
        "id": "fastpay",
        "label": "FastPay",
        "category": "mobile_wallet",
        "kind": "wallet_qr",
        "settlement": "gateway_batch",
        "aliases": ("fastpay", "fast pay"),
    },
    {
        "id": "asia_hawala",
        "label": "AsiaHawala",
        "category": "mobile_wallet",
        "kind": "wallet",
        "settlement": "gateway_batch",
        "aliases": ("asiahawala", "asia hawala", "asiacell hawala", "asia wallet"),
    },
    {
        "id": "manual_bank_transfer",
        "label": "Manual bank transfer",
        "category": "manual_digital",
        "kind": "manual_transfer",
        "settlement": "manager_verified",
        "aliases": ("manual digital", "manual bank", "bank transfer", "transfer", "bank deposit"),
    },
    {
        "id": "other_digital",
        "label": "Other digital",
        "category": "digital_other",
        "kind": "other_digital",
        "settlement": "gateway_batch",
        "aliases": ("digital", "online", "e-payment", "epayment"),
    },
)

BAYAAN_PAYMENT_GATEWAY_BY_ID = {
    gateway["id"]: gateway for gateway in BAYAAN_PAYMENT_GATEWAYS
}

BAYAAN_PAYMENT_GATEWAY_SELECTION = [
    (gateway["id"], gateway["label"]) for gateway in BAYAAN_PAYMENT_GATEWAYS
]


def _normalized(value):
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


_ALIAS_INDEX = sorted(
    (
        (_normalized(alias), gateway)
        for gateway in BAYAAN_PAYMENT_GATEWAYS
        for alias in gateway["aliases"]
    ),
    key=lambda item: len(item[0]),
    reverse=True,
)


def serialize_payment_gateway_catalog():
    return [
        {
            "id": gateway["id"],
            "label": gateway["label"],
            "category": gateway["category"],
            "kind": gateway["kind"],
            "settlement": gateway["settlement"],
            "aliases": list(gateway["aliases"]),
        }
        for gateway in BAYAAN_PAYMENT_GATEWAYS
    ]


def classify_payment_gateway(
    method_name=None,
    configured_provider=None,
    payment_method_type=None,
    method_type=None,
):
    if configured_provider in BAYAAN_PAYMENT_GATEWAY_BY_ID:
        gateway = BAYAAN_PAYMENT_GATEWAY_BY_ID[configured_provider]
    elif method_type == "cash":
        gateway = BAYAAN_PAYMENT_GATEWAY_BY_ID["cash"]
    else:
        normalized_name = _normalized(method_name)
        gateway = next(
            (
                row_gateway
                for alias, row_gateway in _ALIAS_INDEX
                if alias and alias in normalized_name
            ),
            None,
        )
        if not gateway and payment_method_type == "qr_code":
            gateway = BAYAAN_PAYMENT_GATEWAY_BY_ID["generic_qr"]
        if not gateway:
            gateway = BAYAAN_PAYMENT_GATEWAY_BY_ID["other_digital"]

    return {
        "id": gateway["id"],
        "label": gateway["label"],
        "category": gateway["category"],
        "kind": gateway["kind"],
        "settlement": gateway["settlement"],
    }
