/** Rutin Giderler table — Server Component, mirrors
 *  features/finance/ui/expense-table.tsx's shape (no pagination here: the
 *  number of recurring templates is small by nature, unlike expenses). */
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import {
  RECURRING_EXPENSE_AMOUNT_TYPE_LABELS,
  RECURRING_EXPENSE_CADENCE_LABELS,
} from "@/features/finance/domain/recurring-expense-template";
import { formatCategoryPath } from "@/features/finance/domain/expense-category";
import { RecurringExpenseTemplateRowActions } from "@/features/finance/ui/recurring-expense-template-row-actions";

import type { ExpenseCategoryNode } from "@/features/finance/domain/expense-category";
import type {
  RecurringExpenseTemplate,
  RecurringExpenseTemplateListItem,
} from "@/features/finance/domain/recurring-expense-template";

interface RecurringExpenseTemplateTableProps {
  items: RecurringExpenseTemplateListItem[];
  /** Full templates (not just list items) — the edit dialog needs every
   *  field, not the compact projection. */
  templatesById: Map<string, RecurringExpenseTemplate>;
  categories: readonly ExpenseCategoryNode[];
}

function cadenceLabel(item: RecurringExpenseTemplateListItem): string {
  const base = RECURRING_EXPENSE_CADENCE_LABELS[item.cadence];
  if (item.cadence === "weekly" || item.day_of_month === null) return base;
  return `${base} (ayın ${item.day_of_month}. günü)`;
}

export function RecurringExpenseTemplateTable({
  items,
  templatesById,
  categories,
}: RecurringExpenseTemplateTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Henüz rutin gider yok. Sağ üstten &quot;Rutin Gider Ekle&quot; ile başlayabilirsin.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gider Adı</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead className="hidden lg:table-cell">Firma / Kişi</TableHead>
            <TableHead>Tekrar Sıklığı</TableHead>
            <TableHead>Sonraki Tarih</TableHead>
            <TableHead className="hidden md:table-cell">Tutar Tipi</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="text-right">İşlemler</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const template = templatesById.get(item.id);
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCategoryPath(item.category_name, item.category_parent_name)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {item.vendor ?? "—"}
                </TableCell>
                <TableCell>{cadenceLabel(item)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(item.next_run_at)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {RECURRING_EXPENSE_AMOUNT_TYPE_LABELS[item.amount_type]}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {item.amount_type === "variable" ? "~ " : ""}
                  {formatTRY(item.default_amount_minor)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.active ? "default" : "secondary"}>
                    {item.active ? "Aktif" : "Durduruldu"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {template ? (
                    <RecurringExpenseTemplateRowActions template={template} categories={categories} />
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
