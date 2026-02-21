import { toApiErrorResponse } from "../http/errors.js";
import {
  startSubscriptionCheckout,
  type PaymentProvider,
} from "@grantledger/application";
import {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  startCheckoutPayloadSchema,
  StartCheckoutPayload,
} from "@grantledger/contracts";

import { resolveContextFromHeaders } from "./auth.js";
import { parseOrThrowBadRequest } from "../http/validation.js";
import type { ApiResponse, Headers } from "../http/types.js";
import { utcNowIso } from "@grantledger/shared";
import { getHeader } from "../http/headers.js";

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
      createdAt: utcNowIso(),
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

    const parsedPayload = parseOrThrowBadRequest(
      startCheckoutPayloadSchema,
      payload,
      "Invalid checkout payload",
    );

    const checkout = await startSubscriptionCheckout({
      provider: fakePaymentProvider,
      tenantId: context.tenant.id,
      planId: parsedPayload.planId,
      billingPeriod: parsedPayload.billingPeriod,
      ...(parsedPayload.successUrl !== undefined
        ? { successUrl: parsedPayload.successUrl }
        : {}),
      ...(parsedPayload.cancelUrl !== undefined
        ? { cancelUrl: parsedPayload.cancelUrl }
        : {}),
      ...(parsedPayload.externalReference !== undefined
        ? { externalReference: parsedPayload.externalReference }
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
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}
