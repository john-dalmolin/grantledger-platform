import {
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  createSubscription,
  downgradeSubscription,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  SubscriptionConflictError,
  type SubscriptionIdempotencyStore,
  type SubscriptionIdempotencyStoreRecord,
  SubscriptionIdempotencyConflictError,
  SubscriptionNotFoundError,
  type SubscriptionRepository,
  type SubscriptionUseCaseDeps,
  SubscriptionValidationError,
  upgradeSubscription,
} from "@grantledger/application";
import type {
  CancelSubscriptionAtPeriodEndCommandInput,
  CancelSubscriptionNowCommandInput,
  CreateSubscriptionCommandInput,
  DowngradeSubscriptionCommandInput,
  Subscription,
  SubscriptionAuditEvent,
  SubscriptionDomainEvent,
  UpgradeSubscriptionCommandInput,
} from "@grantledger/contracts";
import { SubscriptionDomainError } from "@grantledger/domain";
import { randomUUID } from "crypto";

import { getHeader } from "../http/headers.js";
import type { ApiResponse, Headers } from "../http/types.js";

class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly store = new Map<string, Subscription>();

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return this.store.get(subscriptionId) ?? null;
  }

  async create(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }

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
  const actorId = getHeader(headers, "x-user-id") ?? "system";
  const traceId = getHeader(headers, "x-trace-id") ?? randomUUID();
  const idempotencyKey = getHeader(headers, "idempotency-key") ?? "";
  const requestedAt = new Date().toISOString();

  return {
    actor: { id: actorId, type: "user" as const },
    reason,
    traceId,
    idempotencyKey,
    requestedAt,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function toApiError(error: unknown): ApiResponse {
  if (error instanceof SubscriptionValidationError) {
    return { status: 400, body: { message: getErrorMessage(error) } };
  }

  if (error instanceof SubscriptionNotFoundError) {
    return { status: 404, body: { message: getErrorMessage(error) } };
  }

  if (
    error instanceof SubscriptionConflictError ||
    error instanceof SubscriptionIdempotencyConflictError ||
    error instanceof SubscriptionDomainError
  ) {
    return { status: 409, body: { message: getErrorMessage(error) } };
  }

  return { status: 500, body: { message: "Unexpected error" } };
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
