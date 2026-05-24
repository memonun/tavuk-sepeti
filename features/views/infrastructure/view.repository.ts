/**
 * Persistence layer for customer_views.
 *
 * RLS owner-scoped — every read/write runs as the logged-in admin via
 * the SSR client. The Server Action layer is still responsible for
 * assertAdmin() before the call lands here.
 */
import "server-only";

import {
  ExternalApiError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import { rowToView } from "@/features/views/infrastructure/view.mapper";

import type { View, ViewConfig } from "@/features/views/domain/view";
import type { Database, Json } from "@/shared/supabase/types";

type ViewUpdate = Database["public"]["Tables"]["customer_views"]["Update"];

// Postgres unique_violation SQLSTATE. Surfaces when two racing
// setDefault calls both pass the clearDefaultFor pre-check and try
// to insert/update with is_default=true.
const PG_UNIQUE_VIOLATION = "23505";

export async function listViewsForTable(
  tableId: string,
): Promise<Result<View[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_views")
    .select("*")
    .eq("table_id", tableId)
    .order("name", { ascending: true });
  if (error) {
    logger.error({ tableId, code: error.code }, "list_views_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok((data ?? []).map(rowToView));
}

export async function findViewById(
  id: string,
): Promise<Result<View, NotFoundError | ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_views")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logger.error({ id, code: error.code }, "find_view_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) {
    // RLS-denied or genuinely missing — both surface as no-row.
    // warn (not error) since probing is expected user behavior.
    logger.warn({ id }, "find_view_not_found");
    return err(new NotFoundError({ message: "Görünüm bulunamadı." }));
  }
  return ok(rowToView(data));
}

export interface CreateViewParams {
  readonly tableId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly config: ViewConfig;
  readonly isDefault: boolean;
}

export async function createView(
  params: CreateViewParams,
): Promise<Result<View, ExternalApiError | ValidationError>> {
  const supabase = await createSupabaseServerClient();

  return runWithDefaultRetry(async () => {
    if (params.isDefault) {
      const cleared = await clearDefaultFor(supabase, params.tableId, params.ownerId);
      if (!cleared.ok) return err(cleared.error);
    }

    const { data, error } = await supabase
      .from("customer_views")
      .insert({
        table_id: params.tableId,
        owner_id: params.ownerId,
        name: params.name,
        // ViewConfig's readonly nested shape isn't structurally the same as
        // the generated Json type (which uses an index signature). Runtime
        // shape is JSON-serializable so the cast at the boundary is sound.
        config: params.config as unknown as Json,
        is_default: params.isDefault,
      })
      .select("*")
      .single();
    if (error || !data) {
      logger.error(
        { tableId: params.tableId, code: error?.code },
        "create_view_failed",
      );
      return err(
        new ExternalApiError({
          message: error?.message ?? "View insert failed.",
          cause: error,
        }),
      );
    }
    return ok(rowToView(data));
  });
}

export interface UpdateViewParams {
  readonly id: string;
  readonly name?: string;
  readonly config?: ViewConfig;
  readonly isDefault?: boolean;
}

export async function updateView(
  params: UpdateViewParams,
): Promise<Result<View, ExternalApiError | NotFoundError | ValidationError>> {
  const supabase = await createSupabaseServerClient();

  return runWithDefaultRetry(async () => {
    if (params.isDefault === true) {
      // Need the (table_id, owner_id) of the row we're promoting so
      // we can clear whichever other view currently holds the default
      // flag for the same (owner, table) pair.
      const current = await findViewById(params.id);
      if (!current.ok) return err(current.error);
      if (!current.value.isDefault) {
        const cleared = await clearDefaultFor(
          supabase,
          current.value.tableId,
          current.value.ownerId,
        );
        if (!cleared.ok) return err(cleared.error);
      }
    }

    const patch: ViewUpdate = {};
    if (params.name !== undefined) patch.name = params.name;
    if (params.config !== undefined) {
      patch.config = params.config as unknown as Json;
    }
    if (params.isDefault !== undefined) patch.is_default = params.isDefault;

    const { data, error } = await supabase
      .from("customer_views")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error || !data) {
      logger.error({ id: params.id, code: error?.code }, "update_view_failed");
      return err(
        new ExternalApiError({
          message: error?.message ?? "View update failed.",
          cause: error,
        }),
      );
    }
    return ok(rowToView(data));
  });
}

/**
 * Wraps an insert/update that may trip the partial unique index
 * `customer_views_one_default_per_table` when two setDefault calls
 * race past the clearDefaultFor pre-check. On a 23505 we map the
 * Postgres error to a user-friendly ValidationError — the caller
 * (UI) shows a toast and the user can retry. We deliberately don't
 * auto-retry: a retry would either succeed (good) or fail again
 * (still 23505), and silent retry hides a real concurrency hotspot.
 */
async function runWithDefaultRetry<T>(
  fn: () => Promise<Result<T, ExternalApiError | NotFoundError>>,
): Promise<Result<T, ExternalApiError | NotFoundError | ValidationError>> {
  const result = await fn();
  if (result.ok) return result;
  const cause = (result.error.cause as { code?: string } | undefined);
  if (cause?.code === PG_UNIQUE_VIOLATION) {
    logger.warn(
      { sqlstate: PG_UNIQUE_VIOLATION },
      "view_default_promotion_race",
    );
    return err(
      new ValidationError({
        message:
          "Varsayılan görünüm güncellenirken çakışma oldu. Tekrar deneyin.",
      }),
    );
  }
  return result;
}

/**
 * Atomic delete that returns the deleted row's table_id so the caller
 * can targeted-bust the right grid's cache without a separate lookup.
 * RLS still gates the delete; a row owned by another admin yields
 * `deletedTableId: null` (PGRST116 maybeSingle: no row returned).
 */
export async function deleteView(
  id: string,
): Promise<Result<{ deletedTableId: string | null }, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_views")
    .delete()
    .eq("id", id)
    .select("table_id")
    .maybeSingle();
  if (error) {
    logger.error({ id, code: error.code }, "delete_view_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ deletedTableId: data?.table_id ?? null });
}

/**
 * Drop the is_default flag on whichever view currently holds it for
 * the (owner, table) pair. Idempotent: no-op when none is set. Run
 * before promoting a new default so the partial unique index doesn't
 * trip on the (owner, table, is_default=true) constraint.
 *
 * Takes the existing supabase instance so the caller doesn't pay a
 * second cookies() read inside one Server Action.
 */
async function clearDefaultFor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tableId: string,
  ownerId: string,
): Promise<Result<void, ExternalApiError>> {
  const { error } = await supabase
    .from("customer_views")
    .update({ is_default: false })
    .eq("table_id", tableId)
    .eq("owner_id", ownerId)
    .eq("is_default", true);
  if (error) {
    logger.error(
      { tableId, code: error.code },
      "clear_default_view_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
