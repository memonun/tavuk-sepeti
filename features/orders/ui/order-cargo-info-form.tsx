"use client";

/**
 * Manual cargo tracking fields for a shipping-channel order — carrier,
 * tracking number, tracking URL. All three are optional and independent of
 * order status (see order-state-machine.ts): saving here never changes
 * `status`, and the "Kargolandı" button (order-status-actions.tsx) never
 * requires these to be filled in first.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOrderCargoInfoAction } from "@/features/orders/application/update-order-cargo-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrderCargoInfoFormProps {
  orderId: string;
  cargoCarrier: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingUrl: string | null;
}

export function OrderCargoInfoForm({
  orderId,
  cargoCarrier,
  cargoTrackingNumber,
  cargoTrackingUrl,
}: OrderCargoInfoFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [carrier, setCarrier] = useState(cargoCarrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(cargoTrackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(cargoTrackingUrl ?? "");

  const onSave = () => {
    startTransition(async () => {
      const result = await updateOrderCargoInfoAction({
        order_id: orderId,
        cargo_carrier: carrier,
        cargo_tracking_number: trackingNumber,
        cargo_tracking_url: trackingUrl,
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success("Kargo bilgisi kaydedildi.");
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Kargo Bilgisi</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Kargo firması</Label>
          <Input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="PTT Kargo, Aras Kargo…"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Takip numarası</Label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="1234567890"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Takip linki</Label>
          <Input
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onSave}>
          Kaydet
        </Button>
      </div>
    </section>
  );
}
