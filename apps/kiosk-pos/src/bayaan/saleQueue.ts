/**
 * Offline-first queue for kiosk submissions.
 *
 * Why this exists: a kiosk in Baghdad will hit network blips. Sales lost
 * to a 3-second connection drop = wrong stock counts at close = the
 * variance loop cannot be trusted. So every submit is queued first,
 * sent best-effort, and retried with backoff. The shift cannot be closed
 * while items are still pending.
 *
 * Storage shape:
 *   localStorage[QUEUE_KEY] = JSON-serialized QueueEntry[]
 *
 * Each entry is a single attempt at one of {sale, waste, transfer}.
 * Entries leave the queue only on durable success (server returned id).
 */

export type QueueKind = "sale" | "waste" | "transfer";

export type QueueEntry = {
  id: string;
  kind: QueueKind;
  kioskId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
};

export type QueueStorage = {
  read(): QueueEntry[];
  write(entries: QueueEntry[]): void;
};

export type QueueSubmitter = (entry: QueueEntry) => Promise<unknown>;

export type QueueOptions = {
  storage?: QueueStorage;
  storageKey?: string;
  maxAttempts?: number;
  onChange?: (entries: QueueEntry[]) => void;
};

const DEFAULT_KEY = "bayaan.salequeue.v1";
const DEFAULT_MAX_ATTEMPTS = 50;

export function createLocalStorageStorage(key = DEFAULT_KEY): QueueStorage {
  return {
    read() {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as QueueEntry[]) : [];
      } catch {
        return [];
      }
    },
    write(entries) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(entries));
      } catch {
        // disk full or storage disabled — best effort only
      }
    },
  };
}

export function createMemoryStorage(initial: QueueEntry[] = []): QueueStorage {
  let state = [...initial];
  return {
    read() {
      return [...state];
    },
    write(entries) {
      state = [...entries];
    },
  };
}

export class SaleQueue {
  private storage: QueueStorage;
  private maxAttempts: number;
  private onChange?: (entries: QueueEntry[]) => void;
  private inFlight = false;

  constructor(options: QueueOptions = {}) {
    this.storage = options.storage ?? createLocalStorageStorage(options.storageKey);
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.onChange = options.onChange;
  }

  list(): QueueEntry[] {
    return this.storage.read();
  }

  pending(): QueueEntry[] {
    return this.list().filter((entry) => entry.attempts < this.maxAttempts);
  }

  size(): number {
    return this.list().length;
  }

  enqueue(input: { kind: QueueKind; kioskId: string; payload: unknown }): QueueEntry {
    const entry: QueueEntry = {
      id: makeId(input.kind),
      kind: input.kind,
      kioskId: input.kioskId,
      payload: input.payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    const next = [...this.list(), entry];
    this.storage.write(next);
    this.notify(next);
    return entry;
  }

  remove(id: string) {
    const next = this.list().filter((entry) => entry.id !== id);
    this.storage.write(next);
    this.notify(next);
  }

  clear() {
    this.storage.write([]);
    this.notify([]);
  }

  /**
   * Process the queue once. Each entry is submitted; on success it is
   * removed; on failure its attempts counter is incremented and it
   * remains queued for the next flush.
   *
   * Returns counts so a caller can decide whether to retry sooner.
   */
  async flush(submit: QueueSubmitter): Promise<{ ok: number; failed: number; remaining: number }> {
    if (this.inFlight) {
      return { ok: 0, failed: 0, remaining: this.size() };
    }
    this.inFlight = true;
    let ok = 0;
    let failed = 0;
    try {
      const queue = this.list();
      for (const entry of queue) {
        if (entry.attempts >= this.maxAttempts) {
          continue;
        }
        try {
          await submit(entry);
          this.remove(entry.id);
          ok += 1;
        } catch (error) {
          this.markFailed(entry.id, error);
          failed += 1;
        }
      }
    } finally {
      this.inFlight = false;
    }
    return { ok, failed, remaining: this.size() };
  }

  private markFailed(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const next = this.list().map((entry) =>
      entry.id === id
        ? {
            ...entry,
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: message,
          }
        : entry,
    );
    this.storage.write(next);
    this.notify(next);
  }

  private notify(entries: QueueEntry[]) {
    if (!this.onChange) return;
    try {
      this.onChange(entries);
    } catch {
      // listener errors must not break the queue
    }
  }
}

function makeId(kind: QueueKind) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}-${ts}-${rand}`;
}
