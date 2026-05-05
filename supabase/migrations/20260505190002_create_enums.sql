-- 002_create_enums
-- SPEC.md §4.2 — every enum the system uses.
--
-- Enum changes are migrations: ALTER TYPE … ADD VALUE works but can't be
-- rolled back inside a transaction. Add new values judiciously.

-- ---- Orders ----------------------------------------------------------------
create type order_status as enum (
  'pending',
  'confirmed',
  'delivered',
  'cancelled'
);

create type payment_method as enum (
  'cash_on_delivery',
  'bank_transfer'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded'
);

create type time_slot as enum (
  'morning',
  'afternoon',
  'evening'
);

-- Tracks where the order originated. Faz 1 always 'admin_manual'; storefront
-- adds 'customer_web' in Faz 2; the cron-driven recurring engine emits
-- 'recurring_generated'.
create type order_source as enum (
  'admin_manual',
  'customer_web',
  'recurring_generated'
);

-- ---- Customers -------------------------------------------------------------
create type customer_status as enum (
  'active',
  'inactive',
  'blocked'
);

-- ---- Geocoding -------------------------------------------------------------
-- How the coordinate was obtained. Drives whether the admin must confirm a
-- pin before save (see SPEC.md §6.4 LOW_ACCURACY rule).
create type coordinate_source as enum (
  'geocoded_auto',
  'geocoded_manual',
  'user_pin',
  'admin_corrected'
);

-- Mirrors Google Geocoding API location_type. 'unknown' is our fallback when
-- a custom pin is dropped without a Google round-trip.
create type coordinate_accuracy as enum (
  'rooftop',
  'range_interpolated',
  'geometric_center',
  'approximate',
  'unknown'
);

-- How the address record was created. Faz 1 only emits 'admin_input';
-- 'customer_signup' added when the storefront lands; 'bulk_import' for any
-- one-off CSV migrations.
create type address_source as enum (
  'admin_input',
  'customer_signup',
  'bulk_import'
);

-- ---- Recurring (Faz 2 hazırlık) -------------------------------------------
create type recurring_cadence as enum (
  'weekly',
  'biweekly',
  'monthly'
);

-- ---- Auth / multi-admin (Faz 2 hazırlık) ----------------------------------
-- Faz 1 only uses 'admin'. The other roles exist now so RLS policies can be
-- written once with role-aware rules and never refactored.
create type user_role as enum (
  'admin',
  'operator',
  'viewer'
);
