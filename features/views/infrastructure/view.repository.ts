/**
 * Persistence layer for customer_views.
 *
 * RLS owner-scoped — every read/write runs as the logged-in admin via
 * the SSR client. The Server Action layer is still responsible for
 * assertAdmin() before the call lands here.
 *
 * `customer_views` is fresh in the migration set; the supabase-js
 * Database type doesn't know about it yet. We localize the `any` cast
 * to this file (matches the existing audit_log pattern in
 * shared/audit/log-audit.ts). Run `pnpm db:types` after the migration
 * lands to make this clean.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import { rowToView, type ViewRow } from "@/features/views/infrastructure/view.mapper";

import type { View, ViewConfig } from "@/features/views/domain/view";

/* eslint-disable @typescript-eslint/no-explicit-any -- localized cast
 * for the not-yet-generated customer_views table type. */

export async function listViewsForTable(
  tableId: string,
): Promise<Result<View[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as any)
    .from("customer_views")
    .select("*")
    .eq("table_id", tableId)
    .order("name", { ascending: true });
  if (error) {
    logger.error({ tableId, code: error.code }, "list_views_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok((data as ViewRow[]).map(rowToView));
}

export async function findViewById(
  id: string,
): Promise<Result<View, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as any)
    .from("customer_views")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    logger.error({ id, code: error?.code }, "find_view_failed");
    return err(
      new ExternalApiError({
        message: error?.message ?? "View not found.",
        cause: error,
      }),
    );
  }
  return ok(rowToView(data as ViewRow));
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
): Promise<Result<View, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  // If the new view is being marked default, clear the previous
  // default first so the partial unique index doesn't fire.
  if (params.isDefault) {
    const cleared = await clearDefaultFor(params.tableId, params.ownerId);
    if (!cleared.ok) return err(cleared.error);
  }

  const { data, error } = await (supabase as any)
    .from("customer_views")
    .insert({
      table_id: params.tableId,
      owner_id: params.ownerId,
      name: params.name,
      config: params.config,
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
  return ok(rowToView(data as ViewRow));
}

export interface UpdateViewParams {
  readonly id: string;
  readonly name?: string;
  readonly config?: ViewConfig;
  readonly isDefault?: boolean;
}

export async function updateView(
  params: UpdateViewParams,
): Promise<Result<View, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  if (params.isDefault === true) {
    // Need to know which table/owner this view belongs to before we
    // can clear the existing default for that pair.
    const current = await findViewById(params.id);
    if (!current.ok) return err(current.error);
    if (!current.value.isDefault) {
      const cleared = await clearDefaultFor(
        current.value.tableId,
        current.value.ownerId,
      );
      if (!cleared.ok) return err(cleared.error);
    }
  }

  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name;
  if (params.config !== undefined) patch.config = params.config;
  if (params.isDefault !== undefined) patch.is_default = params.isDefault;

  const { data, error } = await (supabase as any)
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
  return ok(rowToView(data as ViewRow));
}

export async function deleteView(
  id: string,
): Promise<Result<{ deleted: number }, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await (supabase as any)
    .from("customer_views")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    logger.error({ id, code: error.code }, "delete_view_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ deleted: count ?? 0 });
}

/**
 * Drop the is_default flag on whichever view currently holds it for
 * the (owner, table) pair. Idempotent: no-op when none is set. Run
 * before promoting a new default so the partial unique index doesn't
 * trip on the (owner, table, is_default=true) constraint.
 */
async function clearDefaultFor(
  tableId: string,
  ownerId: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as any)
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

/* eslint-enable @typescript-eslint/no-explicit-any */
