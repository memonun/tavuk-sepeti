/**
 * Customer table — Server Component. Takes a fetched page from the
 * application layer and renders rows + a pagination footer. Search is in
 * a sibling Client Component (customer-search-bar).
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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

import type { CustomerListItem, CustomerStatus } from "@/features/customers/domain/customer";

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
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Müşteri</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>E-posta</TableHead>
              <TableHead>Şehir</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">Eklenme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`} className="hover:underline">
                    {c.first_name} {c.last_name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatTRPhone(c.phone)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.email ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.city ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status]}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatDate(c.created_at)}
                </TableCell>
              </TableRow>
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
