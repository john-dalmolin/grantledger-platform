export interface StandardErrorBody {
  message: string;
  code: string;
  details?: unknown;
  traceId?: string;
}

export interface BuildErrorBodyInput {
  message: string;
  code: string;
  details?: unknown;
  traceId?: string;
}

export function buildStandardErrorBody(
  input: BuildErrorBodyInput,
): StandardErrorBody {
  return {
    message: input.message,
    code: input.code,
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
  };
}
