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

export interface AsyncIdempotencyStore<TResponse> {
  get(scope: string, key: string): Promise<IdempotencyRecord<TResponse> | null>;
  set(
    scope: string,
    key: string,
    record: IdempotencyRecord<TResponse>,
  ): Promise<void>;
}

export interface ExecuteIdempotentInput<TPayload, TResponse> {
  scope: string;
  key: string | null;
  payload?: TPayload;
  store: AsyncIdempotencyStore<TResponse>;
  execute: () => Promise<TResponse>;
  now?: () => string;
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

function requireIdempotencyKey(key: string | null): string {
  if (!key || key.trim().length === 0) {
    throw new MissingIdempotencyKeyError();
  }
  return key;
}

export async function executeIdempotent<TPayload, TResponse>(
  input: ExecuteIdempotentInput<TPayload, TResponse>,
): Promise<ProcessWithIdempotencyResult<TResponse>> {
  const key = requireIdempotencyKey(input.key);
  const payloadHash = hashPayload(input.payload ?? null);
  const existingRecord = await input.store.get(input.scope, key);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }

    return {
      response: existingRecord.response,
      replayed: true,
    };
  }

  const response = await input.execute();
  const createdAt = (input.now ?? utcNowIso)();

  await input.store.set(input.scope, key, {
    key,
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

export function processWithIdempotency<TPayload, TResponse>(
  input: ProcessWithIdempotencyInput<TPayload, TResponse>,
): ProcessWithIdempotencyResult<TResponse> {
  const key = requireIdempotencyKey(input.key);
  const payloadHash = hashPayload(input.payload);
  const existingRecord = input.store.get(key);

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

  input.store.set(key, {
    key,
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
