"use client";

/**
 * Create/edit market-sale form — same useState + useTransition + direct
 * Server Action pattern as expense-form.tsx / product-form.tsx. Adds a
 * repeatable product+quantity row group (informational only, for "En Çok
 * Satılan Ürünler" — doesn't need to reconcile against Toplam Tutar) and an
 * inline "+ yeni lokasyon" so a third stall is a form submission, not code.
 */
import { Loader2, Plus, Trash2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MANUAL_PAYMENT_METHOD_LABELS, type ManualPaymentMethod } from "@/features/finance/domain/expense";
import { createMarketLocationAction } from "@/features/finance/application/market-location-actions";
import {
  createMarketSaleAction,
  updateMarketSaleAction,
} from "@/features/finance/application/market-sale-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import { todayInIstanbul } from "@/shared/utils/date";
import { parseTRYInput } from "@/shared/utils/money";

import type { MarketSale } from "@/features/finance/domain/market-sale";
import type { MarketLocation } from "@/features/finance/domain/market-location";

interface ProductOption {
  key: string;
  display_name: string;
}

interface ItemRow {
  product_key: string;
  quantity: string;
}

interface FieldsState {
  location_id: string;
  sale_date: string;
  total_amount: string; // TRY
  payment_method: ManualPaymentMethod;
  note: string;
  items: ItemRow[];
}

function initialFields(sale?: MarketSale, defaultLocationId?: string): FieldsState {
  return {
    location_id: sale?.location_id ?? defaultLocationId ?? "",
    sale_date: sale?.sale_date ?? todayInIstanbul(),
    total_amount: sale ? (sale.total_amount_minor / 100).toFixed(2).replace(".", ",") : "",
    payment_method: sale?.payment_method ?? "cash",
    note: sale?.note ?? "",
    items: sale?.items.map((i) => ({ product_key: i.product_key, quantity: String(i.quantity) })) ?? [],
  };
}

const PAYMENT_METHOD_OPTIONS: Array<[ManualPaymentMethod, string]> = [
  ["cash", MANUAL_PAYMENT_METHOD_LABELS.cash],
  ["card", MANUAL_PAYMENT_METHOD_LABELS.card],
  ["other", MANUAL_PAYMENT_METHOD_LABELS.other],
];

export function MarketSaleFormDialog({
  mode,
  sale,
  locations,
  products,
  trigger,
}: {
  mode: "create" | "edit";
  sale?: MarketSale;
  locations: MarketLocation[];
  products: ProductOption[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldsState>(() =>
    initialFields(sale, locations[0]?.id),
  );
  const [localLocations, setLocalLocations] = useState(locations);
  const [newLocationName, setNewLocationName] = useState("");
  const [saving, startSaving] = useTransition();
  const [addingLocation, startAddingLocation] = useTransition();

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  const onOpenChange = (next: boolean) => {
    if (next) {
      setFields(initialFields(sale, locations[0]?.id));
      setLocalLocations(locations);
      setNewLocationName("");
    }
    setOpen(next);
  };

  const addLocation = () => {
    const name = newLocationName.trim();
    if (name === "") return;
    startAddingLocation(async () => {
      const result = await createMarketLocationAction({ name });
      if (result.ok) {
        setLocalLocations((prev) => [...prev, { id: result.value.id, name: result.value.name, active: true, created_at: new Date() }]);
        set({ location_id: result.value.id });
        setNewLocationName("");
        toast.success(`${result.value.name} eklendi.`);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const addItemRow = () => set({ items: [...fields.items, { product_key: "", quantity: "1" }] });
  const removeItemRow = (index: number) =>
    set({ items: fields.items.filter((_, i) => i !== index) });
  const updateItemRow = (index: number, patch: Partial<ItemRow>) =>
    set({
      items: fields.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });

  const submit = () => {
    const total_amount_minor = parseTRYInput(fields.total_amount);
    if (total_amount_minor === null || total_amount_minor <= 0) {
      toast.error("Geçersiz toplam tutar.");
      return;
    }
    if (fields.location_id === "") {
      toast.error("Pazar/lokasyon seçin.");
      return;
    }

    const items = fields.items
      .filter((i) => i.product_key !== "")
      .map((i) => ({ product_key: i.product_key, quantity: Number(i.quantity.replace(",", ".")) }));
    if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0)) {
      toast.error("Geçersiz miktar.");
      return;
    }

    const payload = {
      location_id: fields.location_id,
      sale_date: fields.sale_date,
      total_amount_minor,
      payment_method: fields.payment_method,
      note: fields.note,
      items,
    };

    startSaving(async () => {
      const result =
        mode === "create"
          ? await createMarketSaleAction(payload)
          : await updateMarketSaleAction({ ...payload, id: sale!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "Pazar satışı eklendi." : "Pazar satışı güncellendi.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Pazar Satışı Ekle" : "Pazar satışını düzenle"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-location">Pazar / Lokasyon</Label>
            <div className="flex gap-2">
              <Select value={fields.location_id} onValueChange={(v) => set({ location_id: v ?? "" })}>
                <SelectTrigger id="ms-location" className="w-full">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {localLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="+ yeni lokasyon adı"
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLocation}
                disabled={addingLocation || newLocationName.trim() === ""}
              >
                {addingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ekle"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-date">Tarih</Label>
              <Input
                id="ms-date"
                type="date"
                value={fields.sale_date}
                onChange={(e) => set({ sale_date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-total">Toplam Tutar (₺)</Label>
              <Input
                id="ms-total"
                inputMode="decimal"
                value={fields.total_amount}
                onChange={(e) => set({ total_amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-method">Ödeme Yöntemi</Label>
            <Select
              value={fields.payment_method}
              onValueChange={(v) => set({ payment_method: v as ManualPaymentMethod })}
            >
              <SelectTrigger id="ms-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Ürünler — opsiyonel</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={addItemRow}>
                <Plus className="h-3.5 w-3.5" /> Ürün ekle
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;En Çok Satılan Ürünler&quot; raporu için; toplam tutarla eşleşmesi gerekmez.
            </p>
            {fields.items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={item.product_key}
                  onValueChange={(v) => updateItemRow(index, { product_key: v ?? "" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ürün seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  className="w-24"
                  value={item.quantity}
                  onChange={(e) => updateItemRow(index, { quantity: e.target.value })}
                  placeholder="Adet"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeItemRow(index)}
                  aria-label="Ürünü kaldır"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-note">Not — opsiyonel</Label>
            <Textarea
              id="ms-note"
              value={fields.note}
              onChange={(e) => set({ note: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
          <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isCreate ? "Ekle" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
