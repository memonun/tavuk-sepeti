-- 20260813120000_storefront_settings
--
-- WHY: two storefront rules the OWNER changes, not a developer.
--
--   * "Eve servis günleri" — the days the van goes out. Çarşamba + Cumartesi
--     today; the owner's requirement was literally "ben bunu değiştirmek
--     istediğimde değiştirebileyim". A constant in a .ts file is only
--     changeable by whoever can deploy, so the days become a row.
--   * "Şehir dışı sipariş alt limiti" — the cargo order floor (1.000 ₺). Same
--     argument: shipping costs move, and re-deploying to change a number the
--     owner already knows is the wrong shape.
--
-- Single-row table, not a key/value bag: every setting here is typed and
-- CHECK-constrained, which a jsonb blob or a text `value` column cannot be. The
-- `id boolean primary key default true check (id)` idiom is what pins it to one
-- row — a second insert collides on the primary key.
--
-- Reads: `anon` + `authenticated` SELECT. The delivery days and the order floor
-- are printed on the checkout page; there is nothing here to leak. Writes:
-- admins only, via is_admin() — the same helper every other table uses.
--
-- Performance (CLAUDE.md §1): one row, read on the checkout path, so the app
-- layer wraps it in unstable_cache with a tag the admin write invalidates. Even
-- uncached this is a single-row primary-key lookup.

create table storefront_settings (
  -- Single-row guard: `true` is the only allowed key.
  id boolean primary key default true check (id),

  -- 0=Sunday … 6=Saturday — the same base recurring_templates.day_of_week uses,
  -- so "day of week" means one thing across the schema.
  -- cardinality(), not array_length(): array_length('{}', 1) is NULL and a NULL
  -- CHECK passes, so an EMPTY day list would slip through — the one value that
  -- silently closes the fresh-product checkout.
  home_delivery_days smallint[] not null default array[3, 6]::smallint[]
    constraint storefront_settings_days_not_empty
      check (cardinality(home_delivery_days) between 1 and 7)
    constraint storefront_settings_days_in_range
      check (home_delivery_days <@ array[0,1,2,3,4,5,6]::smallint[]),

  -- Kuruş (CLAUDE.md §7). 0 disables the floor.
  cargo_min_order_minor bigint not null default 100000
    check (cargo_min_order_minor >= 0),

  updated_at timestamptz not null default now(),
  -- set null, not cascade: losing the admin account must not delete the shop's
  -- configuration.
  updated_by uuid references auth.users(id) on delete set null
);

create trigger storefront_settings_set_updated_at
  before update on storefront_settings
  for each row execute function set_updated_at();

-- The row the storefront reads. Seeded with the launch rules so the table is
-- never empty — an empty table would mean "no delivery days", which closes the
-- fresh-product checkout.
insert into storefront_settings (id) values (true)
on conflict (id) do nothing;

alter table storefront_settings enable row level security;

-- Public read: the checkout page prints these values to every visitor,
-- signed in or not.
create policy storefront_settings_public_read on storefront_settings
  for select to anon, authenticated
  using (true);

create policy storefront_settings_admin_all on storefront_settings
  for all to authenticated
  using (is_admin()) with check (is_admin());

comment on table storefront_settings is
  'Single-row, owner-editable storefront rules (admin UI: /magaza-ayarlari). Public read; admin write.';
comment on column storefront_settings.home_delivery_days is
  'Weekdays the delivery van runs, 0=Sunday..6=Saturday. Checkout only offers these days for delivery-channel orders; place_order re-checks server-side.';
comment on column storefront_settings.cargo_min_order_minor is
  'Minimum subtotal (kuruş) for a cargo/out-of-city order. 0 = no minimum. Delivery-channel orders are never held to it.';
