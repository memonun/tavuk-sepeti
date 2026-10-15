-- product_web_long_description
--
-- Ürün sayfası (/urun/<slug>) için uzun, ayrıntılı açıklama alanı ekler.
-- Kısa "vitrin açıklaması" (web_description, ≤500) mağaza kartında kalır;
-- bu alan yalnızca ürün sayfasında görünür ve Google için 2-3 paragraflık
-- içerik taşır. Sadece ekleme: kolon boş bırakılabilir, eski kod onu hiç
-- okumaz/yazmaz, mevcut satırlar NULL ile kalır. Yeni tablo yok; products'ın
-- mevcut RLS politikaları ve grant'leri yeni kolonu da kapsar.

alter table public.products
  add column web_long_description text
    constraint products_web_long_description_length
    check (web_long_description is null or char_length(web_long_description) <= 4000);

comment on column public.products.web_long_description is
  'Optional long product-page description (plain text, paragraphs separated by blank lines). Shown only on /urun/<slug>.';
