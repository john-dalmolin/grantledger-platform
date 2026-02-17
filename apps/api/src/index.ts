import {
  AuthenticationError,
  BadRequestError,
  createSubscription,
  ForbiddenError,
  IdempotencyConflictError,
  MissingIdempotencyKeyError,
  processWithIdempotency,
  resolveRequestContext,
  startSubscriptionCheckout,
  upgradeSubscription,
  downgradeSubscription,
  cancelSubscriptionNow,
  cancelSubscriptionAtPeriodEnd,
  SubscriptionNotFoundError,
  SubscriptionValidationError,
  SubscriptionConflictError,
  SubscriptionIdempotencyConflictError,
  type SubscriptionUseCaseDeps,
  type SubscriptionRepository,
  type SubscriptionIdempotencyStore,
  type SubscriptionIdempotencyStoreRecord,
  type SubscriptionEventPublisher,
  type SubscriptionAuditLogger,
  type PaymentProvider,
} from "@grantledger/application";

import type {
  IdempotencyRecord,
  RequestContext,
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  Subscription,
  SubscriptionDomainEvent,
  SubscriptionAuditEvent,
  CreateSubscriptionCommandInput,
  UpgradeSubscriptionCommandInput,
  DowngradeSubscriptionCommandInput,
  CancelSubscriptionNowCommandInput,
  CancelSubscriptionAtPeriodEndCommandInput,
} from "@grantledger/contracts";
import type { Membership } from "@grantledger/domain";
import { randomUUID } from "crypto";
import { SubscriptionDomainError } from "@grantledger/domain";

type Headers = Record<string, string | undefined>;
interface ApiResponse {
  status: number;
  body: unknown;
}

function GetHeaderGetHeader(headers: Headers, key: string): string | null {
  return headers[key.toLowerCase()] ?? headers[key] ?? null;
}

class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly store = new Map<string, Subscription>();

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return this.store.get(subscriptionId) ?? null;
  }

  // This method is not part of the SubscriptionRepository interface, but it's useful for testing purposes to directly add subscriptions to the store
  async create(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }

  // This method update subscriptions in the store
  async save(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }
}

class InMemorySubscriptionIdempotencyStore implements SubscriptionIdempotencyStore {
  private readonly store = new Map<
    string,
    SubscriptionIdempotencyStoreRecord
  >();

  async get(
    command: string,
    idempotencyKey: string,
  ): Promise<SubscriptionIdempotencyStoreRecord | null> {
    return this.store.get(`${command}:${idempotencyKey}`) ?? null;
  }

  async set(
    command: string,
    idempotencyKey: string,
    record: SubscriptionIdempotencyStoreRecord,
  ): Promise<void> {
    this.store.set(`${command}:${idempotencyKey}`, record);
  }
}

class ConsoleSubscriptionEventPublisher implements SubscriptionEventPublisher {
  async publish(event: SubscriptionDomainEvent): Promise<void> {
    console.log(JSON.stringify({ type: "domain_event", ...event }));
  }
}

class ConsoleSubscriptionAuditLogger implements SubscriptionAuditLogger {
  async log(event: SubscriptionAuditEvent): Promise<void> {
    console.log(JSON.stringify({ type: "audit_event", ...event }));
  }
}

const subscriptionDeps: SubscriptionUseCaseDeps = {
  repository: new InMemorySubscriptionRepository(),
  idempotencyStore: new InMemorySubscriptionIdempotencyStore(),
  eventPublisher: new ConsoleSubscriptionEventPublisher(),
  auditLogger: new ConsoleSubscriptionAuditLogger(),
};

function buildCommandContext(headers: Headers, reason: string) {
  const actorId = GetHeaderGetHeader(headers, "x-user-id") ?? "system";
  const traceId = GetHeaderGetHeader(headers, "x-trace-id") ?? randomUUID();
  const idempotencyKey = GetHeaderGetHeader(headers, "idempotency-key") ?? "";
  const requestedAt = new Date().toISOString();

  return {
    actor: { id: actorId, type: "user" as const },
    reason,
    traceId,
    idempotencyKey,
    requestedAt,
  };
}

export async function handleCreateSubscriptionCommand(
  headers: Headers,
  payload: {
    subscriptionId: string;
    tenantId: string;
    customerId: string;
    planId: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt?: string;
    reason?: string;
  },
): Promise<ApiResponse> {
  try {
    const input: CreateSubscriptionCommandInput = {
      subscriptionId: payload.subscriptionId,
      tenantId: payload.tenantId,
      customerId: payload.customerId,
      planId: payload.planId,
      currentPeriod: {
        startsAt: payload.currentPeriodStart,
        endsAt: payload.currentPeriodEnd,
      },
      ...(payload.trialEndsAt !== undefined
        ? { trialEndsAt: payload.trialEndsAt }
        : {}),
      context: buildCommandContext(
        headers,
        payload.reason ?? "create subscription",
      ),
    };

    const result = await createSubscription(subscriptionDeps, input);
    return { status: 201, body: result };
  } catch (error) {
    return toApiError(error);
  }
}

export async function handleUpgradeSubscriptionCommand(
  headers: Headers,
  payload: {
    subscriptionId: string;
    nextPlanId: string;
    effectiveAt: string;
    reason?: string;
  },
): Promise<ApiResponse> {
  try {
    const input: UpgradeSubscriptionCommandInput = {
      subscriptionId: payload.subscriptionId,
      nextPlanId: payload.nextPlanId,
      effectiveAt: payload.effectiveAt,
      context: buildCommandContext(
        headers,
        payload.reason ?? "upgrade subscription",
      ),
    };

    const result = await upgradeSubscription(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiError(error);
  }
}

export async function handleDowngradeSubscriptionCommand(
  headers: Headers,
  payload: {
    subscriptionId: string;
    nextPlanId: string;
    effectiveAt: string;
    reason?: string;
  },
): Promise<ApiResponse> {
  try {
    const input: DowngradeSubscriptionCommandInput = {
      subscriptionId: payload.subscriptionId,
      nextPlanId: payload.nextPlanId,
      effectiveAt: payload.effectiveAt,
      context: buildCommandContext(
        headers,
        payload.reason ?? "downgrade subscription",
      ),
    };

    const result = await downgradeSubscription(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiError(error);
  }
}

export async function handleCancelSubscriptionNowCommand(
  headers: Headers,
  payload: {
    subscriptionId: string;
    canceledAt: string;
    reason?: string;
  },
): Promise<ApiResponse> {
  try {
    const input: CancelSubscriptionNowCommandInput = {
      subscriptionId: payload.subscriptionId,
      canceledAt: payload.canceledAt,
      context: buildCommandContext(
        headers,
        payload.reason ?? "cancel subscription now",
      ),
    };

    const result = await cancelSubscriptionNow(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiError(error);
  }
}

export async function handleCancelSubscriptionAtPeriodEndCommand(
  headers: Headers,
  payload: {
    subscriptionId: string;
    reason?: string;
  },
): Promise<ApiResponse> {
  try {
    const input: CancelSubscriptionAtPeriodEndCommandInput = {
      subscriptionId: payload.subscriptionId,
      context: buildCommandContext(
        headers,
        payload.reason ?? "cancel subscription at period end",
      ),
    };

    const result = await cancelSubscriptionAtPeriodEnd(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiError(error);
  }
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

// Simple implementation that generates fake checkout session data for demonstration purposes.
const fakePaymentProvider = new FakePaymentProvider();

// This handler demonstrates how to start a subscription checkout session using the startSubscriptionCheckout use case from the application layer. It resolves the request context from the headers, validates the input payload, and calls the use case with the appropriate dependencies and parameters. It also handles various error scenarios and returns appropriate HTTP status codes and messages in the API response.
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
        : {}), // The successUrl is where the user will be redirected after a successful payment, and the cancelUrl is where they will be redirected if they cancel the checkout process. These URLs are typically provided by the client application to ensure that the user is returned to the appropriate page after completing or canceling the checkout process.

      ...(payload?.cancelUrl !== undefined
        ? { cancelUrl: payload.cancelUrl }
        : {}), // The cancelUrl is where the user will be redirected if they cancel the checkout process, and the successUrl is where they will be redirected after a successful payment. These URLs are typically provided by the client application to ensure that the user is returned to the appropriate page after completing or canceling the checkout process.

      ...(payload?.externalReference !== undefined
        ? { externalReference: payload.externalReference }
        : {}), // The externalReference is an optional field that can be used to associate the checkout session with an external system or reference, such as an order ID or user ID from the client application. This can be useful for tracking and reconciliation purposes when handling webhook events from the payment provider about the checkout session status (e.g., completed, canceled, etc.).
    });

    // You would also want to persist the checkout session details in your database and associate it with the tenant and plan for later reference when handling webhook events from the payment provider about the checkout session status (e.g., completed, canceled, etc.). For this example, we are simply returning the checkout session details in the API response.
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
      // AuthenticationError can be thrown if the user is not authenticated, so we return a 401 Unauthorized response with the error message to indicate that the client needs to authenticate before making this request.
      return { status: 401, body: { message: error.message } };
    }

    if (error instanceof ForbiddenError) {
      // ForbiddenError can be thrown if the user does not have permission to start a checkout session for the specified plan or tenant, so we return a 403 Forbidden response with the error message to indicate that the client is authenticated but does not have the necessary permissions to perform this action.
      return { status: 403, body: { message: error.message } };
    }

    if (error instanceof BadRequestError) {
      // BadRequestError can be thrown for various reasons, such as invalid input data or unsupported billing periods, so we return a 400 Bad Request response with the error message to provide more context to the client about what went wrong with their request.
      return { status: 400, body: { message: error.message } };
    }

    // For any other unhandled errors, we return a generic 500 Internal Server Error response
    return { status: 500, body: { message: "Unexpected error" } };
  }
}

// Helper function to convert application errors to API responses
function getErrorMessage(error: unknown): string {
  // This function checks if the error is an instance of the built-in Error class and returns its message property. If the error is not an instance of Error, it returns a generic "Unknown error" message. This is useful for ensuring that we always return a string message in our API responses, even if the error object does not conform to the standard Error structure.
  return error instanceof Error ? error.message : "Unknown error";
}

// This function maps application errors to appropriate HTTP status codes and response bodies
function toApiError(error: unknown): {
  status: number;
  body: { message: string };
} {
  if (error instanceof SubscriptionValidationError) {
    /// This is an example of a domain-specific error that could occur during subscription operations
    return { status: 400, body: { message: getErrorMessage(error) } };
  }

  if (error instanceof SubscriptionNotFoundError) {
    // This error indicates that a subscription with the specified ID was not found in the system
    return { status: 404, body: { message: getErrorMessage(error) } };
  }

  if (
    error instanceof SubscriptionConflictError ||
    error instanceof SubscriptionIdempotencyConflictError ||
    error instanceof SubscriptionDomainError
  ) {
    // These errors indicate various types of conflicts that can occur during subscription operations, such as trying to create a subscription that already exists or performing an action that is not allowed in the current state of the subscription
    return { status: 409, body: { message: getErrorMessage(error) } };
  }

  // For any other unhandled errors, we return a generic 500 Internal Server Error response
  return { status: 500, body: { message: "Unexpected error" } };
}
