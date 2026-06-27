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
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flag,
  List,
  Loader2,
  MapPin,
  Package,
  SkipForward,
  Undo2,
  Wallet,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { completeDeliveryAction } from "@/features/orders/application/complete-delivery";
import { revertDeliveryAction } from "@/features/orders/application/revert-delivery";
import { ApproachPrompt } from "@/features/routing/ui/approach-prompt";
import { DeliveryPaymentDialog } from "@/features/routing/ui/delivery-payment-dialog";
import { RouteDriverMap } from "@/features/routing/ui/route-driver-map";
import { RouteManifestPanel } from "@/features/routing/ui/route-manifest-panel";
import { StopCard } from "@/features/routing/ui/stop-card";
import { serializeExcludeDelivered } from "@/features/routing/domain/exclude-delivered-url";
import { computeRouteManifest } from "@/features/routing/domain/route-manifest";
import { useDriverState } from "@/features/routing/ui/use-driver-state";
import { useGeolocation } from "@/features/routing/ui/use-geolocation";
import { useRouteRealtime } from "@/features/routing/ui/hooks/use-route-realtime";
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
import {
  DEST_LOC_PREFIX,
  DEST_ORDER_PREFIX,
  DEST_ROUND_TRIP,
  DestinationPicker,
} from "@/features/routing/ui/destination-picker";
import { cn } from "@/lib/utils";
import { formatHHmm } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import type { OptimizedRoute, RouteStop } from "@/features/routing/domain/route";
import type { SavedLocation } from "@/features/routing/domain/saved-location";

interface DriverModeProps {
  route: OptimizedRoute;
  initialDeliveredOrderIds: string[];
  mapsBrowserKey: string;
  savedLocations: ReadonlyArray<SavedLocation>;
  /** Current drive query string — mutated to change the destination mid-route. */
  driveQuery: string;
}

export function DriverMode({
  route,
  initialDeliveredOrderIds,
  mapsBrowserKey,
  savedLocations,
  driveQuery,
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
  // Optimistically-reverted ids — subtracted from the delivered set so a
  // "Geri al" reflects instantly; rolled back if the server rejects.
  const [optimisticReverted, setOptimisticReverted] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [exitOpen, setExitOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [manifestOpen, setManifestOpen] = useState(false);
  // The just-delivered stop to collect payment for (null = popup closed).
  const [paymentStop, setPaymentStop] = useState<RouteStop | null>(null);
  const [destOpen, setDestOpen] = useState(false);

  // Delivered set = server truth + optimistic deliveries − optimistic reverts.
  // Drives the "done" flags, the manifest, and the current-stop derivation —
  // and the frozen exclude set written into the URL when the driver explicitly
  // re-optimizes (below), so freshly-delivered stops drop to map markers.
  const deliveredIds = new Set<string>([
    ...initialDeliveredOrderIds,
    ...optimisticDelivered,
  ]);
  for (const id of optimisticReverted) deliveredIds.delete(id);

  // ---- Final-destination (change mid-route → re-navigate → re-optimize) ----
  const destinationOrders = route.stops.map((s) => ({
    order_id: s.order_id,
    order_number: s.order_number,
    customer_name: s.customer_name,
  }));
  const destLabel = route.destination?.name ?? "Başlangıç (depo)";
  const destValue = (() => {
    const d = route.destination;
    if (!d) return DEST_ROUND_TRIP;
    if (d.kind === "order") return `${DEST_ORDER_PREFIX}${d.order_id ?? ""}`;
    // Match the saved location by coordinate (robust to renames / duplicate
    // names); the URL carries the exact lat/lng this location was picked with.
    const match = savedLocations.find((l) => l.lat === d.lat && l.lng === d.lng);
    return match ? `${DEST_LOC_PREFIX}${match.id}` : DEST_ROUND_TRIP;
  })();

  const pushDestination = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(driveQuery);
    mutate(p);
    // Changing the destination re-optimizes, so re-freeze the exclude set to
    // everything delivered so far — anything delivered mid-drive drops to a
    // marker rather than staying a waypoint.
    p.set("excludeDelivered", serializeExcludeDelivered(deliveredIds));
    setDestOpen(false);
    router.push(`/routes/drive?${p.toString()}`);
  };
  const destRoundTrip = () =>
    pushDestination((p) => {
      p.delete("destLat");
      p.delete("destLng");
      p.delete("destName");
      p.delete("destOrderId");
    });
  const destSavedLocation = (loc: SavedLocation) =>
    pushDestination((p) => {
      p.set("destLat", String(loc.lat));
      p.set("destLng", String(loc.lng));
      p.set("destName", loc.name);
      p.delete("destOrderId");
    });
  const destOrder = (orderId: string) =>
    pushDestination((p) => {
      p.set("destOrderId", orderId);
      p.delete("destLat");
      p.delete("destLng");
      p.delete("destName");
    });

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

  // Live load manifest — `remainingLoads` shrinks as deliveries are marked.
  const manifest = computeRouteManifest(route.stops, Array.from(deliveredIds));
  const driverState = useDriverState(route.stops, deliveredIds);
  const geo = useGeolocation();
  // Live per-stop content: external edits (office records a payment, edits a
  // note) refresh the route in place. The optimized order/ETAs stay put — the
  // Directions result is cached by coordinates, so a content refresh costs no
  // Google call. markLocalWrite suppresses the echo of the driver's own writes.
  const { markLocalWrite } = useRouteRealtime();

  // Live tracking is silent now (no in-view button): if the driver already
  // granted location permission up front (the planning page's "Konumumu kullan"
  // pick), resume the watch automatically so the moving marker + proximity
  // "yaklaştın" prompt keep working. If permission isn't granted we stay quiet —
  // no prompt, no banner; the route still works with manual "Teslim Edildi".
  const geoSupported = geo.supported;
  const geoRequest = geo.request;
  useEffect(() => {
    if (!geoSupported || typeof navigator === "undefined") return;
    const perms = navigator.permissions;
    if (!perms?.query) return;
    let cancelled = false;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (!cancelled && res.state === "granted") geoRequest();
      })
      .catch(() => {
        /* Permissions API unavailable — stay silent. */
      });
    return () => {
      cancelled = true;
    };
  }, [geoSupported, geoRequest]);

  const handleDelivered = (orderId: string) => {
    setActionError(null);
    markLocalWrite(); // our own write — don't let the realtime echo double-refresh
    // Optimistic: advance to the next stop immediately. Clear any pending
    // revert for this id (re-delivering an undone stop).
    setOptimisticReverted((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
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
      // Snap the view forward to the new current stop.
      driverState.followCurrent();
      // Open the collect-on-delivery popup for this stop.
      const stop = route.stops.find((s) => s.order_id === orderId) ?? null;
      setPaymentStop(stop);
      // Server data refreshes → delivered set reconciles with the optimistic
      // one. Cheap: the full-day waypoint set is unchanged by a delivery, so
      // getDayRoute re-uses the cached geometry (no paid Maps call, no reshuffle).
      router.refresh();
    });
  };

  const handleRevert = (orderId: string) => {
    setActionError(null);
    markLocalWrite(); // our own write — don't let the realtime echo double-refresh
    // Optimistic un-deliver.
    setOptimisticReverted((prev) => new Set(prev).add(orderId));
    setOptimisticDelivered((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    startTransition(async () => {
      const result = await revertDeliveryAction({ order_id: orderId });
      if (result.status === "error") {
        setOptimisticReverted((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        setActionError(result.message);
        toast.error("Geri alınamadı", { description: result.message });
        return;
      }
      toast.success("Teslimat geri alındı");
      router.refresh();
    });
  };

  // Re-optimize the route from the driver's live position instead of the
  // warehouse — the fix for "the re-optimization didn't regard where I am". One
  // paid Maps call per tap; navigates with origin=GPS so getDayRoute sequences
  // the day's stops from here. This is the explicit re-optimize, so it re-freezes
  // the exclude set to everything delivered so far: completed stops drop OUT of
  // the waypoints (kept as markers) and the optimizer only sequences what's left
  // — no more detouring the route through places already visited. Routine
  // deliveries between taps still cost no Google call: the frozen set in the URL
  // keeps the waypoint set (and Directions cache key) stable until the next tap.
  const reoptimizeFromHere = () => {
    if (!geo.coords) {
      geo.request();
      toast.info("Konum alınıyor — geldiğinde tekrar dene.");
      return;
    }
    const p = new URLSearchParams(driveQuery);
    p.set("originLat", String(geo.coords.lat));
    p.set("originLng", String(geo.coords.lng));
    p.set("originName", "Konumum");
    p.set("start", formatHHmm(new Date()));
    p.set("excludeDelivered", serializeExcludeDelivered(deliveredIds));
    toast.success("Rota bulunduğun yerden yeniden sıralanıyor…");
    router.push(`/routes/drive?${p.toString()}`);
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

  // The stop the driver is looking at (may differ from `current` when they
  // step backward/forward through the queue).
  const view = driverState.viewStop;
  const viewStatus = driverState.viewStatus;
  const viewState = viewStatus.delivered
    ? "delivered"
    : viewStatus.skipped
      ? "skipped"
      : viewStatus.isCurrent
        ? "current"
        : "upcoming";
  const viewingCurrent = view !== null && current !== null && view.order_id === current.order_id;

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

      {/* Destination bar — shows the end point + a mid-route change control */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-4 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Flag className="h-3.5 w-3.5 shrink-0" />
          Varış:{" "}
          <span className="truncate font-medium text-foreground">{destLabel}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0"
          onClick={() => setDestOpen(true)}
        >
          Değiştir
        </Button>
      </div>

      {/* Re-optimize the remaining route from the driver's live position. */}
      <button
        type="button"
        onClick={reoptimizeFromHere}
        className="flex w-full items-center gap-2 border-b bg-background px-4 py-1.5 text-xs hover:bg-muted"
      >
        <Crosshair className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">Buradan optimize et</span>
        <span className="truncate text-muted-foreground">
          · kalan {remaining} durağı bulunduğun yerden sırala
        </span>
      </button>

      {/* Load manifest — what's still in the van + cash to collect */}
      <div className="border-b bg-background">
        <button
          type="button"
          onClick={() => setManifestOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-1.5 text-xs hover:bg-muted"
        >
          <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">Yük</span>
          <span className="text-muted-foreground">
            · {manifest.remainingCount} durak kaldı
          </span>
          {manifest.toCollectMinor > 0 ? (
            <span className="ml-auto font-medium">
              Tahsil {formatTRY(manifest.toCollectMinor)}
            </span>
          ) : (
            <span className="ml-auto" />
          )}
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              manifestOpen && "rotate-90",
            )}
          />
        </button>
        {manifestOpen ? (
          <div className="max-h-[40vh] overflow-y-auto border-t p-2">
            <RouteManifestPanel manifest={manifest} route={route} variant="driver" />
          </div>
        ) : null}
      </div>

      {/* Stop stepper — step backward/forward through the queue */}
      {view ? (
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!driverState.canPrev}
            onClick={driverState.goPrev}
            aria-label="Önceki durak"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setQueueOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
          >
            <List className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              <span className="text-muted-foreground">
                {driverState.viewIndex + 1}/{driverState.totalCount}
              </span>{" "}
              {view.customer_name}
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!driverState.canNext}
            onClick={driverState.goNext}
            aria-label="Sonraki durak"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {/* Expandable stop queue */}
      {queueOpen ? (
        <div className="max-h-[40vh] overflow-y-auto border-b bg-muted/20">
          <ul className="divide-y">
            {driverState.stopsWithStatus.map((s, i) => (
              <li key={s.stop.order_id}>
                <button
                  type="button"
                  onClick={() => {
                    driverState.jumpTo(i);
                    setQueueOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted",
                    i === driverState.viewIndex && "bg-muted",
                  )}
                >
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                    {s.stop.sequence}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.stop.customer_name}
                  </span>
                  {s.delivered ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : s.skipped ? (
                    <SkipForward className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : s.isCurrent ? (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Sıradaki
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Main scrollable area */}
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <RouteDriverMap
          apiKey={mapsBrowserKey}
          origin={route.origin}
          originName={new URLSearchParams(driveQuery).get("originName")}
          destination={route.destination}
          stops={route.stops}
          completedMarkers={route.completed_markers}
          stepPolylines={route.step_polylines}
          currentStopId={view?.order_id ?? null}
          driverCoords={geo.coords}
        />

        {!viewingCurrent && current ? (
          <button
            type="button"
            onClick={driverState.followCurrent}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Sıradaki durağa dön ({current.customer_name})
          </button>
        ) : null}

        {view ? (
          <StopCard
            stop={view}
            totalStops={driverState.totalCount}
            driverCoords={geo.coords}
            viewState={viewState}
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

      {/* Sticky action bar — acts on the viewed stop */}
      {view ? (
        <div className="sticky bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
          {viewStatus.delivered ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12"
                disabled={transitionPending}
                onClick={() => handleRevert(view.order_id)}
              >
                <Undo2 className="mr-1.5 h-4 w-4" /> Geri al
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12"
                disabled={transitionPending}
                onClick={() => setPaymentStop(view)}
              >
                <Wallet className="mr-1.5 h-4 w-4" /> Tahsilat
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12"
                disabled={transitionPending}
                onClick={() =>
                  viewStatus.skipped
                    ? driverState.unskip(view.order_id)
                    : driverState.markSkipped(view.order_id)
                }
              >
                {viewStatus.skipped ? "Tekrar al" : "Atla"}
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12"
                disabled={transitionPending}
                onClick={() => handleDelivered(view.order_id)}
              >
                {transitionPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Teslim Edildi
              </Button>
            </div>
          )}
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

      {/* Collect-on-delivery popup */}
      <DeliveryPaymentDialog
        stop={paymentStop}
        onClose={() => setPaymentStop(null)}
      />

      {/* Change destination (re-optimizes the remaining route) */}
      <Dialog open={destOpen} onOpenChange={setDestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Varış konumunu değiştir</DialogTitle>
            <DialogDescription>
              Kalan duraklar yeni varışa göre yeniden sıralanır. Teslim edilenler
              korunur.
            </DialogDescription>
          </DialogHeader>
          <DestinationPicker
            savedLocations={savedLocations}
            orders={destinationOrders}
            value={destValue}
            className="h-9 w-full"
            onRoundTrip={destRoundTrip}
            onSavedLocation={destSavedLocation}
            onOrder={destOrder}
          />
        </DialogContent>
      </Dialog>

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
