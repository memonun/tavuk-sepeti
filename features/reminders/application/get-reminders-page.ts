import "server-only";

/**
 * Everything the /animsaticilar page renders, in one call: the lists, the
 * sidebar counts, and the reminders of the selected view. The three reads are
 * independent and run in parallel.
 */
import {
  remindersPageQuerySchema,
  resolveReminderView,
} from "@/features/reminders/domain/reminder.schema";
import { listReminderLists } from "@/features/reminders/infrastructure/reminder-list.repository";
import {
  COMPLETED_PAGE_SIZE,
  getReminderCounts,
  listCompletedReminders,
  listOpenReminders,
  type OpenReminderFilter,
  type ReminderPage,
} from "@/features/reminders/infrastructure/reminder.repository";
import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { addDaysToYmd, istanbulInstant, todayInIstanbul } from "@/shared/utils/date";

import type {
  Reminder,
  ReminderCounts,
  ReminderList,
  ReminderView,
} from "@/features/reminders/domain/reminder";

export interface RemindersPageData {
  /** Today's Istanbul day (YYYY-MM-DD). */
  readonly today: string;
  /** The instant the page was rendered — the reference for "overdue". */
  readonly now: string;
  readonly lists: readonly ReminderList[];
  readonly counts: ReminderCounts;
  readonly view: ReminderView;
  readonly reminders: readonly Reminder[];
  /** True when an open-reminder view hit the repository cap. */
  readonly truncated: boolean;
  /** "Tamamlanan" only: 1-based page and how many pages there are. */
  readonly page: number;
  readonly pageCount: number;
}

function readView(
  view: ReminderView,
  dayEnd: string,
  page: number,
): Promise<Result<ReminderPage, ExternalApiError>> {
  if (view.kind === "list") return listOpenReminders({ kind: "list", listId: view.id });
  if (view.id === "tamamlanan") return listCompletedReminders(page);
  const filter: OpenReminderFilter =
    view.id === "bugun"
      ? { kind: "dueBefore", dayEnd }
      : view.id === "planlanan"
        ? { kind: "scheduled" }
        : view.id === "bayrakli"
          ? { kind: "flagged" }
          : { kind: "all" };
  return listOpenReminders(filter);
}

function sameView(a: ReminderView, b: ReminderView): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export async function getRemindersPage(
  rawQuery: unknown,
): Promise<Result<RemindersPageData, AppError>> {
  // Every field has a .catch() fallback, so only a non-object input can fail.
  const parsed = remindersPageQuerySchema.safeParse(rawQuery);
  const query = parsed.success ? parsed.data : {};
  const page = query.sayfa ?? 1;

  const now = new Date();
  const today = todayInIstanbul();
  const dayEnd = istanbulInstant(addDaysToYmd(today, 1)).toISOString();

  // The view is read optimistically — a `liste` that names a list is assumed
  // to exist — so it can run alongside the lists themselves.
  const requested = resolveReminderView(query.liste, query.liste ? [query.liste] : []);

  const [listsResult, countsResult, firstRead] = await Promise.all([
    listReminderLists(),
    getReminderCounts(dayEnd),
    readView(requested, dayEnd, page),
  ]);
  if (!listsResult.ok) return err(listsResult.error);
  if (!countsResult.ok) return err(countsResult.error);

  // A bookmarked list that has since been deleted falls back to "Bugün".
  const view = resolveReminderView(
    query.liste,
    listsResult.value.map((list) => list.id),
  );
  const viewResult = sameView(view, requested) ? firstRead : await readView(view, dayEnd, page);
  if (!viewResult.ok) return err(viewResult.error);

  const isCompletedView = view.kind === "smart" && view.id === "tamamlanan";
  return ok({
    today,
    now: now.toISOString(),
    lists: listsResult.value,
    counts: countsResult.value,
    view,
    reminders: viewResult.value.items,
    truncated: !isCompletedView && viewResult.value.total > viewResult.value.items.length,
    page,
    pageCount: isCompletedView
      ? Math.max(1, Math.ceil(viewResult.value.total / COMPLETED_PAGE_SIZE))
      : 1,
  });
}
