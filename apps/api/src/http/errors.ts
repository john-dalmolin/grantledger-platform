import { AppError } from "@grantledger/application";
import { SubscriptionDomainError } from "@grantledger/domain";
import { buildStandardErrorBody, t } from "@grantledger/shared";

import type { ApiResponse } from "./types.js";

export interface ApiErrorResponseBody {
  message: string;
  code: string;
  details?: unknown;
  traceId?: string;
}

export function toApiErrorResponse(
  error: unknown,
  traceId?: string,
  locale?: string,
): ApiResponse {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: buildStandardErrorBody({
        message: error.message,
        code: error.code,
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(traceId !== undefined ? { traceId } : {}),
      }),
    };
  }

  if (error instanceof SubscriptionDomainError) {
    return {
      status: 409,
      body: buildStandardErrorBody({
        message: error.message,
        code: "DOMAIN_CONFLICT",
        ...(traceId !== undefined ? { traceId } : {}),
      }),
    };
  }

  return {
    status: 500,
    body: buildStandardErrorBody({
      message: t("error.unexpected", locale ? { locale } : undefined),
      code: "INTERNAL_ERROR",
      ...(traceId !== undefined ? { traceId } : {}),
    }),
  };
}
