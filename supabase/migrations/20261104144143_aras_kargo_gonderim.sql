-- aras_kargo_gonderim
--
-- Aras Kargo entegrasyonu, Aşama 1: kargo siparişi admin panelinden Aras'a
-- SetOrder servisiyle gönderilir. Şube görevlisi alıcı adresini artık sesli
-- dinlemez; Kargo Kartı'ndaki "Aras kodu"nu okutur ya da yazar.
--
-- İki kolon, ikisi de boş olabilir; mevcut satırlara ve eski koda dokunmaz:
--   aras_integration_code  Aras'a gönderilen Entegrasyon Kodu (sipariş
--                          numarasının rakamları). Şubede bu kod girilir;
--                          iptal ve ileride durum sorgusu da bu koddan yapılır.
--   aras_sent_at           Bilgiler Aras'a en son ne zaman gönderildi.
--
-- Mevcut tablo, yeni kolon: RLS ve grant'lar orders tablosundan aynen geçerli.

alter table orders
  add column aras_integration_code text
    check (aras_integration_code is null or aras_integration_code ~ '^[0-9]{2,32}$'),
  add column aras_sent_at timestamptz;

-- Unique: one Aras code must map back to exactly one order — the status sync
-- (Aşama 2) looks orders up by this code. NULLs don't collide, so unsent
-- orders are unaffected. The constraint's index also serves that lookup.
alter table orders
  add constraint orders_aras_integration_code_key unique (aras_integration_code);

comment on column orders.aras_integration_code is
  'Aras Kargo IntegrationCode sent via SetOrder (digits of order_number). Null until the order is sent to Aras.';
comment on column orders.aras_sent_at is
  'When the order''s recipient data was last sent to Aras Kargo (SetOrder). Null until sent.';
