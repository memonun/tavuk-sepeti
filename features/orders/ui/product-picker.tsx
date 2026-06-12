"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceOrderLine } from "@/features/products/application/pricing";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { Product } from "@/features/products/application/list-products";

export interface OrderItemDraft {
  product_key: string;
  quantity: number;
  /** Per-customer special price (kuruş). Absent = automatic tier pricing. */
  unit_price_minor?: number;
}

interface ProductPickerProps {
  products: Product[];
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  /** product_key → flat special price (kuruş) for the order's customer. */
  customerPrices?: Record<string, number>;
  error?: string | undefined;
}

interface LineRowProps {
  product: Product;
  draft: OrderItemDraft;
  onQuantity: (q: number) => void;
  onSpecial: (minor: number | undefined) => void;
  onRemove: () => void;
}

function isMultipleOfStep(quantity: number, step: number): boolean {
  const scale = 100;
  return Math.round(quantity * scale) % Math.round(step * scale) === 0;
}

function LineRow({ product, draft, onQuantity, onSpecial, onRemove }: LineRowProps) {
  const [specialText, setSpecialText] = useState(() =>
    draft.unit_price_minor != null
      ? (draft.unit_price_minor / 100).toFixed(2).replace(".", ",")
      : "",
  );

  const stepInvalid = !isMultipleOfStep(draft.quantity, product.step);
  const minInvalid = draft.quantity < product.min_qty;

  const autoPriced = priceOrderLine(draft.quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
  });
  const priced = priceOrderLine(draft.quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
    overrideUnitPriceMinor: draft.unit_price_minor,
  });
  const hasSpecial = draft.unit_price_minor != null;
  // For tiered lines the exact total isn't unit × qty (e.g. 3 × ₺116,67 ≠
  // ₺350,00); flag the unit as approximate so it doesn't read as a mistake.
  const unitApprox =
    Math.round(priced.unit_price_minor * draft.quantity) !== priced.line_total_minor;

  const onSpecialChange = (value: string) => {
    setSpecialText(value);
    const trimmed = value.trim();
    onSpecial(trimmed === "" ? undefined : (parseTRYInput(trimmed) ?? undefined));
  };

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm sm:grid-cols-12">
      <div className="sm:col-span-4">
        <p className="font-medium">{product.display_name}</p>
        <p className="text-xs text-muted-foreground">
          {unitApprox ? "~" : ""}
          {formatTRY(priced.unit_price_minor)} / {product.unit_label}
          {hasSpecial ? <span className="ml-1 text-amber-600">· özel</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:col-span-3">
        <Input
          type="number"
          inputMode="decimal"
          min={product.min_qty}
          step={product.step}
          value={draft.quantity}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onQuantity(next);
          }}
          aria-invalid={stepInvalid || minInvalid}
        />
        <span className="text-xs text-muted-foreground">{product.unit_label}</span>
      </div>
      <div className="sm:col-span-2">
        <Input
          inputMode="decimal"
          value={specialText}
          onChange={(e) => onSpecialChange(e.target.value)}
          placeholder={`oto ${(autoPriced.unit_price_minor / 100)
            .toFixed(2)
            .replace(".", ",")}`}
          aria-label={`${product.display_name} özel fiyat`}
          title="Bu müşteriye özel fiyat (boş = otomatik)"
        />
      </div>
      <div className="flex items-center justify-between sm:col-span-3 sm:justify-end sm:gap-2">
        <p className="font-mono text-sm sm:text-right">
          {formatTRY(priced.line_total_minor)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 w-10 px-0 text-destructive"
          onClick={onRemove}
          aria-label={`${product.display_name} satırını kaldır`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {(stepInvalid || minInvalid) && (
        <p className="text-xs text-destructive sm:col-span-12">
          {minInvalid
            ? `Minimum ${product.min_qty} ${product.unit_label} gerekli.`
            : `Miktar ${product.step} ${product.unit_label} katı olmalı.`}
        </p>
      )}
    </div>
  );
}

export function ProductPicker({
  products,
  items,
  onChange,
  customerPrices,
  error,
}: ProductPickerProps) {
  const productByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const remaining = useMemo(() => {
    const used = new Set(items.map((i) => i.product_key));
    return products.filter((p) => !used.has(p.key));
  }, [products, items]);

  const addItem = (key: string) => {
    const product = productByKey.get(key);
    if (!product) return;
    const special = customerPrices?.[key];
    onChange([
      ...items,
      special != null
        ? { product_key: key, quantity: product.min_qty, unit_price_minor: special }
        : { product_key: key, quantity: product.min_qty },
    ]);
  };

  const setQuantity = (key: string, q: number) => {
    onChange(items.map((i) => (i.product_key === key ? { ...i, quantity: q } : i)));
  };

  const setSpecial = (key: string, minor: number | undefined) => {
    onChange(
      items.map((i) => {
        if (i.product_key !== key) return i;
        if (minor == null) {
          const next = { ...i };
          delete next.unit_price_minor;
          return next;
        }
        return { ...i, unit_price_minor: minor };
      }),
    );
  };

  const removeItem = (key: string) => {
    onChange(items.filter((i) => i.product_key !== key));
  };

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const product = productByKey.get(item.product_key);
            if (!product) return null;
            return (
              <LineRow
                key={item.product_key}
                product={product}
                draft={item}
                onQuantity={(q) => setQuantity(item.product_key, q)}
                onSpecial={(m) => setSpecial(item.product_key, m)}
                onRemove={() => removeItem(item.product_key)}
              />
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Henüz ürün eklenmedi.
        </p>
      )}

      {remaining.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {remaining.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addItem(p.key)}
              className="gap-1.5"
            >
              <Plus className="h-3 w-3" />
              {p.display_name}
            </Button>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
