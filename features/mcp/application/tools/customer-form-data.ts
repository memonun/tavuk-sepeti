/**
 * The panel's customer Server Actions are form-style (`FormData` with flat
 * `address.*` keys). These helpers translate the connector's structured input
 * into that shape, and — for updates — overlay it on the existing record, so a
 * field the model leaves out is PRESERVED rather than blanked (the action treats
 * a missing field as "clear it").
 */
import type { getCustomerById } from "@/features/customers/application/get-customer";

// Derived through the customers feature's application API — cross-feature
// imports may not reach into another feature's domain (eslint boundaries).
type Customer = Extract<Awaited<ReturnType<typeof getCustomerById>>, { ok: true }>["value"];

export interface CustomerAddressInput {
  city?: string | null | undefined;
  district?: string | null | undefined;
  neighborhood?: string | null | undefined;
  street?: string | null | undefined;
  building_no?: string | null | undefined;
  apartment_no?: string | null | undefined;
  postal_code?: string | null | undefined;
  description?: string | null | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
}

export interface CustomerInput {
  first_name?: string | null | undefined;
  last_name?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  notes?: string | null | undefined;
  status?: "active" | "inactive" | "blocked" | undefined;
  address?: CustomerAddressInput | undefined;
}

const ADDRESS_TEXT_KEYS = [
  "city",
  "district",
  "neighborhood",
  "street",
  "building_no",
  "apartment_no",
  "postal_code",
  "description",
] as const;

function setText(fd: FormData, key: string, value: string | null | undefined): void {
  fd.set(key, value ?? "");
}

function writeAddress(
  fd: FormData,
  address: CustomerAddressInput,
  base: Customer["address"] | null,
): void {
  for (const key of ADDRESS_TEXT_KEYS) {
    const provided = address[key];
    setText(fd, `address.${key}`, provided !== undefined ? provided : (base?.[key] ?? null));
  }

  const hasNewPin = address.lat !== undefined && address.lng !== undefined;
  if (hasNewPin) {
    fd.set("address.lat", String(address.lat));
    fd.set("address.lng", String(address.lng));
    fd.set("address.source", "admin_corrected");
    fd.set("address.accuracy", "unknown");
  } else if (base) {
    // Keep the existing pin: the action would otherwise write 0,0.
    fd.set("address.lat", String(base.coordinate.lat));
    fd.set("address.lng", String(base.coordinate.lng));
    fd.set("address.source", base.coordinate.source);
    fd.set("address.accuracy", base.coordinate.accuracy);
  }
}

export function buildCreateCustomerFormData(input: CustomerInput): FormData {
  const fd = new FormData();
  setText(fd, "first_name", input.first_name);
  setText(fd, "last_name", input.last_name);
  setText(fd, "email", input.email);
  setText(fd, "phone", input.phone);
  setText(fd, "notes", input.notes);
  fd.set("status", input.status ?? "active");
  if (input.address) writeAddress(fd, input.address, null);
  return fd;
}

export function buildUpdateCustomerFormData(
  existing: Customer,
  input: CustomerInput,
): FormData {
  const fd = new FormData();
  setText(fd, "first_name", input.first_name !== undefined ? input.first_name : existing.first_name);
  setText(fd, "last_name", input.last_name !== undefined ? input.last_name : existing.last_name);
  setText(fd, "email", input.email !== undefined ? input.email : existing.email);
  setText(fd, "phone", input.phone !== undefined ? input.phone : existing.phone);
  setText(fd, "notes", input.notes !== undefined ? input.notes : existing.notes);
  fd.set("status", input.status ?? existing.status);
  // No address in the input → none in the form → the action leaves the stored one alone.
  if (input.address) writeAddress(fd, input.address, existing.address);
  return fd;
}
