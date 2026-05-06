"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MapFiltersProps {
  totalActive: number;
  shown: number;
}

/**
 * Compact filter bar for the map view. Toggle between "all active" and
 * "ordered in last 30 days". URL-driven — Server Component re-fetches.
 */
export function MapFilters({ totalActive, shown }: MapFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const recentOnly = params.get("recent") === "1";

  const setRecentOnly = (value: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("recent", "1");
    else next.delete("recent");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setRecentOnly(false)}
          className={cn(
            "h-9",
            !recentOnly && "bg-accent text-accent-foreground",
          )}
        >
          Tüm aktif
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setRecentOnly(true)}
          className={cn(
            "h-9",
            recentOnly && "bg-accent text-accent-foreground",
          )}
        >
          Son 30 gün sipariş veren
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {shown} / {totalActive} pin gösteriliyor
      </p>
    </div>
  );
}
