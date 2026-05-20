import { describe, it, expect, vi, beforeEach } from "vitest";
import { SaleQueue, createMemoryStorage, type QueueEntry } from "./saleQueue";

describe("SaleQueue", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let queue: SaleQueue;

  beforeEach(() => {
    storage = createMemoryStorage();
    queue = new SaleQueue({ storage });
  });

  it("starts empty", async () => {
    await expect(queue.size()).resolves.toBe(0);
    await expect(queue.list()).resolves.toEqual([]);
  });

  it("enqueues sales with durable metadata", async () => {
    const entry = await queue.enqueue({
      kind: "sale",
      kioskId: "K-01",
      cashier: "Maya",
      receiptNumber: "BAY-K-01-1",
      payload: { external_id: "BAY-K-01-1", items: [], payments: [] },
    });
    expect(entry.kind).toBe("sale");
    expect(entry.kioskId).toBe("K-01");
    expect(entry.cashier).toBe("Maya");
    expect(entry.receiptNumber).toBe("BAY-K-01-1");
    expect(entry.uuid).toMatch(/\w/);
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(0);
    expect(entry.createdAt).toMatch(/^\d{4}-/);
    await expect(queue.size()).resolves.toBe(1);
  });

  it("removes entries on successful flush", async () => {
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    await queue.enqueue({ kind: "waste", kioskId: "K-01", payload: { id: "b" } });
    const submit = vi.fn().mockResolvedValue({ id: 1 });
    const result = await queue.flush(submit);
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.blocked).toBe(0);
    expect(submit).toHaveBeenCalledTimes(2);
    await expect(queue.size()).resolves.toBe(0);
  });

  it("keeps failing retryable entries and increments attempts", async () => {
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    const submit = vi.fn().mockRejectedValue(new Error("network down"));
    const first = await queue.flush(submit);
    expect(first.ok).toBe(0);
    expect(first.failed).toBe(1);
    expect(first.remaining).toBe(1);

    const after = (await queue.list())[0];
    expect(after.attempts).toBe(1);
    expect(after.status).toBe("pending");
    expect(after.lastError).toBe("network down");
    expect(after.lastAttemptAt).toMatch(/^\d{4}-/);

    const second = await queue.flush(submit);
    expect(second.failed).toBe(1);
    expect((await queue.list())[0].attempts).toBe(2);
  });

  it("marks non-retryable rejects as blocked for reconciliation", async () => {
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "bad-product" } });
    const submit = vi.fn().mockRejectedValue(new Error("Unknown product"));
    const result = await queue.flush(submit, { shouldRetry: () => false });
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.blocked).toBe(1);
    const [blocked] = await queue.blocked();
    expect(blocked.status).toBe("blocked");
    expect(blocked.lastError).toBe("Unknown product");
  });

  it("partial-success: removes the ok entry, keeps the failing one", async () => {
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { tag: "ok" } });
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { tag: "fail" } });
    const submit = vi.fn(async (entry: QueueEntry) => {
      const tag = (entry.payload as { tag: string }).tag;
      if (tag === "fail") throw new Error("boom");
      return { id: 1 };
    });
    const result = await queue.flush(submit);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
    expect((await queue.list())[0].payload).toEqual({ tag: "fail" });
  });

  it("does not flush concurrently", async () => {
    await queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    let resolveSubmit: ((value: unknown) => void) | undefined;
    const submit = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const first = queue.flush(submit);
    const second = await queue.flush(submit);
    expect(second).toEqual({ ok: 0, failed: 0, remaining: 1, blocked: 0 });
    expect(submit).toHaveBeenCalledTimes(1);
    resolveSubmit?.({ id: 1 });
    await first;
  });

  it("respects maxAttempts and stops retrying", async () => {
    const limited = new SaleQueue({ storage, maxAttempts: 2 });
    await limited.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    const submit = vi.fn().mockRejectedValue(new Error("x"));
    await limited.flush(submit);
    await limited.flush(submit);
    expect((await limited.list())[0].attempts).toBe(2);
    const third = await limited.flush(submit);
    expect(third.failed).toBe(0);
    expect(submit).toHaveBeenCalledTimes(2);
    await expect(limited.pending()).resolves.toEqual([]);
    await expect(limited.size()).resolves.toBe(1);
  });

  it("calls onChange listener on enqueue / remove", async () => {
    const onChange = vi.fn();
    const observed = new SaleQueue({ storage, onChange });
    const entry = await observed.enqueue({ kind: "sale", kioskId: "K-01", payload: {} });
    expect(onChange).toHaveBeenCalledTimes(1);
    await observed.remove(entry.id);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reports storage write failures to the caller", async () => {
    const broken = {
      async read() {
        return [];
      },
      async write() {
        throw new Error("disk full");
      },
    };
    const safe = new SaleQueue({ storage: broken });
    await expect(
      safe.enqueue({ kind: "sale", kioskId: "K-01", payload: {} }),
    ).rejects.toThrow(/disk full/);
  });
});
