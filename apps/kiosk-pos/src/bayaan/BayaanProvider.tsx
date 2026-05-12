import * as React from "react";
import {
  createSourceOfTruthGateway,
  type KioskSalePayload,
  type KioskWastePayload,
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
export type SubmitFail = { ok: false; error: string; queued: boolean };
export type SubmitResult = SubmitOk | SubmitFail;

export type BayaanContextValue = {
  mode: BayaanMode;
  setMode: (mode: BayaanMode) => void;
  gateway: SourceOfTruthGateway;
  hasBackend: boolean;
  kioskId: string;
  setKioskId: (id: string) => void;
  shift: ShiftSession | null;
  startShift: (s: Omit<ShiftSession, "openedAt"> & { openedAt?: string }) => void;
  endShift: () => void;
  pending: QueueEntry[];
  pendingCount: number;
  submitSale: (input: { cart: CartItem[]; tender: TenderId | string; total: number }) => Promise<SubmitResult>;
  submitWaste: (input: {
    item: { id?: string | number; name: string; price: number };
    qty: number;
    reason: string;
  }) => Promise<SubmitResult>;
  submitTransfer: (input: StockTransferPayload) => Promise<SubmitResult>;
  flushQueue: () => Promise<{ ok: number; failed: number; remaining: number }>;
};

const BayaanContext = React.createContext<BayaanContextValue | null>(null);

const MODE_KEY = "bayaan.mode.v1";
const KIOSK_KEY = "bayaan.kiosk.v1";

function readInitialMode(hasEnv: boolean): BayaanMode {
  if (typeof window === "undefined") return "demo";
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === "live" || stored === "demo") return stored;
  return hasEnv ? "live" : "demo";
}

function readInitialKiosk(envKiosk: string | undefined): string {
  if (typeof window === "undefined") return envKiosk || "K-01";
  return window.localStorage.getItem(KIOSK_KEY) || envKiosk || "K-01";
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
  const isLive = mode === "live" && hasBackend;

  const queueRef = React.useRef<SaleQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new SaleQueue({
      onChange: (entries) => setPending(entries),
    });
  }
  const queue = queueRef.current;

  React.useEffect(() => {
    setPending(queue.list());
  }, [queue]);

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

  const startShift = React.useCallback<BayaanContextValue["startShift"]>((s) => {
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
  }, [gateway, isLive]);

  const endShift = React.useCallback(() => setShift(null), []);

  const flushQueue = React.useCallback(async () => {
    if (!isLive) return { ok: 0, failed: 0, remaining: queue.size() };
    return queue.flush(async (entry) => {
      switch (entry.kind) {
        case "sale":
          return gateway.submitKioskSale(entry.payload as KioskSalePayload);
        case "waste":
          return gateway.submitKioskWaste(entry.payload as KioskWastePayload);
        case "transfer":
          return gateway.submitStockTransfer(entry.payload as StockTransferPayload);
      }
    });
  }, [gateway, isLive, queue]);

  // Auto-flush every 30s while live
  React.useEffect(() => {
    if (!isLive) return undefined;
    void flushQueue();
    const handle = window.setInterval(() => {
      void flushQueue();
    }, 30_000);
    return () => window.clearInterval(handle);
  }, [isLive, flushQueue]);

  const submitSale: BayaanContextValue["submitSale"] = React.useCallback(
    async (input) => {
      if (!shift) {
        return { ok: false, error: "No active shift", queued: false };
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

      try {
        const result = await gateway.submitKioskSale(payload);
        return { ok: true, result };
      } catch (error) {
        if (shouldQueue(error)) {
          queue.enqueue({ kind: "sale", kioskId: shift.kioskId, payload });
          return { ok: false, error: errorMessage(error), queued: true };
        }
        return { ok: false, error: errorMessage(error), queued: false };
      }
    },
    [gateway, isLive, queue, shift],
  );

  const submitWaste: BayaanContextValue["submitWaste"] = React.useCallback(
    async (input) => {
      if (!shift) {
        return { ok: false, error: "No active shift", queued: false };
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

      try {
        const result = await gateway.submitKioskWaste(payload);
        return { ok: true, result };
      } catch (error) {
        if (shouldQueue(error)) {
          queue.enqueue({ kind: "waste", kioskId: shift.kioskId, payload });
          return { ok: false, error: errorMessage(error), queued: true };
        }
        return { ok: false, error: errorMessage(error), queued: false };
      }
    },
    [gateway, isLive, queue, shift],
  );

  const submitTransfer: BayaanContextValue["submitTransfer"] = React.useCallback(
    async (input) => {
      if (!isLive) {
        return { ok: true, result: { demo: true, kiosk: input.kioskId, item: input.itemId, qty: input.qty } };
      }
      try {
        const result = await gateway.submitStockTransfer(input);
        return { ok: true, result };
      } catch (error) {
        if (shouldQueue(error)) {
          queue.enqueue({ kind: "transfer", kioskId: input.kioskId, payload: input });
          return { ok: false, error: errorMessage(error), queued: true };
        }
        return { ok: false, error: errorMessage(error), queued: false };
      }
    },
    [gateway, isLive, queue],
  );

  const value = React.useMemo<BayaanContextValue>(
    () => ({
      mode,
      setMode,
      gateway,
      hasBackend,
      kioskId,
      setKioskId,
      shift,
      startShift,
      endShift,
      pending,
      pendingCount: pending.length,
      submitSale,
      submitWaste,
      submitTransfer,
      flushQueue,
    }),
    [
      mode,
      setMode,
      gateway,
      hasBackend,
      kioskId,
      setKioskId,
      shift,
      startShift,
      endShift,
      pending,
      submitSale,
      submitWaste,
      submitTransfer,
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
