import { describe, expect, it } from "vitest";
import { createApiCompositionRoot } from "../bootstrap/composition-root.js";

const { handleUpgradeSubscriptionCommand } = createApiCompositionRoot();
import type { Headers } from "../http/types.js";

describe("subscription handler integration", () => {
  it("returns 400 for invalid payload", async () => {
    const response = await handleUpgradeSubscriptionCommand(
      {
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      } as Headers,
      {},
    );

    expect(response.status).toBe(400);
  });
});
