// features/orders/ui/bulk-order-screen.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getCustomersMissingPrimaryAddressAction } from "@/features/customers/application/customer-price-actions";
import {
  createOrdersBulkAction,
  type CreateOrdersBulkState,
} from "@/features/orders/application/create-orders-bulk";
import { BasketPanel } from "@/features/orders/ui/basket-panel";
import { CustomerPickList } from "@/features/orders/ui/customer-pick-list";
import { useDraftBatch } from "@/features/orders/ui/use-draft-batch";
import type { Product } from "@/features/products/application/list-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Props {
  products: Product[];
  today: string;
}

const SLOTS: Array<{ value: string; label: string }> = [
  { value: "none", label: "Saat farketmez" },
  { value: "morning", label: "Öğleden önce" },
  { value: "afternoon", label: "Öğleden sonra" },
  { value: "evening", label: "Akşam" },
];

export function BulkOrderScreen({ products, today }: Props) {
  const router = useRouter();
  const { batch, setDate, setDefaults, apply, remove, reset } = useDraftBatch(today);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const productsByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const orderCount = useMemo(
    () =>
      Object.entries(batch.assignments).filter(([, lines]) => lines.length > 0).length,
    [batch],
  );

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const commit = () => {
    // Build the bulkOrderSchema-shaped orders from non-empty assignments.
    const orders = Object.entries(batch.assignments)
      .filter(([, lines]) => lines.length > 0)
      .map(([customer_id, lines]) => ({
        customer_id,
        items: lines.map((l) => ({ product_key: l.product_key, quantity: l.quantity })),
      }));

    if (orders.length === 0) {
      toast.error("En az bir müşteriye ürün ekle.");
      return;
    }

    startTransition(async () => {
      // Pre-flight: check address-less customers before touching the DB.
      const miss = await getCustomersMissingPrimaryAddressAction(
        orders.map((o) => o.customer_id),
      );
      if (miss.length > 0) {
        setMissing(miss);
        toast.error(`${miss.length} müşteride adres yok. Önce adres ekle ya da çıkar.`);
        return;
      }

      const payload = {
        scheduled_for: batch.scheduledFor,
        time_slot: batch.defaults.timeSlot,
        payment_method: batch.defaults.paymentMethod,
        delivery_fee_minor: batch.defaults.deliveryFeeMinor,
        orders,
      };
      const fd = new FormData();
      fd.set("batch_json", JSON.stringify(payload));

      const initial: CreateOrdersBulkState = { status: "idle" };
      const result = await createOrdersBulkAction(initial, fd);

      switch (result.status) {
        case "success":
          toast.success(`${result.created} sipariş oluşturuldu.`);
          reset(today);
          setSelectedIds(new Set());
          router.push("/orders");
          router.refresh();
          return;
        case "missing_address":
          setMissing(result.customerIds);
          toast.error(`${result.customerIds.length} müşteride adres yok.`);
          return;
        case "validation_error": {
          const firstError = Object.values(result.fieldErrors).flat()[0];
          toast.error(firstError ?? "Geçersiz sepet.");
          return;
        }
        case "error":
          toast.error(result.message);
          return;
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-2">
      {/* Top bar: date / slot / payment defaults */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm">
        <label className="flex items-center gap-1">
          Teslim:
          <Input
            type="date"
            value={batch.scheduledFor}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        <label className="flex items-center gap-1">
          Saat:
          <select
            value={batch.defaults.timeSlot ?? "none"}
            onChange={(e) =>
              setDefaults({
                ...batch.defaults,
                timeSlot:
                  e.target.value === "none"
                    ? null
                    : (e.target.value as "morning" | "afternoon" | "evening"),
              })
            }
            className="h-8 rounded-md border bg-background px-2"
          >
            {SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Ödeme:
          <select
            value={batch.defaults.paymentMethod}
            onChange={(e) =>
              setDefaults({
                ...batch.defaults,
                paymentMethod: e.target.value as "cash_on_delivery" | "bank_transfer",
              })
            }
            className="h-8 rounded-md border bg-background px-2"
          >
            <option value="cash_on_delivery">Kapıda nakit</option>
            <option value="bank_transfer">Havale / EFT</option>
          </select>
        </label>
      </div>

      {/* Body: left customer list | right basket panel */}
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-md border p-2">
          <CustomerPickList
            batch={batch}
            productsByKey={productsByKey}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </div>
        <div className="overflow-hidden rounded-md border">
          <BasketPanel
            batch={batch}
            products={products}
            selectedIds={selectedArray}
            onApply={(line) => apply(selectedArray, line)}
            onRemove={(key) => remove(selectedArray, key)}
          />
        </div>
      </div>

      <Separator />

      {/* Bottom bar: order count summary + commit button */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-sm">
        <span>
          {orderCount} sipariş hazır
          {missing.length > 0 && (
            <span className="ml-2 text-destructive">
              · ⚠ {missing.length} müşteride adres yok
            </span>
          )}
        </span>
        <Button type="button" onClick={commit} disabled={pending || orderCount === 0}>
          {pending ? "Oluşturuluyor…" : "Siparişleri Oluştur"}
        </Button>
      </div>
    </div>
  );
}
