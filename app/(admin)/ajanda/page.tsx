import { getAgendaPage } from "@/features/agenda/application/get-agenda-page";
import { AgendaOverdueList, AgendaUndatedList } from "@/features/agenda/ui/agenda-backlog";
import { AgendaSummary } from "@/features/agenda/ui/agenda-summary";
import { AgendaAddTaskButton } from "@/features/agenda/ui/agenda-task-form";
import { AgendaCategoryFilter, AgendaWeekNav } from "@/features/agenda/ui/agenda-toolbar";
import { AgendaWeekCalendar } from "@/features/agenda/ui/agenda-week-calendar";

interface AjandaPageProps {
  searchParams: Promise<{ hafta?: string; kategori?: string }>;
}

export default async function AjandaPage({ searchParams }: AjandaPageProps) {
  const result = await getAgendaPage(await searchParams);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Ajanda yüklenemedi: {result.error.message}
      </div>
    );
  }

  const data = result.value;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ajanda</h2>
          <p className="text-sm text-muted-foreground">
            Haftalık işler, yapılacaklar ve hayvan sağlığı takibi.
          </p>
        </div>
        <AgendaAddTaskButton
          label="İş Ekle"
          defaultDueDate={data.isCurrentWeek ? data.today : data.week.start}
          defaultCategory={data.category ?? undefined}
        />
      </div>

      <AgendaSummary
        summary={data.summary}
        overdueCount={data.backlog.overdue.length}
        isCurrentWeek={data.isCurrentWeek}
      />

      <AgendaCategoryFilter
        week={data.week}
        isCurrentWeek={data.isCurrentWeek}
        category={data.category}
      />

      <AgendaOverdueList tasks={data.backlog.overdue} />

      <AgendaWeekNav
        week={data.week}
        isCurrentWeek={data.isCurrentWeek}
        prevWeekStart={data.prevWeekStart}
        nextWeekStart={data.nextWeekStart}
        category={data.category}
      />

      {data.weekTruncated || data.backlogTruncated ? (
        <p className="text-xs text-muted-foreground">
          Çok fazla iş var; listeler ilk kısmı gösteriyor. Tamamlanan işleri işaretledikçe kalanlar
          görünür.
        </p>
      ) : null}

      <AgendaWeekCalendar
        week={data.week}
        today={data.today}
        tasksByDay={data.tasksByDay}
        category={data.category}
      />

      <AgendaUndatedList tasks={data.backlog.undated} category={data.category} />
    </div>
  );
}
