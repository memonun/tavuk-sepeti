"use client";

/**
 * Lightweight line-item editor for recurring templates.
 *
 * Does NOT import from features/orders/ui (cross-feature ui import forbidden
 * by ESLint boundaries). Implements only the subset needed for templates:
 *   - product select (no special/override price)
 *   - quantity input
 *   - per-line validation (min_qty + step)
 *   - informational base-price preview (not frozen; labelled "≈")
 */

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMultipleOfStep } from "@/features/orders/application/order-item-pricing";
import { priceOrderLine } from "@/features/products/application/pricing";
import { formatTRY } from "@/shared/utils/money";

import type { Product } from "@/features/products/application/list-products";
import type { RecurringTemplateItem } from "@/features/recurring/domain/recurring-template";

interface RecurringItemsPickerProps {
  readonly products: Product[];
  readonly items: RecurringTemplateItem[];
  readonly onChange: (items: RecurringTemplateItem[]) => void;
  readonly error?: string | undefined;
}

interface LineRowProps {
  readonly product: Product;
  readonly quantity: number;
  readonly availableProducts: Product[];
  readonly usedKeys: Set<string>;
  readonly onProductChange: (newKey: string) => void;
  readonly onQuantityChange: (q: number) => void;
  readonly onRemove: () => void;
}

function LineRow({
  product,
  quantity,
  availableProducts,
  usedKeys,
  onProductChange,
  onQuantityChange,
  onRemove,
}: LineRowProps) {
  const stepInvalid = !isMultipleOfStep(quantity, product.step);
  const minInvalid = quantity < product.min_qty;

  const approxPrice = priceOrderLine(quantity, {
    tiers: product.price_tiers,
    basePriceMinor: product.current_unit_price_minor,
  });

  return (
    <div className="grid grid-cols-1 items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm sm:grid-cols-12">
      {/* Product select */}
      <div className="sm:col-span-5">
        <select
          value={product.key}
          onChange={(e) => {
            const val = e.target.value;
            if (val) onProductChange(val);
          }}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Ürün seç"
        >
          {/* Current product always selectable even if in another line */}
          <option value={product.key}>{product.display_name}</option>
          {availableProducts
            .filter((p) => !usedKeys.has(p.key) || p.key === product.key)
            .filter((p) => p.key !== product.key)
            .map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
        </select>
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-2 sm:col-span-4">
        <Input
          type="number"
          inputMode="decimal"
          min={product.min_qty}
          step={product.step}
          value={quantity}
          aria-invalid={stepInvalid || minInvalid}
          className="w-16 shrink-0"
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onQuantityChange(next);
          }}
        />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {product.unit_label}
        </span>
      </div>

      {/* Approx price preview */}
      <div className="flex items-center justify-between sm:col-span-2 sm:justify-end">
        <span className="font-mono text-xs text-muted-foreground" title="Tahmini fiyat — şablon fiyatı dondurmaz">
          ≈{formatTRY(approxPrice.line_total_minor)}
        </span>
      </div>

      {/* Remove */}
      <div className="flex justify-end sm:col-span-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0 text-destructive"
          onClick={onRemove}
          aria-label={`${product.display_name} satırını kaldır`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Inline validation hint */}
      {(stepInvalid || minInvalid) ? (
        <p className="text-xs text-destructive sm:col-span-12" role="alert">
          {minInvalid
            ? `Minimum ${product.min_qty} ${product.unit_label} gerekli.`
            : `Miktar ${product.step} ${product.unit_label} katı olmalı.`}
        </p>
      ) : null}
    </div>
  );
}

export function RecurringItemsPicker({
  products,
  items,
  onChange,
  error,
}: RecurringItemsPickerProps) {
  const productByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const usedKeys = useMemo(
    () => new Set(items.map((i) => i.product_key)),
    [items],
  );

  const remaining = useMemo(
    () => products.filter((p) => !usedKeys.has(p.key)),
    [products, usedKeys],
  );

  const addItem = () => {
    const first = remaining[0];
    if (!first) return;
    onChange([...items, { product_key: first.key, quantity: first.min_qty }]);
  };

  const updateProduct = (index: number, newKey: string) => {
    const newProduct = productByKey.get(newKey);
    if (!newProduct) return;
    onChange(
      items.map((item, i) =>
        i === index
          ? { product_key: newKey, quantity: newProduct.min_qty }
          : item,
      ),
    );
  };

  const updateQuantity = (index: number, quantity: number) => {
    onChange(
      items.map((item, i) => (i === index ? { ...item, quantity } : item)),
    );
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => {
            const product = productByKey.get(item.product_key);
            if (!product) return null;
            return (
              <LineRow
                key={`${item.product_key}-${index}`}
                product={product}
                quantity={item.quantity}
                availableProducts={products}
                usedKeys={usedKeys}
                onProductChange={(k) => updateProduct(index, k)}
                onQuantityChange={(q) => updateQuantity(index, q)}
                onRemove={() => removeItem(index)}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="gap-1.5"
        >
          <Plus className="h-3 w-3" />
          Ürün ekle
        </Button>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
