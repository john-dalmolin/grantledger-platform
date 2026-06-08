import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Clock, IdGenerator } from "@grantledger/shared";

import { createApiCompositionRoot } from "../bootstrap/composition-root.js";
import type { Headers } from "../http/types.js";

const { handleStartCheckout } = createApiCompositionRoot();

function asHeaders(value: Record<string, string>): Headers {
  return value as unknown as Headers;
}

describe("checkout handler integration", () => {
  it("returns 403 when membership is missing", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "user-1",
        "x-tenant-id": "tenant-1",
      }),
      {} as unknown as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 when payload is invalid for authorized membership", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      }),
      {} as unknown as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
      messageKey: "error.bad_request",
      details: { type: "validation" },
    });

    const issues = (
      response.body as { details?: { issues?: Array<{ path: string }> } }
    ).details?.issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "planId" }),
        expect.objectContaining({ path: "billingPeriod" }),
      ]),
    );
  });

  it("returns 201 when payload is valid for authorized membership", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      }),
      {
        planId: "plan_basic",
        billingPeriod: "monthly",
      } as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(201);
  });

  it("uses the IdGenerator and Clock injected through the composition root", async () => {
    const idGenerator: IdGenerator = {
      next: () => "abcdef12-3456-7890-abcd-ef1234567890",
    };
    const clock: Clock = {
      now: () => new Date("2026-06-07T12:34:56.000Z"),
      nowIso: () => "2026-06-07T12:34:56.000Z",
    };
    const root = createApiCompositionRoot({ idGenerator, clock });

    const response = await root.handleStartCheckout(
      asHeaders({
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      }),
      {
        planId: "plan_basic",
        billingPeriod: "monthly",
      } as Parameters<typeof root.handleStartCheckout>[1],
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      data: {
        provider: "fake",
        sessionId: "fake_chk_abcdef123456",
        checkoutUrl: "https://pay.local/checkout/fake_chk_abcdef123456",
        createdAt: "2026-06-07T12:34:56.000Z",
      },
    });
  });

  it("does not define an implicit or insecure checkout provider fallback", async () => {
    const source = await readFile(new URL("./checkout.ts", import.meta.url), "utf8");

    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("DefaultFakePaymentProvider");
    expect(source).not.toContain("defaultStartCheckoutHandler");
    expect(source).not.toMatch(/export const handleStartCheckout/);
  });
});
