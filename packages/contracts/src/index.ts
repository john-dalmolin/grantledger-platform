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

export type IdempotencyStatus = "completed";

export interface IdempotencyRecord<TResponse = unknown> {
  key: string;
  payloadHash: string;
  status: IdempotencyStatus;
  response: TResponse;
  createdAt: string;
}

export type PaymentProviderName = "fake";
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
