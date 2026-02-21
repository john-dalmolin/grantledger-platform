import { describe, expect, it } from "vitest";
import { handleProtectedRequest } from "./auth.js";
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
});
