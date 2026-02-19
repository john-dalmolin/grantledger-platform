import { z } from "zod";

import { dateTimeStringSchema, nonEmptyStringSchema } from "./common.js";

export const createSubscriptionCommandPayloadSchema = z
  .object({
    subscriptionId: nonEmptyStringSchema,
    tenantId: nonEmptyStringSchema,
    customerId: nonEmptyStringSchema,
    planId: nonEmptyStringSchema,
    currentPeriodStart: dateTimeStringSchema,
    currentPeriodEnd: dateTimeStringSchema,
    trialEndsAt: dateTimeStringSchema.optional(),
    reason: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type CreateSubscriptionCommandPayload = z.infer<
  typeof createSubscriptionCommandPayloadSchema
>;

export const upgradeSubscriptionCommandPayloadSchema = z
  .object({
    subscriptionId: nonEmptyStringSchema,
    nextPlanId: nonEmptyStringSchema,
    effectiveAt: dateTimeStringSchema,
    reason: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type UpgradeSubscriptionCommandPayload = z.infer<
  typeof upgradeSubscriptionCommandPayloadSchema
>;

export const downgradeSubscriptionCommandPayloadSchema = z
  .object({
    subscriptionId: nonEmptyStringSchema,
    nextPlanId: nonEmptyStringSchema,
    effectiveAt: dateTimeStringSchema,
    reason: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type DowngradeSubscriptionCommandPayload = z.infer<
  typeof downgradeSubscriptionCommandPayloadSchema
>;

export const cancelSubscriptionNowCommandPayloadSchema = z
  .object({
    subscriptionId: nonEmptyStringSchema,
    canceledAt: dateTimeStringSchema,
    reason: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type CancelSubscriptionNowCommandPayload = z.infer<
  typeof cancelSubscriptionNowCommandPayloadSchema
>;

export const cancelSubscriptionAtPeriodEndCommandPayloadSchema = z
  .object({
    subscriptionId: nonEmptyStringSchema,
    reason: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type CancelSubscriptionAtPeriodEndCommandPayload = z.infer<
  typeof cancelSubscriptionAtPeriodEndCommandPayloadSchema
>;

export const createSubscriptionPayloadSchema = z
  .object({
    planId: nonEmptyStringSchema,
    externalReference: nonEmptyStringSchema.optional(),
  })
  .passthrough();

export type CreateSubscriptionPayload = z.infer<
  typeof createSubscriptionPayloadSchema
>;
