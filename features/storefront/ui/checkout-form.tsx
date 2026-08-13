"use client";

/**
 * Checkout — two steps, and only because the first one is unavoidable.
 *
 * The owner's rule is still "hesap zorunlu olsun ama sipariş anına kadar
 * friction koyma": a visitor browses and fills the basket anonymously, and only
 * meets the account here. What changed is that the account now has its OWN
 * submit button.
 *
 * Why it has to: a delivery address can only be saved by an authenticated
 * customer (RLS keys the address rows off auth.uid()), and an order binds to a
 * saved `address_id`. With account creation buried inside the single "Siparişi
 * ver" submit — which stayed disabled until an address was selected — an
 * anonymous visitor could fill every field and nothing would happen. That is
 * exactly the reported bug ("hesap oluştur gibi bir buton yok, ilerlemiyor" /
 * "üye girişi yapmadan adres seçimi çalışmıyor"). So: step 1 establishes the
 * session, the page re-renders, step 2 is the ordinary one-submit checkout. The
 * basket lives in localStorage, so nothing is lost in between.
 *
 * The basket also decides what the rest of the form asks for:
 *
 *   route (any fresh line) — a route-grade address with a confirmed pin, a day
 *     the van actually drives ("eve servis günleri", owner-editable), a time
 *     slot, and kapıda nakit ödeme as an option.
 *   cargo (all-shipping)  — a written address anywhere in Türkiye, NO
 *     preparation-day question at all, free shipping, a 1.000 ₺ order floor and
 *     prepaid methods only.
 *
 * Everything here is a hint. The action re-derives the channel from re-priced
 * items, re-checks the delivery day, the order floor, the payment method and
 * that the address belongs to the account; the RPC checks the service area
 * again inside the transaction.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  MailCheckIcon,
  MapPinIcon,
  PackageCheckIcon,
  ShoppingBasketIcon,
  TruckIcon,
} from "lucide-react";

import {
  createCheckoutAccountAction,
  type CheckoutAccountState,
} from "@/features/storefront/application/create-checkout-account";
import {
  placeOrderAction,
  type PlaceOrderState,
} from "@/features/storefront/application/place-order";
import { cartSubtotalMinor } from "@/features/storefront/domain/cart";
import { formatDeliveryDateLabel } from "@/features/storefront/domain/delivery-window";
import {
  requiredAddressMode,
  resolveOrderChannel,
} from "@/features/storefront/domain/fulfillment-channel";
import {
  checkOrderMinimum,
  orderMinimumMessage,
  orderMinimumNotice,
} from "@/features/storefront/domain/order-minimum";
import { paymentMethodsForChannel } from "@/features/storefront/domain/payment-options";
import {
  CARGO_FEE_MINOR,
  CARGO_FREE_SHIPPING_NOTICE,
  DELIVERY_FEE_MINOR,
  DELIVERY_PROVINCE,
  FULFILLMENT_NOTICE,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { AddressPicker } from "@/features/storefront/ui/address-picker";
import { lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";

import type { SavedAddress } from "@/features/storefront/application/list-addresses";
import type { Product } from "@/features/products/application/list-products";

const initialState: PlaceOrderState = { status: "idle" };
const initialAccountState: CheckoutAccountState = { status: "idle" };

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface CheckoutIdentityDefaults {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

interface CheckoutFormProps {
  products: readonly Product[];
  addresses: readonly SavedAddress[];
  /** Null when nobody is signed in — the account step renders instead. */
  identity: CheckoutIdentityDefaults | null;
  /** Selectable delivery days (ISO), already filtered to the owner's
   *  "eve servis günleri" and the scheduling horizon. */
  deliveryDates: readonly string[];
  /** "Çarşamba ve Cumartesi" — printed so the rule is visible, not implied. */
  deliveryDaysLabel: string;
  /** Cargo order floor in kuruş (0 = none). */
  cargoMinOrderMinor: number;
  paytrEnabled: boolean;
  mapsKey: string | undefined;
}

export function CheckoutForm({
  products,
  addresses,
  identity,
  deliveryDates,
  deliveryDaysLabel,
  cargoMinOrderMinor,
  paytrEnabled,
  mapsKey,
}: CheckoutFormProps) {
  const router = useRouter();
  const { lines, hydrated, clear } = useCart();
  const [state, formAction, pending] = useActionState(
    placeOrderAction,
    initialState,
  );
  const [accountState, accountAction, accountPending] = useActionState(
    createCheckoutAccountAction,
    initialAccountState,
  );
  const [accountMode, setAccountMode] = useState<"signup" | "signin">("signup");
  const [addressId, setAddressId] = useState<string | null>(
    addresses.find((a) => a.is_primary)?.id ?? addresses[0]?.id ?? null,
  );

  // Empty the basket on inline success; for the card path, hand off to PayTR
  // (the basket is cleared on the success return page after payment).
  useEffect(() => {
    if (state.status === "success") clear();
    else if (state.status === "redirect") window.location.href = state.url;
  }, [state, clear]);

  // The session now exists, but `identity` and the saved addresses are read on
  // the server — so the page has to be re-rendered before the address step can
  // appear. The basket is in localStorage and survives the refresh.
  useEffect(() => {
    if (accountState.status === "success") router.refresh();
  }, [accountState, router]);

  const rows = useMemo(
    () =>
      lines.flatMap((line) => {
        const product = products.find((p) => p.key === line.product_key);
        return product ? [{ product, quantity: line.quantity }] : [];
      }),
    [lines, products],
  );

  // What the basket is. `mode` picks the address form, `channel` is the same
  // decision in the server's vocabulary — both mirror the action's re-derivation.
  const { mode, channel } = useMemo(() => {
    const items = rows.map((r) => ({
      product_key: r.product.key,
      fulfillment_type: r.product.fulfillment_type,
    }));
    return {
      mode: requiredAddressMode(items),
      channel: resolveOrderChannel(items),
    };
  }, [rows]);

  if (state.status === "success") {
    return <OrderConfirmation orderNumber={state.orderNumber} />;
  }

  if (state.status === "verify_email") {
    return <VerifyEmail email={state.email} />;
  }
  if (accountState.status === "verify_email") {
    return <VerifyEmail email={accountState.email} />;
  }

  if (!hydrated) {
    return <p className="py-16 text-center text-muted-foreground">Yükleniyor…</p>;
  }

  if (lines.length === 0) {
    return <EmptyCart />;
  }

  const feeMinor = mode === "route" ? DELIVERY_FEE_MINOR : CARGO_FEE_MINOR;
  const subtotal = cartSubtotalMinor(
    rows.map((r) => lineTotalMinor(r.product, r.quantity)),
  );
  const total = subtotal + feeMinor;
  const minimum = checkOrderMinimum(channel, subtotal, cargoMinOrderMinor);
  const noDeliveryDay = mode === "route" && deliveryDates.length === 0;

  const summary = (
    <OrderSummary
      rows={rows}
      mode={mode}
      subtotal={subtotal}
      feeMinor={feeMinor}
      total={total}
    />
  );

  // ---- Step 1: the account ---------------------------------------------------
  // Its own <form> and its own submit — see the file header for why this cannot
  // ride along on the order submit.
  if (!identity) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <form action={accountAction} className="flex flex-col gap-8">
          <Section title="1. Hesap">
            <p className="rounded-xl bg-secondary/50 px-3 py-2.5 text-sm text-muted-foreground">
              Siparişinizi tamamlamak için önce hesabınızı oluşturun ya da giriş
              yapın. Sepetiniz kaybolmaz — bir sonraki adımda adresinizi girip
              siparişi tamamlayacaksınız.
            </p>
            <AccountBlock
              mode={accountMode}
              onModeChange={setAccountMode}
              disabled={accountPending}
            />
            <input type="hidden" name="account_mode" value={accountMode} />

            {accountState.status === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {accountState.message}
              </p>
            ) : null}

            <div>
              <Button
                type="submit"
                size="lg"
                className="rounded-full"
                disabled={accountPending}
              >
                {accountPending
                  ? "Gönderiliyor…"
                  : accountMode === "signup"
                    ? "Hesabımı oluştur ve devam et"
                    : "Giriş yap ve devam et"}
              </Button>
            </div>
          </Section>

          {/* The steps that follow, so the account block doesn't read like the
              whole checkout. */}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Sonraki adımlar</p>
            <p>2. Teslimat adresi</p>
            <p>{mode === "route" ? "3. Teslimat zamanı" : "3. Gönderim"}</p>
            <p>4. Ödeme yöntemi</p>
          </div>
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start">{summary}</aside>
      </div>
    );
  }

  // ---- Step 2: the order -----------------------------------------------------
  const paymentOptions = paymentMethodsForChannel(channel).filter(
    (option) => option.value !== "credit_card" || paytrEnabled,
  );
  const canSubmit =
    !pending && addressId !== null && minimum.ok && !noDeliveryDay;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-8">
        <Section title="1. Hesap">
          <p className="rounded-xl bg-secondary/50 px-3 py-2.5 text-sm">
            Merhaba{" "}
            <strong className="font-medium">
              {identity.first_name || identity.email}
            </strong>{" "}
            — siparişiniz bu hesaba kaydedilecek.
          </p>
          <input type="hidden" name="account_mode" value="existing" />
        </Section>

        <Section title="2. Teslimat adresi">
          <p className="mb-1 flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            {mode === "route" ? (
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <TruckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            )}
            <span>
              {mode === "route"
                ? `Sepetinizde taze ürün var — bu sipariş ${DELIVERY_PROVINCE} içinde kendi ekibimizle elden teslim edilir. Haritada konumunuzu onaylamanız gerekiyor.`
                : `Sepetinizdeki ürünlerin tamamı kargoyla gönderilir — Türkiye'nin her yerine teslimat yapılır. ${CARGO_FREE_SHIPPING_NOTICE}`}
            </span>
          </p>

          <AddressPicker
            addresses={addresses}
            mode={mode}
            mapsKey={mapsKey}
            selectedId={addressId}
            onSelect={setAddressId}
            onChanged={() => router.refresh()}
            disabled={pending}
          />
          <input type="hidden" name="address_id" value={addressId ?? ""} />
          <input type="hidden" name="address_mode" value={mode} />
        </Section>

        {mode === "route" ? (
          <Section title="3. Teslimat zamanı">
            <p className="flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                Eve servis günlerimiz: <strong>{deliveryDaysLabel}</strong>.
                Aşağıdaki günlerden birini seçin.
              </span>
            </p>

            {noDeliveryDay ? (
              <p
                className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                Şu anda planlanabilir bir eve servis günü yok. Lütfen daha sonra
                tekrar deneyin veya bizimle iletişime geçin.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* A <select> of real delivery days, not a free date input: the
                    van does not drive every day, and a date the route never
                    visits is a promise we cannot keep. */}
                <Field label="Teslimat günü" htmlFor="scheduled_for">
                  <select
                    id="scheduled_for"
                    name="scheduled_for"
                    defaultValue={deliveryDates[0]}
                    className={controlClass}
                    required
                    disabled={pending}
                  >
                    {deliveryDates.map((date) => (
                      <option key={date} value={date}>
                        {formatDeliveryDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Zaman aralığı" htmlFor="time_slot">
                  <select
                    id="time_slot"
                    name="time_slot"
                    defaultValue=""
                    className={controlClass}
                    disabled={pending}
                  >
                    <option value="">Fark etmez</option>
                    {TIME_SLOT_OPTIONS.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </Section>
        ) : (
          /* Cargo: no preparation-day question at all (owner decision). There is
             no van to schedule and no window to promise — the parcel goes out
             as soon as it is ready. */
          <Section title="3. Gönderim">
            <p className="flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
              <PackageCheckIcon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                Siparişiniz onaylandıktan sonra hazırlanıp kargoya verilir.{" "}
                <strong className="font-medium text-foreground">
                  {CARGO_FREE_SHIPPING_NOTICE}
                </strong>
              </span>
            </p>
            {cargoMinOrderMinor > 0 ? (
              <p className="text-xs text-muted-foreground">
                {orderMinimumNotice(cargoMinOrderMinor)}
              </p>
            ) : null}
          </Section>
        )}

        <Section title="4. Ödeme">
          <div className="grid gap-2 sm:grid-cols-2">
            {paymentOptions.map((option, index) => (
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
          {/* Say WHY the door-payment option is missing, rather than leaving a
              customer hunting for it. */}
          {mode === "cargo" ? (
            <p className="text-xs text-muted-foreground">
              Kapıda nakit ödeme yalnızca eve servis siparişlerinde geçerlidir.
            </p>
          ) : null}
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

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-4">
          {summary}

          <div className="flex flex-col gap-2 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
            {!minimum.ok ? (
              <p
                className="rounded-lg bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                role="alert"
              >
                {orderMinimumMessage(cargoMinOrderMinor, minimum.shortfallMinor)}
              </p>
            ) : null}

            {state.status === "validation_error" || state.status === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {state.message}
              </p>
            ) : null}

            <input
              type="hidden"
              name="items_json"
              value={JSON.stringify(
                lines.map((l) => ({
                  product_key: l.product_key,
                  quantity: l.quantity,
                })),
              )}
            />
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-full"
              disabled={!canSubmit}
            >
              {pending ? "Gönderiliyor…" : "Siparişi ver"}
            </Button>

            {addressId === null ? (
              <p className="text-center text-xs text-muted-foreground">
                Devam etmek için bir teslimat adresi seçin.
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                {paytrEnabled
                  ? "Kart seçilirse güvenli ödeme sayfasına (PayTR) yönlendirilirsiniz."
                  : mode === "route"
                    ? "Ödeme teslimatta veya havale ile alınır."
                    : "Ödeme havale ile alınır."}
              </p>
            )}
          </div>
        </div>
      </aside>
    </form>
  );
}

/** Basket recap + totals. Shared by both steps so the customer always sees what
 *  they are paying for, including during account creation. */
function OrderSummary({
  rows,
  mode,
  subtotal,
  feeMinor,
  total,
}: {
  rows: ReadonlyArray<{ product: Product; quantity: number }>;
  mode: "route" | "cargo";
  subtotal: number;
  feeMinor: number;
  total: number;
}) {
  return (
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
          <span className="text-muted-foreground">
            {mode === "route" ? "Teslimat" : "Kargo"}
          </span>
          <span className="tabular-nums">
            {feeMinor === 0 ? "Ücretsiz" : formatTRY(feeMinor)}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
          <span>Toplam</span>
          <span className="tabular-nums">{formatTRY(total)}</span>
        </div>
      </div>

      <p className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-center text-xs text-muted-foreground">
        {mode === "route" ? FULFILLMENT_NOTICE : CARGO_FREE_SHIPPING_NOTICE}
      </p>
    </div>
  );
}

/**
 * Inline account creation / sign-in. Rendered in place rather than as a
 * redirect, because bouncing someone with a full basket to /giris is exactly
 * the friction the owner asked us not to add.
 */
function AccountBlock({
  mode,
  onModeChange,
  disabled,
}: {
  mode: "signup" | "signin";
  onModeChange: (mode: "signup" | "signin") => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => onModeChange("signup")}
          className={cn(
            "rounded-full px-3 py-1.5 transition-colors",
            mode === "signup" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
          disabled={disabled}
        >
          Hesap oluştur
        </button>
        <button
          type="button"
          onClick={() => onModeChange("signin")}
          className={cn(
            "rounded-full px-3 py-1.5 transition-colors",
            mode === "signin" ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
          disabled={disabled}
        >
          Zaten hesabım var
        </button>
      </div>

      {mode === "signup" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad" htmlFor="first_name">
            <Input id="first_name" name="first_name" autoComplete="given-name" required disabled={disabled} />
          </Field>
          <Field label="Soyad" htmlFor="last_name">
            <Input id="last_name" name="last_name" autoComplete="family-name" required disabled={disabled} />
          </Field>
          {/* Required, not optional: a stop the driver can't phone is a delivery
              that fails at the door, and it's the field the CRM keys on. */}
          <Field label="Telefon" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="0532 123 45 67"
              autoComplete="tel"
              required
              disabled={disabled}
            />
          </Field>
          <Field label="E-posta" htmlFor="account_email">
            <Input id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} />
          </Field>
          <Field label="Şifre (en az 8 karakter)" htmlFor="account_password">
            <Input
              id="account_password"
              name="account_password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={disabled}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 self-end rounded-xl border border-input p-3 text-xs has-checked:border-primary has-checked:bg-secondary/50">
            <input
              type="checkbox"
              name="kvkk_accepted"
              className="mt-0.5 size-4 accent-primary"
              required
              disabled={disabled}
            />
            <span>
              <Link href="/kvkk" className="underline underline-offset-2" target="_blank">
                KVKK Aydınlatma Metni
              </Link>{" "}
              ve{" "}
              <Link
                href="/mesafeli-satis-sozlesmesi"
                className="underline underline-offset-2"
                target="_blank"
              >
                Mesafeli Satış Sözleşmesi
              </Link>
              &apos;ni okudum, onaylıyorum.
            </span>
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-posta" htmlFor="account_email">
            <Input id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} />
          </Field>
          <Field label="Şifre" htmlFor="account_password">
            <Input
              id="account_password"
              name="account_password"
              type="password"
              autoComplete="current-password"
              required
              disabled={disabled}
            />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Şifrenizi mi unuttunuz?{" "}
            <Link href="/sifremi-unuttum" className="underline underline-offset-2">
              Sıfırlayın
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
        Ürünlere göz at
      </Link>
    </div>
  );
}

/** Supabase is configured to require e-mail confirmation, so the account exists
 *  but has no session yet and the order cannot be written. The basket is
 *  deliberately NOT cleared — the customer confirms and comes straight back. */
function VerifyEmail({ email }: { email: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
      <MailCheckIcon className="size-12 text-primary" />
      <h2 className="font-display text-2xl">E-postanızı doğrulayın</h2>
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">{email}</strong> adresine
        bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra bu
        sayfaya dönün — sepetiniz duruyor, siparişinizi tek tıkla
        tamamlayabilirsiniz.
      </p>
      <Link href="/odeme" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
        Siparişe dön
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
        Siparişinizi hazırlamaya başlıyoruz. Durumunu istediğiniz zaman
        hesabınızdan takip edebilirsiniz.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
          Alışverişe devam et
        </Link>
        <Link
          href="/hesap"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-full")}
        >
          Siparişlerim
        </Link>
      </div>
    </div>
  );
}
