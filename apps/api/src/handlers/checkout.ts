import {
  AuthenticationError,
  BadRequestError,
  ForbiddenError,
  startSubscriptionCheckout,
  type PaymentProvider,
} from "@grantledger/application";
import type {
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";

import { resolveContextFromHeaders } from "./auth.js";
import type { ApiResponse, Headers } from "../http/types.js";

interface StartCheckoutPayload {
  planId: string;
  billingPeriod: BillingPeriod;
  successUrl?: string;
  cancelUrl?: string;
  externalReference?: string;
}

class FakePaymentProvider implements PaymentProvider {
  public readonly name = "fake" as const;

  createCheckoutSession(
    _input: CreateCheckoutSessionInput,
  ): CreateCheckoutSessionResult {
    void _input;
    const sessionId = `fake_chk_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      provider: this.name,
      sessionId,
      checkoutUrl: `https://pay.local/checkout/${sessionId}`,
      createdAt: new Date().toISOString(),
    };
  }
}

const fakePaymentProvider = new FakePaymentProvider();

export async function handleStartCheckout(
  headers: Headers,
  payload: StartCheckoutPayload,
): Promise<ApiResponse> {
  try {
    const context = resolveContextFromHeaders(headers);

    const checkout = await startSubscriptionCheckout({
      provider: fakePaymentProvider,
      tenantId: context.tenant.id,
      planId: payload.planId,
      billingPeriod: payload.billingPeriod,
      ...(payload.successUrl !== undefined
        ? { successUrl: payload.successUrl }
        : {}),
      ...(payload.cancelUrl !== undefined
        ? { cancelUrl: payload.cancelUrl }
        : {}),
      ...(payload.externalReference !== undefined
        ? { externalReference: payload.externalReference }
        : {}),
    });

    return {
      status: 201,
      body: {
        message: "Checkout session created",
        data: checkout,
        context,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      return { status: 400, body: { message: error.message } };
    }

    return { status: 500, body: { message: "Unexpected error" } };
  }
}
