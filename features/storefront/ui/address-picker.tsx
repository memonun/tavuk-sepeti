"use client";

/**
 * Saved-address chooser for checkout (and the account page).
 *
 * An order binds to a specific address (`orders.address_id`), so the customer
 * picks one rather than retyping. Addresses that cannot serve the current basket
 * are shown but disabled, with the reason spelled out — silently hiding them
 * would leave the customer wondering where their address went.
 *
 * "Route-capable" here means the address has a confirmed pin. The real
 * delivery-area decision is made server-side by PostGIS when the address is
 * saved and again inside the order transaction; this is only the honest UI hint.
 */
import { useState } from "react";
import { CheckIcon, MapPinIcon, PlusIcon, TruckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AddressForm } from "@/features/storefront/ui/address-form";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import {
  routeBlockReason,
  type RouteBlockReason,
} from "@/features/storefront/domain/route-capability";

import type { SavedAddress } from "@/features/storefront/application/list-addresses";

interface AddressPickerProps {
  addresses: readonly SavedAddress[];
  mode: "route" | "cargo";
  mapsKey: string | undefined;
  selectedId: string | null;
  onSelect: (addressId: string) => void;
  /** Called after a new address is saved so the page can refresh its list. */
  onChanged: () => void;
  disabled?: boolean;
}

const BLOCK_MESSAGE: Record<RouteBlockReason, string> = {
  no_pin: `Taze ürünler için konum onayı gerekiyor — bu adreste harita pini yok. Adresi düzenleyip haritadan ${DELIVERY_PROVINCE} konumunuzu onaylayın.`,
  other_province: `Taze ürünler yalnızca ${DELIVERY_PROVINCE} içinde teslim edilir. Bu adres başka bir ilde — kargo siparişleri için kullanılabilir.`,
};

export function AddressPicker({
  addresses,
  mode,
  mapsKey,
  selectedId,
  onSelect,
  onChanged,
  disabled,
}: AddressPickerProps) {
  const [adding, setAdding] = useState(addresses.length === 0);

  if (adding) {
    return (
      <AddressForm
        mode={mode}
        mapsKey={mapsKey}
        onSaved={(id) => {
          setAdding(false);
          onSelect(id);
          onChanged();
        }}
        {...(addresses.length > 0 ? { onCancel: () => setAdding(false) } : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {addresses.map((address) => {
        const blockReason = mode === "cargo" ? null : routeBlockReason(address);
        const usable = blockReason === null;
        const selected = address.id === selectedId;
        return (
          <button
            key={address.id}
            type="button"
            onClick={() => usable && onSelect(address.id)}
            disabled={disabled || !usable}
            aria-pressed={selected}
            className={[
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
              selected ? "border-primary bg-secondary/50" : "border-input",
              usable ? "cursor-pointer hover:bg-secondary/30" : "cursor-not-allowed opacity-60",
            ].join(" ")}
          >
            <span className="mt-0.5 shrink-0 text-primary" aria-hidden>
              {selected ? (
                <CheckIcon className="size-4" />
              ) : mode === "cargo" ? (
                <TruckIcon className="size-4" />
              ) : (
                <MapPinIcon className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {address.label?.trim() || address.raw_text || "Adres"}
                {address.is_primary ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    varsayılan
                  </span>
                ) : null}
              </span>
              {address.label ? (
                <span className="block text-xs text-muted-foreground">
                  {address.raw_text}
                </span>
              ) : null}
              {blockReason ? (
                <span className="mt-1 block text-xs text-destructive">
                  {BLOCK_MESSAGE[blockReason]}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full justify-center rounded-xl"
        onClick={() => setAdding(true)}
        disabled={disabled}
      >
        <PlusIcon className="size-4" />
        Yeni adres ekle
      </Button>
    </div>
  );
}
