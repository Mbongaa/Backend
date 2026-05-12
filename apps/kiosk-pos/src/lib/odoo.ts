export type OdooClientOptions = {
  baseUrl: string;
  token?: string;
};

export class OdooClient {
  private baseUrl: string;
  private token?: string;

  constructor(options: OdooClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  async json<T = unknown>(route: string, params: Record<string, unknown> = {}) {
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params,
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Odoo request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.data?.message ?? data.error.message ?? "Odoo JSON route failed");
    }

    return data.result as T;
  }
}

export const odooMapping = {
  kiosk: ["bayaan.kiosk", "pos.config", "stock.location"],
  warehouseSetup: ["stock.warehouse", "stock.location", "stock.picking.type", "pos.config", "bayaan.kiosk"],
  sale: ["pos.order", "pos.payment", "pos.session"],
  stockAllocation: ["stock.picking", "stock.move", "stock.location"],
  ingredientConsumption: ["bayaan.recipe", "stock.scrap", "stock.move"],
  purchases: ["purchase.order", "res.partner", "product.supplierinfo"],
  reports: ["pos.order", "stock.quant", "account.move", "bayaan.shift.close"],
} as const;
