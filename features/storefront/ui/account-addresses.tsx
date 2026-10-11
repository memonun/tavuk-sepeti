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
import { deleteAddressAction } from "@/features/storefront/application/delete-address";
import { saveAddressAction } from "@/features/storefront/application/save-address";
import { AddressForm } from "@/features/storefront/ui/address-form";
import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import { isRouteCapable } from "@/features/storefront/domain/route-capability";
import { ShopButton } from "@/features/storefront/ui/kit/shop-button";

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

  // Resaves the address exactly as it already is, just with `makePrimary`
  // flipped on — `upsert_customer_address` clears the previous default in the
  // same transaction (addresses_one_primary_per_customer allows only one row).
  // No new endpoint: this is the same action + RPC every edit already goes
  // through, just triggered without opening the edit form.
  function makeDefault(address: SavedAddress, routeCapable: boolean) {
    startTransition(async () => {
      const result = await saveAddressAction({
        addressId: address.id,
        mode: routeCapable ? "route" : "cargo",
        makePrimary: true,
        address: {
          label: address.label,
          city: address.city,
          district: address.district,
          neighborhood: address.neighborhood,
          postal_code: address.postal_code,
          description: address.description,
          street: address.street,
          building_no: address.building_no,
          apartment_no: address.apartment_no,
          lat: address.lat,
          lng: address.lng,
          accuracy: address.accuracy,
          source: address.source,
        },
      });
      if (result.status === "success") {
        toast.success("Varsayılan adres güncellendi.");
        router.refresh();
      } else if (result.status !== "idle") {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl leading-tight">Adreslerim</h2>
        {!adding ? (
          <ShopButton variant="secondary"
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
          >
            <PlusIcon className="size-4" />
            Yeni adres
          </ShopButton>
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
          <p className="text-base text-muted-foreground">
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
              className="rounded-2xl border border-border bg-card p-4 text-base"
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
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {address.label?.trim() || "Adres"}
                      {address.is_primary ? (
                        <Badge variant="secondary" className="h-auto px-2.5 py-0.5 text-base">
                          Varsayılan
                        </Badge>
                      ) : null}
                      <Badge
                        variant={routeCapable ? "default" : "outline"}
                        className="h-auto gap-1.5 px-2.5 py-0.5 text-base"
                      >
                        {routeCapable ? (
                          <MapPinIcon className="size-4" aria-hidden />
                        ) : (
                          <TruckIcon className="size-4" aria-hidden />
                        )}
                        {routeCapable
                          ? `${DELIVERY_PROVINCE} teslimat`
                          : "Yalnızca kargo"}
                      </Badge>
                    </p>
                    <p className="mt-1 text-muted-foreground">{address.raw_text}</p>
                    {address.description ? (
                      <p className="text-base text-muted-foreground">
                        {address.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!address.is_primary ? (
                      <ShopButton variant="secondary"
                        onClick={() => makeDefault(address, routeCapable)}
                        disabled={pending}
                      >
                        Varsayılan yap
                      </ShopButton>
                    ) : null}
                    <ShopButton variant="secondary"
                      onClick={() => {
                        setAdding(false);
                        setEditing(address.id);
                      }}
                      disabled={pending}
                    >
                      Düzenle
                    </ShopButton>
                    <ShopButton
                      variant="danger"
                      onClick={() => remove(address.id)}
                      disabled={pending}
                    >
                      Sil
                    </ShopButton>
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
