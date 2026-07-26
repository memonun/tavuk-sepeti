"use client";

/**
 * Shared product create/edit form, rendered inside a Dialog. The same fields
 * back both flows: "create" also collects an initial base price (kuruş); "edit"
 * only touches content fields (price/tiers are saved from the card). The PK
 * `key` is never shown or edited — it's minted server-side on create.
 */
import { Loader2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createProductAction } from "@/features/products/application/create-product";
import { updateProductMetadataAction } from "@/features/products/application/update-product-metadata";
import {
  FULFILLMENT_TYPE_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
} from "@/features/products/domain/product.schema";
import { normalizeDecimal, parseTRY2 } from "@/features/products/ui/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  FulfillmentType,
  Product,
  ProductUnit,
} from "@/features/products/application/list-products";

interface FieldsState {
  display_name: string;
  unit: ProductUnit;
  unit_label: string;
  package_size: string;
  min_qty: string;
  fulfillment_type: FulfillmentType;
  base_price: string; // TRY — create only
}

function initialFields(product?: Product): FieldsState {
  return {
    display_name: product?.display_name ?? "",
    unit: product?.unit ?? "package",
    unit_label: product?.unit_label ?? "",
    package_size: product ? String(product.package_size) : "1",
    min_qty: product ? String(product.min_qty) : "1",
    fulfillment_type: product?.fulfillment_type ?? "delivery",
    base_price: "",
  };
}

export function ProductFormDialog({
  mode,
  product,
  trigger,
}: {
  mode: "create" | "edit";
  product?: Product;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldsState>(() =>
    initialFields(product),
  );
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<FieldsState>) =>
    setFields((prev) => ({ ...prev, ...patch }));

  // Re-seed the form whenever the dialog opens so an edit reflects the latest
  // product and a re-opened create starts blank.
  const onOpenChange = (next: boolean) => {
    if (next) setFields(initialFields(product));
    setOpen(next);
  };

  const submit = () => {
    const base = {
      display_name: fields.display_name,
      unit: fields.unit,
      unit_label: fields.unit_label,
      package_size: normalizeDecimal(fields.package_size),
      min_qty: normalizeDecimal(fields.min_qty),
      // ADIM (step) artık UI'dan girilmiyor; sipariş artış adımı minimum
      // miktarı izler (miktar = min_qty'nin katı). Bu, mevcut katalogun her
      // ürününü korur (step === min_qty: eggs 1, cheese/yogurt 0.5) — paket
      // boyu eşitlemek yumurtayı 15'erli pakete zorlardı. Gerekirse ayrı alan
      // olarak geri eklenebilir; domain/DB kuralı (`quantity % step === 0`) duruyor.
      step: normalizeDecimal(fields.min_qty),
      fulfillment_type: fields.fulfillment_type,
    };

    startSaving(async () => {
      if (mode === "create") {
        let base_price_minor = 0;
        if (fields.base_price.trim() !== "") {
          const parsed = parseTRY2(fields.base_price);
          if (parsed === null) {
            toast.error("Geçersiz birim fiyat.");
            return;
          }
          base_price_minor = parsed;
        }
        const result = await createProductAction({ ...base, base_price_minor });
        if (result.ok) {
          toast.success(`${fields.display_name} eklendi.`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
        return;
      }

      const result = await updateProductMetadataAction({
        ...base,
        product_key: product!.key,
      });
      if (result.ok) {
        toast.success(`${fields.display_name} güncellendi.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Yeni ürün" : "Ürünü düzenle"}</DialogTitle>
          <DialogDescription>
            Değişiklikler yalnızca yeni siparişleri etkiler; geçmiş siparişler
            kendi anlık görüntülerini korur.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-name">Ürün adı</Label>
            <Input
              id="pf-name"
              value={fields.display_name}
              onChange={(e) => set({ display_name: e.target.value })}
              placeholder="ör. Köy Yumurtası"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-unit">Birim</Label>
              <Select
                value={fields.unit}
                onValueChange={(value) => set({ unit: value as ProductUnit })}
              >
                <SelectTrigger id="pf-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-unit-label">Birim etiketi</Label>
              <Input
                id="pf-unit-label"
                value={fields.unit_label}
                onChange={(e) => set({ unit_label: e.target.value })}
                placeholder="ör. paket (15 adet)"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-pkg">Paket boyutu</Label>
              <Input
                id="pf-pkg"
                inputMode="decimal"
                value={fields.package_size}
                onChange={(e) => set({ package_size: e.target.value })}
                placeholder="1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-min">Min. miktar</Label>
              <Input
                id="pf-min"
                inputMode="decimal"
                value={fields.min_qty}
                onChange={(e) => set({ min_qty: e.target.value })}
                placeholder="1"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-fulfillment">Teslimat yöntemi</Label>
            <Select
              value={fields.fulfillment_type}
              onValueChange={(value) =>
                set({ fulfillment_type: value as FulfillmentType })
              }
            >
              <SelectTrigger id="pf-fulfillment" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FULFILLMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCreate ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-price">Birim fiyat (₺) — opsiyonel</Label>
              <Input
                id="pf-price"
                inputMode="decimal"
                value={fields.base_price}
                onChange={(e) => set({ base_price: e.target.value })}
                placeholder="0,00"
                className="sm:max-w-40"
              />
              <p className="text-xs text-muted-foreground">
                Miktar kademelerini ekledikten sonra karttan düzenleyebilirsin.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={saving} />}>
            İptal
          </DialogClose>
          <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isCreate ? "Ekle" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
