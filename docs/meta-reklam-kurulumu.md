# Meta reklam yönetimi — kurulum ve kullanım

Claude, panelin MCP bağlantısı (claude.ai) üzerinden Meta (Facebook + Instagram) reklamlarını yönetir:

- reklam hesabının durumunu ve sonuçlarını okur,
- günlük bütçeleri değiştirir,
- kampanya, reklam seti ve reklamları açar ya da durdurur,
- yeni kampanya, reklam seti ve reklam oluşturur.

Bunların hepsini **/reklam** sayfasındaki limitler içinde yapar.

İşletme sahibinin kararı (15.10.2026):
- Limitler içinde otomatik uygulansın ve her değişiklik raporlansın.
- Günlük toplam tavan **1.500 ₺**.
- Bütçe tek seferde en fazla **%50** artırılabilir.

## Güvenlik nasıl sağlanıyor

Limitleri Claude'un kendisi değil, **sunucu** uygular. Her değişiklikten hemen önce sunucu iki şeyi baştan okur: Meta'daki güncel bütçeleri ve /reklam sayfasındaki limitleri. Limiti aşan istek reddedilir.

| Kural | Ayrıntı |
| --- | --- |
| Günlük toplam tavan | Yayındaki bütün bütçe taşıyan kampanya ve reklam setlerinin günlük bütçeleri toplamı tavanı aşamaz. Bu kural hem bütçe artırırken hem de bir şeyi yayına alırken kontrol edilir. |
| Tek seferde artış | Bir bütçe bir değişiklikte en fazla belirlenen yüzde kadar artar. Bütçe düşürmeye sınır yok. |
| Günlük değişiklik sayısı | Aynı kampanya ya da reklam setine günde en fazla belirlenen sayıda değişiklik yapılabilir. Gün İstanbul saatine göre sayılır. |
| Yeni açılanlar | Her zaman **durdurulmuş** açılır. Harcamaya başlamaları ancak tavan kontrolünden geçen bir "yayına al" işlemiyle olur. Günde en fazla 10 kampanya, reklam seti veya reklam açılabilir. |
| Reklam bağlantısı | Reklamlar sadece mağazanın kendi sitesine (apuhanciftligi.com) link verebilir. |
| Acil durdur | /reklam → "Reklam otomasyonu açık" kutusunun işaretini kaldırıp kaydet. Bundan sonra hiçbir bütçe, durum ya da yeni reklam değişikliği yapılmaz. |
| Okunamayan ayar | Ayarlar veritabanından okunamazsa otomasyon kapalı sayılır. |
| Toplam bütçeli kampanyalar | Toplam (lifetime) bütçeyle çalışan kampanyalara otomasyon dokunmaz. Bunlar tavan hesabına da girmez. |

Her değişiklik `meta_ads_changes` tablosuna yazılır: ne yapıldı, eski ve yeni bütçe, neden yapıldığı ve kimin yaptığı. /reklam sayfasında görünür. Bu kayıtlar değiştirilemez ve silinemez.

**Meta'nın kendi davranışı:** Meta bazı günler günlük bütçenin %75'e kadar üstünde harcayıp haftalık ortalamada dengeleyebilir. Tavan, API'nin kontrol edebildiği şeyi, yani bütçeleri sınırlar. Bu yüzden ikinci emniyet olarak Meta'da **hesap harcama limiti** koyun (aşağıda 2. adım).

## Kurulum (işletme sahibi yapar)

1. **İşletme portföyünü kontrol et** (business.facebook.com → Ayarlar)
   - Reklam hesabı, Facebook sayfası ve Instagram hesabı aynı işletme portföyünde olmalı.
   - Reklam hesabının para birimi **TRY** olmalı. Başka para birimindeki hesaplar reddedilir.
   - Reklam hesabında ödeme yöntemi tanımlı olmalı.
2. **Hesap harcama limiti koy** (Reklam hesabı → Ödeme ayarları → Hesap harcama limiti)
   - Örneğin aylık 45.000 ₺. Bizim tarafta bir hata olsa bile Meta bu limiti aşmaz.
3. **Uygulama oluştur** (developers.facebook.com → Uygulamalarım → Uygulama Oluştur)
   - Türü **İşletme** olsun (ya da "Reklamları Marketing API ile yönet" kullanım senaryosu).
   - Uygulamayı aynı işletme portföyüne bağla ve **Marketing API** ürününü ekle.
4. **Sistem kullanıcısı oluştur** (İşletme Ayarları → Kullanıcılar → Sistem kullanıcıları → Ekle)
   - Adı `apuhan-panel`, rolü Yönetici olsun.
   - Varlık olarak şunları ata:
     - reklam hesabı (tam kontrol),
     - Facebook sayfası (reklam oluşturma),
     - Pixel / veri kümesi,
     - 3. adımdaki uygulama.
5. **Token üret** (sistem kullanıcısı → Yeni token oluştur)
   - Uygulama: 3. adımdaki. Süre: **Hiçbir zaman dolmasın**.
   - İzinler: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `instagram_basic`.
   - Token'ı **hiçbir yere yapıştırma** (sohbet, WhatsApp, e-posta). Doğrudan 7. adımda Vercel'e gir.
6. **Kimlikleri topla**
   - Reklam hesabı ID'si (Reklam Yöneticisi'nde sol üstte, `act_…` ya da sadece rakam).
   - Facebook sayfası ID'si (Sayfa → Hakkında → Sayfa şeffaflığı).
   - Instagram hesabı ID'si (İşletme Ayarları → Hesaplar → Instagram hesapları).
   - Pixel zaten sitede tanımlı (`NEXT_PUBLIC_META_PIXEL_ID`); Etkinlik Yöneticisi'ndekiyle aynı olduğunu kontrol et.
7. **Vercel'e gir** (Vercel → tavuk-sepeti → Settings → Environment Variables → Production)
   - `META_ADS_ACCESS_TOKEN`: 5. adımdaki token. "Sensitive" işaretli olsun.
   - `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_INSTAGRAM_USER_ID`: 6. adımdaki numaralar.
   - Kaydettikten sonra son yayını yeniden başlat (Deployments → … → Redeploy). Ortam değişkenleri ancak yeniden yayınla devreye girer.
8. **Kontrol et:** /reklam → "Bağlantı" bölümünde dört satır da ✓ olmalı.

## Claude'a nasıl iş verilir

claude.ai'de panel bağlantısı açıkken (Ayarlar → Bağlayıcılar), örneğin:

- "Reklamlar dün nasıl gitti? Özetle."
- "Yumurta için Malatya merkezli 15 km'lik bir satış kampanyası aç, günlük 200 ₺, ürün görselini kullan, sonra yayına al."
- "Dünkü sonuçlara bak; satış getireni limitler içinde artır, para yakanı kıs ya da durdur, bana rapor ver."

Kullanılan araçlar:
- Okuma: `get_ads_overview`, `list_ads_changes`
- Yazma: `set_ad_budget`, `set_ad_status`, `create_ad_campaign`, `create_ad_set`, `create_ad`

Yazma araçları claude.ai'de "onay iste" olarak işaretlidir.

## Günlük otomasyon (zamanlanmış görev)

claude.ai → Zamanlanmış görevler (Routines) bölümünde her sabah 09:00 için yeni bir görev oluştur ve panel bağlayıcısını ekle. Görevde kimse onay veremeyeceği için, o görevde reklam yazma araçlarına "her zaman izin ver" seçilmeli. Limitler zaten sunucuda uygulanıyor.

Görev metni için öneri:

> Apuhan Çiftliği Meta reklamlarını yönet. `get_ads_overview` ile dünü (`yesterday`) ve son 7 günü (`last_7d`) oku.
> - Son 7 günde satış getiren ve satış başına maliyeti sepet ortalamasının altında kalan kampanyaların bütçesini artır.
> - 3 gündür harcayıp hiç satış getirmeyenleri kıs ya da durdur.
> - Yeni bir şey denemek mantıklıysa kampanya aç.
> Limitler sunucuda zorunlu; bir istek reddedilirse sebebine göre daha küçük bir adımla tekrar dene ya da bırak. Her değişikliğin `reason` alanına somut gerekçe yaz. Sonunda `list_ads_changes` ile bugün yapılanları al ve Türkçe kısa bir rapor yaz: ne değişti, neden, toplam günlük bütçe ve tavan.

## Teknik

- Kod: `features/ads/` (domain: limit kuralları ve Meta istek gövdeleri, birim testli; infrastructure: Graph API v26.0 istemcisi ve tablolar; application: işlemler), araçlar `features/mcp/application/tools/ads-tools.ts`.
- Tablolar: `meta_ads_settings` (tek satır), `meta_ads_changes` (sadece eklenir). Migration `20261015211425_meta_ads_settings.sql`.
- Ayarlar `shared/env.ts`'te değil, `features/ads/infrastructure/meta-ads-config.ts`'te okunur: hatalı bir değer siteyi düşürmez, sadece reklam araçlarını kapatır.
