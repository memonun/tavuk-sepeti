// Dry-run the pending migrations against the REAL production schema, then roll everything back.
//
//   SUPABASE_DB_URL=... node scripts/db/preflight.mjs
//
// Why: replaying on an empty database proves the chain is valid, but production has real
// objects (and a history of hand-applied SQL). Running the pending files in one transaction
// against the actual schema catches "relation already exists", missing columns, constraint
// violations on existing rows — and ROLLBACK means nothing is kept.
//
// lock_timeout keeps this from queueing behind (and then blocking) live traffic: if a table it
// needs is busy it gives up in 5 s with a clear message instead of stalling the shop.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { computeStatus, fetchAppliedVersions } from "./status.mjs";

const DIR = "supabase/migrations";

/** @returns {Promise<{ ok: true, ran: string[] } | { ok: false, file: string, message: string, position: string | null }>} */
export async function runPreflight(client, files, readSql = (f) => fs.readFileSync(path.join(DIR, f), "utf8")) {
  const ran = [];
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '60s'");
    for (const file of files) {
      try {
        await client.query(readSql(file));
        ran.push(file);
      } catch (error) {
        return { ok: false, file, message: error.message, position: error.position ?? null };
      }
    }
    return { ok: true, ran };
  } finally {
    // Always. A dry run that commits is not a dry run.
    await client.query("rollback");
  }
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    process.stderr.write("SUPABASE_DB_URL tanımlı değil.\n");
    process.exit(2);
  }
  const pg = (await import("pg")).default;
  const applied = await fetchAppliedVersions(pg, dbUrl);
  const { pending } = computeStatus({
    localFiles: fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")),
    appliedVersions: applied,
  });
  if (pending.length === 0) {
    process.stdout.write("Uygulanacak migration yok; ön-deneme atlandı.\n");
    return;
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });
  await client.connect();
  let result;
  try {
    result = await runPreflight(client, pending);
  } finally {
    await client.end();
  }

  if (!result.ok) {
    process.stderr.write(
      `ÖN-DENEME BAŞARISIZ: ${result.file}\n  Postgres: ${result.message}\n` +
        (result.position ? `  Konum: karakter ${result.position}\n` : "") +
        "Hiçbir değişiklik kalıcı değil (geri alındı). Bu migration'ı düzeltmeden yayın devam etmez.\n",
    );
    process.exit(1);
  }
  process.stdout.write(`Ön-deneme geçti (${result.ran.length} migration, geri alındı):\n${result.ran.map((f) => `  ✓ ${f}`).join("\n")}\n`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) await main();
