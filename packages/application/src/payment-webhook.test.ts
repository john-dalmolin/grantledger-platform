import { describe, expect, it } from "vitest";
import type {
  CanonicalPaymentEvent,
  PaymentProviderName,
} from "@grantledger/contracts";
import {
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

class InMemoryDedupStore implements WebhookDedupStore {
  private readonly set = new Set<string>();

  async has(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    return this.set.has(`${provider}:${eventId}`);
  }

  async markProcessed(provider: PaymentProviderName, eventId: string): Promise<void> {
    this.set.add(`${provider}:${eventId}`);
  }
}

class NoopAuditStore implements WebhookAuditStore {
  async saveRaw(): Promise<void> {}
}

class InMemoryPublisher implements CanonicalPaymentEventPublisher {
  public count = 0;
  async publish(): Promise<void> {
    this.count += 1;
  }
}

describe("payment webhook idempotency", () => {
  it("processes first and returns duplicate on replay", async () => {
    const publisher = new InMemoryPublisher();

    const deps = {
      provider: new StubProvider(),
      dedupStore: new InMemoryDedupStore(),
      auditStore: new NoopAuditStore(),
      eventPublisher: publisher,
    };

    const input = {
      provider: "stripe" as const,
      rawBody: "{}",
      headers: {},
      receivedAt: "2026-02-21T10:00:00Z",
      traceId: "trace_1",
    };

    const first = await processProviderWebhook(deps, input);
    const second = await processProviderWebhook(deps, input);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(publisher.count).toBe(1);
  });
});
