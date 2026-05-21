import { describe, expect, it } from "vitest";

import { buildReceiptHtml } from "./receipt";

describe("receipt rendering", () => {
  it("prints a queued receipt with the local external id and line totals", () => {
    const html = buildReceiptHtml({
      id: "BAYAAN-K-01-1700000000000",
      kioskId: "K-01",
      cashier: "Maya Ahmed",
      tender: "cash",
      status: "queued",
      total: 14500,
      cashGiven: 20000,
      change: 5500,
      printedAt: new Date("2026-05-20T10:30:00.000Z"),
      lines: [
        { name: "Latte", size: "M", qty: 2, price: 4500 },
        { name: "Orange", size: "L", qty: 1, price: 5500 },
      ],
    });

    expect(html).toContain("Receipt BAYAAN-K-01-1700000000000");
    expect(html).toContain("Saved offline");
    expect(html).toContain("Latte M");
    expect(html).toContain("9,000");
    expect(html).toContain("14,500");
    expect(html).toContain("5,500");
  });

  it("escapes receipt line text before printing", () => {
    const html = buildReceiptHtml({
      id: "safe",
      total: 1,
      lines: [{ name: "<script>alert(1)</script>", qty: 1, price: 1 }],
    });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
