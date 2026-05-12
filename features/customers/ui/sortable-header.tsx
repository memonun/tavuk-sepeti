"use client";

/**
 * Sortable table header cell — Supabase-style subtle sort affordance.
 *
 * Visual states:
 *   - Inactive: ChevronsUpDown (low-contrast)
 *   - Active asc: ChevronUp (foreground)
 *   - Active desc: ChevronDown (foreground)
 *
 * Click cycle: inactive → asc → desc → inactive. Inactive doesn't strip
 * the param — it sets sort to the default (created_at) which the schema
 * defaults to.
 *
 * URL-driven via `?sort=column&order=asc|desc`. Server Component reads
 * those params and re-issues the query.
 */
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

import type { CustomerSortField } from "@/features/customers/domain/customer.schema";

interface SortableHeaderProps {
  column: CustomerSortField;
  label: string;
  align?: "left" | "right";
  /** When true the column starts with this order on first click. */
  defaultOrder?: "asc" | "desc";
}

const DEFAULT_SORT: CustomerSortField = "created_at";

export function SortableHeader({
  column,
  label,
  align = "left",
  defaultOrder = "asc",
}: SortableHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeSort = params.get("sort") ?? DEFAULT_SORT;
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
      // Already cycled both orders — go back to default sort/order.
      next.delete("sort");
      next.delete("order");
    }
    next.delete("page");
    const search = next.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  };

  const Icon = !isActive
    ? ChevronsUpDown
    : activeOrder === "asc"
      ? ChevronUp
      : ChevronDown;

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
      <Icon
        className={cn(
          "h-3 w-3 transition-opacity",
          isActive ? "opacity-100" : "opacity-50",
        )}
      />
    </button>
  );
}
