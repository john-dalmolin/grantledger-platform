import { describe, expect, it } from "vitest";

import {
  InvalidWebhookSignatureError,
  type CanonicalPaymentEventPublisher,
  type PaymentWebhookProvider,
  type WebhookAuditStore,
  type WebhookDedupStore,
} from "@grantledger/application";
import type { PaymentProviderName } from "@grantledger/contracts";
import type { Headers } from "../http/types.js";
import { handleProviderWebhook, type WebhookHandlerDeps } from "./webhook.js";

class FakeProvider implements PaymentWebhookProvider {
  readonly provider = "fake" as const;

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }) {
    void input.rawBody;
    void input.headers;

    return {
      provider: "fake" as const,
      eventId: "evt_fake_1",
      type: "payment.succeeded" as const,
      domainEventVersion: "v1" as const,
      occurredAt: "2026-03-01T00:00:00Z",
      traceId: input.traceId,
      payload: {
        source: "integration-test",
      },
    };
  }
}

class SignatureFailureProvider implements PaymentWebhookProvider {
  readonly provider = "fake" as const;

  async verifyAndNormalizeWebhook(): Promise<never> {
    throw new InvalidWebhookSignatureError("bad signature");
  }
}

class InMemoryDedupStore implements WebhookDedupStore {
  private readonly keys = new Set<string>();

  async has(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    return this.keys.has(`${provider}:${eventId}`);
  }

  async markProcessed(
    provider: PaymentProviderName,
    eventId: string,
  ): Promise<void> {
    this.keys.add(`${provider}:${eventId}`);
  }
}

class NoopAuditStore implements WebhookAuditStore {
  async saveRaw(): Promise<void> { }
}

class NoopPublisher implements CanonicalPaymentEventPublisher {
  async publish(): Promise<void> { }
}

function asHeaders(value: Record<string, string>): Headers {
  return value as unknown as Headers;
}

function buildPayload() {
  return {
    provider: "fake",
    rawBody: '{"id":"evt_fake_1"}',
    headers: {
      "x-provider-signature": "sig",
    },
    receivedAt: "2026-03-01T00:00:00Z",
    traceId: "trace-webhook-1",
  };
}

function buildDeps(
  provider: PaymentWebhookProvider,
): WebhookHandlerDeps {
  return {
    dedupStore: new InMemoryDedupStore(),
    auditStore: new NoopAuditStore(),
    eventPublisher: new NoopPublisher(),
    providerRegistry: {
      fake: provider,
    },
  };
}

describe("webhook handler integration", () => {
  it("returns 400 for invalid payload", async () => {
    const response = await handleProviderWebhook(
      asHeaders({ "x-trace-id": "trace-invalid" }),
      {},
      buildDeps(new FakeProvider()),
    );

    expect(response.status).toBe(400);
  });

  it("returns processed then duplicate for same webhook event", async () => {
    const deps = buildDeps(new FakeProvider());
    const headers = asHeaders({ "x-trace-id": "trace-processed" });
    const payload = buildPayload();

    const first = await handleProviderWebhook(headers, payload, deps);
    const second = await handleProviderWebhook(headers, payload, deps);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      status: "processed",
      provider: "fake",
      eventId: "evt_fake_1",
    });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      status: "duplicate",
      provider: "fake",
      eventId: "evt_fake_1",
    });
  });

  it("returns 400 when signature is invalid", async () => {
    const response = await handleProviderWebhook(
      asHeaders({ "x-trace-id": "trace-signature" }),
      buildPayload(),
      buildDeps(new SignatureFailureProvider()),
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});