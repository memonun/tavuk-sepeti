-- showcase_slides
--
-- Ana sayfadaki kayan vitrinin fotoğrafları koda yazılıydı (3 sabit fotoğraf).
-- Owner (2026-10-26) admin panelinde bir "Vitrin" sayfası istiyor: fotoğraf
-- ekleyebilsin, silebilsin, sırasını değiştirebilsin.
--
--   * showcase_slides — vitrindeki her fotoğraf bir satır.
--   * showcase-images — yüklenen fotoğrafların durduğu herkese açık Storage
--     bucket'ı (ürün fotoğraflarının product-images bucket'ı ile aynı düzen).
--   * reorder_showcase_slides — sıralamayı tek komutta, atomik değiştirir.
--
-- Bugünkü 3 fotoğraf satır olarak eklenir; yayından sonra vitrin aynı görünür.
-- Bu üçü sitenin kendi dosyaları (/brand/..., /hakkimizda/...), Storage'da
-- değil; image_path '/' ile başlıyorsa sitenin dosyası, başlamıyorsa
-- showcase-images bucket'ındaki nesnenin adıdır. CHECK başka bir şeye izin
-- vermez, böylece satır hiçbir zaman keyfi bir adrese işaret edemez.
--
-- Okuma: mağaza vitrini service-role ile okur (unstable_cache içinde çerez
-- kullanılamaz; ayarlar tablosuyla aynı neden), bu yüzden anon'a yetki
-- verilmiyor. Yazma: sadece admin (is_admin()), RLS + grant ile.
--
-- Index yok: tablo en fazla birkaç satır (uygulama 8 ile sınırlıyor) ve her
-- okuma zaten cache'li; sort_order üzerinde index kazanç getirmez.
--
-- Geriye dönük uyum (CLAUDE.md §7): sadece yeni tablo, bucket ve fonksiyon.
-- Eski kod bunları kullanmaz; mevcut hiçbir şey değişmiyor veya silinmiyor.

create table showcase_slides (
  id uuid primary key default gen_random_uuid(),

  -- Sitenin kendi fotoğrafı ("/brand/x.webp") veya bucket nesnesi ("ab12.webp").
  image_path text not null
    constraint showcase_slides_image_path_shape
      check (image_path ~ '^(/(brand|hakkimizda)/[a-z0-9-]+\.webp|[A-Za-z0-9_-]{1,64}\.(jpg|png|webp))$'),

  -- Ekran okuyucu ve arama motorları için fotoğrafın açıklaması.
  image_alt text not null
    constraint showcase_slides_image_alt_length
      check (char_length(btrim(image_alt)) between 1 and 200),

  -- Fotoğrafın dikeyde hangi kısmı görünsün: 0 = üst, 50 = orta, 100 = alt.
  -- Vitrin telefonda, tablette ve masaüstünde farklı oranlarda kırpılıyor.
  focus_y smallint not null default 50
    constraint showcase_slides_focus_y_range
      check (focus_y between 0 and 100),

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- set null: admin hesabı silinse de vitrin fotoğrafı kalmalı.
  created_by uuid references auth.users(id) on delete set null
);

create trigger showcase_slides_set_updated_at
  before update on showcase_slides
  for each row execute function set_updated_at();

alter table showcase_slides enable row level security;

create policy showcase_slides_admin_all on showcase_slides
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

grant select, insert, update, delete on table public.showcase_slides to authenticated;

comment on table showcase_slides is
  'Photos of the storefront home showcase (admin UI: /vitrin). image_path is a site file (starts with /) or an object key in the showcase-images bucket.';

-- Bugün vitrinde olan 3 fotoğraf (focus_y = koddaki object-position değerleri).
insert into showcase_slides (image_path, image_alt, focus_y, sort_order) values
  ('/brand/apuhan-acilis-masa.webp',
   'Bahçede, Apuhan Çiftliği kara tahtası önünde kuru kayısı, badem ve dut dolu masa',
   72, 1),
  ('/hakkimizda/tavuklar-acik-alan.webp',
   'Meyve ağaçlarıyla çevrili çayırda dolaşan kahverengi tavuklar, arkada dağlar',
   62, 2),
  ('/hakkimizda/kayisi-hazirligi.webp',
   'Bir kasanın içindeki kayısıların çekirdeklerinin elle ayrılması',
   55, 3);

-- Herkese açık okuma (Storage CDN üzerinden mağazaya), yazma sadece service
-- role ile (admin server action'ı) — bu yüzden insert/update politikası yok.
-- Bucket limitleri (5 MB, görsel türleri) action'daki kontrolün yedeği.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'showcase-images',
  'showcase-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Sıralamayı tek UPDATE ile yazar: p_ids'teki sıra yeni sıradır. Atomik, yani
-- yarıda kalıp iki fotoğrafın aynı sırada kaldığı bir ara durum olmaz.
-- security invoker: RLS geçerli, sadece admin satırları değiştirebilir.
create function reorder_showcase_slides(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.showcase_slides as s
     set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id;
$$;

revoke execute on function public.reorder_showcase_slides(uuid[]) from public, anon;
grant execute on function public.reorder_showcase_slides(uuid[]) to authenticated;
