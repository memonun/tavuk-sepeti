// features/orders/ui/bulk-order-screen.tsx
"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  getCustomerProductPricesBatchAction,
  getCustomersMissingPrimaryAddressAction,
} from "@/features/customers/application/customer-price-actions";
import {
  createOrdersBulkAction,
  type CreateOrdersBulkState,
} from "@/features/orders/application/create-orders-bulk";
import { groupOverridesByCustomer } from "@/features/orders/application/bulk-order-pricing";
import { BasketPanel } from "@/features/orders/ui/basket-panel";
import { CustomerPickList } from "@/features/orders/ui/customer-pick-list";
import { useDraftBatch } from "@/features/orders/ui/use-draft-batch";
import { usePersistentState } from "@/features/orders/ui/use-persistent-state";
import type { Product } from "@/features/products/application/list-products";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { parseOptionalTRYInput } from "@/shared/utils/money";
import { Separator } from "@/components/ui/separator";

interface Props {
  products: Product[];
  today: string;
  /** Owner-set hand-delivery fee (kuruş) from /magaza-ayarlari — the amount the
   *  fee box starts with. Editable here per batch. */
  defaultDeliveryFeeMinor: number;
  // Forwarded to CustomerPickList as-is — see its own prop doc.
  newCustomerSlot?: ReactNode;
}

const SLOTS: Array<{ value: string; label: string }> = [
  { value: "none", label: "Saat farketmez" },
  { value: "morning", label: "Öğleden önce" },
  { value: "afternoon", label: "Öğleden sonra" },
  { value: "evening", label: "Akşam" },
];

export function BulkOrderScreen({
  products,
  today,
  defaultDeliveryFeeMinor,
  newCustomerSlot,
}: Props) {
  const router = useRouter();
  const { batch, setDate, setDefaults, apply, remove, reset } = useDraftBatch(today);
  // Selection persists across navigation (go view a customer, come back) — the
  // draft basket already does via useDraftBatch; this keeps the left side too.
  const [selectedIds, setSelectedIds] = usePersistentState<ReadonlySet<string>>(
    "ts:bulk-order:selection:v1",
    new Set<string>(),
    (s) => JSON.stringify([...s]),
    (raw) => new Set<string>(JSON.parse(raw) as string[]),
  );
  // Deliberately NOT in the persisted draft: a stored amount would go stale the
  // moment the owner changes the setting. Every visit starts ticked, at the
  // current setting.
  const [feeEnabled, setFeeEnabled] = useState(true);
  const [feeText, setFeeText] = useState(() =>
    (defaultDeliveryFeeMinor / 100).toFixed(2).replace(".", ","),
  );
  // A cleared box means "no fee" (0), same as unticking it; only text that is
  // not an amount is an error. (Treating blank as invalid used to leave the
  // create button disabled with no explanation.)
  const parsedFeeMinor = parseOptionalTRYInput(feeText);
  const feeValid = !feeEnabled || parsedFeeMinor !== null;
  const effectiveFeeMinor = feeEnabled ? (parsedFeeMinor ?? 0) : 0;
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

  // Each customer's saved special prices, so the basket estimate matches what
  // the server will actually charge (it prices every order with them). Loaded
  // lazily for whoever gets selected; a customer with none is remembered as
  // loaded (empty) so they are not re-fetched on every selection change.
  const [priceOverrides, setPriceOverrides] = useState<
    ReadonlyMap<string, Record<string, number>>
  >(() => new Map());
  useEffect(() => {
    const missing = selectedArray.filter((id) => !priceOverrides.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void getCustomerProductPricesBatchAction(missing).then((rows) => {
      if (cancelled) return;
      const grouped = groupOverridesByCustomer(rows);
      setPriceOverrides((prev) => {
        const next = new Map(prev);
        for (const id of missing) next.set(id, grouped.get(id) ?? {});
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedArray, priceOverrides]);

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
    if (!feeValid) {
      toast.error("Teslimat ücreti geçerli bir tutar olmalı (ör. 50,00).");
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
      setMissing([]);

      const payload = {
        scheduled_for: batch.scheduledFor,
        time_slot: batch.defaults.timeSlot,
        payment_method: batch.defaults.paymentMethod,
        delivery_fee_minor: effectiveFeeMinor,
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
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={feeEnabled}
              onCheckedChange={(checked) => setFeeEnabled(checked === true)}
              disabled={pending}
            />
            Teslimat ücreti
          </label>
          <Input
            value={feeText}
            onChange={(e) => setFeeText(e.target.value)}
            inputMode="decimal"
            disabled={!feeEnabled || pending}
            aria-label="Teslimat ücreti tutarı (₺)"
            aria-invalid={!feeValid}
            className="h-8 w-24 text-right"
          />
          <span className="text-muted-foreground">₺</span>
          <span className="text-xs text-muted-foreground">
            Yalnızca elden teslim (Malatya içi) siparişlere eklenir; kargoya eklenmez. Boş = ücret yok.
            {!feeValid ? <span className="ml-1 text-destructive">Geçerli tutar girin (ör. 50,00).</span> : null}
          </span>
        </div>
      </div>

      {/* Body: left customer list | right basket panel */}
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-md border p-2">
          <CustomerPickList
            batch={batch}
            productsByKey={productsByKey}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            newCustomerSlot={newCustomerSlot}
          />
        </div>
        <div className="overflow-hidden rounded-md border">
          <BasketPanel
            batch={batch}
            products={products}
            selectedIds={selectedArray}
            priceOverrides={priceOverrides}
            deliveryFeeMinor={effectiveFeeMinor}
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
        <Button type="button" onClick={commit} disabled={pending || orderCount === 0 || !feeValid}>
          {pending ? "Oluşturuluyor…" : "Siparişleri Oluştur"}
        </Button>
      </div>
    </div>
  );
}
