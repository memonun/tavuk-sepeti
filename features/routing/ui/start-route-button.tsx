"use client";

/**
 * "Onayla & Başlat" — the single dispatch CTA on the planning page.
 *
 * Confirms the route's pending orders (pending → confirmed) via
 * confirmOrdersAction, then navigates into driver mode. Confirming up front
 * means the driver's later "Teslim Edildi" taps are simple confirmed →
 * delivered transitions and the route plan reflects a dispatched run.
 */
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmOrdersAction } from "@/features/orders/application/confirm-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StartRouteButtonProps {
  /** All order ids on the route (the RPC flips only the still-pending ones). */
  orderIds: string[];
  /** How many are currently pending — for the confirmation copy. */
  pendingCount: number;
  /** /routes/drive URL carrying the same date + start time. */
  driveHref: string;
  startHHmm: string;
}

export function StartRouteButton({
  orderIds,
  pendingCount,
  driveHref,
  startHHmm,
}: StartRouteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmOrdersAction({ order_ids: orderIds });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.push(driveHref);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className="h-12 gap-2 px-6 text-base font-semibold" />
        }
      >
        <Sparkles className="h-5 w-5" />
        Onayla &amp; Başlat
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotayı başlatıyorsun</DialogTitle>
          <DialogDescription>
            {pendingCount > 0
              ? `${pendingCount} bekleyen sipariş "onaylandı" olarak işaretlenecek ve rota ${startHHmm} başlangıcıyla açılacak.`
              : `Tüm siparişler zaten onaylı. Rota ${startHHmm} başlangıcıyla açılacak.`}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            İptal
          </DialogClose>
          <Button onClick={handleConfirm} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Onayla &amp; Başlat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
