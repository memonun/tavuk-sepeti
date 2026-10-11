import { getCalendarPage } from "@/features/calendar/application/get-calendar-page";
import { CalendarShell } from "@/features/calendar/ui/calendar-shell";

interface TakvimPageProps {
  searchParams: Promise<{ gorunum?: string; tarih?: string }>;
}

/**
 * Takvim — the admins' shared calendar (Apple Calendar's shape: day, week and
 * month views over colored calendars), with dated reminders and the days'
 * route deliveries shown alongside the events.
 */
export default async function TakvimPage({ searchParams }: TakvimPageProps) {
  const result = await getCalendarPage(await searchParams);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Takvim yüklenemedi: {result.error.message}
      </div>
    );
  }

  return <CalendarShell data={result.value} />;
}
