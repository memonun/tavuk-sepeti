/**
 * Customer table — Server Component. Takes a fetched page from the
 * application layer and renders rows + a pagination footer. Search +
 * filters live in a sibling Client Component (customer-filter-bar).
 *
 * Column headers are click-to-sort (SortableHeader). State lives in the
 * URL so the Server Component re-fetches when the user changes sort.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { SortableHeader } from "@/features/customers/ui/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDate } from "@/shared/utils/date";
import { formatTRPhone } from "@/shared/utils/phone";

import type {
  CustomerAccountType,
  CustomerListItem,
  CustomerStatus,
} from "@/features/customers/domain/customer";

interface CustomerTableProps {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  query: URLSearchParams;
}

const STATUS_VARIANT: Record<
  CustomerStatus,
  "default" | "secondary" | "destructive"
> = {
  active: "default",
  inactive: "secondary",
  blocked: "destructive",
};

const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: "Aktif",
  inactive: "Pasif",
  blocked: "Engelli",
};

const ACCOUNT_TYPE_LABEL: Record<CustomerAccountType, string> = {
  individual: "Birey",
  business: "İşletme",
  charity: "Vakıf",
  bazaar_vendor: "Pazar",
};

export function CustomerTable({
  items,
  total,
  page,
  pageSize,
  basePath,
  query,
}: CustomerTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const buildPageHref = (nextPage: number) => {
    const next = new URLSearchParams(query.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    const search = next.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Sonuç yok. Arama kriterini değiştirmeyi veya yeni müşteri eklemeyi
        deneyebilirsin.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader column="first_name" label="Müşteri" />
              </TableHead>
              <TableHead>
                <SortableHeader column="phone" label="Telefon" />
              </TableHead>
              <TableHead className="hidden sm:table-cell">Şehir</TableHead>
              <TableHead className="hidden md:table-cell">
                <SortableHeader column="tag" label="Kanal" />
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                <SortableHeader column="account_type" label="Tip" />
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                <SortableHeader column="legacy_segment" label="Segment" />
              </TableHead>
              <TableHead>
                <SortableHeader column="status" label="Durum" />
              </TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                <SortableHeader
                  column="created_at"
                  label="Eklenme"
                  align="right"
                  defaultOrder="desc"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <ClickableTableRow key={c.id} href={`/customers/${c.id}`}>
                <TableCell className="font-medium">
                  {c.first_name} {c.last_name}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatTRPhone(c.phone)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {c.city ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {c.tag ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {ACCOUNT_TYPE_LABEL[c.account_type]}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground">
                  {c.legacy_segment ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status]}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right text-muted-foreground">
                  {formatDate(c.created_at)}
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {from}-{to} / toplam {total}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={buildPageHref(page - 1)}
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
              href={buildPageHref(page + 1)}
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
    </div>
  );
}
