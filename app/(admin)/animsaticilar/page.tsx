import { getRemindersPage } from "@/features/reminders/application/get-reminders-page";
import {
  ReminderListsSection,
  RemindersSidebar,
} from "@/features/reminders/ui/reminders-sidebar";
import { RemindersView } from "@/features/reminders/ui/reminders-view";

interface AnimsaticilarPageProps {
  searchParams: Promise<{ liste?: string; sayfa?: string }>;
}

/**
 * Anımsatıcılar — the admins' shared reminders (Apple Reminders' shape: smart
 * lists and "Listelerim" on the left, the selected list on the right).
 */
export default async function AnimsaticilarPage({ searchParams }: AnimsaticilarPageProps) {
  const result = await getRemindersPage(await searchParams);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Anımsatıcılar yüklenemedi: {result.error.message}
      </div>
    );
  }

  const data = result.value;
  // Remount the list when the view changes so inline drafts never leak across.
  const viewKey = `${data.view.kind}:${data.view.id}`;

  return (
    <div className="flex h-[calc(100dvh-4rem-var(--admin-tabbar-h,0px))] flex-col gap-4 overflow-y-auto md:flex-row md:gap-5 md:overflow-hidden">
      <aside className="shrink-0 md:w-72 md:overflow-y-auto md:pr-1 md:pb-6">
        <RemindersSidebar lists={data.lists} counts={data.counts} view={data.view} />
      </aside>
      <div className="flex min-h-[60dvh] min-w-0 flex-1 flex-col md:min-h-0">
        <RemindersView
          key={viewKey}
          view={data.view}
          lists={data.lists}
          reminders={data.reminders}
          today={data.today}
          now={data.now}
          truncated={data.truncated}
          page={data.page}
          pageCount={data.pageCount}
        />
      </div>
      {/* Phone only: managing the lists comes after the reminders. On desktop
          the same section lives in the sidebar. */}
      <div className="shrink-0 pb-6 md:hidden">
        <ReminderListsSection lists={data.lists} counts={data.counts} view={data.view} />
      </div>
    </div>
  );
}
