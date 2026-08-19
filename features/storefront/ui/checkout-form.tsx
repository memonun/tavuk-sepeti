"use client";

/**
 * Checkout. One submit for most people, two only when an account is involved.
 *
 * An account is no longer required to order — the owner's rule became "hesap
 * açmadan sipariş verme de çalışmalı". So there are three shapes here:
 *
 *   guest    — the default. Contact details and the address are typed into THIS
 *              form and go with the order; `place_guest_order` writes the
 *              customer, the address and the order in one transaction. No
 *              session, no second submit.
 *   account  — signed in. Identity comes from the session and the address is
 *              picked from the saved book, so only the order fields are asked.
 *   signup /
 *   signin   — the only case that still needs its own submit FIRST, because a
 *              saved address can only be written by an authenticated customer
 *              (RLS keys address rows off auth.uid()) and the book is read
 *              server-side. Establish the session, re-render, then order.
 *
 * The basket lives in localStorage, so nothing is lost across any of it.
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
  ChevronDownIcon,
  MailCheckIcon,
  MapPinIcon,
  MessageCircleIcon,
  PackageCheckIcon,
  PlusIcon,
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
import {
  BANK_TRANSFER_ACCOUNT_HOLDER,
  BANK_TRANSFER_BANK_NAME,
  BANK_TRANSFER_IBAN,
  BANK_TRANSFER_IBAN_RAW,
  buildBankTransferWhatsAppLink,
} from "@/features/storefront/domain/bank-transfer";
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
import {
  paymentMethodsForChannel,
  type PaymentMethod,
} from "@/features/storefront/domain/payment-options";
import {
  isRouteUpgradeEligible,
  routeBlockReason,
} from "@/features/storefront/domain/route-capability";
import {
  CARGO_FEE_MINOR,
  DELIVERY_FEE_MINOR,
  DELIVERY_PROVINCE,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/shared/utils/money";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { AddressForm, type CollectedAddress } from "@/features/storefront/ui/address-form";
import { AddressPicker } from "@/features/storefront/ui/address-picker";
import { fromPriceMinor, lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";

import type { SavedAddress } from "@/features/storefront/application/list-addresses";
import type { Product } from "@/features/products/application/list-products";

const initialState: PlaceOrderState = { status: "idle" };
const initialAccountState: CheckoutAccountState = { status: "idle" };

/**
 * What an anonymous visitor is doing at checkout.
 *
 *   guest  — order without an account (the default; no friction until the order)
 *   signup — create one first, then come back to the order form
 *   signin — already has one
 *
 * Only the last two need a submit of their own, because the order form reads the
 * address book server-side and therefore needs the session to already exist.
 */
type CheckoutMode = "guest" | "signup" | "signin";

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
  /** Eve servis (delivery-channel) order floor in kuruş (0 = none). */
  homeMinOrderMinor: number;
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
  homeMinOrderMinor,
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
  // Which account tab is showing is normally the customer's pick, but a server
  // answer of `email_taken` overrides it — expecting them to spot the "Zaten
  // hesabım var" pill themselves is what produced the repeated-signup loop (and,
  // before the server-side fix, a "başka bir hesapta kayıtlı" error on a
  // first-ever account). Each new answer clears the previous pick so the
  // override actually lands. Adjusting state during render is React's documented
  // pattern here; an effect would cascade an extra render.
  const [pickedMode, setPickedMode] = useState<CheckoutMode | null>(null);
  const [seenAccountState, setSeenAccountState] = useState(accountState);
  if (seenAccountState !== accountState) {
    setSeenAccountState(accountState);
    setPickedMode(null);
  }
  // Guest is the default: the owner's rule is "no friction until the order", and
  // forcing a decision about accounts at the top of checkout is what the flow
  // used to do. An `email_taken` answer still overrides, since at that point the
  // customer demonstrably has an account.
  const accountMode: CheckoutMode =
    pickedMode ?? (accountState.status === "email_taken" ? "signin" : "guest");
  /** Guest address: collected in-form, submitted WITH the order (there is no
   *  address book to save it to before one exists). */
  const [guestAddress, setGuestAddress] = useState<CollectedAddress | null>(null);
  // "Adresi düzenle" reopens the form pre-filled from `guestAddress` (see
  // below) rather than discarding it — nulling it out here is what used to
  // wipe every field, plus the map pin and its confirmation, back to blank.
  const [editingGuestAddress, setEditingGuestAddress] = useState(false);
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  // Tracked so the havale/EFT IBAN box can appear the moment that option is
  // picked, without waiting for a submit. Empty until the customer (or the
  // radio's own defaultChecked) picks one — see `selectedPaymentMethod` below,
  // which falls back to the first offered option so the box still matches
  // what's actually pre-selected on first render.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [distanceSalesAccepted, setDistanceSalesAccepted] = useState(false);

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

  const items = useMemo(
    () =>
      rows.map((r) => ({
        product_key: r.product.key,
        fulfillment_type: r.product.fulfillment_type,
      })),
    [rows],
  );

  // `mode` picks the address FORM and stays cart-only — a flexible-only
  // basket (kayısı, kuru dut…) still opens the looser cargo-shaped form,
  // same as always. `channel` is address-aware: once an address is selected,
  // a route-capable one (Malatya, confirmed pin, door detail — see
  // isRouteUpgradeEligible) upgrades a flexible-only basket to delivery, the
  // same "ride along in the van" treatment a mixed basket already gets.
  // `placeOrderAction` re-derives both the same way on the RE-PRICED items.
  const mode = requiredAddressMode(items);

  /**
   * The address we preselect on the customer's behalf.
   *
   * Two bugs used to live here. It was seeded once at mount, so a customer who
   * signed in INSIDE checkout kept `null` even after `router.refresh()` brought
   * their address book in — the picker showed their addresses with none selected
   * and the submit button stayed locked. And it only looked at `is_primary`,
   * while the picker disables on `routeBlockReason` — so a primary address with
   * no pin came up "selected", enabled the submit button, and the order was then
   * refused by the server. Deriving it from props fixes the first; filtering on
   * the same predicate the picker uses fixes the second.
   */
  const preferredAddressId = useMemo(() => {
    const usable = addresses.filter(
      (address) => mode === "cargo" || routeBlockReason(address) === null,
    );
    return usable.find((a) => a.is_primary)?.id ?? usable[0]?.id ?? null;
  }, [addresses, mode]);

  // An explicit pick wins until the underlying list changes (a new address was
  // saved, or the basket flipped channel), at which point the derived choice
  // takes over again. Same render-phase adjustment as the account tab above.
  const [seenPreferredId, setSeenPreferredId] = useState(preferredAddressId);
  if (seenPreferredId !== preferredAddressId) {
    setSeenPreferredId(preferredAddressId);
    setPickedAddressId(null);
  }
  const addressId = pickedAddressId ?? preferredAddressId;

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;
  const addressRouteCapable = selectedAddress
    ? isRouteUpgradeEligible(selectedAddress)
    : false;
  const channel = resolveOrderChannel(items, addressRouteCapable);

  if (state.status === "success") {
    return (
      <OrderConfirmation
        orderNumber={state.orderNumber}
        paymentMethod={state.paymentMethod}
        totalMinor={state.totalMinor}
        hasAccount={identity !== null}
        hasEmail={state.hasEmail}
      />
    );
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

  // Keyed on `channel`, not `mode`: an address-upgraded flexible-only basket
  // is a real delivery order even though it opened the cargo-shaped form.
  const feeMinor = channel === "delivery" ? DELIVERY_FEE_MINOR : CARGO_FEE_MINOR;
  const subtotal = cartSubtotalMinor(
    rows.map((r) => lineTotalMinor(r.product, r.quantity)),
  );
  const total = subtotal + feeMinor;
  const minOrderMinor = channel === "delivery" ? homeMinOrderMinor : cargoMinOrderMinor;
  const minimum = checkOrderMinimum(subtotal, minOrderMinor);
  const noDeliveryDay = channel === "delivery" && deliveryDates.length === 0;

  const summary = (
    <OrderSummary
      rows={rows}
      mode={mode}
      subtotal={subtotal}
      feeMinor={feeMinor}
      total={total}
      products={products}
    />
  );

  // ---- Creating an account / signing in --------------------------------------
  // Only these two need a submit of their own: a session must EXIST before the
  // order form can bind to it (the address book is read server-side). A guest
  // needs no session, so the guest flow stays on the single order submit below.
  if (!identity && accountMode !== "guest") {
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
              onModeChange={setPickedMode}
              disabled={accountPending}
              values={
                accountState.status === "error"
                  ? accountState.values
                  : accountState.status === "email_taken"
                    ? { email: accountState.email }
                    : undefined
              }
            />
            <input type="hidden" name="account_mode" value={accountMode} />

            {accountState.status === "email_taken" ? (
              <p className="text-sm" role="alert">
                Bu e-posta ile bir hesabınız zaten var — şifrenizi girip devam
                edin.{" "}
                <Link
                  href="/sifremi-unuttum"
                  className="underline underline-offset-2"
                >
                  Şifrenizi mi unuttunuz?
                </Link>
              </p>
            ) : null}

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
  // The radios default to the first offered option (matching the old
  // `defaultChecked={index === 0}`) until the customer actually picks one.
  const selectedPaymentMethod = paymentMethod || paymentOptions[0]?.value;
  // An account picks a saved address; a guest has to have finished the inline
  // address form. Either way the order cannot go without one.
  const hasAddress = identity ? addressId !== null : guestAddress !== null;
  const canSubmit =
    !pending && hasAddress && minimum.ok && !noDeliveryDay && distanceSalesAccepted;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-8">
        <Section title="1. İletişim">
          {identity ? (
            <>
              <p className="rounded-xl bg-secondary/50 px-3 py-2.5 text-sm">
                Merhaba{" "}
                <strong className="font-medium">
                  {identity.first_name || identity.email}
                </strong>{" "}
                — siparişiniz bu hesaba kaydedilecek.
              </p>
              <input type="hidden" name="account_mode" value="existing" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                <span>
                  Daha önce sipariş verdiyseniz bir hesabınız olabilir — giriş
                  yaparsanız bu sipariş de hesabınıza kaydedilir.
                </span>
                <button
                  type="button"
                  onClick={() => setPickedMode("signin")}
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" }),
                    "shrink-0 rounded-full",
                  )}
                >
                  Giriş yap
                </button>
              </div>
              <p className="rounded-xl bg-secondary/50 px-3 py-2.5 text-sm text-muted-foreground">
                Üye olmadan da sipariş verebilirsiniz. Siparişinizi daha sonra
                numarası ve telefonunuzla{" "}
                <Link
                  href="/siparis-sorgula"
                  className="underline underline-offset-2"
                  target="_blank"
                >
                  sorgulayabilirsiniz
                </Link>
                .{" "}
                <button
                  type="button"
                  onClick={() => setPickedMode("signup")}
                  className="underline underline-offset-2"
                >
                  Hesap oluşturun
                </button>
              </p>
              <GuestBlock disabled={pending} />
              <input type="hidden" name="account_mode" value="guest" />
            </>
          )}
        </Section>

        <Section title="2. Teslimat adresi">
          <p className="mb-1 flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            {mode === "route" ? (
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <TruckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            )}
            <span>
              {mode === "route" ? (
                <strong className="font-bold text-foreground">
                  {`Sepetinizde ${DELIVERY_PROVINCE} içi teslim edilen ürün bulunuyor. Siparişiniz kendi ekibimizle adresinize ulaştırılacaktır. Konumunuzu haritadan seçerek devam edin.`}
                </strong>
              ) : (
                // Genuinely undecided until an address exists: this basket
                // ships nationwide by default, but a route-capable Malatya
                // address (below) upgrades it to hand-delivery instead —
                // stated as a possibility here, not a settled fact.
                "Siparişiniz Türkiye'nin her yerine kargo ile gönderilebilir. Teslimat adresinizi seçerek devam edin."
              )}
            </span>
          </p>

          {identity ? (
            <>
              <AddressPicker
                addresses={addresses}
                mode={mode}
                mapsKey={mapsKey}
                selectedId={addressId}
                onSelect={setPickedAddressId}
                onChanged={() => router.refresh()}
                disabled={pending}
              />
              <input type="hidden" name="address_id" value={addressId ?? ""} />
            </>
          ) : guestAddress && !editingGuestAddress ? (
            // Collected, not saved: a guest has no address book, so the fields
            // ride along with the order submit as hidden inputs.
            <GuestAddressSummary
              address={guestAddress}
              onEdit={() => setEditingGuestAddress(true)}
            />
          ) : (
            <AddressForm
              mode={mode}
              mapsKey={mapsKey}
              // Re-editing pre-fills from what was already collected — fields,
              // pin and its confirmation all carry over instead of resetting.
              {...(guestAddress ? { initial: guestAddress } : {})}
              onSaved={() => undefined}
              onCollect={(address) => {
                setGuestAddress(address);
                setEditingGuestAddress(false);
              }}
              {...(guestAddress
                ? { onCancel: () => setEditingGuestAddress(false) }
                : {})}
            />
          )}
          <input type="hidden" name="address_mode" value={mode} />
        </Section>

        {/* channel, not mode: a flexible-only basket that an address upgrade
            turned into a delivery order genuinely needs a van day too, even
            though it went through the cargo-shaped address form. Gating this
            on `mode` would let the customer submit with no scheduled_for at
            all, which placeOrderAction then rejects. */}
        {channel === "delivery" ? (
          <Section title="3. Teslimat zamanı">
            <p className="flex items-start gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                {DELIVERY_PROVINCE} içi teslimat günlerimiz{" "}
                <strong>{deliveryDaysLabel}</strong>. Size uygun günü seçin.
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
                    defaultValue={TIME_SLOT_OPTIONS[0].value}
                    className={controlClass}
                    disabled={pending}
                  >
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
                Siparişiniz onaylandıktan sonra özenle hazırlanarak kargoya
                teslim edilir.
              </span>
            </p>
            {/* channel, not a hardcoded cargo assumption: once an address
                makes this basket route-capable, the applicable floor (and
                its wording) is the eve-servis one, not the cargo one, even
                though this section still opened the cargo-shaped form. */}
            {minOrderMinor > 0 ? (
              <p className="text-xs text-muted-foreground">
                {orderMinimumNotice(channel, minOrderMinor)}
              </p>
            ) : null}
          </Section>
        )}

        <Section title="4. Ödeme">
          <div className="grid gap-2 sm:grid-cols-2">
            {paymentOptions.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-input p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/50"
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={option.value}
                  checked={selectedPaymentMethod === option.value}
                  onChange={() => setPaymentMethod(option.value)}
                  className="size-4 accent-primary"
                  disabled={pending}
                  required
                />
                {option.label}
              </label>
            ))}
          </div>
          {/* Say WHY the door-payment option is missing, rather than leaving a
              customer hunting for it. Keyed on `channel`, not `mode`: once an
              address upgrades a flexible-only basket to delivery, kapıda
              ödeme is genuinely offered above, and this note would otherwise
              contradict it. */}
          {channel === "shipping" ? (
            <p className="text-xs text-muted-foreground">
              Kapıda nakit ödeme yalnızca eve servis siparişlerinde geçerlidir.
            </p>
          ) : null}
          {selectedPaymentMethod === "bank_transfer" ? (
            <BankTransferDetails />
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
            {/* Held back until an address is actually known (selected, or
                just entered) — the cargo floor is a property of THAT
                address's channel, not of the basket in isolation, and
                nagging about it before checkout even asks for one reads as
                premature. A returning customer with a usable saved address
                still sees it on first render, since `addressId` is derived
                from the address list rather than waiting for a click. A
                guest has no `addressId` at all (there is no book to pick
                from) — `hasAddress` is the one flag both shapes set once an
                address is actually known, so it's what has to gate this. */}
            {hasAddress && !minimum.ok ? (
              <p
                className="rounded-lg bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                role="alert"
              >
                {orderMinimumMessage(channel, minOrderMinor, minimum.shortfallMinor)}
              </p>
            ) : null}

            {/* A dead session is not a form error. Without a way back the
                customer was left clicking an enabled button under a greeting
                bearing their own name, getting the same sentence every time.
                `next` returns them here with the basket still in localStorage. */}
            {state.status === "session_expired" ? (
              <div
                className="flex flex-col gap-2 rounded-xl bg-destructive/5 px-3 py-2.5"
                role="alert"
              >
                <p className="text-sm text-destructive">{state.message}</p>
                <Link
                  href="/giris?next=%2Fodeme"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "self-start rounded-full",
                  )}
                >
                  Giriş yap ve siparişe dön
                </Link>
              </div>
            ) : null}

            {state.status === "validation_error" || state.status === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {state.message}
              </p>
            ) : null}

            {/* Submit exactly what the customer was shown. This used to
                serialize the raw `lines`, which include products the catalog no
                longer sells — invisible in the summary and in the totals, but
                still POSTed, so the order died on "Ürün bulunamadı: <key>" for a
                row that could not be seen or deleted. `rows` is the same
                catalog-resolved list the summary and the price are built from. */}
            <input
              type="hidden"
              name="items_json"
              value={JSON.stringify(
                rows.map((r) => ({
                  product_key: r.product.key,
                  quantity: r.quantity,
                })),
              )}
            />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-input p-3 text-xs has-checked:border-primary has-checked:bg-secondary/50">
              <input
                type="checkbox"
                name="distance_sales_accepted"
                checked={distanceSalesAccepted}
                onChange={(event) => setDistanceSalesAccepted(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
                required
                disabled={pending}
              />
              <span>
                <Link
                  href="/on-bilgilendirme-formu"
                  className="underline underline-offset-2"
                  target="_blank"
                >
                  Ön Bilgilendirme Formu&apos;nu
                </Link>{" "}
                ve{" "}
                <Link
                  href="/mesafeli-satis-sozlesmesi"
                  className="underline underline-offset-2"
                  target="_blank"
                >
                  Mesafeli Satış Sözleşmesi&apos;ni
                </Link>{" "}
                okudum, bilgilendirildim ve siparişimi bu koşullarla oluşturmayı
                kabul ediyorum.
              </span>
            </label>
            <Button
              type="submit"
              size="lg"
              className="w-full rounded-full"
              disabled={!canSubmit}
            >
              {pending ? "Gönderiliyor…" : "Ödeme yükümlülüğüyle siparişi ver"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Kişisel verilerinizin işlenmesine ilişkin bilgi için{" "}
              <Link
                href="/kvkk"
                className="underline underline-offset-2"
                target="_blank"
              >
                KVKK Aydınlatma Metni&apos;ni
              </Link>{" "}
              inceleyebilirsiniz.
            </p>

            {!hasAddress ? (
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
 *  they are paying for, including during account creation. Fully editable —
 *  each line has the same QuantityStepper the cart sheet and shop listing
 *  use (stepping below the minimum removes the line), and a "Ürün ekle"
 *  disclosure lets a customer add another product without leaving checkout
 *  and losing whatever they've already filled in below (address, payment
 *  method). Mutates the same localStorage-backed useCart() store every other
 *  add/remove surface in the app already writes to — no parallel cart path,
 *  no server round-trip; the next render re-prices/re-derives the channel
 *  from the updated basket automatically (see `rows`/`items` above). */
function OrderSummary({
  rows,
  mode,
  subtotal,
  feeMinor,
  total,
  products,
}: {
  rows: ReadonlyArray<{ product: Product; quantity: number }>;
  mode: "route" | "cargo";
  subtotal: number;
  feeMinor: number;
  total: number;
  products: readonly Product[];
}) {
  const { addItem } = useCart();
  const [showAddPicker, setShowAddPicker] = useState(false);
  const cartKeys = useMemo(() => new Set(rows.map((r) => r.product.key)), [rows]);
  const addableProducts = products.filter((p) => !cartKeys.has(p.key));

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg">Sipariş özeti</h2>
      <ul className="flex flex-col gap-3">
        {rows.map(({ product, quantity }) => (
          <li key={product.key} className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-2xl">
              <span aria-hidden>{productEmoji(product.key)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {product.display_name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatTRY(lineTotalMinor(product, quantity))}
              </p>
            </div>
            <QuantityStepper product={product} />
          </li>
        ))}
      </ul>

      {addableProducts.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit gap-1.5 text-primary hover:text-primary"
            onClick={() => setShowAddPicker((v) => !v)}
          >
            <PlusIcon className="size-4" />
            Ürün ekle
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                showAddPicker && "rotate-180",
              )}
            />
          </Button>
          {showAddPicker ? (
            <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-secondary/30 p-2">
              {addableProducts.map((product) => (
                <li
                  key={product.key}
                  className="flex items-center gap-2.5 rounded-xl p-1.5"
                >
                  <span className="text-lg" aria-hidden>
                    {productEmoji(product.key)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {product.display_name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatTRY(fromPriceMinor(product))}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => addItem(product.key, product.min_qty)}
                  >
                    Ekle
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
        {mode === "route" ? (
          <strong className="font-bold text-foreground">
            {`Yumurta ve süt ürünleri yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir. Kargoya uygun ürünler Türkiye geneline gönderilir.`}
          </strong>
        ) : (
          "Türkiye geneli ücretsiz kargo"
        )}
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
  values,
}: {
  mode: "signup" | "signin";
  onModeChange: (mode: CheckoutMode) => void;
  disabled: boolean;
  /**
   * What to put back after a failed submit. React 19 resets an uncontrolled form
   * once its action resolves, restoring each input to its `defaultValue` — so
   * feeding the echoed values back in through `defaultValue` is what stops every
   * error from wiping six fields. The password is never echoed.
   */
  values?:
    | {
        email?: string | undefined;
        first_name?: string | undefined;
        last_name?: string | undefined;
        phone?: string | undefined;
      }
    | undefined;
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
        {/* The way back out. Without it, a customer who tapped "hesap oluştur"
            to see what it involved was stuck in the account flow. */}
        <button
          type="button"
          onClick={() => onModeChange("guest")}
          className="rounded-full bg-secondary px-3 py-1.5 transition-colors"
          disabled={disabled}
        >
          Üye olmadan devam et
        </button>
      </div>

      {mode === "signup" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad" htmlFor="first_name">
            <Input id="first_name" name="first_name" autoComplete="given-name" required disabled={disabled} defaultValue={values?.first_name} />
          </Field>
          <Field label="Soyad" htmlFor="last_name">
            <Input id="last_name" name="last_name" autoComplete="family-name" required disabled={disabled} defaultValue={values?.last_name} />
          </Field>
          {/* Required, not optional: a stop the driver can't phone is a delivery
              that fails at the door, and it's the field the CRM keys on. */}
          <Field label="Telefon" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              disabled={disabled}
              defaultValue={values?.phone}
            />
          </Field>
          <Field label="E-posta" htmlFor="account_email">
            <Input id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} defaultValue={values?.email} />
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
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-posta" htmlFor="account_email">
            <Input id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} defaultValue={values?.email} />
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

/**
 * Contact details for an order with no account behind it.
 *
 * Same field names as the signup block minus the password, so switching between
 * "üye olmadan devam et" and "hesap oluştur" does not throw away what the
 * customer already typed. E-mail is required here even though no account is
 * created: it carries the order number they will need to find the order again,
 * and PayTR will not take a card payment without one.
 */
function GuestBlock({ disabled }: { disabled: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ad" htmlFor="first_name">
        <Input id="first_name" name="first_name" autoComplete="given-name" required disabled={disabled} />
      </Field>
      <Field label="Soyad" htmlFor="last_name">
        <Input id="last_name" name="last_name" autoComplete="family-name" required disabled={disabled} />
      </Field>
      <Field label="Telefon" htmlFor="phone">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          disabled={disabled}
        />
      </Field>
      <Field label="E-posta (opsiyonel)" htmlFor="account_email">
        <Input
          id="account_email"
          name="account_email"
          type="email"
          autoComplete="email"
          disabled={disabled}
        />
      </Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Girerseniz sipariş onayını bu adrese göndeririz. Kartla ödemek için
        e-posta zorunludur — girmezseniz siparişinizi numarası ve
        telefonunuzla sorgulayabilirsiniz.
      </p>
    </div>
  );
}

/**
 * The guest's collected address, plus the hidden inputs that carry it into the
 * order submit. The `addr_` prefix matches `readGuestAddressInput` on the server
 * and keeps these from colliding with the contact block's own field names.
 */
function GuestAddressSummary({
  address,
  onEdit,
}: {
  address: CollectedAddress;
  onEdit: () => void;
}) {
  const hidden: ReadonlyArray<readonly [string, string]> = [
    ["label", address.label],
    ["city", address.city],
    ["district", address.district],
    ["neighborhood", address.neighborhood],
    ["street", address.street],
    ["building_no", address.building_no],
    ["apartment_no", address.apartment_no],
    ["postal_code", address.postal_code],
    ["description", address.description],
    ["lat", String(address.lat)],
    ["lng", String(address.lng)],
    ["source", address.source],
    ["accuracy", address.accuracy],
  ];

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary bg-secondary/50 p-3 text-sm">
      <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {[address.neighborhood, address.street, address.building_no]
            .filter(Boolean)
            .join(" ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {[address.district, address.city].filter(Boolean).join(" / ")}
          {address.apartment_no ? ` · Daire ${address.apartment_no}` : ""}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Adresi düzenle
      </Button>
      {hidden.map(([name, value]) => (
        <input key={name} type="hidden" name={`addr_${name}`} value={value} />
      ))}
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
/**
 * Post-signup holding screen.
 *
 * The recovery button is the important part. Customers routinely open the
 * confirmation mail on their PHONE while checking out on a laptop, so this tab
 * never receives the session cookie and stays here. Before, their only move was
 * to submit the signup form again — and a second signup for a now-confirmed
 * address is exactly what Supabase answers with an obfuscated user, which used
 * to surface as "bu e-posta başka bir hesapta kayıtlı" on a first-time account.
 *
 * A refresh re-runs the server component, which reads the (possibly now
 * present) session and renders the address step instead.
 */
function VerifyEmail({ email }: { email: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm">
      <MailCheckIcon className="size-12 text-primary" />
      <h2 className="font-display text-2xl">E-postanızı doğrulayın</h2>
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">{email}</strong> adresine
        bir doğrulama bağlantısı gönderdik. Sepetiniz duruyor — bağlantıya
        tıkladıktan sonra buradan devam edebilirsiniz.
      </p>
      <Button
        type="button"
        size="lg"
        className="rounded-full"
        disabled={checking}
        onClick={() => {
          setChecking(true);
          router.refresh();
          // The refresh is a server round-trip; re-enable so a customer who
          // clicked too early can try again instead of staring at a dead button.
          window.setTimeout(() => setChecking(false), 2000);
        }}
      >
        {checking ? "Kontrol ediliyor…" : "E-postamı doğruladım — devam et"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Bağlantı gelmediyse spam klasörünü kontrol edin.
      </p>
    </div>
  );
}

function OrderConfirmation({
  orderNumber,
  paymentMethod,
  totalMinor,
  /** False for a guest: there is no /hesap to send them to, so the order number
   *  they are looking at right now is their only handle on this order. */
  hasAccount,
  /** False when a guest left the (optional) e-mail field blank — no
   *  confirmation mail went out, so the wording below can't reference one. */
  hasEmail,
}: {
  orderNumber: string;
  paymentMethod: PaymentMethod;
  totalMinor: number;
  hasAccount: boolean;
  hasEmail: boolean;
}) {
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
        Siparişinizi hazırlamaya başlıyoruz. Durumunu istediğiniz zaman{" "}
        {hasAccount
          ? "hesabınızdan takip edebilirsiniz."
          : `sipariş numaranız ve telefonunuzla sorgulayabilirsiniz${
              hasEmail ? " — numarayı onay e-postanıza da gönderdik." : "."
            }`}
      </p>

      {!hasAccount ? (
        <p className="rounded-xl bg-secondary/50 px-3 py-2.5 text-sm text-muted-foreground">
          Bir hesap açarsanız bir sonraki siparişinizi ve bu siparişi tek
          yerden, &quot;Hesabım&quot; sayfasından takip edebilirsiniz.{" "}
          <Link href="/kayit" className="underline underline-offset-2">
            Hesap oluşturun
          </Link>
        </p>
      ) : null}

      {paymentMethod === "bank_transfer" ? (
        <BankTransferDetails
          orderNumber={orderNumber}
          totalMinor={totalMinor}
          className="w-full text-left"
        />
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
          Alışverişe devam et
        </Link>
        <Link
          href={hasAccount ? "/hesap" : "/siparis-sorgula"}
          className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-full")}
        >
          {hasAccount ? "Siparişlerim" : "Siparişimi sorgula"}
        </Link>
      </div>
    </div>
  );
}

/**
 * The IBAN block. Two callers, two shapes:
 *
 *   - during checkout (no `orderNumber` yet) — informational, so the customer
 *     knows what havale involves before committing to it.
 *   - on the confirmation screen (`orderNumber` present) — actionable: adds
 *     the pre-filled WhatsApp link, since that's the entire "send us the
 *     receipt" flow Faz 1 has (SPEC.md §1.3 — no payment gateway for havale).
 */
function BankTransferDetails({
  orderNumber,
  totalMinor,
  className,
}: {
  orderNumber?: string;
  totalMinor?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-input bg-secondary/40 p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">IBAN</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{BANK_TRANSFER_IBAN}</span>
          <CopyButton value={BANK_TRANSFER_IBAN_RAW} label="Kopyala" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Hesap sahibi</span>
        <span>{BANK_TRANSFER_ACCOUNT_HOLDER}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Banka</span>
        <span>{BANK_TRANSFER_BANK_NAME}</span>
      </div>
      {orderNumber ? (
        <>
          <p className="text-xs text-muted-foreground">
            Açıklamaya sipariş numaranızı yazın:{" "}
            <span className="font-mono font-medium text-foreground">{orderNumber}</span>
          </p>
          <a
            href={buildBankTransferWhatsAppLink(orderNumber, totalMinor)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-1 w-fit gap-1.5 rounded-full",
            )}
          >
            <MessageCircleIcon className="size-4" />
            Dekontu WhatsApp&apos;tan gönderin
          </a>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Siparişi tamamladıktan sonra dekontu WhatsApp&apos;tan gönderebilirsiniz.
        </p>
      )}
    </div>
  );
}
