import {
  CancelSubscriptionAtPeriodEndCommandInput,
  CancelSubscriptionNowCommandInput,
  CreateSubscriptionCommandInput,
  DowngradeSubscriptionCommandInput,
  Subscription,
  SubscriptionAuditEvent,
  SubscriptionCommandContext,
  SubscriptionDomainEvent,
  UpgradeSubscriptionCommandInput,
} from "@grantledger/contracts";
import {
  createSubscriptionAggregate,
  applyUpgrade,
  applyDowngrade,
  applyCancelNow,
  applyCancelAtPeriodEnd,
} from "@grantledger/domain";

export * from "./auth-context.js";

export class SubscriptionNotFoundError extends Error {
  constructor(message = "Subscription not found") {
    super(message);
  }
}
export class SubscriptionValidationError extends Error {}
export class SubscriptionIdempotencyConflictError extends Error {
  constructor(message = "Same idempotency key with different payload") {
    super(message);
  }
}
export class SubscriptionConflictError extends Error {}

export interface SubscriptionRepository {
  findById(subscriptionId: string): Promise<Subscription | null>;
  create(subscription: Subscription): Promise<void>;
  save(subscription: Subscription): Promise<void>;
}

export interface SubscriptionEventPublisher {
  publish(event: SubscriptionDomainEvent): Promise<void>;
}

export interface SubscriptionAuditLogger {
  log(event: SubscriptionAuditEvent): Promise<void>;
}

export interface SubscriptionIdempotencyStoreRecord {
  fingerprint: string;
  response: Subscription;
}

export interface SubscriptionIdempotencyStore {
  get(
    command: string,
    idempotencyKey: string,
  ): Promise<SubscriptionIdempotencyStoreRecord | null>;
  set(
    command: string,
    idempotencyKey: string,
    record: SubscriptionIdempotencyStoreRecord,
  ): Promise<void>;
}

export interface SubscriptionUseCaseDeps {
  repository: SubscriptionRepository;
  eventPublisher: SubscriptionEventPublisher;
  auditLogger: SubscriptionAuditLogger;
  idempotencyStore: SubscriptionIdempotencyStore;
}

function fingerprint(payload: unknown): string {
  return JSON.stringify(payload);
}

function requireIdempotencyKey(context: SubscriptionCommandContext): void {
  if (!context.idempotencyKey || context.idempotencyKey.trim().length === 0) {
    throw new SubscriptionValidationError("idempotencyKey is required");
  }
}

async function runIdempotentCommand(
  deps: SubscriptionUseCaseDeps,
  command: string,
  context: SubscriptionCommandContext,
  payloadForFingerprint: unknown,
  execute: () => Promise<Subscription>,
): Promise<Subscription> {
  requireIdempotencyKey(context);

  const fp = fingerprint(payloadForFingerprint);
  const existing = await deps.idempotencyStore.get(
    command,
    context.idempotencyKey,
  );

  if (existing) {
    if (existing.fingerprint !== fp) {
      throw new SubscriptionIdempotencyConflictError(
        "Same idempotency key with different payload",
      );
    }
    return existing.response;
  }

  const response = await execute();
  await deps.idempotencyStore.set(command, context.idempotencyKey, {
    fingerprint: fp,
    response,
  });

  return response;
}

async function audit(
  deps: SubscriptionUseCaseDeps,
  event: SubscriptionAuditEvent,
): Promise<void> {
  await deps.auditLogger.log(event);
}

export async function createSubscription(
  deps: SubscriptionUseCaseDeps,
  input: CreateSubscriptionCommandInput,
): Promise<Subscription> {
  return runIdempotentCommand(
    deps,
    "create_subscription",
    input.context,
    input,
    async () => {
      const existing = await deps.repository.findById(input.subscriptionId);
      if (existing) {
        throw new SubscriptionConflictError("Subscription already exists");
      }

      const result = createSubscriptionAggregate({
        subscriptionId: input.subscriptionId,
        tenantId: input.tenantId,
        customerId: input.customerId,
        planId: input.planId,
        currentPeriod: input.currentPeriod,
        ...(input.trialEndsAt !== undefined
          ? { trialEndsAt: input.trialEndsAt }
          : {}),
        occurredAt: input.context.requestedAt,
      });

      await deps.repository.create(result.next);
      await deps.eventPublisher.publish(result.event);
      await audit(deps, {
        action: "subscription.create",
        actor: input.context.actor,
        reason: input.context.reason,
        traceId: input.context.traceId,
        occurredAt: input.context.requestedAt,
        subscriptionId: result.next.id,
        tenantId: result.next.tenantId,
        metadata: { status: result.next.status, planId: result.next.planId },
      });

      return result.next;
    },
  );
}

export async function upgradeSubscription(
  deps: SubscriptionUseCaseDeps,
  input: UpgradeSubscriptionCommandInput,
): Promise<Subscription> {
  return runIdempotentCommand(
    deps,
    "upgrade_subscription",
    input.context,
    input,
    async () => {
      const current = await deps.repository.findById(input.subscriptionId);
      if (!current)
        throw new SubscriptionNotFoundError("Subscription not found");

      const result = applyUpgrade(current, input.nextPlanId, input.effectiveAt);
      await deps.repository.save(result.next);
      await deps.eventPublisher.publish(result.event);
      await audit(deps, {
        action: "subscription.upgrade",
        actor: input.context.actor,
        reason: input.context.reason,
        traceId: input.context.traceId,
        occurredAt: input.context.requestedAt,
        subscriptionId: result.next.id,
        tenantId: result.next.tenantId,
        metadata: {
          nextPlanId: input.nextPlanId,
          effectiveAt: input.effectiveAt,
        },
      });

      return result.next;
    },
  );
}

export async function downgradeSubscription(
  deps: SubscriptionUseCaseDeps,
  input: DowngradeSubscriptionCommandInput,
): Promise<Subscription> {
  return runIdempotentCommand(
    deps,
    "downgrade_subscription",
    input.context,
    input,
    async () => {
      const current = await deps.repository.findById(input.subscriptionId);
      if (!current)
        throw new SubscriptionNotFoundError("Subscription not found");

      const result = applyDowngrade(
        current,
        input.nextPlanId,
        input.effectiveAt,
      );
      await deps.repository.save(result.next);
      await deps.eventPublisher.publish(result.event);
      await audit(deps, {
        action: "subscription.downgrade",
        actor: input.context.actor,
        reason: input.context.reason,
        traceId: input.context.traceId,
        occurredAt: input.context.requestedAt,
        subscriptionId: result.next.id,
        tenantId: result.next.tenantId,
        metadata: {
          nextPlanId: input.nextPlanId,
          effectiveAt: input.effectiveAt,
        },
      });

      return result.next;
    },
  );
}

export async function cancelSubscriptionNow(
  deps: SubscriptionUseCaseDeps,
  input: CancelSubscriptionNowCommandInput,
): Promise<Subscription> {
  return runIdempotentCommand(
    deps,
    "cancel_subscription_now",
    input.context,
    input,
    async () => {
      const current = await deps.repository.findById(input.subscriptionId);
      if (!current)
        throw new SubscriptionNotFoundError("Subscription not found");

      const result = applyCancelNow(current, input.canceledAt);
      await deps.repository.save(result.next);
      await deps.eventPublisher.publish(result.event);
      await audit(deps, {
        action: "subscription.cancel_now",
        actor: input.context.actor,
        reason: input.context.reason,
        traceId: input.context.traceId,
        occurredAt: input.context.requestedAt,
        subscriptionId: result.next.id,
        tenantId: result.next.tenantId,
        metadata: { canceledAt: input.canceledAt },
      });

      return result.next;
    },
  );
}

export async function cancelSubscriptionAtPeriodEnd(
  deps: SubscriptionUseCaseDeps,
  input: CancelSubscriptionAtPeriodEndCommandInput,
): Promise<Subscription> {
  return runIdempotentCommand(
    deps,
    "cancel_subscription_at_period_end",
    input.context,
    input,
    async () => {
      const current = await deps.repository.findById(input.subscriptionId);
      if (!current)
        throw new SubscriptionNotFoundError("Subscription not found");

      const result = applyCancelAtPeriodEnd(current, input.context.requestedAt);
      await deps.repository.save(result.next);
      await deps.eventPublisher.publish(result.event);
      await audit(deps, {
        action: "subscription.cancel_at_period_end",
        actor: input.context.actor,
        reason: input.context.reason,
        traceId: input.context.traceId,
        occurredAt: input.context.requestedAt,
        subscriptionId: result.next.id,
        tenantId: result.next.tenantId,
        metadata: { periodEndsAt: result.next.currentPeriod.endsAt },
      });

      return result.next;
    },
  );
}
