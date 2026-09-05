/**
 * "Bugün Hazırlanacaklar" — the Panel's answer to "kaç paket yumurta / ne
 * kadar kayısı hazırlamalıyım": today's route orders' product list combined
 * with the cargo backlog's, into one packing list — physically both go out
 * today regardless of which bucket they're counted in.
 *
 * The per-scope order counts / money / order lists live next to this panel in
 * DashboardOrderListPanel ("Bugünkü Rota" / "Bekleyen Kargo"), kept apart from
 * this combined product list because the cargo backlog has no date scope (a
 * days-old unshipped order sits in it every day until it ships) — folding its
 * numbers into this one would make a "today" figure that isn't. Same visual
 * language as features/cargo/ui/cargo-manifest-panel.tsx's load list.
 */
import { ClipboardListIcon } from "lucide-react";

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
    </div>
  );
}
