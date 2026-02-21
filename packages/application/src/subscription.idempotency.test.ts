import { describe, expect, it } from "vitest";
import type {
  Subscription,
  SubscriptionAuditEvent,
  SubscriptionDomainEvent,
} from "@grantledger/contracts";
import {
  createSubscription,
  SubscriptionConflictError,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  type SubscriptionIdempotencyStore,
  type SubscriptionIdempotencyStoreRecord,
  type SubscriptionRepository,
  type SubscriptionUseCaseDeps,
} from "./subscription.js";

class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly store = new Map<string, Subscription>();

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return this.store.get(subscriptionId) ?? null;
  }

  async create(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }

  async save(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }
}

class InMemorySubscriptionIdempotencyStore implements SubscriptionIdempotencyStore {
  private readonly store = new Map<string, SubscriptionIdempotencyStoreRecord>();

  async get(
    command: string,
    idempotencyKey: string,
  ): Promise<SubscriptionIdempotencyStoreRecord | null> {
    return this.store.get(`${command}:${idempotencyKey}`) ?? null;
  }

  async set(
    command: string,
    idempotencyKey: string,
    record: SubscriptionIdempotencyStoreRecord,
  ): Promise<void> {
    this.store.set(`${command}:${idempotencyKey}`, record);
  }
}

class NoopEventPublisher implements SubscriptionEventPublisher {
  async publish(_event: SubscriptionDomainEvent): Promise<void> {
    void _event;
  }
}

class NoopAuditLogger implements SubscriptionAuditLogger {
  async log(_event: SubscriptionAuditEvent): Promise<void> {
    void _event;
  }
}

function makeDeps(): SubscriptionUseCaseDeps {
  return {
    repository: new InMemorySubscriptionRepository(),
    idempotencyStore: new InMemorySubscriptionIdempotencyStore(),
    eventPublisher: new NoopEventPublisher(),
    auditLogger: new NoopAuditLogger(),
  };
}

describe("subscription idempotency", () => {
  it("replays create with same key and same payload", async () => {
    const deps = makeDeps();

    const input = {
      subscriptionId: "sub_1",
      tenantId: "t_1",
      customerId: "c_1",
      planId: "plan_1",
      currentPeriod: {
        startsAt: "2026-02-21T10:00:00Z",
        endsAt: "2026-03-21T10:00:00Z",
      },
      context: {
        actor: { id: "u_1", type: "user" as const },
        reason: "test",
        traceId: "trace-1",
        requestedAt: "2026-02-21T10:00:00Z",
        idempotencyKey: "idem-1",
      },
    };

    const first = await createSubscription(deps, input);
    const second = await createSubscription(deps, input);

    expect(first.id).toBe(second.id);
  });

  it("conflicts when same subscription already exists with different idempotency key", async () => {
    const deps = makeDeps();

    const base = {
      subscriptionId: "sub_1",
      tenantId: "t_1",
      customerId: "c_1",
      planId: "plan_1",
      currentPeriod: {
        startsAt: "2026-02-21T10:00:00Z",
        endsAt: "2026-03-21T10:00:00Z",
      },
      context: {
        actor: { id: "u_1", type: "user" as const },
        reason: "test",
        traceId: "trace-1",
        requestedAt: "2026-02-21T10:00:00Z",
        idempotencyKey: "idem-1",
      },
    };

    await createSubscription(deps, base);

    await expect(
      createSubscription(deps, {
        ...base,
        context: { ...base.context, idempotencyKey: "idem-2" },
      }),
    ).rejects.toBeInstanceOf(SubscriptionConflictError);
  });
});
