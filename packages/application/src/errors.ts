export type AppErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "MISSING_IDEMPOTENCY_KEY"
  | "DOMAIN_CONFLICT"
  | "INTERNAL_ERROR";

export interface AppErrorInput {
  message: string;
  code: AppErrorCode;
  httpStatus: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(input: AppErrorInput) {
    super(input.message);
    this.name = new.target.name;
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    if (input.details !== undefined) this.details = input.details;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "User is not authenticated", details?: unknown) {
    super({
      message,
      code: "AUTHENTICATION_REQUIRED",
      httpStatus: 401,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "User has no access to this tenant",
    details?: unknown,
  ) {
    super({
      message,
      code: "FORBIDDEN",
      httpStatus: 403,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request input", details?: unknown) {
    super({
      message,
      code: "BAD_REQUEST",
      httpStatus: 400,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super({
      message,
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super({
      message,
      code: "NOT_FOUND",
      httpStatus: 404,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super({
      message,
      code: "CONFLICT",
      httpStatus: 409,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export class InternalError extends AppError {
  constructor(message = "Unexpected error", details?: unknown) {
    super({
      message,
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
