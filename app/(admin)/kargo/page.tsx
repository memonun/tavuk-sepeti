/**
 * Kargo — cargo prep queue. Every confirmed shipping-channel order not yet
 * marked "shipped", oldest first, plus the aggregate product manifest for
 * what needs to be packed before the carrier's next pickup. Mirrors the
 * simplicity of the Routes planning page (plain async Server Component, no
 * map/drive-mode) — cargo has no daily van route to optimize.
 *
 * Below the queue: a paginated archive of orders already marked "Kargolandı"
 * — the queue only ever shows what still needs packing, so once an order
 * ships it disappears from it with no trail. This section is that trail.
 */
import { getCargoOrders } from "@/features/cargo/application/get-cargo-orders";
import { CargoManifestPanel } from "@/features/cargo/ui/cargo-manifest-panel";
import { CargoOrderTable } from "@/features/cargo/ui/cargo-order-table";
import { CargoShippedOrderTable } from "@/features/cargo/ui/cargo-shipped-order-table";
import { listOrders } from "@/features/orders/application/list-orders";

const SHIPPED_PAGE_SIZE = 25;

export default async function KargoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const shippedPage = Math.max(1, Number(params.page) || 1);

  const [queueResult, shippedResult] = await Promise.all([
    getCargoOrders(),
    listOrders({
      fulfillment_channel: "shipping",
      status: "shipped",
      sort: "created_at",
      order: "desc",
      page: shippedPage,
      pageSize: SHIPPED_PAGE_SIZE,
    }),
  ]);

  if (!queueResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Kargo kuyruğu yüklenemedi: {queueResult.error.message}
      </div>
    );
  }

  const { orders, manifest } = queueResult.value;

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

      <div className="pt-4">
        <h3 className="text-lg font-semibold tracking-tight">Kargolanan Siparişler</h3>
        <p className="text-sm text-muted-foreground">
          Daha önce kargoya verilmiş siparişlerin geçmişi.
        </p>
        <div className="mt-3">
          {shippedResult.ok ? (
            <CargoShippedOrderTable
              orders={shippedResult.value.items}
              total={shippedResult.value.total}
              page={shippedResult.value.page}
              pageSize={shippedResult.value.pageSize}
            />
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
              Kargolanan siparişler yüklenemedi: {shippedResult.error.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
