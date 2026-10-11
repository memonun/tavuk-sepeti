/**
 * Persistence for calendars. A handful of rows per shop; the read is still
 * capped (CLAUDE.md §9) and the cap doubles as the creation limit.
 */
import "server-only";

import { ExternalApiError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { toAccentColor, type AccentColor } from "@/shared/palette/accent-colors";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Calendar } from "@/features/calendar/domain/calendar";

const CALENDAR_SELECT = "id, name, color, sort_order" as const;

/** Most calendars a shop can have — and therefore the most one read returns. */
export const CALENDAR_LIMIT = 50;

type CalendarRow = { id: string; name: string; color: string; sort_order: number };

function rowToCalendar(row: CalendarRow): Calendar {
  return { id: row.id, name: row.name, color: toAccentColor(row.color), sort_order: row.sort_order };
}

export async function listCalendars(): Promise<Result<Calendar[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendars")
    .select(CALENDAR_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(0, CALENDAR_LIMIT - 1);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_calendars_failed");
    return err(new ExternalApiError({ message: "Takvimler yüklenemedi.", cause: error }));
  }
  return ok((data ?? []).map(rowToCalendar));
}

export async function createCalendar(input: {
  name: string;
  color: AccentColor;
  created_by: string;
}): Promise<Result<string, ExternalApiError | ValidationError>> {
  const supabase = await createSupabaseServerClient();

  // New calendars go to the bottom; the same read enforces the cap.
  const { data: existing, error: readError } = await supabase
    .from("calendars")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .range(0, CALENDAR_LIMIT - 1);
  if (readError) {
    logger.error({ code: readError.code, message: readError.message }, "create_calendar_read_failed");
    return err(new ExternalApiError({ message: "Takvim eklenemedi.", cause: readError }));
  }
  if ((existing ?? []).length >= CALENDAR_LIMIT) {
    return err(new ValidationError({ message: `En fazla ${CALENDAR_LIMIT} takvim olabilir.` }));
  }
  const sortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("calendars")
    .insert({
      name: input.name,
      color: input.color,
      sort_order: sortOrder,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_calendar_failed");
    return err(new ExternalApiError({ message: "Takvim eklenemedi.", cause: error }));
  }
  return ok(data.id);
}

export async function updateCalendar(
  id: string,
  patch: { name?: string | undefined; color?: AccentColor | undefined },
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendars")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "update_calendar_failed");
    return err(new ExternalApiError({ message: "Takvim güncellenemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Takvim bulunamadı." }));
  return ok(undefined);
}

/** Deletes the calendar and, through ON DELETE CASCADE, every event in it. */
export async function deleteCalendar(
  id: string,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("calendars").delete().eq("id", id).select("id");

  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_calendar_failed");
    return err(new ExternalApiError({ message: "Takvim silinemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Takvim bulunamadı." }));
  return ok(undefined);
}
