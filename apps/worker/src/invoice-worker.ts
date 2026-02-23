import {
  getSharedInvoiceUseCaseDeps,
  processNextInvoiceGenerationJob,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";

export interface InvoiceWorkerDeps {
  invoiceUseCases: InvoiceUseCaseDeps;
}

export interface RunInvoiceWorkerOnceResult {
  status: "processed" | "idle" | "failed";
  jobId?: string;
}

const defaultWorkerDeps: InvoiceWorkerDeps = {
  invoiceUseCases: getSharedInvoiceUseCaseDeps(),
};

export async function runInvoiceWorkerOnce(
  deps: InvoiceWorkerDeps = defaultWorkerDeps,
): Promise<RunInvoiceWorkerOnceResult> {
  const result = await processNextInvoiceGenerationJob(deps.invoiceUseCases);

  if (result.status === "no_job") {
    return { status: "idle" };
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
