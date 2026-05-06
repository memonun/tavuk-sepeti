"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTRY } from "@/shared/utils/money";

import type { Product } from "@/features/products/application/list-products";

export interface OrderItemDraft {
  product_key: string;
  quantity: number;
}

interface ProductPickerProps {
  products: Product[];
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  error?: string | undefined;
}

interface LineRowProps {
  product: Product;
  draft: OrderItemDraft;
  onQuantity: (q: number) => void;
  onRemove: () => void;
}

function isMultipleOfStep(quantity: number, step: number): boolean {
  const scale = 100;
  return Math.round(quantity * scale) % Math.round(step * scale) === 0;
}

function LineRow({ product, draft, onQuantity, onRemove }: LineRowProps) {
  const stepInvalid = !isMultipleOfStep(draft.quantity, product.step);
  const minInvalid = draft.quantity < product.min_qty;
  const lineTotal = draft.quantity * product.current_unit_price_minor;

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm sm:grid-cols-12">
      <div className="sm:col-span-5">
        <p className="font-medium">{product.display_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatTRY(product.current_unit_price_minor)} / {product.unit_label}
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
      <div className="flex items-center justify-between sm:col-span-4 sm:justify-end sm:gap-2">
        <p className="font-mono text-sm sm:text-right">{formatTRY(lineTotal)}</p>
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
    onChange([...items, { product_key: key, quantity: product.min_qty }]);
  };

  const setQuantity = (key: string, q: number) => {
    onChange(items.map((i) => (i.product_key === key ? { ...i, quantity: q } : i)));
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
