/**
 * Giderler table — Server Component. Copies
 * features/customers/ui/customer-table.tsx's shape: fetched page in,
 * SortableHeader columns, Link-based pagination footer.
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
import { formatTRY } from "@/shared/utils/money";
import {
  EXPENSE_PAYMENT_STATUS_LABELS,
  MANUAL_PAYMENT_METHOD_LABELS,
  type Expense,
} from "@/features/finance/domain/expense";
import { ExpenseRowActions } from "@/features/finance/ui/expense-row-actions";
import { FinanceSortableHeader } from "@/features/finance/ui/finance-sortable-header";

interface ExpenseTableProps {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  query: URLSearchParams;
}

export function ExpenseTable({ items, total, page, pageSize, basePath, query }: ExpenseTableProps) {
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
        Kayıtlı gider yok. Sağ üstten &quot;Gider Ekle&quot; ile başlayabilirsin.
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
                <FinanceSortableHeader
                  column="expense_date"
                  label="Tarih"
                  defaultOrder="desc"
                  defaultSort="expense_date"
                />
              </TableHead>
              <TableHead>
                <FinanceSortableHeader column="category" label="Kategori" defaultSort="expense_date" />
              </TableHead>
              <TableHead className="hidden md:table-cell">Açıklama</TableHead>
              <TableHead className="text-right">
                <FinanceSortableHeader
                  column="amount_minor"
                  label="Tutar"
                  align="right"
                  defaultOrder="desc"
                  defaultSort="expense_date"
                />
              </TableHead>
              <TableHead>
                <FinanceSortableHeader
                  column="payment_status"
                  label="Ödeme Durumu"
                  defaultSort="expense_date"
                />
              </TableHead>
              <TableHead className="hidden sm:table-cell">Ödeme Yöntemi</TableHead>
              <TableHead className="hidden lg:table-cell">Firma / Kişi</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="text-muted-foreground">
                  {formatDate(expense.expense_date)}
                </TableCell>
                <TableCell className="font-medium">{expense.category}</TableCell>
                <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">
                  {expense.description ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatTRY(expense.amount_minor)}
                </TableCell>
                <TableCell>
                  <Badge variant={expense.payment_status === "paid" ? "default" : "secondary"}>
                    {EXPENSE_PAYMENT_STATUS_LABELS[expense.payment_status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {expense.payment_method ? MANUAL_PAYMENT_METHOD_LABELS[expense.payment_method] : "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {expense.vendor ?? "—"}
                </TableCell>
                <TableCell>
                  <ExpenseRowActions expense={expense} />
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
