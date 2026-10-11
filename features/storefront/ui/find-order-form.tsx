"use client";

/**
 * Order tracking for a customer with no account.
 *
 * Everything a guest can do with their order lives here: see its state, and —
 * when a card payment fell through — pay it. Without this page a guest's only
 * move after a failed payment was to place the order again, which is the
 * duplicate-order behaviour we removed for account holders.
 *
 * Two tabs, because guests show up with different information in hand:
 *
 *   phone       — phone + order type. Every matching order comes back for
 *                 the guest to pick from (find-guest-orders.ts).
 *   order_number — the order number alone, nothing else asked
 *                 (find-guest-order-by-number.ts). A deliberate trade-off:
 *                 this tab has no phone-based scanning defense, so an order
 *                 found here cannot offer "Ödemeyi tamamla" — resuming a
 *                 card payment needs a phone to prove ownership, which this
 *                 tab never collects.
 */
import { useActionState, useState } from "react";
import { PackageSearchIcon } from "lucide-react";

import {
  findGuestOrdersAction,
  type FindOrdersState,
} from "@/features/storefront/application/find-guest-orders";
import {
  findGuestOrderByNumberAction,
  type FindOrderByNumberState,
} from "@/features/storefront/application/find-guest-order-by-number";
import {
  isAwaitingPayment,
  paymentStatusLabel,
} from "@/features/storefront/domain/card-confirmation";
import {
  GUEST_ORDER_TYPE_OPTIONS,
  type GuestOrderType,
} from "@/features/storefront/domain/guest-order-lookup.schema";
import { formatDeliveryDateLabel } from "@/features/storefront/domain/delivery-window";
import { cn } from "@/lib/utils";
import { formatDate, formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import { ResumePaymentButton } from "@/features/storefront/ui/resume-payment-button";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";
import { ShopInput } from "@/features/storefront/ui/kit/shop-field";

import type { GuestOrderView } from "@/features/storefront/application/lookup-guest-order";

const initialState: FindOrdersState = { status: "idle" };
const initialByNumberState: FindOrderByNumberState = { status: "idle" };

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

/** Short form for a summary card — same vocabulary as the admin order
 *  panel's PAYMENT_METHOD_LABEL, kept local since it's three lines. */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Kapıda nakit",
  bank_transfer: "Havale / EFT",
  credit_card: "Kredi / banka kartı",
};

type LookupMode = "phone" | "order_number";

export function FindOrderForm() {
  const [mode, setMode] = useState<LookupMode>("phone");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-full bg-secondary p-1">
        <ModeTab active={mode === "phone"} onClick={() => setMode("phone")}>
          Telefon ile bul
        </ModeTab>
        <ModeTab
          active={mode === "order_number"}
          onClick={() => setMode("order_number")}
        >
          Sipariş numarası ile bul
        </ModeTab>
      </div>

      {mode === "phone" ? <PhoneLookup /> : <OrderNumberLookup />}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shop-press shop-focus flex min-h-12 flex-1 items-center justify-center rounded-full px-3 text-center text-base leading-tight font-bold",
        active ? "bg-primary text-primary-foreground" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PhoneLookup() {
  const [state, formAction, pending] = useActionState(
    findGuestOrdersAction,
    initialState,
  );
  const [orderType, setOrderType] = useState<GuestOrderType>("delivery");
  const [selectedOrder, setSelectedOrder] = useState<GuestOrderView | null>(null);

  const phoneForCard =
    state.status === "found_one" || state.status === "found_many"
      ? state.phone
      : "";

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground" htmlFor="phone">Siparişteki telefon</label>
          <ShopInput
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="Telefon numarasını girin"
            autoComplete="tel"
            required
            disabled={pending}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground">Sipariş türü</label>
          <div className="grid grid-cols-3 gap-2">
            {GUEST_ORDER_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "shop-press-soft flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-center has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  orderType === option.value
                    ? "border-primary bg-(--shop-green-soft)"
                    : "border-(--shop-field-border) bg-card",
                )}
              >
                <input
                  type="radio"
                  name="order_type"
                  value={option.value}
                  checked={orderType === option.value}
                  onChange={() => setOrderType(option.value)}
                  disabled={pending}
                  className="sr-only"
                />
                <span className="text-xl" aria-hidden>
                  {option.emoji}
                </span>
                <span className="text-base font-bold leading-tight text-foreground">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {state.status === "not_found" ? (
          <p className="text-base text-destructive" role="alert">
            Girdiğiniz bilgilerle eşleşen bir sipariş bulamadık. Telefon
            numaranızı ve sipariş türünü kontrol edip tekrar deneyin.
          </p>
        ) : null}
        {state.status === "rate_limited" ? (
          <p className="text-base text-destructive" role="alert">
            Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar
            deneyin.
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-base text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}

        <ShopButton
          type="submit" size="lg" block
          disabled={pending}
        >
          {pending ? "Sorgulanıyor…" : "Siparişimi bul"}
        </ShopButton>
      </form>

      {/* The answer arrives under the button that asked for it; without the
          entrance it simply is there on the next frame. */}
      {state.status === "found_one" ? (
        <div className="shop-enter">
          <OrderCard order={state.order} phone={state.phone} allowResume />
        </div>
      ) : null}

      {state.status === "found_many" ? (
        selectedOrder ? (
          <div className="shop-enter flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              ← Başka sipariş seç
            </button>
            <OrderCard order={selectedOrder} phone={phoneForCard} allowResume />
          </div>
        ) : (
          <div className="shop-enter flex flex-col gap-3">
            <p className="text-base text-muted-foreground">
              Bu bilgilerle {state.orders.length} sipariş bulduk. Görmek
              istediğinizi seçin.
            </p>
            <div className="flex flex-col gap-2">
              {state.orders.map((order) => (
                <button
                  key={order.orderId}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="shop-press-soft shop-focus flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-(--shop-shadow-sm) hover:border-primary/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="shop-money text-base font-bold">
                      {order.orderNumber}
                    </span>
                    <span className="text-base text-muted-foreground">
                      {formatDate(order.createdAt)} ·{" "}
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <span className="font-semibold shop-money">
                    {formatTRY(order.totalMinor)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

function OrderNumberLookup() {
  const [state, formAction, pending] = useActionState(
    findGuestOrderByNumberAction,
    initialByNumberState,
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-base font-bold text-foreground" htmlFor="order_number">Sipariş numarası</label>
          <ShopInput
            id="order_number"
            name="order_number"
            placeholder="Sipariş numaranızı girin"
            autoComplete="off"
            required
            disabled={pending}
          />
        </div>

        {state.status === "not_found" ? (
          <p className="text-base text-destructive" role="alert">
            Bu numarayla eşleşen bir sipariş bulamadık. Sipariş numaranızı
            kontrol edip tekrar deneyin.
          </p>
        ) : null}
        {state.status === "rate_limited" ? (
          <p className="text-base text-destructive" role="alert">
            Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar
            deneyin.
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-base text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}

        <ShopButton
          type="submit" size="lg" block
          disabled={pending}
        >
          {pending ? "Sorgulanıyor…" : "Siparişimi bul"}
        </ShopButton>
      </form>

      {state.status === "found" ? (
        <div className="shop-enter">
          <OrderCard order={state.order} phone="" allowResume={false} />
        </div>
      ) : null}
    </div>
  );
}

function OrderCard({
  order,
  phone,
  allowResume,
}: {
  order: GuestOrderView;
  phone: string;
  /** False on the order-number-only tab: no phone was collected, and
   *  resumeCardPaymentAction requires one to prove a guest owns the order. */
  allowResume: boolean;
}) {
  // Cash on delivery is unpaid by design until the driver arrives, so it is not
  // "awaiting payment" and must not be offered a pay button.
  const paymentView = {
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod,
    status: order.status,
    created_at: order.createdAt,
  };
  const awaitingPayment = isAwaitingPayment(paymentView);
  // A card payment placed moments ago may simply not have been booked yet —
  // PayTR's callback trails the customer's return. Saying "Ödeme bekliyor" and
  // offering to charge the card again in that window is how an order gets paid
  // twice.
  //
  // Evaluated server-side when the lookup ran (see `mapGuestOrderRow`): reading
  // the clock during a client render is impure, and this card only ever
  // describes the instant the customer asked.
  const awaitingConfirmation = order.awaitingCardConfirmation;
  // A bank-transfer order is waiting on an admin to confirm the transfer
  // manually, not on the customer — there's no card payment to retry, so it
  // gets no pay button.
  const canRetryCardPayment =
    allowResume &&
    awaitingPayment &&
    !awaitingConfirmation &&
    order.paymentMethod === "credit_card";
  const paymentNeedsPhone =
    !allowResume &&
    awaitingPayment &&
    !awaitingConfirmation &&
    order.paymentMethod === "credit_card";

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 shadow-(--shop-shadow-sm)">
      <div className="flex items-center gap-2">
        <PackageSearchIcon className="size-5 text-primary" aria-hidden />
        <p className="shop-money font-bold">{order.orderNumber}</p>
      </div>

      <dl className="flex min-w-0 flex-col gap-2 text-base">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Durum</dt>
          <dd>{STATUS_LABELS[order.status] ?? order.status}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ödeme</dt>
          <dd
            className={
              awaitingPayment && !awaitingConfirmation ? "text-destructive" : undefined
            }
          >
            {paymentStatusLabel(paymentView, awaitingConfirmation)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ödeme Türü</dt>
          <dd>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {order.channel === "shipping" ? "Gönderim" : "Teslimat"}
          </dt>
          <dd>
            {order.channel === "shipping"
              ? "Kargo ile gönderilecek"
              : formatDeliveryDateLabel(order.scheduledFor)}
          </dd>
        </div>
        {order.channel === "delivery" &&
        order.estimatedDeliveryAt &&
        (order.status === "pending" || order.status === "confirmed") ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Tahmini Teslimat</dt>
            <dd>≈ {formatHHmm(order.estimatedDeliveryAt)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Tutar</dt>
          <dd className="font-semibold shop-money">
            {formatTRY(order.totalMinor)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ödenen Tutar</dt>
          <dd className="shop-money">{formatTRY(order.amountPaidMinor)}</dd>
        </div>
        {order.channel === "shipping" &&
        (order.cargoCarrier || order.cargoTrackingNumber || order.cargoTrackingUrl) ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Kargo</dt>
            <dd className="text-right">
              {[order.cargoCarrier, order.cargoTrackingNumber]
                .filter(Boolean)
                .join(" · ")}
              {order.cargoTrackingUrl ? (
                <>
                  {" "}
                  <a
                    href={order.cargoTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Takip et
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {order.items.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-base font-bold text-foreground">Ürünler</p>
          <ul className="flex min-w-0 flex-col gap-2 text-base">
            {order.items.map((item, index) => (
              <li key={index} className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">
                  {item.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                  {item.unitLabel ? ` ${item.unitLabel}` : ""} · {item.displayName}
                </span>
                <span className="shrink-0 shop-money">
                  {formatTRY(item.lineTotalMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canRetryCardPayment ? (
        <div className="pt-1">
          <ResumePaymentButton
            orderNumber={order.orderNumber}
            phone={phone}
            label="Ödemeyi tamamla"
          />
        </div>
      ) : null}

      {paymentNeedsPhone ? (
        <p className="text-base text-muted-foreground">
          Kart ile ödemeyi tamamlamak için &quot;Telefon ile bul&quot;
          sekmesinden siparişinizi tekrar sorgulayın.
        </p>
      ) : null}
    </div>
  );
}
