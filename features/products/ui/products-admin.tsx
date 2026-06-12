"use client";

/**
 * Products price-admin. One card per product: a flat/base unit price plus an
 * optional set of volume tiers (≥ min_qty → unit price). Saving affects future
 * orders only — existing orders keep their frozen line prices.
 *
 * Tier prices accept up to 4 decimals so fractional rates (eggs at 3 pkg ≈
 * ₺116.6667/pkg) round to an exact line total in the pricing engine.
 */
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProductPricingAction } from "@/features/products/application/save-product-pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { Product } from "@/features/products/application/list-products";

// ---- money parse/format (TRY ⇄ kuruş, up to 4 decimals for tier rates) ----
function parseTRY2(input: string): number | null {
  const n = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(n)) return null;
  return Math.round(Number.parseFloat(n) * 100);
}
function parseTRY4(input: string): number | null {
  const n = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(n)) return null;
  return Math.round(Number.parseFloat(n) * 100 * 10000) / 10000;
}
function formatTRY4(minor: number): string {
  return (minor / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

interface TierRow {
  min_qty: string;
  price: string; // TRY
}

function ProductCard({ product }: { product: Product }) {
  const [baseText, setBaseText] = useState(() =>
    (product.current_unit_price_minor / 100).toFixed(2).replace(".", ","),
  );
  const [tiers, setTiers] = useState<TierRow[]>(() =>
    product.price_tiers.map((t) => ({
      min_qty: String(t.min_qty),
      price: formatTRY4(t.unit_price_minor),
    })),
  );
  const [saving, startSaving] = useTransition();

  const addTier = () =>
    setTiers((prev) => [...prev, { min_qty: "", price: "" }]);
  const removeTier = (idx: number) =>
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  const setTier = (idx: number, patch: Partial<TierRow>) =>
    setTiers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );

  const save = () => {
    const base_price_minor = parseTRY2(baseText);
    if (base_price_minor === null) {
      toast.error("Geçersiz birim fiyat.");
      return;
    }
    const parsedTiers: { min_qty: number; unit_price_minor: number }[] = [];
    for (const t of tiers) {
      const min_qty = Number(t.min_qty.replace(",", "."));
      const unit_price_minor = parseTRY4(t.price);
      if (!Number.isFinite(min_qty) || min_qty <= 0 || unit_price_minor === null) {
        toast.error("Geçersiz kademe satırı.");
        return;
      }
      parsedTiers.push({ min_qty, unit_price_minor });
    }
    startSaving(async () => {
      const result = await saveProductPricingAction({
        product_key: product.key,
        base_price_minor,
        tiers: parsedTiers,
      });
      if (result.ok) {
        toast.success(`${product.display_name} fiyatları kaydedildi.`);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{product.display_name}</p>
          <p className="text-xs text-muted-foreground">
            {product.unit_label} · min {product.min_qty} · adım {product.step}
          </p>
        </div>
        <Button type="button" size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Kaydet
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-48">
        <Label htmlFor={`base-${product.key}`} className="text-xs">
          Birim fiyat (₺ / {product.unit_label})
        </Label>
        <Input
          id={`base-${product.key}`}
          inputMode="decimal"
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          placeholder="0,00"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Miktar kademeleri (≥ adet → birim fiyat). Boşsa birim fiyat geçerli.
        </p>
        {tiers.map((t, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">≥ adet</Label>
              <Input
                inputMode="decimal"
                value={t.min_qty}
                onChange={(e) => setTier(idx, { min_qty: e.target.value })}
                className="w-24"
                placeholder="3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">
                birim fiyat (₺)
              </Label>
              <Input
                inputMode="decimal"
                value={t.price}
                onChange={(e) => setTier(idx, { price: e.target.value })}
                className="w-32"
                placeholder="112,50"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 px-0 text-destructive"
              onClick={() => removeTier(idx)}
              aria-label="Kademeyi kaldır"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTier}
          className="gap-1.5"
        >
          <Plus className="h-3 w-3" />
          Kademe ekle
        </Button>
      </div>
    </div>
  );
}

export function ProductsAdmin({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((p) => (
        <ProductCard key={p.key} product={p} />
      ))}
    </div>
  );
}
