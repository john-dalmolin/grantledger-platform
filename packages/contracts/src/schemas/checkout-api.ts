import { z } from "zod";

import {
  billingPeriodSchema,
  nonEmptyStringSchema,
} from "./common.js";

export const startCheckoutPayloadSchema = z
  .object({
    planId: nonEmptyStringSchema,
    billingPeriod: billingPeriodSchema,
    successUrl: nonEmptyStringSchema.optional(),
    cancelUrl: nonEmptyStringSchema.optional(),
    externalReference: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type StartCheckoutPayload = z.infer<typeof startCheckoutPayloadSchema>;
