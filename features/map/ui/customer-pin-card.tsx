"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTRPhone } from "@/shared/utils/phone";

import type { MapPin } from "@/features/map/domain/map-pin";

interface CustomerPinCardProps {
  pin: MapPin;
  onClose: () => void;
}

/**
 * Floating card overlay shown when an admin clicks a map pin. Compact —
 * just enough to identify the customer and link out to the full record.
 */
export function CustomerPinCard({ pin, onClose }: CustomerPinCardProps) {
  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-72 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold leading-tight">
            {pin.first_name} {pin.last_name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatTRPhone(pin.phone)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-1 h-6 w-6 px-0"
          onClick={onClose}
          aria-label="Kapat"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="default">Aktif</Badge>
        {pin.has_recent_order ? (
          <Badge variant="secondary">Son 30 gün sipariş ✓</Badge>
        ) : (
          <Badge variant="outline">30 gündür sipariş yok</Badge>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href={`/customers/${pin.customer_id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          Müşteri detayı
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
