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
import {
  addSecondsToIso,
  hashPayload,
  parseIsoToEpochMillis,
  utcNowIso,
} from "@grantledger/shared";
import {
  createInMemoryAsyncIdempotencyStore,
  executeIdempotent,
  type AsyncIdempotencyStore,
} from "./idempotency.js";
import { ConflictError, NotFoundError } from "./errors.js";

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
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  deadLetteredAt?: string;
  replayOfJobId?: string;
  replayReason?: string;
}

export interface InvoiceJobStore {
  enqueue(job: InvoiceGenerationJob): Promise<void>;
  claimNext(): Promise<InvoiceGenerationJob | null>;
  get(jobId: string): Promise<InvoiceGenerationJob | null>;
  markCompleted(jobId: string, invoiceId: string): Promise<void>;
  markRetry(
    jobId: string,
    reason: string,
    nextAttemptAt: string,
    attemptCount: number,
  ): Promise<void>;
  markDeadLetter(jobId: string, reason: string): Promise<void>;
}

export interface InvoiceJobObserver {
  onJobClaimed?(job: InvoiceGenerationJob): Promise<void> | void;
  onJobCompleted?(
    job: InvoiceGenerationJob,
    invoiceId: string,
  ): Promise<void> | void;
  onJobRetryScheduled?(
    job: InvoiceGenerationJob,
    reason: string,
    nextAttemptAt: string,
    attemptCount: number,
  ): Promise<void> | void;
  onJobDeadLettered?(
    job: InvoiceGenerationJob,
    reason: string,
  ): Promise<void> | void;
  onJobEnqueued?(job: InvoiceGenerationJob): Promise<void> | void;
}

export interface ReplayInvoiceGenerationJobInput {
  jobId: string;
  reason?: string;
}

export type ReplayInvoiceGenerationJobResult =
  | { status: "replayed"; jobId: string; replayOfJobId: string }
  | { status: "skipped_already_completed"; jobId: string; invoiceId: string };

const DEFAULT_MAX_ATTEMPTS = 3;
const noopInvoiceJobObserver: InvoiceJobObserver = {};

function observerOf(
  deps: Pick<InvoiceUseCaseDeps, "jobObserver">,
): InvoiceJobObserver {
  return deps.jobObserver ?? noopInvoiceJobObserver;
}

async function notifyObserver(
  event: string,
  callback: () => Promise<void> | void,
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unexpected observer failure";

    console.warn(
      JSON.stringify({
        type: "invoice_job_observer_error",
        event,
        reason,
      }),
    );
  }
}

export interface InvoiceUseCaseDeps {
  invoiceRepository: InvoiceRepository;
  invoiceAuditLogger: InvoiceAuditLogger;
  invoiceJobStore: InvoiceJobStore;
  jobObserver?: InvoiceJobObserver;
  enqueueIdempotencyStore: AsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>;
  processIdempotencyStore: AsyncIdempotencyStore<{ invoiceId: string }>;
  now?: () => string;
  generateId?: () => string;
}

export interface EnqueueInvoiceGenerationInput {
  idempotencyKey: string | null;
  payload: EnqueueInvoiceGenerationPayload;
}

export interface EnqueueInvoiceGenerationResult extends EnqueueInvoiceGenerationResponse {
  replayed: boolean;
}

export type ProcessNextInvoiceGenerationJobResult =
  | { status: "no_job" }
  | { status: "processed"; jobId: string; invoiceId: string }
  | {
      status: "retry_scheduled";
      jobId: string;
      reason: string;
      nextAttemptAt: string;
    }
  | { status: "failed"; jobId: string; reason: string };

export class InvoiceGenerationJobNotFoundError extends NotFoundError {
  constructor(message = "Invoice generation job not found") {
    super(message);
  }
}

export class InvoiceJobReplayNotAllowedError extends ConflictError {
  constructor(message = "Only failed jobs can be replayed") {
    super(message);
  }
}

function resolveNow(deps: Pick<InvoiceUseCaseDeps, "now">): string {
  return (deps.now ?? utcNowIso)();
}

function resolveId(deps: Pick<InvoiceUseCaseDeps, "generateId">): string {
  return (deps.generateId ?? randomUUID)();
}

function computeRetryDelaySeconds(attemptCount: number): number {
  return Math.min(2 ** attemptCount, 60);
}

function computeNextAttemptAt(nowIso: string, delaySeconds: number): string {
  return addSecondsToIso(nowIso, delaySeconds);
}

function buildEnqueueFingerprint(
  payload: EnqueueInvoiceGenerationPayload | undefined,
): string {
  if (!payload) {
    return hashPayload(null);
  }

  const cycleKey = buildDeterministicCycleKey(payload);
  const { traceId: _traceId, ...stableInput } = payload;
  void _traceId;

  const inputHash = hashPayload(stableInput);
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
      const nowIso = now();
      const nowMillis = parseIsoToEpochMillis(nowIso);

      for (const [jobId, candidate] of jobs.entries()) {
        if (candidate.status !== "queued") {
          continue;
        }

        let nextAttemptMillis: number;
        try {
          nextAttemptMillis = parseIsoToEpochMillis(candidate.nextAttemptAt);
        } catch {
          continue;
        }

        if (nextAttemptMillis > nowMillis) {
          continue;
        }

        const claimed: InvoiceGenerationJob = {
          ...candidate,
          status: "processing",
          updatedAt: nowIso,
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
        updatedAt: now(),
        invoiceId,
      });
    },

    async markRetry(
      jobId: string,
      reason: string,
      nextAttemptAt: string,
      attemptCount: number,
    ): Promise<void> {
      const current = requireJob(jobs, jobId);
      jobs.set(jobId, {
        ...current,
        status: "queued",
        reason,
        lastError: reason,
        attemptCount,
        nextAttemptAt,
        updatedAt: now(),
      });
    },
    async markDeadLetter(jobId: string, reason: string): Promise<void> {
      const current = requireJob(jobs, jobId);
      const deadLetteredAt = now();
      jobs.set(jobId, {
        ...current,
        status: "failed",
        reason,
        lastError: reason,
        deadLetteredAt,
        updatedAt: deadLetteredAt,
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
    processIdempotencyStore: createInMemoryAsyncIdempotencyStore<{
      invoiceId: string;
    }>(),
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
  const observer = observerOf(deps);

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
        attemptCount: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: createdAt,
      };

      await deps.invoiceJobStore.enqueue(job);
      await notifyObserver("job_enqueued", () => observer.onJobEnqueued?.(job));

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
  const observer = observerOf(deps);

  if (!job) {
    return { status: "no_job" };
  }

  await notifyObserver("job_claimed", () => observer.onJobClaimed?.(job));

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
    await notifyObserver("job_completed", () =>
      observer.onJobCompleted?.(job, response.invoiceId),
    );

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

    const nextAttempt = job.attemptCount + 1;

    if (nextAttempt < job.maxAttempts) {
      const nowIso = resolveNow(deps);
      const delaySeconds = computeRetryDelaySeconds(nextAttempt);
      const nextAttemptAt = computeNextAttemptAt(nowIso, delaySeconds);

      await deps.invoiceJobStore.markRetry(
        job.id,
        reason,
        nextAttemptAt,
        nextAttempt,
      );

      await notifyObserver("job_retry_scheduled", () =>
        observer.onJobRetryScheduled?.(job, reason, nextAttemptAt, nextAttempt),
      );

      return {
        status: "retry_scheduled",
        jobId: job.id,
        reason,
        nextAttemptAt,
      };
    }

    await deps.invoiceJobStore.markDeadLetter(job.id, reason);
    await notifyObserver("job_dead_lettered", () =>
      observer.onJobDeadLettered?.(job, reason),
    );

    return {
      status: "failed",
      jobId: job.id,
      reason,
    };
  }
}

export async function replayInvoiceGenerationJob(
  deps: InvoiceUseCaseDeps,
  input: ReplayInvoiceGenerationJobInput,
): Promise<ReplayInvoiceGenerationJobResult> {
  const sourceJob = await deps.invoiceJobStore.get(input.jobId);

  if (!sourceJob) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  if (sourceJob.status !== "failed") {
    throw new InvoiceJobReplayNotAllowedError();
  }

  const cycleKey =
    sourceJob.cycleKey && sourceJob.cycleKey.length > 0
      ? sourceJob.cycleKey
      : buildDeterministicCycleKey(sourceJob.input);

  const existingInvoice = await deps.invoiceRepository.findByCycleKey(cycleKey);

  if (existingInvoice) {
    return {
      status: "skipped_already_completed",
      jobId: sourceJob.id,
      invoiceId: existingInvoice.id,
    };
  }

  const nowIso = resolveNow(deps);
  const replayReason =
    input.reason?.trim() && input.reason.trim().length > 0
      ? input.reason.trim()
      : "manual replay";

  const replayJob: InvoiceGenerationJob = {
    ...sourceJob,
    id: resolveId(deps),
    status: "queued",
    cycleKey,
    createdAt: nowIso,
    updatedAt: nowIso,
    attemptCount: 0,
    nextAttemptAt: nowIso,
    replayOfJobId: sourceJob.id,
    replayReason,
  };

  await deps.invoiceJobStore.enqueue(replayJob);

  const observer = observerOf(deps);
  await notifyObserver("job_enqueued", () =>
    observer.onJobEnqueued?.(replayJob),
  );

  await deps.invoiceAuditLogger.log({
    action: "invoice.reissue",
    tenantId: replayJob.input.tenantId,
    subscriptionId: replayJob.input.subscriptionId,
    invoiceId: sourceJob.invoiceId ?? "n/a",
    traceId: replayJob.input.traceId,
    occurredAt: nowIso,
    metadata: {
      sourceJobId: sourceJob.id,
      replayJobId: replayJob.id,
      replayReason,
      cycleKey,
      calculationVersion: replayJob.input.calculationVersion,
    },
  });

  return {
    status: "replayed",
    jobId: replayJob.id,
    replayOfJobId: sourceJob.id,
  };
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
