import { toApiErrorResponse } from "../http/errors.js";
import {
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  createSubscription,
  downgradeSubscription,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  type SubscriptionIdempotencyStore,
  type SubscriptionIdempotencyStoreRecord,
  type SubscriptionRepository,
  type SubscriptionUseCaseDeps,
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
import {
  upgradeSubscriptionCommandPayloadSchema,
  createSubscriptionCommandPayloadSchema,
  downgradeSubscriptionCommandPayloadSchema,
  cancelSubscriptionNowCommandPayloadSchema,
  cancelSubscriptionAtPeriodEndCommandPayloadSchema,
} from "@grantledger/contracts";

import { parseOrThrowBadRequest } from "../http/validation.js";
import { randomUUID } from "crypto";
import { utcNowIso } from "@grantledger/shared";

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
  const requestedAt = utcNowIso();

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
  payload: unknown,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      createSubscriptionCommandPayloadSchema,
      payload,
      "Invalid create subscription command payload",
    );

    const input: CreateSubscriptionCommandInput = {
      subscriptionId: parsedPayload.subscriptionId,
      tenantId: parsedPayload.tenantId,
      customerId: parsedPayload.customerId,
      planId: parsedPayload.planId,
      currentPeriod: {
        startsAt: parsedPayload.currentPeriodStart,
        endsAt: parsedPayload.currentPeriodEnd,
      },
      ...(parsedPayload.trialEndsAt !== undefined
        ? { trialEndsAt: parsedPayload.trialEndsAt }
        : {}),
      context: buildCommandContext(
        headers,
        parsedPayload.reason ?? "create subscription",
      ),
    };

    const result = await createSubscription(subscriptionDeps, input);
    return { status: 201, body: result };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}

export async function handleUpgradeSubscriptionCommand(
  headers: Headers,
  payload: unknown,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      upgradeSubscriptionCommandPayloadSchema,
      payload,
      "Invalid upgrade subscription command payload",
    );

    const input: UpgradeSubscriptionCommandInput = {
      subscriptionId: parsedPayload.subscriptionId,
      nextPlanId: parsedPayload.nextPlanId,
      effectiveAt: parsedPayload.effectiveAt,
      context: buildCommandContext(
        headers,
        parsedPayload.reason ?? "upgrade subscription",
      ),
    };

    const result = await upgradeSubscription(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}

export async function handleDowngradeSubscriptionCommand(
  headers: Headers,
  payload: unknown,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      downgradeSubscriptionCommandPayloadSchema,
      payload,
      "Invalid downgrade subscription command payload",
    );

    const input: DowngradeSubscriptionCommandInput = {
      subscriptionId: parsedPayload.subscriptionId,
      nextPlanId: parsedPayload.nextPlanId,
      effectiveAt: parsedPayload.effectiveAt,
      context: buildCommandContext(
        headers,
        parsedPayload.reason ?? "downgrade subscription",
      ),
    };

    const result = await downgradeSubscription(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}

export async function handleCancelSubscriptionNowCommand(
  headers: Headers,
  payload: unknown,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      cancelSubscriptionNowCommandPayloadSchema,
      payload,
      "Invalid cancel subscription now command payload",
    );

    const input: CancelSubscriptionNowCommandInput = {
      subscriptionId: parsedPayload.subscriptionId,
      canceledAt: parsedPayload.canceledAt,
      context: buildCommandContext(
        headers,
        parsedPayload.reason ?? "cancel subscription now",
      ),
    };

    const result = await cancelSubscriptionNow(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}

export async function handleCancelSubscriptionAtPeriodEndCommand(
  headers: Headers,
  payload: unknown,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      cancelSubscriptionAtPeriodEndCommandPayloadSchema,
      payload,
      "Invalid cancel subscription at period end command payload",
    );

    const input: CancelSubscriptionAtPeriodEndCommandInput = {
      subscriptionId: parsedPayload.subscriptionId,
      context: buildCommandContext(
        headers,
        parsedPayload.reason ?? "cancel subscription at period end",
      ),
    };

    const result = await cancelSubscriptionAtPeriodEnd(subscriptionDeps, input);
    return { status: 200, body: result };
  } catch (error) {
    return toApiErrorResponse(
      error,
      getHeader(headers, "x-trace-id") ?? undefined,
    );
  }
}
