-- 20260922120000_expense_categories_talas_kopek_kisisel_kira
--
-- Owner-requested additions to the expense category tree. Data-only, additive
-- and idempotent (system_key is unique, so a re-run — or a category the admin
-- already created by hand under the same key — inserts nothing).
--
--   Üretim Giderleri
--     + Çam Talaşı   (bedding laid under the coop after every cleaning; a
--                     routine cost — set it up under Rutin Giderler if wanted)
--     + Köpek Yemi
--   Top level (no children, selectable on their own like "Pazar Giderleri"):
--     + Kişisel Gider
--     + Ev Aidatı
--     + Kira
--
-- "Diğer" stays the last top-level entry: its sort_order moves past the new
-- ones (sort_order is display order only; nothing references it).

do $$
declare
  v_uretim uuid;
begin
  select id into v_uretim from expense_categories where system_key = 'uretim_giderleri';
  if v_uretim is null then
    raise exception 'seed category uretim_giderleri is missing' using errcode = 'P0001';
  end if;

  -- Skip a name that already exists at that level, not just a taken system_key:
  -- the admin may have created e.g. "Kira" by hand (system_key null) already.
  insert into expense_categories (name, parent_id, system_key, sort_order)
  select v.name, v.parent_id, v.system_key, v.sort_order
  from (values
    ('Çam Talaşı',    v_uretim, 'uretim_cam_talasi', 6),
    ('Köpek Yemi',    v_uretim, 'uretim_kopek_yemi', 7),
    ('Kişisel Gider', null::uuid, 'kisisel_gider',   11),
    ('Ev Aidatı',     null::uuid, 'ev_aidati',       12),
    ('Kira',          null::uuid, 'kira',            13)
  ) as v(name, parent_id, system_key, sort_order)
  where not exists (
    select 1 from expense_categories c
    where lower(c.name) = lower(v.name)
      and c.parent_id is not distinct from v.parent_id
  )
  on conflict (system_key) do nothing;

  update expense_categories set sort_order = 14 where system_key = 'diger';
end $$;
