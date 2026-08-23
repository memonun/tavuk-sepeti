"use client";

/** "Gider Dağılımı" — same horizontal-bar treatment as channel revenue, now
 *  with an "Ana Kategoriler | Detay" toggle (spec §18) so the owner can see
 *  both "Üretim Giderleri" as a whole and "Tavuk Yemi" specifically without
 *  manually searching individual records. Local toggle state only — this
 *  doesn't need to survive a reload, unlike the period filter. */
import { useState } from "react";

import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";

import type { CategoryAmount, ParentCategoryAmount } from "@/features/finance/domain/expense-category";
import { formatCategoryPath } from "@/features/finance/domain/expense-category";

interface ExpenseBreakdownBarsProps {
  byParent: readonly ParentCategoryAmount[];
  byCategory: readonly CategoryAmount[];
}

export function ExpenseBreakdownBars({ byParent, byCategory }: ExpenseBreakdownBarsProps) {
  const [view, setView] = useState<"parent" | "detail">("parent");

  const rows =
    view === "parent"
      ? byParent.map((r) => ({ key: r.id, label: r.name, amountMinor: r.amountMinor }))
      : byCategory.map((r) => ({
          key: r.categoryId,
          label: formatCategoryPath(r.categoryName, r.parentName),
          amountMinor: r.amountMinor,
        }));
  const maxMinor = Math.max(1, ...rows.map((r) => r.amountMinor));

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gider Dağılımı</h3>
        <div className="flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("parent")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              view === "parent" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
          >
            Ana Kategoriler
          </button>
          <button
            type="button"
            onClick={() => setView("detail")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              view === "detail" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
          >
            Detay
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums">{formatTRY(row.amountMinor)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.round((row.amountMinor / maxMinor) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu dönemde kayıtlı gider yok.</p>
        ) : null}
      </div>
    </div>
  );
}
