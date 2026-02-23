function stableStringifyInternal(value: unknown): string {
  if (typeof value === "undefined") {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyInternal(item)).join(",")}]`;
  }

  const objectEntries = Object.entries(value as Record<string, unknown>).sort(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
  );

  const serializedObject = objectEntries
    .map(
      ([entryKey, entryValue]) =>
        `${JSON.stringify(entryKey)}:${stableStringifyInternal(entryValue)}`,
    )
    .join(",");

  return `{${serializedObject}}`;
}

export type FingerprintFn<TPayload> = (payload: TPayload | undefined) => string;

export function stableStringify(value: unknown): string {
  return stableStringifyInternal(value);
}

export function hashPayload(payload: unknown): string {
  return stableStringify(payload);
}
