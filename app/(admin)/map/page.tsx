import { listMapPins } from "@/features/map/application/list-pins";
import { CustomerMap } from "@/features/map/ui/customer-map";
import { MapFilters } from "@/features/map/ui/map-filters";
import { env } from "@/shared/env";

interface MapPageProps {
  searchParams: Promise<{ recent?: string }>;
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = await searchParams;
  const recentOrdersOnly = params.recent === "1";

  // Two fetches when filtered, so the counter ("X / Y pins shown") still
  // reflects the unfiltered active total. Cheap RPC + Postgres caches it.
  const [filteredResult, totalResult] = await Promise.all([
    listMapPins({ recentOrdersOnly }),
    recentOrdersOnly ? listMapPins({ recentOrdersOnly: false }) : Promise.resolve(null),
  ]);

  if (!filteredResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Harita verisi yüklenemedi: {filteredResult.error.message}
      </div>
    );
  }

  const totalActive =
    totalResult && totalResult.ok ? totalResult.value.length : filteredResult.value.length;

  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!mapsKey) {
    return (
      <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-6 text-sm text-orange-700 dark:text-orange-300">
        {"Google Maps tarayıcı anahtarı yok — harita gösterilemez."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Harita</h2>
        <p className="text-sm text-muted-foreground">
          Aktif müşterilerin coğrafi görünümü. Pin&apos;e tıkla → mini detay.
        </p>
      </div>

      <MapFilters totalActive={totalActive} shown={filteredResult.value.length} />

      {filteredResult.value.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
          Bu filtreye uyan müşteri yok.
        </div>
      ) : (
        <CustomerMap apiKey={mapsKey} pins={filteredResult.value} />
      )}
    </div>
  );
}
