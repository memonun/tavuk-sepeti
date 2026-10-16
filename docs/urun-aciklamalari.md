# Kısa ürün açıklamaları — 16.10.2026

Bu sürüm, 16.10.2026’da onaylanan altı kısa açıklamayı kullanır. Metinler [migration](../supabase/migrations/20261016203627_kisa_urun_aciklamalari.sql) ile ürünlerin boş `web_description` alanlarına yazılır; mevcut uzun açıklamalar korunur. Ürün sayfasında, kartlarda ve mevcut meta/JSON-LD çıktılarında aynı kısa metin kullanılır.

Kaynak bağlantıları [ürün metni kaydında](../features/storefront/domain/product-copy.ts) tutulur ve ürün sayfasında görünür. Kaynaklar yalnızca kalıcı ürün anahtarı ve açıklamanın tamamı eşleştiğinde gösterilir. Panelden açıklama değişirse eski metne ait bağlantılar otomatik gizlenir.

## Kaynaklar ve kapsamları

İnceleme tarihi: **16.10.2026**. Üretim bilgileri, Hamit Apuhan’ın kendi metninden ve [kaynak kaydından](hakkimizda-kaynaklar.md) alınır. Ulusal gıda kompozisyon verileri belirli gıda örneklerinin genel bileşimini gösterir; Apuhan ürünlerinin laboratuvar analizi olarak sunulmaz. Bu ayrım, beslenme kaynağı bulunan dört ürün sayfasında açıkça yazılır.

| Ürün / kalıcı key | Metindeki bilgi | Kaynak |
| --- | --- | --- |
| Yumurta / `eggs` | Akçadağ’da gezen tavuklardan günlük toplama; protein içerme; 15’li paket ve Malatya teslimatı. | [Çiftlik anlatısı](https://apuhanciftligi.com/ciftligimiz), [canlı ürün kataloğu](https://apuhanciftligi.com/urun/yumurta), [TürKomp — tavuk yumurtası](https://turkomp.tarimorman.gov.tr/food-yumurta-tavuk-tam-26). |
| Gün Kurusu Kayısı / `gun-kurusu-kayisi` | Bahçede yetişen kayısı; çekirdeklerin elle ayrılması; lif içerme. | [Çiftlik anlatısı](https://apuhanciftligi.com/ciftligimiz), [hazırlık paylaşımı, 16.07.2026](https://www.instagram.com/mr.apuhan/reel/Da2FgS5unqZ/), [TürKomp — Hacıhaliloğlu günkurusu](https://turkomp.tarimorman.gov.tr/food-kayisi-hacihaliloglu-gunkurusu-347). |
| Sarı Kuru Kayısı / `sari-kuru-kayisi` | Bahçedeki kayısılardan kuru meyve hazırlığı; kuru kayısıda lif ve potasyum bulunması. | [Çiftlik anlatısı](https://apuhanciftligi.com/ciftligimiz), [TürKomp — Hacıhaliloğlu kuru kayısı](https://turkomp.tarimorman.gov.tr/food-kayisi-hacihaliloglu-kukurtlu-kuru-348). |
| Dut Pekmezi / `dut-pekmezi` | Bahçedeki dutlar; babaannenin hazırlaması; 930 gramlık kavanoz. | [Çiftlik anlatısı](https://apuhanciftligi.com/ciftligimiz), [canlı ürün kataloğu](https://apuhanciftligi.com/urun/dut-pekmezi). |
| Dut Kurusu / `dut-kurusu` | Bahçedeki dutların kurutulması; lif içerme. | [Çiftlik anlatısı](https://apuhanciftligi.com/ciftligimiz), [TürKomp — beyaz kuru dut](https://turkomp.tarimorman.gov.tr/food-dut-beyaz-kuru-373). |
| Gün Kurusu Kayısı Çekirdeği / `gun-kurusu-kayisi-cekirdegi` | Ayrı ürün olarak sunulması; yarım kilodan başlayan sipariş miktarı. | [Canlı ürün kataloğu](https://apuhanciftligi.com/urun/gun-kurusu-kayisi-cekirdegi). |

TürKomp kayısı çeşidi ve işlem adı, Apuhan kayısısının çeşidi veya işlem yöntemi olarak ileri sürülmez. Sayısal besin değerleri, “yüksek lif”, “protein kaynağı”, sindirimi iyileştirme, tedavi veya sertifika iddiası eklenmez. Kayısı çekirdeğinin tatlı/acı ve iç/kabuklu bilgisi doğrulanmadığından beslenme/sağlık iddiası ve tüketim önerisi bulunmaz.

## Yayın davranışı

Canlı kataloğun 16.10.2026’daki salt okunur incelemesinde altı kısa ve uzun açıklama da boştu. Migration yalnızca kısa açıklaması boş olan mevcut altı ürünü, kalıcı `key` ile günceller; panelde yazılmış metni ezmez, eksik ürün oluşturmaz. Fiyat, miktar, görsel, teslimat ayarları ve veritabanı şeması değişmez. Yeniden çalıştırıldığında dolu alanlara dokunmaz.

Kaynaklar düz metne veya meta açıklamalarına URL olarak eklenmez; ürün sayfasında ayrı, erişilebilir bağlantılar şeklinde gösterilir. Bu sürümün uygulanması mevcut DB Kontrol → merge → DB Yayın akışını izler.
