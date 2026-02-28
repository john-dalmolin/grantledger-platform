import { describe, expect, it } from "vitest";
import type {
  CanonicalPaymentEvent,
  PaymentProviderName,
  PaymentWebhookEnvelope,
} from "@grantledger/contracts";
import {
  InvalidWebhookSignatureError,
  UnsupportedWebhookEventError,
  processProviderWebhook,
  type CanonicalPaymentEventPublisher,
  type PaymentWebhookProvider,
  type WebhookAuditStore,
  type WebhookDedupStore,
} from "./payment-webhook.js";

class StubProvider implements PaymentWebhookProvider {
  readonly provider: PaymentProviderName = "stripe";

  async verifyAndNormalizeWebhook(): Promise<CanonicalPaymentEvent> {
    return {
      provider: "stripe",
      eventId: "evt_1",
      type: "payment.succeeded",
      domainEventVersion: "v1",
      occurredAt: "2026-02-21T10:00:00Z",
      traceId: "trace_1",
      payload: {},
    };
  }
}

class InvalidSignatureProvider implements PaymentWebhookProvider {
  readonly provider: PaymentProviderName = "stripe";

  async verifyAndNormalizeWebhook(): Promise<CanonicalPaymentEvent> {
    throw new InvalidWebhookSignatureError("Invalid Stripe webhook signature");
  }
}

class UnknownEventProvider implements PaymentWebhookProvider {
  readonly provider: PaymentProviderName = "stripe";

  async verifyAndNormalizeWebhook(): Promise<CanonicalPaymentEvent> {
    throw new UnsupportedWebhookEventError({
      provider: "stripe",
      eventId: "evt_unknown_1",
      providerEventType: "invoice.voided",
    });
  }
}

class InMemoryDedupStore implements WebhookDedupStore {
  private readonly set = new Set<string>();

  async has(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    return this.set.has(`${provider}:${eventId}`);
  }

  async markProcessed(provider: PaymentProviderName, eventId: string): Promise<void> {
    this.set.add(`${provider}:${eventId}`);
  }
}

type AuditRecord = {
  provider: PaymentProviderName;
  traceId: string;
  rawBody: string;
  headers: Record<string, string | undefined>;
  receivedAt: string;
  eventId?: string;
  status: "processed" | "duplicate" | "rejected";
  reason?: string;
};

class InMemoryAuditStore implements WebhookAuditStore {
  public readonly records: AuditRecord[] = [];

  async saveRaw(input: AuditRecord): Promise<void> {
    this.records.push(input);
  }
}

class InMemoryPublisher implements CanonicalPaymentEventPublisher {
  public count = 0;
  async publish(): Promise<void> {
    this.count += 1;
  }
}

function makeInput(): PaymentWebhookEnvelope {
  return {
    provider: "stripe",
    rawBody: "{}",
    headers: {},
    receivedAt: "2026-02-21T10:00:00Z",
    traceId: "trace_1",
  };
}

describe("payment webhook orchestration", () => {
  it("processes first and returns duplicate on replay with audit trail", async () => {
    const publisher = new InMemoryPublisher();
    const auditStore = new InMemoryAuditStore();

    const deps = {
      provider: new StubProvider(),
      dedupStore: new InMemoryDedupStore(),
      auditStore,
      eventPublisher: publisher,
    };

    const first = await processProviderWebhook(deps, makeInput());
    const second = await processProviderWebhook(deps, makeInput());

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(publisher.count).toBe(1);

    expect(auditStore.records).toHaveLength(2);
    expect(auditStore.records[0]?.status).toBe("processed");
    expect(auditStore.records[0]?.eventId).toBe("evt_1");
    expect(auditStore.records[1]?.status).toBe("duplicate");
    expect(auditStore.records[1]?.eventId).toBe("evt_1");
  });

  it("audits rejected invalid signature", async () => {
    const auditStore = new InMemoryAuditStore();

    const deps = {
      provider: new InvalidSignatureProvider(),
      dedupStore: new InMemoryDedupStore(),
      auditStore,
      eventPublisher: new InMemoryPublisher(),
    };

    await expect(processProviderWebhook(deps, makeInput())).rejects.toBeInstanceOf(
      InvalidWebhookSignatureError,
    );

    expect(auditStore.records).toHaveLength(1);
    expect(auditStore.records[0]?.status).toBe("rejected");
    expect(auditStore.records[0]?.reason).toContain("Invalid Stripe webhook signature");
  });

  it("audits rejected unknown event with explicit event id", async () => {
    const auditStore = new InMemoryAuditStore();

    const deps = {
      provider: new UnknownEventProvider(),
      dedupStore: new InMemoryDedupStore(),
      auditStore,
      eventPublisher: new InMemoryPublisher(),
    };

    await expect(processProviderWebhook(deps, makeInput())).rejects.toBeInstanceOf(
      UnsupportedWebhookEventError,
    );

    expect(auditStore.records).toHaveLength(1);
    expect(auditStore.records[0]?.status).toBe("rejected");
    expect(auditStore.records[0]?.eventId).toBe("evt_unknown_1");
    expect(auditStore.records[0]?.reason).toContain("invoice.voided");
  });
});
