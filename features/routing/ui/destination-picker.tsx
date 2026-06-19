"use client";

/**
 * Final-destination picker, shared by the planning controls and driver mode.
 * Three kinds of end point: round trip back to the start (default), a saved
 * location, or one of the day's orders (which becomes the last stop). The
 * caller wires each choice to its own URL update via the callbacks.
 */
import { Flag, MapPin, RotateCcw } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SavedLocation } from "@/features/routing/domain/saved-location";

export const DEST_ROUND_TRIP = "__roundtrip__";
export const DEST_LOC_PREFIX = "loc:";
export const DEST_ORDER_PREFIX = "order:";

export interface DestinationOrderOption {
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_name: string;
}

interface DestinationPickerProps {
  savedLocations: ReadonlyArray<SavedLocation>;
  orders: ReadonlyArray<DestinationOrderOption>;
  /** Current value: DEST_ROUND_TRIP | `loc:<id>` | `order:<id>`. */
  value: string;
  disabled?: boolean;
  className?: string;
  onRoundTrip: () => void;
  onSavedLocation: (loc: SavedLocation) => void;
  onOrder: (orderId: string) => void;
}

export function DestinationPicker({
  savedLocations,
  orders,
  value,
  disabled,
  className,
  onRoundTrip,
  onSavedLocation,
  onOrder,
}: DestinationPickerProps) {
  const labelFor = (v: string): string => {
    if (v === DEST_ROUND_TRIP) return "Başlangıca dön";
    if (v.startsWith(DEST_LOC_PREFIX)) {
      const id = v.slice(DEST_LOC_PREFIX.length);
      return savedLocations.find((l) => l.id === id)?.name ?? "Kayıtlı konum";
    }
    if (v.startsWith(DEST_ORDER_PREFIX)) {
      const id = v.slice(DEST_ORDER_PREFIX.length);
      const o = orders.find((x) => x.order_id === id);
      return o ? `${o.order_number} · ${o.customer_name}` : "Sipariş";
    }
    return "Başlangıca dön";
  };

  const onSelect = (v: string) => {
    if (!v || v === DEST_ROUND_TRIP) {
      onRoundTrip();
      return;
    }
    if (v.startsWith(DEST_LOC_PREFIX)) {
      const loc = savedLocations.find(
        (l) => l.id === v.slice(DEST_LOC_PREFIX.length),
      );
      if (loc) onSavedLocation(loc);
      return;
    }
    if (v.startsWith(DEST_ORDER_PREFIX)) {
      onOrder(v.slice(DEST_ORDER_PREFIX.length));
    }
  };

  return (
    <Select value={value} onValueChange={(v) => v && onSelect(v)} disabled={disabled}>
      <SelectTrigger className={className ?? "h-9 w-56"} aria-label="Varış konumu seç">
        <SelectValue placeholder="Varış seç…">
          {(v: unknown) => labelFor(typeof v === "string" ? v : DEST_ROUND_TRIP)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEST_ROUND_TRIP}>
          <span className="flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            Başlangıca dön
          </span>
        </SelectItem>

        {savedLocations.length > 0 ? <SelectSeparator /> : null}
        {savedLocations.map((l) => (
          <SelectItem key={l.id} value={`${DEST_LOC_PREFIX}${l.id}`}>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {l.name}
            </span>
          </SelectItem>
        ))}

        {orders.length > 0 ? <SelectSeparator /> : null}
        {orders.map((o) => (
          <SelectItem key={o.order_id} value={`${DEST_ORDER_PREFIX}${o.order_id}`}>
            <span className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5 text-muted-foreground" />
              {o.order_number} · {o.customer_name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
