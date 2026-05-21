export type PosReceiptLine = {
  name: string;
  qty: number;
  price: number;
  size?: string | null;
};

export type PosReceiptStatus = "recorded" | "queued" | "blocked";

export type PosReceipt = {
  id?: string | number | null;
  kioskId?: string | null;
  cashier?: string | null;
  tender?: string | null;
  status?: PosReceiptStatus;
  total: number;
  cashGiven?: number | null;
  change?: number | null;
  lines: PosReceiptLine[];
  printedAt?: Date;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value || 0)));
}

function statusLabel(status: PosReceiptStatus | undefined): string {
  switch (status) {
    case "queued":
      return "Saved offline";
    case "blocked":
      return "Saved for review";
    default:
      return "Recorded";
  }
}

export function buildReceiptHtml(receipt: PosReceipt): string {
  const printedAt = receipt.printedAt ?? new Date();
  const receiptId = receipt.id ? String(receipt.id) : "LOCAL";
  const rows = receipt.lines.map((line) => {
    const label = [line.name, line.size].filter(Boolean).join(" ");
    const lineTotal = Number(line.qty || 0) * Number(line.price || 0);
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(line.qty)}</td>
        <td class="num">${formatMoney(lineTotal)}</td>
      </tr>`;
  }).join("");
  const cashRows = receipt.cashGiven != null && Number.isFinite(Number(receipt.cashGiven))
    ? `
      <tr><td>Cash</td><td></td><td class="num">${formatMoney(Number(receipt.cashGiven))}</td></tr>
      <tr><td>Change</td><td></td><td class="num">${formatMoney(Number(receipt.change || 0))}</td></tr>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bayaan receipt ${escapeHtml(receiptId)}</title>
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    * { box-sizing: border-box; }
    body { color: #111; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; }
    h1 { font-size: 17px; margin: 0 0 3px; }
    .muted { color: #555; }
    .status { border: 1px solid #111; display: inline-block; margin: 8px 0; padding: 2px 6px; }
    table { border-collapse: collapse; margin-top: 8px; width: 100%; }
    td { border-top: 1px dashed #aaa; padding: 5px 0; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .total td { border-top: 2px solid #111; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Bayaan POS</h1>
  <div class="muted">Receipt ${escapeHtml(receiptId)}</div>
  <div class="muted">Kiosk ${escapeHtml(receipt.kioskId || "-")} - ${escapeHtml(receipt.cashier || "-")}</div>
  <div class="muted">${escapeHtml(printedAt.toISOString())}</div>
  <div class="status">${escapeHtml(statusLabel(receipt.status))}</div>
  <table>
    <tbody>
      ${rows}
      <tr class="total"><td>Total</td><td></td><td class="num">${formatMoney(receipt.total)}</td></tr>
      <tr><td>Tender</td><td></td><td class="num">${escapeHtml(receipt.tender || "-")}</td></tr>
      ${cashRows}
    </tbody>
  </table>
</body>
</html>`;
}

export function printPosReceipt(
  receipt: PosReceipt,
  targetWindow: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!targetWindow) return false;
  const popup = targetWindow.open("", "bayaan_receipt", "width=360,height=640");
  if (!popup) {
    targetWindow.print();
    return false;
  }
  popup.document.open();
  popup.document.write(buildReceiptHtml(receipt));
  popup.document.close();
  popup.focus();
  popup.print();
  popup.close();
  return true;
}
