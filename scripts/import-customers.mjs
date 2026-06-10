// Import customers from Customers.csv into Supabase via service-role.
//
// Usage:
//   node --env-file=.env scripts/import-customers.mjs [path-to-csv]
//
// Default path is ./Customers.csv. Idempotent over a single dimension:
// duplicates are skipped by (first_name, last_name) case-insensitive match
// against existing DB rows.
//
// Imports always land with status='inactive' — the admin reviews and flips
// to 'active' once the address/phone are filled in. This prevents an
// accidental "295 active customers" jump.
//
// Coordinates: when CSV has them, they're trusted (source=admin_corrected,
// accuracy=rooftop). When missing, we fall back to the city center with
// accuracy=approximate so the row is valid + visible on the map; admin
// drags the pin to the real spot later.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  process.stderr.write("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(2);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvPath = args.find((a) => !a.startsWith("--")) ?? "Customers.csv";
const absPath = path.resolve(csvPath);
if (!fs.existsSync(absPath)) {
  process.stderr.write(`csv not found: ${absPath}\n`);
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- City-center fallback coordinates ------------------------------------
// Approximate centers used when the CSV row has no explicit lat/lng. Admin
// drags the pin in the edit form to correct.
const CITY_CENTERS = {
  Malatya: { lat: 38.3552, lng: 38.3095 },
  İstanbul: { lat: 41.0082, lng: 28.9784 },
  Kocaeli: { lat: 40.8533, lng: 29.8815 },
  İzmir: { lat: 38.4192, lng: 27.1287 },
};
const DEFAULT_CITY = "Malatya";

// ---- CSV parser (RFC 4180-ish) ------------------------------------------
// Handles quoted fields containing commas + newlines + escaped quotes.
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
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else if (ch === "\r") {
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---- Field mappers -------------------------------------------------------
const ACCOUNT_TYPE_MAP = {
  Person: "individual",
  Market: "business",
  Charity: "charity",
  Bazaar: "bazaar_vendor",
};

function parseCoords(coordsField, lat, lng) {
  const explicit = (v) => {
    const n = Number(v);
    // Treat blank/0/near-null-island as "no coordinate" — a real TR pin is
    // never within ~100m of 0°. Prevents (0,0) rows landing as rooftop.
    if (!Number.isFinite(n) || Math.abs(n) < 0.001) return null;
    return n;
  };
  let latN = explicit(lat);
  let lngN = explicit(lng);
  if ((latN === null || lngN === null) && coordsField && coordsField.includes(",")) {
    const [a, b] = coordsField.split(",").map((s) => s.trim());
    const aN = Number(a);
    const bN = Number(b);
    if (Number.isFinite(aN) && Number.isFinite(bN)) {
      latN = latN ?? aN;
      lngN = lngN ?? bN;
    }
  }
  if (latN !== null && lngN !== null) {
    if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null;
    return { lat: latN, lng: lngN };
  }
  return null;
}

function normalizeCity(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_CITY;
  // The CSV uses Turkish-cased city names; map common variants to canonical.
  const lower = trimmed.toLocaleLowerCase("tr");
  if (lower.startsWith("malatya")) return "Malatya";
  if (lower.startsWith("istanbul") || lower.startsWith("i̇stanbul") || lower.startsWith("ı̇stanbul"))
    return "İstanbul";
  if (lower.startsWith("kocaeli")) return "Kocaeli";
  if (lower.startsWith("izmir") || lower.startsWith("i̇zmir")) return "İzmir";
  return trimmed;
}

function buildNotes(rawNotes, fullName, firstName, secondName) {
  const segments = [];
  if (rawNotes?.trim()) segments.push(rawNotes.trim());
  // When the form uses First+Second but the original "Name" carries extra
  // context (titles, qualifiers), preserve the original in notes so info
  // isn't lost.
  const composed = `${firstName ?? ""} ${secondName ?? ""}`.trim();
  if (fullName?.trim() && composed.toLocaleLowerCase("tr") !== fullName.trim().toLocaleLowerCase("tr")) {
    segments.push(`Orijinal CSV ismi: ${fullName.trim()}`);
  }
  return segments.length > 0 ? segments.join("\n\n") : null;
}

// ---- Admin actor lookup --------------------------------------------------
// Every customer row needs created_by — use the first admin in app_users so
// the row passes RLS-friendly attribution.
async function findFirstAdmin() {
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    process.stderr.write(`could not find an admin user: ${error?.message ?? "no rows"}\n`);
    process.exit(1);
  }
  return data.id;
}

// ---- Existing customer fingerprint ---------------------------------------
async function fetchExistingFingerprints() {
  const { data, error } = await supabase
    .from("customers")
    .select("first_name, last_name");
  if (error) {
    process.stderr.write(`could not list existing customers: ${error.message}\n`);
    process.exit(1);
  }
  return new Set(
    (data ?? []).map(
      (r) => `${(r.first_name ?? "").trim().toLocaleLowerCase("tr")}|${(r.last_name ?? "").trim().toLocaleLowerCase("tr")}`,
    ),
  );
}

// ---- Per-row import ------------------------------------------------------
async function importRow(row, header, actorId, existing, dryRun) {
  const col = (name) => row[header.indexOf(name)] ?? "";

  const customerGroup = col("Customer Group").trim() || null;
  const fullName = col("Name");
  const firstName = col("First Name").trim();
  const secondName = col("Second Name").trim();
  const coordsField = col("Coordinates");
  const adress = col("Adress").trim();
  const enlem = col("Enlem");
  const boylam = col("Boylam");
  const customerType = col("Customer Type").trim() || null;
  const selectList = col("Select list").trim();
  const cityRaw = col("City");
  const notesRaw = col("Notes");

  if (!firstName && !fullName.trim()) {
    return { status: "skip", reason: "no name" };
  }

  // Derive identity. Prefer (First, Second). If Second is missing, push the
  // first into both fields rather than failing the NOT NULL check.
  const first = firstName || fullName.trim();
  const last = secondName || "—";

  const fingerprint = `${first.toLocaleLowerCase("tr")}|${last.toLocaleLowerCase("tr")}`;
  if (existing.has(fingerprint)) {
    return { status: "skip", reason: "duplicate" };
  }

  const city = normalizeCity(cityRaw);
  const realCoords = parseCoords(coordsField, enlem, boylam);
  const center = CITY_CENTERS[city] ?? CITY_CENTERS[DEFAULT_CITY];
  const coords = realCoords ?? center;
  const hasRealCoords = Boolean(realCoords);

  const accountType = ACCOUNT_TYPE_MAP[selectList] ?? "individual";
  const notes = buildNotes(notesRaw, fullName, firstName, secondName);

  // Dry-run: mapping + dedup were exercised above; report would-insert
  // without touching the DB.
  if (dryRun) {
    existing.add(fingerprint);
    return { status: "ok", dry: true, hasRealCoords };
  }

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: first,
      last_name: last,
      email: null,
      phone: null,
      notes,
      status: "inactive",
      account_type: accountType,
      tag: customerGroup,
      legacy_segment: customerType,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (customerError || !customerRow) {
    return { status: "error", reason: customerError?.message ?? "insert returned no row" };
  }

  const { error: addressError } = await supabase.from("addresses").insert({
    customer_id: customerRow.id,
    raw_text: adress || `${city} — adres bilinmiyor`,
    description: null,
    lat: coords.lat,
    lng: coords.lng,
    source: hasRealCoords ? "admin_corrected" : "geocoded_auto",
    accuracy: hasRealCoords ? "rooftop" : "approximate",
    geocoded_at: hasRealCoords ? null : new Date().toISOString(),
    geocoder_response_hash: null,
    city,
    district: null,
    neighborhood: null,
    street: null,
    building_no: null,
    apartment_no: null,
    postal_code: null,
    is_primary: true,
    address_source: "bulk_import",
  });

  if (addressError) {
    // Best-effort cleanup so we don't leave an orphan customer.
    await supabase.from("customers").delete().eq("id", customerRow.id);
    return { status: "error", reason: `address: ${addressError.message}` };
  }

  existing.add(fingerprint);
  return { status: "ok" };
}

// ---- Driver --------------------------------------------------------------
async function main() {
  const raw = fs.readFileSync(absPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    process.stderr.write("csv has no data rows\n");
    process.exit(2);
  }
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c && c.trim() !== ""));

  process.stdout.write(`${dryRun ? "[DRY RUN] " : ""}csv: ${dataRows.length} data rows\n`);

  const actorId = await findFirstAdmin();
  const existing = await fetchExistingFingerprints();
  process.stdout.write(`existing customers in DB: ${existing.size}\n`);

  const counters = { ok: 0, skip: 0, error: 0 };
  let realCoordCount = 0;
  const errors = [];
  const skips = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const result = await importRow(row, header, actorId, existing, dryRun);
    counters[result.status]++;
    if (result.status === "ok" && result.hasRealCoords) realCoordCount++;
    if (result.status === "error") {
      errors.push({ idx, no: row[0], name: row[2], reason: result.reason });
    } else if (result.status === "skip") {
      skips.push({ idx, no: row[0], name: row[2], reason: result.reason });
    }
  }

  process.stdout.write(`\n--- ${dryRun ? "DRY RUN summary (no writes)" : "summary"} ---\n`);
  process.stdout.write(`${dryRun ? "would import" : "imported"}: ${counters.ok} (real coords: ${realCoordCount}, approx city-center: ${counters.ok - realCoordCount})\n`);
  process.stdout.write(`skipped:  ${counters.skip}\n`);
  process.stdout.write(`errored:  ${counters.error}\n`);

  if (skips.length > 0) {
    process.stdout.write(`\nskip details (first 20):\n`);
    for (const s of skips.slice(0, 20)) {
      process.stdout.write(`  #${s.no} ${s.name} — ${s.reason}\n`);
    }
  }
  if (errors.length > 0) {
    process.stdout.write(`\nerror details:\n`);
    for (const e of errors) {
      process.stdout.write(`  #${e.no} ${e.name} — ${e.reason}\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
