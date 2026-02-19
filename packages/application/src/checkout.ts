import type {
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  PaymentProviderName,
} from "@grantledger/contracts";
import { BadRequestError } from "./auth-context.js";

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionResult> | CreateCheckoutSessionResult;
}

export interface StartSubscriptionCheckoutInput {
  provider: PaymentProvider;
  tenantId: string | null;
  planId: string | null;
  billingPeriod: BillingPeriod | null;
  successUrl?: string;
  cancelUrl?: string;
  externalReference?: string;
}

export async function startSubscriptionCheckout(
  input: StartSubscriptionCheckoutInput,
): Promise<CreateCheckoutSessionResult> {
  if (!input.tenantId) {
    throw new BadRequestError("Tenant id is required");
  }

  if (!input.planId) {
    throw new BadRequestError("Plan id is required");
  }

  if (!input.billingPeriod) {
    throw new BadRequestError("Billing period is required");
  }

  const successUrl = input.successUrl ?? "https://app.local/billing/success";
  const cancelUrl = input.cancelUrl ?? "https://app.local/billing/cancel";

  const checkoutInput: CreateCheckoutSessionInput = {
    tenantId: input.tenantId,
    planId: input.planId,
    billingPeriod: input.billingPeriod,
    successUrl,
    cancelUrl,
  };

  if (input.externalReference !== undefined) {
    checkoutInput.externalReference = input.externalReference;
  }

  return input.provider.createCheckoutSession(checkoutInput);
}
