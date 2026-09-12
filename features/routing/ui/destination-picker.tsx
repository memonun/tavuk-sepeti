"use client";

/**
 * Final-destination picker, shared by the planning controls and driver mode.
 * Four kinds of end point: round trip back to the start (default), a saved
 * location, a one-off manually-entered address (picked via Google Places —
 * e.g. an errand elsewhere in Malatya that isn't worth saving), or one of the
 * day's orders (which becomes the last stop). The caller wires each choice to
 * its own URL update via the callbacks; picking "Elle adres gir…" doesn't set
 * anything itself — it just tells the caller to show its address search UI.
 */
import { Flag, MapPin, MapPinPlus, RotateCcw } from "lucide-react";

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
export const DEST_MANUAL = "__manual__";
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
  /** Current value: DEST_ROUND_TRIP | DEST_MANUAL | `loc:<id>` | `order:<id>`. */
  value: string;
  /** Display name for the current DEST_MANUAL value (the address the caller
   *  resolved it to). Ignored for every other value. */
  manualLabel?: string | undefined;
  disabled?: boolean;
  className?: string;
  onRoundTrip: () => void;
  onSavedLocation: (loc: SavedLocation) => void;
  onOrder: (orderId: string) => void;
  /** Fires when "Elle adres gir…" is picked. Doesn't set a destination by
   *  itself — the caller shows its own address search UI and calls back
   *  whatever handler actually sets destLat/destLng once the user picks one. */
  onManual: () => void;
}

export function DestinationPicker({
  savedLocations,
  orders,
  value,
  manualLabel,
  disabled,
  className,
  onRoundTrip,
  onSavedLocation,
  onOrder,
  onManual,
}: DestinationPickerProps) {
  const labelFor = (v: string): string => {
    if (v === DEST_ROUND_TRIP) return "Başlangıca dön";
    if (v === DEST_MANUAL) return manualLabel ?? "Elle adres gir…";
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
    if (v === DEST_MANUAL) {
      onManual();
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
        <SelectItem value={DEST_MANUAL}>
          <span className="flex items-center gap-1.5">
            <MapPinPlus className="h-3.5 w-3.5 text-muted-foreground" />
            Elle adres gir…
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
