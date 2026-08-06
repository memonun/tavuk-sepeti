/**
 * Customer aggregate — domain types for the application + UI layers.
 *
 * Mirrors SPEC.md §3.3 / §3.4. The DB shape is similar but not identical;
 * the mapper layer (infrastructure) reconciles the two so this file stays
 * Postgres-free.
 */
import type { Coordinate } from "@/shared/geo/coordinate";

export type CustomerStatus = "active" | "inactive" | "blocked";

export interface CustomerAddress {
  readonly id: string;
  readonly customer_id: string;
  /** Composed single-line address — derived from structured fields on
   *  every write. Kept for legacy display + fallback search. */
  readonly raw_text: string;
  readonly description: string | null;
  readonly coordinate: Coordinate;
  // Structured fields (TR postal convention).
  readonly city: string | null;          // İl
  readonly district: string | null;      // İlçe
  readonly neighborhood: string | null;  // Mahalle
  readonly street: string | null;        // Cadde / Sokak
  readonly building_no: string | null;   // Bina no
  readonly apartment_no: string | null;  // Daire no
  readonly postal_code: string | null;
  readonly country: string;
  readonly is_primary: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export type CustomerAccountType =
  | "individual"
  | "business"
  | "charity"
  | "bazaar_vendor";

export type CustomerOrderType =
  | "delivery"
  | "retail"
  | "wholesale"
  | "bazaar";

/**
 * Which channel created this customer record.
 *
 *   admin_manual — entered in the CRM/panel. These are the legacy phone-ordering
 *                  customers; a storefront signup NEVER merges into one.
 *   customer_web — created by a storefront signup, always from scratch.
 *
 * Immutable: the partial unique indexes on phone/email are partitioned by it,
 * so one legacy row and one web row may hold the same phone number.
 */
export type CustomerOrigin = "admin_manual" | "customer_web";

/** Turkish labels for the "Kaynak" column / filter. */
export const CUSTOMER_ORIGIN_LABELS: Readonly<Record<CustomerOrigin, string>> = {
  admin_manual: "Panel",
  customer_web: "Web",
};

export interface Customer {
  readonly id: string;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly email: string | null;
  /** E.164 (+90...). Nullable because some imported / pazar customers
   *  legitimately have no phone on file. New admin-created customers
   *  are still phone-required via the form schema. */
  readonly phone: string | null;
  readonly notes: string | null;
  readonly status: CustomerStatus;
  readonly account_type: CustomerAccountType;
  readonly order_type: CustomerOrderType | null;
  readonly tag: string | null;
  readonly legacy_segment: string | null;
  readonly origin: CustomerOrigin;
  readonly address: CustomerAddress | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

/** A list-view projection — drops address text + notes for table display. */
export interface CustomerListItem {
  readonly id: string;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly status: CustomerStatus;
  readonly account_type: CustomerAccountType;
  readonly order_type: CustomerOrderType | null;
  readonly tag: string | null;
  readonly legacy_segment: string | null;
  readonly origin: CustomerOrigin;
  readonly city: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly created_at: Date;
}
