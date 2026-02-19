import type {
  Subscription,
  SubscriptionDomainEvent,
  SubscriptionStatus,
} from "@grantledger/contracts";

// Note: The invoice calculation logic is duplicated here from the billing service to avoid coupling the domain model to the billing implementation. This allows for more flexibility in how invoices are generated and calculated, and avoids unnecessary dependencies between the domain and billing layers.
const ALLOWED_STATUS_TRANSITIONS: Record<
  SubscriptionStatus,
  SubscriptionStatus[]
> = {
  trialing: ["active", "past_due", "canceled"],
  active: ["past_due", "canceled"],
  past_due: ["active", "canceled"],
  canceled: [],
};

function toEpoch(value: string): number {
  return new Date(value).getTime();
}

function assertInCurrentPeriod(subscription: Subscription, at: string): void {
  const now = toEpoch(at);
  const start = toEpoch(subscription.currentPeriod.startsAt);
  const end = toEpoch(subscription.currentPeriod.endsAt);

  if (now < start || now > end) {
    throw new SubscriptionDomainError(
      "effectiveAt must be within current billing period",
    );
  }
}

export class SubscriptionDomainError extends Error {}
export class InvalidSubscriptionTransitionError extends SubscriptionDomainError {}

export function assertTransitionAllowed(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(to)) {
    throw new InvalidSubscriptionTransitionError(
      `Invalid transition from ${from} to ${to}`,
    );
  }
}

export function createSubscriptionAggregate(input: {
  subscriptionId: string;
  tenantId: string;
  customerId: string;
  planId: string;
  currentPeriod: { startsAt: string; endsAt: string };
  trialEndsAt?: string;
  occurredAt: string;
}): { next: Subscription; event: SubscriptionDomainEvent } {
  const status: SubscriptionStatus = input.trialEndsAt ? "trialing" : "active";

  const next: Subscription = {
    id: input.subscriptionId,
    tenantId: input.tenantId,
    customerId: input.customerId,
    planId: input.planId,
    status,
    currentPeriod: input.currentPeriod,
    cancelAtPeriodEnd: false,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };

  const event: SubscriptionDomainEvent = {
    name: "subscription.created",
    subscriptionId: next.id,
    tenantId: next.tenantId,
    occurredAt: input.occurredAt,
    payload: {
      status: next.status,
      planId: next.planId,
    },
  };

  return { next, event };
}

export function applyUpgrade(
  current: Subscription,
  nextPlanId: string,
  effectiveAt: string,
): { next: Subscription; event: SubscriptionDomainEvent } {
  if (current.status === "canceled") {
    throw new SubscriptionDomainError(
      "Canceled subscription cannot be upgraded",
    );
  }

  assertInCurrentPeriod(current, effectiveAt);

  const next: Subscription = {
    ...current,
    planId: nextPlanId,
    updatedAt: effectiveAt,
  };

  const event: SubscriptionDomainEvent = {
    name: "subscription.upgraded",
    subscriptionId: next.id,
    tenantId: next.tenantId,
    occurredAt: effectiveAt,
    payload: {
      previousPlanId: current.planId,
      nextPlanId,
    },
  };

  return { next, event };
}

export function applyDowngrade(
  current: Subscription,
  nextPlanId: string,
  effectiveAt: string,
): { next: Subscription; event: SubscriptionDomainEvent } {
  if (current.status === "canceled") {
    throw new SubscriptionDomainError(
      "Canceled subscription cannot be downgraded",
    );
  }

  assertInCurrentPeriod(current, effectiveAt);

  const next: Subscription = {
    ...current,
    planId: nextPlanId,
    updatedAt: effectiveAt,
  };

  const event: SubscriptionDomainEvent = {
    name: "subscription.downgraded",
    subscriptionId: next.id,
    tenantId: next.tenantId,
    occurredAt: effectiveAt,
    payload: {
      previousPlanId: current.planId,
      nextPlanId,
    },
  };

  return { next, event };
}

export function applyCancelNow(
  current: Subscription,
  canceledAt: string,
): { next: Subscription; event: SubscriptionDomainEvent } {
  assertTransitionAllowed(current.status, "canceled");

  const next: Subscription = {
    ...current,
    status: "canceled",
    cancelAtPeriodEnd: false,
    canceledAt,
    currentPeriod: {
      ...current.currentPeriod,
      endsAt: canceledAt,
    },
    updatedAt: canceledAt,
  };

  const event: SubscriptionDomainEvent = {
    name: "subscription.canceled_now",
    subscriptionId: next.id,
    tenantId: next.tenantId,
    occurredAt: canceledAt,
    payload: {
      previousStatus: current.status,
      nextStatus: next.status,
    },
  };

  return { next, event };
}

export function applyCancelAtPeriodEnd(
  current: Subscription,
  occurredAt: string,
): { next: Subscription; event: SubscriptionDomainEvent } {
  if (current.status === "canceled") {
    throw new SubscriptionDomainError("Subscription is already canceled");
  }

  const next: Subscription = {
    ...current,
    cancelAtPeriodEnd: true,
    updatedAt: occurredAt,
  };

  const event: SubscriptionDomainEvent = {
    name: "subscription.cancel_at_period_end",
    subscriptionId: next.id,
    tenantId: next.tenantId,
    occurredAt,
    payload: {
      currentPeriodEnd: current.currentPeriod.endsAt,
    },
  };

  return { next, event };
}
