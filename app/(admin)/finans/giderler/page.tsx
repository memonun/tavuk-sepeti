import { Plus } from "lucide-react";

import { getFinanceDateRangeBounds } from "@/features/finance/application/date-range-presets";
import { getExpenseSummary } from "@/features/finance/application/get-expense-summary";
import { listExpenses } from "@/features/finance/application/list-expenses";
import { ExpenseFilterBar } from "@/features/finance/ui/expense-filter-bar";
import { ExpenseFormDialog } from "@/features/finance/ui/expense-form";
import { ExpenseTable } from "@/features/finance/ui/expense-table";
import { StatCard } from "@/features/finance/ui/stat-card";
import { Button } from "@/components/ui/button";
import { formatTRY } from "@/shared/utils/money";

interface GiderlerPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    payment_status?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}

export default async function GiderlerPage({ searchParams }: GiderlerPageProps) {
  const params = await searchParams;
  const reportBounds = getFinanceDateRangeBounds("this_month");
  const reportFrom = params.date_from ?? reportBounds.from;
  const reportTo = params.date_to ?? reportBounds.to;

  const [expensesResult, summaryResult] = await Promise.all([
    listExpenses({
      q: params.q,
      category: params.category && params.category !== "all" ? params.category : undefined,
      payment_status:
        params.payment_status && params.payment_status !== "all" ? params.payment_status : undefined,
      date_from: params.date_from,
      date_to: params.date_to,
      sort: params.sort,
      order: params.order,
      page: params.page,
    }),
    getExpenseSummary(reportFrom, reportTo),
  ]);

  if (!expensesResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Giderler yüklenemedi: {expensesResult.error.message}
      </div>
    );
  }

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
        <ExpenseFormDialog
          mode="create"
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Gider Ekle
            </Button>
          }
        />
      </div>

      {summaryResult.ok ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard title="Toplam Gider" value={formatTRY(summaryResult.value.total_minor)} />
          <StatCard title="Bekleyen Giderler" value={formatTRY(summaryResult.value.pending_minor)} />
        </div>
      ) : null}

      <ExpenseFilterBar />

      <ExpenseTable
        items={expensesResult.value.items}
        total={expensesResult.value.total}
        page={expensesResult.value.page}
        pageSize={expensesResult.value.pageSize}
        basePath="/finans/giderler"
        query={query}
      />
    </div>
  );
}
