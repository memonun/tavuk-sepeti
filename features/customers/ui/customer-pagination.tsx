/**
 * Pagination footer for the Customers grid. Lifted out of the old
 * customer-table.tsx so it can sit below the new DataGrid without the
 * grid having to know about URL-based paging.
 *
 * Server Component — link-based, preserves all filter/sort search params
 * via the inbound `query` URLSearchParams.
 */
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomerPaginationProps {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly basePath: string;
  readonly query: URLSearchParams;
}

export function CustomerPagination({
  total,
  page,
  pageSize,
  basePath,
  query,
}: CustomerPaginationProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const buildHref = (nextPage: number) => {
    const next = new URLSearchParams(query.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    const search = next.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <p>
        {from}-{to} / toplam {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildHref(page - 1)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Önceki
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Önceki
          </Button>
        )}
        <span>
          Sayfa {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={buildHref(page + 1)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Sonraki
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Sonraki
          </Button>
        )}
      </div>
    </div>
  );
}
