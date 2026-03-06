import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InvalidWebhookSignatureError,
  processProviderWebhook,
  type CanonicalPaymentEventPublisher,
  type PaymentWebhookProvider,
} from "@grantledger/application";
import type {
  CanonicalPaymentEvent,
  PaymentWebhookEnvelope,
  PaymentProviderName,
} from "@grantledger/contracts";
import type { Pool } from "pg";
import {
  createPostgresPool,
  createPostgresWebhookAuditStore,
  createPostgresWebhookIdempotencyStore,
} from "./index.js";
import { applyPostgresTestMigrations } from "./test-migrations.js";

const shouldRun =
  process.env.RUN_PG_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const describePg = shouldRun ? describe : describe.skip;

type AuditRow = {
  provider: PaymentProviderName;
  event_id: string | null;
  status: "processed" | "duplicate" | "rejected";
  reason: string | null;
  trace_id: string;
};

class FakeProvider implements PaymentWebhookProvider {
  readonly provider = "stripe" as const;

  constructor(private readonly eventId: string) {}

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }): Promise<CanonicalPaymentEvent> {
    void input.rawBody;
    void input.headers;

    return {
      provider: this.provider,
      eventId: this.eventId,
      type: "payment.succeeded",
      domainEventVersion: "v1",
      occurredAt: "2026-03-06T00:00:00Z",
      traceId: input.traceId,
      payload: { source: "pg-regression" },
    };
  }
}

class InvalidSignatureProvider implements PaymentWebhookProvider {
  readonly provider = "stripe" as const;

  async verifyAndNormalizeWebhook(): Promise<CanonicalPaymentEvent> {
    throw new InvalidWebhookSignatureError("Invalid Stripe webhook signature");
  }
}

class RecordingPublisher implements CanonicalPaymentEventPublisher {
  public published: CanonicalPaymentEvent[] = [];

  async publish(event: CanonicalPaymentEvent): Promise<void> {
    this.published.push(event);
  }
}

function buildInput(traceId: string): PaymentWebhookEnvelope {
  return {
    provider: "stripe",
    rawBody: '{"id":"evt"}',
    headers: {
      "stripe-signature": "sig",
    },
    receivedAt: "2026-03-06T00:00:00Z",
    traceId,
  };
}

describePg("postgres webhook persistence regression", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPostgresPool();
    await applyPostgresTestMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists duplicate protection across new store instances", async () => {
    const traceId = `trace_webhook_${randomUUID()}`;
    const eventId = `evt_${randomUUID()}`;
    const publisher = new RecordingPublisher();

    const first = await processProviderWebhook(
      {
        provider: new FakeProvider(eventId),
        idempotencyStore: createPostgresWebhookIdempotencyStore(pool),
        auditStore: createPostgresWebhookAuditStore(pool),
        eventPublisher: publisher,
      },
      buildInput(traceId),
    );

    const second = await processProviderWebhook(
      {
        provider: new FakeProvider(eventId),
        idempotencyStore: createPostgresWebhookIdempotencyStore(pool),
        auditStore: createPostgresWebhookAuditStore(pool),
        eventPublisher: publisher,
      },
      buildInput(traceId),
    );

    expect(first).toMatchObject({
      status: "processed",
      provider: "stripe",
      eventId,
    });
    expect(second).toMatchObject({
      status: "duplicate",
      provider: "stripe",
      eventId,
    });
    expect(publisher.published).toHaveLength(1);

    const auditResult = await pool.query<AuditRow>(
      `SELECT provider, event_id, status, reason, trace_id
         FROM payment_webhook_audits
        WHERE trace_id = $1
        ORDER BY id`,
      [traceId],
    );

    expect(auditResult.rows).toHaveLength(2);
    expect(auditResult.rows[0]).toMatchObject({
      provider: "stripe",
      event_id: eventId,
      status: "processed",
    });
    expect(auditResult.rows[1]).toMatchObject({
      provider: "stripe",
      event_id: eventId,
      status: "duplicate",
      reason: "Duplicate webhook event",
    });
  });

  it("persists rejected webhook audit rows", async () => {
    const traceId = `trace_webhook_${randomUUID()}`;

    await expect(
      processProviderWebhook(
        {
          provider: new InvalidSignatureProvider(),
          idempotencyStore: createPostgresWebhookIdempotencyStore(pool),
          auditStore: createPostgresWebhookAuditStore(pool),
          eventPublisher: new RecordingPublisher(),
        },
        buildInput(traceId),
      ),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);

    const auditResult = await pool.query<AuditRow>(
      `SELECT provider, event_id, status, reason, trace_id
         FROM payment_webhook_audits
        WHERE trace_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [traceId],
    );

    expect(auditResult.rows).toHaveLength(1);
    expect(auditResult.rows[0]).toMatchObject({
      provider: "stripe",
      event_id: null,
      status: "rejected",
      trace_id: traceId,
    });
    expect(auditResult.rows[0]?.reason).toContain(
      "Invalid Stripe webhook signature",
    );
  });
});
