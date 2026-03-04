import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsoleInvoiceAuditLogger } from "./invoice.js";

describe("invoice observability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured invoice_audit logs", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createConsoleInvoiceAuditLogger();

    await logger.log({
      action: "invoice.generate",
      tenantId: "t_1",
      subscriptionId: "sub_1",
      invoiceId: "inv_1",
      traceId: "trace-1",
      occurredAt: "2026-03-04T00:00:00.000Z",
      metadata: { jobId: "job_1" },
    });

    expect(spy).toHaveBeenCalledTimes(1);

    const output = String(spy.mock.calls[0]?.[0] ?? "");
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      level: "info",
      type: "invoice_audit",
      tenantId: "t_1",
      invoiceId: "inv_1",
      traceId: "trace-1",
    });
    expect(typeof parsed.occurredAt).toBe("string");
  });
});
