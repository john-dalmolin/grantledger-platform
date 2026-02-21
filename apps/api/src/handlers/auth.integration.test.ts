import { describe, expect, it } from "vitest";
import { handleCreateSubscription, handleProtectedRequest } from "./auth.js";
import type { Headers } from "../http/types.js";

function asHeaders(value: Record<string, string>): Headers {
  return value as unknown as Headers;
}

describe("auth handler integration", () => {
  it("returns 401 when x-user-id is missing", () => {
    const response = handleProtectedRequest(asHeaders({}));
    expect(response.status).toBe(401);
  });

  it("returns 400 when x-tenant-id is missing", () => {
    const response = handleProtectedRequest(
      asHeaders({
        "x-user-id": "user-1",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 403 when membership is missing for tenant", () => {
    const response = handleProtectedRequest(
      asHeaders({
        "x-user-id": "user-1",
        "x-tenant-id": "tenant-without-membership",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("replays create subscription with same idempotency key and payload", async () => {
    const headers = asHeaders({
      "x-user-id": "u_1",
      "x-tenant-id": "t_1",
      "idempotency-key": "idem-auth-1",
    });

    const payload = { planId: "plan_basic" } as Parameters<
      typeof handleCreateSubscription
    >[1];

    const first = await handleCreateSubscription(headers, payload);
    const second = await handleCreateSubscription(headers, payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
  });

  it("returns 409 for same idempotency key with different payload", async () => {
    const headers = asHeaders({
      "x-user-id": "u_1",
      "x-tenant-id": "t_1",
      "idempotency-key": "idem-auth-2",
    });

    const firstPayload = { planId: "plan_a" } as Parameters<
      typeof handleCreateSubscription
    >[1];

    const secondPayload = { planId: "plan_b" } as Parameters<
      typeof handleCreateSubscription
    >[1];

    const first = await handleCreateSubscription(headers, firstPayload);
    const second = await handleCreateSubscription(headers, secondPayload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });
});
