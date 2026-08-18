"use client";

/**
 * Customer self-service "request a recurring order" form. Submitting creates
 * an INACTIVE template (see recurring-order-request.ts) — staff still
 * approves it, so this form never claims the subscription is live yet.
 *
 * Day choices are limited to the live eve-servis days (home_delivery_days),
 * passed in from the server page — the same live rule checkout uses, not a
 * hardcoded list. No Aylık (monthly) option: a day-of-month target has no
 * relationship to which weekdays the van drives.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createRecurringOrderRequestAction } from "@/features/storefront/application/recurring-order-request";
import { WEEKDAY_NAMES_TR, WEEKDAYS_TR_ORDER } from "@/features/storefront/domain/delivery-window";
import { paymentMethodsForChannel } from "@/features/storefront/domain/payment-options";
import { RecurringOrderItemsPicker } from "@/features/storefront/ui/recurring-order-items-picker";

import type { Product } from "@/features/products/application/list-products";
import type { RecurringRequestInput } from "@/features/storefront/domain/recurring-request.schema";

type Item = RecurringRequestInput["items"][number];

interface RecurringOrderFormProps {
  readonly products: readonly Product[];
  readonly homeDeliveryDays: readonly number[];
}

// Both channels are offered here — the server re-derives the actual channel
// from the basket + address and rejects an incompatible choice with a clear
// message, same as checkout. credit_card is filtered out even though
// paymentMethodsForChannel offers it for one-time orders: an unattended
// future charge can't do interactive 3D Secure, so recurring templates never
// allow it (enforced again server-side and by a DB CHECK constraint).
const RECURRING_ALLOWED_METHODS = new Set(["cash_on_delivery", "bank_transfer"]);
const PAYMENT_OPTIONS = [
  ...paymentMethodsForChannel("delivery"),
  ...paymentMethodsForChannel("shipping"),
]
  .filter((option) => RECURRING_ALLOWED_METHODS.has(option.value))
  .filter(
    (option, index, all) => all.findIndex((o) => o.value === option.value) === index,
  );

export function RecurringOrderForm({ products, homeDeliveryDays }: RecurringOrderFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [cadence, setCadence] = useState<"weekly" | "biweekly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(homeDeliveryDays[0] ?? null);
  const [paymentMethod, setPaymentMethod] = useState<string>(
    PAYMENT_OPTIONS[0]?.value ?? "cash_on_delivery",
  );
  const [items, setItems] = useState<Item[]>([]);
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);

  const orderedDays = WEEKDAYS_TR_ORDER.filter((d) => homeDeliveryDays.includes(d));

  const handleSubmit = () => {
    setFormError(null);
    setItemsError(undefined);

    if (items.length === 0) {
      setItemsError("En az bir ürün gerekli.");
      return;
    }
    if (dayOfWeek == null) {
      setFormError("Teslimat günü seçin.");
      return;
    }

    startTransition(async () => {
      const result = await createRecurringOrderRequestAction({
        cadence,
        day_of_week: dayOfWeek,
        items,
        payment_method: paymentMethod,
      });

      if (result.status === "success") {
        toast.success("Talebiniz alındı. Ekibimiz inceleyip onayladığında aboneliğiniz aktif olacak.");
        setItems([]);
        router.refresh();
        return;
      }
      if (result.status !== "idle") {
        setFormError(result.message);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <p className="text-sm font-semibold text-foreground">Yeni talep oluştur</p>
      <p className="mt-1 mb-5 text-xs text-muted-foreground">
        Talebiniz ekibimiz onayladıktan sonra aktif olur.
      </p>

      <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-900">
          Eve teslimat hizmeti, 250 ₺ ve üzeri tutardaki siparişler için geçerlidir.
        </p>
      </div>

      <div className="space-y-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cadence">Sıklık</Label>
          <select
            id="cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as "weekly" | "biweekly")}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="weekly">Haftalık</option>
            <option value="biweekly">İki haftada bir</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Teslimat günü</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Teslimat günü">
            {orderedDays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(d)}
                aria-pressed={dayOfWeek === d}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  dayOfWeek === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-muted",
                ].join(" ")}
              >
                {WEEKDAY_NAMES_TR[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment_method">Ödeme yöntemi</Label>
          <select
            id="payment_method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {PAYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Ürünler</Label>
          <RecurringOrderItemsPicker
            products={products}
            items={items}
            onChange={setItems}
            error={itemsError}
          />
        </div>

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full rounded-full"
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending ? "Gönderiliyor…" : "Talep gönder"}
        </Button>
      </div>
    </div>
  );
}
