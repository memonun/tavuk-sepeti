"use client";

/**
 * "Aras kaydını iptal et" — deletes the order's record at Aras Kargo but keeps
 * the order (e.g. the parcel went out by hand). Asks first: it can't be
 * undone, though "Aras'a Gönder" creates the record again.
 */
import { Loader2, XCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cancelArasShipmentAction } from "@/features/cargo/application/send-to-aras";

export function CancelArasButton({ orderId, arasCode }: { orderId: string; arasCode: string }) {
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    if (
      !window.confirm(
        `Aras'taki ${arasCode} kodlu kayıt silinsin mi? Sipariş iptal edilmez, sadece Aras kaydı silinir.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await cancelArasShipmentAction({ order_id: orderId });
      if (result.status === "success") {
        toast.success("Aras kaydı silindi.");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={cancel}
      className="gap-1.5 text-destructive hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}
      Aras kaydını iptal et
    </Button>
  );
}
