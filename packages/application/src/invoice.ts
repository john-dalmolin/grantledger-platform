import { randomUUID } from "node:crypto";
import type {
  EnqueueInvoiceGenerationPayload,
  EnqueueInvoiceGenerationResponse,
  GenerateInvoiceForCycleInput,
  GetInvoiceGenerationJobStatusResponse,
  Invoice,
  InvoiceAuditEvent,
  InvoiceGenerationJobStatus,
} from "@grantledger/contracts";
import {
  assertInvoiceTotalDerivedFromLines,
  buildDeterministicCycleKey,
  buildInvoiceSnapshot,
  calculateInvoiceBreakdown,
  calculateInvoiceLines,
} from "@grantledger/domain";
import { hashPayload, utcNowIso } from "@grantledger/shared";
import {
  createInMemoryAsyncIdempotencyStore,
  executeIdempotent,
  type AsyncIdempotencyStore,
} from "./idempotency.js";
import { NotFoundError } from "./errors.js";

export interface InvoiceRepository {
  findByCycleKey(cycleKey: string): Promise<Invoice | null>;
  save(invoice: Invoice, cycleKey: string): Promise<void>;
}

export interface InvoiceAuditLogger {
  log(event: InvoiceAuditEvent): Promise<void>;
}

export interface InvoiceGenerationJob {
  id: string;
  status: InvoiceGenerationJobStatus;
  cycleKey: string;
  input: GenerateInvoiceForCycleInput;
  createdAt: string;
  updatedAt: string;
  invoiceId?: string;
  reason?: string;
}

export interface InvoiceJobStore {
  enqueue(job: InvoiceGenerationJob): Promise<void>;
  claimNext(): Promise<InvoiceGenerationJob | null>;
  get(jobId: string): Promise<InvoiceGenerationJob | null>;
  markCompleted(jobId: string, invoiceId: string): Promise<void>;
  markFailed(jobId: string, reason: string): Promise<void>;
}

export interface InvoiceUseCaseDeps {
  invoiceRepository: InvoiceRepository;
  invoiceAuditLogger: InvoiceAuditLogger;
  invoiceJobStore: InvoiceJobStore;
  enqueueIdempotencyStore: AsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>;
  processIdempotencyStore: AsyncIdempotencyStore<{ invoiceId: string }>;
  now?: () => string;
  generateId?: () => string;
}

export interface EnqueueInvoiceGenerationInput {
  idempotencyKey: string | null;
  payload: EnqueueInvoiceGenerationPayload;
}

export interface EnqueueInvoiceGenerationResult
  extends EnqueueInvoiceGenerationResponse {
  replayed: boolean;
}

export type ProcessNextInvoiceGenerationJobResult =
  | { status: "no_job" }
  | { status: "processed"; jobId: string; invoiceId: string }
  | { status: "failed"; jobId: string; reason: string };

export class InvoiceGenerationJobNotFoundError extends NotFoundError {
  constructor(message = "Invoice generation job not found") {
    super(message);
  }
}

function resolveNow(deps: Pick<InvoiceUseCaseDeps, "now">): string {
  return (deps.now ?? utcNowIso)();
}

function resolveId(deps: Pick<InvoiceUseCaseDeps, "generateId">): string {
  return (deps.generateId ?? randomUUID)();
}

function buildEnqueueFingerprint(
  payload: EnqueueInvoiceGenerationPayload | undefined,
): string {
  if (!payload) {
    return hashPayload(null);
  }

  const cycleKey = buildDeterministicCycleKey(payload);
  const inputHash = hashPayload(payload);

  return hashPayload({ cycleKey, inputHash });
}

function cloneJob(job: InvoiceGenerationJob): InvoiceGenerationJob {
  return {
    ...job,
    input: { ...job.input },
  };
}

function requireJob(
  store: Map<string, InvoiceGenerationJob>,
  jobId: string,
): InvoiceGenerationJob {
  const job = store.get(jobId);
  if (!job) {
    throw new InvoiceGenerationJobNotFoundError();
  }
  return job;
}

export function createInMemoryInvoiceRepository(): InvoiceRepository {
  const byCycleKey = new Map<string, Invoice>();

  return {
    async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
      return byCycleKey.get(cycleKey) ?? null;
    },
    async save(invoice: Invoice, cycleKey: string): Promise<void> {
      byCycleKey.set(cycleKey, invoice);
    },
  };
}

export function createConsoleInvoiceAuditLogger(): InvoiceAuditLogger {
  return {
    async log(event: InvoiceAuditEvent): Promise<void> {
      console.log(JSON.stringify({ type: "invoice_audit", ...event }));
    },
  };
}

export function createInMemoryInvoiceJobStore(
  now: () => string = utcNowIso,
): InvoiceJobStore {
  const jobs = new Map<string, InvoiceGenerationJob>();

  return {
    async enqueue(job: InvoiceGenerationJob): Promise<void> {
      jobs.set(job.id, cloneJob(job));
    },
    async claimNext(): Promise<InvoiceGenerationJob | null> {
      for (const [jobId, candidate] of jobs.entries()) {
        if (candidate.status !== "queued") {
          continue;
        }

        const updatedAt = now();
        const claimed: InvoiceGenerationJob = {
          ...candidate,
          status: "processing",
          updatedAt,
        };

        jobs.set(jobId, claimed);
        return cloneJob(claimed);
      }

      return null;
    },
    async get(jobId: string): Promise<InvoiceGenerationJob | null> {
      const job = jobs.get(jobId);
      return job ? cloneJob(job) : null;
    },
    async markCompleted(jobId: string, invoiceId: string): Promise<void> {
      const current = requireJob(jobs, jobId);
      jobs.set(jobId, {
        ...current,
        status: "completed",
        invoiceId,
        updatedAt: now(),
      });
    },
    async markFailed(jobId: string, reason: string): Promise<void> {
      const current = requireJob(jobs, jobId);
      jobs.set(jobId, {
        ...current,
        status: "failed",
        reason,
        updatedAt: now(),
      });
    },
  };
}

export function createDefaultInvoiceUseCaseDeps(): InvoiceUseCaseDeps {
  return {
    invoiceRepository: createInMemoryInvoiceRepository(),
    invoiceAuditLogger: createConsoleInvoiceAuditLogger(),
    invoiceJobStore: createInMemoryInvoiceJobStore(),
    enqueueIdempotencyStore:
      createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>(),
    processIdempotencyStore:
      createInMemoryAsyncIdempotencyStore<{ invoiceId: string }>(),
  };
}

const sharedInvoiceUseCaseDeps = createDefaultInvoiceUseCaseDeps();

export function getSharedInvoiceUseCaseDeps(): InvoiceUseCaseDeps {
  return sharedInvoiceUseCaseDeps;
}

export async function enqueueInvoiceGeneration(
  deps: InvoiceUseCaseDeps,
  input: EnqueueInvoiceGenerationInput,
): Promise<EnqueueInvoiceGenerationResult> {
  const { response, replayed } = await executeIdempotent<
    EnqueueInvoiceGenerationPayload,
    EnqueueInvoiceGenerationResponse
  >({
    scope: "invoice.enqueue",
    key: input.idempotencyKey,
    payload: input.payload,
    fingerprint: buildEnqueueFingerprint,
    store: deps.enqueueIdempotencyStore,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    execute: async () => {
      const createdAt = resolveNow(deps);
      const cycleKey = buildDeterministicCycleKey(input.payload);
      const jobId = resolveId(deps);
      const job: InvoiceGenerationJob = {
        id: jobId,
        status: "queued",
        cycleKey,
        input: input.payload,
        createdAt,
        updatedAt: createdAt,
      };

      await deps.invoiceJobStore.enqueue(job);

      return {
        jobId,
        status: "queued" as const,
      };
    },
  });

  return {
    ...response,
    replayed,
  };
}

function buildInvoice(
  deps: InvoiceUseCaseDeps,
  input: GenerateInvoiceForCycleInput,
): Invoice {
  const createdAt = resolveNow(deps);
  const lines = calculateInvoiceLines(input);
  const breakdown = calculateInvoiceBreakdown(lines);
  const snapshot = buildInvoiceSnapshot(input);

  const invoice: Invoice = {
    id: resolveId(deps),
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    status: "issued",
    snapshot,
    lines,
    breakdown,
    issuedAt: createdAt,
    createdAt,
  };

  assertInvoiceTotalDerivedFromLines(invoice);
  return invoice;
}

export async function processNextInvoiceGenerationJob(
  deps: InvoiceUseCaseDeps,
): Promise<ProcessNextInvoiceGenerationJobResult> {
  const job = await deps.invoiceJobStore.claimNext();

  if (!job) {
    return { status: "no_job" };
  }

  try {
    const { response } = await executeIdempotent({
      scope: "invoice.process",
      key: job.id,
      payload: {
        jobId: job.id,
        cycleKey: job.cycleKey,
        input: job.input,
      },
      store: deps.processIdempotencyStore,
      ...(deps.now !== undefined ? { now: deps.now } : {}),
      execute: async () => {
        const existingInvoice = await deps.invoiceRepository.findByCycleKey(
          job.cycleKey,
        );

        if (existingInvoice) {
          return { invoiceId: existingInvoice.id };
        }

        const invoice = buildInvoice(deps, job.input);
        await deps.invoiceRepository.save(invoice, job.cycleKey);
        await deps.invoiceAuditLogger.log({
          action: "invoice.generate",
          tenantId: invoice.tenantId,
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          traceId: job.input.traceId,
          occurredAt: resolveNow(deps),
          metadata: {
            jobId: job.id,
            cycleKey: job.cycleKey,
            calculationVersion: job.input.calculationVersion,
          },
        });

        return { invoiceId: invoice.id };
      },
    });

    await deps.invoiceJobStore.markCompleted(job.id, response.invoiceId);

    return {
      status: "processed",
      jobId: job.id,
      invoiceId: response.invoiceId,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Unexpected invoice processing failure";

    await deps.invoiceJobStore.markFailed(job.id, reason);

    return {
      status: "failed",
      jobId: job.id,
      reason,
    };
  }
}

export async function getInvoiceGenerationJobStatus(
  deps: Pick<InvoiceUseCaseDeps, "invoiceJobStore">,
  jobId: string,
  tenantId?: string,
): Promise<GetInvoiceGenerationJobStatusResponse> {
  const job = await deps.invoiceJobStore.get(jobId);

  if (!job) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  if (tenantId !== undefined && job.input.tenantId !== tenantId) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  return {
    jobId: job.id,
    status: job.status,
    ...(job.invoiceId !== undefined ? { invoiceId: job.invoiceId } : {}),
    ...(job.reason !== undefined ? { reason: job.reason } : {}),
  };
}
