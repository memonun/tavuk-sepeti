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
  CustomerAccountType,
  CustomerAddress,
  CustomerListItem,
  CustomerOrderType,
  CustomerStatus,
} from "@/features/customers/domain/customer";

const ACCOUNT_TYPES: ReadonlySet<CustomerAccountType> = new Set([
  "individual",
  "business",
  "charity",
  "bazaar_vendor",
]);

function asAccountType(value: string | null): CustomerAccountType {
  if (value && ACCOUNT_TYPES.has(value as CustomerAccountType)) {
    return value as CustomerAccountType;
  }
  return "individual";
}

const ORDER_TYPES: ReadonlySet<CustomerOrderType> = new Set([
  "delivery",
  "retail",
  "wholesale",
  "bazaar",
]);

function asOrderType(value: string | null): CustomerOrderType | null {
  if (value && ORDER_TYPES.has(value as CustomerOrderType)) {
    return value as CustomerOrderType;
  }
  return null;
}

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
    neighborhood: row.neighborhood,
    street: row.street,
    building_no: row.building_no,
    apartment_no: row.apartment_no,
    postal_code: row.postal_code,
    country: row.country,
    is_primary: row.is_primary,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export function rowToCustomer(row: CustomerWithAddressRow): Customer {
  const primary = row.addresses.find((a) => a.is_primary);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status as CustomerStatus,
    account_type: asAccountType(row.account_type),
    order_type: asOrderType(row.order_type),
    tag: row.tag,
    legacy_segment: row.legacy_segment,
    address: primary ? rowToAddress(primary) : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}

interface ListProjectionRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  account_type: string | null;
  order_type: string | null;
  tag: string | null;
  legacy_segment: string | null;
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
    account_type: asAccountType(row.account_type),
    order_type: asOrderType(row.order_type),
    tag: row.tag,
    legacy_segment: row.legacy_segment,
    city: primary?.city ?? null,
    created_at: new Date(row.created_at),
  };
}
