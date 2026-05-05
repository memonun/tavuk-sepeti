/**
 * DB row ↔ domain entity mapping for customers + addresses.
 *
 * Domain types are Postgres-free; this file is the only place that knows
 * about the supabase-js Row shape. Any drift between the DB schema and
 * domain types throws here, not deep in the application layer.
 */
import type { Database } from "@/shared/supabase/types";
import type { Coordinate } from "@/shared/geo/coordinate";

import type {
  Customer,
  CustomerAddress,
  CustomerListItem,
  CustomerStatus,
} from "@/features/customers/domain/customer";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type AddressRow = Database["public"]["Tables"]["addresses"]["Row"];

interface CustomerWithAddressRow extends CustomerRow {
  addresses: AddressRow[];
}

export function rowToAddress(row: AddressRow): CustomerAddress {
  const coordinate: Coordinate = {
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    accuracy: row.accuracy,
    geocoded_at: row.geocoded_at ? new Date(row.geocoded_at) : null,
    geocoder_response_hash: row.geocoder_response_hash,
  };
  return {
    id: row.id,
    customer_id: row.customer_id,
    raw_text: row.raw_text,
    description: row.description,
    coordinate,
    city: row.city,
    district: row.district,
    postal_code: row.postal_code,
    country: row.country,
    is_primary: row.is_primary,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export function rowToCustomer(row: CustomerWithAddressRow): Customer {
  const primary = row.addresses.find((a) => a.is_primary);
  if (!primary) {
    // Faz 1 invariant: every customer has exactly one primary address. If
    // this trips, a write path forgot to insert the address row.
    throw new Error(`customer ${row.id} has no primary address`);
  }
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status as CustomerStatus,
    address: rowToAddress(primary),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}

interface ListProjectionRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  status: CustomerStatus;
  created_at: string;
  addresses: Pick<AddressRow, "city" | "is_primary">[];
}

export function rowToListItem(row: ListProjectionRow): CustomerListItem {
  const primary = row.addresses.find((a) => a.is_primary);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    city: primary?.city ?? null,
    created_at: new Date(row.created_at),
  };
}
