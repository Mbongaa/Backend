import type { OdooClient } from "../lib/odoo";

export type BayaanRealtimeEvent = {
  id: number | string;
  type?: string;
  eventType?: string;
  action?: string;
  severity?: "info" | "success" | "warning" | "critical";
  title?: string;
  detail?: string;
  occurredAt?: string;
  companyId?: number;
  kiosk?: string;
  kioskName?: string;
  model?: string;
  resId?: number | false;
  reference?: string;
  payload?: Record<string, unknown>;
};

export type BayaanRealtimeStatus =
  | "connecting"
  | "live"
  | "polling"
  | "reconnecting"
  | "error"
  | "closed";

export type BayaanRealtimeSubscription = {
  close: () => void;
};

export type BayaanRealtimeOptions = {
  onEvent: (event: BayaanRealtimeEvent) => void;
  onStatus?: (status: BayaanRealtimeStatus) => void;
  onError?: (error: Error) => void;
};

type RealtimeConfig = {
  channels?: string[];
  last?: number;
  notificationType?: string;
  websocketVersion?: string;
  pollIntervalMs?: number;
};

type BusNotification = {
  id: number;
  message?: {
    type?: string;
    payload?: BayaanRealtimeEvent;
  };
};

type BusPollResponse = {
  notifications?: BusNotification[];
};

const DEFAULT_NOTIFICATION_TYPE = "bayaan.realtime";
const DEFAULT_WEBSOCKET_VERSION = "19.0-2";

export function subscribeBayaanRealtime(
  client: OdooClient,
  options: BayaanRealtimeOptions,
): BayaanRealtimeSubscription {
  let closed = false;
  let socket: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollingStarted = false;
  let last = 0;

  const setStatus = (status: BayaanRealtimeStatus) => {
    options.onStatus?.(status);
  };

  const fail = (error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    options.onError?.(normalized);
  };

  const handleNotifications = (notifications: BusNotification[] = [], notificationType: string) => {
    for (const notification of notifications) {
      if (notification.id > last) last = notification.id;
      if (notification.message?.type !== notificationType) continue;
      const payload = notification.message.payload;
      if (payload) options.onEvent(payload);
    }
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const startPolling = (config: RealtimeConfig, firstPoll = true) => {
    if (closed || pollingStarted) return;
    pollingStarted = true;
    const interval = Math.max(1000, Number(config.pollIntervalMs || 2000));
    const channels = config.channels || [];
    const notificationType = config.notificationType || DEFAULT_NOTIFICATION_TYPE;

    const poll = async (isFirstPoll: boolean) => {
      if (closed) return;
      try {
        const response = await client.json<BusPollResponse>("/websocket/peek_notifications", {
          channels,
          last,
          is_first_poll: isFirstPoll,
        });
        handleNotifications(response.notifications || [], notificationType);
        setStatus("polling");
      } catch (error) {
        fail(error);
        setStatus("error");
      } finally {
        if (!closed) {
          pollTimer = setTimeout(() => void poll(false), interval);
        }
      }
    };

    void poll(firstPoll);
  };

  const openSocket = (config: RealtimeConfig) => {
    const channels = config.channels || [];
    if (!channels.length || typeof WebSocket === "undefined") return false;
    const version = config.websocketVersion || DEFAULT_WEBSOCKET_VERSION;
    const notificationType = config.notificationType || DEFAULT_NOTIFICATION_TYPE;

    try {
      socket = new WebSocket(client.websocketUrl(`/websocket?version=${encodeURIComponent(version)}`));
    } catch (error) {
      fail(error);
      return false;
    }

    socket.addEventListener("open", () => {
      if (closed || !socket) return;
      setStatus("live");
      socket.send(JSON.stringify({
        event_name: "subscribe",
        data: { channels, last },
      }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const notifications = JSON.parse(String(event.data)) as BusNotification[];
        handleNotifications(notifications, notificationType);
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      if (!closed) setStatus("reconnecting");
    });

    socket.addEventListener("close", () => {
      if (closed) return;
      setStatus("reconnecting");
      startPolling(config, false);
    });

    return true;
  };

  const start = async () => {
    setStatus("connecting");
    try {
      const config = await client.json<RealtimeConfig>("/bayaan/api/realtime_config");
      last = Number(config.last || 0);
      const websocketStarted = openSocket(config);
      if (!websocketStarted) startPolling(config);
    } catch (error) {
      fail(error);
      setStatus("error");
    }
  };

  void start();

  return {
    close: () => {
      closed = true;
      stopPolling();
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
      setStatus("closed");
    },
  };
}
