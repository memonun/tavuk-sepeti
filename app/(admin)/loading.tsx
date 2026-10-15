/**
 * Shown the instant an admin tab is tapped, while the server renders the page.
 *
 * Every admin page is dynamic (it reads the database per request), and without
 * a loading boundary Next can neither prefetch nor show anything for it: the
 * tap looked ignored until the whole render came back — on a phone's signal
 * that was seconds of a frozen screen. This one boundary covers every admin
 * route that has no loading.tsx of its own (/customers keeps its table-shaped
 * one). The shell — header, sidebar, tab bar — stays in place; only the page
 * area shows this generic page shape.
 */
import { Skeleton } from "@/components/ui/skeleton";

const CARD_COUNT = 6;

export default function AdminLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Yükleniyor">
      {/* Page title + subtitle */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>

      {/* Toolbar row */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-24 shrink-0" />
      </div>

      {/* Cards on a phone, a loose grid on wider screens */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
