"use client";

import { CheckCircle2, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { Button } from "@/components/ui/button";

import type { OrderStatus } from "@/features/orders/domain/order";

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
}

export function OrderStatusActions({
  orderId,
  currentStatus,
}: OrderStatusActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const dispatch = (
    toStatus: OrderStatus,
    opts: { reason?: string } = {},
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await transitionOrderAction({
        order_id: orderId,
        to_status: toStatus,
        reason: opts.reason ?? null,
      });
      if (result.status === "success") {
        setCancelMode(false);
        setCancelReason("");
        router.refresh();
        return;
      }
      if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  const canConfirm = currentStatus === "pending";
  const canDeliver = currentStatus === "confirmed";
  const canCancel = currentStatus === "pending" || currentStatus === "confirmed";

  if (!canConfirm && !canDeliver && !canCancel) {
    return (
      <p className="text-xs text-muted-foreground">
        Bu sipariş kapalı. Durum değişikliği yapılamaz.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canConfirm ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => dispatch("confirmed")}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Onayla
          </Button>
        ) : null}
        {canDeliver ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => dispatch("delivered")}
            className="gap-1.5"
          >
            <Truck className="h-3.5 w-3.5" />
            Teslim Edildi
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setCancelMode((v) => !v)}
            className="gap-1.5 text-destructive"
          >
            <X className="h-3.5 w-3.5" />
            İptal Et
          </Button>
        ) : null}
      </div>

      {cancelMode ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <label htmlFor="cancel_reason" className="text-xs font-medium">
            İptal nedeni (zorunlu)
          </label>
          <textarea
            id="cancel_reason"
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Müşteri vazgeçti, ürün stokta yok, vb."
            className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setCancelMode(false);
                setCancelReason("");
              }}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending || cancelReason.trim().length === 0}
              onClick={() => dispatch("cancelled", { reason: cancelReason })}
            >
              {pending ? "İptal ediliyor…" : "İptali Onayla"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
