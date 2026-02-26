import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { IdempotencyRecord, Subscription } from "@grantledger/contracts";
import type { Pool } from "pg";
import {
  createPostgresAsyncIdempotencyStore,
  createPostgresPool,
  createPostgresSubscriptionRepository,
} from "./index.js";

const shouldRun =
  process.env.RUN_PG_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const describePg = shouldRun ? describe : describe.skip;

describePg("postgres tenant isolation", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPostgresPool();
    const migrationSql = readFileSync(
      resolve(process.cwd(), "db/migrations/0001_arch_015_core_tables.sql"),
      "utf8",
    );
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("isolates subscription reads across tenants via RLS", async () => {
    const tenantA = "t_rls_a";
    const tenantB = "t_rls_b";
    const subscriptionId = "sub_rls_1";

    const repoA = createPostgresSubscriptionRepository(pool, tenantA);
    const repoB = createPostgresSubscriptionRepository(pool, tenantB);

    const subscription: Subscription = {
      id: subscriptionId,
      tenantId: tenantA,
      customerId: "cus_rls_a",
      planId: "plan_basic",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriod: {
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-02-01T00:00:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await repoA.create(subscription);

    const visibleForA = await repoA.findById(subscriptionId);
    const visibleForB = await repoB.findById(subscriptionId);

    expect(visibleForA?.id).toBe(subscriptionId);
    expect(visibleForB).toBeNull();
  });

  it("isolates idempotency records across tenants via RLS", async () => {
    const tenantA = "t_rls_a";
    const tenantB = "t_rls_b";
    const scope = "invoice.enqueue";
    const key = "idem_rls_1";

    const storeA = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(
      pool,
      tenantA,
    );
    const storeB = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(
      pool,
      tenantB,
    );

    const record: IdempotencyRecord<{ ok: boolean }> = {
      key,
      payloadHash: "hash_rls_1",
      status: "completed",
      response: { ok: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await storeA.set(scope, key, record);

    const foundA = await storeA.get(scope, key);
    const foundB = await storeB.get(scope, key);

    expect(foundA?.response).toEqual({ ok: true });
    expect(foundB).toBeNull();
  });
});
