import type { PlanVersion } from "@grantledger/contracts";
import { hashPayload, parseIsoToEpochMillis } from "@grantledger/shared";

export * from "./invoice.js";
export * from "./subscription.js";

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

export { hashPayload };

function toTime(value: string): number {
  return parseIsoToEpochMillis(value);
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
  return first ?? null;
}
