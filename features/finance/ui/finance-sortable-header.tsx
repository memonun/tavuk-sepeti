"use client";

/**
 * Sortable table header cell for the Finans tables (Giderler, Pazar
 * Satışları) — same URL-driven click-to-sort affordance as
 * features/customers/ui/sortable-header.tsx, generalized over the column
 * string so both tables' distinct sort-field unions can share it.
 */
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

interface FinanceSortableHeaderProps {
  column: string;
  label: string;
  align?: "left" | "right";
  defaultOrder?: "asc" | "desc";
  defaultSort: string;
}

export function FinanceSortableHeader({
  column,
  label,
  align = "left",
  defaultOrder = "asc",
  defaultSort,
}: FinanceSortableHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeSort = params.get("sort") ?? defaultSort;
  const activeOrder = params.get("order") ?? "desc";
  const isActive = activeSort === column;

  const cycle = () => {
    const next = new URLSearchParams(params.toString());
    if (!isActive) {
      next.set("sort", column);
      next.set("order", defaultOrder);
    } else if (activeOrder === defaultOrder) {
      next.set("sort", column);
      next.set("order", defaultOrder === "asc" ? "desc" : "asc");
    } else {
      next.delete("sort");
      next.delete("order");
    }
    next.delete("page");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }),
    );
  };

  const Icon = !isActive ? ChevronsUpDown : activeOrder === "asc" ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider transition-colors",
        align === "right" && "justify-end",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <Icon className={cn("h-3 w-3 transition-opacity", isActive ? "opacity-100" : "opacity-50")} />
    </button>
  );
}
