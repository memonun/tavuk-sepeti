"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { CheckCircle2Icon, ShoppingBasketIcon } from "lucide-react";

import {
  placeOrderAction,
  type PlaceOrderState,
} from "@/features/storefront/application/place-order";
import { cartSubtotalMinor } from "@/features/storefront/domain/cart";
import {
  DELIVERY_FEE_MINOR,
  PAYMENT_METHOD_OPTIONS,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";

import type { Product } from "@/features/products/application/list-products";

const initialState: PlaceOrderState = { status: "idle" };

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface CheckoutFormProps {
  products: readonly Product[];
  /** Delivery-date bounds, resolved to Europe/Istanbul on the server. */
  minDate: string;
  maxDate: string;
}

export function CheckoutForm({ products, minDate, maxDate }: CheckoutFormProps) {
  const { lines, hydrated, clear } = useCart();
  const [state, formAction, pending] = useActionState(
    placeOrderAction,
    initialState,
  );

  // Empty the basket once the order is placed.
  useEffect(() => {
    if (state.status === "success") clear();
  }, [state.status, clear]);

  if (state.status === "success") {
    return <OrderConfirmation orderNumber={state.orderNumber} />;
  }

  if (!hydrated) {
    return (
      <p className="py-16 text-center text-muted-foreground">Yükleniyor…</p>
    );
  }

  if (lines.length === 0) {
    return <EmptyCart />;
  }

  const rows = lines.flatMap((line) => {
    const product = products.find((p) => p.key === line.product_key);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
  const subtotal = cartSubtotalMinor(
    rows.map((r) => lineTotalMinor(r.product, r.quantity)),
  );
  const total = subtotal + DELIVERY_FEE_MINOR;
  const itemsJson = JSON.stringify(
    lines.map((l) => ({ product_key: l.product_key, quantity: l.quantity })),
  );

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-8">
        <Section title="İletişim">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad" htmlFor="first_name">
              <Input id="first_name" name="first_name" autoComplete="given-name" required disabled={pending} />
            </Field>
            <Field label="Soyad" htmlFor="last_name">
              <Input id="last_name" name="last_name" autoComplete="family-name" required disabled={pending} />
            </Field>
            <Field label="Telefon" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="0532 123 45 67" autoComplete="tel" required disabled={pending} />
            </Field>
            <Field label="E-posta (opsiyonel)" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" disabled={pending} />
            </Field>
          </div>
        </Section>

        <Section title="Teslimat adresi">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İl" htmlFor="city">
              <Input id="city" name="city" autoComplete="address-level1" required disabled={pending} />
            </Field>
            <Field label="İlçe" htmlFor="district">
              <Input id="district" name="district" autoComplete="address-level2" required disabled={pending} />
            </Field>
            <Field label="Mahalle" htmlFor="neighborhood">
              <Input id="neighborhood" name="neighborhood" required disabled={pending} />
            </Field>
            <Field label="Cadde / Sokak" htmlFor="street">
              <Input id="street" name="street" autoComplete="address-line1" disabled={pending} />
            </Field>
            <Field label="Bina no" htmlFor="building_no">
              <Input id="building_no" name="building_no" disabled={pending} />
            </Field>
            <Field label="Daire no" htmlFor="apartment_no">
              <Input id="apartment_no" name="apartment_no" disabled={pending} />
            </Field>
            <Field label="Posta kodu" htmlFor="postal_code">
              <Input id="postal_code" name="postal_code" autoComplete="postal-code" inputMode="numeric" disabled={pending} />
            </Field>
            <Field label="Adres tarifi (opsiyonel)" htmlFor="description">
              <Input id="description" name="description" placeholder="Kapı kodu, kat vb." disabled={pending} />
            </Field>
          </div>
        </Section>

        <Section title="Teslimat zamanı">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teslimat günü" htmlFor="scheduled_for">
              <Input
                id="scheduled_for"
                name="scheduled_for"
                type="date"
                min={minDate}
                max={maxDate}
                defaultValue={minDate}
                required
                disabled={pending}
              />
            </Field>
            <Field label="Zaman aralığı" htmlFor="time_slot">
              <select id="time_slot" name="time_slot" defaultValue="" className={controlClass} disabled={pending}>
                <option value="">Fark etmez</option>
                {TIME_SLOT_OPTIONS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Ödeme">
          <div className="grid gap-2 sm:grid-cols-2">
            {PAYMENT_METHOD_OPTIONS.map((option, index) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-input p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/50"
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={option.value}
                  defaultChecked={index === 0}
                  className="size-4 accent-primary"
                  disabled={pending}
                  required
                />
                {option.label}
              </label>
            ))}
          </div>
          <Field label="Sipariş notu (opsiyonel)" htmlFor="delivery_notes">
            <textarea
              id="delivery_notes"
              name="delivery_notes"
              rows={3}
              maxLength={2000}
              className={cn(controlClass, "h-auto py-2")}
              placeholder="Eklemek istediğiniz bir şey var mı?"
              disabled={pending}
            />
          </Field>
        </Section>
      </div>

      {/* Order summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
          <h2 className="font-display text-lg">Sipariş özeti</h2>
          <ul className="flex flex-col gap-2.5">
            {rows.map(({ product, quantity }) => (
              <li key={product.key} className="flex items-center gap-2.5 text-sm">
                <span className="text-xl" aria-hidden>
                  {productEmoji(product.key)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {product.display_name}
                  <span className="text-muted-foreground">
                    {" "}
                    ×{" "}
                    {quantity.toLocaleString("tr-TR", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatTRY(lineTotalMinor(product, quantity))}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border/60 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ara toplam</span>
              <span className="tabular-nums">{formatTRY(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Teslimat</span>
              <span className="tabular-nums">
                {DELIVERY_FEE_MINOR === 0 ? "Ücretsiz" : formatTRY(DELIVERY_FEE_MINOR)}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
              <span>Toplam</span>
              <span className="tabular-nums">{formatTRY(total)}</span>
            </div>
          </div>

          {state.status === "validation_error" || state.status === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}

          <input type="hidden" name="items_json" value={itemsJson} />
          <Button type="submit" size="lg" className="w-full rounded-full" disabled={pending}>
            {pending ? "Gönderiliyor…" : "Siparişi ver"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Ödeme teslimatta alınır. Online ödeme yok.
          </p>
        </div>
      </aside>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShoppingBasketIcon className="size-10 text-muted-foreground/60" />
      <h2 className="font-display text-xl">Sepetiniz boş</h2>
      <p className="text-sm text-muted-foreground">
        Sipariş vermek için önce sepetinize ürün ekleyin.
      </p>
      <Link href="/magaza" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
        Ürünlere göz at
      </Link>
    </div>
  );
}

function OrderConfirmation({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
      <CheckCircle2Icon className="size-12 text-primary" />
      <h2 className="font-display text-2xl">Siparişiniz alındı!</h2>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-muted-foreground">Sipariş numaranız</p>
        <p className="rounded-full bg-secondary px-4 py-1.5 font-mono text-sm font-semibold tracking-wide">
          {orderNumber}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Siparişinizi hazırlamaya başlıyoruz. Teslimat gününüzde kapıda ödeme ya
        da havale ile ödeyebilirsiniz.
      </p>
      <Link href="/magaza" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
        Alışverişe devam et
      </Link>
    </div>
  );
}
