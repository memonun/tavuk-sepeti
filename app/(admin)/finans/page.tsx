/**
 * Finans Özeti — the financial control center's summary dashboard. Resolves
 * the period filter (preset or custom), fetches the composed FinanceSummary
 * in one call, and renders the stat cards + breakdown sections. Operational
 * visibility only — no accounting engine (CLAUDE.md §13 / the Finans plan's
 * explicit scope boundary).
 */
import {
  getFinanceDateRangeBounds,
  isFinanceDateRangePreset,
} from "@/features/finance/application/date-range-presets";
import { getFinanceSummary } from "@/features/finance/application/get-finance-summary";
import { getRecentFinancialActivity } from "@/features/finance/application/get-recent-financial-activity";
import { ChannelRevenueBars } from "@/features/finance/ui/channel-revenue-bars";
import { CollectionStatus } from "@/features/finance/ui/collection-status";
import { ExpenseBreakdownBars } from "@/features/finance/ui/expense-breakdown-bars";
import { FinancePeriodFilter } from "@/features/finance/ui/finance-period-filter";
import { RecentActivityList } from "@/features/finance/ui/recent-activity-list";
import { StatCard } from "@/features/finance/ui/stat-card";
import { formatTRY } from "@/shared/utils/money";

interface FinansPageProps {
  searchParams: Promise<{
    range?: string;
    date_basis?: string;
    date_from?: string;
    date_to?: string;
  }>;
}

export default async function FinansPage({ searchParams }: FinansPageProps) {
  const params = await searchParams;
  const preset = isFinanceDateRangePreset(params.range) ? params.range : "this_month";
  const dateBasis = params.date_basis === "created_at" ? "created_at" : "scheduled_for";
  const bounds =
    preset === "custom" && params.date_from && params.date_to
      ? { from: params.date_from, to: params.date_to }
      : getFinanceDateRangeBounds(preset);

  const [summaryResult, activityResult] = await Promise.all([
    getFinanceSummary({ from: bounds.from, to: bounds.to, dateBasis }),
    getRecentFinancialActivity(),
  ]);

  if (!summaryResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Finans özeti yüklenemedi: {summaryResult.error.message}
      </div>
    );
  }

  const summary = summaryResult.value;
  const activity = activityResult.ok ? activityResult.value : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Finans Özeti</h2>
        <p className="text-sm text-muted-foreground">
          Apuhan Çiftliği&apos;nin seçili dönemdeki finansal durumu.
        </p>
      </div>

      <FinancePeriodFilter />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Toplam Ciro" value={formatTRY(summary.totalRevenueMinor)} />
        <StatCard title="Tahsil Edilen" value={formatTRY(summary.collectedMinor)} tone="positive" />
        <StatCard title="Beklenen Ödemeler" value={formatTRY(summary.expectedPaymentsMinor)} />
        <StatCard title="Toplam Gider" value={formatTRY(summary.totalExpensesMinor)} />
        <StatCard title="Bekleyen Giderler" value={formatTRY(summary.pendingExpensesMinor)} />
        <StatCard
          title="Net Durum"
          value={formatTRY(summary.netDurumMinor)}
          hint="Tahsil Edilen − Ödenmiş Giderler"
          tone={summary.netDurumMinor >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChannelRevenueBars rows={summary.channelBreakdown} />
        <CollectionStatus
          collectedMinor={summary.collectedMinor}
          expectedMinor={summary.expectedPaymentsMinor}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExpenseBreakdownBars rows={summary.expenseBreakdown} />
        <RecentActivityList items={activity} />
      </div>
    </div>
  );
}
