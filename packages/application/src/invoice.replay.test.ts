import { describe, expect, it } from "vitest";
import type {
  EnqueueInvoiceGenerationPayload,
  EnqueueInvoiceGenerationResponse,
  Invoice,
  InvoiceAuditEvent,
} from "@grantledger/contracts";
import { createInMemoryAsyncIdempotencyStore } from "./idempotency.js";
import {
  createInMemoryInvoiceJobStore,
  enqueueInvoiceGeneration,
  processNextInvoiceGenerationJob,
  replayInvoiceGenerationJob,
  InvoiceGenerationJobNotFoundError,
  InvoiceJobReplayNotAllowedError,
  type InvoiceAuditLogger,
  type InvoiceRepository,
  type InvoiceUseCaseDeps,
} from "./invoice.js";
import { createInMemoryInvoiceOpsMonitor } from "./invoice-ops.js";

class NoopInvoiceAuditLogger implements InvoiceAuditLogger {
  async log(_event: InvoiceAuditEvent): Promise<void> {
    void _event;
  }
}

class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly byCycleKey = new Map<string, Invoice>();

  async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
    return this.byCycleKey.get(cycleKey) ?? null;
  }

  async save(invoice: Invoice, cycleKey: string): Promise<void> {
    this.byCycleKey.set(cycleKey, invoice);
  }
}

class FailingInvoiceRepository implements InvoiceRepository {
  async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
    void cycleKey;
    return null;
  }

  async save(_invoice: Invoice, _cycleKey: string): Promise<void> {
    void _invoice;
    void _cycleKey;
    throw new Error("repository unavailable");
  }
}

function makePayload(
  overrides: Partial<EnqueueInvoiceGenerationPayload> = {},
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

function buildSeedInvoice(
  id: string,
  payload: EnqueueInvoiceGenerationPayload,
): Invoice {
  return {
    id,
    tenantId: payload.tenantId,
    subscriptionId: payload.subscriptionId,
    status: "issued",
    snapshot: {
      subscriptionId: payload.subscriptionId,
      tenantId: payload.tenantId,
      customerId: payload.customerId,
      planId: payload.planId,
      planVersionId: payload.planVersionId,
      priceAmountInCents: payload.priceAmountInCents,
      currency: payload.currency,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      calculationVersion: payload.calculationVersion,
    },
    lines: [],
    breakdown: {
      subtotalInCents: 0,
      discountInCents: 0,
      taxInCents: 0,
      totalInCents: 0,
    },
    issuedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
  };
}

function makeDeps(input?: {
  repository?: InvoiceRepository;
  now?: () => string;
  monitor?: ReturnType<typeof createInMemoryInvoiceOpsMonitor>;
}): InvoiceUseCaseDeps {
  let nextId = 0;

  const deps: InvoiceUseCaseDeps = {
    invoiceRepository: input?.repository ?? new InMemoryInvoiceRepository(),
    invoiceAuditLogger: new NoopInvoiceAuditLogger(),
    invoiceJobStore: createInMemoryInvoiceJobStore(
      input?.now ?? (() => new Date().toISOString()),
    ),
    enqueueIdempotencyStore:
      createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>(),
    processIdempotencyStore: createInMemoryAsyncIdempotencyStore<{
      invoiceId: string;
    }>(),
    ...(input?.monitor ? { jobObserver: input.monitor.observer } : {}),
    ...(input?.now ? { now: input.now } : {}),
    generateId: () => {
      nextId += 1;
      return `id_${nextId}`;
    },
  };

  return deps;
}

async function enqueueOne(
  deps: InvoiceUseCaseDeps,
  idempotencyKey: string,
): Promise<string> {
  const result = await enqueueInvoiceGeneration(deps, {
    idempotencyKey,
    payload: makePayload(),
  });

  return result.jobId;
}

describe("invoice replay controls", () => {
  it("throws not found when source job does not exist", async () => {
    const deps = makeDeps();

    await expect(
      replayInvoiceGenerationJob(deps, { jobId: "missing_job" }),
    ).rejects.toBeInstanceOf(InvoiceGenerationJobNotFoundError);
  });

  it("throws conflict when source job is not failed", async () => {
    const deps = makeDeps();
    const sourceJobId = await enqueueOne(deps, "idem-replay-1");

    await expect(
      replayInvoiceGenerationJob(deps, { jobId: sourceJobId }),
    ).rejects.toBeInstanceOf(InvoiceJobReplayNotAllowedError);
  });

  it("replays failed job by creating a new queued job", async () => {
    const deps = makeDeps({
      repository: new FailingInvoiceRepository(),
      now: createSteppingNow(),
    });

    const sourceJobId = await enqueueOne(deps, "idem-replay-2");

    const first = await processNextInvoiceGenerationJob(deps);
    const second = await processNextInvoiceGenerationJob(deps);
    const third = await processNextInvoiceGenerationJob(deps);

    expect(first.status).toBe("retry_scheduled");
    expect(second.status).toBe("retry_scheduled");
    expect(third.status).toBe("failed");

    const replay = await replayInvoiceGenerationJob(deps, {
      jobId: sourceJobId,
      reason: "manual retry after incident",
    });

    expect(replay.status).toBe("replayed");
    if (replay.status === "replayed") {
      expect(replay.replayOfJobId).toBe(sourceJobId);
      expect(replay.jobId).not.toBe(sourceJobId);
    }
  });

  it("skips replay when invoice already exists for cycle key", async () => {
    const repository = new InMemoryInvoiceRepository();
    const deps = makeDeps({
      repository,
      now: createSteppingNow(),
    });

    const sourceJobId = await enqueueOne(deps, "idem-replay-3");
    const sourceJob = await deps.invoiceJobStore.get(sourceJobId);

    expect(sourceJob).toBeTruthy();
    if (!sourceJob) {
      throw new Error("Expected source job to exist");
    }

    await deps.invoiceJobStore.markDeadLetter(
      sourceJobId,
      "forced failure for replay path",
    );

    const seededInvoice = buildSeedInvoice("inv_seed_1", sourceJob.input);
    await repository.save(seededInvoice, sourceJob.cycleKey);

    const seeded = await repository.findByCycleKey(sourceJob.cycleKey);
    expect(seeded?.id).toBe(seededInvoice.id);

    const replay = await replayInvoiceGenerationJob(deps, {
      jobId: sourceJobId,
    });

    expect(replay).toEqual({
      status: "skipped_already_completed",
      jobId: sourceJobId,
      invoiceId: seededInvoice.id,
    });
  });
});

describe("invoice ops monitor", () => {
  it("tracks queue, processing, retries, dead-letter and terminal failure rate", async () => {
    const monitor = createInMemoryInvoiceOpsMonitor();
    const deps = makeDeps({
      repository: new FailingInvoiceRepository(),
      now: createSteppingNow(),
      monitor,
    });

    const jobId = await enqueueOne(deps, "idem-monitor-1");

    const afterEnqueue = monitor.snapshot();
    expect(afterEnqueue.queueDepth).toBe(1);
    expect(afterEnqueue.processingCount).toBe(0);

    const first = await processNextInvoiceGenerationJob(deps);
    expect(first.status).toBe("retry_scheduled");

    const afterFirst = monitor.snapshot();
    expect(afterFirst.queueDepth).toBe(1);
    expect(afterFirst.retryScheduledCount).toBe(1);

    const second = await processNextInvoiceGenerationJob(deps);
    expect(second.status).toBe("retry_scheduled");

    const afterSecond = monitor.snapshot();
    expect(afterSecond.retryScheduledCount).toBe(2);

    const third = await processNextInvoiceGenerationJob(deps);
    expect(third).toEqual({
      status: "failed",
      jobId,
      reason: "repository unavailable",
    });

    const afterThird = monitor.snapshot();
    expect(afterThird.queueDepth).toBe(0);
    expect(afterThird.processingCount).toBe(0);
    expect(afterThird.completedCount).toBe(0);
    expect(afterThird.deadLetterCount).toBe(1);
    expect(afterThird.terminalFailureRate).toBe(1);
  });
});
