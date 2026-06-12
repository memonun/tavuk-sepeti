"use client";

/**
 * Tahsilat (collections) section — the payment ledger for one order.
 *
 * Shortcut-first: a big "Tamamı ödendi" records the whole balance in one tap,
 * and the manual amount defaults to the remaining balance. Status (Bekliyor /
 * Kısmi / Ödendi) + the paid/remaining figures are derived; the DB triggers
 * keep them in sync, so every action just calls router.refresh().
 */
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addPaymentAction,
  deletePaymentAction,
  markOrderFullyPaidAction,
  type PaymentActionState,
} from "@/features/orders/application/payments";
import { derivePaymentStatus } from "@/features/orders/domain/payment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/shared/utils/date";
import { formatTRY, parseTRYInput } from "@/shared/utils/money";

import type { PaymentMethod } from "@/features/orders/domain/order";
import type {
  OrderPayment,
  PaymentChannel,
  PaymentDerivedStatus,
} from "@/features/orders/domain/payment";

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  cash: "Nakit",
  bank_transfer: "Havale/EFT",
  card: "Kart",
};
const STATUS_LABEL: Record<PaymentDerivedStatus, string> = {
  pending: "Bekliyor",
  partial: "Kısmi",
  paid: "Ödendi",
};
const STATUS_VARIANT: Record<
  PaymentDerivedStatus,
  "secondary" | "outline" | "default"
> = { pending: "secondary", partial: "outline", paid: "default" };

interface OrderPaymentsProps {
  orderId: string;
  totalMinor: number;
  amountPaidMinor: number;
  paymentMethod: PaymentMethod;
  scheduledFor: string; // YYYY-MM-DD
  payments: OrderPayment[];
}

export function OrderPayments({
  orderId,
  totalMinor,
  amountPaidMinor,
  paymentMethod,
  scheduledFor,
  payments,
}: OrderPaymentsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const balance = totalMinor - amountPaidMinor;
  const status = derivePaymentStatus(totalMinor, amountPaidMinor);

  const [amountText, setAmountText] = useState(() =>
    balance > 0 ? (balance / 100).toFixed(2).replace(".", ",") : "",
  );
  const [channel, setChannel] = useState<PaymentChannel>(
    paymentMethod === "bank_transfer" ? "bank_transfer" : "cash",
  );
  const [dateText, setDateText] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");

  const run = (action: Promise<PaymentActionState>, okMsg: string) => {
    startTransition(async () => {
      const r = await action;
      if (r.status === "error") {
        toast.error(r.message);
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  };

  const onAdd = () => {
    const amount = parseTRYInput(amountText);
    if (amount === null || amount === 0) {
      toast.error("Geçerli bir tutar gir.");
      return;
    }
    run(
      addPaymentAction({
        order_id: orderId,
        amount_minor: amount,
        channel,
        paid_at: dateText,
        note,
      }),
      "Ödeme eklendi.",
    );
    setNote("");
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Tahsilat</h3>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Toplam
          </dt>
          <dd className="font-mono">{formatTRY(totalMinor)}</dd>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ödenen
          </dt>
          <dd className="font-mono">{formatTRY(amountPaidMinor)}</dd>
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

      {balance > 0 ? (
        <Button
          type="button"
          className="h-11 w-full"
          disabled={pending}
          onClick={() =>
            run(markOrderFullyPaidAction({ order_id: orderId, channel }), "Tamamı ödendi.")
          }
        >
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Tamamı ödendi ({formatTRY(balance)})
        </Button>
      ) : null}

      {payments.length > 0 ? (
        <ul className="divide-y text-sm">
          {payments.map((p) => {
            const ymd = p.paid_at.toISOString().slice(0, 10);
            const tag = ymd < scheduledFor ? "Avans" : ymd > scheduledFor ? "Geç" : null;
            return (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="font-mono">{formatTRY(p.amount_minor)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(p.paid_at)} · {CHANNEL_LABEL[p.channel]}
                </span>
                {tag ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {tag}
                  </Badge>
                ) : null}
                {p.note ? (
                  <span className="truncate text-xs text-muted-foreground">
                    — {p.note}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      deletePaymentAction({ payment_id: p.id, order_id: orderId }),
                      "Ödeme silindi.",
                    )
                  }
                  aria-label="Ödemeyi sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Tutar (₺)</Label>
          <Input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Kanal</Label>
          <Select
            value={channel}
            onValueChange={(v) => v && setChannel(v as PaymentChannel)}
          >
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
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Tarih</Label>
          <Input
            type="date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" disabled={pending} onClick={onAdd}>
          Ekle
        </Button>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Not (opsiyonel)"
      />
    </section>
  );
}
