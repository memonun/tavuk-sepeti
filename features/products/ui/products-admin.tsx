"use client";

/**
 * Products catalog manager. Lists the full catalog (active + archived) as
 * cards. Each card lets the admin edit content fields (via a dialog), archive
 * or restore the product, and edit its pricing inline: a flat/base unit price
 * plus optional volume tiers (≥ min_qty → unit price).
 *
 * Saving affects FUTURE orders only — existing orders keep their frozen line
 * prices (snapshot model). Removal is archive-only: order_items has an
 * ON DELETE RESTRICT FK to products, so an ordered product can't be deleted.
 *
 * Tier prices accept up to 4 decimals so fractional rates (eggs at 3 pkg ≈
 * ₺116.6667/pkg) round to an exact line total in the pricing engine.
 */
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProductPricingAction } from "@/features/products/application/save-product-pricing";
import { setProductActiveAction } from "@/features/products/application/set-product-active";
import { ProductFormDialog } from "@/features/products/ui/product-form";
import { formatTRY4, parseTRY2, parseTRY4 } from "@/features/products/ui/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import type { Product } from "@/features/products/application/list-products";

interface TierRow {
  min_qty: string;
  price: string; // TRY
}

function PricingEditor({ product }: { product: Product }) {
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
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fiyatlandırma
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={save}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Fiyatı kaydet
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
        <p className="text-xs text-muted-foreground">
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

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [toggling, startToggling] = useTransition();
  const archived = !product.active;

  const toggleActive = () => {
    startToggling(async () => {
      const result = await setProductActiveAction({
        product_key: product.key,
        active: archived, // restore if currently archived, else archive
      });
      if (result.ok) {
        toast.success(
          archived
            ? `${product.display_name} geri yüklendi.`
            : `${product.display_name} arşivlendi.`,
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md ${
        archived ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{product.display_name}</p>
            <Badge variant={archived ? "secondary" : "outline"}>
              {archived ? "Arşiv" : "Aktif"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {product.unit_label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ProductFormDialog
            mode="edit"
            product={product}
            trigger={
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Düzenle
              </Button>
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleActive}
            disabled={toggling}
            className="gap-1.5"
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : archived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {archived ? "Geri yükle" : "Arşivle"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DetailChip label="Paket" value={String(product.package_size)} />
        <DetailChip label="Min." value={String(product.min_qty)} />
        <DetailChip label="Adım" value={String(product.step)} />
      </div>

      <Separator />

      <PricingEditor product={product} />
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export function ProductsAdmin({ products }: { products: Product[] }) {
  const active = products.filter((p) => p.active);
  const archived = products.filter((p) => !p.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <ProductFormDialog
          mode="create"
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" />
              Yeni ürün
            </Button>
          }
        />
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Henüz ürün yok</p>
          <p className="text-xs text-muted-foreground">
            “Yeni ürün” ile katalogu oluşturmaya başla.
          </p>
        </div>
      ) : (
        <>
          <Section title="Aktif ürünler" count={active.length}>
            {active.map((p) => (
              <ProductCard key={p.key} product={p} />
            ))}
          </Section>

          {archived.length > 0 ? (
            <Section title="Arşiv" count={archived.length}>
              {archived.map((p) => (
                <ProductCard key={p.key} product={p} />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
