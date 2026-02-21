import { z } from "zod";
import { isIsoDateTimeWithOffset } from "@grantledger/shared";

export const nonEmptyStringSchema = z.string().trim().min(1);

export const dateTimeStringSchema = nonEmptyStringSchema.refine(
  isIsoDateTimeWithOffset,
  "Datetime must be ISO-8601 with explicit timezone offset (Z or ±HH:MM)",
);

export const billingPeriodSchema = z.enum(["monthly", "yearly"]);

export const paymentProviderNameSchema = z.enum([
  "fake",
  "stripe",
  "paypal",
  "adyen",
  "braintree",
]);

export const headersRecordSchema = z.record(z.string(), z.string().optional());
