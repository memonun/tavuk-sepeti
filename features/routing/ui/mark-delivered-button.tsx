"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { Button } from "@/components/ui/button";

interface MarkDeliveredButtonProps {
  orderId: string;
}

export function MarkDeliveredButton({ orderId }: MarkDeliveredButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handle = () => {
    setError(null);
    startTransition(async () => {
      const result = await transitionOrderAction({
        order_id: orderId,
        to_status: "delivered",
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handle}
        disabled={pending}
        className="gap-1.5"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Teslim Edildi
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
