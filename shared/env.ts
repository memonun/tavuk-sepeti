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
  GOOGLE_MAPS_SERVER_KEY: z.string().min(1),

  // Warehouse origin for daily route planning.
  WAREHOUSE_LAT: z.coerce.number().gte(-90).lte(90),
  WAREHOUSE_LNG: z.coerce.number().gte(-180).lte(180),

  // Quota guard — see SPEC.md §6.3.
  GEOCODING_DAILY_LIMIT: z.coerce.number().int().positive().default(2000),

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
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// ---- Raw values, listed literally so Next can inline NEXT_PUBLIC_* ----------

const rawClient = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
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

const clientResult = clientSchema.safeParse(rawClient);
if (!clientResult.success) {
  throw new Error(
    `❌ Invalid public environment variables (NEXT_PUBLIC_*):\n${formatIssues(
      clientResult.error.issues,
    )}`,
  );
}

let serverParsed: z.infer<typeof serverSchema> | undefined;
if (isServer) {
  const serverResult = serverSchema.safeParse(rawServer);
  if (!serverResult.success) {
    throw new Error(
      `❌ Invalid server environment variables:\n${formatIssues(
        serverResult.error.issues,
      )}`,
    );
  }
  serverParsed = serverResult.data;
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
