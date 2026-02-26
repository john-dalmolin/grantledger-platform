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
  const result = await processNextInvoiceGenerationJob(deps.invoiceUseCases);

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
