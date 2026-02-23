import { z } from "zod";

import { dateTimeStringSchema, nonEmptyStringSchema } from "./common.js";

export const enqueueInvoiceGenerationPayloadSchema = z
  .object({
    tenantId: nonEmptyStringSchema,
    subscriptionId: nonEmptyStringSchema,
    customerId: nonEmptyStringSchema,
    planId: nonEmptyStringSchema,
    planVersionId: nonEmptyStringSchema,
    priceAmountInCents: z.number().int().nonnegative(),
    currency: z.enum(["BRL", "USD", "EUR"]),
    periodStart: dateTimeStringSchema,
    periodEnd: dateTimeStringSchema,
    proratedDays: z.number().int().nonnegative().optional(),
    totalDaysInPeriod: z.number().int().positive().optional(),
    discountInCents: z.number().int().nonnegative().optional(),
    taxRateBps: z.number().int().nonnegative().optional(),
    calculationVersion: nonEmptyStringSchema,
    traceId: nonEmptyStringSchema,
  })
  .passthrough();

export type EnqueueInvoiceGenerationPayloadInput = z.infer<
  typeof enqueueInvoiceGenerationPayloadSchema
>;

export const getInvoiceGenerationJobStatusPayloadSchema = z
  .object({
    jobId: nonEmptyStringSchema,
  })
  .passthrough();

export type GetInvoiceGenerationJobStatusPayloadInput = z.infer<
  typeof getInvoiceGenerationJobStatusPayloadSchema
>;
