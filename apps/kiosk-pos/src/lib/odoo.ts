export type OdooClientOptions = {
  baseUrl: string;
  token?: string;
  db?: string;
};

export class OdooClient {
  private baseUrl: string;
  private token?: string;
  private db: string;

  constructor(options: OdooClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.db = options.db || "bayaan";
  }

  routeUrl(route: string) {
    return `${this.baseUrl}${route}`;
  }

  websocketUrl(route: string) {
    const url = new URL(this.routeUrl(route), window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  async json<T = unknown>(route: string, params: Record<string, unknown> = {}) {
    const response = await fetch(this.routeUrl(route), {
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

  async authenticate<T = unknown>(login: string, password: string) {
    return this.json<T>("/web/session/authenticate", {
      db: this.db,
      login,
      password,
    });
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
