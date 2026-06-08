import { toApiErrorResponse } from "../http/errors.js";
import {
  startSubscriptionCheckout,
  type PaymentProvider,
} from "@grantledger/application";
import { startCheckoutPayloadSchema } from "@grantledger/contracts";

import { resolveContextFromHeaders } from "./auth.js";
import { parseOrThrowBadRequest } from "../http/validation.js";
import type { ApiResponse, Headers } from "../http/types.js";
import { t } from "@grantledger/shared";
import { getHeader } from "../http/headers.js";

export interface StartCheckoutHandlerDeps {
  paymentProvider: PaymentProvider;
}

export type StartCheckoutHandler = (
  headers: Headers,
  payload: unknown,
) => Promise<ApiResponse>;

function localeFromHeaders(headers: Headers): string | undefined {
  return getHeader(headers, "accept-language") ?? undefined;
}

export function createStartCheckoutHandler(
  deps: StartCheckoutHandlerDeps,
): StartCheckoutHandler {
  return async function handleStartCheckout(
    headers: Headers,
    payload: unknown,
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
