import { describe, expect, it } from "vitest";
import type { GenerateInvoiceForCycleInput } from "@grantledger/contracts";
import {
  InvoiceJobLeaseError,
  createInMemoryInvoiceJobStore,
  type InvoiceGenerationJob,
} from "./invoice.js";

function createMutableNow(startIso: string): {
  now: () => string;
  advanceSeconds: (seconds: number) => void;
} {
  let current = Date.parse(startIso);

  return {
    now: () => new Date(current).toISOString(),
    advanceSeconds: (seconds: number) => {
      current += seconds * 1000;
    },
  };
}

function buildInput(overrides: Partial<GenerateInvoiceForCycleInput> = {}): GenerateInvoiceForCycleInput {
  return {
    tenantId: "t_1",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    planId: "plan_basic",
    planVersionId: "plan_basic_v1",
    priceAmountInCents: 1000,
    currency: "USD",
    periodStart: "2026-02-01T00:00:00.000Z",
    periodEnd: "2026-03-01T00:00:00.000Z",
    calculationVersion: "v1",
    traceId: "trace-lease",
    ...overrides,
  };
}

function buildJob(id: string, nowIso: string): InvoiceGenerationJob {
  return {
    id,
    status: "queued",
    cycleKey: `${id}_cycle`,
    input: buildInput(),
    createdAt: nowIso,
    updatedAt: nowIso,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: nowIso,
  };
}

describe("invoice job lease store", () => {
  it("claims queued job with lease metadata", async () => {
    const { now } = createMutableNow("2026-02-01T00:00:00.000Z");
    const store = createInMemoryInvoiceJobStore(now);
    const job = buildJob("job_1", now());

    await store.enqueue(job);

    const claimed = await store.claimNext({
      workerId: "worker_a",
      leaseToken: "lease_a",
      leaseSeconds: 30,
    });

    expect(claimed?.status).toBe("processing");
    expect(claimed?.leaseOwner).toBe("worker_a");
    expect(claimed?.leaseToken).toBe("lease_a");
    expect(claimed?.leaseExpiresAt).toBe("2026-02-01T00:00:30.000Z");
  });

  it("reclaims expired lease and blocks stale worker completion", async () => {
    const { now, advanceSeconds } = createMutableNow("2026-02-01T00:00:00.000Z");
    const store = createInMemoryInvoiceJobStore(now);
    const job = buildJob("job_2", now());

    await store.enqueue(job);

    await store.claimNext({
      workerId: "worker_a",
      leaseToken: "lease_a",
      leaseSeconds: 5,
    });

    advanceSeconds(6);

    const reclaimed = await store.claimNext({
      workerId: "worker_b",
      leaseToken: "lease_b",
      leaseSeconds: 30,
    });

    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.leaseOwner).toBe("worker_b");
    expect(reclaimed?.leaseToken).toBe("lease_b");

    await expect(
      store.markCompleted(job.id, "inv_1", {
        workerId: "worker_a",
        leaseToken: "lease_a",
      }),
    ).rejects.toBeInstanceOf(InvoiceJobLeaseError);

    await expect(
      store.markCompleted(job.id, "inv_1", {
        workerId: "worker_b",
        leaseToken: "lease_b",
      }),
    ).resolves.toBeUndefined();
  });
});
