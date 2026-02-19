import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

// We keep compatibility broad for now; timezone strictness will be hardened in ARCH-004.
export const dateTimeStringSchema = nonEmptyStringSchema;

export const billingPeriodSchema = z.enum(["monthly", "yearly"]);

export const paymentProviderNameSchema = z.enum([
  "fake",
  "stripe",
  "paypal",
  "adyen",
  "braintree",
]);

export const headersRecordSchema = z.record(z.string(), z.string().optional());
