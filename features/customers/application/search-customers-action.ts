"use server";

/**
 * Server Action wrapper for the order form's customer typeahead. Returns
 * a serializable list of small DTOs — domain Date instances stripped so
 * the React server-action transport doesn't choke on them.
 *
 * No status filter: the admin should still be able to find an inactive
 * customer through search (e.g., to look at an old order). If we ever
 * want to prevent ordering from blocked customers, that's a UI concern —
 * show in results, disable selection.
 */
import { listCustomers } from "@/features/customers/application/list-customers";
import { logger } from "@/shared/logger";
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
    page: 1,
    pageSize: 20,
  });

  if (!result.ok) {
    logger.warn(
      { query: trimmed, code: result.error.code },
      "customer_search_failed",
    );
    return [];
  }

  logger.info(
    { query: trimmed, hits: result.value.items.length },
    "customer_search_ok",
  );

  return result.value.items.map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
    phone: formatTRPhone(c.phone),
    city: c.city,
  }));
}
