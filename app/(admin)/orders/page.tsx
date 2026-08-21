/**
 * Orders route shell — mirrors the Customers page chrome.
 *
 * Page-level chrome stays minimal: title row + "Yeni Sipariş", the saved-view
 * tab bar, then the <OrderGrid> (which owns its toolbar) and the pagination
 * footer. The orders feature's date-range presets ride in via the grid's
 * `toolbarExtra` slot so they sit glued to the filter builder.
 */
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NewCustomerAction } from "@/app/(admin)/_components/new-customer-action";
import { parseFiltersFromQueryParam } from "@/components/data-grid/filters/filter-types";
import { buttonVariants } from "@/components/ui/button";
import {
  getDateRangeBounds,
  isDateRangePreset,
} from "@/features/orders/application/date-range-presets";
import { GRID_PAGE_SIZE } from "@/features/orders/domain/order.schema";
import { listOrders } from "@/features/orders/application/list-orders";
import { listActiveProducts } from "@/features/products/application/list-products";
import { OrderGrid } from "@/features/orders/ui/order-grid";
import { OrderListFilters } from "@/features/orders/ui/order-list-filters";
import { OrderRowColorLegend } from "@/features/orders/ui/order-row-color-legend";
import { listViewsAction } from "@/features/views/application/list-views";
import { ViewTabs } from "@/features/views/ui/view-tabs";
import { buildViewUrl } from "@/features/views/ui/view-url";
import { cn } from "@/lib/utils";
import { env } from "@/shared/env";

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string;
    range?: string;
    scheduled_from?: string;
    scheduled_to?: string;
    sort?: string;
    order?: string;
    page?: string;
    pageSize?: string;
    view?: string;
    filter?: string;
    q?: string;
  }>;
}

const VIEW_FILTER_KEYS = [
  "status",
  "range",
  "scheduled_from",
  "scheduled_to",
] as const;

const ORDERS_TABLE_ID = "orders";

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;

  const currentFilters = parseFiltersFromQueryParam(params.filter);

  // Resolve the range preset into actual bounds, unless the user picked
  // "Özel…" — then the explicit scheduled_from/to from the URL win.
  const preset = isDateRangePreset(params.range) ? params.range : "all";
  const presetBounds =
    preset === "custom"
      ? { from: params.scheduled_from, to: params.scheduled_to }
      : getDateRangeBounds(preset);

  const [listResult, viewsResult, productsResult] = await Promise.all([
    listOrders({
      status: params.status,
      scheduled_from: presetBounds.from,
      scheduled_to: presetBounds.to,
      sort: params.sort,
      order: params.order,
      // Excel view: load the whole (bounded) table in one shot; grid virtualizes.
      page: "1",
      pageSize: params.pageSize ?? String(GRID_PAGE_SIZE),
      filters: currentFilters,
      q: params.q,
    }),
    listViewsAction(ORDERS_TABLE_ID),
    listActiveProducts(),
  ]);

  // Products feed the side-panel's ProductPicker; a load failure degrades
  // gracefully to an empty catalog (editing still renders, just no add list).
  const products = productsResult.ok ? productsResult.value : [];

  // Views loading failure isn't fatal — render with an empty tab list.
  const views = viewsResult.ok ? viewsResult.value : [];

  const mapsKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  // Default view auto-apply: if the user lands here without any view
  // marker AND has a default view configured, redirect to it. The
  // "Tümü" tab sets ?view=none explicitly so it survives the redirect
  // (i.e., clicking "Tümü" once persists across reloads).
  if (params.view === undefined) {
    const defaultView = views.find((v) => v.isDefault);
    if (defaultView) {
      redirect(buildViewUrl("/orders", defaultView));
    }
  }

  // `?view=none` represents an explicit opt-out from the default → no id.
  const currentViewId =
    params.view && params.view !== "none" ? params.view : null;

  if (!listResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Siparişler yüklenemedi: {listResult.error.message}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] min-w-0 flex-col gap-2">
      {/* Notion-style page header: title left, count + action right */}
      <div className="flex items-baseline justify-between gap-4 px-1">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Siparişler</h1>
          <OrderRowColorLegend />
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            {listResult.value.total} kayıt
          </p>
          {mapsKey ? <NewCustomerAction mapsBrowserKey={mapsKey} /> : null}
          <Link
            href="/orders/new"
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
          >
            <Plus className="h-4 w-4" />
            Yeni Sipariş
          </Link>
        </div>
      </div>

      <ViewTabs
        views={views}
        tableId={ORDERS_TABLE_ID}
        currentViewId={currentViewId}
        filterKeys={VIEW_FILTER_KEYS}
      />

      <OrderGrid
        items={listResult.value.items}
        total={listResult.value.total}
        page={listResult.value.page}
        pageSize={listResult.value.pageSize}
        currentFilters={currentFilters}
        products={products}
        toolbarExtra={<OrderListFilters />}
      />
    </div>
  );
}
