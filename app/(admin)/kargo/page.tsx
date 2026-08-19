/**
 * Kargo — cargo prep queue. Every confirmed shipping-channel order not yet
 * marked "shipped", oldest first, plus the aggregate product manifest for
 * what needs to be packed before the carrier's next pickup. Mirrors the
 * simplicity of the Routes planning page (plain async Server Component, no
 * map/drive-mode) — cargo has no daily van route to optimize.
 */
import { getCargoOrders } from "@/features/cargo/application/get-cargo-orders";
import { CargoManifestPanel } from "@/features/cargo/ui/cargo-manifest-panel";
import { CargoOrderTable } from "@/features/cargo/ui/cargo-order-table";

export default async function KargoPage() {
  const result = await getCargoOrders();

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Kargo kuyruğu yüklenemedi: {result.error.message}
      </div>
    );
  }

  const { orders, manifest } = result.value;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Kargo</h2>
        <p className="text-sm text-muted-foreground">
          Malatya dışı, kargoyla gönderilecek onaylı siparişler ve hazırlanacak ürün toplamları.
        </p>
      </div>

      <CargoManifestPanel manifest={manifest} />
      <CargoOrderTable orders={orders} />
    </div>
  );
}
