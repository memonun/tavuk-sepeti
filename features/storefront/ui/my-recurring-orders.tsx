"use client";

/**
 * The signed-in customer's own recurring order requests/subscriptions.
 * Status is derived from three independent signals on the row (see the
 * customer_recurring_requests migration comment on why approved_at is
 * separate from active): cancelled_at wins, then "no approval yet" beats
 * whatever active happens to be, then active/paused.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelMyRecurringOrderAction } from "@/features/storefront/application/recurring-order-request";
import { isWeekday, WEEKDAY_NAMES_TR } from "@/features/storefront/domain/delivery-window";
import { formatDate } from "@/shared/utils/date";

import type { MyRecurringTemplateView } from "@/features/storefront/application/recurring-order-request";

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  biweekly: "İki haftada bir",
  monthly: "Aylık",
};

function statusLabel(t: MyRecurringTemplateView): { text: string; variant: "secondary" | "outline" | "destructive" } {
  if (t.cancelled_at) return { text: "İptal edildi", variant: "outline" };
  if (!t.approved_at) return { text: "Onay bekliyor", variant: "secondary" };
  if (t.active) return { text: "Aktif", variant: "secondary" };
  return { text: "Durduruldu", variant: "outline" };
}

function dayLabel(t: MyRecurringTemplateView): string {
  if (t.day_of_week != null && isWeekday(t.day_of_week)) {
    return WEEKDAY_NAMES_TR[t.day_of_week];
  }
  if (t.day_of_month != null) return `Ayın ${t.day_of_month}.`;
  return "";
}

export function MyRecurringOrders({
  templates,
}: {
  readonly templates: readonly MyRecurringTemplateView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (templates.length === 0) return null;

  const cancel = (id: string) => {
    startTransition(async () => {
      const result = await cancelMyRecurringOrderAction(id);
      if (result.status === "success") {
        toast.success("Düzenli sipariş talebiniz iptal edildi.");
        router.refresh();
        return;
      }
      if (result.status !== "idle") {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <p className="text-sm font-semibold text-foreground">Düzenli siparişlerim</p>
      <ul className="mt-4 flex flex-col gap-3">
        {templates.map((t) => {
          const status = statusLabel(t);
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={status.variant}>{status.text}</Badge>
                  <span className="font-medium text-foreground">
                    {CADENCE_LABELS[t.cadence] ?? t.cadence}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dayLabel(t)} · {t.item_count} ürün
                  {t.active && !t.cancelled_at ? ` · sıradaki: ${formatDate(t.next_run_at)}` : ""}
                </p>
              </div>
              {!t.cancelled_at ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => cancel(t.id)}
                >
                  Vazgeç
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
