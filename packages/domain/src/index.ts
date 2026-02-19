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
  GenerateInvoiceForCycleInput,
  Invoice,
  InvoiceCalculationBreakdown,
  InvoiceLine,
  InvoiceSnapshot,
} from "@grantledger/contracts";

function roundCents(value: number): number {
  return Math.round(value);
}

function clampAtLeastZero(value: number): number {
  return value < 0 ? 0 : value;
}

function ratioFromProration(
  proratedDays?: number,
  totalDaysInPeriod?: number,
): number {
  if (proratedDays === undefined || totalDaysInPeriod === undefined) return 1;
  if (totalDaysInPeriod <= 0) return 1;
  if (proratedDays <= 0) return 0;
  return Math.min(proratedDays / totalDaysInPeriod, 1);
}

export function calculateInvoiceLines(
  input: GenerateInvoiceForCycleInput,
): InvoiceLine[] {
  const ratio = ratioFromProration(input.proratedDays, input.totalDaysInPeriod);
  const baseAmount = roundCents(input.priceAmountInCents * ratio);
  const discount = clampAtLeastZero(input.discountInCents ?? 0);
  const taxableBase = clampAtLeastZero(baseAmount - discount);
  const taxRate = input.taxRateBps ?? 0;
  const taxAmount = roundCents((taxableBase * taxRate) / 10_000);

  const lines: InvoiceLine[] = [
    {
      id: "line_plan",
      type: ratio < 1 ? "proration" : "plan",
      description: ratio < 1 ? "Prorated plan charge" : "Plan charge",
      quantity: 1,
      unitAmountInCents: baseAmount,
      amountInCents: baseAmount,
      currency: input.currency,
      metadata: {
        ratio: ratio.toFixed(6),
      },
    },
  ];

  if (discount > 0) {
    lines.push({
      id: "line_discount",
      type: "discount",
      description: "Discount",
      quantity: 1,
      unitAmountInCents: -discount,
      amountInCents: -discount,
      currency: input.currency,
    });
  }

  if (taxAmount > 0) {
    lines.push({
      id: "line_tax",
      type: "tax",
      description: "Tax",
      quantity: 1,
      unitAmountInCents: taxAmount,
      amountInCents: taxAmount,
      currency: input.currency,
      metadata: {
        taxRateBps: String(taxRate),
      },
    });
  }

  return lines;
}

export function calculateInvoiceBreakdown(
  lines: InvoiceLine[],
): InvoiceCalculationBreakdown {
  const subtotalInCents = lines
    .filter((l) => l.type === "plan" || l.type === "proration")
    .reduce((acc, l) => acc + l.amountInCents, 0);

  const discountInCents = Math.abs(
    lines
      .filter((l) => l.type === "discount")
      .reduce((acc, l) => acc + l.amountInCents, 0),
  );

  const taxInCents = lines
    .filter((l) => l.type === "tax")
    .reduce((acc, l) => acc + l.amountInCents, 0);

  const totalInCents = lines.reduce((acc, l) => acc + l.amountInCents, 0);

  return {
    subtotalInCents,
    discountInCents,
    taxInCents,
    totalInCents,
  };
}

export function buildInvoiceSnapshot(
  input: GenerateInvoiceForCycleInput,
): InvoiceSnapshot {
  return {
    subscriptionId: input.subscriptionId,
    tenantId: input.tenantId,
    customerId: input.customerId,
    planId: input.planId,
    planVersionId: input.planVersionId,
    priceAmountInCents: input.priceAmountInCents,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    calculationVersion: input.calculationVersion,
  };
}

export function assertInvoiceTotalDerivedFromLines(invoice: Invoice): void {
  const derived = invoice.lines.reduce(
    (acc, line) => acc + line.amountInCents,
    0,
  );
  if (derived !== invoice.breakdown.totalInCents) {
    throw new Error("Invoice total must always be derived from invoice lines");
  }
}

export function buildDeterministicCycleKey(
  input: GenerateInvoiceForCycleInput,
): string {
  return [
    input.tenantId,
    input.subscriptionId,
    input.periodStart,
    input.periodEnd,
    input.calculationVersion,
  ].join("|");
}

export * from "./subscription.js";
