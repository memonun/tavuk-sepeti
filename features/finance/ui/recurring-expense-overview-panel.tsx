/**
 * "Yaklaşan Rutin Giderler" — the admin Panel's detailed view of what is due.
 * Server Component. Unpaid rows (this month's bills are generated as soon as
 * the month starts) are what can be overdue; "Planlı" rows are a template's
 * next occurrence that has not been generated yet. `~` marks an estimated
 * (variable) amount, never a firm figure.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MANUAL_PAYMENT_METHOD_LABELS } from "@/features/finance/domain/expense";
import type {
  RecurringExpenseDueItem,
  RecurringExpenseOverview,
} from "@/features/finance/domain/recurring-expense-overview";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

function dueLabel(item: RecurringExpenseDueItem): string {
  if (item.daysUntil < 0) return `${-item.daysUntil} gün gecikti`;
  if (item.daysUntil === 0) return "Bugün";
  if (item.daysUntil === 1) return "Yarın";
  return `${item.daysUntil} gün kaldı`;
}

function Summary({
  label,
  count,
  totalMinor,
  tone,
}: {
  label: string;
  count: number;
  totalMinor: number;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "danger" && count > 0 && "border-destructive/40 bg-destructive/10",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "danger" && count > 0 && "text-destructive",
        )}
      >
        {formatTRY(totalMinor)}
      </p>
      <p className="text-xs text-muted-foreground">{count} kalem</p>
    </div>
  );
}

export function RecurringExpenseOverviewPanel({
  overview,
}: {
  overview: RecurringExpenseOverview;
}) {
  return (
    <section aria-label="Yaklaşan rutin giderler" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">Yaklaşan Rutin Giderler</h3>
        <div className="flex gap-4 text-sm">
          <Link
            href="/finans/giderler?payment_status=pending"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Ödeme bekleyen giderler
          </Link>
          <Link
            href="/finans/rutin-giderler"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Rutin giderleri yönet →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary
          label="Gecikmiş"
          count={overview.overdue.count}
          totalMinor={overview.overdue.totalMinor}
          tone="danger"
        />
        <Summary
          label="Bu ay ödenecek (bugünden itibaren)"
          count={overview.restOfMonth.count}
          totalMinor={overview.restOfMonth.totalMinor}
        />
        <Summary
          label="Toplam bekleyen"
          count={overview.overdue.count + overview.restOfMonth.count}
          totalMinor={overview.pendingTotalMinor}
        />
      </div>

      {overview.items.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Bekleyen veya yaklaşan rutin gider yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gider</TableHead>
                <TableHead>Vade</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Ödeme</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.items.map((item) => (
                <TableRow
                  key={item.key}
                  className={item.urgency === "overdue" ? "bg-destructive/5" : undefined}
                >
                  <TableCell>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.categoryLabel}
                      {item.vendor ? ` · ${item.vendor}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p>{formatDate(`${item.dueDate}T12:00:00+03:00`)}</p>
                    <p
                      className={cn(
                        "text-xs",
                        item.urgency === "overdue"
                          ? "font-medium text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {dueLabel(item)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.kind === "planned" ? (
                      <Badge variant="outline">Planlı</Badge>
                    ) : item.urgency === "overdue" ? (
                      <Badge variant="destructive">Gecikmiş</Badge>
                    ) : (
                      <Badge variant="secondary">Ödeme bekliyor</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.paymentMethod ? MANUAL_PAYMENT_METHOD_LABELS[item.paymentMethod] : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {item.isEstimate ? "~ " : ""}
                    {formatTRY(item.amountMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
