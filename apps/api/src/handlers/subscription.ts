import { toApiErrorResponse } from "../http/errors.js";
import {
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  createInMemoryAsyncIdempotencyStore,
  createSubscription,
  downgradeSubscription,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  type SubscriptionIdempotencyStore,
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
import type { Clock, IdGenerator } from "@grantledger/shared";

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

export function createInMemorySubscriptionUseCaseDeps(): SubscriptionUseCaseDeps {
  return {
    repository: new InMemorySubscriptionRepository(),
    idempotencyStore:
      createInMemoryAsyncIdempotencyStore<Subscription>() satisfies SubscriptionIdempotencyStore,
    eventPublisher: new ConsoleSubscriptionEventPublisher(),
    auditLogger: new ConsoleSubscriptionAuditLogger(),
  };
}

export interface SubscriptionHandlersDeps {
  subscriptionUseCases: SubscriptionUseCaseDeps;
  clock: Clock;
  idGenerator: IdGenerator;
}

function buildCommandContext(
  headers: Headers,
  reason: string,
  deps: Pick<SubscriptionHandlersDeps, "clock" | "idGenerator">,
) {
  const actorId = getHeader(headers, "x-user-id") ?? "system";
  const traceId = getHeader(headers, "x-trace-id") ?? deps.idGenerator.next();
  const idempotencyKey = getHeader(headers, "idempotency-key") ?? "";
  const requestedAt = deps.clock.nowIso();

  return {
    actor: { id: actorId, type: "user" as const },
    reason,
    traceId,
    idempotencyKey,
    requestedAt,
  };
}

export interface SubscriptionHandlers {
  handleCreateSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleUpgradeSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleDowngradeSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleCancelSubscriptionNowCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleCancelSubscriptionAtPeriodEndCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
}

export function createSubscriptionHandlers(
  deps: SubscriptionHandlersDeps,
): SubscriptionHandlers {
  return {
    async handleCreateSubscriptionCommand(
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
            deps,
          ),
        };

        const result = await createSubscription(deps.subscriptionUseCases, input);
        return { status: 201, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleUpgradeSubscriptionCommand(
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
            deps,
          ),
        };

        const result = await upgradeSubscription(deps.subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleDowngradeSubscriptionCommand(
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
            deps,
          ),
        };

        const result = await downgradeSubscription(deps.subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleCancelSubscriptionNowCommand(
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
            deps,
          ),
        };

        const result = await cancelSubscriptionNow(deps.subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleCancelSubscriptionAtPeriodEndCommand(
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
            deps,
          ),
        };

        const result = await cancelSubscriptionAtPeriodEnd(
          deps.subscriptionUseCases,
          input,
        );
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },
  };
}
