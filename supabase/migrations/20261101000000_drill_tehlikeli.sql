-- DENEME (merge edilmeyecek): geçerli ama tehlikeli bir migration.
-- "DB Kontrol"ün tehlikeli değişikliği yakalayıp sade Türkçe açıkladığını ve sıfırdan
-- kurulum testinin çalıştığını görmek için.
create table drill_notes (
  id uuid primary key default gen_random_uuid(),
  legacy text,
  created_at timestamptz not null default now()
);
alter table drill_notes enable row level security;
grant select on table public.drill_notes to authenticated;

-- Tehlikeli kısım: bir kolonu siliyor.
alter table drill_notes drop column if exists legacy;
-- (tatbikat: dosya değişti, onay düşmeli)
