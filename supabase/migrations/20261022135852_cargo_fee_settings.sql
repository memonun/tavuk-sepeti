-- cargo_fee_settings
--
-- Şehir dışı (kargo) siparişlerinin ücreti bir TS sabitiydi (CARGO_FEE_MINOR = 0,
-- yani herkese ücretsiz kargo) ve sadece yayınla değişebiliyordu. Owner
-- (2026-10-22) iki şeyi /magaza-ayarlari'dan kendisi değiştirmek istiyor:
--
--   * cargo_fee_minor — kargo siparişine eklenen sabit ücret. Bugün 150 ₺.
--   * cargo_free_shipping_threshold_minor — ara toplam bu tutara ULAŞINCA
--     (>=) kargo ücretsiz olur. Bugün 1.000 ₺. 0 = eşik yok, ücret her kargo
--     siparişine eklenir.
--
-- Tek satırlık storefront_settings tablosuna iki kolon: tablonun mevcut RLS'i
-- (herkes okur, sadece admin yazar) ve tablo düzeyindeki grant'ler yeni
-- kolonları da kapsar; ek grant gerekmez.
--
-- Default'lar owner'ın istediği değerler: `add column ... default` mevcut tek
-- satırı da bu değerlerle doldurur, ayrıca bir UPDATE gerekmez.
--
-- Geriye dönük uyum (CLAUDE.md §7): sadece kolon ekleniyor, hiçbir şey
-- silinmiyor veya yeniden adlandırılmıyor. Eski kod bu kolonları seçmediği için
-- şema ile kod yayını arasındaki birkaç dakikada eski kod olduğu gibi (ücretsiz
-- kargo) çalışmaya devam eder. Ücret siparişe place-order.ts'te sunucu tarafında
-- hesaplanıp orders.delivery_fee_minor olarak yazılır; RPC imzaları değişmiyor.

alter table storefront_settings
  add column if not exists cargo_fee_minor bigint not null default 15000
    constraint storefront_settings_cargo_fee_non_negative
      check (cargo_fee_minor >= 0),
  add column if not exists cargo_free_shipping_threshold_minor bigint not null default 100000
    constraint storefront_settings_cargo_free_threshold_non_negative
      check (cargo_free_shipping_threshold_minor >= 0);

comment on column storefront_settings.cargo_fee_minor is
  'Flat fee (kuruş) added to a cargo/out-of-city (shipping-channel) storefront order. 0 = free shipping for every cargo order. Delivery-channel orders are never charged this.';
comment on column storefront_settings.cargo_free_shipping_threshold_minor is
  'Cargo orders whose subtotal (kuruş) is >= this pay no cargo fee. 0 = no free-shipping threshold (cargo_fee_minor always applies).';
