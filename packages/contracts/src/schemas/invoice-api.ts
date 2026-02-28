import { z } from "zod";

import { dateTimeStringSchema, nonEmptyStringSchema } from "./common.js";

type NormalizeOptional<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export const invoiceGenerationJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);

export type InvoiceGenerationJobStatus = z.infer<
  typeof invoiceGenerationJobStatusSchema
>;

export const enqueueInvoiceGenerationPayloadSchema = z.object({
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
  .strict();

type RawEnqueueInvoiceGenerationPayload = z.infer<
  typeof enqueueInvoiceGenerationPayloadSchema
>;

export type EnqueueInvoiceGenerationPayload = Simplify<
  NormalizeOptional<RawEnqueueInvoiceGenerationPayload>
>;

export type EnqueueInvoiceGenerationPayloadInput =
  EnqueueInvoiceGenerationPayload;

export const enqueueInvoiceGenerationResponseSchema = z.object({
  jobId: nonEmptyStringSchema,
  status: invoiceGenerationJobStatusSchema,
});

type RawEnqueueInvoiceGenerationResponse = z.infer<
  typeof enqueueInvoiceGenerationResponseSchema
>;

export type EnqueueInvoiceGenerationResponse = Simplify<
  NormalizeOptional<RawEnqueueInvoiceGenerationResponse>
>;

export const getInvoiceGenerationJobStatusPayloadSchema = z.object({
  jobId: nonEmptyStringSchema,
})
  .strict();

type RawGetInvoiceGenerationJobStatusPayload = z.infer<
  typeof getInvoiceGenerationJobStatusPayloadSchema
>;

export type GetInvoiceGenerationJobStatusPayload = Simplify<
  NormalizeOptional<RawGetInvoiceGenerationJobStatusPayload>
>;

export type GetInvoiceGenerationJobStatusPayloadInput =
  GetInvoiceGenerationJobStatusPayload;

export const getInvoiceGenerationJobStatusResponseSchema = z.object({
  jobId: nonEmptyStringSchema,
  status: invoiceGenerationJobStatusSchema,
  invoiceId: nonEmptyStringSchema.optional(),
  reason: nonEmptyStringSchema.optional(),
});

type RawGetInvoiceGenerationJobStatusResponse = z.infer<
  typeof getInvoiceGenerationJobStatusResponseSchema
>;

export type GetInvoiceGenerationJobStatusResponse = Simplify<
  NormalizeOptional<RawGetInvoiceGenerationJobStatusResponse>
>;
