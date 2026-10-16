/**
 * The report: every change made to the ads, newest first, with the reason
 * given for it. Server Component — nothing here is interactive.
 */
import type { AdsChangeRow } from "@/features/ads/domain/ads-change";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

const ACTION_LABEL: Record<AdsChangeRow["action"], string> = {
  budget: "Bütçe",
  pause: "Durduruldu",
  resume: "Yayına alındı",
  create: "Oluşturuldu",
};

const LEVEL_LABEL: Record<AdsChangeRow["entity_level"], string> = {
  campaign: "Kampanya",
  adset: "Reklam seti",
  ad: "Reklam",
};

function budgetText(row: AdsChangeRow): string | null {
  const { before_daily_budget_minor: before, after_daily_budget_minor: after } = row;
  if (row.action === "budget" && before !== null && after !== null) {
    return `${formatTRY(before)} → ${formatTRY(after)} / gün`;
  }
  return after !== null ? `${formatTRY(after)} / gün` : null;
}

export function AdsChangeLog({ changes, error }: { changes: readonly AdsChangeRow[]; error: string | null }) {
  if (error) {
    return <p className="text-sm text-destructive" role="alert">{error}</p>;
  }
  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz bir değişiklik yapılmadı.</p>;
  }
  return (
    <ol className="flex flex-col divide-y rounded-lg border">
      {changes.map((row) => {
        const budget = budgetText(row);
        return (
          <li key={row.id} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={row.action === "pause" ? "outline" : "secondary"}>{ACTION_LABEL[row.action]}</Badge>
              <span className="font-medium [overflow-wrap:anywhere]">{row.entity_name}</span>
              <span className="text-xs text-muted-foreground">{LEVEL_LABEL[row.entity_level]}</span>
            </div>
            {budget ? <p className="font-mono text-xs">{budget}</p> : null}
            <p className="text-muted-foreground [overflow-wrap:anywhere]">{row.reason}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(row.created_at)} · {row.source === "mcp" ? "Claude" : "Panel"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
