/**
 * Durable offline journal for kiosk submissions.
 *
 * Odoo remains the source of truth. This journal only preserves cashier
 * intent while the browser is offline or while the backend is unreachable.
 * Entries leave the journal only after the Bayaan/Odoo route accepts them.
 */

export type QueueKind = "sale" | "waste" | "transfer" | "shift_close";
export type QueueStatus = "pending" | "blocked";

export type QueueEntry = {
  id: string;
  uuid: string;
  kind: QueueKind;
  kioskId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  status: QueueStatus;
  clientVersion: 1;
  cashier?: string;
  receiptNumber?: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export type QueueStorage = {
  read(): Promise<QueueEntry[]>;
  write(entries: QueueEntry[]): Promise<void>;
};

export type QueueSubmitter = (entry: QueueEntry) => Promise<unknown>;
export type QueueRetryDecider = (error: unknown, entry: QueueEntry) => boolean;

export type QueueOptions = {
  storage?: QueueStorage;
  storageKey?: string;
  maxAttempts?: number;
  onChange?: (entries: QueueEntry[]) => void;
};

export type QueueCounts = {
  ok: number;
  failed: number;
  remaining: number;
  blocked: number;
};

const DEFAULT_KEY = "bayaan.salequeue.v1";
const DEFAULT_DB = "bayaan-pos-offline-v1";
const DEFAULT_STORE = "entries";
const DEFAULT_MAX_ATTEMPTS = 50;

export function createBrowserQueueStorage(storageKey = DEFAULT_KEY): QueueStorage {
  const fallback = createLocalStorageStorage(storageKey);
  if (typeof indexedDB === "undefined") return fallback;
  return createFallbackStorage(
    createIndexedDbStorage({ legacyStorageKey: storageKey }),
    fallback,
  );
}

export function createLocalStorageStorage(key = DEFAULT_KEY): QueueStorage {
  return {
    async read() {
      return readLocalStorageEntries(key);
    },
    async write(entries) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(sortEntries(entries).map(normalizeEntry)));
    },
  };
}

export function createMemoryStorage(initial: QueueEntry[] = []): QueueStorage {
  let state = sortEntries(initial).map(normalizeEntry);
  return {
    async read() {
      return state.map((entry) => ({ ...entry }));
    },
    async write(entries) {
      state = sortEntries(entries).map(normalizeEntry);
    },
  };
}

export function createIndexedDbStorage(options: {
  dbName?: string;
  storeName?: string;
  legacyStorageKey?: string;
} = {}): QueueStorage {
  const dbName = options.dbName ?? DEFAULT_DB;
  const storeName = options.storeName ?? DEFAULT_STORE;
  const legacyStorageKey = options.legacyStorageKey;
  let migratedLegacy = false;

  return {
    async read() {
      const db = await openQueueDb(dbName, storeName);
      try {
        const entries = sortEntries(await readAllEntries(db, storeName)).map(normalizeEntry);
        if (!migratedLegacy && legacyStorageKey) {
          migratedLegacy = true;
          const legacy = readLocalStorageEntries(legacyStorageKey);
          if (legacy.length) {
            const merged = mergeEntries(entries, legacy);
            await writeAllEntries(db, storeName, merged);
            removeLocalStorageKey(legacyStorageKey);
            return merged;
          }
        }
        return entries;
      } finally {
        db.close();
      }
    },
    async write(entries) {
      const db = await openQueueDb(dbName, storeName);
      try {
        await writeAllEntries(db, storeName, sortEntries(entries).map(normalizeEntry));
      } finally {
        db.close();
      }
    },
  };
}

export class SaleQueue {
  private storage: QueueStorage;
  private maxAttempts: number;
  private onChange?: (entries: QueueEntry[]) => void;
  private inFlight = false;

  constructor(options: QueueOptions = {}) {
    this.storage = options.storage ?? createBrowserQueueStorage(options.storageKey);
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.onChange = options.onChange;
  }

  async list(): Promise<QueueEntry[]> {
    return sortEntries(await this.storage.read()).map(normalizeEntry);
  }

  async pending(): Promise<QueueEntry[]> {
    return (await this.list()).filter((entry) => this.canRetry(entry));
  }

  async blocked(): Promise<QueueEntry[]> {
    return (await this.list()).filter((entry) => entry.status === "blocked");
  }

  async size(): Promise<number> {
    return (await this.list()).length;
  }

  async enqueue(input: {
    kind: QueueKind;
    kioskId: string;
    payload: unknown;
    cashier?: string;
    receiptNumber?: string;
  }): Promise<QueueEntry> {
    const entry = normalizeEntry({
      id: makeId(input.kind),
      uuid: makeUuid(),
      kind: input.kind,
      kioskId: input.kioskId,
      payload: input.payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: "pending",
      clientVersion: 1,
      cashier: input.cashier,
      receiptNumber: input.receiptNumber,
    });
    const next = [...await this.list(), entry];
    await this.storage.write(next);
    this.notify(next);
    return entry;
  }

  async remove(id: string): Promise<void> {
    const next = (await this.list()).filter((entry) => entry.id !== id);
    await this.storage.write(next);
    this.notify(next);
  }

  async clear(): Promise<void> {
    await this.storage.write([]);
    this.notify([]);
  }

  async markFailed(
    id: string,
    error: unknown,
    options: { retryable?: boolean } = {},
  ): Promise<QueueEntry | null> {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = options.retryable ?? true;
    let updated: QueueEntry | null = null;
    const next = (await this.list()).map((entry) => {
      if (entry.id !== id) return entry;
      updated = normalizeEntry({
        ...entry,
        attempts: entry.attempts + 1,
        status: retryable ? "pending" : "blocked",
        lastAttemptAt: new Date().toISOString(),
        lastError: message,
      });
      return updated;
    });
    await this.storage.write(next);
    this.notify(next);
    return updated;
  }

  /**
   * Process one queued entry at a time. A later entry must not be allowed
   * to hide the failure of an earlier cashier action.
   */
  async flush(
    submit: QueueSubmitter,
    options: { shouldRetry?: QueueRetryDecider } = {},
  ): Promise<QueueCounts> {
    if (this.inFlight) {
      return this.counts(0, 0);
    }
    this.inFlight = true;
    let ok = 0;
    let failed = 0;
    try {
      const entries = await this.list();
      for (const entry of entries) {
        if (!this.canRetry(entry)) continue;
        try {
          await submit(entry);
          await this.remove(entry.id);
          ok += 1;
        } catch (error) {
          const retryable = options.shouldRetry ? options.shouldRetry(error, entry) : true;
          await this.markFailed(entry.id, error, { retryable });
          failed += 1;
          if (!retryable) break;
        }
      }
    } finally {
      this.inFlight = false;
    }
    return this.counts(ok, failed);
  }

  private async counts(ok: number, failed: number): Promise<QueueCounts> {
    const entries = await this.list();
    return {
      ok,
      failed,
      remaining: entries.length,
      blocked: entries.filter((entry) => entry.status === "blocked").length,
    };
  }

  private canRetry(entry: QueueEntry): boolean {
    return entry.status !== "blocked" && entry.attempts < this.maxAttempts;
  }

  private notify(entries: QueueEntry[]) {
    if (!this.onChange) return;
    try {
      this.onChange(sortEntries(entries).map(normalizeEntry));
    } catch {
      // Listener errors must not break the journal.
    }
  }
}

function createFallbackStorage(primary: QueueStorage, fallback: QueueStorage): QueueStorage {
  return {
    async read() {
      try {
        return await primary.read();
      } catch {
        return fallback.read();
      }
    },
    async write(entries) {
      try {
        await primary.write(entries);
      } catch {
        await fallback.write(entries);
      }
    },
  };
}

function openQueueDb(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
        store.createIndex("by_status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline journal"));
  });
}

function readAllEntries(db: IDBDatabase, storeName: string): Promise<QueueEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.map(normalizeEntry) : []);
    request.onerror = () => reject(request.error ?? new Error("Could not read offline journal"));
  });
}

async function writeAllEntries(db: IDBDatabase, storeName: string, entries: QueueEntry[]): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
  for (const entry of entries) {
    store.put(normalizeEntry(entry));
  }
  await transactionDone(tx);
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Offline journal transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Offline journal transaction aborted"));
  });
}

function readLocalStorageEntries(key: string): QueueEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortEntries(parsed.map(normalizeEntry)) : [];
  } catch {
    return [];
  }
}

function removeLocalStorageKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best effort migration cleanup.
  }
}

function normalizeEntry(raw: Partial<QueueEntry>): QueueEntry {
  const kind = isQueueKind(raw.kind) ? raw.kind : "sale";
  const status = raw.status === "blocked" ? "blocked" : "pending";
  const createdAt = typeof raw.createdAt === "string" && raw.createdAt
    ? raw.createdAt
    : new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(kind),
    uuid: typeof raw.uuid === "string" && raw.uuid ? raw.uuid : makeUuid(),
    kind,
    kioskId: typeof raw.kioskId === "string" && raw.kioskId ? raw.kioskId : "UNKNOWN",
    payload: raw.payload,
    createdAt,
    attempts: typeof raw.attempts === "number" && Number.isFinite(raw.attempts) ? raw.attempts : 0,
    status,
    clientVersion: 1,
    cashier: typeof raw.cashier === "string" ? raw.cashier : undefined,
    receiptNumber: typeof raw.receiptNumber === "string" ? raw.receiptNumber : undefined,
    lastAttemptAt: typeof raw.lastAttemptAt === "string" ? raw.lastAttemptAt : undefined,
    lastError: typeof raw.lastError === "string" ? raw.lastError : undefined,
  };
}

function mergeEntries(primary: QueueEntry[], legacy: QueueEntry[]) {
  const byId = new Map<string, QueueEntry>();
  for (const entry of [...primary, ...legacy]) {
    byId.set(entry.id, normalizeEntry(entry));
  }
  return sortEntries([...byId.values()]);
}

function sortEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    return byDate || a.id.localeCompare(b.id);
  });
}

function isQueueKind(value: unknown): value is QueueKind {
  return value === "sale" || value === "waste" || value === "transfer" || value === "shift_close";
}

function makeId(kind: QueueKind) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}-${ts}-${rand}`;
}

function makeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `bayaan-${ts}-${rand}`;
}
