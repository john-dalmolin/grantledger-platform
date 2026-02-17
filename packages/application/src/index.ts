import type {
  AuthenticatedUser,
  IdempotencyRecord,
  RequestContext,
  PaymentProviderName,
  BillingPeriod,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  AuditActor,
  CatalogAuditEvent,
  CatalogQuery,
  CreatePlanInput,
  CreatePlanVersionInput,
  DeactivatePlanVersionInput,
  EffectiveCatalogItem,
  Plan,
  PlanVersion,
  PublishPlanVersionInput,
} from "@grantledger/contracts";
import {
  hasActiveMembershipForTenant,
  hashPayload,
  assertNoVersionOverlap,
  assertPublishedVersionImmutable,
  resolveEffectivePlanVersionAt,
  type Membership,
} from "@grantledger/domain";

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export interface PlanCatalogRepository {
  createPlan(input: CreatePlanInput): Promise<Plan>;
  getPlanById(planId: string): Promise<Plan | null>;
  listPlans(): Promise<Plan[]>;
  createPlanVersion(input: CreatePlanVersionInput): Promise<PlanVersion>;
  getPlanVersion(
    planId: string,
    versionId: string,
  ): Promise<PlanVersion | null>;
  listPlanVersions(planId: string): Promise<PlanVersion[]>;
  savePlanVersion(planVersion: PlanVersion): Promise<void>;
}

export interface CatalogAuditLogger {
  log(event: CatalogAuditEvent): Promise<void>;
}

interface AuditInput {
  actor: AuditActor;
  reason: string;
  traceId: string;
}

export async function createPlan(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: CreatePlanInput,
  meta: AuditInput,
): Promise<Plan> {
  const plan = await repo.createPlan(input);
  await audit.log({
    event: "plan.created",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: new Date().toISOString(),
    metadata: { planId: plan.id },
  });
  return plan;
}

export async function createPlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: CreatePlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const versions = await repo.listPlanVersions(input.planId);

  /* We need to check for overlapping validity windows before creating the version
   otherwise we might end up with a published version that overlaps with the new one, which would
   be a problem since published versions are immutable */
  const candidate =
    input.endsAt === undefined
      ? { startsAt: input.startsAt }
      : { startsAt: input.startsAt, endsAt: input.endsAt };

  // This will throw if there's an overlap, which is what we want since we don't want to create the version in that case
  assertNoVersionOverlap(candidate, versions);

  const version = await repo.createPlanVersion(input);
  await audit.log({
    event: "plan_version.created",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: new Date().toISOString(),
    metadata: { planId: input.planId, versionId: version.id },
  });
  return version;
}

export async function publishPlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: PublishPlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const version = await repo.getPlanVersion(input.planId, input.versionId);
  if (!version) throw new NotFoundError("Plan version not found");

  const next: PlanVersion = {
    ...version,
    status: "published",
    publishedAt: new Date().toISOString(),
  };

  await repo.savePlanVersion(next);
  await audit.log({
    event: "plan_version.published",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: new Date().toISOString(),
    metadata: { planId: input.planId, versionId: input.versionId },
  });
  return next;
}

export async function deactivatePlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: DeactivatePlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const version = await repo.getPlanVersion(input.planId, input.versionId);
  if (!version) throw new NotFoundError("Plan version not found");

  const next: PlanVersion = { ...version, status: "deactivated" };
  await repo.savePlanVersion(next);
  await audit.log({
    event: "plan_version.deactivated",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: new Date().toISOString(),
    metadata: { planId: input.planId, versionId: input.versionId },
  });
  return next;
}

export async function getEffectiveCatalog(
  repo: PlanCatalogRepository,
  query: CatalogQuery,
): Promise<EffectiveCatalogItem[]> {
  const plans = await repo.listPlans();
  const out: EffectiveCatalogItem[] = [];

  for (const plan of plans) {
    const versions = await repo.listPlanVersions(plan.id);
    const effective = resolveEffectivePlanVersionAt(versions, query.at);
    if (!effective) continue;
    out.push({ plan, version: effective });
  }

  return out;
}

export async function assertVersionNotCriticalMutated(
  current: PlanVersion,
): Promise<void> {
  assertPublishedVersionImmutable(current);
}

export class AuthenticationError extends Error {
  constructor(message = "User is not authenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "User has no access to this tenant") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  constructor(message = "Invalid request input") {
    super(message);
    this.name = "BadRequestError";
  }
}

export class MissingIdempotencyKeyError extends Error {
  constructor(message = "Idempotency-Key is required") {
    super(message);
    this.name = "MissingIdempotencyKeyError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = "Idempotency key reuse with different payload") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export interface ResolveRequestContextInput {
  user: AuthenticatedUser | null;
  tenantId: string | null;
  memberships: ReadonlyArray<Membership>;
}

export function resolveRequestContext(
  input: ResolveRequestContextInput,
): RequestContext {
  if (!input.user) {
    throw new AuthenticationError();
  }

  if (!input.tenantId) {
    throw new BadRequestError("Tenant id is required");
  }

  const membership = hasActiveMembershipForTenant(
    input.memberships,
    input.tenantId,
  );

  if (!membership) {
    throw new ForbiddenError();
  }

  return {
    user: input.user,
    tenant: {
      id: membership.tenantId,
      role: membership.role,
    },
  };
}

export interface ProcessWithIdempotencyInput<TPayload, TResponse> {
  key: string | null;
  payload: TPayload;
  store: Map<string, IdempotencyRecord<TResponse>>;
  execute: () => TResponse;
  now?: () => Date;
}

export interface ProcessWithIdempotencyResult<TResponse> {
  response: TResponse;
  replayed: boolean;
}

export function processWithIdempotency<TPayload, TResponse>(
  input: ProcessWithIdempotencyInput<TPayload, TResponse>,
): ProcessWithIdempotencyResult<TResponse> {
  if (!input.key) {
    throw new MissingIdempotencyKeyError();
  }

  const payloadHash = hashPayload(input.payload);
  const existingRecord = input.store.get(input.key);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }

    return {
      response: existingRecord.response,
      replayed: true,
    };
  }

  const response = input.execute();
  const createdAt = (input.now ?? (() => new Date()))().toISOString();

  input.store.set(input.key, {
    key: input.key,
    payloadHash,
    status: "completed",
    response,
    createdAt,
  });

  return {
    response,
    replayed: false,
  };
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionResult> | CreateCheckoutSessionResult;
}

export interface StartSubscriptionCheckoutInput {
  provider: PaymentProvider;
  tenantId: string | null;
  planId: string | null;
  billingPeriod: BillingPeriod | null;
  successUrl?: string;
  cancelUrl?: string;
  externalReference?: string;
}

export async function startSubscriptionCheckout(
  input: StartSubscriptionCheckoutInput,
): Promise<CreateCheckoutSessionResult> {
  if (!input.tenantId) {
    throw new BadRequestError("Tenant id is required");
  }

  if (!input.planId) {
    throw new BadRequestError("Plan id is required");
  }

  if (!input.billingPeriod) {
    throw new BadRequestError("Billing period is required");
  }

  const successUrl = input.successUrl ?? "https://app.local/billing/success";
  const cancelUrl = input.cancelUrl ?? "https://app.local/billing/cancel";

  const checkoutInput: CreateCheckoutSessionInput = {
    tenantId: input.tenantId,
    planId: input.planId,
    billingPeriod: input.billingPeriod,
    successUrl,
    cancelUrl,
  };

  if (input.externalReference !== undefined) {
    checkoutInput.externalReference = input.externalReference;
  }

  return input.provider.createCheckoutSession(checkoutInput);
}
