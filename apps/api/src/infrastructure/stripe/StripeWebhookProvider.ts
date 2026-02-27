import Stripe from "stripe";
import {
  stripeProviderEventSchema,
  type CanonicalPaymentEvent,
  type StripeProviderEvent,
} from "@grantledger/contracts";
import {
  BadRequestError,
  InvalidWebhookSignatureError,
  type PaymentWebhookProvider,
} from "@grantledger/application";
import { epochSecondsToUtcIso } from "@grantledger/shared";

const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeWebhookProviderOptions = {
  toleranceSeconds?: number;
  stripe?: Stripe;
};

export class StripeWebhookProvider implements PaymentWebhookProvider {
  readonly provider = "stripe" as const;

  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly toleranceSeconds: number;

  constructor(
    webhookSecret: string,
    options: StripeWebhookProviderOptions = {},
  ) {
    const normalizedSecret = webhookSecret.trim();
    if (!normalizedSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required");
    }

    const toleranceSeconds =
      options.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;

    if (!Number.isInteger(toleranceSeconds) || toleranceSeconds <= 0) {
      throw new Error("Stripe webhook tolerance must be a positive integer");
    }

    this.webhookSecret = normalizedSecret;
    this.toleranceSeconds = toleranceSeconds;
    this.stripe = options.stripe ?? new Stripe("sk_test_webhook_verification");
  }

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }): Promise<CanonicalPaymentEvent> {
    const signature = this.getHeader(input.headers, "stripe-signature");

    if (!signature || signature.trim().length === 0) {
      throw new InvalidWebhookSignatureError("Missing Stripe signature header");
    }

    const providerEvent = this.verifySignatureAndParseEvent(
      input.rawBody,
      signature,
    );

    return this.toCanonicalEvent(providerEvent, input.traceId);
  }

  private getHeader(
    headers: Record<string, string | undefined>,
    key: string,
  ): string | undefined {
    return headers[key] ?? headers[key.toLowerCase()];
  }

  private verifySignatureAndParseEvent(
    rawBody: string,
    signature: string,
  ): StripeProviderEvent {
    let signedEvent: unknown;

    try {
      signedEvent = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
        this.toleranceSeconds,
      );
    } catch {
      throw new InvalidWebhookSignatureError("Invalid Stripe webhook signature");
    }

    const parsedEvent = stripeProviderEventSchema.safeParse(signedEvent);

    if (!parsedEvent.success) {
      throw new BadRequestError("Invalid Stripe event payload");
    }

    return parsedEvent.data;
  }

  private toCanonicalEvent(
    providerEvent: StripeProviderEvent,
    traceId: string,
  ): CanonicalPaymentEvent {
    const canonicalType = this.mapStripeType(providerEvent.type);

    if (!canonicalType) {
      throw new BadRequestError(
        `Unsupported Stripe event type: ${providerEvent.type} (eventId=${providerEvent.id})`,
      );
    }

    const object = providerEvent.data?.object ?? {};
    const tenantId = this.readString(object, "metadata.tenant_id");
    const subscriptionId =
      this.readString(object, "subscription") ??
      this.readString(object, "metadata.subscription_id");

    return {
      provider: "stripe",
      eventId: providerEvent.id,
      type: canonicalType,
      domainEventVersion: "v1",
      occurredAt: epochSecondsToUtcIso(providerEvent.created),
      traceId,
      payload: {
        stripeType: providerEvent.type,
      },
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(subscriptionId !== undefined ? { subscriptionId } : {}),
    };
  }

  private mapStripeType(type: string): CanonicalPaymentEvent["type"] | null {
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
        return null;
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
