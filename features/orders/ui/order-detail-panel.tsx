"use client";

/**
 * Order detail panel — the single editable detail surface, used by BOTH the
 * grid's right-side Sheet (via order-detail-loader) and the /orders/[id] page.
 *
 * Editable iff status is "pending" or "confirmed": line items + delivery /
 * payment fields can be saved via `updateOrderAction`, mirroring the customer
 * detail panel's edit-in-place pattern. Delivered / cancelled orders render the
 * same regions read-only (lifted from the retired order-detail.tsx).
 *
 * The local `order` state is seeded from the prop and replaced on a successful
 * save so the panel reflects the fresh aggregate (server-recomputed totals)
 * without a full reload; the save action's revalidatePath re-renders the
 * grid / page behind it in the same response.
 */
import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
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
import { updateOrderAction } from "@/features/orders/application/update-order";
import {
  ProductPicker,
  type OrderItemDraft,
} from "@/features/orders/ui/product-picker";
import { OrderStatusActions } from "@/features/orders/ui/order-status-actions";
import { OrderCargoInfoForm } from "@/features/orders/ui/order-cargo-info-form";
import { OrderGiftItemsPanel } from "@/features/orders/ui/order-gift-items-panel";
import { OrderPayments } from "@/features/orders/ui/order-payments";
import { priceOrderLine } from "@/features/products/application/pricing";
import { formatDate, formatDateTime } from "@/shared/utils/date";
import { formatTRY, parseOptionalTRYInput } from "@/shared/utils/money";

import {
  isAwaitingCardPayment,
  type OrderPayment,
} from "@/features/orders/domain/payment";
import type { Product } from "@/features/products/application/list-products";
import { FULFILLMENT_CHANNEL_LABELS } from "@/features/orders/domain/order";
import type { OrderGiftItem } from "@/features/orders/domain/order-gift";
import type {
  Order,
  OrderStatus,
  OrderStatusEvent,
  PaymentMethod,
  PaymentStatus,
  TimeSlot,
} from "@/features/orders/domain/order";

interface OrderDetailPanelProps {
  readonly order: Order;
  readonly products: Product[];
  readonly customerName: string;
  readonly events: OrderStatusEvent[];
  /** product_key → flat special price (kuruş) for this order's customer. */
  readonly customerPrices?: Record<string, number>;
  readonly payments: OrderPayment[];
  readonly gifts: OrderGiftItem[];
  /** Sheet loaders pass this to refetch after a child mutation (no full
   *  reload); on the full page it's omitted and router.refresh() is used
   *  (see order-payments.tsx). */
  readonly onMutated?: () => void;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylı",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  confirmed: "default",
  shipped: "outline",
  delivered: "outline",
  cancelled: "destructive",
};

const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "Sabah",
  afternoon: "Öğleden sonra",
  evening: "Akşam",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  partial: "Kısmi",
  paid: "Ödendi",
  failed: "Başarısız",
  refunded: "İade",
};

/** Covers every value of the DB payment_method enum. The panel used to render
 *  `cash_on_delivery ? "Kapıda" : "Havale"`, so a card-paid storefront order
 *  displayed as "Havale" — wrong, and invisible unless you knew to look. */
const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash_on_delivery: "Kapıda",
  bank_transfer: "Havale",
  credit_card: "Kredi kartı",
};

/** Sentinel select value for "no time slot" — base-ui Select can't bind "". */
const NO_TIME_SLOT = "none";

const SECTION_CARD = "rounded-2xl border bg-card p-4";
const SECTION_TITLE = "mb-3 text-base font-semibold";

export function OrderDetailPanel({
  order: initialOrder,
  products,
  customerName,
  events,
  customerPrices = {},
  payments,
  gifts,
  onMutated,
}: OrderDetailPanelProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  // Render-phase sync (React's documented pattern, same as notification-bell):
  // when the server sends a newer copy of the order — the page re-rendering
  // after a status change, or the Sheet refetching — show it. Seeding state
  // from the prop alone kept the badge and the "Onayla" button stale after a
  // status change until a full reload.
  const [seenInitialOrder, setSeenInitialOrder] = useState(initialOrder);
  if (seenInitialOrder !== initialOrder) {
    setSeenInitialOrder(initialOrder);
    setOrder(initialOrder);
  }

  const editable = order.status === "pending" || order.status === "confirmed";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Who and when first — that is what the person holding the phone at the
          door needs; the order number is a reference, so it sits underneath. */}
      <header className="space-y-3 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]">
              <Link
                href={`/customers/${order.customer_id}`}
                className="underline-offset-4 hover:underline"
              >
                {customerName}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(order.scheduled_for)}
              {order.time_slot ? `, ${TIME_SLOT_LABEL[order.time_slot]}` : null}
              <span className="ml-2 font-mono text-xs">{order.order_number}</span>
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[order.status]} className="h-7 px-3 text-sm">
            {STATUS_LABEL[order.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={
              order.fulfillment_channel === "shipping" ? "outline" : "secondary"
            }
            className="text-xs"
          >
            {FULFILLMENT_CHANNEL_LABELS[order.fulfillment_channel]}
          </Badge>
          {order.source === "customer_web" ? (
            <Badge variant="outline" className="text-xs">
              Web
            </Badge>
          ) : null}
          {order.source === "recurring_generated" ? (
            <Badge variant="outline" className="text-xs">
              Abonelik
            </Badge>
          ) : null}
          {order.total_minor <= 0 ? (
            <Badge variant="secondary" className="text-xs">
              Hediye
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-xs">
            {PAYMENT_METHOD_LABEL[order.payment_method]}
          </Badge>
        </div>
        {order.source === "recurring_generated" ? (
          <p className="text-xs text-muted-foreground">
            <Link
              href={`/customers/${order.customer_id}#recurring`}
              className="underline-offset-2 hover:underline"
            >
              Bu sipariş bir abonelikten oluştu →
            </Link>
          </p>
        ) : null}
      </header>

      <section className={SECTION_CARD}>
        <h3 className={SECTION_TITLE}>Eylemler</h3>
        <OrderStatusActions
          orderId={order.id}
          currentStatus={order.status}
          fulfillmentChannel={order.fulfillment_channel}
          {...(onMutated ? { onChanged: onMutated } : {})}
        />
      </section>

      {/* Where it goes, before what is in it. */}
      <DeliveryAddress order={order} />

      {editable ? (
        <OrderEditForm
          order={order}
          products={products}
          customerPrices={customerPrices}
          onSaved={(fresh) => {
            setOrder(fresh);
          }}
        />
      ) : (
        <ReadonlyItems order={order} />
      )}

      {/* The editable form shows its own live totals; the stored block would
          be stale against unsaved changes, so only show it for closed orders. */}
      {editable ? null : <TotalsBlock order={order} />}

      <OrderPayments
        orderId={initialOrder.id}
        totalMinor={initialOrder.total_minor}
        amountPaidMinor={initialOrder.amount_paid_minor}
        paymentMethod={initialOrder.payment_method}
        scheduledFor={initialOrder.scheduled_for}
        payments={payments}
        {...(onMutated ? { onMutated } : {})}
      />

      {order.fulfillment_channel === "shipping" ? (
        <OrderCargoInfoForm
          orderId={initialOrder.id}
          cargoCarrier={order.cargo_carrier}
          cargoTrackingNumber={order.cargo_tracking_number}
          cargoTrackingUrl={order.cargo_tracking_url}
        />
      ) : null}

      <OrderGiftItemsPanel orderId={initialOrder.id} products={products} gifts={gifts} />

      <StatusTimeline events={events} />
    </div>
  );
}

interface OrderEditFormProps {
  readonly order: Order;
  readonly products: Product[];
  readonly customerPrices: Record<string, number>;
  readonly onSaved: (fresh: Order) => void;
}

/**
 * Controlled edit form (useState, not a server-action <form>) mirroring
 * order-form.tsx. Calls `updateOrderAction` directly inside a transition.
 * On success the parent re-seeds its `order` state via `onSaved`, and we
 * re-seed our own `items` from the fresh aggregate.
 */
function OrderEditForm({
  order,
  products,
  customerPrices,
  onSaved,
}: OrderEditFormProps) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Prefill each line's "Özel fiyat" from the customer's persisted special
  // (not the frozen line price) so editing it adjusts the customer's price.
  const [items, setItems] = useState<OrderItemDraft[]>(() =>
    order.items.map((i) => {
      const special = customerPrices[i.product_key];
      return special != null
        ? { product_key: i.product_key, quantity: i.quantity, unit_price_minor: special }
        : { product_key: i.product_key, quantity: i.quantity };
    }),
  );
  const [scheduledFor, setScheduledFor] = useState(order.scheduled_for);
  const [timeSlot, setTimeSlot] = useState<string>(order.time_slot ?? NO_TIME_SLOT);
  const [paymentMethod, setPaymentMethod] = useState<string>(order.payment_method);
  const [deliveryNotes, setDeliveryNotes] = useState(order.delivery_notes ?? "");
  const [deliveryFeeText, setDeliveryFeeText] = useState(() =>
    (order.delivery_fee_minor / 100).toFixed(2).replace(".", ","),
  );

  const productByKey = useMemo(
    () => new Map(products.map((p) => [p.key, p])),
    [products],
  );

  // Blank = no fee. Text that isn't an amount is an error, NOT a silent 0 —
  // otherwise a typo like "50 TL" would save the order with free delivery.
  const parsedFee = parseOptionalTRYInput(deliveryFeeText);
  const feeInvalid = parsedFee === null;
  const deliveryFeeMinor = parsedFee ?? 0;
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
  const previewTotalMinor = subtotalMinor + deliveryFeeMinor;

  const onSave = () => {
    setError(null);
    setSaved(false);

    if (items.length === 0) {
      setError("En az bir ürün ekle.");
      return;
    }
    if (feeInvalid) {
      setError("Teslimat ücreti geçerli bir tutar olmalı (ör. 50,00) ya da boş bırakılmalı.");
      return;
    }

    startSaving(async () => {
      const result = await updateOrderAction(order.id, {
        scheduled_for: scheduledFor,
        time_slot: timeSlot === NO_TIME_SLOT ? null : timeSlot,
        payment_method: paymentMethod,
        delivery_notes: deliveryNotes,
        delivery_fee_minor: deliveryFeeMinor,
        items,
      });
      if (result.ok) {
        const fresh = result.value;
        // Re-seed from the saved order but KEEP each line's special price: the
        // save just persisted it for the customer, and dropping it from the form
        // made the next edit (e.g. changing only the delivery fee) re-price the
        // order at catalog prices and delete the customer's saved price.
        setItems((previous) =>
          fresh.items.map((i) => {
            const special = previous.find((p) => p.product_key === i.product_key)?.unit_price_minor;
            return special != null
              ? { product_key: i.product_key, quantity: i.quantity, unit_price_minor: special }
              : { product_key: i.product_key, quantity: i.quantity };
          }),
        );
        setSaved(true);
        onSaved(fresh);
        return;
      }
      setError(result.error.message);
    });
  };

  return (
    <section className="space-y-4">
      <div className={SECTION_CARD}>
        <h3 className={SECTION_TITLE}>Ürünler</h3>
        <ProductPicker
          products={products}
          items={items}
          onChange={setItems}
          customerPrices={customerPrices}
        />
      </div>

      <div className={`${SECTION_CARD} space-y-4`}>
        <h3 className="text-base font-semibold">Teslim ve ödeme</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
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
            <Select
              value={timeSlot}
              onValueChange={(v) => v && setTimeSlot(v)}
              items={{ [NO_TIME_SLOT]: "—", ...TIME_SLOT_LABEL }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TIME_SLOT}>—</SelectItem>
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
              items={PAYMENT_METHOD_LABEL}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_on_delivery">Kapıda</SelectItem>
                <SelectItem value="bank_transfer">Havale</SelectItem>
                {/* Only offered when the order ALREADY is a card payment (i.e. it
                    came from the storefront's PayTR flow). An admin can't open a
                    card session at the door, so this is a round-trip affordance,
                    not a choice — without it, saving any edit to a card order
                    would silently rewrite its payment method. */}
                {order.payment_method === "credit_card" ? (
                  <SelectItem value="credit_card">Kredi kartı</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delivery_fee">Teslimat ücreti (₺)</Label>
            <Input
              id="delivery_fee"
              inputMode="decimal"
              value={deliveryFeeText}
              onChange={(e) => setDeliveryFeeText(e.target.value)}
              placeholder="0,00"
              aria-invalid={feeInvalid}
            />
            {feeInvalid ? (
              <p className="text-xs text-destructive">
                Geçerli bir tutar girin (ör. 50,00) ya da boş bırakın.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delivery_notes">Teslimat notu</Label>
            <textarea
              id="delivery_notes"
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Kapı kodu vb."
              className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-1 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">Ara toplam</dt>
          <dd className="text-right tabular-nums">{formatTRY(subtotalMinor)}</dd>
          <dt className="text-muted-foreground">Teslimat</dt>
          <dd className="text-right tabular-nums">{formatTRY(deliveryFeeMinor)}</dd>
          <dt className="text-base font-semibold">Toplam</dt>
          <dd className="text-right text-base font-semibold tabular-nums">
            {formatTRY(previewTotalMinor)}
          </dd>
        </dl>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          Kaydedildi.
        </p>
      ) : null}

      {/* Phone: the total and the save button ride along at the bottom of the
          screen for as long as this form is in view, so a change made at the
          top never needs a scroll to save. From `sm` up it is the plain
          right-aligned button it always was. */}
      <div className="sticky bottom-[calc(var(--admin-tabbar-h,0px)+0.5rem)] z-10 flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-lg sm:static sm:justify-end sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div className="sm:hidden">
          <p className="text-xs text-muted-foreground">Toplam</p>
          <p className="text-lg leading-tight font-semibold tabular-nums">
            {formatTRY(previewTotalMinor)}
          </p>
        </div>
        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="max-sm:h-12 max-sm:px-6 max-sm:text-base"
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </section>
  );
}

/** Read-only line items + per-line totals for closed (delivered/cancelled)
 *  orders — lifted from the retired order-detail.tsx. */
function ReadonlyItems({ order }: { order: Order }) {
  return (
    <section className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Ürünler</h3>
      <ul className="divide-y">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-12 items-center gap-2 py-2 text-sm"
          >
            <span className="col-span-6">
              {item.product_snapshot.display_name}
            </span>
            <span className="col-span-3 text-muted-foreground">
              {item.quantity} {item.product_snapshot.unit_label}
            </span>
            <span className="col-span-3 text-right tabular-nums">
              {formatTRY(item.line_total_minor)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Totals block — always shown, sourced from the (possibly just-saved)
 *  order aggregate so it reflects the server-recomputed figures. */
function TotalsBlock({ order }: { order: Order }) {
  return (
    <section className={SECTION_CARD}>
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <dt className="text-muted-foreground">Ara toplam</dt>
        <dd className="text-right tabular-nums">{formatTRY(order.subtotal_minor)}</dd>
        <dt className="text-muted-foreground">Teslimat</dt>
        <dd className="text-right tabular-nums">
          {formatTRY(order.delivery_fee_minor)}
        </dd>
        <dt className="text-base font-semibold">Toplam</dt>
        <dd className="text-right text-base font-semibold tabular-nums">
          {formatTRY(order.total_minor)}
        </dd>
      </dl>
    </section>
  );
}

/** Frozen delivery-address snapshot — read-only in every state (the address is
 *  not editable from the order; it's a point-in-time copy). */
function DeliveryAddress({ order }: { order: Order }) {
  const snapshot = order.delivery_address_snapshot;
  // The structured parts were mapped into the domain object but never shown —
  // exactly the fields the driver needs (mahalle / cadde / bina / daire).
  const detailRows: Array<[string, string | null]> = [
    ["Mahalle", snapshot.neighborhood],
    ["Cadde / sokak", snapshot.street],
    ["Bina no", snapshot.building_no],
    ["Daire no", snapshot.apartment_no],
    ["İlçe / il", [snapshot.district, snapshot.city].filter(Boolean).join(" / ") || null],
  ];
  const hasPin = !(snapshot.lat === 0 && snapshot.lng === 0);

  return (
    <section className={SECTION_CARD}>
      <h3 className="mb-2 text-base font-semibold">Teslimat adresi</h3>
      <p className="text-base leading-snug font-medium">{snapshot.raw_text}</p>
      {snapshot.description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{snapshot.description}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {detailRows.map(([label, value]) =>
          value ? (
            <Fragment key={label}>
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right">{value}</span>
            </Fragment>
          ) : null,
        )}
        <span className="text-muted-foreground">Ödeme yöntemi</span>
        <span className="text-right">
          {PAYMENT_METHOD_LABEL[order.payment_method]}
        </span>
        <span className="text-muted-foreground">Ödeme durumu</span>
        <span className="text-right">
          {PAYMENT_STATUS_LABEL[order.payment_status]}
        </span>
      </div>
      {isAwaitingCardPayment(order) ? (
        <p className="mt-2 text-xs text-destructive">
          Kart ödemesi tamamlanmadı — bu sipariş, ödeme gelene kadar günün
          rotasına dahil edilmez.
        </p>
      ) : null}
      {hasPin ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {snapshot.lat.toFixed(6)}, {snapshot.lng.toFixed(6)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-destructive">
          Konum pini yok — bu sipariş rotada &quot;Konum&quot; eksik olarak
          işaretlenir.
        </p>
      )}
    </section>
  );
}

/** Status timeline (audit log) — read-only, lifted from order-detail.tsx. */
function StatusTimeline({ events }: { events: OrderStatusEvent[] }) {
  return (
    <section className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Durum geçmişi</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Olay yok.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {formatDateTime(event.created_at)}
              </span>
              <div className="flex-1">
                <p>
                  {event.from_status
                    ? `${STATUS_LABEL[event.from_status]} → `
                    : ""}
                  <span className="font-medium">
                    {STATUS_LABEL[event.to_status]}
                  </span>
                </p>
                {event.reason ? (
                  <p className="text-xs text-muted-foreground">{event.reason}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
