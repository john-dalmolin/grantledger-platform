import { enUSMessages, type EnUSMessageKey } from "./messages.en-US.js";

export type SupportedLocale = "en-US";

export type MessageKey = EnUSMessageKey;

const catalogs: Record<SupportedLocale, Record<string, string>> = {
  "en-US": enUSMessages,
};

export function resolveLocale(input?: string): SupportedLocale {
  if (!input) return "en-US";
  const normalized = input.trim().toLowerCase();
  if (normalized === "en-us" || normalized === "en_us" || normalized === "en")
    return "en-US";
  return "en-US";
}

export function t(
  key: MessageKey,
  options?: { locale?: string; fallback?: string },
): string {
  const locale = resolveLocale(options?.locale);
  const catalog = catalogs[locale];
  return catalog[key] ?? options?.fallback ?? key;
}
