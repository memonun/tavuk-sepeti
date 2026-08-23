-- 20260823130300_finance_expenses_category_backfill
--
-- Backfills expenses.category_id from the pre-V2 free-text category column.
-- Defensive by design: this migration's author has no live access to
-- production data (prod schema has drifted from hand-applied changes
-- before — nothing here assumes the known legacy values below are the
-- only ones that exist). Every distinct legacy string not covered by the
-- known mapping gets its own managed "legacy" category rather than being
-- dropped, coerced, or silently left unmapped (spec §5).

do $$
begin
  -- 1. Known legacy strings -> their seeded managed category, via
  --    system_key (never a hardcoded UUID). "Malzeme" is deliberately NOT
  --    mapped here — it wasn't given an explicit target category in the
  --    spec, so it falls through to step 2 like any other unrecognized
  --    value, becoming its own reviewable legacy category under Diğer.
  update expenses e
  set category_id = ec.id
  from (
    values
      ('Yakıt',              'lojistik_yakit'),
      ('Ambalaj',            'ambalaj_ambalaj'),
      ('Kargo',              'lojistik_kargo'),
      ('Pazar Giderleri',    'pazar_giderleri'),
      ('Araç Giderleri',     'lojistik_arac_giderleri'),
      ('Üretim Giderleri',   'uretim_genel_uretim'),
      ('Bakım ve Onarım',    'enerji_bakim_onarim'),
      ('Personel / Hizmet',  'personel_dis_hizmet'),
      ('Diğer',              'diger')
  ) as mapping(legacy_name, system_key)
  join expense_categories ec on ec.system_key = mapping.system_key
  where e.category = mapping.legacy_name
    and e.category_id is null;

  -- 2. Any remaining distinct legacy string (including "Malzeme" and
  --    anything hand-entered that isn't in the mapping above) becomes its
  --    own managed category, parented under Diğer so it doesn't clutter
  --    the top-level list — admins can rename/re-parent it later via
  --    Kategorileri Yönet.
  insert into expense_categories (name, parent_id, active)
  select distinct e.category, (select id from expense_categories where system_key = 'diger'), true
  from expenses e
  where e.category is not null
    and e.category_id is null
    and not exists (select 1 from expense_categories ec where ec.name = e.category);

  -- 3. Attach every still-unlinked row to the (now guaranteed to exist)
  --    category matching its exact legacy text.
  update expenses e
  set category_id = ec.id
  from expense_categories ec
  where ec.name = e.category
    and e.category_id is null;

  -- 4. Safety net: abort rather than silently leave a row unmapped.
  if exists (select 1 from expenses where category is not null and category_id is null) then
    raise exception 'finance_expenses_category_backfill: unmapped expense category remained after backfill'
      using errcode = 'P0001';
  end if;
end $$;
