/**
 * "Bugün Hazırlanacaklar" — the Panel's answer to "bugün ne kadar siparişim
 * var, kaç paket yumurta / ne kadar kayısı hazırlamalıyım, bugünkü hasılat ne
 * kadar": today's route orders' product list combined with the cargo
 * backlog's — one packing list, since physically both go out today regardless
 * of which bucket they're counted in.
 *
 * The order counts and money stay in two separate rows (route vs. cargo)
 * rather than one blended total: the cargo backlog has no date scope (a
 * days-old unshipped order sits in it every day until it ships), so folding
 * it into "today" would let stale orders quietly inflate a number that's
 * supposed to reset daily. Same visual language as
 * features/cargo/ui/cargo-manifest-panel.tsx's load list.
 */
import { ClipboardListIcon } from "lucide-react";

import { formatTRY } from "@/shared/utils/money";

import type { DashboardManifest, DashboardManifestTotals } from "@/features/orders/domain/dashboard-manifest";

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function TotalsRow({ label, totals }: { label: string; totals: DashboardManifestTotals }) {
  if (totals.orderCount === 0) {
    return <p className="text-muted-foreground">{label}: yok</p>;
  }
  return (
    <p className="text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      {`: ${totals.orderCount} sipariş`}
      {totals.totalValueMinor > 0 ? ` · ${formatTRY(totals.totalValueMinor)} hasılat` : ""}
      {totals.toCollectMinor > 0 ? ` · ${formatTRY(totals.toCollectMinor)} tahsil edilecek` : ""}
    </p>
  );
}

export function DashboardPrepPanel({ manifest }: { manifest: DashboardManifest }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardListIcon className="h-4 w-4 text-muted-foreground" />
          Bugün hazırlanacaklar
        </span>
      </div>

      {manifest.lines.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Bugün hazırlanacak sipariş yok.
        </p>
      ) : (
        <ul className="space-y-0.5 px-3 py-2">
          {manifest.lines.map((l) => (
            <li
              key={`${l.label} ${l.unit_label}`}
              className="flex flex-wrap items-baseline gap-x-1.5 text-sm"
            >
              <span className="font-medium">{l.label}</span>
              <span className="font-mono font-semibold tabular-nums">
                ×{formatQty(l.quantity)}
              </span>
              {l.unit_label ? (
                <span className="text-muted-foreground">{l.unit_label}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-0.5 border-t px-3 py-2 text-xs">
        {/* Two rows, never merged — see the file header for why. */}
        <TotalsRow label="Bugünkü rota" totals={manifest.route} />
        <TotalsRow label="Bekleyen kargo" totals={manifest.cargo} />
      </div>
    </div>
  );
}
