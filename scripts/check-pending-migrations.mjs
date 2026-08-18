// Fail if any migration in supabase/migrations/ has not been applied to the
// target database.
//
// Usage:
//   SUPABASE_DB_URL=postgresql://... node scripts/check-pending-migrations.mjs
//
// WHY THIS EXISTS
// ---------------
// Vercel deploys on merge to main; migrations are applied separately. On
// 2026-08-19 that gap took the storefront down completely: PR #115 shipped code
// that calls place_web_order(..., p_legal_acceptance, ...) while production
// still had the old signature, so PostgREST answered PGRST202 and EVERY order
// failed with "Sipariş oluşturulamadı" — cash, transfer and card alike, on both
// delivery and cargo. Nothing in CI could see it, because the repo was
// internally consistent; only the DB disagreed.
//
// The migrations in this repo are NOT backward compatible (20260819190001 drops
// place_web_order and recreates it with a new required argument), so the schema
// has to land BEFORE the code that depends on it. This check enforces that
// ordering at PR time: apply the migration, then merge.
//
// Reads the migration history the Supabase CLI maintains
// (supabase_migrations.schema_migrations) rather than probing for objects, so it
// stays correct as the schema grows. That table is only trustworthy if nobody
// hand-applies SQL without recording the version — see the manual-apply job in
// .github/workflows/migrations.yml, which records it for you.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.resolve("supabase/migrations");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  process.stderr.write(
    "SUPABASE_DB_URL is not set.\n" +
      "In CI this comes from the repository secret of the same name; add it in\n" +
      "Settings → Secrets and variables → Actions. Use the POOLER connection\n" +
      "string (port 6543) — the direct db.*.supabase.co host is blocked by the\n" +
      "project's network restrictions.\n",
  );
  process.exit(2);
}

// Migration filenames are `<version>_<name>.sql`; the version is the leading
// digit run and is what the history table stores.
function localVersions() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ file: f, version: /^(\d+)/.exec(f)?.[1] ?? null }))
    .filter((m) => m.version !== null)
    .sort((a, b) => a.version.localeCompare(b.version));
}

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase terminates TLS at the pooler with a certificate chain the runner
  // does not carry. The URL itself is the secret here; this is the same
  // posture the supabase CLI takes for `--db-url`.
  ssl: { rejectUnauthorized: false },
  // Never let a hung connection burn the whole job's timeout.
  connectionTimeoutMillis: 30_000,
  statement_timeout: 30_000,
});

try {
  await client.connect();
} catch (error) {
  process.stderr.write(
    `Could not connect to the database: ${error.message}\n` +
      "If this is a network error, check the project's Network Restrictions —\n" +
      "GitHub Actions runners need to be allowed.\n",
  );
  process.exit(2);
}

let applied;
try {
  const result = await client.query(
    "select version from supabase_migrations.schema_migrations",
  );
  applied = new Set(result.rows.map((r) => String(r.version)));
} catch (error) {
  process.stderr.write(`Could not read the migration history: ${error.message}\n`);
  process.exit(2);
} finally {
  await client.end();
}

const local = localVersions();
const pending = local.filter((m) => !applied.has(m.version));

if (pending.length === 0) {
  process.stdout.write(
    `All ${local.length} migrations are applied to the target database.\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `${pending.length} migration(s) in this branch are NOT applied to the database:\n\n` +
    pending.map((m) => `  ${m.file}`).join("\n") +
    "\n\n" +
    "Merging now would deploy code against a schema that cannot serve it — the\n" +
    "writers in this repo are recreated with new signatures, so the old ones stop\n" +
    "existing the moment the migration lands and do not exist before it.\n\n" +
    "Apply them first, then re-run this check:\n" +
    "  GitHub → Actions → \"Migrations\" → Run workflow → apply\n",
);
process.exit(1);
