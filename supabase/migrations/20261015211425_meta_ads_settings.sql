-- 20261015211425_meta_ads_settings
--
-- Meta (Facebook/Instagram) reklam yönetimi için iki tablo. Panelin MCP
-- sunucusu üzerinden Claude reklam bütçelerini değiştirebilecek, reklamları
-- durdurup başlatabilecek; bu işler gerçek para harcatır.
--
--   * meta_ads_settings — işletme sahibinin belirlediği harcama limitleri
--     (tek satır, /reklam sayfasından düzenlenir). Limitleri UYGULAMA katmanı
--     her yazmadan önce bu satırdan okur; Claude'un kararına bırakılmaz.
--     Sahibin 2026-10-15 kararı: günlük toplam tavan 1.500 ₺, tek seferde en
--     fazla %50 artış, limitler içinde otomatik uygula ve raporla.
--   * meta_ads_changes — yapılan her değişikliğin ve yeni açılan her
--     kampanya / reklam seti / reklamın kaydı (rapor + "bu reklama bugün kaç
--     kez dokunuldu" sayımı). Değiştirilemez: sadece select/insert.
--     Yeni açılanlar Meta'da DURDURULMUŞ açılır; harcamaya başlamaları ancak
--     tavan kontrolünden geçen bir "resume" ile olur.
--
-- Yeni tablo; mevcut hiçbir şeyi değiştirmiyor, geriye dönük uyumlu.

create table meta_ads_settings (
  -- Tek satır: storefront_settings ile aynı kalıp.
  id boolean primary key default true check (id),

  -- Kapalıyken hiçbir bütçe/durum değişikliği yapılmaz ("acil durdur").
  automation_enabled boolean not null default true,

  -- Aktif reklamların günlük bütçelerinin toplamı bunu aşamaz. Kuruş.
  daily_cap_minor bigint not null default 150000
    check (daily_cap_minor >= 0),

  -- Tek bir değişiklikte bütçe en fazla yüzde kaç ARTABİLİR. Düşürmeye sınır yok.
  max_increase_pct smallint not null default 50
    check (max_increase_pct between 1 and 500),

  -- Aynı kampanya/reklam setine bir günde (İstanbul saatiyle) en fazla kaç değişiklik.
  max_changes_per_entity_per_day smallint not null default 2
    check (max_changes_per_entity_per_day between 1 and 20),

  updated_at timestamptz not null default now(),
  -- set null: yönetici hesabı silinse de ayarlar kalmalı.
  updated_by uuid references auth.users(id) on delete set null
);

create trigger meta_ads_settings_set_updated_at
  before update on meta_ads_settings
  for each row execute function set_updated_at();

insert into meta_ads_settings (id) values (true)
on conflict (id) do nothing;

alter table meta_ads_settings enable row level security;

-- Sadece yöneticiler okur ve yazar (mağaza ayarlarının aksine bu herkese açık değil).
create policy meta_ads_settings_admin_all on meta_ads_settings
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

grant select, update on table public.meta_ads_settings to authenticated;

comment on table meta_ads_settings is
  'Tek satır: Meta reklam otomasyonunun harcama limitleri (admin UI: /reklam). Uygulama her bütçe/durum değişikliğinden önce okur.';

create table meta_ads_changes (
  id uuid primary key default gen_random_uuid(),

  -- Meta tarafındaki kampanya veya reklam seti kimliği (sayısal string).
  entity_id text not null check (entity_id ~ '^[0-9]{1,32}$'),
  entity_level text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_name text not null check (char_length(entity_name) <= 400),

  action text not null check (action in ('budget', 'pause', 'resume', 'create')),
  -- Kuruş. Durum değişikliklerinde o anki bütçe yazılır (rapor için).
  before_daily_budget_minor bigint check (before_daily_budget_minor >= 0),
  after_daily_budget_minor bigint check (after_daily_budget_minor >= 0),

  -- Neden yapıldı — Claude'un ya da yöneticinin açıklaması. Zorunlu.
  reason text not null check (char_length(reason) between 1 and 1000),
  source text not null check (source in ('mcp', 'panel')),

  -- set null: kayıt geçmişi kullanıcı silinince kaybolmamalı.
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- "Bu kampanyaya bugün kaç kez dokunuldu?" sorgusu her yazmadan önce çalışır:
-- entity_id eşitliği + created_at aralığı.
create index meta_ads_changes_entity_created_idx
  on meta_ads_changes (entity_id, created_at desc);

-- Panel ve rapor en yeni değişiklikleri sayfalı listeler.
create index meta_ads_changes_created_idx
  on meta_ads_changes (created_at desc);

alter table meta_ads_changes enable row level security;

create policy meta_ads_changes_admin_select on meta_ads_changes
  for select to authenticated
  using ((select is_admin()));

create policy meta_ads_changes_admin_insert on meta_ads_changes
  for insert to authenticated
  with check ((select is_admin()));

-- Kayıt değiştirilemez: update/delete yetkisi bilerek verilmiyor.
grant select, insert on table public.meta_ads_changes to authenticated;

comment on table meta_ads_changes is
  'Meta reklamlarında yapılan her bütçe/durum değişikliği. Sadece eklenir; güncellenmez, silinmez.';
