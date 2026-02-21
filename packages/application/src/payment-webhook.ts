import {
  PaymentProviderName,
  CanonicalPaymentEvent,
  PaymentWebhookProcessResult,
  PaymentWebhookEnvelope,
  IdempotencyRecord,
} from "@grantledger/contracts";
import {
  AsyncIdempotencyStore,
  executeIdempotent,
  IdempotencyConflictError,
} from "./idempotency.js";

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
  provider: PaymentWebhookProvider;
  dedupStore: WebhookDedupStore;
  auditStore: WebhookAuditStore;
  eventPublisher: CanonicalPaymentEventPublisher;
}

function toAsyncStore(
  dedupStore: WebhookDedupStore,
): AsyncIdempotencyStore<CanonicalPaymentEvent> {
  return {
    async get(scope: string, key: string): Promise<IdempotencyRecord<CanonicalPaymentEvent> | null> {
      const [provider] = scope.split(":") as [PaymentProviderName, string?];
      const alreadyProcessed = await dedupStore.has(provider, key);
      if (!alreadyProcessed) return null;

      return {
        key,
        payloadHash: "null",
        status: "completed",
        response: {} as CanonicalPaymentEvent,
        createdAt: "",
      };
    },
    async set(scope: string, key: string): Promise<void> {
      const [provider] = scope.split(":") as [PaymentProviderName, string?];
      await dedupStore.markProcessed(provider, key);
    },
  };
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

    const scope = `${event.provider}:webhook`;

    const execution = await executeIdempotent({
      scope,
      key: event.eventId,
      payload: null,
      store: toAsyncStore(deps.dedupStore),
      execute: async () => {
        await deps.eventPublisher.publish(event);
        return event;
      },
    });

    if (execution.replayed) {
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

    if (
      error instanceof InvalidWebhookSignatureError ||
      error instanceof IdempotencyConflictError
    ) {
      throw error;
    }

    throw error;
  }
}
