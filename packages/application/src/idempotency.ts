import type { IdempotencyRecord } from "@grantledger/contracts";
import { hashPayload } from "@grantledger/domain";
import { utcNowIso } from "@grantledger/shared";
import { AppError } from "./errors.js";

export class MissingIdempotencyKeyError extends AppError {
  constructor(message = "Idempotency-Key is required") {
    super({
      message,
      code: "MISSING_IDEMPOTENCY_KEY",
      httpStatus: 400,
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = "Idempotency key reuse with different payload") {
    super({
      message,
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
    });
  }
}

export interface ProcessWithIdempotencyInput<TPayload, TResponse> {
  key: string | null;
  payload: TPayload;
  store: Map<string, IdempotencyRecord<TResponse>>;
  execute: () => TResponse;
  now?: () => string;
}

export interface ProcessWithIdempotencyResult<TResponse> {
  response: TResponse;
  replayed: boolean;
}

export function processWithIdempotency<TPayload, TResponse>(
  input: ProcessWithIdempotencyInput<TPayload, TResponse>,
): ProcessWithIdempotencyResult<TResponse> {
  if (!input.key) {
    throw new MissingIdempotencyKeyError();
  }

  const payloadHash = hashPayload(input.payload);
  const existingRecord = input.store.get(input.key);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }

    return {
      response: existingRecord.response,
      replayed: true,
    };
  }

  const response = input.execute();
  const createdAt = (input.now ?? utcNowIso)();

  input.store.set(input.key, {
    key: input.key,
    payloadHash,
    status: "completed",
    response,
    createdAt,
  });

  return {
    response,
    replayed: false,
  };
}
