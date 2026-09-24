"use client";

/**
 * Create/edit market-sale form — same useState + useTransition + direct
 * Server Action pattern as expense-form.tsx / product-form.tsx.
 *
 * "Satılan ürünler" is a quantity sheet: every active product is listed with a
 * quantity box (blank = not sold), like a tally sheet at the stall. It is
 * informational — it feeds the sold-products views and need not add up to the
 * typed Toplam Tutar — but a catalog-price estimate can fill that box. An
 * inline "+ yeni lokasyon" makes a third stall a form submission, not code.
 *
 * The form state lives in an inner component keyed by the sale, so it is seeded
 * from the sale AFTER the edit dialog has loaded it. (Seeding when the dialog
 * opened — before the async detail fetch returned — left every edit form blank.)
 */
import { Loader2 } from "lucide-react";
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
import { estimateSoldItemsMinor } from "@/features/finance/application/market-sale-estimate";
import {
  buildSaleItems,
  collectSoldItems,
  displayUnit,
  type MarketProductOption,
} from "@/features/finance/domain/market-sale-products";
import { todayInIstanbul } from "@/shared/utils/date";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { MarketSale } from "@/features/finance/domain/market-sale";
import type { MarketLocation } from "@/features/finance/domain/market-location";

interface FieldsState {
  location_id: string;
  sale_date: string;
  total_amount: string; // TRY
  payment_method: ManualPaymentMethod;
  note: string;
  /** product_key → typed quantity (blank = not sold). */
  quantities: Record<string, string>;
}

function initialFields(sale?: MarketSale, defaultLocationId?: string): FieldsState {
  return {
    location_id: sale?.location_id ?? defaultLocationId ?? "",
    sale_date: sale?.sale_date ?? todayInIstanbul(),
    total_amount: sale ? (sale.total_amount_minor / 100).toFixed(2).replace(".", ",") : "",
    payment_method: sale?.payment_method ?? "cash",
    note: sale?.note ?? "",
    quantities: Object.fromEntries(
      (sale?.items ?? []).map((i) => [i.product_key, String(i.quantity).replace(".", ",")]),
    ),
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
  products: MarketProductOption[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isCreate = mode === "create";
  // Edit: the sale is fetched when the pencil is clicked and may not have
  // arrived yet — never show (or let anyone save) a blank form for it.
  const loading = !isCreate && !sale;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Pazar Satışı Ekle" : "Pazar satışını düzenle"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <MarketSaleFormBody
            // Re-seed when a (re)loaded sale replaces the previous one.
            key={sale ? `${sale.id}:${sale.updated_at.getTime()}` : "new"}
            mode={mode}
            sale={sale}
            locations={locations}
            products={products}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MarketSaleFormBody({
  mode,
  sale,
  locations,
  products,
  onDone,
}: {
  mode: "create" | "edit";
  sale: MarketSale | undefined;
  locations: MarketLocation[];
  products: MarketProductOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldsState>(() => initialFields(sale, locations[0]?.id));
  const [localLocations, setLocalLocations] = useState(locations);
  const [newLocationName, setNewLocationName] = useState("");
  const [saving, startSaving] = useTransition();
  const [addingLocation, startAddingLocation] = useTransition();

  // Base UI's Select only resolves the trigger's display label from this
  // `items` map (id -> name) — it never reads the popup's rendered
  // SelectItem/SelectItemText content, so without it the trigger shows the
  // raw value (a UUID here) instead of the location name.
  const locationItems = Object.fromEntries(localLocations.map((loc) => [loc.id, loc.name]));

  const set = (patch: Partial<FieldsState>) => setFields((prev) => ({ ...prev, ...patch }));

  // The quantity sheet: every active product, plus any product on this sale
  // that has since been archived (so editing an old sale never drops a line).
  const sheet: MarketProductOption[] = [
    ...products,
    ...(sale?.items ?? [])
      .filter((i) => !products.some((p) => p.key === i.product_key))
      .map((i) => ({
        key: i.product_key,
        display_name: `${i.product_name} (arşiv)`,
        unit_label: i.unit_label,
        unit: i.unit,
        current_unit_price_minor: 0,
        price_tiers: [],
      })),
  ];
  const sheetKeys = sheet.map((p) => p.key);

  const built = buildSaleItems(fields.quantities, sheetKeys);
  const enteredItems = collectSoldItems(fields.quantities, sheetKeys);
  const estimateMinor = estimateSoldItemsMinor(enteredItems, products);

  const setQuantity = (key: string, value: string) =>
    set({ quantities: { ...fields.quantities, [key]: value } });

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
    if (!built.ok) {
      const name = sheet.find((p) => p.key === built.productKey)?.display_name ?? "ürün";
      toast.error(`${name}: geçersiz miktar (0'dan büyük bir sayı girin ya da boş bırakın).`);
      return;
    }

    const payload = {
      location_id: fields.location_id,
      sale_date: fields.sale_date,
      total_amount_minor,
      payment_method: fields.payment_method,
      note: fields.note,
      items: built.items,
    };

    startSaving(async () => {
      const result =
        mode === "create"
          ? await createMarketSaleAction(payload)
          : await updateMarketSaleAction({ ...payload, id: sale!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "Pazar satışı eklendi." : "Pazar satışı güncellendi.");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const isCreate = mode === "create";

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: the sale itself. */}
        <div className="grid content-start gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-location">Pazar / Lokasyon</Label>
            <Select
              value={fields.location_id}
              onValueChange={(v) => set({ location_id: v ?? "" })}
              items={locationItems}
            >
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

          {estimateMinor > 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Katalog fiyatıyla ürünler ≈{" "}
                <span className="font-medium text-foreground tabular-nums">{formatTRY(estimateMinor)}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() =>
                  set({ total_amount: (estimateMinor / 100).toFixed(2).replace(".", ",") })
                }
              >
                Toplamı doldur
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-method">Ödeme Yöntemi</Label>
            <Select
              value={fields.payment_method}
              onValueChange={(v) => set({ payment_method: v as ManualPaymentMethod })}
              items={MANUAL_PAYMENT_METHOD_LABELS}
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
            <Label htmlFor="ms-note">Not — opsiyonel</Label>
            <Textarea
              id="ms-note"
              value={fields.note}
              onChange={(e) => set({ note: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        {/* Right: what was sold — a quantity sheet. */}
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Satılan ürünler — opsiyonel</Label>
            <span className="text-xs text-muted-foreground">
              {enteredItems.length > 0 ? `${enteredItems.length} ürün` : "boş = satılmadı"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sadece satılanlara miktar yaz. Toplam tutarla eşleşmesi gerekmez.
          </p>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {sheet.map((p) => {
              const invalid = !built.ok && built.productKey === p.key;
              return (
                <li key={p.key} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{p.display_name}</span>
                  <Input
                    inputMode="decimal"
                    className="h-8 w-20 text-right"
                    value={fields.quantities[p.key] ?? ""}
                    onChange={(e) => setQuantity(p.key, e.target.value)}
                    placeholder="0"
                    aria-label={`${p.display_name} satılan miktar`}
                    aria-invalid={invalid}
                  />
                  <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">
                    {displayUnit(p.unit_label, p.unit)}
                  </span>
                </li>
              );
            })}
            {sheet.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Aktif ürün yok.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={saving} />}>İptal</DialogClose>
        <Button type="button" onClick={submit} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isCreate ? "Ekle" : "Kaydet"}
        </Button>
      </DialogFooter>
    </>
  );
}
