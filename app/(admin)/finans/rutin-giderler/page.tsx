import { Plus } from "lucide-react";

import { listExpenseCategoryTree } from "@/features/finance/application/list-expense-categories";
import {
  listRecurringExpenseTemplates,
  listRecurringExpenseTemplatesFull,
} from "@/features/finance/application/list-recurring-expense-templates";
import { materializeDueRecurringExpenses } from "@/features/finance/application/materialize-due-recurring-expenses";
import { activeCategoryNodes } from "@/features/finance/domain/expense-category";
import { RecurringExpenseTemplateFormDialog } from "@/features/finance/ui/recurring-expense-template-form";
import { RecurringExpenseTemplateTable } from "@/features/finance/ui/recurring-expense-template-table";
import { Button } from "@/components/ui/button";
import { todayInIstanbul } from "@/shared/utils/date";

export default async function RutinGiderlerPage() {
  // Lazy materialization: viewing this page (like Giderler / Finans Özeti)
  // is what drives generation — no external cron (spec §14).
  await materializeDueRecurringExpenses(todayInIstanbul());

  const [itemsResult, templatesResult, categoryTreeResult] = await Promise.all([
    listRecurringExpenseTemplates(),
    listRecurringExpenseTemplatesFull(),
    listExpenseCategoryTree(),
  ]);

  if (!itemsResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Rutin giderler yüklenemedi: {itemsResult.error.message}
      </div>
    );
  }
  if (!templatesResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Rutin giderler yüklenemedi: {templatesResult.error.message}
      </div>
    );
  }
  if (!categoryTreeResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Kategoriler yüklenemedi: {categoryTreeResult.error.message}
      </div>
    );
  }

  const categoryTree = categoryTreeResult.value;
  const activeCategories = activeCategoryNodes(categoryTree);
  const templatesById = new Map(templatesResult.value.map((t) => [t.id, t]));

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Rutin Giderler</h2>
          <p className="text-sm text-muted-foreground">
            Her ay tekrar eden giderleri (fatura, abonelik, kira) tanımla — ödeme bekleyen kayıt
            otomatik oluşur.
          </p>
        </div>
        <RecurringExpenseTemplateFormDialog
          mode="create"
          categories={activeCategories}
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Rutin Gider Ekle
            </Button>
          }
        />
      </div>

      <RecurringExpenseTemplateTable
        items={itemsResult.value}
        templatesById={templatesById}
        categories={categoryTree}
      />
    </div>
  );
}
