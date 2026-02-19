import type { Headers } from "./types.js";

export function getHeader(headers: Headers, key: string): string | null {
  const value = headers[key.toLowerCase()] ?? headers[key];
  return value ?? null;
}
