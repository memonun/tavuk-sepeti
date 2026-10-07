import "server-only";

/**
 * Everything the /ajanda page renders, in one call: the requested week's
 * tasks grouped by day, the overdue/undated backlog, and the summary tiles.
 * The two reads are independent and run in parallel.
 */
import {
  agendaPageQuerySchema,
  type AgendaPageQuery,
} from "@/features/agenda/domain/agenda-task.schema";
import {
  groupTasksByDay,
  shiftWeekStart,
  splitBacklog,
  summarizeWeek,
  weekContaining,
  type AgendaBacklog,
  type AgendaWeek,
  type AgendaWeekSummary,
} from "@/features/agenda/domain/agenda-week";
import {
  listAgendaBacklog,
  listAgendaTasksInRange,
} from "@/features/agenda/infrastructure/agenda-task.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { todayInIstanbul } from "@/shared/utils/date";

import type { AgendaCategory, AgendaTask } from "@/features/agenda/domain/agenda-task";

export interface AgendaPageData {
  readonly today: string;
  readonly week: AgendaWeek;
  readonly isCurrentWeek: boolean;
  /** Monday of the previous / next week, for the navigation links. */
  readonly prevWeekStart: string;
  readonly nextWeekStart: string;
  readonly category: AgendaCategory | null;
  readonly tasksByDay: ReadonlyMap<string, readonly AgendaTask[]>;
  readonly backlog: AgendaBacklog;
  readonly summary: AgendaWeekSummary;
  /** True when a list hit the repository cap and is showing only part. */
  readonly weekTruncated: boolean;
  readonly backlogTruncated: boolean;
}

export async function getAgendaPage(rawQuery: unknown): Promise<Result<AgendaPageData, AppError>> {
  // Every field has a .catch() fallback, so only a non-object input can fail.
  const parsed = agendaPageQuerySchema.safeParse(rawQuery);
  const query: AgendaPageQuery = parsed.success ? parsed.data : {};

  const today = todayInIstanbul();
  const week = weekContaining(query.hafta ?? today);
  const category = query.kategori ?? null;

  const [weekResult, backlogResult] = await Promise.all([
    listAgendaTasksInRange(week.start, week.end, category ?? undefined),
    listAgendaBacklog(today, category ?? undefined),
  ]);
  if (!weekResult.ok) return err(weekResult.error);
  if (!backlogResult.ok) return err(backlogResult.error);

  return ok({
    today,
    week,
    isCurrentWeek: today >= week.start && today <= week.end,
    prevWeekStart: shiftWeekStart(week.start, -1),
    nextWeekStart: shiftWeekStart(week.start, 1),
    category,
    tasksByDay: groupTasksByDay(weekResult.value.items, week),
    backlog: splitBacklog(backlogResult.value.items, today),
    summary: summarizeWeek(weekResult.value.items, week, today),
    weekTruncated: weekResult.value.total > weekResult.value.items.length,
    backlogTruncated: backlogResult.value.total > backlogResult.value.items.length,
  });
}
