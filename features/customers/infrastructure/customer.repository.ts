/**
 * Persistence layer for customers + their primary address.
 *
 * Sequential inserts (customer first, address second) with orphan cleanup
 * if the address insert fails. Faz 1 admin concurrency is low; an RPC
 * wrapping both in a single transaction is overkill here. Revisit when
 * concurrent edits become real.
 *
 * Reads use the SSR Supabase client so RLS still enforces admin-only access.
 * Writes use the same client — server actions run as the logged-in admin.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import {
  rowToCustomer,
  rowToListItem,
} from "@/features/customers/infrastructure/customer.mapper";

import type {
  Customer,
  CustomerListItem,
  CustomerStatus,
} from "@/features/customers/domain/customer";
import type { Coordinate } from "@/shared/geo/coordinate";
import type { CustomerListQuery } from "@/features/customers/domain/customer.schema";
import type { Database } from "@/shared/supabase/types";

type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];
type AddressUpdate = Database["public"]["Tables"]["addresses"]["Update"];

export interface CreateCustomerInput {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: CustomerStatus;
  created_by: string;
  address: {
    raw_text: string;
    description: string | null;
    coordinate: Coordinate;
    city?: string | null;
    district?: string | null;
    neighborhood?: string | null;
    street?: string | null;
    building_no?: string | null;
    apartment_no?: string | null;
    postal_code?: string | null;
  };
}

export interface UpdateCustomerInput {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string;
  notes?: string | null;
  status?: CustomerStatus;
  address?: {
    raw_text?: string;
    description?: string | null;
    coordinate?: Coordinate;
    city?: string | null;
    district?: string | null;
    neighborhood?: string | null;
    street?: string | null;
    building_no?: string | null;
    apartment_no?: string | null;
    postal_code?: string | null;
  };
}

export interface ListCustomersResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- create ---------------------------------------------------------------

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<Result<Customer, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      status: input.status,
      created_by: input.created_by,
    })
    .select("*")
    .single();

  if (customerError || !customerRow) {
    logger.error(
      { code: customerError?.code, message: customerError?.message },
      "customer_insert_failed",
    );
    return err(
      new ExternalApiError({
        message: customerError?.message ?? "Customer insert failed.",
        cause: customerError,
      }),
    );
  }

  const { error: addressError } = await supabase.from("addresses").insert({
    customer_id: customerRow.id,
    raw_text: input.address.raw_text,
    description: input.address.description,
    lat: input.address.coordinate.lat,
    lng: input.address.coordinate.lng,
    source: input.address.coordinate.source,
    accuracy: input.address.coordinate.accuracy,
    geocoded_at: input.address.coordinate.geocoded_at?.toISOString() ?? null,
    geocoder_response_hash: input.address.coordinate.geocoder_response_hash,
    city: input.address.city ?? null,
    district: input.address.district ?? null,
    neighborhood: input.address.neighborhood ?? null,
    street: input.address.street ?? null,
    building_no: input.address.building_no ?? null,
    apartment_no: input.address.apartment_no ?? null,
    postal_code: input.address.postal_code ?? null,
    is_primary: true,
    address_source: "admin_input",
  });

  if (addressError) {
    logger.error(
      { customerId: customerRow.id, code: addressError.code },
      "address_insert_failed_rolling_back_customer",
    );
    // Best-effort cleanup of the orphan customer row.
    const { error: cleanupError } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerRow.id);
    if (cleanupError) {
      logger.error(
        { customerId: customerRow.id, code: cleanupError.code },
        "customer_cleanup_failed_orphan_left",
      );
    }
    return err(
      new ExternalApiError({
        message: addressError.message,
        cause: addressError,
      }),
    );
  }

  // Re-fetch through the mapper so the return value matches the read shape.
  return findCustomerById(customerRow.id);
}

// ---- read ----------------------------------------------------------------

export async function findCustomerById(
  id: string,
): Promise<Result<Customer, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*, addresses(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    logger.error({ id, code: error?.code }, "customer_lookup_failed");
    return err(
      new ExternalApiError({
        message: error?.message ?? "Customer not found.",
        cause: error,
      }),
    );
  }

  return ok(rowToCustomer(data));
}

// ---- list ----------------------------------------------------------------

export async function listCustomers(
  query: CustomerListQuery,
): Promise<Result<ListCustomersResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  // City filter pivots on the embedded addresses row, so we need an INNER
  // join semantics — addresses!inner ensures customers with no matching
  // address row drop out (won't happen in Faz 1 but the semantics are
  // correct).
  const addressJoin = query.city ? "addresses!inner" : "addresses";

  let builder = supabase
    .from("customers")
    .select(
      `id, first_name, last_name, phone, email, status, account_type, tag, legacy_segment, created_at, ${addressJoin}(city, is_primary)`,
      { count: "exact" },
    )
    .order(query.sort, { ascending: query.order === "asc" })
    .range(from, to);

  if (query.status) builder = builder.eq("status", query.status);
  if (query.tag) builder = builder.eq("tag", query.tag);
  if (query.account_type) builder = builder.eq("account_type", query.account_type);
  if (query.legacy_segment)
    builder = builder.eq("legacy_segment", query.legacy_segment);
  if (query.city) {
    // Filter on the inner-joined addresses table; restrict to the primary
    // address so a (future) multi-address customer doesn't get pulled in
    // by a secondary address row.
    builder = builder
      .eq("addresses.city", query.city)
      .eq("addresses.is_primary", true);
  }

  if (query.q) {
    const escaped = query.q.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    // Match across name + phone. PostgREST `or` filter uses comma between
    // alternatives.
    builder = builder.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await builder;

  if (error) {
    logger.error({ code: error.code, message: error.message }, "customer_list_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok({
    items: (data ?? []).map((row) =>
      rowToListItem({
        ...row,
        status: row.status as CustomerStatus,
        addresses: row.addresses ?? [],
      }),
    ),
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
}

// ---- update --------------------------------------------------------------

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<Result<Customer, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  // Update customer scalar fields if any were supplied.
  const customerPatch: CustomerUpdate = {};
  if (input.first_name !== undefined) customerPatch.first_name = input.first_name;
  if (input.last_name !== undefined) customerPatch.last_name = input.last_name;
  if (input.email !== undefined) customerPatch.email = input.email;
  if (input.phone !== undefined) customerPatch.phone = input.phone;
  if (input.notes !== undefined) customerPatch.notes = input.notes;
  if (input.status !== undefined) customerPatch.status = input.status;

  if (Object.keys(customerPatch).length > 0) {
    const { error } = await supabase
      .from("customers")
      .update(customerPatch)
      .eq("id", id);
    if (error) {
      logger.error({ id, code: error.code }, "customer_update_failed");
      return err(new ExternalApiError({ message: error.message, cause: error }));
    }
  }

  // Update primary address if any address fields supplied.
  if (input.address) {
    const addressPatch: AddressUpdate = {};
    if (input.address.raw_text !== undefined)
      addressPatch.raw_text = input.address.raw_text;
    if (input.address.description !== undefined)
      addressPatch.description = input.address.description;
    if (input.address.coordinate) {
      addressPatch.lat = input.address.coordinate.lat;
      addressPatch.lng = input.address.coordinate.lng;
      addressPatch.source = input.address.coordinate.source;
      addressPatch.accuracy = input.address.coordinate.accuracy;
      addressPatch.geocoded_at =
        input.address.coordinate.geocoded_at?.toISOString() ?? null;
      addressPatch.geocoder_response_hash =
        input.address.coordinate.geocoder_response_hash;
    }
    if (input.address.city !== undefined) addressPatch.city = input.address.city;
    if (input.address.district !== undefined)
      addressPatch.district = input.address.district;
    if (input.address.neighborhood !== undefined)
      addressPatch.neighborhood = input.address.neighborhood;
    if (input.address.street !== undefined)
      addressPatch.street = input.address.street;
    if (input.address.building_no !== undefined)
      addressPatch.building_no = input.address.building_no;
    if (input.address.apartment_no !== undefined)
      addressPatch.apartment_no = input.address.apartment_no;
    if (input.address.postal_code !== undefined)
      addressPatch.postal_code = input.address.postal_code;

    if (Object.keys(addressPatch).length > 0) {
      const { error } = await supabase
        .from("addresses")
        .update(addressPatch)
        .eq("customer_id", id)
        .eq("is_primary", true);
      if (error) {
        logger.error({ id, code: error.code }, "address_update_failed");
        return err(new ExternalApiError({ message: error.message, cause: error }));
      }
    }
  }

  return findCustomerById(id);
}
