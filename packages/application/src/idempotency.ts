import type { IdempotencyRecord } from "@grantledger/contracts";
import { hashPayload } from "@grantledger/domain";

export class MissingIdempotencyKeyError extends Error {
  constructor(message = "Idempotency-Key is required") {
    super(message);
    this.name = "MissingIdempotencyKeyError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = "Idempotency key reuse with different payload") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export interface ProcessWithIdempotencyInput<TPayload, TResponse> {
  key: string | null;
  payload: TPayload;
  store: Map<string, IdempotencyRecord<TResponse>>;
  execute: () => TResponse;
  now?: () => Date;
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
  const createdAt = (input.now ?? (() => new Date()))().toISOString();

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
