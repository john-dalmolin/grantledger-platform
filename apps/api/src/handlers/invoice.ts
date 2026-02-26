import {
  BadRequestError,
  enqueueInvoiceGeneration,
  getInvoiceGenerationJobStatus,
  getSharedInvoiceUseCaseDeps,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";
import {
  createPostgresInvoiceUseCaseDeps,
  createPostgresPool,
} from "@grantledger/infra-postgres";
import {
  enqueueInvoiceGenerationPayloadSchema,
  getInvoiceGenerationJobStatusPayloadSchema,
  type EnqueueInvoiceGenerationPayload,
} from "@grantledger/contracts";

import { resolveContextFromHeaders } from "./auth.js";
import { toApiErrorResponse } from "../http/errors.js";
import { getHeader } from "../http/headers.js";
import type { ApiResponse, Headers } from "../http/types.js";
import { parseOrThrowBadRequest } from "../http/validation.js";

export interface InvoiceHandlersDeps {
  invoiceUseCases: InvoiceUseCaseDeps;
  invoiceUseCasesByTenant?: (tenantId: string) => InvoiceUseCaseDeps;
}

const defaultInvoiceHandlerDeps: InvoiceHandlersDeps = (() => {
  const base: InvoiceHandlersDeps = {
    invoiceUseCases: getSharedInvoiceUseCaseDeps(),
  };

  if (process.env.PERSISTENCE_DRIVER !== "postgres") {
    return base;
  }

  const pool = createPostgresPool();
  const byTenant = new Map<string, InvoiceUseCaseDeps>();

  return {
    ...base,
    invoiceUseCasesByTenant: (tenantId: string): InvoiceUseCaseDeps => {
      const cached = byTenant.get(tenantId);
      if (cached) {
        return cached;
      }
      const created = createPostgresInvoiceUseCaseDeps(pool, tenantId);
      byTenant.set(tenantId, created);
      return created;
    },
  };
})();

function resolveInvoiceUseCases(
  deps: InvoiceHandlersDeps,
  tenantId: string,
): InvoiceUseCaseDeps {
  return deps.invoiceUseCasesByTenant
    ? deps.invoiceUseCasesByTenant(tenantId)
    : deps.invoiceUseCases;
}

type ParsedEnqueueInvoiceGenerationPayload = ReturnType<
  typeof enqueueInvoiceGenerationPayloadSchema.parse
>;

function traceIdFromHeaders(headers: Headers): string | undefined {
  return getHeader(headers, "x-trace-id") ?? undefined;
}

function normalizeEnqueueInvoiceGenerationPayload(
  parsedPayload: ParsedEnqueueInvoiceGenerationPayload,
): EnqueueInvoiceGenerationPayload {
  return {
    tenantId: parsedPayload.tenantId,
    subscriptionId: parsedPayload.subscriptionId,
    customerId: parsedPayload.customerId,
    planId: parsedPayload.planId,
    planVersionId: parsedPayload.planVersionId,
    priceAmountInCents: parsedPayload.priceAmountInCents,
    currency: parsedPayload.currency,
    periodStart: parsedPayload.periodStart,
    periodEnd: parsedPayload.periodEnd,
    calculationVersion: parsedPayload.calculationVersion,
    traceId: parsedPayload.traceId,
    ...(parsedPayload.proratedDays !== undefined
      ? { proratedDays: parsedPayload.proratedDays }
      : {}),
    ...(parsedPayload.totalDaysInPeriod !== undefined
      ? { totalDaysInPeriod: parsedPayload.totalDaysInPeriod }
      : {}),
    ...(parsedPayload.discountInCents !== undefined
      ? { discountInCents: parsedPayload.discountInCents }
      : {}),
    ...(parsedPayload.taxRateBps !== undefined
      ? { taxRateBps: parsedPayload.taxRateBps }
      : {}),
  };
}

export async function handleEnqueueInvoiceGeneration(
  headers: Headers,
  payload: unknown,
  deps: InvoiceHandlersDeps = defaultInvoiceHandlerDeps,
): Promise<ApiResponse> {
  try {
    const context = resolveContextFromHeaders(headers);
    const invoiceUseCases = resolveInvoiceUseCases(deps, context.tenant.id);
    const parsedPayload = parseOrThrowBadRequest(
      enqueueInvoiceGenerationPayloadSchema,
      payload,
      "Invalid enqueue invoice generation payload",
    );

    if (parsedPayload.tenantId !== context.tenant.id) {
      throw new BadRequestError(
        "Payload tenantId must match authenticated tenant context",
      );
    }

    const idempotencyKey = getHeader(headers, "idempotency-key");
    const result = await enqueueInvoiceGeneration(invoiceUseCases, {
      idempotencyKey,
      payload: normalizeEnqueueInvoiceGenerationPayload(parsedPayload),
    });

    return {
      status: 202,
      body: {
        jobId: result.jobId,
        status: result.status,
      },
    };
  } catch (error) {
    return toApiErrorResponse(error, traceIdFromHeaders(headers));
  }
}

export async function handleGetInvoiceGenerationJobStatus(
  headers: Headers,
  payload: unknown,
  deps: InvoiceHandlersDeps = defaultInvoiceHandlerDeps,
): Promise<ApiResponse> {
  try {
    const context = resolveContextFromHeaders(headers);
    const invoiceUseCases = resolveInvoiceUseCases(deps, context.tenant.id);
    const parsedPayload = parseOrThrowBadRequest(
      getInvoiceGenerationJobStatusPayloadSchema,
      payload,
      "Invalid invoice generation job status payload",
    );

    const status = await getInvoiceGenerationJobStatus(
      invoiceUseCases,
      parsedPayload.jobId,
      context.tenant.id,
    );

    return {
      status: 200,
      body: status,
    };
  } catch (error) {
    return toApiErrorResponse(error, traceIdFromHeaders(headers));
  }
}
