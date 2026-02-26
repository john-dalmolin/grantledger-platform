import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.resolve(rootDir, "db/migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = new pg.Client({ connectionString });

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied() {
  const result = await client.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((r) => r.version));
}

async function main() {
  await client.connect();
  await ensureMigrationsTable();
  const applied = await loadApplied();

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.resolve(migrationsDir, file);
    const sql = await fs.readFile(fullPath, "utf8");

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version, applied_at) VALUES ($1, now())",
        [file],
      );
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

main()
  .finally(async () => {
    await client.end();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
