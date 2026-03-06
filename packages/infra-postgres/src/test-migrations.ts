import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export async function applyPostgresTestMigrations(pool: Pool): Promise<void> {
  const migrationsDir = resolve(process.cwd(), "db/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await pool.connect();

  try {
    // Prevent concurrent test suites from racing on DDL against the same DB.
    await client.query("SELECT pg_advisory_lock($1)", [24_000_001]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));

    for (const migrationFile of migrationFiles) {
      if (appliedVersions.has(migrationFile)) {
        continue;
      }

      const sql = readFileSync(resolve(migrationsDir, migrationFile), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version, applied_at) VALUES ($1, now())",
          [migrationFile],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [24_000_001]);
    } finally {
      client.release();
    }
  }
}
