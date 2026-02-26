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
import { t, utcNowIso } from "@grantledger/shared";
import { getHeader } from "../http/headers.js";

class DefaultFakePaymentProvider implements PaymentProvider {
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

export interface StartCheckoutHandlerDeps {
  paymentProvider: PaymentProvider;
}

export type StartCheckoutHandler = (
  headers: Headers,
  payload: StartCheckoutPayload,
) => Promise<ApiResponse>;

function localeFromHeaders(headers: Headers): string | undefined {
  return getHeader(headers, "accept-language") ?? undefined;
}

export function createStartCheckoutHandler(
  deps: StartCheckoutHandlerDeps,
): StartCheckoutHandler {
  return async function handleStartCheckout(
    headers: Headers,
    payload: StartCheckoutPayload,
  ): Promise<ApiResponse> {
    const locale = localeFromHeaders(headers);

    try {
      const context = resolveContextFromHeaders(headers);

      const parsedPayload = parseOrThrowBadRequest(
        startCheckoutPayloadSchema,
        payload,
        "Invalid checkout payload",
      );

      const checkout = await startSubscriptionCheckout({
        provider: deps.paymentProvider,
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
          message: t("checkout.session_created", locale ? { locale } : undefined),
          data: checkout,
          context,
        },
      };
    } catch (error) {
      return toApiErrorResponse(
        error,
        getHeader(headers, "x-trace-id") ?? undefined,
        locale,
      );
    }
  };
}

const defaultStartCheckoutHandler = createStartCheckoutHandler({
  paymentProvider: new DefaultFakePaymentProvider(),
});

export const handleStartCheckout: StartCheckoutHandler =
  defaultStartCheckoutHandler;
