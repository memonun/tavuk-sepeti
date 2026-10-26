"use client";

/**
 * Sends a queued cargo order's recipient data to Aras Kargo. After that the
 * Kargo Kartı shows the Aras code, which staff give at the branch instead of
 * reading the address aloud. Once sent, the button re-sends (e.g. after the
 * address was corrected); Aras updates the same record.
 */
import { Loader2, RefreshCw, Send } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendOrderToArasAction } from "@/features/cargo/application/send-to-aras";

export function SendToArasButton({
  orderId,
  alreadySent,
}: {
  orderId: string;
  alreadySent: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const send = () => {
    startTransition(async () => {
      const result = await sendOrderToArasAction({ order_id: orderId });
      if (result.status === "success") {
        toast.success(`Aras'a gönderildi. Aras kodu: ${result.integrationCode}`);
      } else {
        toast.error(result.message);
      }
    });
  };

  const Icon = pending ? Loader2 : alreadySent ? RefreshCw : Send;

  return (
    <Button
      type="button"
      variant={alreadySent ? "ghost" : "outline"}
      size="sm"
      disabled={pending}
      onClick={send}
      className="gap-1.5"
      title={alreadySent ? "Bilgileri Aras'a tekrar gönder" : undefined}
    >
      <Icon className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {alreadySent ? "Aras'a tekrar gönder" : "Aras'a Gönder"}
    </Button>
  );
}
