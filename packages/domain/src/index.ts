import type { PlanVersion } from "@grantledger/contracts";

export type MembershipRole = "owner" | "admin" | "member";
export type MembershipStatus = "active" | "inactive";

export interface Membership {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

export function hasActiveMembershipForTenant(
  memberships: ReadonlyArray<Membership>,
  tenantId: string,
): Membership | null {
  const membership =
    memberships.find(
      (membershipItem) =>
        membershipItem.tenantId === tenantId &&
        membershipItem.status === "active",
    ) ?? null;

  return membership;
}

function stableSerialize(value: unknown): string {
  if (typeof value === "undefined") {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const objectEntries = Object.entries(value as Record<string, unknown>).sort(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
  );

  const serializedObject = objectEntries
    .map(
      ([entryKey, entryValue]) =>
        `${JSON.stringify(entryKey)}:${stableSerialize(entryValue)}`,
    )
    .join(",");

  return `{${serializedObject}}`;
}

export function hashPayload(payload: unknown): string {
  return stableSerialize(payload);
}

function toTime(value: string): number {
  return new Date(value).getTime();
}

function rangesOverlap(
  aStart: string,
  aEnd: string | undefined,
  bStart: string,
  bEnd: string | undefined,
): boolean {
  const aS = toTime(aStart);
  const aE = aEnd ? toTime(aEnd) : Number.POSITIVE_INFINITY;
  const bS = toTime(bStart);
  const bE = bEnd ? toTime(bEnd) : Number.POSITIVE_INFINITY;
  return aS <= bE && bS <= aE;
}

export function assertNoVersionOverlap(
  candidate: Pick<PlanVersion, "startsAt" | "endsAt">,
  existing: PlanVersion[],
): void {
  const hasOverlap = existing.some((v) =>
    rangesOverlap(candidate.startsAt, candidate.endsAt, v.startsAt, v.endsAt),
  );
  if (hasOverlap)
    throw new Error(
      "Plan version validity window overlaps with an existing version",
    );
}

export function assertPublishedVersionImmutable(current: PlanVersion): void {
  if (current.status === "published")
    throw new Error("Published plan version is immutable");
}

export function resolveEffectivePlanVersionAt(
  versions: PlanVersion[],
  at: string,
): PlanVersion | null {
  const point = toTime(at);
  const valid = versions.filter((v) => {
    if (v.status !== "published") return false;
    const start = toTime(v.startsAt);
    const end = v.endsAt ? toTime(v.endsAt) : Number.POSITIVE_INFINITY;
    return point >= start && point <= end;
  });

  // If multiple versions are valid at the same time, we take the one with the most recent start date
  const sorted = valid.sort((a, b) => toTime(b.startsAt) - toTime(a.startsAt));
  const first = sorted[0];
  return first ?? null; // explicitly return null if there are no valid versions
}

import type {
  Subscription,
  SubscriptionDomainEvent,
  SubscriptionStatus,
} from "@grantledger/contracts";

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
