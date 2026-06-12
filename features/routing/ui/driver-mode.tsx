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
 *   - deliveries advance the UI optimistically (with rollback on error) so a
 *     tap feels instant before the server round-trip lands.
 *   - useDriverState derives currentStop (first non-delivered, non-skipped).
 *   - useGeolocation supplies live coords once user grants permission.
 *   - When live distance to current stop < 100m, ApproachPrompt opens.
 *   - Leaving mid-route asks for confirmation (work is preserved either way).
 */
import { ChevronLeft, Loader2, MapPin, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { completeDeliveryAction } from "@/features/orders/application/complete-delivery";
import { ApproachPrompt } from "@/features/routing/ui/approach-prompt";
import { RouteDriverMap } from "@/features/routing/ui/route-driver-map";
import { StopCard } from "@/features/routing/ui/stop-card";
import { useDriverState } from "@/features/routing/ui/use-driver-state";
import { useGeolocation } from "@/features/routing/ui/use-geolocation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  // Optimistically-delivered ids — merged with the server set so the UI
  // advances instantly; rolled back if the server rejects the transition.
  const [optimisticDelivered, setOptimisticDelivered] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [exitOpen, setExitOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const deliveredIds = new Set<string>([
    ...initialDeliveredOrderIds,
    ...optimisticDelivered,
  ]);
  const driverState = useDriverState(route.stops, deliveredIds);
  const geo = useGeolocation();

  const handleDelivered = (orderId: string) => {
    setActionError(null);
    // Optimistic: advance to the next stop immediately.
    setOptimisticDelivered((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
    startTransition(async () => {
      const result = await completeDeliveryAction({ order_id: orderId });
      if (result.status === "error") {
        // Roll back the optimistic delivery.
        setOptimisticDelivered((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        setActionError(result.message);
        toast.error("Teslim kaydedilemedi", { description: result.message });
        return;
      }
      toast.success("Teslim edildi");
      // Server data refreshes → delivered set reconciles with the optimistic one.
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
  const remaining = driverState.totalCount - driverState.deliveredCount;

  return (
    // Full-screen driving view: escape the admin <main> (which is
    // overflow-hidden with its own padding) entirely so nothing can clip it.
    // The header + geolocation banner + action bar stay pinned; only the middle
    // scrolls — the "Konuma izin ver" button is always on screen. Exit via the
    // in-view "Çıkış" button.
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background">
      {/* Header bar */}
      <header className="flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setExitOpen(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Çıkış
        </button>
        <div className="flex flex-col items-center text-center">
          <p className="text-xs text-muted-foreground">
            {driverState.deliveredCount + driverState.skippedCount} /{" "}
            {driverState.totalCount}
          </p>
          <p className="font-mono text-xs">
            ≈ {formatHHmm(route.finish_time_iso)} bitiş
          </p>
          {!online ? (
            <Badge
              variant="destructive"
              className="mt-1 gap-1 px-1.5 py-0 text-[10px]"
            >
              <WifiOff className="h-3 w-3" />
              Çevrimdışı
            </Badge>
          ) : null}
        </div>
        {/* Spacer mirroring the back link width so the title stays centered. */}
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
        <div
          role="alert"
          className="flex items-start gap-2 border-b bg-orange-500/10 px-4 py-3 text-xs text-orange-700 dark:text-orange-300"
        >
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {geo.error ?? "Konum kapalı."} Manuel olarak &quot;Teslim Edildi&quot;
            butonuna basabilirsin.
          </span>
        </div>
      ) : null}

      {/* Main scrollable area */}
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
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

      {/* Exit confirmation */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotadan çık?</DialogTitle>
            <DialogDescription>
              {remaining} teslim edilmemiş durak var. İlerleme korunur — geri
              dönebilirsin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Vazgeç</DialogClose>
            <Button
              variant="destructive"
              onClick={() => router.push("/routes")}
            >
              Çık
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
