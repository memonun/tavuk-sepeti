"use server";

import type { CustomerListItem } from "@/features/customers/domain/customer";
import type { CustomerSearchHit } from "@/features/customers/application/search-customers-action";
import { listCustomers } from "@/features/customers/application/list-customers";
import { logger } from "@/shared/logger";
import { formatTRPhone } from "@/shared/utils/phone";

const ALL_IDS_CAP = 1000;

export interface PickerPage {
  items: CustomerSearchHit[];
  total: number;
}

function toHit(c: CustomerListItem): CustomerSearchHit {
  const name =
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    "(isimsiz)";
  return { id: c.id, name, phone: formatTRPhone(c.phone), city: c.city };
}

export async function listCustomersForPicker(
  q: string,
  page: number,
  pageSize: number,
): Promise<PickerPage> {
  const result = await listCustomers({ q, page, pageSize });
  if (!result.ok) return { items: [], total: 0 };
  return {
    items: result.value.items.map(toHit),
    total: result.value.total,
  };
}

export async function listAllCustomerIds(q: string): Promise<string[]> {
  const result = await listCustomers({ q, page: 1, pageSize: ALL_IDS_CAP });
  if (!result.ok) return [];
  if (result.value.total > ALL_IDS_CAP) {
    logger.warn(
      { total: result.value.total, cap: ALL_IDS_CAP, q },
      "select_all_filtered_capped",
    );
  }
  return result.value.items.map((i) => i.id);
}
