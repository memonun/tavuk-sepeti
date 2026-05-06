"use client";

/**
 * Driver-mode top-level Client Component.
 *
 * Layout (mobile-first):
 *   ┌───────────────────────────────┐
 *   │ Çıkış      X/N    ≈ HH:mm bit │  header
 *   ├───────────────────────────────┤
 *   │ [geolocation banner — needed] │
 *   ├───────────────────────────────┤
 *   │ [compact map: 260px]          │
 *   ├───────────────────────────────┤
 *   │ [current StopCard]            │
 *   ├───────────────────────────────┤
 *   │ Atla      Teslim Edildi       │  sticky bottom
 *   └───────────────────────────────┘
 *
 * State:
 *   - server-supplied OptimizedRoute + initial deliveredOrderIds.
 *   - useDriverState derives currentStop (first non-delivered, non-skipped).
 *   - useGeolocation supplies live coords once user grants permission.
 *   - When live distance to current stop < 100m, ApproachPrompt opens.
 */
import { ChevronLeft, Loader2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { ApproachPrompt } from "@/features/routing/ui/approach-prompt";
import { RouteDriverMap } from "@/features/routing/ui/route-driver-map";
import { StopCard } from "@/features/routing/ui/stop-card";
import { useDriverState } from "@/features/routing/ui/use-driver-state";
import { useGeolocation } from "@/features/routing/ui/use-geolocation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatHHmm } from "@/shared/utils/date";

import type { OptimizedRoute } from "@/features/routing/domain/route";

interface DriverModeProps {
  route: OptimizedRoute;
  initialDeliveredOrderIds: string[];
  mapsBrowserKey: string;
}

export function DriverMode({
  route,
  initialDeliveredOrderIds,
  mapsBrowserKey,
}: DriverModeProps) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedForStops, setDismissedForStops] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const driverState = useDriverState(
    route.stops,
    new Set(initialDeliveredOrderIds),
  );
  const geo = useGeolocation();

  const handleDelivered = (orderId: string) => {
    setActionError(null);
    startTransition(async () => {
      const result = await transitionOrderAction({
        order_id: orderId,
        to_status: "delivered",
      });
      if (result.status === "error") {
        setActionError(result.message);
        return;
      }
      // Server data refreshes → next stop becomes current via derived state.
      router.refresh();
    });
  };

  const handleApproachDismiss = (orderId: string) => {
    setDismissedForStops((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
  };

  // Run-complete state.
  if (driverState.isComplete) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <MapPin className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Rota tamamlandı</h2>
          <p className="text-sm text-muted-foreground">
            {driverState.deliveredCount} sipariş teslim edildi.
          </p>
        </div>
        <Link href="/routes" className={cn(buttonVariants({ size: "default" }))}>
          Rotaya dön
        </Link>
      </div>
    );
  }

  const current = driverState.currentStop;

  return (
    <div className="-mx-6 -my-6 flex min-h-[calc(100vh-3rem)] flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur sticky top-0 z-10">
        <Link
          href="/routes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Çıkış
        </Link>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {driverState.deliveredCount + driverState.skippedCount} /{" "}
            {driverState.totalCount}
          </p>
          <p className="font-mono text-xs">
            ≈ {formatHHmm(route.finish_time_iso)} bitiş
          </p>
        </div>
        {/* Spacer mirroring the back link width so the title stays centered.
            Hidden on narrow screens — the centered text gives up perfect
            symmetry rather than fighting for pixels. */}
        <span className="invisible hidden items-center gap-1 text-sm sm:flex">
          <ChevronLeft className="h-4 w-4" />
          Çıkış
        </span>
      </header>

      {/* Geolocation prompt banner */}
      {geo.status === "idle" || geo.status === "prompting" ? (
        <div className="border-b bg-muted/30 px-4 py-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Yaklaştığında otomatik soru göstermek için konum izni gerekli.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={geo.request}
            disabled={geo.status === "prompting"}
          >
            {geo.status === "prompting" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Konuma izin ver
          </Button>
        </div>
      ) : null}
      {geo.status === "denied" || geo.status === "error" ? (
        <div className="flex items-start gap-2 border-b bg-orange-500/10 px-4 py-3 text-xs text-orange-700 dark:text-orange-300">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {geo.error ?? "Konum kapalı."} Manuel olarak &quot;Teslim Edildi&quot;
            butonuna basabilirsin.
          </span>
        </div>
      ) : null}

      {/* Main scrollable area */}
      <main className="flex-1 space-y-4 px-4 py-4">
        <RouteDriverMap
          apiKey={mapsBrowserKey}
          origin={route.origin}
          stops={route.stops}
          stepPolylines={route.step_polylines}
          currentStopId={current?.order_id ?? null}
          driverCoords={geo.coords}
        />

        {current ? (
          <StopCard
            stop={current}
            totalStops={driverState.totalCount}
            driverCoords={geo.coords}
          />
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Geçerli durak yok. Atladıkların var — &quot;Tekrar al&quot; ile geri
            getirebilirsin.
          </div>
        )}

        {actionError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </main>

      {/* Sticky action bar */}
      {current ? (
        <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12"
            disabled={transitionPending}
            onClick={() => driverState.markSkipped(current.order_id)}
          >
            Atla
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12"
            disabled={transitionPending}
            onClick={() => handleDelivered(current.order_id)}
          >
            {transitionPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Teslim Edildi
          </Button>
        </div>
      ) : null}

      {/* Approach popup (proximity-triggered) */}
      <ApproachPrompt
        currentStop={current}
        driverCoords={geo.coords}
        dismissedStopIds={dismissedForStops}
        onDeliver={handleDelivered}
        onDismiss={handleApproachDismiss}
        pending={transitionPending}
      />
    </div>
  );
}
