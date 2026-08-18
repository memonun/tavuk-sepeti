/**
 * Global recurring-templates overview list.
 *
 * Read-only Server Component — renders every template across all customers.
 * No mutations here; editing lives on the /customers/[id] page.
 *
 * Reuses the same cadence/day labels as customer-recurring-list.tsx.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/shared/utils/date";

import type {
  RecurringCadence,
  RecurringTemplateListItem,
} from "@/features/recurring/domain/recurring-template";

// ---------------------------------------------------------------------------
// Pure label helpers (mirrors customer-recurring-list.tsx)
// ---------------------------------------------------------------------------

const DOW_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

function dowLabel(n: number): string {
  return DOW_LABELS[n] ?? String(n);
}

const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: "Haftalık",
  biweekly: "İki haftada bir",
  monthly: "Aylık",
};

function cadenceDayLabel(item: RecurringTemplateListItem): string {
  const cadenceStr = CADENCE_LABELS[item.cadence];
  if (item.cadence === "monthly" && item.day_of_month != null) {
    return `${cadenceStr} · ayın ${item.day_of_month}.`;
  }
  if (item.day_of_week != null) {
    return `${cadenceStr} · ${dowLabel(item.day_of_week)}`;
  }
  return cadenceStr;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash_on_delivery: "Kapıda nakit",
  bank_transfer: "Havale",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RecurringOverviewListProps {
  readonly templates: readonly RecurringTemplateListItem[];
}

export function RecurringOverviewList({ templates }: RecurringOverviewListProps) {
  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Henüz tekrarlanan sipariş yok.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {templates.map((t) => (
        <li
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
        >
          {/* Left: customer name + cadence + next run */}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="font-medium">
              <Link
                href={`/customers/${t.customer_id}`}
                className="underline-offset-2 hover:underline"
              >
                {t.customer_name}
              </Link>
            </div>
            <div className="text-muted-foreground text-xs">
              {cadenceDayLabel(t)}
              <span className="mx-1.5">·</span>
              {t.item_count} ürün
              <span className="mx-1.5">·</span>
              {PAYMENT_LABELS[t.payment_method] ?? t.payment_method}
              <span className="mx-1.5">·</span>
              Sonraki: {formatDate(t.next_run_at)}
            </div>
          </div>

          {/* Right: pending-request badge (source='customer_web', never
              approved yet) takes priority over the active/paused badge — a
              fresh request and a staff-paused subscription both have
              active=false, and only approved_at tells them apart. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {t.source === "customer_web" && t.approved_at === null ? (
              <Badge variant="destructive">Yeni talep</Badge>
            ) : null}
            <Badge variant={t.active ? "default" : "secondary"}>
              {t.active ? "Aktif" : "Durdu"}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
