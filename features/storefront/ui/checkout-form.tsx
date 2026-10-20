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
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  checkGuestAddressAction,
  type GuestAddressCheck,
} from "@/features/storefront/application/check-guest-address";
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
import { listCheckoutMissing } from "@/features/storefront/domain/checkout-missing";
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
  CARGO_FREE_SHIPPING_NOTICE,
  deliveryFeeNotice,
  DELIVERY_PROVINCE,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import {
  buildWhatsAppLink,
  SUPPORT_WHATSAPP_E164,
} from "@/features/storefront/domain/support-contact";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";
import { formatTRY } from "@/shared/utils/money";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import { useCart } from "@/features/storefront/ui/cart-provider";
import {
  opaqueKey,
  trackOrderPurchased,
  trackPaymentInfoAdded,
  trackProductAddedToCart,
  trackShippingInfoAdded,
} from "@/features/storefront/ui/meta-events";
import { trackCompleteRegistration } from "@/shared/analytics/meta-pixel";
import { AddressForm, type CollectedAddress } from "@/features/storefront/ui/address-form";
import { AddressPicker } from "@/features/storefront/ui/address-picker";
import { hapticTick } from "@/features/storefront/ui/kit/haptic";
import { ShopButton, ShopLinkButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput, shopFieldClass } from "@/features/storefront/ui/kit/shop-field";
import { ShopNotice } from "@/features/storefront/ui/kit/shop-notice";
import { fromPriceMinor, lineTotalMinor } from "@/features/storefront/ui/line-pricing";
import { productEmoji } from "@/features/storefront/ui/product-emoji";
import { QuantityStepper } from "@/features/storefront/ui/quantity-stepper";
import { useCheckoutDraft } from "@/features/storefront/ui/use-checkout-draft";

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

const controlClass = shopFieldClass;

/** A whole-row tap target wrapping a radio or checkbox: 56px tall, and the
 *  chosen one is marked by a thicker green edge AND a tint, not colour alone. */
const choiceCardClass =
  "shop-press-soft flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-(--shop-field-border) bg-card px-4 py-3 text-lg font-semibold text-foreground data-[checked]:border-primary data-[checked]:bg-(--shop-green-soft)";
/** The shared radio/checkbox are 16px (admin density); 28px here. */
const radioClass =
  "size-7 border-2 border-(--shop-field-border) data-[checked]:border-primary [&_svg]:size-3.5";
const checkboxClass =
  "mt-0.5 size-7 rounded-md border-2 border-(--shop-field-border) [&_svg]:size-5";

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
  /** Live eve-servis fee from storefront_settings (display only — place-order
   *  re-reads it server-side). */
  homeDeliveryFeeMinor: number;
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
  homeDeliveryFeeMinor,
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
  // Everything the customer types (guest contact block, delivery note, payment
  // method, the guest's collected address) mirrored to sessionStorage, so a
  // failed submit, a payment-method switch or the PayTR round-trip no longer
  // blanks the form. See use-checkout-draft.
  const { draft, patch, clearDraft } = useCheckoutDraft();
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
   *  address book to save it to before one exists). Held in the persisted draft
   *  so it survives an error / the PayTR return like every other typed field. */
  const guestAddress = draft.guestAddress;
  // The address form hands the guest's address up LIVE as it is typed — there
  // is no "Bu adresi kullan" button any more (owner decision 2026-10-20). While
  // it is incomplete, `guestAddressMissing` names what is still empty so the
  // submit area can say exactly that. Not persisted: the form recomputes it
  // from the restored draft on mount.
  const [guestAddressMissing, setGuestAddressMissing] = useState<readonly string[]>([]);
  const collectGuestAddress = useCallback(
    (address: CollectedAddress | null, missing: readonly string[]) => {
      patch({ guestAddress: address });
      setGuestAddressMissing(missing);
    },
    [patch],
  );
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  // Tracked so the havale/EFT IBAN box can appear the moment that option is
  // picked, without waiting for a submit. Empty until the customer picks one —
  // see `selectedPaymentMethod` below, which falls back to the first offered
  // option so the box still matches what's actually pre-selected on first
  // render. Lives in the persisted draft so the choice outlives an error.
  const paymentMethod = draft.paymentMethod;
  const [distanceSalesAccepted, setDistanceSalesAccepted] = useState(false);

  // Empty the basket AND the saved draft on inline success; for the card path,
  // hand off to PayTR and keep both (the customer may bounce back from a failed
  // payment) — the success return page clears them once the payment books.
  useEffect(() => {
    if (state.status === "success") {
      // Kapıda ödeme / havale: the order is committed the moment it is placed,
      // so this IS the sale (owner decision 2026-10-12). Card orders report
      // from the return page instead, once PayTR's callback has booked them.
      trackOrderPurchased({
        orderNumber: state.orderNumber,
        totalMinor: state.totalMinor,
        items: state.items,
      });
      clear();
      clearDraft();
    } else if (state.status === "redirect") {
      window.location.href = state.url;
    }
  }, [state, clear, clearDraft]);

  // The session now exists, but `identity` and the saved addresses are read on
  // the server — so the page has to be re-rendered before the address step can
  // appear. The basket is in localStorage and survives the refresh.
  useEffect(() => {
    if (accountState.status === "success") router.refresh();
  }, [accountState, router]);

  // Meta Pixel CompleteRegistration. The tab the customer submitted from is
  // remembered at submit time: a new answer resets the visible tab (see
  // `pickedMode` above), so by the time the answer lands it no longer says
  // whether this was a signup.
  const accountSubmitMode = useRef<CheckoutMode | null>(null);
  useEffect(() => {
    const created = accountState.status === "success" || accountState.status === "verify_email";
    if (created && accountSubmitMode.current === "signup") {
      trackCompleteRegistration({ where: "odeme" });
    }
    if (accountState.status !== "idle") accountSubmitMode.current = null;
  }, [accountState]);

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

  // A guest's typed address is checked by the server once it is collected:
  // whether it lets a flexible-only basket ride the van hinges on a PostGIS
  // service-area answer the browser cannot compute, and an account's saved
  // address already carries it as `geo_verified`. Keyed on the address and the
  // form shape, so an edit (or a basket that flips shape) asks again and a
  // stale answer is never read for the new address.
  const guestCheckKey =
    !identity && guestAddress ? JSON.stringify([mode, guestAddress]) : null;
  const [guestCheck, setGuestCheck] = useState<{
    key: string;
    result: GuestAddressCheck;
  } | null>(null);
  useEffect(() => {
    if (!guestCheckKey || !guestAddress) return;
    let live = true;
    // Debounced: the address now arrives on every keystroke once complete (an
    // "Adres tarifi" being typed, say), and one check per pause is enough.
    const timer = setTimeout(() => {
      checkGuestAddressAction(mode, guestAddress).then(
        (result) => {
          if (live) setGuestCheck({ key: guestCheckKey, result });
        },
        // Network failure: fall back to the cart-only channel rather than
        // stranding the customer. The submit re-derives the channel and says
        // what is missing if the address turns out to upgrade after all.
        () => {
          if (live) {
            setGuestCheck({ key: guestCheckKey, result: { status: "ok", routeUpgrade: false } });
          }
        },
      );
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [guestCheckKey, guestAddress, mode]);
  const guestCheckResult =
    guestCheck && guestCheck.key === guestCheckKey ? guestCheck.result : null;
  const guestChecking = guestCheckKey !== null && guestCheckResult === null;

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;
  const addressRouteCapable = identity
    ? selectedAddress
      ? isRouteUpgradeEligible(selectedAddress)
      : false
    : guestCheckResult?.status === "ok" && guestCheckResult.routeUpgrade;
  const channel = resolveOrderChannel(items, addressRouteCapable);

  // Meta Pixel AddShippingInfo: a delivery address is in place on the order
  // step — a saved one picked (or preselected) by an account, or a guest's
  // collected one. Deduped per address per basket inside the tracker; the key
  // only distinguishes addresses, nothing about them is sent.
  const onOrderStep = state.status !== "success" && (identity !== null || accountMode === "guest");
  useEffect(() => {
    if (!onOrderStep || rows.length === 0) return;
    const addressKey = identity
      ? addressId
        ? `a:${addressId}`
        : null
      : guestAddress && guestCheckResult?.status === "ok"
        ? `g:${opaqueKey(JSON.stringify(guestAddress))}`
        : null;
    if (addressKey) trackShippingInfoAdded(rows, channel, addressKey);
  }, [onOrderStep, identity, addressId, guestAddress, guestCheckResult, rows, channel]);

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
    return <p className="py-16 text-center text-lg text-muted-foreground">Yükleniyor…</p>;
  }

  if (lines.length === 0) {
    return <EmptyCart />;
  }

  // Keyed on `channel`, not `mode`: an address-upgraded flexible-only basket
  // is a real delivery order even though it opened the cargo-shaped form.
  const feeMinor = channel === "delivery" ? homeDeliveryFeeMinor : CARGO_FEE_MINOR;
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
      channel={channel}
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
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_24rem]">
        <form
          action={accountAction}
          onSubmit={() => {
            accountSubmitMode.current = accountMode;
          }}
          className="flex flex-col gap-8"
        >
          <Section title="1. Hesap">
            <ShopNotice>
              Siparişinizi tamamlamak için önce hesabınızı oluşturun ya da giriş
              yapın. Sepetiniz kaybolmaz. Bir sonraki adımda adresinizi girip
              siparişi tamamlayacaksınız.
            </ShopNotice>
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
              <ShopNotice tone="warning" role="alert">
                Bu e-posta ile bir hesabınız zaten var. Şifrenizi girip devam
                edin.{" "}
                <Link
                  href="/sifremi-unuttum"
                  className="font-bold underline underline-offset-4"
                >
                  Şifrenizi mi unuttunuz?
                </Link>
              </ShopNotice>
            ) : null}

            {accountState.status === "error" ? (
              <ShopNotice tone="danger" role="alert">
                {accountState.message}
              </ShopNotice>
            ) : null}

            <ShopButton type="submit" size="lg" block disabled={accountPending}>
              {accountPending
                ? "Gönderiliyor…"
                : accountMode === "signup"
                  ? "Hesabımı oluştur ve devam et"
                  : "Giriş yap ve devam et"}
            </ShopButton>
          </Section>

          {/* The steps that follow, so the account block doesn't read like the
              whole checkout. */}
          <div className="flex flex-col gap-1.5 text-base text-muted-foreground">
            <p className="font-bold text-foreground">Sonraki adımlar</p>
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
  // `defaultChecked={index === 0}`) until the customer actually picks one. A
  // value restored from the draft is only honoured if it's still on offer —
  // a persisted "kapıda nakit" is meaningless once the basket turned cargo.
  const selectedPaymentMethod =
    paymentMethod && paymentOptions.some((o) => o.value === paymentMethod)
      ? paymentMethod
      : paymentOptions[0]?.value;
  // An account picks a saved address; a guest has to have finished the inline
  // address form, and the server must have accepted it (see guestCheck above).
  // Either way the order cannot go without one.
  const hasAddress = identity
    ? addressId !== null
    : guestAddress !== null && guestCheckResult?.status === "ok";
  const canSubmit =
    !pending && hasAddress && minimum.ok && !noDeliveryDay && distanceSalesAccepted;
  // Display only: EVERYTHING still standing between the customer and the
  // order, each named, in the order they meet it on the page (see
  // checkout-missing.ts). The contact lines do not lock the button — those
  // inputs carry their own `required`, and a browser autofill that skipped the
  // change event must not strand a filled-in form — but they are listed, so a
  // refused submit is never a mystery.
  const missingLines = listCheckoutMissing({
    contact: identity
      ? null
      : {
          firstName: draft.firstName,
          lastName: draft.lastName,
          phone: draft.phone,
          email: draft.email,
          emailRequired: selectedPaymentMethod === "credit_card",
        },
    address: identity
      ? { kind: "account", selected: addressId !== null }
      : {
          kind: "guest",
          complete: guestAddress !== null,
          missing: guestAddressMissing,
          invalidMessage:
            guestCheckResult?.status === "invalid" ? guestCheckResult.message : null,
        },
    distanceSalesAccepted,
  });

  return (
    // grid-cols-1: without an explicit base track, the implicit single-column
    // grid track sizes to its content's min-content width (`auto`) instead of
    // clamping to the container — a form field slightly wider than its
    // column pushed the whole page ~10px past the viewport, which iOS Safari
    // then read back into the fixed bottom nav's width, showing as a black
    // strip down the right edge.
    <form
      action={formAction}
      onSubmit={() => {
        // Meta Pixel AddPaymentInfo: the order goes in with this method.
        if (selectedPaymentMethod) trackPaymentInfoAdded(rows, selectedPaymentMethod, total);
      }}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_24rem]"
    >
      <div className="flex flex-col gap-8">
        <Section title="1. İletişim">
          {identity ? (
            <>
              <p className="rounded-2xl bg-muted px-4 py-3 text-lg leading-relaxed">
                Merhaba{" "}
                <strong className="font-bold break-all">
                  {identity.first_name || identity.email}
                </strong>
                , siparişiniz bu hesaba kaydedilecek.
              </p>
              <input type="hidden" name="account_mode" value="existing" />
            </>
          ) : (
            <>
              {/* Guest is the default and needs nothing from this box, so it
                  leads with that. The two account routes are real buttons —
                  "Hesap oluşturun" used to be one underlined word inside a
                  paragraph. */}
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted p-4">
                <p className="text-base leading-relaxed">
                  <strong className="font-bold">Üye olmadan sipariş verebilirsiniz.</strong>{" "}
                  Siparişinizi daha sonra numarası ve telefonunuzla{" "}
                  <Link
                    href="/siparis-sorgula"
                    className="font-bold underline underline-offset-4"
                    target="_blank"
                  >
                    sorgulayabilirsiniz
                  </Link>
                  . Hesabınız varsa giriş yapın; sipariş hesabınıza kaydedilir.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ShopButton variant="secondary" onClick={() => setPickedMode("signin")}>
                    Giriş yap
                  </ShopButton>
                  <ShopButton variant="quiet" onClick={() => setPickedMode("signup")}>
                    Hesap oluştur
                  </ShopButton>
                </div>
              </div>
              <GuestBlock
                disabled={pending}
                values={{
                  firstName: draft.firstName,
                  lastName: draft.lastName,
                  phone: draft.phone,
                  email: draft.email,
                }}
                onChange={patch}
                // E-mail is only mandatory for the card path — PayTR won't take
                // a payment without one. Havale/EFT and kapıda nakit don't need
                // it, so it stays optional there.
                emailRequired={selectedPaymentMethod === "credit_card"}
              />
              <input type="hidden" name="account_mode" value="guest" />
            </>
          )}
        </Section>

        <Section title="2. Teslimat adresi">
          <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-base leading-relaxed text-foreground">
            {mode === "route" ? (
              <MapPinIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
            ) : (
              <TruckIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
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
          ) : (
            // A guest's address is never saved here: the form hands it up as it
            // is typed, and the fields ride along with the order submit as
            // hidden inputs.
            <>
              <AddressForm
                mode={mode}
                mapsKey={mapsKey}
                // Read once, at mount: a draft restored after an error or the
                // PayTR return pre-fills fields, pin and its confirmation.
                {...(guestAddress ? { initial: guestAddress } : {})}
                onSaved={() => undefined}
                onCollect={collectGuestAddress}
              />
              {guestAddress ? <GuestAddressInputs address={guestAddress} /> : null}
              {guestCheckResult?.status === "invalid" ? (
                <ShopNotice tone="danger" role="alert">
                  {guestCheckResult.message}
                </ShopNotice>
              ) : null}
            </>
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
            <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-base leading-relaxed text-foreground">
              <MapPinIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              <span>
                {DELIVERY_PROVINCE} içi teslimat günlerimiz{" "}
                <strong>{deliveryDaysLabel}</strong>. Size uygun günü seçin.
              </span>
            </p>

            {noDeliveryDay ? (
              <ShopNotice tone="danger" role="alert">
                Şu anda planlanabilir bir eve servis günü yok. Lütfen daha sonra
                tekrar deneyin veya bizimle iletişime geçin.
              </ShopNotice>
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
            <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-base leading-relaxed text-foreground">
              <PackageCheckIcon
                className="mt-0.5 size-6 shrink-0 text-primary"
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
              <p className="text-base text-muted-foreground">
                {orderMinimumNotice(channel, minOrderMinor)}
              </p>
            ) : null}
          </Section>
        )}

        <Section title="4. Ödeme">
          <RadioGroup
            name="payment_method"
            value={selectedPaymentMethod}
            onValueChange={(value) =>
              patch({ paymentMethod: value as PaymentMethod })
            }
            disabled={pending}
            required
            className="grid gap-3"
          >
            {paymentOptions.map((option) => (
              <label
                key={option.value}
                data-checked={selectedPaymentMethod === option.value || undefined}
                className={choiceCardClass}
              >
                <RadioGroupItem value={option.value} className={radioClass} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
          {/* Say WHY the door-payment option is missing, rather than leaving a
              customer hunting for it. Keyed on `channel`, not `mode`: once an
              address upgrades a flexible-only basket to delivery, kapıda
              ödeme is genuinely offered above, and this note would otherwise
              contradict it. */}
          {channel === "shipping" ? (
            <p className="text-base text-muted-foreground">
              Kapıda nakit ödeme yalnızca eve servis siparişlerinde geçerlidir.
            </p>
          ) : null}
          {selectedPaymentMethod === "bank_transfer" ? (
            <BankTransferDetails className="shop-enter" />
          ) : null}
          <Field label="Sipariş notu (opsiyonel)" htmlFor="delivery_notes">
            <textarea
              id="delivery_notes"
              name="delivery_notes"
              rows={3}
              maxLength={2000}
              className={controlClass}
              placeholder="Eklemek istediğiniz bir şey var mı?"
              disabled={pending}
              value={draft.deliveryNotes}
              onChange={(e) => patch({ deliveryNotes: e.target.value })}
            />
          </Field>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-4">
          {summary}

          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-4 shadow-(--shop-shadow-sm) sm:p-5">
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
              <ShopNotice tone="warning" role="alert">
                {orderMinimumMessage(channel, minOrderMinor, minimum.shortfallMinor)}
              </ShopNotice>
            ) : null}

            {/* A dead session is not a form error. Without a way back the
                customer was left clicking an enabled button under a greeting
                bearing their own name, getting the same sentence every time.
                `next` returns them here with the basket still in localStorage. */}
            {state.status === "session_expired" ? (
              <ShopNotice tone="danger" role="alert">
                <p>{state.message}</p>
                <ShopLinkButton href="/giris?next=%2Fodeme" className="mt-3">
                  Giriş yap ve siparişe dön
                </ShopLinkButton>
              </ShopNotice>
            ) : null}

            {state.status === "validation_error" || state.status === "error" ? (
              <ShopNotice tone="danger" role="alert">
                <p>{state.message}</p>
                {/* Not the customer's input: something on our side failed. Say
                    what to do next instead of leaving them retrying blind. */}
                {state.status === "error" ? (
                  <p className="mt-2">
                    Sorun devam ederse{" "}
                    <a
                      href={buildWhatsAppLink(
                        SUPPORT_WHATSAPP_E164,
                        "Merhaba, sitede siparişimi tamamlayamıyorum.",
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline underline-offset-4"
                    >
                      WhatsApp&apos;tan bize yazın
                    </a>
                    ; siparişinizi birlikte tamamlayalım.
                  </p>
                ) : null}
              </ShopNotice>
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
            <label
              data-checked={distanceSalesAccepted || undefined}
              className={cn(choiceCardClass, "items-start text-base font-normal")}
            >
              <Checkbox
                name="distance_sales_accepted"
                checked={distanceSalesAccepted}
                onCheckedChange={setDistanceSalesAccepted}
                className={checkboxClass}
                required
                disabled={pending}
              />
              <span>
                <Link
                  href="/on-bilgilendirme-formu"
                  className="font-bold underline underline-offset-4"
                  target="_blank"
                >
                  Ön Bilgilendirme Formu&apos;nu
                </Link>{" "}
                ve{" "}
                <Link
                  href="/mesafeli-satis-sozlesmesi"
                  className="font-bold underline underline-offset-4"
                  target="_blank"
                >
                  Mesafeli Satış Sözleşmesi&apos;ni
                </Link>{" "}
                okudum, bilgilendirildim ve siparişimi bu koşullarla oluşturmayı
                kabul ediyorum.
              </span>
            </label>
            <ShopButton type="submit" size="lg" block disabled={!canSubmit}>
              {pending ? "Gönderiliyor…" : "Ödemeyi Tamamla"}
            </ShopButton>
            {/* A greyed-out button with no reason beside it is a dead end, so
                the open step is named right next to it. BELOW, not above: the
                last step is usually ticking the box just over the button, and
                a notice that vanished from between them slid the button up
                under the customer's finger. Down here its going only moves
                the footnotes. */}
            {!pending && (guestChecking || missingLines.length > 0) ? (
              <ShopNotice tone="warning" role="status">
                {missingLines.length > 0 ? (
                  <>
                    <p className="font-bold">Siparişi tamamlamak için:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {missingLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {guestChecking ? <p>Adresiniz kontrol ediliyor…</p> : null}
              </ShopNotice>
            ) : null}

            <p className="text-center text-base text-muted-foreground">
              Kişisel verilerinizin işlenmesine ilişkin bilgi için{" "}
              <Link
                href="/kvkk"
                className="font-bold underline underline-offset-4"
                target="_blank"
              >
                KVKK Aydınlatma Metni&apos;ni
              </Link>{" "}
              inceleyebilirsiniz.
            </p>

            {hasAddress ? (
              <p className="text-center text-base text-muted-foreground">
                {paytrEnabled
                  ? "Kart seçilirse güvenli ödeme sayfasına (PayTR) yönlendirilirsiniz."
                  : mode === "route"
                    ? "Ödeme teslimatta veya havale ile alınır."
                    : "Ödeme havale ile alınır."}
              </p>
            ) : null}
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
  channel,
  subtotal,
  feeMinor,
  total,
  products,
}: {
  rows: ReadonlyArray<{ product: Product; quantity: number }>;
  /** Basket shape — drives the address FORM and the "yalnızca Malatya" note. */
  mode: "route" | "cargo";
  /** Address-aware fulfilment — drives the fee row's label and the free-cargo
   *  note, so a flexible basket upgraded to hand-delivery by a Malatya address
   *  never reads "ücretsiz kargo" while a 50 ₺ fee sits in the total. */
  channel: "delivery" | "shipping";
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
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-4 shadow-(--shop-shadow-sm) sm:p-5">
      <h2 className="font-display text-2xl leading-tight">Sipariş özeti</h2>
      <ul className="flex flex-col gap-4">
        {rows.map(({ product, quantity }) => {
          const imageUrl = productImagePublicUrl(
            product.image_path,
            env.NEXT_PUBLIC_SUPABASE_URL,
          );
          return (
            <li key={product.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={product.image_alt ?? product.display_name}
                      fill
                      sizes="56px"
                      className="object-cover object-center"
                    />
                  ) : (
                    <span className="text-3xl" aria-hidden>
                      {productEmoji(product.key)}
                    </span>
                  )}
                </div>
                {/* Price under the name, not beside it — see cart-sheet.tsx. */}
                <div className="min-w-0 flex-1">
                  <p className="text-lg leading-snug font-bold break-words">
                    {product.display_name}
                  </p>
                  <p className="shop-money text-lg font-bold text-primary">
                    {formatTRY(lineTotalMinor(product, quantity))}
                  </p>
                </div>
              </div>
              <QuantityStepper product={product} block />
            </li>
          );
        })}
      </ul>

      {addableProducts.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <ShopButton
            variant="secondary"
            aria-expanded={showAddPicker}
            onClick={() => setShowAddPicker((v) => !v)}
          >
            <PlusIcon aria-hidden />
            Başka ürün ekle
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "transition-transform duration-200 ease-(--shop-ease-out)",
                showAddPicker && "rotate-180",
              )}
            />
          </ShopButton>
          {showAddPicker ? (
            <ul className="shop-enter flex max-h-80 flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl bg-muted p-2">
              {addableProducts.map((product) => {
                const imageUrl = productImagePublicUrl(
                  product.image_path,
                  env.NEXT_PUBLIC_SUPABASE_URL,
                );
                return (
                  <li
                    key={product.key}
                    className="flex items-center gap-3 rounded-xl bg-card p-2"
                  >
                    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={product.image_alt ?? product.display_name}
                          fill
                          sizes="48px"
                          className="object-cover object-center"
                        />
                      ) : (
                        <span className="text-2xl" aria-hidden>
                          {productEmoji(product.key)}
                        </span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-snug font-bold break-words">
                        {product.display_name}
                      </span>
                      <span className="shop-money block text-base text-muted-foreground">
                        {formatTRY(fromPriceMinor(product))}
                      </span>
                    </span>
                    <ShopButton
                      variant="quiet"
                      onClick={() => {
                        addItem(product.key, product.min_qty);
                        hapticTick();
                        trackProductAddedToCart(product, product.min_qty);
                      }}
                    >
                      Ekle
                    </ShopButton>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-lg">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Ara toplam</dt>
          <dd className="shop-money">{formatTRY(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {channel === "delivery" ? "Teslimat" : "Kargo"}
          </dt>
          <dd className="shop-money">
            {feeMinor === 0 ? "Ücretsiz" : formatTRY(feeMinor)}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3 font-bold">
          <dt className="text-xl">Toplam</dt>
          <dd className="shop-money text-[1.75rem] leading-none font-extrabold">
            {formatTRY(total)}
          </dd>
        </div>
      </dl>

      <p className="rounded-2xl bg-muted px-4 py-3 text-base leading-relaxed text-foreground">
        {mode === "route"
          ? `Yumurta gibi taze ürünler yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir. Kargoya uygun ürünler Türkiye geneline gönderilir.`
          : channel === "delivery"
            ? deliveryFeeNotice(feeMinor)
            : CARGO_FREE_SHIPPING_NOTICE}
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
      <div className="flex flex-wrap gap-2">
        <ShopButton
          variant={mode === "signup" ? "primary" : "quiet"}
          aria-pressed={mode === "signup"}
          onClick={() => onModeChange("signup")}
          disabled={disabled}
        >
          Hesap oluştur
        </ShopButton>
        <ShopButton
          variant={mode === "signin" ? "primary" : "quiet"}
          aria-pressed={mode === "signin"}
          onClick={() => onModeChange("signin")}
          disabled={disabled}
        >
          Zaten hesabım var
        </ShopButton>
        {/* The way back out. Without it, a customer who tapped "hesap oluştur"
            to see what it involved was stuck in the account flow. */}
        <ShopButton
          variant="quiet"
          onClick={() => onModeChange("guest")}
          disabled={disabled}
        >
          Üye olmadan devam et
        </ShopButton>
      </div>

      {mode === "signup" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad" htmlFor="first_name">
            <ShopInput id="first_name" name="first_name" autoComplete="given-name" required disabled={disabled} defaultValue={values?.first_name} />
          </Field>
          <Field label="Soyad" htmlFor="last_name">
            <ShopInput id="last_name" name="last_name" autoComplete="family-name" required disabled={disabled} defaultValue={values?.last_name} />
          </Field>
          {/* Required, not optional: a stop the driver can't phone is a delivery
              that fails at the door, and it's the field the CRM keys on. */}
          <Field label="Telefon" htmlFor="phone">
            <ShopInput
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
            <ShopInput id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} defaultValue={values?.email} />
          </Field>
          <Field label="Şifre (en az 8 karakter)" htmlFor="account_password">
            <ShopInput
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
            <ShopInput id="account_email" name="account_email" type="email" autoComplete="email" required disabled={disabled} defaultValue={values?.email} />
          </Field>
          <Field label="Şifre" htmlFor="account_password">
            <ShopInput
              id="account_password"
              name="account_password"
              type="password"
              autoComplete="current-password"
              required
              disabled={disabled}
            />
          </Field>
          <p className="text-base text-muted-foreground sm:col-span-2">
            Şifrenizi mi unuttunuz?{" "}
            <Link href="/sifremi-unuttum" className="font-bold text-foreground underline underline-offset-4">
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
 * Same fields as the signup block minus the password, so switching between
 * "üye olmadan devam et" and "hesap oluştur" does not throw away what the
 * customer already typed.
 *
 * Controlled (value + onChange), not uncontrolled: React 19 resets an
 * uncontrolled `<form action>` once its action resolves, which is what used to
 * blank all four fields on every failed order. The values live in the persisted
 * checkout draft (see use-checkout-draft), so they also survive a reload and the
 * PayTR round-trip.
 *
 * E-mail is optional except on the card path — PayTR won't take a payment
 * without one — so `emailRequired` is wired to the selected method upstream.
 */
function GuestBlock({
  disabled,
  values,
  onChange,
  emailRequired,
}: {
  disabled: boolean;
  values: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  onChange: (
    patch: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
    }>,
  ) => void;
  emailRequired: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ad" htmlFor="first_name">
        <ShopInput
          id="first_name"
          name="first_name"
          autoComplete="given-name"
          required
          disabled={disabled}
          value={values.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
        />
      </Field>
      <Field label="Soyad" htmlFor="last_name">
        <ShopInput
          id="last_name"
          name="last_name"
          autoComplete="family-name"
          required
          disabled={disabled}
          value={values.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
        />
      </Field>
      <Field label="Telefon" htmlFor="phone">
        <ShopInput
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          disabled={disabled}
          value={values.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      <Field label="E-posta" htmlFor="account_email">
        <ShopInput
          id="account_email"
          name="account_email"
          type="email"
          autoComplete="email"
          required={emailRequired}
          disabled={disabled}
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <p className="text-base text-muted-foreground sm:col-span-2">
        Sipariş onayını e-posta ile göndeririz. E-posta yalnızca kartla ödemede
        zorunludur; havale/EFT ve kapıda nakit ödemede gerekmez.
      </p>
    </div>
  );
}

/**
 * The hidden inputs that carry a guest's collected address into the order
 * submit. The `addr_` prefix matches `readGuestAddressInput` on the server and
 * keeps these from colliding with the contact block's own field names.
 */
function GuestAddressInputs({ address }: { address: CollectedAddress }) {
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
    <>
      {hidden.map(([name, value]) => (
        <input key={name} type="hidden" name={`addr_${name}`} value={value} />
      ))}
    </>
  );
}

/**
 * One numbered step of the checkout. The number is real information here —
 * these are a sequence, and "2. adım" is how the page refers back to them — so
 * it is pulled out of the title ("2. Teslimat adresi") into a badge.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const match = /^(\d+)\.\s*(.+)$/.exec(title);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-3 font-display text-2xl leading-tight text-foreground">
        {match ? (
          <>
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground"
              aria-hidden
            >
              {match[1]}
            </span>
            <span>
              <span className="sr-only">{match[1]}. adım: </span>
              {match[2]}
            </span>
          </>
        ) : (
          title
        )}
      </h2>
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
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-base font-bold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <ShoppingBasketIcon className="size-14 text-muted-foreground" aria-hidden />
      <h2 className="font-display text-3xl leading-tight">Sepetiniz boş</h2>
      <p className="text-lg text-muted-foreground">
        Sipariş vermek için önce sepetinize ürün ekleyin.
      </p>
      <ShopLinkButton href="/" size="lg">
        Ürünlere dön
      </ShopLinkButton>
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
    <div className={resultCardClass}>
      <MailCheckIcon className="size-14 text-primary" aria-hidden />
      <h2 className="font-display text-3xl leading-tight">E-postanızı doğrulayın</h2>
      <p className="text-lg leading-relaxed text-muted-foreground">
        <strong className="font-bold break-all text-foreground">{email}</strong>{" "}
        adresine bir doğrulama bağlantısı gönderdik. Sepetiniz duruyor.
        Bağlantıya tıkladıktan sonra buradan devam edebilirsiniz.
      </p>
      <ShopButton
        size="lg"
        block
        disabled={checking}
        onClick={() => {
          setChecking(true);
          router.refresh();
          // The refresh is a server round-trip; re-enable so a customer who
          // clicked too early can try again instead of staring at a dead button.
          window.setTimeout(() => setChecking(false), 2000);
        }}
      >
        {checking ? "Kontrol ediliyor…" : "E-postamı doğruladım, devam et"}
      </ShopButton>
      <p className="text-base text-muted-foreground">
        Bağlantı gelmediyse spam klasörünü kontrol edin.
      </p>
    </div>
  );
}

const resultCardClass =
  "mx-auto flex max-w-lg flex-col items-center gap-5 rounded-3xl border border-border bg-card p-5 text-center shadow-(--shop-shadow-sm) sm:p-8";

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
    <div className={resultCardClass}>
      <CheckCircle2Icon className="shop-enter-pop size-16 text-primary" aria-hidden />
      <h2 className="font-display text-3xl leading-tight">Siparişiniz alındı</h2>
      <div className="flex w-full flex-col items-center gap-2 rounded-2xl bg-(--shop-green-soft) p-4">
        <p className="text-lg text-foreground">Sipariş numaranız</p>
        {/* The guest's only handle on this order, so it is the biggest thing
            on the screen and selectable. */}
        <p className="shop-money text-3xl font-extrabold tracking-wide break-all select-all">
          {orderNumber}
        </p>
      </div>
      <p className="text-lg leading-relaxed text-muted-foreground">
        Siparişinizi hazırlamaya başlıyoruz. Durumunu istediğiniz zaman{" "}
        {hasAccount
          ? "hesabınızdan takip edebilirsiniz."
          : `sipariş numaranız ve telefonunuzla sorgulayabilirsiniz${
              hasEmail ? ". Numarayı onay e-postanıza da gönderdik." : "."
            }`}
      </p>

      {!hasAccount ? (
        <p className="rounded-2xl bg-muted px-4 py-3 text-base leading-relaxed text-foreground">
          Bir hesap açarsanız bir sonraki siparişinizi ve bu siparişi tek
          yerden, &quot;Hesabım&quot; sayfasından takip edebilirsiniz.{" "}
          <Link href="/kayit" className="font-bold underline underline-offset-4">
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

      <div className="flex w-full flex-col gap-3">
        <ShopLinkButton
          href={hasAccount ? "/hesap" : "/siparis-sorgula"}
          size="lg"
          block
        >
          {hasAccount ? "Siparişlerim" : "Siparişimi sorgula"}
        </ShopLinkButton>
        <ShopLinkButton href="/" size="lg" variant="secondary" block>
          Alışverişe devam et
        </ShopLinkButton>
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
        "flex flex-col gap-3 rounded-2xl border-2 border-(--shop-field-border) bg-muted p-4 text-base",
        className,
      )}
    >
      <p className="text-lg font-bold">Havale / EFT bilgileri</p>
      {/* IBAN on its own line, large and in digit groups: this is the string
          an older customer has to read out or type into a bank app. */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground">IBAN</span>
        <span className="shop-money text-xl leading-snug font-bold break-words select-all">
          {BANK_TRANSFER_IBAN}
        </span>
        <CopyButton
          value={BANK_TRANSFER_IBAN_RAW}
          label="IBAN'ı kopyala"
          className="h-12 self-start rounded-full border-2 border-primary bg-card px-5 text-base font-bold text-primary [&_svg]:size-5"
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Hesap sahibi</span>
        <span className="font-bold">{BANK_TRANSFER_ACCOUNT_HOLDER}</span>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Banka</span>
        <span className="font-bold">{BANK_TRANSFER_BANK_NAME}</span>
      </div>
      {orderNumber ? (
        <>
          <p className="text-base leading-relaxed">
            Açıklamaya sipariş numaranızı yazın:{" "}
            <span className="shop-money font-bold select-all">{orderNumber}</span>
          </p>
          <a
            href={buildBankTransferWhatsAppLink(orderNumber, totalMinor)}
            target="_blank"
            rel="noopener noreferrer"
            className="shop-btn shop-press shop-focus"
            data-variant="secondary"
            data-block="true"
          >
            <MessageCircleIcon aria-hidden />
            Dekontu WhatsApp&apos;tan gönderin
          </a>
        </>
      ) : (
        <p className="text-base leading-relaxed text-muted-foreground">
          Siparişi tamamladıktan sonra dekontu WhatsApp&apos;tan gönderebilirsiniz.
        </p>
      )}
    </div>
  );
}
