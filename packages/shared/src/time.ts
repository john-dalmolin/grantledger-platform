import { DateTime } from "luxon";

const OFFSET_SUFFIX_REGEX = /(Z|[+-]\d{2}:\d{2})$/;

function parseIsoDateTime(value: string): DateTime {
  return DateTime.fromISO(value, { setZone: true });
}

export function utcNowIso(): string {
  const iso = DateTime.utc().toISO();
  if (!iso) {
    throw new Error("Failed to generate current UTC timestamp");
  }
  return iso;
}

export function isIsoDateTimeWithOffset(value: string): boolean {
  if (!OFFSET_SUFFIX_REGEX.test(value)) return false;
  return parseIsoDateTime(value).isValid;
}

export function parseIsoToEpochMillis(value: string): number {
  if (!isIsoDateTimeWithOffset(value)) {
    throw new Error(
      "Datetime must be ISO-8601 with explicit timezone offset (Z or ±HH:MM)",
    );
  }

  return parseIsoDateTime(value).toMillis();
}

export function epochSecondsToUtcIso(seconds: number): string {
  const iso = DateTime.fromSeconds(seconds, { zone: "utc" }).toISO();
  if (!iso) {
    throw new Error("Failed to convert epoch seconds to UTC ISO timestamp");
  }
  return iso;
}

export function addSecondsToIso(value: string, seconds: number): string {
  const baseMillis = parseIsoToEpochMillis(value);
  const iso = DateTime.fromMillis(baseMillis + seconds * 1000, {
    zone: "utc",
  }).toISO();

  if (!iso) {
    throw new Error("Failed to add seconds to ISO timestamp");
  }

  return iso;
}
