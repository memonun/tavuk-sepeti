/**
 * Customers route shell — Notion-style chrome.
 *
 * Page-level chrome stays minimal: just the title row + the grid + the
 * pagination footer. The toolbar (search, filter chips, "+ Yeni",
 * "Toplu Yapıştır", "Kolonlar") is owned by <CustomerGrid> so the
 * filter UI sits glued to the table — same single-row pattern Notion
 * uses for its database header.
 */
import { redirect } from "next/navigation";

import { getCustomerFilterOptions } from "@/features/customers/application/get-filter-options";
import { listCustomers } from "@/features/customers/application/list-customers";
import { CustomerGrid } from "@/features/customers/ui/customer-grid";
import { CustomerPagination } from "@/features/customers/ui/customer-pagination";
import { listViewsAction } from "@/features/views/application/list-views";
import { ViewTabs } from "@/features/views/ui/view-tabs";
import { buildViewUrl } from "@/features/views/ui/view-url";

interface CustomersPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    city?: string;
    tag?: string;
    account_type?: string;
    legacy_segment?: string;
    location?: string;
    sort?: string;
    order?: string;
    page?: string;
    pageSize?: string;
    view?: string;
  }>;
}

const PRESERVE_KEYS: (keyof Awaited<CustomersPageProps["searchParams"]>)[] = [
  "q",
  "status",
  "city",
  "tag",
  "account_type",
  "legacy_segment",
  "location",
  "sort",
  "order",
  "pageSize",
  "view",
];

const VIEW_FILTER_KEYS = [
  "q",
  "status",
  "city",
  "tag",
  "account_type",
  "legacy_segment",
  "location",
] as const;

const CUSTOMERS_TABLE_ID = "customers";

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;

  const [listResult, filterOptions, viewsResult] = await Promise.all([
    listCustomers({
      q: params.q,
      status: params.status,
      city: params.city,
      tag: params.tag,
      account_type: params.account_type,
      legacy_segment: params.legacy_segment,
      location: params.location,
      sort: params.sort,
      order: params.order,
      page: params.page,
      pageSize: params.pageSize,
    }),
    getCustomerFilterOptions(),
    listViewsAction(CUSTOMERS_TABLE_ID),
  ]);

  // Views loading failure isn't fatal — render with an empty tab list.
  const views = viewsResult.ok ? viewsResult.value : [];

  // Default view auto-apply: if the user lands here without any view
  // marker AND has a default view configured, redirect to it. The
  // "Tümü" tab sets ?view=none explicitly so it survives the redirect
  // (i.e., clicking "Tümü" once persists across reloads).
  if (params.view === undefined) {
    const defaultView = views.find((v) => v.isDefault);
    if (defaultView) {
      redirect(buildViewUrl("/customers", defaultView));
    }
  }

  // `?view=none` represents an explicit opt-out from the default → no id.
  const currentViewId =
    params.view && params.view !== "none" ? params.view : null;

  if (!listResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Müşteriler yüklenemedi: {listResult.error.message}
      </div>
    );
  }

  const query = new URLSearchParams();
  for (const key of PRESERVE_KEYS) {
    const value = params[key];
    if (value) query.set(key, value);
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-2">
      {/* Notion-style page header: title left, count right, single line */}
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h1 className="text-lg font-semibold tracking-tight">Müşteriler</h1>
        <p className="text-xs text-muted-foreground">
          {listResult.value.total} kayıt
        </p>
      </div>

      <ViewTabs
        views={views}
        tableId={CUSTOMERS_TABLE_ID}
        currentViewId={currentViewId}
        filterKeys={VIEW_FILTER_KEYS}
      />

      <CustomerGrid
        items={listResult.value.items}
        total={listResult.value.total}
        page={listResult.value.page}
        pageSize={listResult.value.pageSize}
        cities={filterOptions.cities}
        tags={filterOptions.tags}
        legacySegments={filterOptions.legacySegments}
      />

      <CustomerPagination
        total={listResult.value.total}
        page={listResult.value.page}
        pageSize={listResult.value.pageSize}
        basePath="/customers"
        query={query}
      />
    </div>
  );
}
