import { utcNowIso } from "./time.js";

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogInput {
  level?: ObservabilityLevel;
  type: string;
  traceId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

const sinks: Record<ObservabilityLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

export function emitStructuredLog(input: StructuredLogInput): void {
  const {
    level = "info",
    type,
    traceId,
    occurredAt = utcNowIso(),
    payload = {},
  } = input;

  const event = {
    ...payload,
    level,
    type,
    occurredAt,
    ...(traceId !== undefined ? { traceId } : {}),
  };

  sinks[level](JSON.stringify(event));
}