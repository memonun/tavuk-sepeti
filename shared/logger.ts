/**
 * Structured logging via pino.
 *
 * - Production: JSON to stdout — Vercel log drain ingests as-is.
 * - Development: pino-pretty for human-readable output.
 *
 * Every log line includes `service`, `env`, and (when present) `correlationId`
 * so a single request can be reconstructed across server actions, RPC calls,
 * and downstream services. See SPEC.md §9.
 *
 * PII redaction is enforced at the logger level — even if a caller forgets,
 * the logger strips `authorization`, `password`, `email`, `phone`, and address
 * fields before emitting.
 *
 * `console.log` is banned by the no-console ESLint rule (CLAUDE.md §6). Always
 * import this logger.
 */
import pino, { type Logger } from "pino";

import { env } from "@/shared/env";

const isDev = env.NODE_ENV !== "production";

const redactPaths = [
  // Auth tokens.
  'req.headers.authorization',
  'req.headers.cookie',
  '*.authorization',

  // Credentials.
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.serviceRoleKey',
  '*.apiKey',

  // PII — match SPEC.md §6: PII (email, telefon, adres) log'a yazılmaz veya redact edilir.
  '*.email',
  '*.phone',
  '*.address',
  '*.first_name',
  '*.last_name',
  '*.full_name',
];

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  base: {
    service: "crm",
    env: env.VERCEL_ENV ?? env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
          },
        },
      }
    : {}),
});

/**
 * Child logger bound to a correlation id. Pass through the call chain so all
 * log lines for one request are grouped under the same id.
 */
export function withCorrelation(correlationId: string): Logger {
  return logger.child({ correlationId });
}

/** Generate a fresh correlation id when no upstream id is provided. */
export function newCorrelationId(): string {
  // Native Web Crypto — works on both Node and Edge runtimes.
  return globalThis.crypto.randomUUID();
}
