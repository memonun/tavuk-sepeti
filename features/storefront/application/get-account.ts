import "server-only";

/**
 * Reads the logged-in customer's own account: profile, saved addresses and
 * recent orders. All queries run through the cookie-bound anon client, so the
 * customer-scoped RLS policies (migration 20260726120200) are what actually
 * restrict rows to `auth_user_id = auth.uid()` — we don't re-filter here.
 *
 * Addresses are a LIST now, not one primary row: an order binds to a specific
 * address (`orders.address_id`), so an account can keep "Ev" and "İş" and choose
 * per order.
 */
import { listMyAddresses, type SavedAddress } from "@/features/storefront/application/list-addresses";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface AccountProfile {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export type AccountAddress = SavedAddress;

export interface AccountOrder {
  order_number: string;
  scheduled_for: string;
  status: string;
  payment_status: string;
  total_minor: number;
  created_at: string;
  /** Rota / Kargo — so "Siparişlerim" can say how it will arrive. */
  fulfillment_channel: "delivery" | "shipping";
}

export interface CustomerAccount {
  email: string;
  profile: AccountProfile;
  addresses: AccountAddress[];
  /** The default address, or null when the account has none saved yet. */
  primaryAddress: AccountAddress | null;
  orders: AccountOrder[];
}

export async function getMyAccount(): Promise<CustomerAccount | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Scoped explicitly rather than left to RLS. The customer policies do restrict
  // to `auth_user_id = auth.uid()`, but `orders_admin_all` has no row filter — so
  // an ADMIN who opened /hesap was served the last 50 orders of every customer
  // under the heading "Siparişlerim", and the unfiltered `.maybeSingle()` on
  // `customers` errored on multiple rows and dropped the result on the floor.
  // RLS stays the enforcement; this makes the query mean what the page says.
  const { data: cust, error: custError } = await supabase
    .from("customers")
    .select("id,first_name,last_name,phone,email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (custError) {
    logger.warn({ code: custError.code }, "account_customer_load_failed");
  }

  const addressesResult = await listMyAddresses();
  const addresses = addressesResult.ok ? addressesResult.value : [];

  // `fulfillment_channel` isn't in the generated Database type yet (migration
  // 20260805090300) — the repo's un-generated-column cast.
  const ordersQuery = cust
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("orders")
        .select(
          "order_number,scheduled_for,status,payment_status,total_minor,created_at,fulfillment_channel",
        )
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  const orders = ordersQuery.data;
  if (ordersQuery.error) {
    logger.warn({ code: ordersQuery.error.code }, "account_orders_load_failed");
  }

  // Name falls back to the auth user's signup metadata when the customers row
  // is missing or incomplete (registered but hasn't ordered yet).
  const meta = (user.user_metadata ?? {}) as {
    first_name?: unknown;
    last_name?: unknown;
  };
  const metaFirst = typeof meta.first_name === "string" ? meta.first_name : "";
  const metaLast = typeof meta.last_name === "string" ? meta.last_name : "";

  return {
    email: user.email ?? cust?.email ?? "",
    profile: {
      first_name: cust?.first_name ?? metaFirst,
      last_name: cust?.last_name ?? metaLast,
      phone: cust?.phone ?? "",
      email: cust?.email ?? user.email ?? "",
    },
    addresses,
    primaryAddress: addresses.find((a) => a.is_primary) ?? addresses[0] ?? null,
    orders: ((orders ?? []) as Array<Record<string, unknown>>).map((o) => ({
      order_number: String(o.order_number),
      scheduled_for: String(o.scheduled_for),
      status: String(o.status),
      payment_status: String(o.payment_status),
      total_minor: Number(o.total_minor ?? 0),
      created_at: String(o.created_at),
      fulfillment_channel:
        o.fulfillment_channel === "shipping"
          ? ("shipping" as const)
          : ("delivery" as const),
    })),
  };
}
