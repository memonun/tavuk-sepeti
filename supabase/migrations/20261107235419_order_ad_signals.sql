-- order_ad_signals
--
-- Meta Conversions API (owner kararı 2026-11-08): satış, tarayıcıdaki Pixel'e
-- ek olarak sunucudan da Meta'ya bildirilir. Kart ödemesinde satış PayTR'nin
-- sunucudan sunucuya bildirimiyle kesinleşir; o istekte müşterinin tarayıcısı
-- yoktur. Bu yüzden Meta'nın satışı reklamla eşleştirmek için istediği
-- bilgiler sipariş anında burada kısa süreliğine tutulur:
--   * e-posta ve telefonun SHA-256 özeti (açık hali burada YOK),
--   * Meta'nın kendi çerezleri (_fbp, _fbc), IP adresi, tarayıcı bilgisi.
-- Satır, satış Meta'ya gönderilince silinir. Gönderilemeyen satır (ödenmemiş
-- kart siparişi gibi) 7 günden eski olunca bir sonraki siparişte temizlenir
-- (Meta zaten 7 günden eski olayı kabul etmez).
--
-- Sadece sunucu (service_role) okur/yazar. Müşteri veya admin oturumunun bu
-- tabloya işi yoktur: RLS açık, hiç politika yok, anon/authenticated yetkisi
-- bilerek kaldırılıyor (şablondaki "grant to authenticated" burada YOK).
--
-- Yeni tablo; mevcut tablolara ve eski koda dokunmaz.

create table order_ad_signals (
  -- Bir siparişin tek satırı. Sipariş silinirse bu geçici kayıt da gider.
  order_id uuid primary key references orders (id) on delete cascade,
  email_hash text check (email_hash is null or email_hash ~ '^[0-9a-f]{64}$'),
  phone_hash text check (phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$'),
  fbp text check (fbp is null or char_length(fbp) <= 600),
  fbc text check (fbc is null or char_length(fbc) <= 600),
  client_ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now()
);

-- 7 günden eski satırların temizliği created_at üzerinden aranır.
create index order_ad_signals_created_at_idx on order_ad_signals (created_at);

alter table order_ad_signals enable row level security;

revoke all on table public.order_ad_signals from anon, authenticated;
grant select, insert, update, delete on table public.order_ad_signals to service_role;

comment on table order_ad_signals is
  'Short-lived Meta Conversions API matching signals per web order (hashed email/phone, Meta cookies, IP, UA). Service-role only; deleted once the Purchase is sent, pruned after 7 days.';
