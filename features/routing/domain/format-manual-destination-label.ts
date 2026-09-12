/**
 * Turn a Google Places `ParsedAddress` into a short display label for the
 * manually-entered route destination — shown in the destination picker and
 * as `RouteDestination.name`. Pure so both the planning controls and driver
 * mode's "change destination" dialog can share it without duplicating the
 * join/filter logic.
 */
interface AddressLike {
  readonly street: string;
  readonly neighborhood: string;
  readonly district: string;
  readonly city: string;
}

export function formatManualDestinationLabel(address: AddressLike): string {
  const parts = [address.street, address.neighborhood, address.district, address.city].filter(
    (p) => p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "Elle girilen adres";
}
