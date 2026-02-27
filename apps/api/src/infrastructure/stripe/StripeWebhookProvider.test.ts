import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  BadRequestError,
  InvalidWebhookSignatureError,
} from "@grantledger/application";
import { StripeWebhookProvider } from "./StripeWebhookProvider.js";

const stripe = new Stripe("sk_test_webhook_verification");
const webhookSecret = "whsec_test_secret";

function makeRawEvent(type: string): string {
  return JSON.stringify({
    id: "evt_test_1",
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "in_test_1",
        subscription: "sub_1",
        metadata: {
          tenant_id: "t_1",
          subscription_id: "sub_1",
        },
      },
    },
  });
}

function makeSignature(rawBody: string, timestamp?: number): string {
  return stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: webhookSecret,
    ...(timestamp !== undefined ? { timestamp } : {}),
  });
}

describe("StripeWebhookProvider", () => {
  it("accepts valid signature and normalizes known event", async () => {
    const rawBody = makeRawEvent("invoice.paid");
    const signature = makeSignature(rawBody);
    const provider = new StripeWebhookProvider(webhookSecret, { stripe });

    const event = await provider.verifyAndNormalizeWebhook({
      rawBody,
      headers: { "stripe-signature": signature },
      traceId: "trace-1",
    });

    expect(event.provider).toBe("stripe");
    expect(event.type).toBe("invoice.paid");
    expect(event.eventId).toBe("evt_test_1");
  });

  it("rejects invalid signature", async () => {
    const rawBody = makeRawEvent("invoice.paid");
    const provider = new StripeWebhookProvider(webhookSecret, { stripe });

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody,
        headers: { "stripe-signature": "invalid-signature" },
        traceId: "trace-1",
      }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("rejects stale signature by timestamp tolerance", async () => {
    const rawBody = makeRawEvent("invoice.paid");
    const staleTimestamp = Math.floor(Date.now() / 1000) - 601;
    const signature = makeSignature(rawBody, staleTimestamp);
    const provider = new StripeWebhookProvider(webhookSecret, {
      stripe,
      toleranceSeconds: 300,
    });

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody,
        headers: { "stripe-signature": signature },
        traceId: "trace-1",
      }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it("rejects unknown event type with explicit reason", async () => {
    const rawBody = makeRawEvent("invoice.voided");
    const signature = makeSignature(rawBody);
    const provider = new StripeWebhookProvider(webhookSecret, { stripe });

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody,
        headers: { "stripe-signature": signature },
        traceId: "trace-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
