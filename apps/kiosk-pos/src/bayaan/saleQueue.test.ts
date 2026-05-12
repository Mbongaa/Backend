import { describe, it, expect, vi, beforeEach } from "vitest";
import { SaleQueue, createMemoryStorage, type QueueEntry } from "./saleQueue";

describe("SaleQueue", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let queue: SaleQueue;

  beforeEach(() => {
    storage = createMemoryStorage();
    queue = new SaleQueue({ storage });
  });

  it("starts empty", () => {
    expect(queue.size()).toBe(0);
    expect(queue.list()).toEqual([]);
  });

  it("enqueues sales with metadata", () => {
    const entry = queue.enqueue({
      kind: "sale",
      kioskId: "K-01",
      payload: { external_id: "BAY-K-01-1", items: [], payments: [] },
    });
    expect(entry.kind).toBe("sale");
    expect(entry.kioskId).toBe("K-01");
    expect(entry.attempts).toBe(0);
    expect(entry.createdAt).toMatch(/^\d{4}-/);
    expect(queue.size()).toBe(1);
  });

  it("removes entries on successful flush", async () => {
    queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    queue.enqueue({ kind: "waste", kioskId: "K-01", payload: { id: "b" } });
    const submit = vi.fn().mockResolvedValue({ id: 1 });
    const result = await queue.flush(submit);
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(queue.size()).toBe(0);
  });

  it("keeps failing entries and increments attempts", async () => {
    queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    const submit = vi.fn().mockRejectedValue(new Error("network down"));
    const first = await queue.flush(submit);
    expect(first.ok).toBe(0);
    expect(first.failed).toBe(1);
    expect(first.remaining).toBe(1);

    const after = queue.list()[0];
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBe("network down");
    expect(after.lastAttemptAt).toMatch(/^\d{4}-/);

    const second = await queue.flush(submit);
    expect(second.failed).toBe(1);
    expect(queue.list()[0].attempts).toBe(2);
  });

  it("partial-success: removes the ok entry, keeps the failing one", async () => {
    queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { tag: "ok" } });
    queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { tag: "fail" } });
    const submit = vi.fn(async (entry: QueueEntry) => {
      const tag = (entry.payload as { tag: string }).tag;
      if (tag === "fail") throw new Error("boom");
      return { id: 1 };
    });
    const result = await queue.flush(submit);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
    expect(queue.list()[0].payload).toEqual({ tag: "fail" });
  });

  it("does not flush concurrently", async () => {
    queue.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    let resolveSubmit: ((value: unknown) => void) | undefined;
    const submit = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const first = queue.flush(submit);
    const second = await queue.flush(submit);
    expect(second).toEqual({ ok: 0, failed: 0, remaining: 1 });
    expect(submit).toHaveBeenCalledTimes(1);
    resolveSubmit?.({ id: 1 });
    await first;
  });

  it("respects maxAttempts and stops retrying", async () => {
    const limited = new SaleQueue({ storage, maxAttempts: 2 });
    limited.enqueue({ kind: "sale", kioskId: "K-01", payload: { id: "a" } });
    const submit = vi.fn().mockRejectedValue(new Error("x"));
    await limited.flush(submit);
    await limited.flush(submit);
    expect(limited.list()[0].attempts).toBe(2);
    const third = await limited.flush(submit);
    expect(third.failed).toBe(0);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(limited.pending()).toEqual([]);
    expect(limited.size()).toBe(1);
  });

  it("calls onChange listener on enqueue / remove / flush", () => {
    const onChange = vi.fn();
    const observed = new SaleQueue({ storage, onChange });
    const entry = observed.enqueue({ kind: "sale", kioskId: "K-01", payload: {} });
    expect(onChange).toHaveBeenCalledTimes(1);
    observed.remove(entry.id);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("survives storage reads that throw", () => {
    const broken = {
      read() {
        return [];
      },
      write() {
        throw new Error("disk full");
      },
    };
    const safe = new SaleQueue({ storage: broken });
    expect(() =>
      safe.enqueue({ kind: "sale", kioskId: "K-01", payload: {} }),
    ).toThrow(/disk full/);
  });
});
