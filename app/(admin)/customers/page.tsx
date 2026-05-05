import { Plus } from "lucide-react";
import Link from "next/link";

import { listCustomers } from "@/features/customers/application/list-customers";
import { CustomerSearchBar } from "@/features/customers/ui/customer-search-bar";
import { CustomerTable } from "@/features/customers/ui/customer-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomersPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;

  const result = await listCustomers({
    q: params.q,
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
  });

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Müşteriler yüklenemedi: {result.error.message}
      </div>
    );
  }

  // Reconstruct the URLSearchParams the table needs for pagination link-building.
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.pageSize) query.set("pageSize", params.pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Müşteriler</h2>
          <p className="text-sm text-muted-foreground">
            Toplam {result.value.total} kayıt.
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

      <CustomerSearchBar />

      <CustomerTable
        items={result.value.items}
        total={result.value.total}
        page={result.value.page}
        pageSize={result.value.pageSize}
        basePath="/customers"
        query={query}
      />
    </div>
  );
}
