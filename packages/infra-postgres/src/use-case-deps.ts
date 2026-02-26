import {
  createConsoleInvoiceAuditLogger,
  type InvoiceUseCaseDeps,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  type SubscriptionUseCaseDeps,
} from "@grantledger/application";
import type { SubscriptionAuditEvent, SubscriptionDomainEvent } from "@grantledger/contracts";
import type { Pool } from "pg";
import { createPostgresAsyncIdempotencyStore } from "./idempotency-store.js";
import { createPostgresInvoiceJobStore } from "./invoice-job-store.js";
import { createPostgresInvoiceRepository } from "./invoice-repository.js";
import { createPostgresSubscriptionRepository } from "./subscription-repository.js";

class ConsoleSubscriptionEventPublisher implements SubscriptionEventPublisher {
  async publish(event: SubscriptionDomainEvent): Promise<void> {
    console.log(JSON.stringify({ type: "subscription_event", ...event }));
  }
}

class ConsoleSubscriptionAuditLogger implements SubscriptionAuditLogger {
  async log(event: SubscriptionAuditEvent): Promise<void> {
    console.log(JSON.stringify({ type: "subscription_audit", ...event }));
  }
}

export function createPostgresSubscriptionUseCaseDeps(
  pool: Pool,
  tenantId: string,
): SubscriptionUseCaseDeps {
  return {
    repository: createPostgresSubscriptionRepository(pool, tenantId),
    idempotencyStore: createPostgresAsyncIdempotencyStore(pool, tenantId),
    eventPublisher: new ConsoleSubscriptionEventPublisher(),
    auditLogger: new ConsoleSubscriptionAuditLogger(),
  };
}

export function createPostgresInvoiceUseCaseDeps(
  pool: Pool,
  tenantId: string,
): InvoiceUseCaseDeps {
  return {
    invoiceRepository: createPostgresInvoiceRepository(pool, tenantId),
    invoiceAuditLogger: createConsoleInvoiceAuditLogger(),
    invoiceJobStore: createPostgresInvoiceJobStore(pool, tenantId),
    enqueueIdempotencyStore: createPostgresAsyncIdempotencyStore(pool, tenantId),
    processIdempotencyStore: createPostgresAsyncIdempotencyStore(pool, tenantId),
  };
}
