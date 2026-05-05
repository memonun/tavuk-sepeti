"use server";

/**
 * Server Action wrapper for the order form's customer typeahead. Returns
 * a serializable list of small DTOs — domain Date instances stripped so
 * the React server-action transport doesn't choke on them.
 */
import { listCustomers } from "@/features/customers/application/list-customers";
import { formatTRPhone } from "@/shared/utils/phone";

export interface CustomerSearchHit {
  id: string;
  name: string;
  phone: string;
  city: string | null;
}

export async function searchCustomersAction(
  query: string,
): Promise<CustomerSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const result = await listCustomers({
    q: trimmed,
    status: "active",
    page: 1,
    pageSize: 20,
  });

  if (!result.ok) return [];
  return result.value.items.map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
    phone: formatTRPhone(c.phone),
    city: c.city,
  }));
}
