import type { InvoiceRepository } from "@grantledger/application";
import type { Invoice } from "@grantledger/contracts";
import type { Pool } from "pg";
import { withTenantSession } from "./tenant-session.js";

type InvoiceRow = {
  payload: Invoice;
};

function firstRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function createPostgresInvoiceRepository(
  pool: Pool,
  tenantId: string,
): InvoiceRepository {
  return {
    async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
      return withTenantSession(pool, tenantId, async (client) => {
        const result = await client.query<InvoiceRow>(
          `SELECT payload
             FROM invoices
            WHERE cycle_key = $1
            LIMIT 1`,
          [cycleKey],
        );

        const row = firstRow(result.rows);
        return row ? row.payload : null;
      });
    },

    async save(invoice: Invoice, cycleKey: string): Promise<void> {
      await withTenantSession(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO invoices
            (id, tenant_id, subscription_id, cycle_key, status, payload, issued_at, created_at)
           VALUES
            ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)
           ON CONFLICT (tenant_id, cycle_key)
           DO UPDATE SET
             payload = EXCLUDED.payload,
             status = EXCLUDED.status,
             issued_at = EXCLUDED.issued_at`,
          [
            invoice.id,
            invoice.tenantId,
            invoice.subscriptionId,
            cycleKey,
            invoice.status,
            JSON.stringify(invoice),
            invoice.issuedAt,
            invoice.createdAt,
          ],
        );
      });
    },
  };
}
