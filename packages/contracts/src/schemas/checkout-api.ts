import { z } from "zod";

import {
  billingPeriodSchema,
  nonEmptyStringSchema,
  dateTimeStringSchema,
  paymentProviderNameSchema,
} from "./common.js";

export const startCheckoutPayloadSchema = z
  .object({
    planId: nonEmptyStringSchema,
    billingPeriod: billingPeriodSchema,
    successUrl: nonEmptyStringSchema.optional(),
    cancelUrl: nonEmptyStringSchema.optional(),
    externalReference: nonEmptyStringSchema.optional(),
  })
  .strict();

export type StartCheckoutPayload = z.infer<typeof startCheckoutPayloadSchema>;

export const startCheckoutResponseSchema = z
  .object({
    provider: paymentProviderNameSchema,
    sessionId: nonEmptyStringSchema,
    checkoutUrl: nonEmptyStringSchema,
    createdAt: dateTimeStringSchema,
  })
  .strict();

export type StartCheckoutResponse = z.infer<typeof startCheckoutResponseSchema>;