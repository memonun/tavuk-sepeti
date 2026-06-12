"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createOrderAction,
  type CreateOrderActionState,
} from "@/features/orders/application/create-order";
import { getCustomerProductPricesAction } from "@/features/customers/application/customer-price-actions";
import { priceOrderLine } from "@/features/products/application/pricing";
import { CustomerTypeahead } from "@/features/orders/ui/customer-typeahead";
import {
  ProductPicker,
  type OrderItemDraft,
} from "@/features/orders/ui/product-picker";
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
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { Product } from "@/features/products/application/list-products";
import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";

interface OrderFormProps {
  products: Product[];
  /** YYYY-MM-DD in Europe/Istanbul (today). Default scheduled_for value. */
  defaultScheduledFor: string;
}

export function OrderForm({ products, defaultScheduledFor }: OrderFormProps) {
  const router = useRouter();
  const [submitting, startSubmitting] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [customer, setCustomer] = useState<CustomerSearchHit | null>(null);
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({});
  const [items, setItems] = useState<OrderItemDraft[]>([]);

  const handleCustomerChange = (c: CustomerSearchHit | null) => {
    setCustomer(c);
    setCustomerPrices({});
    if (c) void getCustomerProductPricesAction(c.id).then(setCustomerPrices);
  };
  const [scheduledFor, setScheduledFor] = useState(defaultScheduledFor);
  const [timeSlot, setTimeSlot] = useState<string>("none");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveryFeeText, setDeliveryFeeText] = useState("0,00");

  const productByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  const subtotalMinor = items.reduce((acc, i) => {
    const p = productByKey.get(i.product_key);
    if (!p) return acc;
    return (
      acc +
      priceOrderLine(i.quantity, {
        tiers: p.price_tiers,
        basePriceMinor: p.current_unit_price_minor,
        overrideUnitPriceMinor: i.unit_price_minor,
      }).line_total_minor
    );
  }, 0);

  const deliveryFeeMinor = parseTRYInput(deliveryFeeText) ?? 0;
  const totalMinor = subtotalMinor + deliveryFeeMinor;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    if (!customer) {
      setSubmitError("Müşteri seç.");
      return;
    }
    if (items.length === 0) {
      setSubmitError("En az bir ürün ekle.");
      return;
    }

    const formData = new FormData();
    formData.set("customer_id", customer.id);
    formData.set("scheduled_for", scheduledFor);
    formData.set("time_slot", timeSlot === "none" ? "" : timeSlot);
    formData.set("payment_method", paymentMethod);
    formData.set("delivery_notes", deliveryNotes);
    formData.set("delivery_fee_minor", String(deliveryFeeMinor));
    formData.set("items_json", JSON.stringify(items));

    const initial: CreateOrderActionState = { status: "idle" };
    startSubmitting(async () => {
      const result = await createOrderAction(initial, formData);
      switch (result.status) {
        case "success":
          router.push(`/orders/${result.orderId}`);
          router.refresh();
          return;
        case "validation_error":
          setFieldErrors(result.fieldErrors);
          setSubmitError("Form alanlarını kontrol et.");
          return;
        case "error":
          setSubmitError(result.message);
          return;
        case "idle":
          return;
      }
    });
  };

  const itemsError = fieldErrors.items?.[0];
  const customerError = fieldErrors.customer_id?.[0];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-2">
        <Label>Müşteri</Label>
        <CustomerTypeahead
          onChange={handleCustomerChange}
          {...(customerError !== undefined ? { error: customerError } : {})}
        />
        {customer ? (
          <a
            href={`/customers/${customer.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            → Müşteri kartı
          </a>
        ) : null}
      </section>

      <section className="space-y-2">
        <Label>Ürünler</Label>
        <ProductPicker
          products={products}
          items={items}
          onChange={setItems}
          customerPrices={customerPrices}
          {...(itemsError !== undefined ? { error: itemsError } : {})}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scheduled_for">Teslim tarihi</Label>
          <Input
            id="scheduled_for"
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Zaman dilimi</Label>
          <Select value={timeSlot} onValueChange={(v) => v && setTimeSlot(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Belirsiz</SelectItem>
              <SelectItem value="morning">Sabah</SelectItem>
              <SelectItem value="afternoon">Öğleden sonra</SelectItem>
              <SelectItem value="evening">Akşam</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Ödeme</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => v && setPaymentMethod(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash_on_delivery">Kapıda nakit</SelectItem>
              <SelectItem value="bank_transfer">Havale / EFT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delivery_fee">Teslimat ücreti (₺)</Label>
          <Input
            id="delivery_fee"
            inputMode="decimal"
            value={deliveryFeeText}
            onChange={(e) => setDeliveryFeeText(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delivery_notes">Teslimat notu</Label>
          <Input
            id="delivery_notes"
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="Kapı kodu vb."
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted-foreground">Ara toplam</dt>
          <dd className="text-right font-mono">{formatTRY(subtotalMinor)}</dd>
          <dt className="text-muted-foreground">Teslimat</dt>
          <dd className="text-right font-mono">{formatTRY(deliveryFeeMinor)}</dd>
          <dt className="font-medium">Toplam</dt>
          <dd className="text-right font-mono font-semibold">
            {formatTRY(totalMinor)}
          </dd>
        </dl>
      </section>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          İptal
        </Button>
        <Button
          type="submit"
          disabled={submitting || !customer || items.length === 0}
        >
          {submitting ? "Oluşturuluyor…" : "Sipariş Oluştur"}
        </Button>
      </div>
    </form>
  );
}
