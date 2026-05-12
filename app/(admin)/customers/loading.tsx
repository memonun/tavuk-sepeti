/**
 * Skeleton shown while the customer table is fetching. Without this,
 * sort/filter changes leave the previous results visible in a pending-
 * transition limbo with no spinner — the table "feels heavy" because
 * the user doesn't know whether their click registered.
 *
 * Matches the real table shape so the layout doesn't jump on hydrate.
 */
import { Skeleton } from "@/components/ui/skeleton";

const ROW_COUNT = 10;

export default function CustomersLoading() {
  return (
    <div className="space-y-5">
      {/* Header (title + total + CTA) */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Filter bar: search + 6 dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full min-w-[200px] sm:max-w-xs" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border overflow-hidden">
        <div className="border-b bg-muted/30 px-3 py-2">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="divide-y">
          {Array.from({ length: ROW_COUNT }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3">
              <Skeleton className="h-4 flex-1 max-w-[180px]" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="hidden sm:block h-4 w-20" />
              <Skeleton className="hidden md:block h-4 w-24" />
              <Skeleton className="hidden lg:block h-4 w-16" />
              <Skeleton className="hidden xl:block h-4 w-28" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="hidden sm:block h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}
