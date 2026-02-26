import { Pool } from "pg";

export interface PostgresConfig {
  connectionString: string;
  max?: number;
}

export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for postgres infrastructure");
  }
  return value;
}

export function createPostgresPool(config?: Partial<PostgresConfig>): Pool {
  const connectionString = config?.connectionString ?? requireDatabaseUrl();
  const max = config?.max ?? 10;
  return new Pool({ connectionString, max });
}
