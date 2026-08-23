import { Plus } from "lucide-react";

import { getFinanceDateRangeBounds } from "@/features/finance/application/date-range-presets";
import { getExpenseSummary } from "@/features/finance/application/get-expense-summary";
import { listExpenseCategoryTree, listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { listExpenses } from "@/features/finance/application/list-expenses";
import { materializeDueRecurringExpenses } from "@/features/finance/application/materialize-due-recurring-expenses";
import { activeCategoryNodes } from "@/features/finance/domain/expense-category";
import { ExpenseCategoryManager } from "@/features/finance/ui/expense-category-manager";
import { ExpenseFilterBar } from "@/features/finance/ui/expense-filter-bar";
import { ExpenseFormDialog } from "@/features/finance/ui/expense-form";
import { ExpenseTable } from "@/features/finance/ui/expense-table";
import { StatCard } from "@/features/finance/ui/stat-card";
import { Button } from "@/components/ui/button";
import { formatTRY } from "@/shared/utils/money";
import { todayInIstanbul } from "@/shared/utils/date";

interface GiderlerPageProps {
  searchParams: Promise<{
    q?: string;
    category_id?: string;
    payment_status?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}

export default async function GiderlerPage({ searchParams }: GiderlerPageProps) {
  // Lazy materialization: viewing Finance is what drives generation, no
  // external cron (spec §14) — see Rutin Giderler's page for the same call.
  await materializeDueRecurringExpenses(todayInIstanbul());

  const params = await searchParams;
  const reportBounds = getFinanceDateRangeBounds("this_month");
  const reportFrom = params.date_from ?? reportBounds.from;
  const reportTo = params.date_to ?? reportBounds.to;

  const [expensesResult, summaryResult, categoryTreeResult, categoriesFlatResult] = await Promise.all([
    listExpenses({
      q: params.q,
      category_id: params.category_id && params.category_id !== "all" ? params.category_id : undefined,
      payment_status:
        params.payment_status && params.payment_status !== "all" ? params.payment_status : undefined,
      date_from: params.date_from,
      date_to: params.date_to,
      sort: params.sort,
      order: params.order,
      page: params.page,
    }),
    getExpenseSummary(reportFrom, reportTo),
    listExpenseCategoryTree(),
    listExpenseCategoriesFlat(),
  ]);

  if (!expensesResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Giderler yüklenemedi: {expensesResult.error.message}
      </div>
    );
  }
  if (!categoryTreeResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Kategoriler yüklenemedi: {categoryTreeResult.error.message}
      </div>
    );
  }
  if (!categoriesFlatResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Kategoriler yüklenemedi: {categoriesFlatResult.error.message}
      </div>
    );
  }

  const categoryTree = categoryTreeResult.value;
  const activeCategories = activeCategoryNodes(categoryTree);

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Giderler</h2>
          <p className="text-sm text-muted-foreground">
            Yakıt, ambalaj, bakım gibi işletme giderlerini kaydet ve takip et.
          </p>
        </div>
        <div className="flex gap-2">
          <ExpenseCategoryManager categories={categoryTree} />
          <ExpenseFormDialog
            mode="create"
            categories={activeCategories}
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Gider Ekle
              </Button>
            }
          />
        </div>
      </div>

      {summaryResult.ok ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard title="Toplam Gider" value={formatTRY(summaryResult.value.total_minor)} />
          <StatCard title="Bekleyen Giderler" value={formatTRY(summaryResult.value.pending_minor)} />
        </div>
      ) : null}

      <ExpenseFilterBar categories={categoryTree} />

      <ExpenseTable
        items={expensesResult.value.items}
        total={expensesResult.value.total}
        page={expensesResult.value.page}
        pageSize={expensesResult.value.pageSize}
        basePath="/finans/giderler"
        query={query}
        categories={categoriesFlatResult.value}
      />
    </div>
  );
}
