import { describe, expect, it } from "vitest";
import type { IdempotencyRecord } from "@grantledger/contracts";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  MissingIdempotencyKeyError,
  type AsyncIdempotencyStore,
  type IdempotencyBeginOutcome,
} from "./idempotency.js";

function createStore<T>(): AsyncIdempotencyStore<T> {
  const map = new Map<string, IdempotencyRecord<T>>();

  return {
    async get(scope: string, key: string) {
      return map.get(`${scope}:${key}`) ?? null;
    },
    async set(scope: string, key: string, record: IdempotencyRecord<T>) {
      map.set(`${scope}:${key}`, record);
    },
  };
}

function createStoreWithAtomicBegin<T>(): AsyncIdempotencyStore<T> {
  const map = new Map<string, IdempotencyRecord<T>>();

  return {
    async get(scope: string, key: string) {
      return map.get(`${scope}:${key}`) ?? null;
    },
    async set(scope: string, key: string, record: IdempotencyRecord<T>) {
      map.set(`${scope}:${key}`, record);
    },
    async begin(
      scope: string,
      key: string,
      payloadHash: string,
      startedAt: string,
    ): Promise<IdempotencyBeginOutcome<T>> {
      const composite = `${scope}:${key}`;
      const existing = map.get(composite);

      if (!existing) {
        map.set(composite, {
          key,
          payloadHash,
          status: "processing",
          createdAt: startedAt,
          updatedAt: startedAt,
        });
        return { outcome: "started" };
      }

      if (existing.payloadHash !== payloadHash) {
        return { outcome: "conflict" };
      }

      if (existing.status === "processing") {
        return { outcome: "in_progress" };
      }

      if (existing.status === "completed") {
        return { outcome: "replay", record: existing };
      }

      map.set(composite, {
        key,
        payloadHash,
        status: "processing",
        createdAt: existing.createdAt,
        updatedAt: startedAt,
      });

      return { outcome: "started" };
    },
  };
}

describe("executeIdempotent", () => {
  it("throws when idempotency key is missing", async () => {
    await expect(
      executeIdempotent({
        scope: "test",
        key: null,
        payload: { a: 1 },
        store: createStore<{ ok: boolean }>(),
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(MissingIdempotencyKeyError);
  });

  it("executes first time and replays second time", async () => {
    const store = createStore<{ ok: boolean }>();

    const first = await executeIdempotent({
      scope: "test",
      key: "k1",
      payload: { a: 1 },
      store,
      execute: async () => ({ ok: true }),
    });

    const second = await executeIdempotent({
      scope: "test",
      key: "k1",
      payload: { a: 1 },
      store,
      execute: async () => ({ ok: false }),
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.response).toEqual({ ok: true });
  });

  it("throws conflict for same key and different payload", async () => {
    const store = createStore<{ ok: boolean }>();

    await executeIdempotent({
      scope: "test",
      key: "k1",
      payload: { a: 1 },
      store,
      execute: async () => ({ ok: true }),
    });

    await expect(
      executeIdempotent({
        scope: "test",
        key: "k1",
        payload: { a: 2 },
        store,
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("throws in-progress when same key is already processing", async () => {
    const store = createStoreWithAtomicBegin<{ ok: boolean }>();

    let releaseFirstExecution!: () => void;
    const firstExecutionGate = new Promise<void>((resolve) => {
      releaseFirstExecution = resolve;
    });

    const firstPromise = executeIdempotent({
      scope: "test",
      key: "same-key",
      payload: { a: 1 },
      store,
      execute: async () => {
        await firstExecutionGate;
        return { ok: true };
      },
    });

    await Promise.resolve();

    await expect(
      executeIdempotent({
        scope: "test",
        key: "same-key",
        payload: { a: 1 },
        store,
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);

    releaseFirstExecution();
    await firstPromise;
  });

  it("allows retry after failed execution with same key and payload", async () => {
    const store = createStoreWithAtomicBegin<{ ok: boolean }>();

    await expect(
      executeIdempotent({
        scope: "test",
        key: "retry-key",
        payload: { a: 1 },
        store,
        execute: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    const second = await executeIdempotent({
      scope: "test",
      key: "retry-key",
      payload: { a: 1 },
      store,
      execute: async () => ({ ok: true }),
    });

    expect(second.replayed).toBe(false);
    expect(second.response).toEqual({ ok: true });
  });
});
