"use client";

/**
 * Free-sample tracking on an order — see supabase/migrations/20260912120000
 * for why this exists: staff hand out 50-100gr gifts at packing time that
 * never showed up anywhere in the system. Adding one here is what feeds the
 * Finans → Ürün Çetelesi report (features/finance/ui/product-tally-table.tsx).
 *
 * Deliberately its own small island (own local list state, own actions)
 * rather than folded into OrderDetailPanel's item-editing state: gifts have
 * no price and never affect the order total, so they don't need to share
 * that component's save/edit-lock lifecycle.
 */
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addOrderGiftAction,
  removeOrderGiftAction,
} from "@/features/orders/application/order-gift-actions";
import {
  GIFT_UNIT_LABELS,
  type GiftUnitLabel,
  type OrderGiftItem,
} from "@/features/orders/domain/order-gift";

import type { Product } from "@/features/products/application/list-products";

interface OrderGiftItemsPanelProps {
  readonly orderId: string;
  readonly products: ReadonlyArray<Pick<Product, "key" | "display_name">>;
  readonly gifts: ReadonlyArray<OrderGiftItem>;
}

export function OrderGiftItemsPanel({
  orderId,
  products,
  gifts: initialGifts,
}: OrderGiftItemsPanelProps) {
  const [gifts, setGifts] = useState<ReadonlyArray<OrderGiftItem>>(initialGifts);
  const [pending, startTransition] = useTransition();
  const [productKey, setProductKey] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [unitLabel, setUnitLabel] = useState<GiftUnitLabel>("gr");
  const [note, setNote] = useState("");

  const onAdd = () => {
    if (!productKey) {
      toast.error("Önce bir ürün seç.");
      return;
    }
    const quantity = Number(quantityText.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Geçerli bir miktar gir.");
      return;
    }

    startTransition(async () => {
      const result = await addOrderGiftAction({
        order_id: orderId,
        product_key: productKey,
        quantity,
        unit_label: unitLabel,
        note: note.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setGifts((prev) => [...prev, result.value]);
      setProductKey("");
      setQuantityText("");
      setNote("");
      toast.success("Hediye eklendi.");
    });
  };

  const onRemove = (gift: OrderGiftItem) => {
    startTransition(async () => {
      const result = await removeOrderGiftAction(gift.id, orderId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setGifts((prev) => prev.filter((g) => g.id !== gift.id));
      toast.success("Hediye kaldırıldı.");
    });
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Hediye ürünler</h3>
        <p className="text-xs text-muted-foreground">
          Bu siparişe elden eklenen ücretsiz numune/hediye — Finans → Ürün Çetelesi
          raporuna yansır.
        </p>
      </div>

      {gifts.length > 0 ? (
        <ul className="space-y-1.5">
          {gifts.map((gift) => (
            <li
              key={gift.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
            >
              <span>
                {gift.quantity} {gift.unit_label} — {gift.product_display_name}
                {gift.note ? (
                  <span className="text-muted-foreground"> ({gift.note})</span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={pending}
                onClick={() => onRemove(gift)}
                aria-label="Hediyeyi kaldır"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Bu siparişe henüz hediye eklenmedi.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1">
          <Label className="text-xs">Ürün</Label>
          <Select value={productKey} onValueChange={(v) => v && setProductKey(v)} disabled={pending}>
            <SelectTrigger className="h-9 w-full" aria-label="Hediye ürünü seç">
              <SelectValue placeholder="Ürün seç…" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20 space-y-1">
          <Label className="text-xs">Miktar</Label>
          <Input
            inputMode="decimal"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            placeholder="50"
            disabled={pending}
            className="h-9"
          />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-xs">Birim</Label>
          <Select
            value={unitLabel}
            onValueChange={(v) => v && setUnitLabel(v as GiftUnitLabel)}
            disabled={pending}
          >
            <SelectTrigger className="h-9 w-full" aria-label="Birim seç">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GIFT_UNIT_LABELS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-32 flex-1 space-y-1">
          <Label className="text-xs">Not (opsiyonel)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ör. tadım"
            disabled={pending}
            className="h-9"
          />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={onAdd}>
          Ekle
        </Button>
      </div>
    </section>
  );
}
