import type {
  AuthenticatedUser,
  IdempotencyRecord,
  RequestContext,
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
  PaymentProviderName,
  CanonicalPaymentEvent,
  PaymentWebhookEnvelope,
  PaymentWebhookProcessResult,
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

import type {
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
  applyCancelAtPeriodEnd,
  applyCancelNow,
  applyDowngrade,
  applyUpgrade,
  createSubscriptionAggregate,
} from "@grantledger/domain";

export class SubscriptionNotFoundError extends Error {}
export class SubscriptionValidationError extends Error {}
export class SubscriptionIdempotencyConflictError extends Error {}
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

export interface PaymentWebhookDeps {
  provider: PaymentWebhookProvider;
  dedupStore: WebhookDedupStore;
  auditStore: WebhookAuditStore;
  eventPublisher: CanonicalPaymentEventPublisher;
}

// GL-008 - Application contracts and webhook use case

export class InvalidWebhookSignatureError extends Error {}
export class DuplicateWebhookEventError extends Error {}

export interface PaymentWebhookProvider {
  readonly provider: PaymentProviderName;
  verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    traceId: string;
  }): Promise<CanonicalPaymentEvent>;
}

export interface WebhookDedupStore {
  has(provider: PaymentProviderName, eventId: string): Promise<boolean>;
  markProcessed(provider: PaymentProviderName, eventId: string): Promise<void>;
}

export interface WebhookAuditStore {
  saveRaw(input: {
    provider: PaymentProviderName;
    traceId: string;
    rawBody: string;
    headers: Record<string, string | undefined>;
    receivedAt: string;
    eventId?: string;
    status: "processed" | "duplicate" | "rejected";
    reason?: string;
  }): Promise<void>;
}

export interface CanonicalPaymentEventPublisher {
  publish(event: CanonicalPaymentEvent): Promise<void>;
}

export interface PaymentWebhookDeps {
  provider: PaymentWebhookProvider; //
  dedupStore: WebhookDedupStore;
  auditStore: WebhookAuditStore;
  eventPublisher: CanonicalPaymentEventPublisher;
}

export async function processProviderWebhook(
  deps: PaymentWebhookDeps,
  input: PaymentWebhookEnvelope,
): Promise<PaymentWebhookProcessResult> {
  try {
    const event = await deps.provider.verifyAndNormalizeWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      traceId: input.traceId,
    });

    const alreadyProcessed = await deps.dedupStore.has(
      event.provider,
      event.eventId,
    );
    if (alreadyProcessed) {
      await deps.auditStore.saveRaw({
        provider: event.provider,
        traceId: input.traceId,
        rawBody: input.rawBody,
        headers: input.headers,
        receivedAt: input.receivedAt,
        eventId: event.eventId,
        status: "duplicate",
        reason: "Duplicate webhook event",
      });

      return {
        status: "duplicate",
        provider: event.provider,
        eventId: event.eventId,
        reason: "Duplicate webhook event",
      };
    }

    await deps.dedupStore.markProcessed(event.provider, event.eventId);
    await deps.eventPublisher.publish(event);

    await deps.auditStore.saveRaw({
      provider: event.provider,
      traceId: input.traceId,
      rawBody: input.rawBody,
      headers: input.headers,
      receivedAt: input.receivedAt,
      eventId: event.eventId,
      status: "processed",
    });

    return {
      status: "processed",
      provider: event.provider,
      eventId: event.eventId,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected error";

    await deps.auditStore.saveRaw({
      provider: input.provider,
      traceId: input.traceId,
      rawBody: input.rawBody,
      headers: input.headers,
      receivedAt: input.receivedAt,
      status: "rejected",
      reason,
    });

    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }

    throw error;
  }
}
