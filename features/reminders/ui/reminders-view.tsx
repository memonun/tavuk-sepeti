"use client";

/**
 * The main column of Anımsatıcılar: the selected list's big colored title and
 * its reminders, laid out the way that view calls for — flat for a list,
 * "Bugün" and "Bayraklı"; under day headers for "Planlanan"; under list
 * headers for "Tümü"; paginated for "Tamamlanan".
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  SMART_LIST_LABELS,
  type Reminder,
  type ReminderList,
  type ReminderView,
} from "@/features/reminders/domain/reminder";
import { groupByDueDay, groupByList } from "@/features/reminders/domain/reminder-views";
import { dayHeading } from "@/features/reminders/ui/reminder-format";
import { ReminderQuickAdd, type QuickAddDefaults } from "@/features/reminders/ui/reminder-quick-add";
import { ReminderRow } from "@/features/reminders/ui/reminder-row";
import { smartListColor } from "@/features/reminders/ui/reminders-sidebar";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";
import { useTableRealtime } from "@/shared/realtime/use-table-realtime";

interface RemindersViewProps {
  readonly view: ReminderView;
  readonly lists: readonly ReminderList[];
  readonly reminders: readonly Reminder[];
  readonly today: string;
  readonly now: string;
  readonly truncated: boolean;
  readonly page: number;
  readonly pageCount: number;
}

function EmptyState({ children }: { children: string }) {
  return <p className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

export function RemindersView({
  view,
  lists,
  reminders,
  today,
  now,
  truncated,
  page,
  pageCount,
}: RemindersViewProps) {
  // A second admin's changes (and the Claude connector's) show up on their own.
  useTableRealtime({ tables: ["reminders", "reminder_lists"], channelPrefix: "reminders-page" });

  const listById = new Map(lists.map((list) => [list.id, list]));
  const currentList = view.kind === "list" ? listById.get(view.id) : undefined;
  const firstList = lists[0];

  const title = currentList?.name ?? (view.kind === "smart" ? SMART_LIST_LABELS[view.id] : "");
  const color = currentList
    ? ACCENT_COLOR_HEX[currentList.color]
    : view.kind === "smart"
      ? smartListColor(view.id)
      : ACCENT_COLOR_HEX.blue;

  const isCompletedView = view.kind === "smart" && view.id === "tamamlanan";

  const row = (reminder: Reminder, showList: boolean) => (
    <ReminderRow
      key={reminder.id}
      reminder={reminder}
      list={listById.get(reminder.list_id)}
      lists={lists}
      today={today}
      now={now}
      showList={showList}
    />
  );

  const quickAdd = (defaults: QuickAddDefaults) => (
    <ReminderQuickAdd
      defaults={defaults}
      color={ACCENT_COLOR_HEX[listById.get(defaults.list_id)?.color ?? "blue"]}
    />
  );

  let body: React.ReactNode;
  if (lists.length === 0) {
    body = <EmptyState>Henüz liste yok. Soldan “Liste Ekle” ile başlayın.</EmptyState>;
  } else if (view.kind === "list") {
    body = (
      <>
        <ul>{reminders.map((reminder) => row(reminder, false))}</ul>
        {quickAdd({ list_id: view.id })}
      </>
    );
  } else if (view.id === "tumu") {
    body = groupByList(
      lists.map((list) => list.id),
      reminders,
    ).map((group) => {
      const list = listById.get(group.listId);
      if (!list) return null;
      return (
        <section key={group.listId} className="pb-3">
          <h3
            className="px-3 pt-2 pb-0.5 text-lg font-bold tracking-tight"
            style={{ color: ACCENT_COLOR_HEX[list.color] }}
          >
            {list.name}
          </h3>
          <ul>{group.reminders.map((reminder) => row(reminder, false))}</ul>
          {quickAdd({ list_id: list.id })}
        </section>
      );
    });
  } else if (view.id === "planlanan") {
    const groups = groupByDueDay(reminders);
    body = (
      <>
        {groups.map((group) => (
          <section key={group.day} className="pb-2">
            <h3
              className={cn(
                "px-3 pt-2 pb-0.5 text-sm font-semibold",
                group.day < today ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {dayHeading(group.day, today)}
            </h3>
            <ul>{group.reminders.map((reminder) => row(reminder, true))}</ul>
          </section>
        ))}
        {groups.length === 0 ? <EmptyState>Tarihli anımsatıcı yok.</EmptyState> : null}
        {firstList ? quickAdd({ list_id: firstList.id, due_date: today }) : null}
      </>
    );
  } else if (view.id === "tamamlanan") {
    body =
      reminders.length === 0 ? (
        <EmptyState>Tamamlanan anımsatıcı yok.</EmptyState>
      ) : (
        <ul>{reminders.map((reminder) => row(reminder, true))}</ul>
      );
  } else {
    // "Bugün" and "Bayraklı": one flat list across every list.
    const isToday = view.id === "bugun";
    body = (
      <>
        <ul>{reminders.map((reminder) => row(reminder, true))}</ul>
        {reminders.length === 0 ? (
          <EmptyState>
            {isToday ? "Bugün için anımsatıcı yok." : "Bayraklı anımsatıcı yok."}
          </EmptyState>
        ) : null}
        {firstList
          ? quickAdd(
              isToday
                ? { list_id: firstList.id, due_date: today }
                : { list_id: firstList.id, flagged: true },
            )
          : null}
      </>
    );
  }

  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between gap-3 px-3 pt-1 pb-2">
        <h2 className="truncate text-3xl leading-tight font-bold tracking-[-0.02em]" style={{ color }}>
          {title}
        </h2>
        {!isCompletedView ? (
          <span className="text-3xl leading-tight font-bold tabular-nums" style={{ color }}>
            {reminders.length}
            {truncated ? "+" : ""}
          </span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {truncated ? (
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            Çok fazla anımsatıcı var; liste ilk kısmı gösteriyor. Tamamladıkça kalanlar görünür.
          </p>
        ) : null}
        {body}

        {isCompletedView && pageCount > 1 ? (
          <nav
            aria-label="Sayfalar"
            className="flex items-center justify-center gap-3 pt-4 text-sm text-muted-foreground"
          >
            <PageLink page={page - 1} disabled={page <= 1} label="Önceki sayfa">
              <ChevronLeft className="size-4" />
            </PageLink>
            <span className="tabular-nums">
              {page} / {pageCount}
            </span>
            <PageLink page={page + 1} disabled={page >= pageCount} label="Sonraki sayfa">
              <ChevronRight className="size-4" />
            </PageLink>
          </nav>
        ) : null}
      </div>
    </section>
  );
}

function PageLink({
  page,
  disabled,
  label,
  children,
}: {
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = "flex size-8 items-center justify-center rounded-md";
  if (disabled) {
    return (
      <span aria-disabled className={cn(className, "opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/animsaticilar?liste=tamamlanan&sayfa=${page}`}
      aria-label={label}
      className={cn(className, "hover:bg-muted hover:text-foreground")}
    >
      {children}
    </Link>
  );
}
