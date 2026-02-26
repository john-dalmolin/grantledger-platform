import type {
  AsyncIdempotencyStore,
  IdempotencyBeginOutcome,
} from "@grantledger/application";
import type { IdempotencyRecord, IdempotencyStatus } from "@grantledger/contracts";
import type { Pool } from "pg";
import { withTenantSession } from "./tenant-session.js";

type IdempotencyRow = {
  key: string;
  payload_hash: string;
  status: IdempotencyStatus;
  response: unknown | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapRow<T>(row: IdempotencyRow): IdempotencyRecord<T> {
  const record: IdempotencyRecord<T> = {
    key: row.key,
    payloadHash: row.payload_hash,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };

  if (row.response !== null) record.response = row.response as T;
  if (row.error_message !== null) record.errorMessage = row.error_message;

  return record;
}

export function createPostgresAsyncIdempotencyStore<TResponse>(
  pool: Pool,
  tenantId: string,
): AsyncIdempotencyStore<TResponse> {
  return {
    async get(scope: string, key: string): Promise<IdempotencyRecord<TResponse> | null> {
      return withTenantSession(pool, tenantId, async (client) => {
        const result = await client.query<IdempotencyRow>(
          `SELECT key, payload_hash, status, response, error_message, created_at, updated_at
             FROM idempotency_records
            WHERE scope = $1 AND key = $2
            LIMIT 1`,
          [scope, key],
        );

        const row = firstRow(result.rows);
        if (!row) return null;
        return mapRow<TResponse>(row);
      });
    },

    async set(
      scope: string,
      key: string,
      record: IdempotencyRecord<TResponse>,
    ): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO idempotency_records
            (scope, tenant_id, key, payload_hash, status, response, error_message, created_at, updated_at)
           VALUES
            ($1, current_setting('app.tenant_id', true), $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz)
           ON CONFLICT (scope, tenant_id, key)
           DO UPDATE SET
             payload_hash = EXCLUDED.payload_hash,
             status = EXCLUDED.status,
             response = EXCLUDED.response,
             error_message = EXCLUDED.error_message,
             updated_at = EXCLUDED.updated_at`,
          [
            scope,
            key,
            record.payloadHash,
            record.status,
            record.response === undefined ? null : JSON.stringify(record.response),
            record.errorMessage ?? null,
            record.createdAt,
            record.updatedAt,
          ],
        );
      });
    },

    async begin(
      scope: string,
      key: string,
      payloadHash: string,
      startedAt: string,
    ): Promise<IdempotencyBeginOutcome<TResponse>> {
      return withTenantSession(pool, tenantId, async (client) => {
        const existing = await client.query<IdempotencyRow>(
          `SELECT key, payload_hash, status, response, error_message, created_at, updated_at
             FROM idempotency_records
            WHERE scope = $1 AND key = $2
            FOR UPDATE`,
          [scope, key],
        );

        const row = firstRow(existing.rows);

        if (!row) {
          await client.query(
            `INSERT INTO idempotency_records
              (scope, tenant_id, key, payload_hash, status, response, error_message, created_at, updated_at)
             VALUES
              ($1, current_setting('app.tenant_id', true), $2, $3, 'processing', NULL, NULL, $4::timestamptz, $4::timestamptz)`,
            [scope, key, payloadHash, startedAt],
          );
          return { outcome: "started" };
        }

        if (row.payload_hash !== payloadHash) return { outcome: "conflict" };
        if (row.status === "completed") return { outcome: "replay", record: mapRow<TResponse>(row) };
        if (row.status === "processing") return { outcome: "in_progress" };

        await client.query(
          `UPDATE idempotency_records
              SET status = 'processing',
                  response = NULL,
                  error_message = NULL,
                  updated_at = $4::timestamptz
            WHERE scope = $1 AND key = $2 AND payload_hash = $3`,
          [scope, key, payloadHash, startedAt],
        );

        return { outcome: "started" };
      });
    },
  };
}
