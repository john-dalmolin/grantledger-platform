import type {
  AsyncIdempotencyStore,
  WebhookAuditStore,
} from "@grantledger/application";
import type { CanonicalPaymentEvent } from "@grantledger/contracts";
import type { Pool } from "pg";
import { createPostgresAsyncIdempotencyStore } from "./idempotency-store.js";

const WEBHOOK_SYSTEM_TENANT_ID = "__webhook__";

export function createPostgresWebhookIdempotencyStore(
  pool: Pool,
): AsyncIdempotencyStore<CanonicalPaymentEvent> {
  return createPostgresAsyncIdempotencyStore<CanonicalPaymentEvent>(
    pool,
    WEBHOOK_SYSTEM_TENANT_ID,
  );
}

export function createPostgresWebhookAuditStore(pool: Pool): WebhookAuditStore {
  return {
    async saveRaw(input): Promise<void> {
      await pool.query(
        `INSERT INTO payment_webhook_audits
          (provider, trace_id, raw_body, headers, received_at, event_id, status, reason)
         VALUES
          ($1, $2, $3, $4::jsonb, $5::timestamptz, $6, $7, $8)`,
        [
          input.provider,
          input.traceId,
          input.rawBody,
          JSON.stringify(input.headers),
          input.receivedAt,
          input.eventId ?? null,
          input.status,
          input.reason ?? null,
        ],
      );
    },
  };
}
