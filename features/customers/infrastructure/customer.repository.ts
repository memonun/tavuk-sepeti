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
import type {
  BulkCreateCustomerRow,
  CustomerCellField,
  CustomerListQuery,
} from "@/features/customers/domain/customer.schema";
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

  // City + location filters pivot on the embedded addresses row, so we
  // need INNER join semantics — addresses!inner drops customers that
  // don't have a matching primary address row (won't happen in Faz 1 but
  // the semantics are correct). When the inner join is active we always
  // restrict to is_primary=true so a future multi-address customer can't
  // get pulled in by a secondary address row.
  const needsInnerAddressJoin = Boolean(query.city) || Boolean(query.location);
  const addressJoin = needsInnerAddressJoin ? "addresses!inner" : "addresses";

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
  // Always restrict the inner-joined embed to the primary address (when
  // the inner join is active). Hoisted out of the per-filter blocks so a
  // future filter that also pivots on addresses doesn't have to remember
  // to re-add this constraint.
  if (needsInnerAddressJoin) {
    builder = builder.eq("addresses.is_primary", true);
  }

  if (query.city) {
    builder = builder.eq("addresses.city", query.city);
  }

  if (query.location) {
    // "accurate" = pin we can route to without further admin action;
    // "approximate" = sitting on a city-center placeholder (CSV import)
    // or a low-confidence Google response.
    const accuracies: Database["public"]["Enums"]["coordinate_accuracy"][] =
      query.location === "accurate"
        ? ["rooftop", "range_interpolated"]
        : ["approximate", "geometric_center", "unknown"];
    builder = builder.in("addresses.accuracy", accuracies);
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

// ---- bulk create (DataGrid paste-into-empty-rows) ------------------------

/**
 * Insert N customer rows + their placeholder primary-address rows in one
 * go. Address fields default to "Bilinmiyor" with a (0,0) coordinate at
 * accuracy=unknown — the row immediately surfaces in the "Konum belirsiz"
 * filter so an admin knows it needs the detail page + geocoding pass to
 * become routable.
 *
 * Rolls back the customer inserts if the address insert fails (best-
 * effort cleanup matches createCustomer's existing pattern). Returns the
 * inserted rows projected to list-item shape.
 */
export async function bulkCreateCustomers(
  rows: ReadonlyArray<BulkCreateCustomerRow>,
  createdBy: string,
): Promise<Result<CustomerListItem[], ExternalApiError>> {
  if (rows.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();

  // Generate UUIDs client-side so we can pair each customer row with
  // its address payload by id (not by array position). PostgREST
  // preserves insertion order in RETURNING for single inserts today,
  // but that's a fragile invariant — any future refactor (upsert,
  // chunking, BEFORE INSERT trigger) would silently misalign the
  // address inserts with their owning customers.
  const idForRow = rows.map(() => globalThis.crypto.randomUUID());

  const customerPayload = rows.map((r, i) => ({
    id: idForRow[i]!,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    account_type: r.account_type,
    tag: r.tag,
    legacy_segment: r.legacy_segment,
    notes: null,
    created_by: createdBy,
  }));

  const { error: insertError } = await supabase
    .from("customers")
    .insert(customerPayload);

  if (insertError) {
    logger.error(
      { code: insertError.code, count: rows.length },
      "bulk_create_customers_failed",
    );
    return err(
      new ExternalApiError({
        message: insertError.message,
        cause: insertError,
      }),
    );
  }

  // Insert placeholder primary addresses keyed by the pre-generated
  // customer id. No reliance on RETURNING order.
  const addressPayload = rows.map((r, i) => {
    const city = r.city ?? "Bilinmiyor";
    return {
      customer_id: idForRow[i]!,
      raw_text: city,
      description: null,
      lat: 0,
      lng: 0,
      source: "admin_corrected" as const,
      accuracy: "unknown" as const,
      geocoded_at: null,
      geocoder_response_hash: null,
      city,
      district: "Bilinmiyor",
      neighborhood: "Bilinmiyor",
      street: null,
      building_no: null,
      apartment_no: null,
      postal_code: null,
      is_primary: true,
      address_source: "admin_input" as const,
    };
  });

  const { error: addressError } = await supabase
    .from("addresses")
    .insert(addressPayload);

  if (addressError) {
    // Best-effort cleanup of the orphan customer rows.
    logger.error(
      { code: addressError.code, count: idForRow.length },
      "bulk_create_address_failed_rolling_back_customers",
    );
    const { error: cleanupError } = await supabase
      .from("customers")
      .delete()
      .in("id", idForRow);
    if (cleanupError) {
      logger.error(
        { code: cleanupError.code, count: idForRow.length },
        "bulk_create_cleanup_failed_orphans_left",
      );
    }
    return err(
      new ExternalApiError({
        message: addressError.message,
        cause: addressError,
      }),
    );
  }

  // Re-project to list-item shape. ORDER BY created_at is stable enough
  // for the refetch — but we then re-order by the original idForRow
  // sequence so callers can rely on parsed.data[idx] ↔ result.value[idx].
  const { data: listItems, error: refetchError } = await supabase
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, status, account_type, tag, legacy_segment, created_at, addresses(city, is_primary)",
    )
    .in("id", idForRow);

  if (refetchError || !listItems) {
    return err(
      new ExternalApiError({
        message: refetchError?.message ?? "Failed to refetch inserted rows.",
        cause: refetchError,
      }),
    );
  }

  // Re-order to match the caller's input order so result[i] pairs with
  // input[i]. listItems is the result of `.in(id, idForRow)` which has
  // no guaranteed ordering.
  const byId = new Map(listItems.map((row) => [row.id, row] as const));
  return ok(
    idForRow
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) =>
        rowToListItem({
          ...row,
          status: row.status as CustomerStatus,
          addresses: row.addresses ?? [],
        }),
      ),
  );
}

// ---- bulk read (audit snapshots) -----------------------------------------

/**
 * Fetch many customers in the list-item projection. Used by the
 * bulk-delete Server Action to snapshot rows before they're removed so
 * the audit trail can answer "what was actually deleted".
 */
export async function findListItemsByIds(
  ids: ReadonlyArray<string>,
): Promise<Result<CustomerListItem[], ExternalApiError>> {
  if (ids.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, status, account_type, tag, legacy_segment, created_at, addresses(city, is_primary)",
    )
    .in("id", [...ids]);
  if (error || !data) {
    logger.error(
      { code: error?.code, count: ids.length },
      "customer_list_items_lookup_failed",
    );
    return err(
      new ExternalApiError({
        message: error?.message ?? "Customer list items not found.",
        cause: error,
      }),
    );
  }
  return ok(
    data.map((row) =>
      rowToListItem({
        ...row,
        status: row.status as CustomerStatus,
        addresses: row.addresses ?? [],
      }),
    ),
  );
}

// ---- bulk delete ----------------------------------------------------------

/**
 * Hard-delete N customers by id. Addresses cascade via FK on delete cascade
 * (set up in the schema migration). RLS still applies — only admins can
 * see and therefore delete.
 *
 * Returns the number actually removed so the caller can surface a
 * "5 müşteri silindi" toast even if some ids referenced rows that had
 * already been removed in another tab.
 */
export async function bulkDeleteCustomers(
  ids: ReadonlyArray<string>,
): Promise<Result<{ deleted: number }, ExternalApiError>> {
  if (ids.length === 0) return ok({ deleted: 0 });
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("customers")
    .delete({ count: "exact" })
    .in("id", [...ids]);
  if (error) {
    logger.error(
      { code: error.code, attempted: ids.length },
      "bulk_delete_customers_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ deleted: count ?? 0 });
}

// ---- cell patch (DataGrid inline edit) -----------------------------------

/**
 * Lightweight single-field patcher for the inline-edit grid. Routes scalar
 * customer fields to `customers`, address fields to `addresses`. Returns
 * the freshly-projected list-item shape so the grid can replace its
 * optimistic patch without paying for a full Customer aggregate fetch.
 *
 * Address writes target the row with is_primary=true. The grid never edits
 * lat/lng — those still go through the geocoding pipeline + the form.
 */
const ADDRESS_CELL_FIELDS: ReadonlySet<CustomerCellField> = new Set([
  "city",
  "district",
  "neighborhood",
]);

export async function patchCustomerCell(
  id: string,
  field: CustomerCellField,
  value: unknown,
): Promise<Result<CustomerListItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  if (ADDRESS_CELL_FIELDS.has(field)) {
    // `.update()` returns silently with count=0 when no primary address
    // row exists (legacy CSV-imported customers, or rows where the
    // address insert failed at create time). Without the count check
    // the optimistic UI would roll back without any user-visible
    // signal. Use { count: "exact" } so we can verify the write
    // actually landed.
    const patch: AddressUpdate = { [field]: value as string | null };
    const { error, count } = await supabase
      .from("addresses")
      .update(patch, { count: "exact" })
      .eq("customer_id", id)
      .eq("is_primary", true);
    if (error) {
      logger.error({ id, field, code: error.code }, "customer_cell_address_patch_failed");
      return err(new ExternalApiError({ message: error.message, cause: error }));
    }
    if (count === 0) {
      logger.warn(
        { id, field },
        "customer_cell_address_patch_no_primary_row",
      );
      return err(
        new ExternalApiError({
          message:
            "Bu müşterinin birincil adresi yok. Önce müşteri detayından adres ekleyin.",
        }),
      );
    }
  } else {
    // Scalar customer fields. The schema upstream has already coerced
    // empty strings to null for nullable text fields and validated the
    // enum / phone shapes — we just hand the typed value to PostgREST.
    const patch: CustomerUpdate = { [field]: value as never };
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) {
      logger.error({ id, field, code: error.code }, "customer_cell_patch_failed");
      return err(new ExternalApiError({ message: error.message, cause: error }));
    }
  }

  return findListItemById(id);
}

/** Fetch a single customer in the same projection as the list query. */
export async function findListItemById(
  id: string,
): Promise<Result<CustomerListItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, status, account_type, tag, legacy_segment, created_at, addresses(city, is_primary)",
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    logger.error({ id, code: error?.code }, "customer_list_item_lookup_failed");
    return err(
      new ExternalApiError({
        message: error?.message ?? "Customer not found.",
        cause: error,
      }),
    );
  }
  return ok(
    rowToListItem({
      ...data,
      status: data.status as CustomerStatus,
      addresses: data.addresses ?? [],
    }),
  );
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
