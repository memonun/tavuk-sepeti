/**
 * Boot-time environment validation.
 *
 * Imported at the top of `app/layout.tsx` so a missing/invalid env crashes the
 * server immediately rather than at the first request that needs it.
 *
 * Splits server-only vars from `NEXT_PUBLIC_*` vars and proxies access so a
 * server-only secret can never be read from a browser bundle, even if a future
 * refactor accidentally imports this from a Client Component.
 *
 * Each `NEXT_PUBLIC_*` key is referenced as `process.env.NEXT_PUBLIC_X`
 * literally — Next's compiler only inlines literal references.
 */
import { z } from "zod";

import { CANONICAL_ORIGIN, isCanonicalOrigin } from "@/shared/canonical-origin";

const isServer = typeof window === "undefined";

// ---- Schemas ----------------------------------------------------------------

// Postgres connection URLs must use the postgres:// or postgresql:// scheme.
const postgresUrl = z
  .string()
  .min(1)
  .refine((s) => /^postgres(ql)?:\/\//.test(s), {
    message: "Must be a postgres:// or postgresql:// URL",
  });

const serverSchema = z.object({
  // Supabase (server-only secret).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Postgres connection URLs.
  // - SUPABASE_DB_URL: transaction pooler (port 6543) — used by app runtime
  //   on Vercel where every request is a fresh serverless invocation. No
  //   LISTEN/NOTIFY, no prepared statements; fine for our query patterns.
  // - SUPABASE_DIRECT_URL: direct connection (port 5432) — used by the
  //   Supabase CLI for migrations and any DDL/admin task that needs
  //   session-level features.
  // Most of our reads/writes go through the Supabase JS client → PostgREST,
  // which is HTTP and bypasses both URLs. These only matter for raw SQL
  // (postgres.js) and the migration toolchain.
  SUPABASE_DB_URL: postgresUrl,
  SUPABASE_DIRECT_URL: postgresUrl,

  // Google Maps server-side key (Geocoding + Directions).
  // Optional in Sprint 1 (no geocoding yet); the geocoding feature throws at
  // the call site when this is missing, so the env still fails loud where
  // it matters.
  GOOGLE_MAPS_SERVER_KEY: z.string().min(1).optional(),

  // Warehouse origin for daily route planning. Optional in Sprint 1; the
  // routing feature (Sprint 5) throws at the call site when missing.
  WAREHOUSE_LAT: z.coerce.number().gte(-90).lte(90).optional(),
  WAREHOUSE_LNG: z.coerce.number().gte(-180).lte(180).optional(),

  // Quota guard — see SPEC.md §6.3.
  GEOCODING_DAILY_LIMIT: z.coerce.number().int().positive().default(2000),

  // Transactional email (Resend) — storefront order confirmations. Optional:
  // when unset, the confirmation email is skipped (logged) and the order still
  // succeeds. EMAIL_FROM must be a Resend-verified sender once the key is set.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  // Owner/admin notification recipient — new order, new recurring request.
  // Optional: when unset, admin e-mail notifications are skipped (same
  // best-effort contract as RESEND_API_KEY above); the in-panel bell still
  // works regardless, since it doesn't depend on this.
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),

  // PayTR card payments (server-only merchant secrets). Optional: when any is
  // unset the card option is hidden and checkout falls back to COD / transfer.
  // PAYTR_TEST_MODE "1" = test (no real charge), "0" = live.
  PAYTR_MERCHANT_ID: z.string().min(1).optional(),
  PAYTR_MERCHANT_KEY: z.string().min(1).optional(),
  PAYTR_MERCHANT_SALT: z.string().min(1).optional(),
  PAYTR_TEST_MODE: z.enum(["0", "1"]).default("1"),

  // Observability.
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // App-wide defaults.
  DEFAULT_TIMEZONE: z.string().default("Europe/Istanbul"),
  DEFAULT_CURRENCY: z.literal("TRY").default("TRY"),

  // Vercel injects this; helpful for log enrichment.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional in Sprint 1 — see GOOGLE_MAPS_SERVER_KEY.
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: z.string().min(1).optional(),
  // Cloud-based Map Style ID. Set this once the GTA style is created in
  // Cloud Console + assigned to a Map ID. When unset, each <Map> falls
  // back to a per-feature placeholder ID and ships with Google's default
  // light theme. See docs/maps/README.md.
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// ---- Raw values, listed literally so Next can inline NEXT_PUBLIC_* ----------

const rawClient = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

const rawServer = isServer
  ? {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
      SUPABASE_DIRECT_URL: process.env.SUPABASE_DIRECT_URL,
      GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY,
      WAREHOUSE_LAT: process.env.WAREHOUSE_LAT,
      WAREHOUSE_LNG: process.env.WAREHOUSE_LNG,
      GEOCODING_DAILY_LIMIT: process.env.GEOCODING_DAILY_LIMIT,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL,
      PAYTR_MERCHANT_ID: process.env.PAYTR_MERCHANT_ID,
      PAYTR_MERCHANT_KEY: process.env.PAYTR_MERCHANT_KEY,
      PAYTR_MERCHANT_SALT: process.env.PAYTR_MERCHANT_SALT,
      PAYTR_TEST_MODE: process.env.PAYTR_TEST_MODE,
      SENTRY_DSN: process.env.SENTRY_DSN,
      LOG_LEVEL: process.env.LOG_LEVEL,
      DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
      DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    }
  : {};

// ---- Validation -------------------------------------------------------------

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

// Coerce empty strings (common in `.env` placeholders) to undefined so
// `.optional()` fields don't trip on a blank value.
const blankToUndefined = (input: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(input).map(([k, v]) =>
      typeof v === "string" && v.trim() === "" ? [k, undefined] : [k, v],
    ),
  );

const clientResult = clientSchema.safeParse(blankToUndefined(rawClient));
if (!clientResult.success) {
  throw new Error(
    `❌ Invalid public environment variables (NEXT_PUBLIC_*):\n${formatIssues(
      clientResult.error.issues,
    )}`,
  );
}

let serverParsed: z.infer<typeof serverSchema> | undefined;
if (isServer) {
  const serverResult = serverSchema.safeParse(blankToUndefined(rawServer));
  if (!serverResult.success) {
    throw new Error(
      `❌ Invalid server environment variables:\n${formatIssues(
        serverResult.error.issues,
      )}`,
    );
  }
  serverParsed = serverResult.data;
}

// Production sanity check: PayTR's live merchant credentials are domain-
// locked to exactly https://apuhanciftligi.com (no www, no http) — see
// shared/canonical-origin.ts. Booting in production with PayTR enabled and
// a wrong NEXT_PUBLIC_APP_URL would silently send customers into a broken
// checkout instead of failing loudly, so it's enforced here alongside every
// other required env invariant.
if (isServer && serverParsed) {
  const isProduction =
    (serverParsed.VERCEL_ENV ?? serverParsed.NODE_ENV) === "production";
  // Mirrors features/payments/application/paytr.ts's paytrCreds() presence
  // check, duplicated rather than imported: shared/ must not depend on
  // features/ (see eslint.config.mjs boundaries config).
  const paytrEnabled = Boolean(
    serverParsed.PAYTR_MERCHANT_ID &&
      serverParsed.PAYTR_MERCHANT_KEY &&
      serverParsed.PAYTR_MERCHANT_SALT,
  );
  if (
    isProduction &&
    paytrEnabled &&
    !isCanonicalOrigin(clientResult.data.NEXT_PUBLIC_APP_URL)
  ) {
    throw new Error(
      `❌ NEXT_PUBLIC_APP_URL must be "${CANONICAL_ORIGIN}" in production while PayTR is enabled ` +
        `— PayTR's live merchant credentials are domain-locked to that exact origin. ` +
        `Got "${clientResult.data.NEXT_PUBLIC_APP_URL}".`,
    );
  }
}

// ---- Public API -------------------------------------------------------------

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;
type Env = ServerEnv & ClientEnv;

const merged = { ...clientResult.data, ...(serverParsed ?? {}) } as Env;

/**
 * The validated environment. Reading a server-only key from the browser throws
 * loudly — this catches accidental Client Component imports before they ship.
 */
export const env: Env = new Proxy(merged, {
  get(target, prop, receiver) {
    if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
    if (!isServer && !prop.startsWith("NEXT_PUBLIC_")) {
      throw new Error(
        `Server-only env "${prop}" accessed from the browser. ` +
          `Move the access to a Server Component / Server Action / Route Handler.`,
      );
    }
    return Reflect.get(target, prop, receiver);
  },
});

export type { Env, ServerEnv, ClientEnv };
