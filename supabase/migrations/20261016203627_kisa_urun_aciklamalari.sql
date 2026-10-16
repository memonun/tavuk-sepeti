-- Onaylanan iki cümlelik açıklamalar: docs/urun-aciklamalari.md.
-- Yalnızca altı mevcut ürünün boş kısa açıklamasını doldurur; paneldeki metin
-- korunur. Uzun açıklamalar, fiyatlar, miktarlar, görseller ve şema değişmez.
-- Eşleşme kalıcı primary key ile yapılır; eksik ürün oluşturulmaz.

with descriptions (key, description) as (
  values
    ('eggs', $copy$Akçadağ’daki gezen tavuklarımızın yumurtalarını her gün topluyoruz. Protein içeren yumurtalarımızı 15’li paketlerle Malatya içinde teslim ediyoruz.$copy$),
    ('gun-kurusu-kayisi', $copy$Malatya’daki bahçemizden, çekirdeklerini elle ayırdığımız gün kurusu kayısı. Lif içeren, kayısının kendine özgü tatlılığını günlük beslenmenize taşıyan bir kuru meyve.$copy$),
    ('sari-kuru-kayisi', $copy$Bahçemizin kayısılarından hazırladığımız sarı kuru kayısı. Lif ve potasyum içeren kuru kayısıyı, gün içinde küçük bir ara öğün olarak değerlendirebilirsiniz.$copy$),
    ('dut-pekmezi', $copy$Bahçemizin dutlarından, babaannemin hazırladığı pekmez. Dutun kendine özgü tadını kahvaltınıza taşıyan bu aile ürününü 930 gramlık kavanozlarda sunuyoruz.$copy$),
    ('dut-kurusu', $copy$Malatya’daki bahçemizin dutlarını kurutarak hazırlıyoruz. Lif içeren dut kurusu, günlük beslenmenizde sade olarak yer verebileceğiniz bir kuru meyve.$copy$),
    ('gun-kurusu-kayisi-cekirdegi', $copy$Kayısı ürünlerimiz arasında sunduğumuz gün kurusu kayısı çekirdeği. Yarım kilodan başlayan miktarlarda, kuru kayısıdan ayrı olarak sipariş verebilirsiniz.$copy$)
)
update public.products as product
set web_description = descriptions.description
from descriptions
where product.key = descriptions.key
  and nullif(btrim(product.web_description), '') is null;
