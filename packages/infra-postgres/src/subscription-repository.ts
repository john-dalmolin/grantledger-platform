import type { SubscriptionRepository } from "@grantledger/application";
import type { Subscription } from "@grantledger/contracts";
import type { Pool } from "pg";
import { withTenantSession } from "./tenant-session.js";

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  plan_id: string;
  status: Subscription["status"];
  cancel_at_period_end: boolean;
  canceled_at: Date | string | null;
  current_period_starts_at: Date | string;
  current_period_ends_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function mapRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    planId: row.plan_id,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    ...(row.canceled_at !== null ? { canceledAt: toIso(row.canceled_at) } : {}),
    currentPeriod: {
      startsAt: toIso(row.current_period_starts_at),
      endsAt: toIso(row.current_period_ends_at),
    },
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function createPostgresSubscriptionRepository(
  pool: Pool,
  tenantId: string,
): SubscriptionRepository {
  return {
    async findById(subscriptionId: string): Promise<Subscription | null> {
      return withTenantSession(pool, tenantId, async (client) => {
        const result = await client.query<SubscriptionRow>(
          `SELECT id, tenant_id, customer_id, plan_id, status, cancel_at_period_end, canceled_at,
                  current_period_starts_at, current_period_ends_at, created_at, updated_at
             FROM subscriptions
            WHERE id = $1
            LIMIT 1`,
          [subscriptionId],
        );

        const row = firstRow(result.rows);
        if (!row) return null;
        return mapRow(row);
      });
    },

    async create(subscription: Subscription): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO subscriptions
            (id, tenant_id, customer_id, plan_id, status, cancel_at_period_end, canceled_at,
             current_period_starts_at, current_period_ends_at, created_at, updated_at)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz)`,
          [
            subscription.id,
            subscription.tenantId,
            subscription.customerId,
            subscription.planId,
            subscription.status,
            subscription.cancelAtPeriodEnd,
            subscription.canceledAt ?? null,
            subscription.currentPeriod.startsAt,
            subscription.currentPeriod.endsAt,
            subscription.createdAt,
            subscription.updatedAt,
          ],
        );
      });
    },

    async save(subscription: Subscription): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `UPDATE subscriptions
              SET customer_id = $2,
                  plan_id = $3,
                  status = $4,
                  cancel_at_period_end = $5,
                  canceled_at = $6::timestamptz,
                  current_period_starts_at = $7::timestamptz,
                  current_period_ends_at = $8::timestamptz,
                  updated_at = $9::timestamptz
            WHERE id = $1`,
          [
            subscription.id,
            subscription.customerId,
            subscription.planId,
            subscription.status,
            subscription.cancelAtPeriodEnd,
            subscription.canceledAt ?? null,
            subscription.currentPeriod.startsAt,
            subscription.currentPeriod.endsAt,
            subscription.updatedAt,
          ],
        );
      });
    },
  };
}
