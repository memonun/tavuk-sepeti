"use client";

/**
 * "Ödeme" column cell for the Orders grid — click-to-mark-paid, mirroring the
 * "Tamamı ödendi" shortcut in the order detail panel's Tahsilat section.
 *
 * payment_status is DERIVED from the order_payments ledger (recompute
 * trigger), so this isn't a plain field edit like the other grid columns:
 * clicking records the remaining balance as a payment via the same
 * markOrderFullyPaidAction the detail panel uses, rather than writing
 * payment_status directly (which would drift from the ledger on the next
 * recompute). Nothing to do once already paid, so the cell stops being
 * clickable at that point.
 */
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { markOrderFullyPaidAction } from "@/features/orders/application/payments";
import { isAwaitingCardPayment } from "@/features/orders/domain/payment";
import { PAID_ROW_BACKGROUND } from "@/features/orders/ui/order-row-color";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTRY } from "@/shared/utils/money";

import type { OrderListItem } from "@/features/orders/domain/order";

const PAYMENT_LABELS: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  pending: { label: "Bekliyor", variant: "secondary" },
  partial: { label: "Kısmi", variant: "outline" },
  paid: { label: "Ödendi", variant: "default" },
  failed: { label: "Başarısız", variant: "destructive" },
  refunded: { label: "İade", variant: "outline" },
};

export function PaymentStatusCell({ order }: { order: OrderListItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const meta = isAwaitingCardPayment(order)
    ? { label: "Kart bekliyor", variant: "destructive" as const }
    : (PAYMENT_LABELS[order.payment_status] ?? {
        label: order.payment_status,
        variant: "secondary" as const,
      });
  const balance = order.total_minor - order.amount_paid_minor;
  const isPaid = order.payment_status === "paid" && !isAwaitingCardPayment(order);

  const badge = (
    <div
      className="-mx-2 -my-1 flex items-center gap-1.5 px-2 py-1"
      style={isPaid ? { backgroundColor: PAID_ROW_BACKGROUND } : undefined}
    >
      <Badge variant={meta.variant}>{meta.label}</Badge>
      {balance > 0 && order.amount_paid_minor > 0 ? (
        <span className="text-[10px] text-muted-foreground">
          kalan {formatTRY(balance)}
        </span>
      ) : null}
    </div>
  );

  if (isPaid || balance <= 0) return badge;

  const confirmPaid = () => {
    startTransition(async () => {
      const result = await markOrderFullyPaidAction({ order_id: order.id });
      if (result.status === "success") {
        toast.success(`${order.order_number} ödendi olarak işaretlendi.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="-mx-2 -my-1 flex w-[calc(100%+1rem)] cursor-pointer items-center px-2 py-1 text-left"
      >
        {badge}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{order.order_number} ödendi olarak işaretlensin mi?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Kalan {formatTRY(balance)} tutar, {order.payment_method === "bank_transfer" ? "havale/EFT" : "nakit"}{" "}
            tahsilat olarak kaydedilecek — detay panelindeki &ldquo;Tamamı ödendi&rdquo; ile aynı işlem.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Vazgeç
            </Button>
            <Button type="button" onClick={confirmPaid} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ödendi olarak işaretle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
