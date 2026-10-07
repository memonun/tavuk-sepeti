import { listPlannerWeekTasks } from "@/features/planner/application/list-planner-tasks";
import { startOfIsoWeek } from "@/features/planner/domain/week";
import { PlannerWeekView } from "@/features/planner/ui/planner-week-view";
import { todayInIstanbul } from "@/shared/utils/date";

/**
 * Admin's personal weekly planner — haftasını ve işlerini planlamak için.
 * Entirely self-contained: no other admin page links into or depends on
 * this one, and this page touches no order/customer/route data.
 */
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const requestedWeek =
    params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : todayInIstanbul();
  const weekStartIso = startOfIsoWeek(requestedWeek);

  const result = await listPlannerWeekTasks(weekStartIso);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Planlayıcı</h2>
        <p className="text-sm text-muted-foreground">
          Haftanızı ve işlerinizi planlayın — tamamen size özel, siparişlerle
          ilgisi yok.
        </p>
      </div>

      {result.ok ? (
        <PlannerWeekView
          weekStartIso={weekStartIso}
          scheduled={result.value.scheduled}
          backlog={result.value.backlog}
        />
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          Planlayıcı yüklenemedi: {result.error.message}
        </p>
      )}
    </div>
  );
}
