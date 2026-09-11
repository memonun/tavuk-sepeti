import { ErrorCode } from "@/shared/errors/error-codes";

interface AppErrorOptions {
  message?: string;
  details?: unknown;
  correlationId?: string;
  cause?: unknown;
}

/**
 * Base class for every error that the app intentionally raises.
 *
 * Carries a typed `code` so call sites (and the API envelope) can branch on
 * the failure mode without parsing strings. `details` is for structured context
 * (Zod issues, upstream payloads) — not for free-form messages.
 *
 * Sub-classes are convenience constructors only; the runtime type to switch on
 * is the `code` field. Avoid `instanceof` for branching across module boundaries.
 *
 * Deliberately does NOT extend `Error`. A `Result<T, AppError>` returned from a
 * `"use server"` action crosses the React Flight (RSC) boundary to the client —
 * and React/Next.js sanitizes any `instanceof Error` value in that payload in
 * production builds, replacing its message with a generic "Server Components
 * render" digest message. A plain object carries `code`/`message`/`details`
 * across that boundary untouched. Nothing in this codebase throws an AppError
 * or relies on it being an Error (logging always destructures `.code`/`.message`
 * into structured fields; `AppError.is` doesn't need `instanceof Error`).
 */
export class AppError {
  name: string;
  message: string;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly correlationId?: string;
  readonly cause?: unknown;

  constructor(code: ErrorCode, opts: AppErrorOptions = {}) {
    this.name = "AppError";
    this.message = opts.message ?? code;
    this.code = code;
    if (opts.details !== undefined) this.details = opts.details;
    if (opts.correlationId !== undefined) this.correlationId = opts.correlationId;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  /** Type guard usable across realms (where `instanceof` may fail). */
  static is(value: unknown): value is AppError {
    if (typeof value !== "object" || value === null) return false;
    const code = (value as { code?: unknown }).code;
    return typeof code === "string" && code in ErrorCode;
  }
}

// ---- Convenience sub-classes ------------------------------------------------
// These exist purely to make call sites read naturally. The discriminator
// remains `error.code`.

export class ValidationError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.VALIDATION_ERROR, opts);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.NOT_FOUND, opts);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.UNAUTHORIZED, opts);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.FORBIDDEN, opts);
    this.name = "ForbiddenError";
  }
}

export class InvalidTransitionError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.INVALID_TRANSITION, opts);
    this.name = "InvalidTransitionError";
  }
}

export class ExternalApiError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.EXTERNAL_API_ERROR, opts);
    this.name = "ExternalApiError";
  }
}

export class RateLimitedError extends AppError {
  constructor(opts: AppErrorOptions = {}) {
    super(ErrorCode.RATE_LIMITED, opts);
    this.name = "RateLimitedError";
  }
}
