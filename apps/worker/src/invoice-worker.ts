import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  getSharedInvoiceUseCaseDeps,
  processNextInvoiceGenerationJob,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";
import {
  createPostgresInvoiceUseCaseDeps,
  createPostgresPool,
} from "@grantledger/infra-postgres";

export interface InvoiceWorkerDeps {
  invoiceUseCases: InvoiceUseCaseDeps;
}

export interface RunInvoiceWorkerOnceResult {
  status: "processed" | "idle" | "failed";
  jobId?: string;
}

export interface InvoiceWorkerRuntimeConfig {
  workerId: string;
  leaseSeconds: number;
  heartbeatSeconds: number;
}

const DEFAULT_LEASE_SECONDS = 30;
const DEFAULT_HEARTBEAT_SECONDS = 10;
const defaultWorkerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

function parsePositiveInt(
  raw: string | undefined,
  envName: string,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }

  return value;
}

export function resolveInvoiceWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceWorkerRuntimeConfig {
  const workerId = env.WORKER_ID?.trim() || defaultWorkerId;
  const leaseSeconds = parsePositiveInt(
    env.JOB_LEASE_SECONDS,
    "JOB_LEASE_SECONDS",
    DEFAULT_LEASE_SECONDS,
  );
  const heartbeatSeconds = parsePositiveInt(
    env.JOB_HEARTBEAT_SECONDS,
    "JOB_HEARTBEAT_SECONDS",
    DEFAULT_HEARTBEAT_SECONDS,
  );

  if (heartbeatSeconds >= leaseSeconds) {
    throw new Error("JOB_HEARTBEAT_SECONDS must be lower than JOB_LEASE_SECONDS");
  }

  return { workerId, leaseSeconds, heartbeatSeconds };
}

function resolveWorkerTenantId(): string {
  const value = process.env.WORKER_TENANT_ID?.trim();
  if (!value) {
    throw new Error(
      "WORKER_TENANT_ID is required when PERSISTENCE_DRIVER=postgres",
    );
  }
  return value;
}

function createDefaultWorkerDeps(): InvoiceWorkerDeps {
  if (process.env.PERSISTENCE_DRIVER !== "postgres") {
    return {
      invoiceUseCases: getSharedInvoiceUseCaseDeps(),
    };
  }

  const pool = createPostgresPool();
  const tenantId = resolveWorkerTenantId();

  return {
    invoiceUseCases: createPostgresInvoiceUseCaseDeps(pool, tenantId),
  };
}

const defaultWorkerDeps: InvoiceWorkerDeps = createDefaultWorkerDeps();

export async function runInvoiceWorkerOnce(
  deps: InvoiceWorkerDeps = defaultWorkerDeps,
): Promise<RunInvoiceWorkerOnceResult> {
  const runtimeConfig = resolveInvoiceWorkerRuntimeConfig();
  const result = await processNextInvoiceGenerationJob(deps.invoiceUseCases, {
    lease: {
      workerId: runtimeConfig.workerId,
      leaseToken: randomUUID(),
      leaseSeconds: runtimeConfig.leaseSeconds,
    },
    heartbeatSeconds: runtimeConfig.heartbeatSeconds,
  });

  if (result.status === "no_job") {
    return { status: "idle" };
  }

  if (result.status === "retry_scheduled") {
    return {
      status: "failed",
      jobId: result.jobId,
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      jobId: result.jobId,
    };
  }

  return {
    status: "processed",
    jobId: result.jobId,
  };
}
