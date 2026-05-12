// Backfill phone numbers for customers imported from Customers.csv.
//
// Usage:
//   node --env-file=.env scripts/backfill-phones.mjs [path-to-csv]
//
// The initial import (scripts/import-customers.mjs) skipped phones because
// the CSV has no dedicated Phone column. Several rows do carry a phone
// EMBEDDED in the free-text Adress or Notes columns — this script extracts
// them with a TR-phone regex, normalizes to E.164, and UPDATEs customers
// whose phone is still NULL.
//
// Idempotent: only touches customers with phone IS NULL, so re-running is
// safe.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  process.stderr.write("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(2);
}

const csvPath = process.argv[2] ?? "Customers.csv";
const absPath = path.resolve(csvPath);
if (!fs.existsSync(absPath)) {
  process.stderr.write(`csv not found: ${absPath}\n`);
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- CSV parser (RFC 4180-ish) -- same as import script ------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ",") { row.push(field); field = ""; i++; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; }
      else if (ch === "\r") { i++; }
      else { field += ch; i++; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---- TR phone helpers (mirror shared/utils/phone.ts) ---------------------
const E164_TR = /^\+90[1-9][0-9]{9}$/;

function normalizeTRPhone(input) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;
  let subscriber = digits;
  if (subscriber.startsWith("90")) subscriber = subscriber.slice(2);
  if (subscriber.startsWith("0")) subscriber = subscriber.slice(1);
  if (!/^[1-9]\d{9}$/.test(subscriber)) return null;
  return `+90${subscriber}`;
}

// Extract the first valid TR phone from a free-text blob. Candidates are
// substrings of digits + common separators (space/dash/dot/slash/paren)
// 11–22 chars long; each candidate is normalized + accepted only if it
// E.164-validates as a TR mobile/landline.
function extractTRPhone(text) {
  if (!text) return null;
  const candidates = text.match(/(?:\+?\d[\s\-./()\d]{9,20}\d)/g) ?? [];
  for (const candidate of candidates) {
    const normalized = normalizeTRPhone(candidate);
    if (normalized && E164_TR.test(normalized)) return normalized;
  }
  return null;
}

// ---- Driver --------------------------------------------------------------
async function main() {
  const raw = fs.readFileSync(absPath, "utf8");
  const rows = parseCsv(raw);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c && c.trim() !== ""));

  const col = (row, name) => row[header.indexOf(name)] ?? "";

  // Pre-load all phoneless customers — fingerprint by (first, last) so we
  // don't issue one SELECT per CSV row.
  const { data: candidateCustomers, error: listError } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .is("phone", null);
  if (listError) {
    process.stderr.write(`list failed: ${listError.message}\n`);
    process.exit(1);
  }

  const byFingerprint = new Map();
  for (const c of candidateCustomers ?? []) {
    const fp = `${(c.first_name ?? "").trim().toLocaleLowerCase("tr")}|${(c.last_name ?? "").trim().toLocaleLowerCase("tr")}`;
    byFingerprint.set(fp, c.id);
  }

  process.stdout.write(`phoneless customers: ${byFingerprint.size}\n`);

  const counters = { matched: 0, no_match: 0, no_phone: 0, updated: 0, conflict: 0 };
  const updates = [];

  for (const row of dataRows) {
    const fullName = col(row, "Name");
    const firstName = col(row, "First Name").trim();
    const secondName = col(row, "Second Name").trim();
    const adres = col(row, "Adress");
    const notes = col(row, "Notes");

    const first = firstName || fullName.trim();
    const last = secondName || "—";
    const fp = `${first.toLocaleLowerCase("tr")}|${last.toLocaleLowerCase("tr")}`;
    const customerId = byFingerprint.get(fp);
    if (!customerId) {
      counters.no_match++;
      continue;
    }

    const phone = extractTRPhone(`${adres}\n${notes}`);
    if (!phone) {
      counters.no_phone++;
      continue;
    }

    counters.matched++;
    updates.push({ customerId, phone, name: `${first} ${last}` });
  }

  process.stdout.write(`extracted phones: ${counters.matched}\n`);
  process.stdout.write(`no phone in row : ${counters.no_phone}\n`);
  process.stdout.write(`name not in DB  : ${counters.no_match}\n\n`);

  // Apply updates. The DB has a unique partial index on phone — collisions
  // (two CSV rows produce the same normalized phone) trip 23505. Catch +
  // record so the rest still applies.
  for (const u of updates) {
    const { error } = await supabase
      .from("customers")
      .update({ phone: u.phone })
      .eq("id", u.customerId);
    if (error) {
      if (error.code === "23505") {
        counters.conflict++;
        process.stdout.write(`  conflict: ${u.name} → ${u.phone} (already on another customer)\n`);
      } else {
        process.stderr.write(`  failed:  ${u.name} → ${u.phone} — ${error.message}\n`);
      }
    } else {
      counters.updated++;
    }
  }

  process.stdout.write(`\n--- summary ---\n`);
  process.stdout.write(`updated:   ${counters.updated}\n`);
  process.stdout.write(`conflicts: ${counters.conflict}\n`);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
