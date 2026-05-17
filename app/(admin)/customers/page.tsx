/**
 * Customers route shell — Notion-style chrome.
 *
 * Page-level chrome stays minimal: just the title row + the grid + the
 * pagination footer. The toolbar (search, filter chips, "+ Yeni",
 * "Toplu Yapıştır", "Kolonlar") is owned by <CustomerGrid> so the
 * filter UI sits glued to the table — same single-row pattern Notion
 * uses for its database header.
 */
import { getCustomerFilterOptions } from "@/features/customers/application/get-filter-options";
import { listCustomers } from "@/features/customers/application/list-customers";
import { CustomerGrid } from "@/features/customers/ui/customer-grid";
import { CustomerPagination } from "@/features/customers/ui/customer-pagination";

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
];

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;

  const [listResult, filterOptions] = await Promise.all([
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
  ]);

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
