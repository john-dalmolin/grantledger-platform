import { AppError } from "@grantledger/application";
import { SubscriptionDomainError } from "@grantledger/domain";

import type { ApiResponse } from "./types.js";

export interface ApiErrorResponseBody {
  message: string;
  code: string;
  details?: unknown;
  traceId?: string;
}

function attachTraceId(
  body: Omit<ApiErrorResponseBody, "traceId">,
  traceId?: string,
): ApiErrorResponseBody {
  return traceId ? { ...body, traceId } : body;
}

export function toApiErrorResponse(
  error: unknown,
  traceId?: string,
): ApiResponse {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: attachTraceId(
        {
          message: error.message,
          code: error.code,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        traceId,
      ),
    };
  }

  if (error instanceof SubscriptionDomainError) {
    return {
      status: 409,
      body: attachTraceId(
        {
          message: error.message,
          code: "DOMAIN_CONFLICT",
        },
        traceId,
      ),
    };
  }

  return {
    status: 500,
    body: attachTraceId(
      {
        message: "Unexpected error",
        code: "INTERNAL_ERROR",
      },
      traceId,
    ),
  };
}
