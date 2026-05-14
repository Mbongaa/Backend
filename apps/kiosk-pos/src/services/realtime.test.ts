import { afterEach, describe, expect, it, vi } from "vitest";

import type { OdooClient } from "../lib/odoo";
import { subscribeBayaanRealtime } from "./realtime";

function fakeClient(json: OdooClient["json"], websocketUrl = "ws://odoo.test/websocket?version=19.0-2") {
  return {
    json,
    websocketUrl: vi.fn(() => websocketUrl),
  } as unknown as OdooClient;
}

describe("subscribeBayaanRealtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to authenticated Odoo bus polling when WebSocket is unavailable", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const events: unknown[] = [];
    const statuses: string[] = [];
    const json = vi.fn(async (route: string, params?: Record<string, unknown>) => {
      if (route === "/bayaan/api/realtime_config") {
        return {
          channels: ["bayaan.realtime.1.7.signed"],
          last: 41,
          notificationType: "bayaan.realtime",
          pollIntervalMs: 2000,
        };
      }
      if (route === "/websocket/peek_notifications") {
        expect(params).toMatchObject({
          channels: ["bayaan.realtime.1.7.signed"],
          last: 41,
          is_first_poll: true,
        });
        return {
          notifications: [
            {
              id: 42,
              message: {
                type: "bayaan.realtime",
                payload: { id: 42, action: "sale.paid", title: "Sale paid" },
              },
            },
            {
              id: 43,
              message: { type: "mail.message", payload: { id: 43 } },
            },
          ],
        };
      }
      throw new Error(`Unexpected route: ${route}`);
    }) as OdooClient["json"];

    const subscription = subscribeBayaanRealtime(fakeClient(json), {
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
    });

    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    expect(events[0]).toMatchObject({ action: "sale.paid" });
    expect(statuses).toContain("polling");
    expect(json).toHaveBeenCalledWith("/websocket/peek_notifications", expect.any(Object));

    subscription.close();
  });

  it("subscribes to the signed Odoo websocket channel and emits Bayaan events", async () => {
    const sockets: FakeWebSocket[] = [];
    class FakeWebSocket {
      static OPEN = 1;
      url: string;
      readyState = 0;
      sent: string[] = [];
      private listeners: Record<string, Array<(event?: { data?: string }) => void>> = {};

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
      }

      addEventListener(type: string, listener: (event?: { data?: string }) => void) {
        this.listeners[type] = [...(this.listeners[type] || []), listener];
      }

      send(message: string) {
        this.sent.push(message);
      }

      close() {
        this.readyState = 3;
        this.dispatch("close");
      }

      open() {
        this.readyState = FakeWebSocket.OPEN;
        this.dispatch("open");
      }

      emit(data: unknown) {
        this.dispatch("message", { data: JSON.stringify(data) });
      }

      private dispatch(type: string, event?: { data?: string }) {
        for (const listener of this.listeners[type] || []) {
          listener(event);
        }
      }
    }

    vi.stubGlobal("WebSocket", FakeWebSocket);
    const events: unknown[] = [];
    const statuses: string[] = [];
    const json = vi.fn(async () => ({
      channels: ["bayaan.realtime.1.9.signed"],
      last: 12,
      notificationType: "bayaan.realtime",
      websocketVersion: "19.0-2",
    })) as OdooClient["json"];

    const subscription = subscribeBayaanRealtime(fakeClient(json), {
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
    });

    await vi.waitFor(() => {
      expect(sockets).toHaveLength(1);
    });
    expect(sockets[0].url).toBe("ws://odoo.test/websocket?version=19.0-2");

    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      event_name: "subscribe",
      data: {
        channels: ["bayaan.realtime.1.9.signed"],
        last: 12,
      },
    });
    expect(statuses).toContain("live");

    sockets[0].emit([
      {
        id: 13,
        message: {
          type: "bayaan.realtime",
          payload: { id: 13, action: "transfer.dispatched" },
        },
      },
    ]);
    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    expect(events[0]).toMatchObject({ action: "transfer.dispatched" });

    subscription.close();
  });
});
