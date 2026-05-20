import * as React from "react";
import {
  type BayaanAuthStatus,
  createSourceOfTruthGateway,
  type KioskSalePayload,
  type KioskWastePayload,
  type LoginPayload,
  type ShiftClosePayload,
  type SourceOfTruthGateway,
  type StockTransferPayload,
} from "../services/sourceOfTruth";
import { SaleQueue, type QueueEntry } from "./saleQueue";
import {
  buildKioskSalePayload,
  buildWastePayload,
  type CartItem,
  type TenderId,
} from "./buildPosSale";

export type BayaanMode = "demo" | "live";

export type ShiftSession = {
  kioskId: string;
  kioskName?: string;
  cashier: string;
  cashierId?: string;
  openedAt: string;
  openingCash: number;
  sessionId?: number | string;
};

export type SubmitOk = { ok: true; result: unknown; queued?: false };
export type SubmitFail = { ok: false; error: string; queued: boolean; queueStatus?: QueueEntry["status"] };
export type SubmitResult = SubmitOk | SubmitFail;
export type AuthState = BayaanAuthStatus & {
  checked: boolean;
  busy: boolean;
  error?: string;
};

export type BayaanContextValue = {
  mode: BayaanMode;
  setMode: (mode: BayaanMode) => void;
  gateway: SourceOfTruthGateway;
  hasBackend: boolean;
  auth: AuthState;
  login: (payload: LoginPayload) => Promise<SubmitResult>;
  logout: () => Promise<void>;
  kioskId: string;
  setKioskId: (id: string) => void;
  shift: ShiftSession | null;
  startShift: (s: Omit<ShiftSession, "openedAt"> & { openedAt?: string }) => void;
  endShift: () => void;
  pending: QueueEntry[];
  pendingCount: number;
  blockedCount: number;
  online: boolean;
  submitSale: (input: { cart: CartItem[]; tender: TenderId | string; total: number }) => Promise<SubmitResult>;
  submitWaste: (input: {
    item: { id?: string | number; name: string; price: number };
    qty: number;
    reason: string;
  }) => Promise<SubmitResult>;
  submitTransfer: (input: StockTransferPayload) => Promise<SubmitResult>;
  submitShiftClose: (payload: ShiftClosePayload) => Promise<SubmitResult>;
  flushQueue: () => Promise<{ ok: number; failed: number; remaining: number }>;
};

const BayaanContext = React.createContext<BayaanContextValue | null>(null);

const MODE_KEY = "bayaan.mode.v1";
const KIOSK_KEY = "bayaan.kiosk.v1";

const EMPTY_AUTH_USER: BayaanAuthStatus["user"] = {
  id: false,
  name: "",
  login: "",
  roles: [],
  primaryRole: null,
  allowedNav: [],
  allowedPanels: { admin: false, pos: false },
  assignedKiosks: [],
};

const DEMO_AUTH: AuthState = {
  checked: true,
  busy: false,
  authenticated: true,
  user: {
    ...EMPTY_AUTH_USER,
    name: "Demo Owner",
    login: "demo",
    roles: ["superadmin"],
    primaryRole: "superadmin",
    allowedNav: [
      "overview", "insights", "kiosks", "warehouses", "items", "sales", "closing",
      "waste", "products", "suppliers", "inventory", "staff", "finance", "reports",
    ],
    allowedPanels: { admin: true, pos: true },
  },
};

function readInitialMode(hasEnv: boolean): BayaanMode {
  if (typeof window === "undefined") return "demo";
  const params = new URLSearchParams(window.location.search);
  if (
    params.get("bayaanSimulation") === "peak"
    || params.get("bayaanSimulation") === "peak-full"
    || params.get("bayaanMode") === "simulation"
    || window.localStorage.getItem("BAYAAN_SIMULATION") === "peak"
  ) {
    return "live";
  }
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === "live" || stored === "demo") return stored;
  return hasEnv ? "live" : "demo";
}

function readInitialKiosk(envKiosk: string | undefined): string {
  if (typeof window === "undefined") return envKiosk || "K-01";
  const params = new URLSearchParams(window.location.search);
  return params.get("bayaanKiosk") || window.localStorage.getItem(KIOSK_KEY) || envKiosk || "K-01";
}

function preferredAssignedKiosk(current: string, status: BayaanAuthStatus): string | null {
  const assigned = status.user.assignedKiosks
    .map((kiosk) => kiosk.kioskCode)
    .filter((code): code is string => Boolean(code));
  if (!assigned.length) return null;
  return assigned.includes(current) ? current : assigned[0];
}

export function BayaanProvider({ children }: { children: React.ReactNode }) {
  const gateway = React.useMemo(() => createSourceOfTruthGateway(), []);
  const hasBackend = gateway.enabled;

  const [mode, setModeState] = React.useState<BayaanMode>(() =>
    readInitialMode(gateway.enabled),
  );

  const [kioskId, setKioskIdState] = React.useState<string>(() =>
    readInitialKiosk(import.meta.env.VITE_BAYAAN_KIOSK as string | undefined),
  );

  const [shift, setShift] = React.useState<ShiftSession | null>(null);
  const [pending, setPending] = React.useState<QueueEntry[]>([]);
  const [online, setOnline] = React.useState<boolean>(() => browserOnline());
  const [auth, setAuth] = React.useState<AuthState>(() =>
    hasBackend
      ? { checked: false, busy: false, authenticated: false, user: EMPTY_AUTH_USER }
      : DEMO_AUTH,
  );
  const isLive = mode === "live" && hasBackend;
  const sourceOnlyWithoutBackend = mode === "live" && !hasBackend;

  const queueRef = React.useRef<SaleQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new SaleQueue({
      onChange: (entries) => setPending(entries),
    });
  }
  const queue = queueRef.current;

  React.useEffect(() => {
    let alive = true;
    void queue.list().then((entries) => {
      if (alive) setPending(entries);
    });
    return () => {
      alive = false;
    };
  }, [queue]);

  React.useEffect(() => {
    let alive = true;
    if (!hasBackend) {
      setAuth(DEMO_AUTH);
      return () => {
        alive = false;
      };
    }
    setAuth((current) => ({ ...current, checked: false, busy: false, error: undefined }));
    void gateway.getAuthStatus()
      .then((status) => {
        if (!alive) return;
        setAuth({ ...status, checked: true, busy: false });
        setKioskIdState((current) => {
          const nextKiosk = preferredAssignedKiosk(current, status);
          if (!nextKiosk || nextKiosk === current) return current;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(KIOSK_KEY, nextKiosk);
          }
          return nextKiosk;
        });
      })
      .catch((error) => {
        if (!alive) return;
        setAuth({
          checked: true,
          busy: false,
          authenticated: false,
          user: EMPTY_AUTH_USER,
          error: errorMessage(error),
        });
      });
    return () => {
      alive = false;
    };
  }, [gateway, hasBackend]);

  const setMode = React.useCallback((next: BayaanMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_KEY, next);
    }
  }, []);

  const setKioskId = React.useCallback((id: string) => {
    setKioskIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KIOSK_KEY, id);
    }
  }, []);

  const login = React.useCallback<BayaanContextValue["login"]>(async (payload) => {
    if (!hasBackend) {
      setAuth(DEMO_AUTH);
      return { ok: true, result: DEMO_AUTH };
    }
    setAuth((current) => ({ ...current, busy: true, error: undefined }));
    try {
      const status = await gateway.login(payload);
      setAuth({ ...status, checked: true, busy: false });
      const nextKiosk = preferredAssignedKiosk(kioskId, status);
      if (nextKiosk) setKioskId(nextKiosk);
      return { ok: true, result: status };
    } catch (error) {
      const message = errorMessage(error);
      setAuth({
        checked: true,
        busy: false,
        authenticated: false,
        user: EMPTY_AUTH_USER,
        error: message,
      });
      return { ok: false, error: message, queued: false };
    }
  }, [gateway, hasBackend, kioskId, setKioskId]);

  const logout = React.useCallback<BayaanContextValue["logout"]>(async () => {
    if (!hasBackend) {
      setAuth(DEMO_AUTH);
      return;
    }
    await gateway.logout().catch(() => undefined);
    setShift(null);
    setAuth({ checked: true, busy: false, authenticated: false, user: EMPTY_AUTH_USER });
  }, [gateway, hasBackend]);

  const startShift = React.useCallback<BayaanContextValue["startShift"]>((s) => {
    if (sourceOnlyWithoutBackend) return;
    const next = {
      ...s,
      openedAt: s.openedAt ?? new Date().toISOString(),
    };
    setShift(next);
    if (!isLive) return;
    void gateway.openSession({
      kiosk: next.kioskId,
      opening_cash: next.openingCash,
    }).then((session) => {
      if (!session.id) return;
      setShift((current) =>
        current && current.openedAt === next.openedAt
          ? { ...current, sessionId: session.id }
          : current,
      );
    }).catch(() => undefined);
  }, [gateway, isLive, sourceOnlyWithoutBackend]);

  const endShift = React.useCallback(() => setShift(null), []);

  const flushQueue = React.useCallback(async () => {
    if (!isLive || !browserOnline()) {
      return { ok: 0, failed: 0, remaining: await queue.size() };
    }
    return queue.flush(async (entry) => {
      switch (entry.kind) {
        case "sale":
          return gateway.submitKioskSale(entry.payload as KioskSalePayload);
        case "waste":
          return gateway.submitKioskWaste(entry.payload as KioskWastePayload);
        case "transfer":
          return gateway.submitStockTransfer(entry.payload as StockTransferPayload);
        case "shift_close":
          return gateway.submitShiftClose(entry.payload as ShiftClosePayload);
      }
    }, {
      shouldRetry: (error) => shouldQueue(error),
    });
  }, [gateway, isLive, queue]);

  // Auto-flush every 30s while live
  React.useEffect(() => {
    if (!isLive) return undefined;
    const markOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const markOffline = () => setOnline(false);
    const flushVisible = () => {
      if (document.visibilityState === "visible") void flushQueue();
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    document.addEventListener("visibilitychange", flushVisible);
    setOnline(browserOnline());
    if (browserOnline()) void flushQueue();
    const handle = window.setInterval(() => {
      void flushQueue();
    }, 30_000);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
      document.removeEventListener("visibilitychange", flushVisible);
      window.clearInterval(handle);
    };
  }, [isLive, flushQueue]);

  const submitSale: BayaanContextValue["submitSale"] = React.useCallback(
    async (input) => {
      if (!shift) {
        return { ok: false, error: "No active shift", queued: false };
      }
      if (sourceOnlyWithoutBackend) {
        return { ok: false, error: "Connect the source engine before recording source sales", queued: false };
      }
      let payload: KioskSalePayload;
      try {
        payload = buildKioskSalePayload({
          cart: input.cart,
          tender: input.tender,
          total: input.total,
          kiosk: shift.kioskId,
          cashier: shift.cashier,
          sessionId: shift.sessionId,
        });
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }

      if (!isLive) {
        return { ok: true, result: { demo: true, external_id: payload.external_id } };
      }

      let entry: QueueEntry;
      try {
        entry = await queue.enqueue({
          kind: "sale",
          kioskId: shift.kioskId,
          cashier: shift.cashier,
          receiptNumber: payload.external_id,
          payload,
        });
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }

      if (!browserOnline()) {
        return { ok: false, error: "Network offline; sale saved locally", queued: true, queueStatus: "pending" };
      }

      try {
        const result = await gateway.submitKioskSale(payload);
        await queue.remove(entry.id);
        return { ok: true, result };
      } catch (error) {
        const retryable = shouldQueue(error);
        const updated = await queue.markFailed(entry.id, error, { retryable });
        return {
          ok: false,
          error: retryable ? errorMessage(error) : `Server rejected sale; saved for reconciliation: ${errorMessage(error)}`,
          queued: true,
          queueStatus: updated?.status ?? (retryable ? "pending" : "blocked"),
        };
      }
    },
    [gateway, isLive, queue, shift, sourceOnlyWithoutBackend],
  );

  const submitWaste: BayaanContextValue["submitWaste"] = React.useCallback(
    async (input) => {
      if (!shift) {
        return { ok: false, error: "No active shift", queued: false };
      }
      if (sourceOnlyWithoutBackend) {
        return { ok: false, error: "Connect the source engine before recording source waste", queued: false };
      }
      let payload: KioskWastePayload;
      try {
        payload = buildWastePayload({
          kiosk: shift.kioskId,
          cashier: shift.cashier,
          item: input.item,
          qty: input.qty,
          reason: input.reason,
        });
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }

      if (!isLive) {
        return { ok: true, result: { demo: true, external_id: payload.external_id } };
      }

      let entry: QueueEntry;
      try {
        entry = await queue.enqueue({
          kind: "waste",
          kioskId: shift.kioskId,
          cashier: shift.cashier,
          receiptNumber: payload.external_id,
          payload,
        });
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }

      if (!browserOnline()) {
        return { ok: false, error: "Network offline; waste saved locally", queued: true, queueStatus: "pending" };
      }

      try {
        const result = await gateway.submitKioskWaste(payload);
        await queue.remove(entry.id);
        return { ok: true, result };
      } catch (error) {
        const retryable = shouldQueue(error);
        const updated = await queue.markFailed(entry.id, error, { retryable });
        return {
          ok: false,
          error: retryable ? errorMessage(error) : `Server rejected waste; saved for reconciliation: ${errorMessage(error)}`,
          queued: true,
          queueStatus: updated?.status ?? (retryable ? "pending" : "blocked"),
        };
      }
    },
    [gateway, isLive, queue, shift, sourceOnlyWithoutBackend],
  );

  const submitTransfer: BayaanContextValue["submitTransfer"] = React.useCallback(
    async (input) => {
      if (sourceOnlyWithoutBackend) {
        return { ok: false, error: "Connect the source engine before creating source stock transfers", queued: false };
      }
      if (!isLive) {
        return { ok: true, result: { demo: true, kiosk: input.kioskId, item: input.itemId, qty: input.qty } };
      }
      let entry: QueueEntry;
      try {
        entry = await queue.enqueue({
          kind: "transfer",
          kioskId: input.kioskId,
          payload: input,
        });
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }

      if (!browserOnline()) {
        return { ok: false, error: "Network offline; transfer saved locally", queued: true, queueStatus: "pending" };
      }

      try {
        const result = await gateway.submitStockTransfer(input);
        await queue.remove(entry.id);
        return { ok: true, result };
      } catch (error) {
        const retryable = shouldQueue(error);
        const updated = await queue.markFailed(entry.id, error, { retryable });
        return {
          ok: false,
          error: retryable ? errorMessage(error) : `Server rejected transfer; saved for reconciliation: ${errorMessage(error)}`,
          queued: true,
          queueStatus: updated?.status ?? (retryable ? "pending" : "blocked"),
        };
      }
    },
    [gateway, isLive, queue, sourceOnlyWithoutBackend],
  );

  const submitShiftClose: BayaanContextValue["submitShiftClose"] = React.useCallback(
    async (payload) => {
      if (sourceOnlyWithoutBackend) {
        return { ok: false, error: "Connect the source engine before submitting source shift close", queued: false };
      }
      if (pending.length > 0) {
        return { ok: false, error: "Sync offline queue before closing shift", queued: false };
      }
      if (!isLive) {
        return { ok: true, result: { demo: true, kiosk: payload.kioskId } };
      }
      try {
        const result = await gateway.submitShiftClose(payload);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: errorMessage(error), queued: false };
      }
    },
    [gateway, isLive, pending.length, sourceOnlyWithoutBackend],
  );

  const value = React.useMemo<BayaanContextValue>(
    () => ({
      mode,
      setMode,
      gateway,
      hasBackend,
      auth,
      login,
      logout,
      kioskId,
      setKioskId,
      shift,
      startShift,
      endShift,
      pending,
      pendingCount: pending.length,
      blockedCount: pending.filter((entry) => entry.status === "blocked").length,
      online,
      submitSale,
      submitWaste,
      submitTransfer,
      submitShiftClose,
      flushQueue,
    }),
    [
      mode,
      setMode,
      gateway,
      hasBackend,
      auth,
      login,
      logout,
      kioskId,
      setKioskId,
      shift,
      startShift,
      endShift,
      pending,
      online,
      submitSale,
      submitWaste,
      submitTransfer,
      submitShiftClose,
      flushQueue,
    ],
  );

  return <BayaanContext.Provider value={value}>{children}</BayaanContext.Provider>;
}

export function useBayaan(): BayaanContextValue {
  const ctx = React.useContext(BayaanContext);
  if (!ctx) throw new Error("useBayaan must be used inside <BayaanProvider>");
  return ctx;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function shouldQueue(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}
