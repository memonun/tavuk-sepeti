"use client";

/**
 * Route planning controls: start time + a REQUIRED start-location picker +
 * the Optimize action. The origin (saved location or the driver's live
 * position) must be chosen before optimizing — it's carried in the URL
 * (originLat/Lng/Name) and flows into both the optimize fetch and the drive
 * view. Picking a new origin drops ?optimize so the route re-computes from it.
 */
import { Loader2, MapPin, Navigation, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SavedLocation } from "@/features/routing/domain/saved-location";

const USE_MY_LOCATION = "__myloc__";
const MY_LOCATION_NAME = "Konumum";

interface RouteControlsProps {
  date: string;
  startHHmm: string;
  optimized: boolean;
  hasOrders: boolean;
  savedLocations: ReadonlyArray<SavedLocation>;
  originName: string | null;
  hasOrigin: boolean;
}

export function RouteControls({
  date,
  startHHmm,
  optimized,
  hasOrders,
  savedLocations,
  originName,
  hasOrigin,
}: RouteControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);

  const replaceParams = (mutate: (p: URLSearchParams) => void) => {
    const updated = new URLSearchParams(params.toString());
    updated.set("date", date);
    mutate(updated);
    startTransition(() => router.replace(`${pathname}?${updated.toString()}`));
  };

  const setStart = (next: string) => {
    if (!next) return;
    // Keep ?optimize so ETA recalculates against the new start time.
    replaceParams((p) => p.set("start", next));
  };

  // Picking a new origin re-computes the route, so drop ?optimize.
  const setOrigin = (lat: number, lng: number, name: string) => {
    replaceParams((p) => {
      p.set("originLat", String(lat));
      p.set("originLng", String(lng));
      p.set("originName", name);
      p.delete("optimize");
    });
  };

  const pickMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Bu tarayıcıda konum desteklenmiyor.");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      toast.error("Konum için güvenli bağlantı (HTTPS) gerekli.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin(pos.coords.latitude, pos.coords.longitude, MY_LOCATION_NAME);
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Konum izni reddedildi."
            : "Konum alınamadı, tekrar dene.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  };

  const onPick = (value: string) => {
    if (!value) return;
    if (value === USE_MY_LOCATION) {
      pickMyLocation();
      return;
    }
    const loc = savedLocations.find((l) => l.id === value);
    if (loc) setOrigin(loc.lat, loc.lng, loc.name);
  };

  const optimize = () => {
    replaceParams((p) => {
      p.set("start", startHHmm);
      p.set("optimize", "1");
    });
  };

  const reset = () => replaceParams((p) => p.delete("optimize"));

  // Reflect the current origin in the picker.
  const currentValue = (() => {
    if (!hasOrigin) return "";
    const match = savedLocations.find((l) => l.name === originName);
    if (match) return match.id;
    return USE_MY_LOCATION;
  })();

  const busy = pending || locating;

  return (
    <div className="flex flex-wrap items-end gap-3 border-b pb-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="route-start-time" className="text-xs">
          Başlangıç saati
        </Label>
        <Input
          id="route-start-time"
          type="time"
          value={startHHmm}
          onChange={(e) => setStart(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          Başlangıç konumu <span className="text-destructive">*</span>
        </Label>
        <Select
          value={currentValue}
          onValueChange={(v) => v && onPick(v)}
          disabled={busy}
        >
          <SelectTrigger className="h-9 w-56" aria-label="Başlangıç konumu seç">
            {locating ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Konum alınıyor…
              </span>
            ) : (
              <SelectValue placeholder="Konum seç…">
                {(v: unknown) =>
                  v === USE_MY_LOCATION
                    ? (originName ?? MY_LOCATION_NAME)
                    : (savedLocations.find((l) => l.id === v)?.name ??
                      "Konum seç…")
                }
              </SelectValue>
            )}
          </SelectTrigger>
          <SelectContent>
            {savedLocations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {l.name}
                </span>
              </SelectItem>
            ))}
            {savedLocations.length > 0 ? <SelectSeparator /> : null}
            <SelectItem value={USE_MY_LOCATION}>
              <span className="flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
                Konumumu kullan
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {optimized ? (
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={busy}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Optimizasyonu kaldır
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={optimize}
          disabled={busy || !hasOrders || !hasOrigin}
          className="gap-1.5"
          title={!hasOrigin ? "Önce başlangıç konumu seç" : undefined}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Rotayı Optimize Et
        </Button>
      )}
    </div>
  );
}
