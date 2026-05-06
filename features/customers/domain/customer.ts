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

export interface Customer {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string | null;
  readonly phone: string;          // E.164 (+90...)
  readonly notes: string | null;
  readonly status: CustomerStatus;
  readonly address: CustomerAddress;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

/** A list-view projection — drops address text + notes for table display. */
export interface CustomerListItem {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly status: CustomerStatus;
  readonly city: string | null;
  readonly created_at: Date;
}
