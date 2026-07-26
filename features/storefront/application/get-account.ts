import "server-only";

/**
 * Reads the logged-in customer's own account: profile, primary address (for
 * checkout prefill) and recent orders. All queries run through the cookie-bound
 * anon client, so the customer-scoped RLS policies (migration
 * 20260726120200) are what actually restrict rows to `auth_user_id = auth.uid()`
 * — we don't re-filter here.
 */
import { getCurrentUser } from "@/features/auth/application/get-session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface AccountProfile {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export interface AccountAddress {
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  description: string;
}

export interface AccountOrder {
  order_number: string;
  scheduled_for: string;
  status: string;
  payment_status: string;
  total_minor: number;
  created_at: string;
}

export interface CustomerAccount {
  email: string;
  profile: AccountProfile;
  address: AccountAddress | null;
  orders: AccountOrder[];
}

export async function getMyAccount(): Promise<CustomerAccount | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();

  const { data: cust } = await supabase
    .from("customers")
    .select("first_name,last_name,phone,email")
    .maybeSingle();

  const { data: addr } = await supabase
    .from("addresses")
    .select(
      "city,district,neighborhood,street,building_no,apartment_no,postal_code,description",
    )
    .eq("is_primary", true)
    .maybeSingle();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "order_number,scheduled_for,status,payment_status,total_minor,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    email: user.email ?? cust?.email ?? "",
    profile: {
      first_name: cust?.first_name ?? "",
      last_name: cust?.last_name ?? "",
      phone: cust?.phone ?? "",
      email: cust?.email ?? user.email ?? "",
    },
    address: addr
      ? {
          city: addr.city ?? "",
          district: addr.district ?? "",
          neighborhood: addr.neighborhood ?? "",
          street: addr.street ?? "",
          building_no: addr.building_no ?? "",
          apartment_no: addr.apartment_no ?? "",
          postal_code: addr.postal_code ?? "",
          description: addr.description ?? "",
        }
      : null,
    orders: (orders ?? []).map((o) => ({
      order_number: o.order_number,
      scheduled_for: o.scheduled_for,
      status: o.status,
      payment_status: o.payment_status,
      total_minor: o.total_minor ?? 0,
      created_at: o.created_at,
    })),
  };
}
