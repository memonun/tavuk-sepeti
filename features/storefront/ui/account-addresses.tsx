"use client";

/**
 * "Adreslerim" — the account's saved delivery addresses.
 *
 * Saving an address here does the full route-grade job once (pin confirmed,
 * cadde/bina/daire captured, service area checked), so every later checkout is
 * a single tap. That is the point of binding orders to an address row instead
 * of retyping one per order.
 *
 * Addresses in the delivery province are labelled as route-capable; the rest are
 * cargo-only. The label is honest about what the address can do rather than
 * hiding the distinction until checkout fails.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPinIcon, PlusIcon, TruckIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteAddressAction } from "@/features/storefront/application/delete-address";
import { AddressForm } from "@/features/storefront/ui/address-form";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import { isRouteCapable } from "@/features/storefront/domain/route-capability";

import type { SavedAddress } from "@/features/storefront/application/list-addresses";

interface AccountAddressesProps {
  addresses: readonly SavedAddress[];
  mapsKey: string | undefined;
}

export function AccountAddresses({ addresses, mapsKey }: AccountAddressesProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(addressId: string) {
    startTransition(async () => {
      const result = await deleteAddressAction({ address_id: addressId });
      if (result.status === "success") {
        toast.success("Adres silindi.");
        router.refresh();
      } else if (result.status !== "idle") {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-display text-lg">Adreslerim</h2>
        {!adding ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
          >
            <PlusIcon className="size-4" />
            Yeni adres
          </Button>
        ) : null}
      </div>

      {adding ? (
        <AddressForm
          // New addresses default to the route form: it captures a superset of
          // what a cargo address needs, so one saved address serves both.
          mode="route"
          mapsKey={mapsKey}
          onSaved={() => {
            setAdding(false);
            toast.success("Adres kaydedildi.");
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {addresses.length === 0 && !adding ? (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Kayıtlı adresiniz yok. Sipariş verirken de ekleyebilirsiniz.
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {addresses.map((address) => {
          // Same predicate the checkout picker uses — a badge that disagreed
          // with what checkout will accept is worse than no badge.
          const routeCapable = isRouteCapable(address);
          return (
            <li
              key={address.id}
              className="rounded-2xl border border-border/60 bg-card p-4 text-sm"
            >
              {editing === address.id ? (
                <AddressForm
                  mode={routeCapable ? "route" : "cargo"}
                  mapsKey={mapsKey}
                  initial={address}
                  onSaved={() => {
                    setEditing(null);
                    toast.success("Adres güncellendi.");
                    router.refresh();
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {address.label?.trim() || "Adres"}
                      {address.is_primary ? (
                        <Badge variant="secondary" className="text-[11px]">
                          Varsayılan
                        </Badge>
                      ) : null}
                      <Badge
                        variant={routeCapable ? "default" : "outline"}
                        className="gap-1 text-[11px]"
                      >
                        {routeCapable ? (
                          <MapPinIcon className="size-3" />
                        ) : (
                          <TruckIcon className="size-3" />
                        )}
                        {routeCapable
                          ? `${DELIVERY_PROVINCE} teslimat`
                          : "Yalnızca kargo"}
                      </Badge>
                    </p>
                    <p className="mt-1 text-muted-foreground">{address.raw_text}</p>
                    {address.description ? (
                      <p className="text-xs text-muted-foreground">
                        {address.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setAdding(false);
                        setEditing(address.id);
                      }}
                      disabled={pending}
                    >
                      Düzenle
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-destructive"
                      onClick={() => remove(address.id)}
                      disabled={pending}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
