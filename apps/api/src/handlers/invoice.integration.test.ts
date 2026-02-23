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
  createInMemoryInvoiceRepository,
  processNextInvoiceGenerationJob,
  type InvoiceAuditLogger,
  type InvoiceRepository,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";
import type { Headers } from "../http/types.js";
import {
  handleEnqueueInvoiceGeneration,
  handleGetInvoiceGenerationJobStatus,
  type InvoiceHandlersDeps,
} from "./invoice.js";

class NoopInvoiceAuditLogger implements InvoiceAuditLogger {
  async log(_event: InvoiceAuditEvent): Promise<void> {
    void _event;
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
    throw new Error("repository unavailable");
  }
}

function asHeaders(value: Record<string, string>): Headers {
  return value as unknown as Headers;
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

function makeDeps(
  overrides: Partial<InvoiceUseCaseDeps> = {},
): InvoiceHandlersDeps {
  let nextId = 0;

  const invoiceUseCases: InvoiceUseCaseDeps = {
    invoiceRepository: createInMemoryInvoiceRepository(),
    invoiceAuditLogger: new NoopInvoiceAuditLogger(),
    invoiceJobStore: createInMemoryInvoiceJobStore(),
    enqueueIdempotencyStore:
      createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>(),
    processIdempotencyStore: createInMemoryAsyncIdempotencyStore<{
      invoiceId: string;
    }>(),
    generateId: () => {
      nextId += 1;
      return `id_${nextId}`;
    },
    ...overrides,
  };

  return { invoiceUseCases };
}

function authorizedHeaders(extra: Record<string, string> = {}): Headers {
  return asHeaders({
    "x-user-id": "u_1",
    "x-tenant-id": "t_1",
    ...extra,
  });
}

describe("invoice handler integration", () => {
  it("returns 400 for invalid enqueue payload", async () => {
    const response = await handleEnqueueInvoiceGeneration(
      authorizedHeaders({ "idempotency-key": "idem-1" }),
      {},
      makeDeps(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when idempotency-key is missing", async () => {
    const response = await handleEnqueueInvoiceGeneration(
      authorizedHeaders(),
      makePayload(),
      makeDeps(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 202 for valid enqueue and 202 replay with same job id", async () => {
    const deps = makeDeps();
    const headers = authorizedHeaders({ "idempotency-key": "idem-2" });
    const payload = makePayload();

    const first = await handleEnqueueInvoiceGeneration(headers, payload, deps);
    const second = await handleEnqueueInvoiceGeneration(headers, payload, deps);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((first.body as { jobId: string }).jobId).toBe(
      (second.body as { jobId: string }).jobId,
    );
  });

  it("returns 409 for same key with different payload", async () => {
    const deps = makeDeps();
    const headers = authorizedHeaders({ "idempotency-key": "idem-3" });

    const first = await handleEnqueueInvoiceGeneration(
      headers,
      makePayload(),
      deps,
    );
    const second = await handleEnqueueInvoiceGeneration(
      headers,
      makePayload({ periodEnd: "2026-03-02T00:00:00Z" }),
      deps,
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
  });

  it("returns queued and then completed on status handler after worker processing", async () => {
    const deps = makeDeps();
    const enqueueResponse = await handleEnqueueInvoiceGeneration(
      authorizedHeaders({ "idempotency-key": "idem-4" }),
      makePayload(),
      deps,
    );
    const jobId = (enqueueResponse.body as { jobId: string }).jobId;

    const queued = await handleGetInvoiceGenerationJobStatus(
      authorizedHeaders(),
      { jobId },
      deps,
    );

    expect(queued.status).toBe(200);
    expect(queued.body).toMatchObject({ jobId, status: "queued" });

    await processNextInvoiceGenerationJob(deps.invoiceUseCases);

    const completed = await handleGetInvoiceGenerationJobStatus(
      authorizedHeaders(),
      { jobId },
      deps,
    );

    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ jobId, status: "completed" });
  });

  it("returns failed status when processing fails", async () => {
    const deps = makeDeps({
      invoiceRepository: new FailingInvoiceRepository(),
    });
    const enqueue = await handleEnqueueInvoiceGeneration(
      authorizedHeaders({ "idempotency-key": "idem-5" }),
      makePayload(),
      deps,
    );
    const jobId = (enqueue.body as { jobId: string }).jobId;

    const processResult = await processNextInvoiceGenerationJob(
      deps.invoiceUseCases,
    );

    expect(processResult.status).toBe("retry_scheduled");

    const failed = await handleGetInvoiceGenerationJobStatus(
      authorizedHeaders(),
      { jobId },
      deps,
    );

    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ jobId, status: "queued" });
    expect((failed.body as { reason?: string }).reason).toContain(
      "repository unavailable",
    );
  });
});
