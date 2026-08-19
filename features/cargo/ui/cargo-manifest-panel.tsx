/**
 * "Toplam hazırlanacak ürünler" card — same visual language as
 * features/routing/ui/route-manifest-panel.tsx's load list, without the
 * Kalan/Toplam toggle (every order in the cargo queue still needs prep, so
 * there's no delivered/remaining split to switch between).
 */
import { Package } from "lucide-react";

import { formatTRY } from "@/shared/utils/money";

import type { CargoManifest } from "@/features/cargo/domain/cargo-manifest";

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export function CargoManifestPanel({ manifest }: { manifest: CargoManifest }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-4 w-4 text-muted-foreground" />
          Hazırlanacak ürünler
        </span>
      </div>

      {manifest.lines.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Hazırlanacak kargo yok.
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
          <span>· {formatTRY(manifest.totalValueMinor)} toplam değer</span>
        ) : null}
      </div>
    </div>
  );
}
