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
