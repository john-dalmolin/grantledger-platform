import { describe, expect, it } from "vitest";
import { resolveLocale, t } from "./index.js";

describe("i18n foundation", () => {
  it("resolves default locale", () => {
    expect(resolveLocale()).toBe("en-US");
  });

  it("resolves en variants to en-US", () => {
    expect(resolveLocale("en")).toBe("en-US");
    expect(resolveLocale("en_us")).toBe("en-US");
    expect(resolveLocale("en-US")).toBe("en-US");
  });

  it("returns translation for known keys", () => {
    expect(t("auth.authorized")).toBe("Authorized");
  });
});
