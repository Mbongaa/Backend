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
  | "offline"
  | "error"
  | "closed";

export type BayaanRealtimeTransport = "auto" | "polling";

export type BayaanRealtimeSubscription = {
  close: () => void;
};

export type BayaanRealtimeOptions = {
  onEvent: (event: BayaanRealtimeEvent) => void;
  onStatus?: (status: BayaanRealtimeStatus) => void;
  onError?: (error: Error) => void;
  // #12 — called after the stream recovers from an outage so the consumer can resync the
  // authoritative snapshot (chain_bootstrap) and backfill anything missed during the gap.
  onReconnect?: () => void;
  transport?: BayaanRealtimeTransport;
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
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollingStarted = false;
  let last = 0;
  let reconnectAttempts = 0;
  let hadConnection = false; // becomes true once we have ever connected (=> drops are reconnects)
  let lastConfig: RealtimeConfig | null = null;
  // #12 — half-open detection: a severed-but-OPEN socket never fires close/error, so we track
  // inbound activity and force a reconnect when it goes stale. socketEpoch invalidates the
  // listeners of a socket we have already torn down (its late close becomes a no-op).
  let lastInboundAt = 0;
  let socketEpoch = 0;

  const HEARTBEAT_MS = 15000;
  const MAX_BACKOFF_MS = 30000;
  // No inbound frame within this window (despite the keepalive) => the socket is half-open.
  // Browser JS cannot send WebSocket ping frames, so liveness is inferred from inbound traffic;
  // during normal operation events keep the socket "fresh", so this only trips on a real outage.
  const STALE_MS = 40000;

  const setStatus = (status: BayaanRealtimeStatus) => {
    options.onStatus?.(status);
  };

  const fail = (error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    options.onError?.(normalized);
  };

  // Dedup across transports (WS + polling fallback can briefly overlap): bus notification
  // ids are monotonic, so anything <= the max already processed is a duplicate. #12
  const handleNotifications = (notifications: BusNotification[] = [], notificationType: string) => {
    for (const notification of notifications) {
      if (notification.id <= last) continue;
      last = notification.id;
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
    pollingStarted = false;
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const backoffMs = () => {
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(reconnectAttempts, 5));
    return base / 2 + Math.floor(Math.random() * (base / 2)); // jittered
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectAttempts += 1;
    setStatus(reconnectAttempts > 6 ? "offline" : "reconnecting");
    const delay = backoffMs();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, delay);
  };

  // #12 — tear down a half-open socket (detected by the heartbeat watchdog) and recover: drop
  // to polling immediately so events keep flowing, then reconnect the WebSocket with backoff.
  // A half-open socket never fires close on its own, so we orphan its listeners via socketEpoch.
  const forceReconnect = () => {
    if (closed) return;
    stopHeartbeat();
    socketEpoch += 1;
    const dead = socket;
    socket = null;
    if (dead) {
      try {
        dead.close();
      } catch {
        /* already gone */
      }
    }
    setStatus("reconnecting");
    if (lastConfig) startPolling(lastConfig, false);
    scheduleReconnect();
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
        // Only re-arm if polling is still the active fallback (the WS may have recovered and
        // called stopPolling, which clears pollingStarted). Prevents a zombie poll loop. #12
        if (!closed && pollingStarted) {
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

    let ws: WebSocket;
    try {
      ws = new WebSocket(client.websocketUrl(`/websocket?version=${encodeURIComponent(version)}`));
    } catch (error) {
      fail(error);
      return false;
    }
    socket = ws;
    // Each socket gets an epoch; once we tear it down (forceReconnect) the epoch advances and
    // this socket's listeners become no-ops, so a late close from a half-open socket can't
    // double-trigger recovery. #12
    const myEpoch = (socketEpoch += 1);
    const isCurrent = () => !closed && socketEpoch === myEpoch && socket === ws;

    ws.addEventListener("open", () => {
      if (!isCurrent()) return;
      setStatus("live");
      // Recovered from an outage -> resync the snapshot so any events missed during the gap
      // are backfilled, and the WS becomes the single transport again (stop the fallback).
      const wasReconnect = hadConnection;
      hadConnection = true;
      reconnectAttempts = 0;
      lastInboundAt = Date.now();
      stopPolling();
      ws.send(JSON.stringify({
        event_name: "subscribe",
        data: { channels, last },
      }));
      if (wasReconnect) options.onReconnect?.();
      // Heartbeat + half-open watchdog: a periodic subscribe keeps the socket warm; if NO inbound
      // frame has arrived within STALE_MS despite the keepalive, the socket is half-open (TCP up,
      // data not flowing — it would never fire close on its own) so we force a reconnect. #12
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (!isCurrent() || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastInboundAt > STALE_MS) {
          forceReconnect();
          return;
        }
        try {
          ws.send(JSON.stringify({ event_name: "subscribe", data: { channels, last } }));
        } catch {
          forceReconnect();
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener("message", (event) => {
      if (!isCurrent()) return;
      lastInboundAt = Date.now(); // any inbound frame proves the socket is alive
      try {
        const notifications = JSON.parse(String(event.data)) as BusNotification[];
        handleNotifications(notifications, notificationType);
      } catch (error) {
        fail(error);
      }
    });

    ws.addEventListener("error", () => {
      if (!isCurrent()) return;
      setStatus("reconnecting");
    });

    ws.addEventListener("close", () => {
      if (!isCurrent()) return;
      stopHeartbeat();
      socket = null;
      // Degrade to polling immediately so events keep flowing, AND keep trying to restore the
      // WebSocket with exponential backoff (not a one-shot fall-through). #12
      setStatus("reconnecting");
      startPolling(config, false);
      scheduleReconnect();
    });

    return true;
  };

  const start = async () => {
    if (closed) return;
    if (!hadConnection && reconnectAttempts === 0) setStatus("connecting");
    try {
      const config = await client.json<RealtimeConfig>("/bayaan/api/realtime_config");
      lastConfig = config;
      if (!last) last = Number(config.last || 0);
      const websocketStarted = options.transport === "polling" ? false : openSocket(config);
      if (!websocketStarted) {
        // No WebSocket available: poll as the primary transport. The very first poll must
        // request is_first_poll:true; treat config as connected so a later failure schedules
        // a retry rather than dying.
        const firstPoll = !hadConnection;
        hadConnection = true;
        reconnectAttempts = 0;
        startPolling(config, firstPoll);
      }
    } catch (error) {
      // Initial (or retry) realtime_config failure now RETRIES with backoff instead of
      // dying silently. If we have a prior config, fall back to polling meanwhile. #12
      fail(error);
      if (lastConfig) startPolling(lastConfig, false);
      scheduleReconnect();
    }
  };

  void start();

  return {
    close: () => {
      closed = true;
      stopPolling();
      stopHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
      setStatus("closed");
    },
  };
}
