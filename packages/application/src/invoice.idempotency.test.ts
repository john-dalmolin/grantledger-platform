import { describe, expect, it } from "vitest";
import type {
  EnqueueInvoiceGenerationPayload,
  EnqueueInvoiceGenerationResponse,
  GenerateInvoiceForCycleInput,
  InvoiceAuditEvent,
} from "@grantledger/contracts";
import {
  createInMemoryAsyncIdempotencyStore,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  type AsyncIdempotencyStore,
} from "./idempotency.js";
import {
  createInMemoryInvoiceJobStore,
  createInMemoryInvoiceRepository,
  enqueueInvoiceGeneration,
  type InvoiceAuditLogger,
  type InvoiceGenerationJob,
  type InvoiceJobStore,
  type InvoiceRepository,
  type InvoiceUseCaseDeps,
} from "./invoice.js";

class NoopInvoiceAuditLogger implements InvoiceAuditLogger {
  async log(_event: InvoiceAuditEvent): Promise<void> {
    void _event;
  }
}

function makePayload(
  overrides: Partial<GenerateInvoiceForCycleInput> = {},
): EnqueueInvoiceGenerationPayload {
  return {
    tenantId: "t_1",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    planId: "plan_basic",
    planVersionId: "plan_basic_v1",
    priceAmountInCents: 1000,
    currency: "USD",
    periodStart: "2026-02-01T00:00:00Z",
    periodEnd: "2026-03-01T00:00:00Z",
    calculationVersion: "v1",
    traceId: "trace-1",
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<InvoiceUseCaseDeps> = {},
): InvoiceUseCaseDeps {
  let nextId = 0;

  const invoiceRepository =
    createInMemoryInvoiceRepository() satisfies InvoiceRepository;
  const invoiceJobStore =
    createInMemoryInvoiceJobStore() satisfies InvoiceJobStore;
  const invoiceAuditLogger =
    new NoopInvoiceAuditLogger() satisfies InvoiceAuditLogger;
  const enqueueIdempotencyStore =
    createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>();
  const processIdempotencyStore =
    createInMemoryAsyncIdempotencyStore<{ invoiceId: string }>();

  return {
    invoiceRepository,
    invoiceAuditLogger,
    invoiceJobStore,
    enqueueIdempotencyStore,
    processIdempotencyStore,
    generateId: () => {
      nextId += 1;
      return `id_${nextId}`;
    },
    ...overrides,
  };
}

function createBlockingJobStore(
  base: InvoiceJobStore,
): { store: InvoiceJobStore; release: () => void; started: Promise<void> } {
  let firstCall = true;
  let release!: () => void;
  let startedResolve!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });

  const store: InvoiceJobStore = {
    enqueue: async (job: InvoiceGenerationJob) => {
      if (firstCall) {
        firstCall = false;
        startedResolve();
        await gate;
      }
      await base.enqueue(job);
    },
    claimNext: () => base.claimNext(),
    get: (jobId: string) => base.get(jobId),
    markCompleted: (jobId: string, invoiceId: string) =>
      base.markCompleted(jobId, invoiceId),
    markFailed: (jobId: string, reason: string) => base.markFailed(jobId, reason),
  };

  return { store, release, started };
}

function createFailingOnceEnqueueStore(base: InvoiceJobStore): InvoiceJobStore {
  let shouldFail = true;

  return {
    enqueue: async (job: InvoiceGenerationJob) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("enqueue failed");
      }
      await base.enqueue(job);
    },
    claimNext: () => base.claimNext(),
    get: (jobId: string) => base.get(jobId),
    markCompleted: (jobId: string, invoiceId: string) =>
      base.markCompleted(jobId, invoiceId),
    markFailed: (jobId: string, reason: string) => base.markFailed(jobId, reason),
  };
}

describe("invoice enqueue idempotency", () => {
  it("enqueues first request and returns queued job", async () => {
    const deps = makeDeps();

    const result = await enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-1",
      payload: makePayload(),
    });

    expect(result.replayed).toBe(false);
    expect(result.status).toBe("queued");
    expect(result.jobId).toBeTruthy();
  });

  it("replays when same key and payload are reused", async () => {
    const deps = makeDeps();
    const payload = makePayload();

    const first = await enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-2",
      payload,
    });

    const second = await enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-2",
      payload,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.jobId).toBe(first.jobId);
  });

  it("returns conflict for same key with different payload", async () => {
    const deps = makeDeps();

    await enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-3",
      payload: makePayload(),
    });

    await expect(
      enqueueInvoiceGeneration(deps, {
        idempotencyKey: "invoice-idem-3",
        payload: makePayload({ periodEnd: "2026-03-02T00:00:00Z" }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("returns in-progress for concurrent execution with same key", async () => {
    const baseDeps = makeDeps();
    const blocking = createBlockingJobStore(baseDeps.invoiceJobStore);
    const deps = makeDeps({
      invoiceRepository: baseDeps.invoiceRepository,
      invoiceAuditLogger: baseDeps.invoiceAuditLogger,
      enqueueIdempotencyStore:
        baseDeps.enqueueIdempotencyStore as AsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>,
      processIdempotencyStore: baseDeps.processIdempotencyStore,
      invoiceJobStore: blocking.store,
      generateId: baseDeps.generateId!,
    });
    const payload = makePayload();

    const firstPromise = enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-4",
      payload,
    });

    await blocking.started;

    await expect(
      enqueueInvoiceGeneration(deps, {
        idempotencyKey: "invoice-idem-4",
        payload,
      }),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);

    blocking.release();
    await firstPromise;
  });

  it("allows retry when first enqueue execution fails", async () => {
    const baseDeps = makeDeps();
    const deps = makeDeps({
      invoiceRepository: baseDeps.invoiceRepository,
      invoiceAuditLogger: baseDeps.invoiceAuditLogger,
      invoiceJobStore: createFailingOnceEnqueueStore(baseDeps.invoiceJobStore),
      enqueueIdempotencyStore: baseDeps.enqueueIdempotencyStore,
      processIdempotencyStore: baseDeps.processIdempotencyStore,
      generateId: baseDeps.generateId!,
    });
    const payload = makePayload();

    await expect(
      enqueueInvoiceGeneration(deps, {
        idempotencyKey: "invoice-idem-5",
        payload,
      }),
    ).rejects.toThrow("enqueue failed");

    const retry = await enqueueInvoiceGeneration(deps, {
      idempotencyKey: "invoice-idem-5",
      payload,
    });

    expect(retry.replayed).toBe(false);
    expect(retry.status).toBe("queued");
  });
});
