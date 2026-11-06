"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  newDraftLine,
  removeSavedFromLines,
  setProductSave,
  setProductSpecial,
  undoRemoveSavedOnLines,
} from "@/features/orders/application/picker-lines";
import { priceOrderLine, productLinePricing } from "@/features/products/application/pricing";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { Product } from "@/features/products/application/list-products";

export interface OrderItemDraft {
  product_key: string;
  quantity: number;
  /** Special price (kuruş) for THIS order line. Absent = automatic tier pricing. */
  unit_price_minor?: number;
  /** true = also keep this price as the customer's saved price. Default: this order only. */
  save_for_customer?: boolean;
}

interface ProductPickerProps {
  products: Product[];
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  /** product_key → the customer's saved price (kuruş). Added lines start at it. */
  customerPrices?: Record<string, number>;
  /** Products whose saved price will be removed when the order is saved. When
   *  both this and `onRemovedSavedChange` are given, each row offers the save /
   *  remove controls (open orders only — a delivered order never changes them). */
  removedSavedKeys?: readonly string[];
  onRemovedSavedChange?: (keys: string[]) => void;
  /** Delivered order: the charged figures of each row that keeps its price,
   *  aligned with `items` by index (undefined = priced today). */
  lockedPrices?: readonly (LockedLinePrice | undefined)[];
  error?: string | undefined;
}

export interface LockedLinePrice {
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

interface LineRowProps {
  product: Product;
  draft: OrderItemDraft;
  locked: LockedLinePrice | undefined;
  onQuantity: (q: number) => void;
  onSpecial: (minor: number | undefined) => void;
  onRemove: () => void;
  /** The customer's saved price for this product, if any. */
  saved: number | undefined;
  /** Undefined = this picker does not offer save/remove (e.g. delivered order). */
  saveControls:
    | {
        savedRemoved: boolean;
        onSaveChange: (save: boolean) => void;
        onRemoveSaved: () => void;
        onUndoRemoveSaved: () => void;
      }
    | undefined;
}

function isMultipleOfStep(quantity: number, step: number): boolean {
  const scale = 100;
  return Math.round(quantity * scale) % Math.round(step * scale) === 0;
}

function specialTextOf(minor: number | undefined): string {
  return minor != null ? (minor / 100).toFixed(2).replace(".", ",") : "";
}

function LineRow({
  product,
  draft,
  locked,
  onQuantity,
  onSpecial,
  onRemove,
  saved,
  saveControls,
}: LineRowProps) {
  const [specialText, setSpecialText] = useState(() => specialTextOf(draft.unit_price_minor));
  const [specialInvalid, setSpecialInvalid] = useState(false);

  // The special is per product, so another row of the same product can change
  // it. Show that value here unless this box already says the same amount.
  const [seenSpecial, setSeenSpecial] = useState(draft.unit_price_minor);
  if (draft.unit_price_minor !== seenSpecial) {
    setSeenSpecial(draft.unit_price_minor);
    const trimmed = specialText.trim();
    const typed = trimmed === "" ? undefined : parseTRYInput(trimmed);
    if (typed !== draft.unit_price_minor) {
      setSpecialText(specialTextOf(draft.unit_price_minor));
      setSpecialInvalid(false);
    }
  }

  const stepInvalid = !isMultipleOfStep(draft.quantity, product.step);
  const minInvalid = draft.quantity < product.min_qty;

  const autoPriced = priceOrderLine(draft.quantity, productLinePricing(product));
  const priced =
    locked ??
    priceOrderLine(draft.quantity, {
      ...productLinePricing(product),
      overrideUnitPriceMinor: draft.unit_price_minor,
    });
  const hasSpecial = !locked && draft.unit_price_minor != null;
  // For tiered lines the unit is an average, so unit × qty may miss the exact
  // total (e.g. 3 × ₺116,67 ≠ ₺350,00); flag the unit as approximate so it doesn't read as a mistake.
  const unitApprox =
    Math.round(priced.unit_price_minor * draft.quantity) !== priced.line_total_minor;

  const onSpecialChange = (value: string) => {
    setSpecialText(value);
    const trimmed = value.trim();
    if (trimmed === "") {
      setSpecialInvalid(false);
      onSpecial(undefined); // cleared on purpose → back to automatic pricing
      return;
    }
    const minor = parseTRYInput(trimmed);
    if (minor === null) {
      // Half-typed ("90,") or not an amount ("90 TL"): keep the last valid
      // special instead of falling back to automatic pricing. Dropping it here
      // made the total jump to the catalog price mid-typing — and saving that
      // state deleted the customer's saved special price.
      setSpecialInvalid(true);
      return;
    }
    setSpecialInvalid(false);
    onSpecial(minor);
  };

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm sm:grid-cols-12">
      <div className="sm:col-span-4">
        <p className="font-medium">{product.display_name}</p>
        <p className="text-xs text-muted-foreground">
          {unitApprox ? "~" : ""}
          {formatTRY(priced.unit_price_minor)} / {product.unit_label}
          {hasSpecial ? <span className="ml-1 text-amber-600">· özel</span> : null}
          {locked ? <span className="ml-1">· teslim fiyatı</span> : null}
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
          aria-invalid={specialInvalid}
          title="Bu siparişe özel fiyat (boş = otomatik)"
        />
        {specialInvalid ? (
          <p className="mt-1 text-xs text-destructive">Geçerli tutar girin (ör. 90,00).</p>
        ) : null}
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
      {saveControls && !locked && (draft.unit_price_minor != null || saved != null) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-12">
          {draft.unit_price_minor != null && !saveControls.savedRemoved ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={draft.save_for_customer === true}
                onCheckedChange={(checked) => saveControls.onSaveChange(checked === true)}
                aria-label={`${product.display_name}: müşteri için kaydet`}
              />
              <span className="text-foreground">Müşteri için kaydet</span>
              <span>
                {draft.save_for_customer === true
                  ? "· sonraki siparişlerde de bu fiyat gelir"
                  : "· sadece bu siparişe özel"}
              </span>
            </label>
          ) : null}
          {saved != null ? (
            saveControls.savedRemoved ? (
              <span>
                Kayıtlı fiyat ({formatTRY(saved)}) kaydedince kaldırılacak ·{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={saveControls.onUndoRemoveSaved}
                >
                  Geri al
                </button>
              </span>
            ) : (
              <span>
                Kayıtlı fiyat: {formatTRY(saved)} ·{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={saveControls.onRemoveSaved}
                >
                  Kayıtlı fiyatı kaldır
                </button>
              </span>
            )
          ) : null}
        </div>
      ) : null}
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
  removedSavedKeys,
  onRemovedSavedChange,
  lockedPrices,
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

  const removedSaved = removedSavedKeys ?? [];
  // Save/remove controls apply to open orders only; a delivered order (locked
  // rows) never touches the customer's saved prices.
  const offerSaveControls =
    onRemovedSavedChange !== undefined && lockedPrices === undefined;

  const addItem = (key: string) => {
    const product = productByKey.get(key);
    if (!product) return;
    onChange([
      ...items,
      newDraftLine(key, product.min_qty, customerPrices?.[key], removedSaved.includes(key)),
    ]);
  };

  // Quantity and removal act on one row: a saved order can hold the same
  // product on two lines (e.g. 2 + 1 packs), and editing one must not touch
  // the other.
  const setQuantity = (index: number, q: number) => {
    onChange(items.map((i, at) => (at === index ? { ...i, quantity: q } : i)));
  };

  // Rules for the special price / save mark / saved-price controls live in
  // application/picker-lines.ts.
  const setSpecial = (key: string, minor: number | undefined) =>
    onChange(
      setProductSpecial(items, key, minor, customerPrices?.[key], removedSaved.includes(key)),
    );

  const setSave = (key: string, save: boolean) => onChange(setProductSave(items, key, save));

  const removeSaved = (key: string) => {
    onRemovedSavedChange?.([...removedSaved.filter((k) => k !== key), key]);
    onChange(removeSavedFromLines(items, key, customerPrices?.[key]));
  };

  const undoRemoveSaved = (key: string) => {
    onRemovedSavedChange?.(removedSaved.filter((k) => k !== key));
    onChange(undoRemoveSavedOnLines(items, key, customerPrices?.[key]));
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, at) => at !== index));
  };

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => {
            const product = productByKey.get(item.product_key);
            if (!product) return null;
            // A saved order can repeat a product; keep each row's key unique.
            const occurrence = items
              .slice(0, index)
              .filter((i) => i.product_key === item.product_key).length;
            return (
              <LineRow
                key={`${item.product_key}:${occurrence}`}
                product={product}
                draft={item}
                locked={lockedPrices?.[index]}
                onQuantity={(q) => setQuantity(index, q)}
                onSpecial={(m) => setSpecial(item.product_key, m)}
                onRemove={() => removeItem(index)}
                saved={customerPrices?.[item.product_key]}
                saveControls={
                  offerSaveControls
                    ? {
                        savedRemoved: removedSaved.includes(item.product_key),
                        onSaveChange: (save) => setSave(item.product_key, save),
                        onRemoveSaved: () => removeSaved(item.product_key),
                        onUndoRemoveSaved: () => undoRemoveSaved(item.product_key),
                      }
                    : undefined
                }
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
