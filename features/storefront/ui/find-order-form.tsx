"use client";

/**
 * Order tracking for a customer with no account.
 *
 * Everything a guest can do with their order lives here: see its state, and —
 * when a card payment fell through — pay it. Without this page a guest's only
 * move after a failed payment was to place the order again, which is the
 * duplicate-order behaviour we removed for account holders.
 */
import { useActionState } from "react";
import { PackageSearchIcon } from "lucide-react";

import {
  findMyOrderAction,
  type FindOrderState,
} from "@/features/storefront/application/find-my-order";
import { formatDeliveryDateLabel } from "@/features/storefront/domain/delivery-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTRY } from "@/shared/utils/money";

import { ResumePaymentButton } from "@/features/storefront/ui/resume-payment-button";

import type { GuestOrderView } from "@/features/storefront/application/lookup-guest-order";

const initialState: FindOrderState = { status: "idle" };

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

export function FindOrderForm() {
  const [state, formAction, pending] = useActionState(
    findMyOrderAction,
    initialState,
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order_number">Sipariş numarası</Label>
          <Input
            id="order_number"
            name="order_number"
            placeholder="ORD-2026-00123"
            autoComplete="off"
            required
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Siparişteki telefon</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0532 123 45 67"
            autoComplete="tel"
            required
            disabled={pending}
          />
        </div>

        {state.status === "not_found" ? (
          <p className="text-sm text-destructive" role="alert">
            Bu numara ve telefonla eşleşen bir sipariş bulamadık. Sipariş
            numarasını onay e-postanızda bulabilirsiniz.
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

      {state.status === "found" ? (
        <OrderCard order={state.order} phone={state.phone} />
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

      {awaitingPayment ? (
        <div className="pt-1">
          <ResumePaymentButton
            orderNumber={order.orderNumber}
            phone={phone}
            label={
              order.paymentMethod === "credit_card"
                ? "Ödemeyi tamamla"
                : "Kartla öde"
            }
          />
        </div>
      ) : null}
    </div>
  );
}
