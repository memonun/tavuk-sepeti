import { AppError } from "@/shared/errors/app-error";
import { DEFAULT_HTTP_STATUS, ErrorCode } from "@/shared/errors/error-codes";

/**
 * Wire format for every API/Server Action response. See SPEC.md §8.2.
 *
 * Discriminated union: callers must check `ok` before accessing data/error.
 * The `correlationId` is always populated so users / logs / Sentry traces
 * line up around a single request.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
        correlationId: string;
      };
    };

export interface EnvelopeOptions {
  correlationId: string;
  /** Override the inferred HTTP status when calling from a Route Handler. */
  status?: number;
}

/** Wrap a successful payload. */
export function envelopeOk<T>(data: T): Extract<ApiResult<T>, { ok: true }> {
  return { ok: true, data };
}

/** Convert an error (any error) into the wire envelope. */
export function envelopeErr(
  errorInput: unknown,
  opts: EnvelopeOptions,
): { body: Extract<ApiResult<never>, { ok: false }>; status: number } {
  const appError = AppError.is(errorInput)
    ? errorInput
    : new AppError(ErrorCode.INTERNAL_ERROR, {
        message:
          errorInput instanceof Error ? errorInput.message : "Unknown error",
        cause: errorInput,
      });

  const status = opts.status ?? DEFAULT_HTTP_STATUS[appError.code] ?? 500;

  const body: Extract<ApiResult<never>, { ok: false }> = {
    ok: false,
    error: {
      code: appError.code,
      // Never leak internal details for INTERNAL_ERROR — the message is for
      // the user, the cause is for the log/Sentry breadcrumb.
      message:
        appError.code === ErrorCode.INTERNAL_ERROR
          ? "Beklenmeyen bir hata oluştu."
          : appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      correlationId: opts.correlationId,
    },
  };

  return { body, status };
}
