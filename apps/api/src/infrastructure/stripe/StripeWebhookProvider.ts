import type { CanonicalPaymentEvent } from "@grantledger/contracts";
import {
  InvalidWebhookSignatureError,
  type PaymentWebhookProvider,
} from "@grantledger/application";

export class StripeWebhookProvider implements PaymentWebhookProvider {
  readonly provider = "stripe" as const;

  constructor(private readonly webhookSecret: string) {}

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }): Promise<CanonicalPaymentEvent> {
    const signature = this.getHeader(input.headers, "stripe-signature");

    if (!signature || signature.trim().length === 0) {
      throw new InvalidWebhookSignatureError("Missing Stripe signature header");
    }

    // TODO: replace with real Stripe SDK signature verification.
    // Keeping deterministic placeholder until SDK wiring is added.
    if (!this.isSignatureValid(input.rawBody, signature, this.webhookSecret)) {
      throw new InvalidWebhookSignatureError(
        "Invalid Stripe webhook signature",
      );
    }

    const providerEvent = this.parseProviderEvent(input.rawBody);

    return this.toCanonicalEvent(providerEvent, input.traceId);
  }

  private getHeader(
    headers: Record<string, string | undefined>,
    key: string,
  ): string | undefined {
    return headers[key] ?? headers[key.toLowerCase()];
  }

  private isSignatureValid(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    // Placeholder strategy:
    // accept if secret and signature are present.
    // Replace this by Stripe constructEvent in next step.
    return rawBody.length > 0 && signature.length > 0 && secret.length > 0;
  }

  private parseProviderEvent(rawBody: string): {
    id: string;
    type: string;
    created: number;
    data?: { object?: Record<string, unknown> };
  } {
    const parsed = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      created?: number;
      data?: { object?: Record<string, unknown> };
    };

    if (!parsed.id || !parsed.type || !parsed.created) {
      throw new Error("Invalid Stripe event payload");
    }

    const base = {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created,
    };

    return parsed.data === undefined ? base : { ...base, data: parsed.data };
  }

  private toCanonicalEvent(
    providerEvent: {
      id: string;
      type: string;
      created: number;
      data?: { object?: Record<string, unknown> };
    },
    traceId: string,
  ): CanonicalPaymentEvent {
    const canonicalType = this.mapStripeType(providerEvent.type);

    const object = providerEvent.data?.object ?? {};
    const tenantId = this.readString(object, "metadata.tenant_id");
    const subscriptionId =
      this.readString(object, "subscription") ??
      this.readString(object, "metadata.subscription_id");

    const baseEvent: CanonicalPaymentEvent = {
      provider: "stripe",
      eventId: providerEvent.id,
      type: canonicalType,
      domainEventVersion: "v1",
      occurredAt: new Date(providerEvent.created * 1000).toISOString(),
      traceId,
      payload: {
        stripeType: providerEvent.type,
      },
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(subscriptionId !== undefined ? { subscriptionId } : {}),
    };

    return baseEvent;
  }

  private mapStripeType(type: string): CanonicalPaymentEvent["type"] {
    switch (type) {
      case "invoice.paid":
        return "invoice.paid";
      case "invoice.payment_failed":
        return "invoice.payment_failed";
      case "customer.subscription.deleted":
        return "subscription.canceled";
      case "customer.subscription.updated":
        return "subscription.updated";
      case "charge.succeeded":
      case "payment_intent.succeeded":
        return "payment.succeeded";
      case "charge.failed":
      case "payment_intent.payment_failed":
        return "payment.failed";
      default:
        // Defaulting to a safe semantic that preserves event observability.
        return "subscription.updated";
    }
  }

  private readString(
    source: Record<string, unknown>,
    path: string,
  ): string | undefined {
    const parts = path.split(".");
    let current: unknown = source;

    for (const part of parts) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === "string" ? current : undefined;
  }
}
