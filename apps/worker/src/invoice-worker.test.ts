import { describe, expect, it } from "vitest";
import type {
  EnqueueInvoiceGenerationResponse,
  GenerateInvoiceForCycleInput,
  Invoice,
  InvoiceAuditEvent,
} from "@grantledger/contracts";
import {
  createInMemoryAsyncIdempotencyStore,
  createInMemoryInvoiceJobStore,
  enqueueInvoiceGeneration,
  getInvoiceGenerationJobStatus,
  type InvoiceAuditLogger,
  type InvoiceRepository,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";
import { runInvoiceWorkerOnce } from "./invoice-worker.js";

class NoopInvoiceAuditLogger implements InvoiceAuditLogger {
  async log(_event: InvoiceAuditEvent): Promise<void> {
    void _event;
  }
}

class InMemoryCountingInvoiceRepository implements InvoiceRepository {
  public saveCount = 0;
  private readonly byCycleKey = new Map<string, Invoice>();

  async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
    return this.byCycleKey.get(cycleKey) ?? null;
  }

  async save(invoice: Invoice, cycleKey: string): Promise<void> {
    this.saveCount += 1;
    this.byCycleKey.set(cycleKey, invoice);
  }
}

class FailingInvoiceRepository implements InvoiceRepository {
  async findByCycleKey(_cycleKey: string): Promise<Invoice | null> {
    void _cycleKey;
    return null;
  }

  async save(_invoice: Invoice, _cycleKey: string): Promise<void> {
    void _invoice;
    void _cycleKey;
    throw new Error("unable to save invoice");
  }
}

function makePayload(
  overrides: Partial<GenerateInvoiceForCycleInput> = {},
): GenerateInvoiceForCycleInput {
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

function createSteppingNow(
  startIso = "2026-02-01T00:00:00.000Z",
  stepMs = 300_000,
): () => string {
  let current = Date.parse(startIso);

  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

function makeDeps(
  repository: InvoiceRepository,
  now: () => string = () => new Date().toISOString(),
): { invoiceUseCases: InvoiceUseCaseDeps } {
  let nextId = 0;

  return {
    invoiceUseCases: {
      invoiceRepository: repository,
      invoiceAuditLogger: new NoopInvoiceAuditLogger(),
      invoiceJobStore: createInMemoryInvoiceJobStore(now),
      enqueueIdempotencyStore:
        createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>(),
      processIdempotencyStore: createInMemoryAsyncIdempotencyStore<{
        invoiceId: string;
      }>(),
      now,
      generateId: () => {
        nextId += 1;
        return `id_${nextId}`;
      },
    },
  };
}

async function enqueueJob(
  deps: { invoiceUseCases: InvoiceUseCaseDeps },
  idempotencyKey: string,
): Promise<string> {
  const result = await enqueueInvoiceGeneration(deps.invoiceUseCases, {
    idempotencyKey,
    payload: makePayload(),
  });

  return result.jobId;
}

describe("invoice worker", () => {
  it("returns idle when no job is available", async () => {
    const deps = makeDeps(new InMemoryCountingInvoiceRepository());

    const result = await runInvoiceWorkerOnce(deps);

    expect(result).toEqual({ status: "idle" });
  });

  it("processes queued job and marks it completed", async () => {
    const repository = new InMemoryCountingInvoiceRepository();
    const deps = makeDeps(repository);
    const jobId = await enqueueJob(deps, "worker-idem-1");

    const result = await runInvoiceWorkerOnce(deps);
    const status = await getInvoiceGenerationJobStatus(
      deps.invoiceUseCases,
      jobId,
      "t_1",
    );

    expect(result).toEqual({ status: "processed", jobId });
    expect(status.status).toBe("completed");
    expect(status.invoiceId).toBeTruthy();
    expect(repository.saveCount).toBe(1);
  });

  it("schedules retry when processing raises an error", async () => {
    const deps = makeDeps(new FailingInvoiceRepository());
    const jobId = await enqueueJob(deps, "worker-idem-2");

    const result = await runInvoiceWorkerOnce(deps);
    const status = await getInvoiceGenerationJobStatus(
      deps.invoiceUseCases,
      jobId,
      "t_1",
    );

    expect(result).toEqual({ status: "failed", jobId });
    expect(status.status).toBe("queued");
    expect(status.reason).toContain("unable to save invoice");
  });

  it("marks job as failed after max attempts are exhausted", async () => {
    const steppingNow = createSteppingNow();
    const deps = makeDeps(new FailingInvoiceRepository(), steppingNow);

    const jobId = await enqueueJob(deps, "worker-idem-dead-letter");

    const first = await runInvoiceWorkerOnce(deps);
    const second = await runInvoiceWorkerOnce(deps);
    const third = await runInvoiceWorkerOnce(deps);
    const fourth = await runInvoiceWorkerOnce(deps);

    expect(first).toEqual({ status: "failed", jobId });
    expect(second).toEqual({ status: "failed", jobId });
    expect(third).toEqual({ status: "failed", jobId });
    expect(fourth).toEqual({ status: "idle" });

    const status = await getInvoiceGenerationJobStatus(
      deps.invoiceUseCases,
      jobId,
      "t_1",
    );

    expect(status.status).toBe("failed");
    expect(status.reason).toContain("unable to save invoice");
  });

  it("does not duplicate invoice creation on rerun after completion", async () => {
    const repository = new InMemoryCountingInvoiceRepository();
    const deps = makeDeps(repository);

    await enqueueJob(deps, "worker-idem-3");
    await enqueueJob(deps, "worker-idem-3");

    const firstRun = await runInvoiceWorkerOnce(deps);
    const secondRun = await runInvoiceWorkerOnce(deps);

    expect(firstRun.status).toBe("processed");
    expect(secondRun.status).toBe("idle");
    expect(repository.saveCount).toBe(1);
  });
});

it("continues processing when observer throws", async () => {
  const repository = new InMemoryCountingInvoiceRepository();
  const deps = makeDeps(repository);
  const jobId = await enqueueJob(deps, "worker-idem-observer");

  deps.invoiceUseCases.jobObserver = {
    onJobClaimed: () => {
      throw new Error("observer claim boom");
    },
    onJobCompleted: () => {
      throw new Error("observer completed boom");
    },
  };

  const result = await runInvoiceWorkerOnce(deps);
  const status = await getInvoiceGenerationJobStatus(
    deps.invoiceUseCases,
    jobId,
    "t_1",
  );

  expect(result).toEqual({ status: "processed", jobId });
  expect(status.status).toBe("completed");
  expect(repository.saveCount).toBe(1);
});
