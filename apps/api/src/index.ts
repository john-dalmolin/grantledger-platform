import {
  AuthenticationError,
  BadRequestError,
  ForbiddenError,
  IdempotencyConflictError,
  MissingIdempotencyKeyError,
  processWithIdempotency,
  resolveRequestContext,
  startSubscriptionCheckout,
  type PaymentProvider,
} from "@grantledger/application";
import type {
  IdempotencyRecord,
  RequestContext,
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";
import type { Membership } from "@grantledger/domain";

type Headers = Record<string, string | undefined>;

interface ApiResponse {
  status: number;
  body: unknown;
}

interface CreateSubscriptionPayload {
  planId: string;
  externalReference?: string;
}

interface CreateSubscriptionResponse {
  subscriptionId: string;
  tenantId: string;
  planId: string;
  status: "active";
  createdAt: string;
}

const membershipStore: Membership[] = [
  { userId: "u_1", tenantId: "t_1", role: "owner", status: "active" },
  { userId: "u_2", tenantId: "t_1", role: "member", status: "inactive" },
];

const idempotencyStore = new Map<
  string,
  IdempotencyRecord<CreateSubscriptionResponse>
>();

function getHeader(headers: Headers, key: string): string | null {
  const value = headers[key.toLowerCase()] ?? headers[key];
  return value ?? null;
}

function resolveContextFromHeaders(headers: Headers): RequestContext {
  const userId = getHeader(headers, "x-user-id");
  const tenantId = getHeader(headers, "x-tenant-id");

  const user = userId ? { id: userId } : null;
  const memberships = userId
    ? membershipStore.filter((membership) => membership.userId === userId)
    : [];

  return resolveRequestContext({
    user,
    tenantId,
    memberships,
  });
}

export function handleProtectedRequest(headers: Headers): ApiResponse {
  try {
    const context = resolveContextFromHeaders(headers);

    return {
      status: 200,
      body: {
        message: "Authorized",
        context,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      return { status: 400, body: { message: error.message } };
    }

    return { status: 500, body: { message: "Unexpected error" } };
  }
}

export function handleCreateSubscription(
  headers: Headers,
  payload: CreateSubscriptionPayload,
): ApiResponse {
  try {
    const context = resolveContextFromHeaders(headers);

    if (!payload.planId) {
      throw new BadRequestError("planId is required");
    }

    const idempotencyKey = getHeader(headers, "idempotency-key");

    const { response, replayed } = processWithIdempotency({
      key: idempotencyKey,
      payload: {
        tenantId: context.tenant.id,
        planId: payload.planId,
        externalReference: payload.externalReference ?? null,
      },
      store: idempotencyStore,
      execute: () => ({
        subscriptionId: `sub_${idempotencyStore.size + 1}`,
        tenantId: context.tenant.id,
        planId: payload.planId,
        status: "active",
        createdAt: new Date().toISOString(),
      }),
    });

    return {
      status: replayed ? 200 : 201,
      body: {
        message: replayed ? "Replayed" : "Created",
        data: response,
        context,
      },
    };
  } catch (error) {
    if (error instanceof MissingIdempotencyKeyError) {
      return { status: 400, body: { message: error.message } };
    }

    if (error instanceof IdempotencyConflictError) {
      return { status: 409, body: { message: error.message } };
    }

    if (error instanceof AuthenticationError) {
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      return { status: 400, body: { message: error.message } };
    }

    return { status: 500, body: { message: "Unexpected error" } };
  }
}

interface StartCheckoutPayload {
  planId: string;
  billingPeriod: BillingPeriod;
  successUrl?: string;
  cancelUrl?: string;
  externalReference?: string;
}

class FakePaymentProvider implements PaymentProvider {
  public readonly name = "fake" as const;

  createCheckoutSession(
    _input: CreateCheckoutSessionInput,
  ): CreateCheckoutSessionResult {
    void _input;
    const sessionId = `fake_chk_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      provider: this.name,
      sessionId,
      checkoutUrl: `https://pay.local/checkout/${sessionId}`,
      createdAt: new Date().toISOString(),
    };
  }
}

const fakePaymentProvider = new FakePaymentProvider();

export async function handleStartCheckout(
  headers: Headers,
  payload: StartCheckoutPayload,
): Promise<ApiResponse> {
  try {
    const context = resolveContextFromHeaders(headers);

    const checkout = await startSubscriptionCheckout({
      provider: fakePaymentProvider,
      tenantId: context.tenant.id,
      planId: payload.planId,
      billingPeriod: payload.billingPeriod,
      ...(payload?.successUrl !== undefined
        ? { successUrl: payload.successUrl }
        : {}),
      ...(payload?.cancelUrl !== undefined
        ? { cancelUrl: payload.cancelUrl }
        : {}),
      ...(payload?.externalReference !== undefined
        ? { externalReference: payload.externalReference }
        : {}),
    });

    return {
      status: 201,
      body: {
        message: "Checkout session created",
        data: checkout,
        context,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      return { status: 400, body: { message: error.message } };
    }

    return { status: 500, body: { message: "Unexpected error" } };
  }
}
