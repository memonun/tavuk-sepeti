// features/orders/ui/basket-panel.tsx
"use client";

import { useMemo, useState } from "react";

import { estimateBasket } from "@/features/orders/application/bulk-basket-estimate";
import { isMultipleOfStep } from "@/features/orders/application/order-item-pricing";
import {
  computeCoverage,
  type BasketLine,
  type CoverageLine,
  type DraftBatch,
} from "@/features/orders/domain/draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { formatTRY } from "@/shared/utils/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Props {
  batch: DraftBatch;
  products: Product[];
  selectedIds: string[];
  /** customer_id → { product_key → special unit price (kuruş) }. */
  priceOverrides: ReadonlyMap<string, Record<string, number>>;
  /** Fee (kuruş) that will be added to each hand-delivered order; 0 = none. */
  deliveryFeeMinor: number;
  onApply: (line: BasketLine) => void;
  onRemove: (productKey: string) => void;
}

function badgeFor(line: CoverageLine): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (line.state === "all") {
    return line.mixedQty
      ? { label: `${line.presentCount}/${line.total} ✓ ~`, variant: "secondary" }
      : { label: `${line.presentCount}/${line.total} ✓`, variant: "default" };
  }
  return { label: `${line.presentCount}/${line.total} ◑`, variant: "outline" };
}

export function BasketPanel({
  batch,
  products,
  selectedIds,
  priceOverrides,
  deliveryFeeMinor,
  onApply,
  onRemove,
}: Props) {
  const productsByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const coverage = useMemo(
    () => computeCoverage(selectedIds, batch),
    [selectedIds, batch],
  );

  const n = selectedIds.length;

  // Live estimate, priced the way the server will price the orders (a customer's
  // saved special price wins over tiers) — see bulk-basket-estimate.ts.
  const { subtotalMinor: estimateMinor, orderCount, specialLineCount } = useMemo(
    () => estimateBasket(selectedIds, batch, productsByKey, priceOverrides),
    [selectedIds, batch, productsByKey, priceOverrides],
  );

  if (n === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Soldan müşteri seç — ortak sepet burada görünecek.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="text-sm font-medium">Ortak sepet · {n} müşteri seçili</div>
      <Separator />

      <div className="flex-1 space-y-1 overflow-auto">
        {coverage.length === 0 && (
          <p className="text-sm text-muted-foreground">Sepet boş. Aşağıdan ürün ekle.</p>
        )}
        {coverage.map((line) => {
          const p = productsByKey.get(line.product_key);
          const b = badgeFor(line);
          return (
            <div
              key={line.product_key}
              className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
            >
              <span className="w-28 shrink-0 truncate">
                {p?.display_name ?? line.product_key}
              </span>
              <span className="text-muted-foreground">×{line.commonQty ?? "—"}</span>
              <Badge variant={b.variant} className="ml-auto text-[10px]">
                {b.label}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemove(line.product_key)}
              >
                kaldır
              </Button>
            </div>
          );
        })}
      </div>

      <Separator />
      <AddProductRow products={products} onApply={onApply} count={n} />

      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {n} sipariş · tahmini{specialLineCount > 0 ? ` (${specialLineCount} özel fiyatlı satır dahil)` : ""}
          </span>
          <span className="font-mono font-semibold">{formatTRY(estimateMinor)}</span>
        </div>
        {deliveryFeeMinor > 0 && orderCount > 0 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              + teslimat ücreti ({orderCount} × {formatTRY(deliveryFeeMinor)}, kargo hariç)
            </span>
            <span className="font-mono">{formatTRY(estimateMinor + orderCount * deliveryFeeMinor)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AddProductRow({
  products,
  onApply,
  count,
}: {
  products: Product[];
  onApply: (line: BasketLine) => void;
  count: number;
}) {
  const firstProduct = products[0];
  const [productKey, setProductKey] = useState<string>(firstProduct?.key ?? "");
  const product = products.find((p) => p.key === productKey);
  const [qtyText, setQtyText] = useState<string>(() => String(firstProduct?.min_qty ?? 1));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (!product) return;
    const qty = Number(qtyText.replace(",", "."));
    if (!Number.isFinite(qty) || qty < product.min_qty) {
      setError(`En az ${product.min_qty} ${product.unit_label}.`);
      return;
    }
    if (!isMultipleOfStep(qty, product.step)) {
      setError(`Miktar ${product.step} ${product.unit_label} katı olmalı.`);
      return;
    }
    setError(null);
    onApply({ product_key: product.key, quantity: qty });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={productKey}
          onChange={(e) => {
            setProductKey(e.target.value);
            const p = products.find((x) => x.key === e.target.value);
            if (p) setQtyText(String(p.min_qty));
          }}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
        >
          {products.map((p) => (
            <option key={p.key} value={p.key}>
              {p.display_name}
            </option>
          ))}
        </select>
        <Input
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          inputMode="decimal"
          className="h-8 w-20"
        />
        <Button type="button" size="sm" onClick={apply}>
          {count}&apos;e uygula
        </Button>
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
