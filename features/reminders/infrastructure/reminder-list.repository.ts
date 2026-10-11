/**
 * Persistence for reminder_lists. A handful of rows per shop; the read is
 * still capped (CLAUDE.md §9) and the cap doubles as the creation limit.
 */
import "server-only";

import { ExternalApiError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { toAccentColor, type AccentColor } from "@/shared/palette/accent-colors";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { ReminderList } from "@/features/reminders/domain/reminder";

const LIST_SELECT = "id, name, color, sort_order" as const;

/** Most lists a shop can have — and therefore the most one read returns. */
export const REMINDER_LIST_LIMIT = 50;

type ReminderListRow = { id: string; name: string; color: string; sort_order: number };

function rowToList(row: ReminderListRow): ReminderList {
  return { id: row.id, name: row.name, color: toAccentColor(row.color), sort_order: row.sort_order };
}

export async function listReminderLists(): Promise<Result<ReminderList[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminder_lists")
    .select(LIST_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(0, REMINDER_LIST_LIMIT - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_reminder_lists_failed");
    return err(new ExternalApiError({ message: "Listeler yüklenemedi.", cause: error }));
  }
  return ok((data ?? []).map(rowToList));
}

export async function findReminderListById(
  id: string,
): Promise<Result<ReminderList, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminder_lists")
    .select(LIST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_reminder_list_failed");
    return err(new ExternalApiError({ message: "Liste yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Liste bulunamadı." }));
  return ok(rowToList(data));
}

export async function createReminderList(input: {
  name: string;
  color: AccentColor;
  created_by: string;
}): Promise<Result<string, ExternalApiError | ValidationError>> {
  const supabase = await createSupabaseServerClient();

  // New lists go to the bottom; the same read enforces the cap.
  const { data: existing, error: readError } = await supabase
    .from("reminder_lists")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .range(0, REMINDER_LIST_LIMIT - 1);
  if (readError) {
    logger.error({ code: readError.code, message: readError.message }, "create_reminder_list_read_failed");
    return err(new ExternalApiError({ message: "Liste eklenemedi.", cause: readError }));
  }
  if ((existing ?? []).length >= REMINDER_LIST_LIMIT) {
    return err(new ValidationError({ message: `En fazla ${REMINDER_LIST_LIMIT} liste olabilir.` }));
  }
  const sortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("reminder_lists")
    .insert({
      name: input.name,
      color: input.color,
      sort_order: sortOrder,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_reminder_list_failed");
    return err(new ExternalApiError({ message: "Liste eklenemedi.", cause: error }));
  }
  return ok(data.id);
}

export async function updateReminderList(
  id: string,
  patch: { name?: string | undefined; color?: AccentColor | undefined },
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reminder_lists")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "update_reminder_list_failed");
    return err(new ExternalApiError({ message: "Liste güncellenemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Liste bulunamadı." }));
  return ok(undefined);
}

/** Deletes the list and, through ON DELETE CASCADE, every reminder in it. */
export async function deleteReminderList(
  id: string,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("reminder_lists").delete().eq("id", id).select("id");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_reminder_list_failed");
    return err(new ExternalApiError({ message: "Liste silinemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Liste bulunamadı." }));
  return ok(undefined);
}
