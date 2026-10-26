-- urun_indirimli_fiyat
--
-- Ürünlere isteğe bağlı "indirimli fiyat" ekler (kuruş / birim). Boşsa
-- (null) ürün indirimde değildir. Doluysa satır toplamı, normal (kademeli)
-- fiyat ile indirimli birim fiyat × miktar'dan DÜŞÜK olanıdır
-- (kod: product-pricing.ts). Mağaza eski fiyatı üstü çizili gösterir.
--
-- Geriye dönük uyumlu: sadece boş (nullable) yeni kolon; mevcut satırlar ve
-- eski kod etkilenmez. products tablosunun RLS politikaları ve tablo
-- düzeyindeki select/update yetkileri yeni kolonu da kapsar. Index yok:
-- kolon filtrelenmiyor, sadece okunuyor.

alter table public.products
  add column discount_unit_price_minor bigint
    check (discount_unit_price_minor is null or discount_unit_price_minor > 0);

comment on column public.products.discount_unit_price_minor is
  'İndirimli birim fiyat (kuruş). null = indirim yok. Satır toplamı normal fiyattan yüksek olamaz.';
