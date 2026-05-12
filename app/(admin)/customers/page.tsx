import { Plus } from "lucide-react";
import Link from "next/link";

import { getCustomerFilterOptions } from "@/features/customers/application/get-filter-options";
import { listCustomers } from "@/features/customers/application/list-customers";
import { CustomerFilterBar } from "@/features/customers/ui/customer-filter-bar";
import { CustomerTable } from "@/features/customers/ui/customer-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomersPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    city?: string;
    tag?: string;
    account_type?: string;
    legacy_segment?: string;
    sort?: string;
    order?: string;
    page?: string;
    pageSize?: string;
  }>;
}

// URL params the table propagates into pagination links so the user
// doesn't lose their sort/filter state when paging.
const PRESERVE_KEYS: (keyof Awaited<CustomersPageProps["searchParams"]>)[] = [
  "q",
  "status",
  "city",
  "tag",
  "account_type",
  "legacy_segment",
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

  // Reconstruct the URLSearchParams the table needs for pagination link-
  // building. Includes sort/filter so the user doesn't lose state.
  const query = new URLSearchParams();
  for (const key of PRESERVE_KEYS) {
    const value = params[key];
    if (value) query.set(key, value);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Müşteriler</h2>
          <p className="text-sm text-muted-foreground">
            Toplam {listResult.value.total} kayıt.
          </p>
        </div>
        <Link
          href="/customers/new"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Plus className="h-4 w-4" />
          Yeni Müşteri
        </Link>
      </div>

      <CustomerFilterBar
        cities={filterOptions.cities}
        tags={filterOptions.tags}
        legacySegments={filterOptions.legacySegments}
      />

      <CustomerTable
        items={listResult.value.items}
        total={listResult.value.total}
        page={listResult.value.page}
        pageSize={listResult.value.pageSize}
        basePath="/customers"
        query={query}
      />
    </div>
  );
}
