-- egg_graduated_tiers
--
-- Fiyat kademeleri artık kademeli (graduated) hesaplanıyor: min_qty=m olan
-- kademe m. paketten itibaren her paketi fiyatlar (kod: product-pricing.ts).
-- Yumurta: 1. paket ₺130, 2. paket ₺120, 3. ve sonraki her paket ₺100 →
-- 1=130, 2=250, 3=350, 4=450, 5=550, 6=650 …
--
-- Sadece veri güncellemesi; şema değişmiyor, hiçbir satır silinmiyor.
-- min_qty=4 satırı (₺100) kalıyor: yeni hesapta etkisiz ama mağaza tablosu
-- 4. satırdan devam ediyor. Yalnızca YENİ siparişleri etkiler.

insert into product_price_tiers (product_key, min_qty, unit_price_minor)
select 'eggs', t.min_qty, t.unit_price_minor
from (values (1, 13000), (2, 12000), (3, 10000), (4, 10000)) as t(min_qty, unit_price_minor)
where exists (select 1 from products where key = 'eggs')
on conflict (product_key, min_qty)
  do update set unit_price_minor = excluded.unit_price_minor, updated_at = now();

update products set current_unit_price_minor = 13000 where key = 'eggs';
