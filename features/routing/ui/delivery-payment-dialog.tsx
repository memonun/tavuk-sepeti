"use client";

/**
 * Collect-on-delivery popup. Opens right after a stop is marked delivered so
 * the driver can record what was actually paid at the door — full balance in
 * one tap, or a partial amount — bound to that order's ledger via the shared
 * payment actions. Closing without recording is fine (e.g. already paid in
 * advance, or paying later).
 */
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addPaymentAction,
  markOrderFullyPaidAction,
  type PaymentActionState,
} from "@/features/orders/application/payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toIstanbulDateString } from "@/shared/utils/date";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { RouteStop } from "@/features/routing/domain/route";

// Mirrors the orders payment channel union. Kept local so routing/ui doesn't
// reach into orders/domain (cross-feature boundary); the value is zod-validated
// by the payment actions on the server, so it stays the single source of truth.
type PaymentChannel = "cash" | "bank_transfer" | "card";

interface DeliveryPaymentDialogProps {
  /** The delivered stop to collect for; null = dialog closed. */
  stop: RouteStop | null;
  onClose: () => void;
}

export function DeliveryPaymentDialog({ stop, onClose }: DeliveryPaymentDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<PaymentChannel>("cash");
  const [amountText, setAmountText] = useState("");

  const total = stop?.total_minor ?? 0;
  const paid = stop?.amount_paid_minor ?? 0;
  const balance = total - paid;

  const run = (action: Promise<PaymentActionState>, okMsg: string) => {
    startTransition(async () => {
      const r = await action;
      if (r.status === "error") {
        toast.error(r.message);
        return;
      }
      toast.success(okMsg);
      router.refresh();
      setAmountText("");
      onClose();
    });
  };

  const onAddPartial = () => {
    if (!stop) return;
    const amount = parseTRYInput(amountText);
    if (amount === null || amount === 0) {
      toast.error("Geçerli bir tutar gir.");
      return;
    }
    run(
      addPaymentAction({
        order_id: stop.order_id,
        amount_minor: amount,
        channel,
        paid_at: toIstanbulDateString(new Date()),
      }),
      "Ödeme kaydedildi.",
    );
  };

  return (
    <Dialog
      open={stop !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAmountText("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tahsilat</DialogTitle>
          <DialogDescription>
            {stop ? `${stop.customer_name} — teslim edildi.` : null}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 p-2 text-center">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tutar
            </dt>
            <dd className="font-mono">{formatTRY(total)}</dd>
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-center">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ödenen
            </dt>
            <dd className="font-mono">{formatTRY(paid)}</dd>
          </div>
          <div
            className={cn(
              "rounded-md p-2 text-center",
              balance > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
            )}
          >
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Kalan
            </dt>
            <dd className="font-mono font-semibold">{formatTRY(balance)}</dd>
          </div>
        </dl>

        {balance <= 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <Badge variant="default">Ödendi</Badge>
            Bakiye yok.
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs">Kanal</Label>
          <Select value={channel} onValueChange={(v) => v && setChannel(v as PaymentChannel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Nakit</SelectItem>
              <SelectItem value="bank_transfer">Havale/EFT</SelectItem>
              <SelectItem value="card">Kart</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {balance > 0 ? (
          <Button
            type="button"
            className="h-12 w-full"
            disabled={pending || !stop}
            onClick={() =>
              stop &&
              run(
                markOrderFullyPaidAction({ order_id: stop.order_id, channel }),
                "Tamamı tahsil edildi.",
              )
            }
          >
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Tamamı tahsil edildi ({formatTRY(balance)})
          </Button>
        ) : null}

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Kısmi tutar (₺)</Label>
            <Input
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onAddPartial}
          >
            Ekle
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setAmountText("");
            onClose();
          }}
        >
          Şimdilik atla
        </Button>
      </DialogContent>
    </Dialog>
  );
}
