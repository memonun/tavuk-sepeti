-- Ürünlerin kalıcı anahtarından bağımsız, düzenlenebilir web adresini ekler.
-- Kolon boş bırakılabilir; eski kod ve sipariş anahtarları çalışmaya devam eder.
-- Mevcut ürün adları Türkçe → ASCII çevrilir; çakışmalara -2, -3 eklenir.
alter table public.products add column web_slug text;

-- Her dolu web adresi tek bir ürünü göstermeli; NULL değerler eski yazımlara izin verir.
create unique index products_web_slug_unique on public.products (web_slug);
comment on index public.products_web_slug_unique is
  'Ensures each non-null storefront slug identifies one product; legacy inserts may omit it.';

-- Same transliteration, lowercasing, separator and fallback rules as
-- features/products/domain/product-key.ts slugifyProductKey. Reserve space
-- for collision suffixes within the public URL's 80-character limit.
do $$
declare
  product record;
  base_slug text;
  candidate text;
  suffix text;
  attempt integer;
begin
  for product in select key, display_name from public.products order by key collate "C"
  loop
    base_slug := lower(translate(product.display_name, 'çÇğĞıIiİöÖşŞüÜ', 'ccggiiiioossuu'));
    base_slug := trim(both '-' from regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g'));
    if base_slug = '' then base_slug := 'urun'; end if;
    attempt := 1;
    loop
      suffix := case when attempt = 1 then '' else '-' || attempt::text end;
      candidate := rtrim(left(base_slug, 80 - length(suffix)), '-') || suffix;
      exit when not exists (select 1 from public.products where web_slug = candidate);
      attempt := attempt + 1;
    end loop;
    update public.products set web_slug = candidate where key = product.key;
  end loop;
end;
$$;
