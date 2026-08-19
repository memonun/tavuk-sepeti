/** "Ödeme Durumu" — collected vs. still-expected, as a two-segment bar. */
import { formatTRY } from "@/shared/utils/money";

export function CollectionStatus({
  collectedMinor,
  expectedMinor,
}: {
  collectedMinor: number;
  expectedMinor: number;
}) {
  const totalMinor = collectedMinor + expectedMinor;
  const collectedPct = totalMinor > 0 ? Math.round((collectedMinor / totalMinor) * 100) : 0;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Ödeme Durumu</h3>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500" style={{ width: `${collectedPct}%` }} />
        <div className="h-full bg-amber-500" style={{ width: `${100 - collectedPct}%` }} />
      </div>
      <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Tahsil Edildi</span>
          <span className="font-medium tabular-nums">{formatTRY(collectedMinor)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Ödeme Bekleniyor</span>
          <span className="font-medium tabular-nums">{formatTRY(expectedMinor)}</span>
        </div>
      </div>
    </div>
  );
}
