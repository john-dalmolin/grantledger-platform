import type {
  AuthenticatedUser,
  IdempotencyRecord,
  RequestContext,
  PaymentProviderName,
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";
import {
  hasActiveMembershipForTenant,
  hashPayload,
  type Membership,
} from "@grantledger/domain";

export class AuthenticationError extends Error {
  constructor(message = "User is not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "User has no access to this tenant") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  constructor(message = "Invalid request input") {
    super(message);
    this.name = "BadRequestError";
  }
}

export class MissingIdempotencyKeyError extends Error {
  constructor(message = "Idempotency-Key is required") {
    super(message);
    this.name = "MissingIdempotencyKeyError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = "Idempotency key reuse with different payload") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export interface ResolveRequestContextInput {
  user: AuthenticatedUser | null;
  tenantId: string | null;
  memberships: ReadonlyArray<Membership>;
}

export function resolveRequestContext(
  input: ResolveRequestContextInput,
): RequestContext {
  if (!input.user) {
    throw new AuthenticationError();
  }

  if (!input.tenantId) {
    throw new BadRequestError("Tenant id is required");
  }

  const membership = hasActiveMembershipForTenant(
    input.memberships,
    input.tenantId,
  );

  if (!membership) {
    throw new ForbiddenError();
  }

  return {
    user: input.user,
    tenant: {
      id: membership.tenantId,
      role: membership.role,
    },
  };
}

export interface ProcessWithIdempotencyInput<TPayload, TResponse> {
  key: string | null;
  payload: TPayload;
  store: Map<string, IdempotencyRecord<TResponse>>;
  execute: () => TResponse;
  now?: () => Date;
}

export interface ProcessWithIdempotencyResult<TResponse> {
  response: TResponse;
  replayed: boolean;
}

export function processWithIdempotency<TPayload, TResponse>(
  input: ProcessWithIdempotencyInput<TPayload, TResponse>,
): ProcessWithIdempotencyResult<TResponse> {
  if (!input.key) {
    throw new MissingIdempotencyKeyError();
  }

  const payloadHash = hashPayload(input.payload);
  const existingRecord = input.store.get(input.key);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }

    return {
      response: existingRecord.response,
      replayed: true,
    };
  }

  const response = input.execute();
  const createdAt = (input.now ?? (() => new Date()))().toISOString();

  input.store.set(input.key, {
    key: input.key,
    payloadHash,
    status: "completed",
    response,
    createdAt,
  });

  return {
    response,
    replayed: false,
  };
}

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
