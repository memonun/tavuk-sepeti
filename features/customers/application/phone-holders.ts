import "server-only";

/**
 * Who already has a phone number. The panel lets two customers share a number,
 * but never by accident: create/update stop with `phone_in_use` (naming these
 * customers) until the admin confirms "Yine de ekle".
 */
import { findCustomersByPhone } from "@/features/customers/infrastructure/customer.repository";
import { ok, type Result } from "@/shared/result";

import type { ExternalApiError } from "@/shared/errors/app-error";

export interface PhoneHolder {
  readonly id: string;
  readonly name: string;
}

function displayName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim() || "İsimsiz müşteri";
}

export async function loadPhoneHolders(
  phone: string | null | undefined,
  excludeCustomerId?: string,
): Promise<Result<PhoneHolder[], ExternalApiError>> {
  if (phone == null || phone.trim() === "") return ok([]);
  const found = await findCustomersByPhone(phone, excludeCustomerId);
  if (!found.ok) return found;
  return ok(
    found.value.map((row) => ({ id: row.id, name: displayName(row.first_name, row.last_name) })),
  );
}

export function describePhoneHolders(holders: readonly PhoneHolder[]): string {
  return holders.map((holder) => holder.name).join(", ");
}
