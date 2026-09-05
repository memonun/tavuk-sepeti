/**
 * "Bugün Hazırlanacaklar" — the Panel's answer to "bugün ne kadar siparişim
 * var, kaç paket yumurta / ne kadar kayısı hazırlamalıyım, bugünkü hasılat ne
 * kadar": today's route orders plus the whole cargo backlog, combined into one
 * per-product prep list and two money totals. Same visual language as
 * features/cargo/ui/cargo-manifest-panel.tsx's load list.
 */
import { ClipboardListIcon } from "lucide-react";

import { formatTRY } from "@/shared/utils/money";

import type { DashboardManifest } from "@/features/orders/domain/dashboard-manifest";

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export function DashboardPrepPanel({ manifest }: { manifest: DashboardManifest }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardListIcon className="h-4 w-4 text-muted-foreground" />
          Bugün hazırlanacaklar
        </span>
        <span className="text-xs text-muted-foreground">
          Bugünkü rota + bekleyen kargo
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{manifest.orderCount} sipariş</span>
        {manifest.totalValueMinor > 0 ? (
          <span>· {formatTRY(manifest.totalValueMinor)} toplam hasılat</span>
        ) : null}
        {manifest.toCollectMinor > 0 ? (
          <span>· {formatTRY(manifest.toCollectMinor)} tahsil edilecek</span>
        ) : null}
      </div>
    </div>
  );
}
