import { z } from "zod";

import {
  dateTimeStringSchema,
  headersRecordSchema,
  nonEmptyStringSchema,
  paymentProviderNameSchema,
} from "./common.js";

export const paymentWebhookEnvelopeSchema = z
  .object({
    provider: paymentProviderNameSchema,
    rawBody: nonEmptyStringSchema,
    headers: headersRecordSchema,
    receivedAt: dateTimeStringSchema,
    traceId: nonEmptyStringSchema,
  })
  .strict();

export type PaymentWebhookEnvelopeInput = z.infer<
  typeof paymentWebhookEnvelopeSchema
>;

export const stripeProviderEventSchema = z
  .object({
    id: nonEmptyStringSchema,
    type: nonEmptyStringSchema,
    created: z.number().int(),
    data: z
      .object({
        object: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .passthrough();

export type StripeProviderEvent = z.infer<typeof stripeProviderEventSchema>;

export const paymentWebhookProcessResultSchema = z
  .object({
    status: z.enum(["processed", "duplicate", "rejected"]),
    provider: paymentProviderNameSchema,
    eventId: nonEmptyStringSchema.optional(),
    reason: nonEmptyStringSchema.optional(),
  })
  .strict();

export type PaymentWebhookProcessResultSchema = z.infer<
  typeof paymentWebhookProcessResultSchema
>;