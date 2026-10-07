// Post-migration schema audit (+ optional PostgREST cache reload).
//
//   DATABASE_URL=... node scripts/db/audit.mjs [--reload]
//   (falls back to SUPABASE_DB_URL; add --local to connect to the local supabase stack)
//
// Checks CLAUDE.md §7: every table in `public` has row level security ON. Extension-owned
// tables (PostGIS' spatial_ref_sys) are not ours and are skipped.
//
// --reload: PostgREST caches function signatures; without a reload the API keeps serving
// the OLD ones and a successful migration looks like it never ran (PGRST202).

import path from "node:path";
import { pathToFileURL } from "node:url";

export const RLS_GAP_SQL = `
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    )
  order by c.relname`;

export async function findRlsGaps(client) {
  const r = await client.query(RLS_GAP_SQL);
  return r.rows.map((row) => row.table_name);
}

async function main() {
  const local = process.argv.includes("--local");
  const dbUrl = local
    ? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    : process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    process.stderr.write("DATABASE_URL / SUPABASE_DB_URL tanımlı değil.\n");
    process.exit(2);
  }
  const pg = (await import("pg")).default;
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });
  await client.connect();
  try {
    const gaps = await findRlsGaps(client);
    if (gaps.length > 0) {
      process.stderr.write(
        `RLS kapalı tablolar (proje kuralı: hepsinde açık olmalı):\n${gaps.map((t) => `  - ${t}`).join("\n")}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Denetim: tüm public tablolarında RLS açık.\n");
    }
    if (process.argv.includes("--reload")) {
      await client.query("notify pgrst, 'reload schema'");
      process.stdout.write("PostgREST şema önbelleği yenilendi.\n");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) await main();
