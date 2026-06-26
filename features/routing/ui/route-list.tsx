"use client";

/**
 * Ordered stop list. Sequence-indexed when optimized; scheduled order
 * otherwise. Each row carries a "Teslim Edildi" inline action.
 *
 * When `onSelectStop` is provided (the optimized workspace), the list becomes
 * the keyboard-equivalent of the map: an ARIA listbox whose options select a
 * stop (click / Enter / Space), navigate with Up/Down, and clear with Escape.
 * Selecting a row mirrors clicking its map marker — one shared selectedStopId.
 * Without the prop (the unoptimized server view) it's a plain static list.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import {
  MISSING_FIELD_LABELS,
  missingDeliveryFields,
  type MissingDeliveryField,
} from "@/features/routing/domain/delivery-readiness";
import { MarkDeliveredButton } from "@/features/routing/ui/mark-delivered-button";
import { cn } from "@/lib/utils";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

import type { DayOrder } from "@/features/routing/application/get-day-orders";
import type { RouteStop } from "@/features/routing/domain/route";

interface RouteListProps {
  /** Either optimized stops (numbered 1..N) or unoptimized day orders. */
  rows:
    | { kind: "optimized"; stops: readonly RouteStop[] }
    | { kind: "unoptimized"; orders: readonly DayOrder[] };
  selectedStopId?: string | null;
  /** Provide to make the list interactive (selection-aware). */
  onSelectStop?: (orderId: string | null) => void;
  deliveredOrderIds?: ReadonlySet<string>;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "—";
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem === 0 ? `${h} sa` : `${h} sa ${rem} dk`;
}

export function RouteList({
  rows,
  selectedStopId = null,
  onSelectStop,
  deliveredOrderIds,
}: RouteListProps) {
  const interactive = typeof onSelectStop === "function";
  const liRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const items =
    rows.kind === "optimized"
      ? rows.stops.map((stop) => ({
          key: stop.order_id,
          sequence: stop.sequence,
          orderId: stop.order_id,
          orderNumber: stop.order_number,
          customerId: stop.customer_id,
          customerName: stop.customer_name,
          customerPhone: stop.customer_phone,
          notes: stop.delivery_notes,
          totalMinor: stop.total_minor,
          legDistance: stop.leg_distance_m,
          legDuration: stop.leg_duration_s,
          etaIso: stop.eta_iso as string | null,
          cumulativeDuration: stop.cumulative_duration_s as number | null,
          missing: missingDeliveryFields({
            phone: stop.customer_phone,
            street: stop.delivery_street,
            apartmentNo: stop.apartment_no,
            lat: stop.lat,
            lng: stop.lng,
          }),
        }))
      : rows.orders.map((order, idx) => ({
          key: order.order_id,
          sequence: idx + 1,
          orderId: order.order_id,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          customerName: `${order.customer_first_name} ${order.customer_last_name}`,
          customerPhone: order.customer_phone,
          notes: order.delivery_notes,
          totalMinor: order.total_minor,
          legDistance: null,
          legDuration: null,
          etaIso: null,
          cumulativeDuration: null,
          missing: missingDeliveryFields({
            phone: order.customer_phone,
            street: order.street,
            apartmentNo: order.apartment_no,
            lat: order.lat,
            lng: order.lng,
          }),
        }));

  const orderIds = items.map((i) => i.orderId);

  const focusRow = (orderId: string) => {
    liRefs.current.get(orderId)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, orderId: string) => {
    if (!onSelectStop) return;
    const idx = orderIds.indexOf(orderId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = orderIds[Math.min(idx + 1, orderIds.length - 1)];
      if (next) {
        onSelectStop(next);
        focusRow(next);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = orderIds[Math.max(idx - 1, 0)];
      if (prev) {
        onSelectStop(prev);
        focusRow(prev);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectStop(orderId);
    } else if (e.key === "Escape") {
      onSelectStop(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Bu gün için onaylı sipariş yok.
      </div>
    );
  }

  // Roving tabindex: the selected row (or the first, if none) is the single
  // tab stop; arrows move between options from there.
  const tabbableId = selectedStopId ?? orderIds[0] ?? null;

  // How many stops are missing at least one required delivery field — the
  // admin wants to fix these BEFORE the route goes out.
  const incompleteCount = items.filter((i) => i.missing.length > 0).length;

  return (
    <div className="space-y-2">
      {incompleteCount > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {incompleteCount} durakta eksik bilgi var (telefon / açık adres /
          daire / konum) — dağıtımdan önce tamamla.
        </div>
      ) : null}
      <ol
        id="stop-list"
        className="space-y-2"
        {...(interactive
          ? { role: "listbox", "aria-label": "Günün durakları" }
          : {})}
      >
        {items.map((item) => {
          const isSelected = interactive && item.orderId === selectedStopId;
          const isDelivered = deliveredOrderIds?.has(item.orderId) ?? false;
          return (
            <li
              key={item.key}
              ref={(el) => {
                if (el) liRefs.current.set(item.orderId, el);
                else liRefs.current.delete(item.orderId);
              }}
              {...(interactive
                ? {
                    role: "option",
                    id: `stop-${item.orderId}`,
                    "aria-selected": isSelected,
                    tabIndex: item.orderId === tabbableId ? 0 : -1,
                    onClick: (e: React.MouseEvent) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      onSelectStop?.(isSelected ? null : item.orderId);
                    },
                    onKeyDown: (e: React.KeyboardEvent) =>
                      onKeyDown(e, item.orderId),
                  }
                : {})}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors",
                interactive && "cursor-pointer hover:bg-muted/30",
                isSelected &&
                  "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20",
                isDelivered && "opacity-60",
              )}
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {item.sequence}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/orders/${item.orderId}`}
                    className="font-mono text-xs hover:underline"
                  >
                    {item.orderNumber}
                  </Link>
                  <Link
                    href={`/customers/${item.customerId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {item.customerName}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTRPhone(item.customerPhone)}
                  </span>
                </div>
                {item.notes ? (
                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                ) : null}
                {item.missing.length > 0 ? (
                  <MissingInfoChips missing={item.missing} />
                ) : null}
                {rows.kind === "optimized" ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {item.etaIso ? (
                      <span className="font-medium text-foreground">
                        ≈ {formatHHmm(item.etaIso)}
                      </span>
                    ) : null}
                    <span>
                      {item.sequence === 1 ? "Depodan" : "Önceki duraktan"}:{" "}
                      {formatDistance(item.legDistance)} ·{" "}
                      {formatDuration(item.legDuration)}
                    </span>
                    {item.cumulativeDuration !== null ? (
                      <span>
                        Toplam yolda: {formatDuration(item.cumulativeDuration)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="font-mono text-sm">
                  {formatTRY(item.totalMinor)}
                </p>
                {isDelivered ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Teslim edildi
                  </span>
                ) : (
                  <MarkDeliveredButton orderId={item.orderId} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Red chips naming each missing required delivery field, so the admin sees
 * exactly what to fill before dispatch (telefon / açık adres / daire / konum).
 */
function MissingInfoChips({
  missing,
}: {
  missing: readonly MissingDeliveryField[];
}) {
  return (
    <p className="flex flex-wrap items-center gap-1.5" role="alert">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        Eksik:
      </span>
      {missing.map((field) => (
        <span
          key={field}
          className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
        >
          {MISSING_FIELD_LABELS[field]}
        </span>
      ))}
    </p>
  );
}
