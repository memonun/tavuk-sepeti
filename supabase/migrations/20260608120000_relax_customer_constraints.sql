-- Relax customer identity constraints to support conventional in-grid
-- "add row": a new customer may start blank and be completed inline or
-- via the detail panel. Address remains app-level optional (no DB change
-- needed — nothing requires an addresses row to exist).
--
-- Owner decision 2026-06-08 (overrides SPEC §9). Completed-customer data
-- quality is now an application concern, not a DB invariant.

alter table public.customers
  alter column first_name drop not null,
  alter column last_name drop not null;

-- Replace the length CHECKs so null is allowed but a present value is
-- still bounded 1..100.
alter table public.customers
  drop constraint if exists customers_first_name_check,
  drop constraint if exists customers_last_name_check;

alter table public.customers
  add constraint customers_first_name_check
    check (first_name is null or length(trim(first_name)) between 1 and 100),
  add constraint customers_last_name_check
    check (last_name is null or length(trim(last_name)) between 1 and 100);
