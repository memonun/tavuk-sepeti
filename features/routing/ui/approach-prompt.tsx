"use client";

/**
 * Proximity-triggered prompt: when the driver's live position lands within
 * APPROACH_THRESHOLD_M of the current stop, slide a Sheet up from the
 * bottom asking whether the delivery was made.
 *
 * Re-fire rule: once dismissed for a stop, the prompt won't re-open until
 * either (a) the current stop changes (delivery made elsewhere, or skip),
 * or (b) the driver moves > RESET_THRESHOLD_M away and back inside.
 *
 * The threshold pair (100m / 200m) gives hysteresis so a driver hovering
 * around the boundary doesn't toggle the prompt every few seconds.
 */
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { haversineMeters, type LatLng } from "@/shared/geo/distance";
import { formatTRY } from "@/shared/utils/money";

import type { RouteStop } from "@/features/routing/domain/route";

const APPROACH_THRESHOLD_M = 100;
const RESET_THRESHOLD_M = 200;

interface ApproachPromptProps {
  currentStop: RouteStop | null;
  driverCoords: LatLng | null;
  dismissedStopIds: ReadonlySet<string>;
  onDeliver: (orderId: string) => void;
  onDismiss: (orderId: string) => void;
  pending: boolean;
}

export function ApproachPrompt({
  currentStop,
  driverCoords,
  dismissedStopIds,
  onDeliver,
  onDismiss,
  pending,
}: ApproachPromptProps) {
  const [open, setOpen] = useState(false);
  // Per-stop "has the driver moved out and back since the last dismiss?"
  // tracking. true = ready to re-fire when distance < threshold again.
  const reArmRef = useRef<Set<string>>(new Set());

  // Sync to external inputs (geolocation ticks, current-stop changes).
  // The setOpen calls here are gated on actual delta — open/close only
  // when the desired state differs from the live state — so the effect
  // doesn't cascade. Linter flags the pattern; intentional.
  useEffect(() => {
    if (!currentStop || !driverCoords) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen((prev) => (prev ? false : prev));
      return;
    }

    const distance = haversineMeters(driverCoords, {
      lat: currentStop.lat,
      lng: currentStop.lng,
    });
    const isClose = distance < APPROACH_THRESHOLD_M;
    const isFar = distance > RESET_THRESHOLD_M;
    const wasDismissed = dismissedStopIds.has(currentStop.order_id);

    // Re-arm logic: once the driver moves > 200m, allow a future re-fire.
    if (isFar && wasDismissed) {
      reArmRef.current.add(currentStop.order_id);
    }

    const reArmed = reArmRef.current.has(currentStop.order_id);

    if (isClose && (!wasDismissed || reArmed)) {
      setOpen((prev) => (prev ? prev : true));
      if (reArmed) reArmRef.current.delete(currentStop.order_id);
    }
    // Don't auto-close when isFar — let the user explicitly act.
  }, [currentStop, driverCoords, dismissedStopIds]);

  // When the current stop changes (delivered / skipped), ensure we're closed.
  const currentId = currentStop?.order_id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [currentId]);

  if (!currentStop) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closing the sheet without "Evet, Teslim Edildi" counts as dismiss.
        if (!next) onDismiss(currentStop.order_id);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Yaklaştın!</SheetTitle>
          <SheetDescription>
            {currentStop.sequence}. durak — {currentStop.customer_name}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-2 text-sm">
          <p>
            Sipariş tutarı:{" "}
            <span className="font-mono font-semibold">
              {formatTRY(currentStop.total_minor)}
            </span>
          </p>
          {currentStop.delivery_notes ? (
            <p className="text-muted-foreground">
              Not: {currentStop.delivery_notes}
            </p>
          ) : null}
        </div>
        <SheetFooter className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12"
            disabled={pending}
            onClick={() => {
              onDismiss(currentStop.order_id);
              setOpen(false);
            }}
          >
            Henüz Değil
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12"
            disabled={pending}
            onClick={() => {
              onDeliver(currentStop.order_id);
              setOpen(false);
            }}
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Evet, Teslim Edildi
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
