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
  .passthrough();

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
