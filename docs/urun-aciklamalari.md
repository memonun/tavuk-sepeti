# Ürün açıklamaları — 15.10.2026

Mağazada görünen altı ürün için kısa vitrin metni (`web_description`) ve ürün sayfasındaki “Ürün hakkında” metni (`web_long_description`) hazırlandı. Tam metinler [içerik migration’ında](../supabase/migrations/20261015085006_urun_aciklamalari.sql) bulunur. Uzun metinler düz yazıdır; boş satırlar paragraf ayrımıdır. Hamit’in birinci tekil anlatımı yumurta ve pekmezde, üretim hazırlığı gün kurusu kayısıda kullanılır. Diğer ürünlerde doğrulanmış üretim ayrıntısı bulunmadığından sarı kayısı ve dut kurusu servis fikirleriyle, kayısı çekirdeği yalnızca katalogdaki ürün bilgisiyle anlatılır.

## Katalog ve kaynaklar

[Canlı mağazanın](https://apuhanciftligi.com/) herkese açık kataloğu 15.10.2026’da salt okunur incelendi. Aşağıdaki altı ürünün iki açıklama alanı da `null` idi. Eşleşme, panelden değiştirilebilen web adresi yerine ürünün kalıcı `key` alanıyla yapılır.

| Ürün / key | Kullanılan olgusal bilgi | Kaynak |
| --- | --- | --- |
| Yumurta / `eggs` | Çiftlikte tavuk yetiştirilmesi, kümesle ilgilenilmesi ve yumurta paketleme; babası ve babaannesiyle çalışma; başlangıçta tavuğa dokunamaması. | [Kümes, 23.04.2025](https://www.instagram.com/mr.apuhan/reel/DIy266PI0R9/), [tünek yapımı, 09.12.2025](https://www.instagram.com/mr.apuhan/reel/DSDE4_TiOs4/), [paketleme, 20.09.2025](https://www.instagram.com/mr.apuhan/reel/DO1PEIjiOYl/); [editöryel biyografi notu, 15.10.2026](hakkimizda-kaynaklar.md#biyografi-notu-2026-10-15). |
| Gün Kurusu Kayısı / `gun-kurusu-kayisi` | Malatya’da gün kurusu kayısı hazırlığı ve çekirdeklerin ayrılması. | [Kayısı hazırlığı, 16.07.2026](https://www.instagram.com/mr.apuhan/reel/Da2FgS5unqZ/). |
| Sarı Kuru Kayısı / `sari-kuru-kayisi` | Ürünün adı ve mağazada bulunması. | [Canlı ürün sayfası](https://apuhanciftligi.com/urun/sari-kuru-kayisi), inceleme 15.10.2026. |
| Gün Kurusu Kayısı Çekirdeği / `gun-kurusu-kayisi-cekirdegi` | Çekirdeğin kayısıdan ayrı ürün olarak sunulması. | [Canlı ürün sayfası](https://apuhanciftligi.com/urun/gun-kurusu-kayisi-cekirdegi), inceleme 15.10.2026. |
| Dut Pekmezi / `dut-pekmezi` | Pekmezi babaannesinin hazırlaması; ailece çiftlikte çalışma. | [Pekmez hazırlığı, 13.08.2026](https://www.instagram.com/mr.apuhan/reel/Db_IL6_hWEf/); [editöryel biyografi notu, 15.10.2026](hakkimizda-kaynaklar.md#biyografi-notu-2026-10-15). |
| Dut Kurusu / `dut-kurusu` | Ürünün adı ve mağazada bulunması. | [Canlı ürün sayfası](https://apuhanciftligi.com/urun/dut-kurusu), inceleme 15.10.2026. |

Kahvaltı, çay yanı, menemen, kek, komposto, tahin ve yoğurt gibi ifadeler editöryel servis fikirleridir; Hamit’in kişisel alışkanlıkları ya da ürünlerin üretim özellikleri olarak sunulmaz. Biyografi kaydı Instagram’dan ayrı tutulur; notu sağlayan kişinin adı kullanılmaz.

## Metne eklenmeyen ayrıntılar

- Kayısı çekirdeğinin tatlı/acı oluşu ve iç/kabuklu satılması doğrulanmadı; tüketim önerisi yazılmadı.
- Sarı kayısının işlem yöntemi, kükürt/katkı bilgisi; dut kurusunun menşei ve kurutma yöntemi belirtilmedi.
- Pekmezde soğuk sıkım, ilave şeker veya katkısızlık iddiası; yumurtada yem düzeni, günlük toplama, boyut veya sertifika iddiası kullanılmadı.
- Sağlık etkileri, raf ömrü, müşteri yorumu, eski fiyat ve kampanya eklenmedi. Paket ağırlığı, sipariş miktarı ve teslimat bilgileri mevcut katalog arayüzünden okunmaya devam eder.

## Uygulama ve sonraki düzenlemeler

Migration yalnızca bu altı ürünün boş alanlarını doldurur. Kısa ve uzun alanlar ayrı ayrı korunur: biri doluysa diğeri tamamlanır; panelden girilen metin ezilmez. Eksik ürün oluşturulmaz, fiyatlar ve şema değişmez. Metinler yayın sonrasında mevcut ürün düzenleme formundan değiştirilebilir.

Yeni üretim ayrıntıları Hamit’ten doğrulandığında ürün açıklamalarına eklenebilir. Mevcut metinlerin yayını bu ek bilgileri beklemez.
