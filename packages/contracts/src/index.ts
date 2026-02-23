export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
}

export interface TenantContext {
  id: string;
  role: "owner" | "admin" | "member";
}

export interface RequestContext {
  user: AuthenticatedUser;
  tenant: TenantContext;
}

export type IdempotencyStatus = "processing" | "completed" | "failed";

export interface IdempotencyRecord<TResponse = unknown> {
  key: string;
  payloadHash: string;
  status: IdempotencyStatus;
  createdAt: string;
  updatedAt: string;
  response?: TResponse;
  errorMessage?: string;
}

export type PaymentProviderName =
  | "fake"
  | "stripe"
  | "paypal"
  | "adyen"
  | "braintree"; // Extend this union as you add support for more providers
export type BillingPeriod = "monthly" | "yearly";

export interface CreateCheckoutSessionInput {
  tenantId: string;
  planId: string;
  billingPeriod: BillingPeriod;
  successUrl: string;
  cancelUrl: string;
  externalReference?: string;
}

export interface CreateCheckoutSessionResult {
  provider: PaymentProviderName;
  sessionId: string;
  checkoutUrl: string;
  createdAt: string;
}

export type CurrencyCode = "BRL" | "USD" | "EUR";
export type BillingInterval = "month" | "year";

export type PlanStatus = "active" | "inactive";
export type PlanVersionStatus = "draft" | "published" | "deactivated";

export interface Plan {
  id: string;
  code: string;
  name: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Price {
  amountInCents: number;
  currency: CurrencyCode;
  billingInterval: BillingInterval;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  status: PlanVersionStatus;
  price: Price;
  startsAt: string;
  endsAt?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface CreatePlanInput {
  code: string;
  name: string;
}

export interface CreatePlanVersionInput {
  planId: string;
  price: Price;
  startsAt: string;
  endsAt?: string;
}

export interface PublishPlanVersionInput {
  planId: string;
  versionId: string;
}

export interface DeactivatePlanVersionInput {
  planId: string;
  versionId: string;
}

export interface CatalogQuery {
  tenantId: string;
  at: string;
}

export interface EffectiveCatalogItem {
  plan: Plan;
  version: PlanVersion;
}

export interface AuditActor {
  id: string;
  type: "user" | "service";
}

export interface CatalogAuditEvent {
  event:
    | "plan.created"
    | "plan_version.created"
    | "plan_version.published"
    | "plan_version.deactivated";
  actor: AuditActor;
  reason: string;
  traceId: string;
  occurredAt: string;
  metadata: Record<string, string>;
}

// GL-006 - Subscriptions state machine contracts

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export interface SubscriptionPeriod {
  startsAt: string;
  endsAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriod: SubscriptionPeriod;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionCommandContext {
  actor: AuditActor;
  reason: string;
  traceId: string;
  requestedAt: string;
  idempotencyKey: string;
}

export interface CreateSubscriptionCommandInput {
  subscriptionId: string;
  tenantId: string;
  customerId: string;
  planId: string;
  currentPeriod: SubscriptionPeriod;
  trialEndsAt?: string;
  context: SubscriptionCommandContext;
}

export interface UpgradeSubscriptionCommandInput {
  subscriptionId: string;
  nextPlanId: string;
  effectiveAt: string;
  context: SubscriptionCommandContext;
}

export interface DowngradeSubscriptionCommandInput {
  subscriptionId: string;
  nextPlanId: string;
  effectiveAt: string;
  context: SubscriptionCommandContext;
}

export interface CancelSubscriptionNowCommandInput {
  subscriptionId: string;
  canceledAt: string;
  context: SubscriptionCommandContext;
}

export interface CancelSubscriptionAtPeriodEndCommandInput {
  subscriptionId: string;
  context: SubscriptionCommandContext;
}

export type SubscriptionDomainEventName =
  | "subscription.created"
  | "subscription.upgraded"
  | "subscription.downgraded"
  | "subscription.canceled_now"
  | "subscription.cancel_at_period_end";

export interface SubscriptionDomainEvent {
  name: SubscriptionDomainEventName;
  subscriptionId: string;
  tenantId: string;
  occurredAt: string;
  payload: Record<string, string>;
}

export interface SubscriptionAuditEvent {
  action:
    | "subscription.create"
    | "subscription.upgrade"
    | "subscription.downgrade"
    | "subscription.cancel_now"
    | "subscription.cancel_at_period_end";
  actor: AuditActor;
  reason: string;
  traceId: string;
  occurredAt: string;
  subscriptionId: string;
  tenantId: string;
  metadata: Record<string, string>;
}

// GL-007 - Deterministic invoice engine contracts

export type InvoiceStatus = "draft" | "issued" | "void";
export type InvoiceLineType =
  | "plan"
  | "proration"
  | "discount"
  | "tax"
  | "adjustment";

export interface InvoiceLine {
  id: string;
  type: InvoiceLineType;
  description: string;
  quantity: number;
  unitAmountInCents: number;
  amountInCents: number;
  currency: CurrencyCode;
  metadata?: Record<string, string>;
}

export interface InvoiceSnapshot {
  subscriptionId: string;
  tenantId: string;
  customerId: string;
  planId: string;
  planVersionId: string;
  priceAmountInCents: number;
  currency: CurrencyCode;
  periodStart: string;
  periodEnd: string;
  calculationVersion: string;
}

export interface InvoiceCalculationBreakdown {
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  totalInCents: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  subscriptionId: string;
  status: InvoiceStatus;
  snapshot: InvoiceSnapshot;
  lines: InvoiceLine[];
  breakdown: InvoiceCalculationBreakdown;
  issuedAt?: string;
  createdAt: string;
}

export interface GenerateInvoiceForCycleInput {
  tenantId: string;
  subscriptionId: string;
  customerId: string;
  planId: string;
  planVersionId: string;
  priceAmountInCents: number;
  currency: CurrencyCode;
  periodStart: string;
  periodEnd: string;
  proratedDays?: number;
  totalDaysInPeriod?: number;
  discountInCents?: number;
  taxRateBps?: number; // basis points, e.g. 1000 = 10%
  calculationVersion: string;
  traceId: string;
}

// GL-009 - Async invoice generation API boundary contracts

export type InvoiceGenerationJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type EnqueueInvoiceGenerationPayload = GenerateInvoiceForCycleInput;

export interface EnqueueInvoiceGenerationResponse {
  jobId: string;
  status: InvoiceGenerationJobStatus;
}

export interface GetInvoiceGenerationJobStatusPayload {
  jobId: string;
}

export interface GetInvoiceGenerationJobStatusResponse {
  jobId: string;
  status: InvoiceGenerationJobStatus;
  invoiceId?: string;
  reason?: string;
}

export interface InvoiceAuditEvent {
  action: "invoice.generate" | "invoice.reissue" | "invoice.adjust";
  tenantId: string;
  subscriptionId: string;
  invoiceId: string;
  traceId: string;
  occurredAt: string;
  metadata: Record<string, string>;
}

// GL-008 - Canonical payments contracts

export type CanonicalPaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "subscription.updated"
  | "subscription.canceled";

export interface CanonicalPaymentEvent {
  provider: PaymentProviderName;
  eventId: string;
  type: CanonicalPaymentEventType;
  domainEventVersion: "v1";
  occurredAt: string;
  tenantId?: string;
  subscriptionId?: string;
  traceId: string;
  payload: Record<string, string>;
}

export interface PaymentWebhookEnvelope {
  provider: PaymentProviderName;
  rawBody: string;
  headers: Record<string, string | undefined>;
  receivedAt: string;
  traceId: string;
}

export interface PaymentWebhookProcessResult {
  status: "processed" | "duplicate" | "rejected";
  provider: PaymentProviderName;
  eventId?: string;
  reason?: string;
}

export * from "./schemas/index.js";
