// Import weekly orders from an "Upcoming Orders.csv" into Supabase via
// service-role, linking each order to its EXISTING customer.
//
// Usage:
//   node --env-file=.env scripts/import-orders.mjs [path-to-csv] [--dry-run]
//
// Default path is "./Upcoming Orders.csv".
//
// How it works:
//  - Each CSV row is one product line. Rows are grouped by (customer, date)
//    into a single order with multiple line items — one delivery = one order.
//  - Customers are matched to existing rows by Turkish-aware name. Business
//    names live in first_name with last_name='—'. Ambiguous name matches are
//    disambiguated by nearest stored-address coordinate; if still ambiguous
//    they are skipped (never guessed).
//  - A customer with no match is CREATED from the CSV row (name + coordinate +
//    address), mirroring import-customers.mjs. Every creation is logged.
//  - Orders are written through the create_order_with_items RPC (same path the
//    app uses): it snapshots the customer's primary address, computes the
//    subtotal from items, and inserts order + items + initial pending event
//    atomically. Catalog prices are 0, so the CSV's per-unit price is frozen
//    onto each line item as the source of truth.
//  - Idempotency: an order is skipped if one already exists for the same
//    (customer, scheduled_for). Re-running does not double-import.

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
const csvPath = args.find((a) => !a.startsWith("--")) ?? "Upcoming Orders.csv";
const absPath = path.resolve(csvPath);
if (!fs.existsSync(absPath)) {
  process.stderr.write(`csv not found: ${absPath}\n`);
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Default city for new customers created from this CSV (Malatya operation).
const DEFAULT_CITY = "Malatya";

// CSV "Product" label -> products.key. "Karışık Boy" (mixed size) is an egg
// size attribute; all eggs are currently mixed-size so it maps to `eggs`.
const PRODUCT_MAP = {
  "Karışık Boy": "eggs",
  Süt: "milk",
};

// CSV "Order Type" -> customer_order_type enum (only used when CREATING a
// customer; existing customers keep their stored order_type).
const ORDER_TYPE_MAP = {
  Delivery: "delivery",
  Retail: "retail",
  Wholesale: "wholesale",
  Bazaar: "bazaar",
};

// Two candidates with the same name are treated as the same person only if a
// CSV coordinate lands within this many degrees (~1km) of a stored address.
const COORD_MATCH_DEG = 0.01;

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

// ---- Normalizers ---------------------------------------------------------
const normName = (s) => (s ?? "").trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

// "13.06.2026" -> "2026-06-13". Returns null if unparseable.
function parseDate(raw) {
  const m = (raw ?? "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "₺125.00" / "₺112,50" -> 12500 kuruş. Returns null if unparseable.
function parsePriceMinor(raw) {
  const cleaned = (raw ?? "")
    .replace(/[₺\s]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "") // drop thousands dots (none expected, but safe)
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// "38.3521, 38.3461" -> { lat, lng }. Rejects blank / near-Null-Island.
function parseCoords(raw) {
  if (!raw || !raw.includes(",")) return null;
  const [a, b] = raw.split(",").map((s) => s.trim());
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.001 || Math.abs(lng) < 0.001) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ---- Admin actor lookup --------------------------------------------------
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

// ---- Lookups -------------------------------------------------------------
// name -> [{ id, lat, lng }]. Keyed on both "first last" and "first" so
// business names (last_name='—') resolve too.
async function loadCustomerIndex() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, addresses(lat, lng, is_primary)");
  if (error) {
    process.stderr.write(`could not list customers: ${error.message}\n`);
    process.exit(1);
  }
  const index = new Map();
  const add = (k, entry) => {
    const key = normName(k);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  };
  for (const c of data ?? []) {
    const primary = (c.addresses ?? []).find((a) => a.is_primary) ?? (c.addresses ?? [])[0];
    const entry = { id: c.id, lat: primary?.lat ?? null, lng: primary?.lng ?? null };
    const first = (c.first_name ?? "").trim();
    const last = (c.last_name ?? "").trim();
    if (first && last && last !== "—") add(`${first} ${last}`, entry);
    if (first) add(first, entry);
  }
  return index;
}

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("key, display_name, unit, unit_label");
  if (error) {
    process.stderr.write(`could not list products: ${error.message}\n`);
    process.exit(1);
  }
  const byKey = new Map();
  for (const p of data ?? []) byKey.set(p.key, p);
  return byKey;
}

// Existing (customer_id, scheduled_for) order keys, for the idempotency guard.
async function loadExistingOrderKeys() {
  const { data, error } = await supabase.from("orders").select("customer_id, scheduled_for");
  if (error) {
    process.stderr.write(`could not list existing orders: ${error.message}\n`);
    process.exit(1);
  }
  return new Set((data ?? []).map((o) => `${o.customer_id}|${o.scheduled_for}`));
}

// ---- Matching ------------------------------------------------------------
// Returns { id } | { ambiguous: true } | null. Disambiguates same-name
// candidates by nearest stored coordinate to the CSV coordinate.
function matchCustomer(index, name, coords) {
  const candidates = index.get(normName(name));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return { id: candidates[0].id };
  if (coords) {
    const near = candidates
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ c, d: Math.abs(c.lat - coords.lat) + Math.abs(c.lng - coords.lng) }))
      .sort((a, b) => a.d - b.d);
    if (near.length > 0 && near[0].d <= COORD_MATCH_DEG) return { id: near[0].c.id };
  }
  return { ambiguous: true };
}

// ---- Create-on-miss ------------------------------------------------------
async function createCustomer({ first, last, orderType, coords, addressText, actorId }) {
  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: first,
      last_name: last,
      email: null,
      phone: null,
      notes: null,
      status: "active",
      account_type: "individual",
      order_type: orderType,
      tag: null,
      legacy_segment: null,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (customerError || !customerRow) {
    return { error: customerError?.message ?? "customer insert returned no row" };
  }

  const hasCoords = Boolean(coords);
  const { error: addressError } = await supabase.from("addresses").insert({
    customer_id: customerRow.id,
    raw_text: addressText || `${DEFAULT_CITY} — adres bilinmiyor`,
    description: null,
    lat: coords?.lat ?? 38.3552, // Malatya center fallback
    lng: coords?.lng ?? 38.3095,
    source: hasCoords ? "admin_corrected" : "geocoded_auto",
    accuracy: hasCoords ? "rooftop" : "approximate",
    geocoded_at: hasCoords ? null : new Date().toISOString(),
    geocoder_response_hash: null,
    city: DEFAULT_CITY,
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
    await supabase.from("customers").delete().eq("id", customerRow.id);
    return { error: `address: ${addressError.message}` };
  }
  return { id: customerRow.id };
}

// ---- Driver --------------------------------------------------------------
async function main() {
  const rows = parseCsv(fs.readFileSync(absPath, "utf8"));
  if (rows.length < 2) {
    process.stderr.write("csv has no data rows\n");
    process.exit(2);
  }
  const header = rows[0];
  const col = (row, name) => row[header.indexOf(name)] ?? "";
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c && c.trim() !== ""));

  process.stdout.write(`${dryRun ? "[DRY RUN] " : ""}csv: ${dataRows.length} line rows\n`);

  const actorId = await findFirstAdmin();
  const customerIndex = await loadCustomerIndex();
  const products = await loadProducts();
  const existingOrderKeys = await loadExistingOrderKeys();
  process.stdout.write(`indexed customers: ${customerIndex.size} name keys, products: ${products.size}\n\n`);

  // ---- Phase 1: parse + resolve customer + group into orders ----
  const orders = new Map(); // key: name|date -> order draft
  const rowErrors = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const name = col(row, "Customer Name").trim();
    const scheduledFor = parseDate(col(row, "Date"));
    const coords = parseCoords(col(row, "Coordinates"));
    const addressText = col(row, "Copy of Coordinates").trim();
    const productLabel = col(row, "Product").trim();
    const qty = Number(col(row, "Pcs Pack"));
    const unitPriceMinor = parsePriceMinor(col(row, "Price"));
    const orderTypeRaw = col(row, "Order Type").trim();

    const ctx = `row ${idx + 2} (${name || "?"})`;
    if (!name) { rowErrors.push(`${ctx}: missing customer name`); continue; }
    if (!scheduledFor) { rowErrors.push(`${ctx}: bad date "${col(row, "Date")}"`); continue; }
    const productKey = PRODUCT_MAP[productLabel];
    if (!productKey || !products.has(productKey)) {
      rowErrors.push(`${ctx}: unknown product "${productLabel}"`); continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) { rowErrors.push(`${ctx}: bad qty "${col(row, "Pcs Pack")}"`); continue; }
    if (unitPriceMinor === null) { rowErrors.push(`${ctx}: bad price "${col(row, "Price")}"`); continue; }

    const groupKey = `${normName(name)}|${scheduledFor}`;
    if (!orders.has(groupKey)) {
      orders.set(groupKey, {
        name,
        scheduledFor,
        coords,
        addressText,
        orderType: ORDER_TYPE_MAP[orderTypeRaw] ?? "delivery",
        items: [],
      });
    }
    const draft = orders.get(groupKey);
    if (!draft.coords && coords) draft.coords = coords;
    if (!draft.addressText && addressText) draft.addressText = addressText;
    const p = products.get(productKey);
    draft.items.push({
      product_key: productKey,
      quantity: qty,
      unit_price_minor: unitPriceMinor,
      product_snapshot: { display_name: p.display_name, unit: p.unit, unit_label: p.unit_label },
    });
  }

  // ---- Phase 2: resolve customers + write ----
  const counters = { created: 0, ok: 0, skipExisting: 0, ambiguous: 0, error: 0 };
  const created = [];
  const skipped = [];
  const errors = [...rowErrors.map((reason) => ({ reason }))];

  for (const draft of orders.values()) {
    const tag = `${draft.name} @ ${draft.scheduledFor} (${draft.items.length} item${draft.items.length > 1 ? "s" : ""})`;

    // Resolve / create customer.
    const match = matchCustomer(customerIndex, draft.name, draft.coords);
    let customerId;
    if (match?.ambiguous) {
      counters.ambiguous++;
      errors.push({ reason: `${tag}: AMBIGUOUS name match — skipped` });
      continue;
    }
    if (match?.id) {
      customerId = match.id;
    } else {
      // Create-on-miss.
      const parts = draft.name.split(/\s+/);
      const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : draft.name;
      const last = parts.length > 1 ? parts[parts.length - 1] : "—";
      if (dryRun) {
        counters.created++;
        created.push(`${draft.name} (NEW — would create + address)`);
        customerId = `dry-${draft.name}`;
      } else {
        const res = await createCustomer({
          first, last, orderType: draft.orderType, coords: draft.coords,
          addressText: draft.addressText, actorId,
        });
        if (res.error) { counters.error++; errors.push({ reason: `${tag}: create customer failed — ${res.error}` }); continue; }
        customerId = res.id;
        // Index the new id so a later same-name row in this run reuses it.
        customerIndex.set(normName(draft.name), [{ id: customerId, lat: draft.coords?.lat ?? null, lng: draft.coords?.lng ?? null }]);
        counters.created++;
        created.push(`${draft.name} → ${customerId}`);
      }
    }

    // Idempotency guard.
    const orderKey = `${customerId}|${draft.scheduledFor}`;
    if (!String(customerId).startsWith("dry-") && existingOrderKeys.has(orderKey)) {
      counters.skipExisting++;
      skipped.push(`${tag}: order already exists`);
      continue;
    }

    if (dryRun) {
      const sum = draft.items.reduce((s, it) => s + it.quantity * it.unit_price_minor, 0);
      counters.ok++;
      process.stdout.write(`would create: ${tag} — ₺${(sum / 100).toFixed(2)}\n`);
      continue;
    }

    const { error: rpcError } = await supabase.rpc("create_order_with_items", {
      p_customer_id: customerId,
      p_scheduled_for: draft.scheduledFor,
      p_time_slot: null,
      p_payment_method: "cash_on_delivery",
      p_delivery_notes: null,
      p_delivery_fee_minor: 0,
      p_created_by: actorId,
      p_items: draft.items,
    });
    if (rpcError) {
      counters.error++;
      errors.push({ reason: `${tag}: RPC failed — ${rpcError.message}` });
      continue;
    }
    existingOrderKeys.add(orderKey);
    counters.ok++;
    process.stdout.write(`created: ${tag}\n`);
  }

  // ---- Summary ----
  process.stdout.write(`\n--- ${dryRun ? "DRY RUN summary (no writes)" : "summary"} ---\n`);
  process.stdout.write(`distinct orders:     ${orders.size}\n`);
  process.stdout.write(`${dryRun ? "would create" : "created"} orders:  ${counters.ok}\n`);
  process.stdout.write(`new customers:       ${counters.created}\n`);
  process.stdout.write(`skipped (existing):  ${counters.skipExisting}\n`);
  process.stdout.write(`ambiguous (skipped): ${counters.ambiguous}\n`);
  process.stdout.write(`errored:             ${counters.error}\n`);

  if (created.length > 0) {
    process.stdout.write(`\nnew customers:\n`);
    for (const c of created) process.stdout.write(`  + ${c}\n`);
  }
  if (skipped.length > 0) {
    process.stdout.write(`\nskipped:\n`);
    for (const s of skipped) process.stdout.write(`  - ${s}\n`);
  }
  if (errors.length > 0) {
    process.stdout.write(`\nerrors:\n`);
    for (const e of errors) process.stdout.write(`  ! ${e.reason}\n`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
