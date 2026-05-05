/**
 * Closed enum of every error code the system may emit.
 *
 * Adding a new code is intentional — it forces the dev to think about HTTP
 * mapping, log severity, and whether callers will need to handle it. Generic
 * "unknown" errors collapse to INTERNAL_ERROR.
 *
 * Each code maps to a default HTTP status. Endpoints may override per call.
 */
export const ErrorCode = {
  // Input / contract.
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // AuthN / AuthZ.
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Resource.
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",

  // Domain / state-machine.
  INVALID_TRANSITION: "INVALID_TRANSITION",
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",

  // External integrations.
  EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
  GEOCODING_FAILED: "GEOCODING_FAILED",
  GEOCODING_ZERO_RESULTS: "GEOCODING_ZERO_RESULTS",
  GEOCODING_LOW_ACCURACY: "GEOCODING_LOW_ACCURACY",
  DIRECTIONS_FAILED: "DIRECTIONS_FAILED",

  // Throughput / quota.
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",

  // Persistence.
  DATABASE_ERROR: "DATABASE_ERROR",

  // Catch-all — should be rare; prefer a specific code.
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Default HTTP status for each code. Used by `toEnvelope` when a route handler
 * doesn't specify one. Internal codes (anything not in this map) fall back to 500.
 */
export const DEFAULT_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  BUSINESS_RULE_VIOLATION: 422,
  EXTERNAL_API_ERROR: 502,
  GEOCODING_FAILED: 502,
  GEOCODING_ZERO_RESULTS: 422,
  GEOCODING_LOW_ACCURACY: 422,
  DIRECTIONS_FAILED: 502,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500,
};
