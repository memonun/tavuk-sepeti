"use client";

/**
 * Shown right after the collect-on-delivery popup closes — on every path
 * (full payment, partial payment, or "skip for now"), not just one.
 *
 * Without this, the driver had to send the "teslim edilmiştir" WhatsApp
 * message from the current-stop card BEFORE marking a delivery, or hunt the
 * stop back down afterward: handleDelivered already snaps the view forward
 * to the next stop the moment a delivery is recorded (driverState.followCurrent),
 * so by the time the payment popup closes the just-finished stop is no longer
 * the visible "current" card. This dialog keeps it in front of the driver for
 * one more tap before the route moves on.
 *
 * Skipped entirely when the customer has no phone on file (nothing to send) —
 * see driver-mode.tsx, which only opens this when customer_phone is set.
 */
import { MessageCircle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildWhatsAppLink } from "@/features/routing/domain/driver-contact-links";
import { cn } from "@/lib/utils";

import type { RouteStop } from "@/features/routing/domain/route";

interface DeliveryWhatsAppPromptProps {
  /** The just-delivered stop; null = dialog closed. */
  stop: RouteStop | null;
  onContinue: () => void;
}

export function DeliveryWhatsAppPrompt({ stop, onContinue }: DeliveryWhatsAppPromptProps) {
  const whatsAppHref = stop?.customer_phone
    ? buildWhatsAppLink(stop.customer_phone, true)
    : null;

  return (
    <Dialog
      open={stop !== null}
      onOpenChange={(open) => {
        if (!open) onContinue();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Teslimat bildirimi</DialogTitle>
          <DialogDescription>
            {stop
              ? `${stop.customer_name} — teslim edildi mesajını WhatsApp'tan gönder.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {whatsAppHref ? (
          <a
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full gap-2")}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp&apos;tan gönder
          </a>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="w-full" onClick={onContinue}>
            Rotaya devam et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
