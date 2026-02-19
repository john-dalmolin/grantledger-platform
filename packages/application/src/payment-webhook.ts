import {
  PaymentProviderName,
  CanonicalPaymentEvent,
  PaymentWebhookProcessResult,
  PaymentWebhookEnvelope,
} from "@grantledger/contracts";

export class InvalidWebhookSignatureError extends Error {}
export class DuplicateWebhookEventError extends Error {}

export interface PaymentWebhookProvider {
  readonly provider: PaymentProviderName;
  verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }): Promise<CanonicalPaymentEvent>;
}

export interface WebhookDedupStore {
  has(provider: PaymentProviderName, eventId: string): Promise<boolean>;
  markProcessed(provider: PaymentProviderName, eventId: string): Promise<void>;
}

export interface WebhookAuditStore {
  saveRaw(input: {
    provider: PaymentProviderName;
    traceId: string;
    rawBody: string;
    headers: Record<string, string | undefined>;
    receivedAt: string;
    eventId?: string;
    status: "processed" | "duplicate" | "rejected";
    reason?: string;
  }): Promise<void>;
}

export interface CanonicalPaymentEventPublisher {
  publish(event: CanonicalPaymentEvent): Promise<void>;
}

export interface PaymentWebhookDeps {
  provider: PaymentWebhookProvider; //
  dedupStore: WebhookDedupStore;
  auditStore: WebhookAuditStore;
  eventPublisher: CanonicalPaymentEventPublisher;
}

export async function processProviderWebhook(
  deps: PaymentWebhookDeps,
  input: PaymentWebhookEnvelope,
): Promise<PaymentWebhookProcessResult> {
  try {
    const event = await deps.provider.verifyAndNormalizeWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      traceId: input.traceId,
    });

    const alreadyProcessed = await deps.dedupStore.has(
      event.provider,
      event.eventId,
    );
    if (alreadyProcessed) {
      await deps.auditStore.saveRaw({
        provider: event.provider,
        traceId: input.traceId,
        rawBody: input.rawBody,
        headers: input.headers,
        receivedAt: input.receivedAt,
        eventId: event.eventId,
        status: "duplicate",
        reason: "Duplicate webhook event",
      });

      return {
        status: "duplicate",
        provider: event.provider,
        eventId: event.eventId,
        reason: "Duplicate webhook event",
      };
    }

    await deps.dedupStore.markProcessed(event.provider, event.eventId);
    await deps.eventPublisher.publish(event);

    await deps.auditStore.saveRaw({
      provider: event.provider,
      traceId: input.traceId,
      rawBody: input.rawBody,
      headers: input.headers,
      receivedAt: input.receivedAt,
      eventId: event.eventId,
      status: "processed",
    });

    return {
      status: "processed",
      provider: event.provider,
      eventId: event.eventId,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected error";

    await deps.auditStore.saveRaw({
      provider: input.provider,
      traceId: input.traceId,
      rawBody: input.rawBody,
      headers: input.headers,
      receivedAt: input.receivedAt,
      status: "rejected",
      reason,
    });

    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }

    throw error;
  }
}
