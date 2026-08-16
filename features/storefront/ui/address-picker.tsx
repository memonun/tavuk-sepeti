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
import { CheckIcon, MapPinIcon, PencilIcon, PlusIcon, TruckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddressForm } from "@/features/storefront/ui/address-form";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import {
  routeBlockReason,
  type RouteBlockReason,
} from "@/features/storefront/domain/route-capability";

import type { SavedAddress } from "@/features/storefront/application/list-addresses";

/** Which address the inline form is working on, if any. */
type EditingAddress = { kind: "new" } | { kind: "existing"; address: SavedAddress };

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
  const [editing, setEditing] = useState<EditingAddress | null>(null);

  // With nothing saved there is nothing to pick, so open the form directly
  // rather than showing an empty list. Derived rather than seeded into state, so
  // it still holds once the first address arrives from a refresh.
  const active: EditingAddress | null =
    editing ?? (addresses.length === 0 ? { kind: "new" } : null);

  if (active) {
    return (
      <AddressForm
        mode={mode}
        mapsKey={mapsKey}
        {...(active.kind === "existing" ? { initial: active.address } : {})}
        onSaved={(id) => {
          setEditing(null);
          onSelect(id);
          onChanged();
        }}
        {...(addresses.length > 0 ? { onCancel: () => setEditing(null) } : {})}
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
          <div
            key={address.id}
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-sm transition-colors",
              selected ? "border-primary bg-secondary/50" : "border-input",
            )}
          >
            <button
              type="button"
              onClick={() => usable && onSelect(address.id)}
              disabled={disabled || !usable}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 flex-1 items-start gap-3 text-left",
                usable ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}
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
                  <span className="mt-1 block text-xs font-bold text-destructive">
                    {BLOCK_MESSAGE[blockReason]}
                  </span>
                ) : null}
              </span>
            </button>
            {/* Without this the only way to fix a blocked address was to leave
                checkout for /hesap — so customers added a duplicate instead.
                A cargo-saved address has no pin by design, which makes it
                permanently unusable for fresh products until it is edited. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setEditing({ kind: "existing", address })}
              disabled={disabled}
            >
              <PencilIcon className="size-3.5" />
              Düzenle
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full justify-center rounded-xl"
        onClick={() => setEditing({ kind: "new" })}
        disabled={disabled}
      >
        <PlusIcon className="size-4" />
        Yeni adres ekle
      </Button>
    </div>
  );
}
