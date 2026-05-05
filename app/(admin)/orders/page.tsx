import { Plus } from "lucide-react";
import Link from "next/link";

import {
  getDateRangeBounds,
  isDateRangePreset,
} from "@/features/orders/application/date-range-presets";
import { listOrders } from "@/features/orders/application/list-orders";
import { OrderListFilters } from "@/features/orders/ui/order-list-filters";
import { OrderTable } from "@/features/orders/ui/order-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string;
    range?: string;
    scheduled_from?: string;
    scheduled_to?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;

  // Resolve the range preset into actual bounds, unless the user picked
  // "Özel…" — then the explicit scheduled_from/to from the URL win.
  const preset = isDateRangePreset(params.range) ? params.range : "all";
  const presetBounds =
    preset === "custom"
      ? { from: params.scheduled_from, to: params.scheduled_to }
      : getDateRangeBounds(preset);

  const result = await listOrders({
    status: params.status,
    scheduled_from: presetBounds.from,
    scheduled_to: presetBounds.to,
    page: params.page,
    pageSize: params.pageSize,
  });

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Siparişler yüklenemedi: {result.error.message}
      </div>
    );
  }

  // Pagination links preserve the user's filter URL params verbatim — no
  // need to round-trip them through the resolver.
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.range) query.set("range", params.range);
  if (params.scheduled_from) query.set("scheduled_from", params.scheduled_from);
  if (params.scheduled_to) query.set("scheduled_to", params.scheduled_to);
  if (params.pageSize) query.set("pageSize", params.pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Siparişler</h2>
          <p className="text-sm text-muted-foreground">
            Toplam {result.value.total} kayıt.
          </p>
        </div>
        <Link
          href="/orders/new"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Plus className="h-4 w-4" />
          Yeni Sipariş
        </Link>
      </div>

      <OrderListFilters />

      <OrderTable
        items={result.value.items}
        total={result.value.total}
        page={result.value.page}
        pageSize={result.value.pageSize}
        basePath="/orders"
        query={query}
      />
    </div>
  );
}
