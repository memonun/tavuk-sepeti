/**
 * Global recurring-templates overview page.
 *
 * Read-only Server Component — lists every template across all customers.
 * Editing lives on the individual /customers/[id] page.
 */
import { listAllRecurringTemplatesAction } from "@/features/recurring/application/recurring-template-actions";
import { RecurringOverviewList } from "@/features/recurring/ui/recurring-overview-list";

export default async function RecurringPage() {
  const result = await listAllRecurringTemplatesAction();

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Tekrarlanan siparişler yüklenemedi: {result.error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">
          Tekrarlanan Siparişler
        </h1>
        <p className="text-xs text-muted-foreground">
          {result.value.length} şablon
        </p>
      </div>
      <RecurringOverviewList templates={result.value} />
    </div>
  );
}
