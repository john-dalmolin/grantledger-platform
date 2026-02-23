import { describe, expect, it } from "vitest";
import { hashPayload, stableStringify } from "./index.js";

describe("shared idempotency helpers", () => {
  it("serializes objects deterministically", () => {
    const first = stableStringify({ b: 2, a: 1 });
    const second = stableStringify({ a: 1, b: 2 });

    expect(first).toBe(second);
  });

  it("keeps array ordering and nested values", () => {
    const value = {
      items: [{ id: "2" }, { id: "1" }],
      nested: { z: true, y: null },
    };

    expect(hashPayload(value)).toBe(
      '{"items":[{"id":"2"},{"id":"1"}],"nested":{"y":null,"z":true}}',
    );
  });
});
