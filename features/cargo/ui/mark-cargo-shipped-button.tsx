"use client";

/** Row-level confirmed→shipped shortcut — reuses the same
 *  transitionOrderAction the order detail panel's OrderStatusActions calls,
 *  so the state-machine/audit-log rules stay in one place. */
import { Loader2, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { Button } from "@/components/ui/button";

export function MarkCargoShippedButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const markShipped = () => {
    startTransition(async () => {
      const result = await transitionOrderAction({ order_id: orderId, to_status: "shipped" });
      if (result.status === "success") {
        toast.success("Kargolandı olarak işaretlendi.");
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={markShipped}
      className="gap-1.5"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
      Kargolandı
    </Button>
  );
}
