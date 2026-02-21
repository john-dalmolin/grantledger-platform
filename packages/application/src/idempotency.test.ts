import { describe, expect, it } from "vitest";
import type { IdempotencyRecord } from "@grantledger/contracts";
import {
  executeIdempotent,
  IdempotencyConflictError,
  MissingIdempotencyKeyError,
  type AsyncIdempotencyStore,
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
});
