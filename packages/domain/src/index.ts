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
