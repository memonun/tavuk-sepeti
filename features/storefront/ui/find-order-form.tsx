"use client";

/**
 * Order tracking for a customer with no account.
 *
 * Everything a guest can do with their order lives here: see its state, and —
 * when a card payment fell through — pay it. Without this page a guest's only
 * move after a failed payment was to place the order again, which is the
 * duplicate-order behaviour we removed for account holders.
 *
 * Identifies the order by phone + order date + order type rather than
 * order_number: the number is a dead end for anyone who lost the
 * confirmation e-mail. The server resolves the real order_number/order_id
 * itself (see find-guest-orders.ts) and, when more than one order matches,
 * hands back every match so the guest can pick the right one here — no extra
 * round trip.
 */
import { useActionState, useState } from "react";
import { PackageSearchIcon } from "lucide-react";

import {
  findGuestOrdersAction,
  type FindOrdersState,
} from "@/features/storefront/application/find-guest-orders";
import {
  GUEST_ORDER_TYPE_OPTIONS,
  type GuestOrderType,
} from "@/features/storefront/domain/guest-order-lookup.schema";
import { formatDeliveryDateLabel } from "@/features/storefront/domain/delivery-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate, todayInIstanbul } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import { ResumePaymentButton } from "@/features/storefront/ui/resume-payment-button";

import type { GuestOrderView } from "@/features/storefront/application/lookup-guest-order";

const initialState: FindOrdersState = { status: "idle" };

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

export function FindOrderForm() {
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Siparişteki telefon</Label>
          <Input
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order_date">Sipariş tarihi</Label>
          <Input
            id="order_date"
            name="order_date"
            type="date"
            max={todayInIstanbul()}
            required
            disabled={pending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Sipariş türü</Label>
          <div className="grid grid-cols-3 gap-2">
            {GUEST_ORDER_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-colors",
                  orderType === option.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50 hover:bg-secondary/40",
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
                <span className="text-xs font-medium leading-tight text-foreground">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {state.status === "not_found" ? (
          <p className="text-sm text-destructive" role="alert">
            Girdiğiniz bilgilerle eşleşen bir sipariş bulamadık. Telefon
            numaranızı, sipariş tarihini ve sipariş türünü kontrol edip
            tekrar deneyin.
          </p>
        ) : null}
        {state.status === "rate_limited" ? (
          <p className="text-sm text-destructive" role="alert">
            Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar
            deneyin.
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full"
          disabled={pending}
        >
          {pending ? "Sorgulanıyor…" : "Siparişimi bul"}
        </Button>
      </form>

      {state.status === "found_one" ? (
        <OrderCard order={state.order} phone={state.phone} />
      ) : null}

      {state.status === "found_many" ? (
        selectedOrder ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="self-start text-sm text-muted-foreground underline underline-offset-2"
            >
              ← Başka sipariş seç
            </button>
            <OrderCard order={selectedOrder} phone={phoneForCard} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Bu bilgilerle {state.orders.length} sipariş bulduk. Görmek
              istediğinizi seçin.
            </p>
            <div className="flex flex-col gap-2">
              {state.orders.map((order) => (
                <button
                  key={order.orderId}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium">
                      {order.orderNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)} ·{" "}
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums">
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

function OrderCard({ order, phone }: { order: GuestOrderView; phone: string }) {
  // Cash on delivery is unpaid by design until the driver arrives, so it is not
  // "awaiting payment" and must not be offered a pay button.
  const awaitingPayment =
    order.paymentStatus !== "paid" &&
    order.status !== "cancelled" &&
    order.paymentMethod !== "cash_on_delivery";
  // A bank-transfer order is waiting on an admin to confirm the transfer
  // manually, not on the customer — there's no card payment to retry, so it
  // gets no pay button.
  const canRetryCardPayment =
    awaitingPayment && order.paymentMethod === "credit_card";

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <PackageSearchIcon className="size-5 text-primary" aria-hidden />
        <p className="font-mono font-medium">{order.orderNumber}</p>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Durum</dt>
          <dd>{STATUS_LABELS[order.status] ?? order.status}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ödeme</dt>
          <dd className={awaitingPayment ? "text-destructive" : undefined}>
            {order.paymentStatus === "paid"
              ? "Ödendi"
              : order.paymentMethod === "cash_on_delivery"
                ? "Teslimatta ödenecek"
                : order.paymentMethod === "bank_transfer"
                  ? "Ödeme onayı bekliyor"
                  : "Ödeme bekliyor"}
          </dd>
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
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Tutar</dt>
          <dd className="font-semibold tabular-nums">
            {formatTRY(order.totalMinor)}
          </dd>
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
                    className="underline underline-offset-2"
                  >
                    Takip et
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {canRetryCardPayment ? (
        <div className="pt-1">
          <ResumePaymentButton
            orderNumber={order.orderNumber}
            phone={phone}
            label="Ödemeyi tamamla"
          />
        </div>
      ) : null}
    </div>
  );
}
