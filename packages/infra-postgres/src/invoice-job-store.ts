import type { InvoiceGenerationJob, InvoiceJobStore } from "@grantledger/application";
import type { GenerateInvoiceForCycleInput } from "@grantledger/contracts";
import type { Pool } from "pg";
import { withTenantSession } from "./tenant-session.js";

type InvoiceJobRow = {
  id: string;
  status: InvoiceGenerationJob["status"];
  cycle_key: string;
  payload: GenerateInvoiceForCycleInput;
  invoice_id: string | null;
  reason: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date | string;
  last_error: string | null;
  dead_lettered_at: Date | string | null;
  replay_of_job_id: string | null;
  replay_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapRow(row: InvoiceJobRow): InvoiceGenerationJob {
  return {
    id: row.id,
    status: row.status,
    cycleKey: row.cycle_key,
    input: row.payload,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.invoice_id !== null ? { invoiceId: row.invoice_id } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: toIso(row.next_attempt_at),
    ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    ...(row.dead_lettered_at !== null ? { deadLetteredAt: toIso(row.dead_lettered_at) } : {}),
    ...(row.replay_of_job_id !== null ? { replayOfJobId: row.replay_of_job_id } : {}),
    ...(row.replay_reason !== null ? { replayReason: row.replay_reason } : {}),
  };
}

export function createPostgresInvoiceJobStore(
  pool: Pool,
  tenantId: string,
): InvoiceJobStore {
  return {
    async enqueue(job: InvoiceGenerationJob): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO invoice_jobs
            (id, tenant_id, status, cycle_key, payload, invoice_id, reason, attempt_count, max_attempts,
             next_attempt_at, last_error, dead_lettered_at, replay_of_job_id, replay_reason, created_at, updated_at)
           VALUES
            ($1, current_setting('app.tenant_id', true), $2, $3, $4::jsonb, $5, $6, $7, $8,
             $9::timestamptz, $10, $11::timestamptz, $12, $13, $14::timestamptz, $15::timestamptz)`,
          [
            job.id,
            job.status,
            job.cycleKey,
            JSON.stringify(job.input),
            job.invoiceId ?? null,
            job.reason ?? null,
            job.attemptCount,
            job.maxAttempts,
            job.nextAttemptAt,
            job.lastError ?? null,
            job.deadLetteredAt ?? null,
            job.replayOfJobId ?? null,
            job.replayReason ?? null,
            job.createdAt,
            job.updatedAt,
          ],
        );
      });
    },

    async claimNext(): Promise<InvoiceGenerationJob | null> {
      return withTenantSession(pool, tenantId, async (client) => {
        const result = await client.query<InvoiceJobRow>(
          `WITH candidate AS (
             SELECT id
               FROM invoice_jobs
              WHERE status = 'queued'
                AND next_attempt_at <= now()
              ORDER BY created_at
              LIMIT 1
              FOR UPDATE SKIP LOCKED
           )
           UPDATE invoice_jobs jobs
              SET status = 'processing',
                  updated_at = now()
             FROM candidate
            WHERE jobs.id = candidate.id
           RETURNING jobs.id, jobs.status, jobs.cycle_key, jobs.payload, jobs.invoice_id, jobs.reason,
                     jobs.attempt_count, jobs.max_attempts, jobs.next_attempt_at, jobs.last_error,
                     jobs.dead_lettered_at, jobs.replay_of_job_id, jobs.replay_reason, jobs.created_at, jobs.updated_at`,
        );

        const row = firstRow(result.rows);
        return row ? mapRow(row) : null;
      });
    },

    async get(jobId: string): Promise<InvoiceGenerationJob | null> {
      return withTenantSession(pool, tenantId, async (client) => {
        const result = await client.query<InvoiceJobRow>(
          `SELECT id, status, cycle_key, payload, invoice_id, reason, attempt_count, max_attempts,
                  next_attempt_at, last_error, dead_lettered_at, replay_of_job_id, replay_reason,
                  created_at, updated_at
             FROM invoice_jobs
            WHERE id = $1
            LIMIT 1`,
          [jobId],
        );

        const row = firstRow(result.rows);
        return row ? mapRow(row) : null;
      });
    },

    async markCompleted(jobId: string, invoiceId: string): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `UPDATE invoice_jobs
              SET status = 'completed',
                  invoice_id = $2,
                  updated_at = now()
            WHERE id = $1`,
          [jobId, invoiceId],
        );
      });
    },

    async markRetry(
      jobId: string,
      reason: string,
      nextAttemptAt: string,
      attemptCount: number,
    ): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `UPDATE invoice_jobs
              SET status = 'queued',
                  reason = $2,
                  last_error = $2,
                  next_attempt_at = $3::timestamptz,
                  attempt_count = $4,
                  updated_at = now()
            WHERE id = $1`,
          [jobId, reason, nextAttemptAt, attemptCount],
        );
      });
    },

    async markDeadLetter(jobId: string, reason: string): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `UPDATE invoice_jobs
              SET status = 'failed',
                  reason = $2,
                  last_error = $2,
                  dead_lettered_at = now(),
                  updated_at = now()
            WHERE id = $1`,
          [jobId, reason],
        );
      });
    },
  };
}
