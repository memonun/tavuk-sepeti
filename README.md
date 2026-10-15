<p align="center">
  <img src="public/brand/apuhan-ciftligi-logo.png" alt="Apuhan Çiftliği" width="112" />
</p>

# Apuhan Çiftliği

**Online mağaza, sipariş yönetimi ve teslimat operasyonu — tek uygulamada.**

Apuhan Çiftliği'nin yumurta, süt ürünleri ve kargoya uygun çiftlik ürünlerini müşteriye ulaştırmak için geliştirilmiş web uygulaması. Müşteri mağazasını; müşteri kayıtları, siparişler, tahsilatlar, günlük teslimat rotaları ve finans takibiyle aynı sistemde buluşturur.

WordPress, Excel ve elle koordinat girme üzerine kurulu eski iş akışını tek bir yönetim panelinde toplamak amacıyla başladı. Bugün müşteri hesapları, misafir siparişi, kartlı ödeme, düzenli sipariş talepleri ve işletme planlamasını da kapsıyor.

[Mağaza](https://apuhanciftligi.com) · [Kurulum](#kurulum) · [Komutlar](#komutlar) · [Mimari](#mimari) · [Dokümantasyon](#dokümantasyon)

## Neler yapar?

| Alan | Özellikler |
| --- | --- |
| **Müşteri mağazası** | Teslimat bölgesine göre ürün kataloğu, sepet, üyelik veya misafir olarak sipariş, adres defteri, hesap yönetimi ve sipariş sorgulama. |
| **Sipariş ve CRM** | Müşteri kayıtları, hücre üzerinden düzenlenebilen tablolar, kayıtlı görünümler, toplu sipariş girişi, müşteriye özel fiyatlar, ödeme kayıtları ve işlem geçmişi. |
| **Eve servis** | Malatya içi teslimat, adres arama ve haritada pin düzeltme, günlük rota optimizasyonu, tahmini teslimat saatleri, araç yükleme listesi ve mobil şoför modu. |
| **Kargo** | Türkiye geneli gönderime uygun ürünler, ayrı kargo sipariş listesi, kargo firması ve takip bilgileri. |
| **Düzenli sipariş** | Tekrarlayan sipariş şablonları, müşteri tarafından gönderilen ve yönetici onayıyla etkinleşen düzenli sipariş talepleri. |
| **Finans** | Ciro ve tahsilat özeti, bekleyen ödemeler, gider kategorileri, rutin giderler, pazar satışları ve ürün çetelesi. |
| **Planlama** | Gün, hafta ve ay görünümleriyle takvim; etkinlikler, teslimatlar, anımsatıcılar ve yönetici bildirimleri. |
| **AI bağlantısı** | Yetkili yöneticinin Claude üzerinden panel verilerini okuyup mevcut iş kurallarıyla işlem yapabildiği uzak MCP sunucusu. |

## Siparişten teslimata

1. Müşteri mağazadan ürünlerini seçer veya yönetici panelden tekli/toplu sipariş oluşturur.
2. Ürünler ve adres, siparişin **eve servis** mi **kargo** mu olacağını belirler. Fiyatlar sunucuda yeniden hesaplanır.
3. Ödeme yöntemi ve teslimat koşulları doğrulanır; sipariş, kalemleri ve adres bilgileri kaydedilir.
4. Yönetici siparişi işler. Eve servis siparişleri günlük rotaya, kargo siparişleri gönderim listesine alınır.
5. Teslimat, tahsilat ve durum değişiklikleri panelden takip edilir; müşteri siparişinin durumunu sorgulayabilir.

Sipariş durumları:

```text
pending → confirmed → delivered
              └────→ shipped → delivered
```

`pending`, `confirmed` ve `shipped` durumlarından gerekçe belirtilerek `cancelled` durumuna geçilebilir. `shipped`, kargo akışındaki isteğe bağlı ara adımdır. Geçiş kuralları [sipariş durum makinesinde](features/orders/domain/order-state-machine.ts) tutulur.

### Temel iş kuralları

- Taze yumurta ve süt ürünleri Malatya içi eve servisle; kargoya uygun ürünler Türkiye genelinde gönderimle sunulur. Karma sepetler ve uygun kayıtlı adresler için teslimat kanalı ayrıca hesaplanır.
- Eve servis günleri, minimum sipariş tutarları ve eve servis ücreti `/magaza-ayarlari` üzerinden yönetilir.
- Kapıda nakit ödeme yalnızca eve servis siparişlerinde sunulur. Havale/EFT ve yapılandırılmışsa PayTR ile kart ödeme her iki kanalda kullanılabilir.
- Müşterinin düzenli sipariş talebi yönetici onayından önce etkinleşmez. Vadesi gelen siparişlerin üretimi rota sayfası açılırken; rutin giderlerin üretimi ilgili panel sayfaları açılırken yapılır. Bu akışlar harici bir cron görevine dayanmaz.
- Şoför ekranında rota sayfalarının çevrimdışı kopyası bulunur. Bu destek, çevrimdışıyken teslimat veya ödeme kaydı gönderen bir senkronizasyon sistemi değildir.

Finans modülü işletmenin gelir, gider ve tahsilat görünümünü sağlar. Tam muhasebe, stok yönetimi, çok araçlı filo optimizasyonu ve müşteriye canlı konum yayını mevcut kapsamın dışındadır.

## Teknik yapı

| Katman | Teknoloji |
| --- | --- |
| Uygulama | Next.js 16 App Router, React 19, TypeScript strict |
| Veri ve kimlik | Supabase PostgreSQL, PostGIS, Auth, Row Level Security ve Storage |
| Arayüz | Tailwind CSS 4, shadcn/ui, Base UI, Lucide |
| Formlar ve tablolar | React Hook Form, Zod, TanStack Table ve Virtual |
| Haritalar | Google Maps JavaScript API, Places, Geocoding ve Routes API; `@vis.gl/react-google-maps` |
| Ödeme ve e-posta | PayTR, Resend |
| AI erişimi | Model Context Protocol SDK, Supabase OAuth ve yönetici yetkisi kontrolü |
| Kalite ve yayın | Vitest, ESLint, GitHub Actions, Vercel |

Para değerleri **kuruş** cinsinden tutulur. İş takvimi ve kullanıcıya gösterilen saatler **Europe/Istanbul**, para birimi **TRY** üzerinden ele alınır. Sunucu logları `pino` ile yapılandırılır ve kişisel veriler merkezi kurallarla maskelenir.

## Kurulum

### Gereksinimler

- **Node.js 22**: CI ile aynı sürüm ailesi. `package.json` tarafından desteklenen aralık `>=20.18 <23`.
- **pnpm 10.33.0**: Sürüm `packageManager` alanında sabittir.
- Geliştirme için erişiminiz olan bir **Supabase projesi**.
- Migration ve tip üretimi işlemleri için **Supabase CLI**. Veritabanı workflow'ları `2.115.0` sürümünü kullanır.
- Harita özellikleri için **Google Maps Platform** anahtarları.
- **Docker**, yerel Supabase/migration testleri ve `db:types:docker` yolu için gerekir; bağlı bulut projesinden `db:types` ile tip üretmek için gerekmez.

### 1. Repoyu alın

```bash
git clone https://github.com/memonun/tavuk-sepeti.git
cd tavuk-sepeti
pnpm install --frozen-lockfile
cp .env.example .env
```

Next.js, Vitest ve repodaki veritabanı komutlarının aynı ayarları okuyabilmesi için yerel kurulumda `.env` kullanın. Değişkenlerin tam listesi [`.env.example`](.env.example), doğrulaması ise [`shared/env.ts`](shared/env.ts) içindedir.

### 2. Ortam değişkenlerini doldurun

| Değişken | Amaç |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje adresi. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tarayıcı/oturum istemcilerinin kullandığı anon anahtarı. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yalnızca sunucuda kullanılan ayrıcalıklı anahtar. |
| `SUPABASE_DB_URL` | PostgreSQL bağlantısı; örnek ayarda transaction pooler, port `6543`. |
| `SUPABASE_DIRECT_URL` | CLI işlemleri için session destekleyen bağlantı; doğrudan bağlantı veya uygun session pooler, port `5432`. |
| `NEXT_PUBLIC_APP_URL` | Yerelde `http://localhost:3000`; canlı mağazada `https://apuhanciftligi.com`. |
| `GOOGLE_MAPS_SERVER_KEY` | Sunucudaki Geocoding ve Routes API çağrıları. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Tarayıcıdaki haritalar ve adres arama; Maps JavaScript API ve Places API (New). |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Harita kimliği ve bulut tabanlı harita stili. |
| `WAREHOUSE_LAT`, `WAREHOUSE_LNG` | Kayıtlı varsayılan konum seçilmediğinde rotanın başlangıç koordinatları. |

Supabase bağlantı adreslerini projenizin bağlantı ekranından alın. Harita anahtarlarını sunucu ve tarayıcı için ayrı tutun; tarayıcı anahtarının HTTP referrer izinlerine geliştirme ve yayın adreslerini ekleyin. `SUPABASE_SERVICE_ROLE_KEY`, ödeme sırları ve e-posta API anahtarları `NEXT_PUBLIC_` önekiyle tanımlanmaz.

İsteğe bağlı servisler:

| Servis | Değişkenler | Yapılandırılmadığında |
| --- | --- | --- |
| Kart ödeme | `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`, `PAYTR_TEST_MODE` | Kart seçeneği gösterilmez. Kanalın izin verdiği diğer ödeme yöntemleri kullanılabilir. |
| Sipariş e-postaları | `RESEND_API_KEY`, `EMAIL_FROM` | E-posta gönderimi atlanır; sipariş akışı devam eder. |
| Yönetici e-postaları | `ADMIN_NOTIFICATION_EMAIL` ve e-posta servisi ayarları | Panel içi bildirimler kullanılmaya devam eder. |
| Meta Pixel | `NEXT_PUBLIC_META_PIXEL_ID` | Takip kodu yüklenmez. Etkinleştirme notları `.env.example` içindedir. |

PayTR test modu `1`, canlı mod `0` değeridir. Canlı PayTR yapılandırmasında `NEXT_PUBLIC_APP_URL` tam olarak `https://apuhanciftligi.com` olmalıdır; bildirim adresi **`https://apuhanciftligi.com/api/paytr/callback`** olarak ayarlanır. `www` adresine yönlendirilen callback ödeme kaydını aksatabilir.

### 3. Geliştirme veritabanını hazırlayın

Yeni geliştirme projesine repodaki migration'ları uygulayın:

```bash
pnpm db:push
```

Bu komut `.env` içindeki `SUPABASE_DIRECT_URL` ile belirtilen veritabanına migration uygular. Mevcut bir projeye bağlanıyorsanız önce migration geçmişinin repo ile uyumunu doğrulayın. Canlı projenin normal yayın akışı [DB Yayın](#veritabanı-ve-yayın-akışı) workflow'udur.

Veritabanı tipleri repoda bulunur. Şema değişikliği sonrasında bağlı projenizden yenilemek için:

```bash
supabase login
supabase link --project-ref PROJE_REF
pnpm db:types
```

`PROJE_REF` yerine kendi Supabase proje referansınızı yazın. Doğrudan bağlantı ve Docker kullanan alternatif komut `pnpm db:types:docker` şeklindedir.

### 4. Kimlik doğrulama ve yönetici erişimini hazırlayın

Supabase Auth URL ayarlarında yerel adresi ve `http://localhost:3000/**` dönüş adreslerini tanımlayın. Doğrulama ve şifre sıfırlama e-posta şablonları [`supabase/templates/`](supabase/templates/) altında tutulur; bulut projesindeki şablonlar ayrıca yapılandırılır.

Yönetici erişimi için Supabase Auth hesabına ek olarak `public.app_users` tablosunda, **aynı kullanıcı UUID'siyle ve `role = admin` değeriyle** bir kayıt bulunmalıdır. İlk kurulumda yetkili proje yöneticisi bu hesabı ve rol kaydını hazırlar. Müşteri kaydı oluşturmak yönetici yetkisi vermez.

> **Kurulum notu:** [`scripts/create-admin.mjs`](scripts/create-admin.mjs) Auth hesabını oluşturur/günceller, ancak eski otomatik admin trigger'ına dayanır. Bu trigger müşteri hesapları eklenirken kaldırılmıştır. Güncel şemada betik tek başına yönetici yetkisi vermez ve `app_users` kontrolünde hata dönebilir.

### 5. Uygulamayı çalıştırın

```bash
pnpm dev
```

| Adres | Ekran |
| --- | --- |
| `http://localhost:3000` | Müşteri mağazası |
| `http://localhost:3000/login` | Yönetici girişi |
| `http://localhost:3000/admin` | Yönetim paneli |
| `http://localhost:3000/giris` | Müşteri girişi |

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `pnpm dev` | Geliştirme sunucusu. |
| `pnpm build` | Üretim derlemesi. |
| `pnpm start` | Derlenmiş uygulamayı çalıştırır. |
| `pnpm verify` | TypeScript kontrolü, ESLint ve Vitest'i sırayla çalıştırır. |
| `pnpm typecheck` | TypeScript tip kontrolü. |
| `pnpm lint` | ESLint kontrolü. |
| `pnpm test` | Testleri bir kez çalıştırır. |
| `pnpm test:watch` | Testleri izleme modunda çalıştırır. |
| `pnpm db:new kisa_isim` | Sıralı sürüm numarası ve proje şablonuyla yeni migration oluşturur. |
| `pnpm db:push` | Ayarlanan veritabanına bekleyen migration'ları uygular. |
| `pnpm db:types` | Bağlı Supabase projesinden TypeScript tiplerini yeniler. |
| `pnpm db:types:docker` | Bağlantı URL'si ve Docker üzerinden tipleri yeniler. |

Domain testleri ilgili kodun yanında, RLS entegrasyon testleri `tests/integration/`, veritabanı yayın araçlarının testleri `scripts/db/` altında bulunur. CI, `pnpm typecheck`, `pnpm lint` ve `pnpm test` çalıştırır.

RLS entegrasyon testleri gerçek bağlantı/anahtar kontrolüyle koşullu çalışır; CI'ın örnek anahtarlarıyla atlanır. Gerçek bir geliştirme projesiyle çalıştıklarında geçici test kayıtları oluşturup temizlerler.

## Mimari

Kod, iş alanlarına göre düzenlenir. Her özellik kendi iş kurallarını, uygulama akışlarını, veri erişimini ve arayüzünü birlikte taşır:

```text
features/<alan>/
├── domain/          Modeller, doğrulama şemaları ve saf iş kuralları
├── application/     Kullanım senaryoları ve Server Action'lar
├── infrastructure/  Supabase sorguları, mapper'lar ve dış servisler
└── ui/              Özelliğin ekranları ve bileşenleri
```

Katman ve özellikler arası import kuralları ESLint ile denetlenir. Özellikler birbirine `application/` üzerinden erişir; `shared/` ortak altyapıyı taşır ve özelliklere bağımlı olmaz. Mağaza, CRM ve MCP bağlantısı sipariş/fiyatlandırma işlemlerinde mevcut uygulama akışlarını paylaşır.

```text
app/
├── (shop)/          Herkese açık mağaza, hesap ve ödeme sayfaları
├── (admin)/         CRM, finans, rota, takvim ve anımsatıcılar
├── api/mcp/         Uzak MCP bağlantısı
├── api/paytr/       Ödeme bildirimi
└── oauth/consent/   Connector yetkilendirme ekranı
features/            İş alanlarına göre uygulama kodu
components/          Ortak UI, adres ve tablo bileşenleri
shared/              Kimlik/veri istemcileri, hata, log, audit ve yardımcılar
supabase/            Migration'lar, yapılandırma ve e-posta şablonları
scripts/             Veri aktarımı, bakım ve veritabanı yayın araçları
tests/               Test kurulumu ve entegrasyon testleri
docs/                Kurulum, tasarım ve operasyon belgeleri
.github/workflows/   CI, DB Kontrol ve DB Yayın
```

Geliştirme kuralları [`CLAUDE.md`](CLAUDE.md) içinde tutulur: sınır doğrulaması, RLS, para/tarih modeli, yapılandırılmış loglar ve migration disiplini. [`SPEC.md`](SPEC.md) ilk fazın tasarım belgesidir; müşteri mağazası ve ödeme gibi daha sonra eklenen özellikler için güncel uygulama kodu ve ilgili belgeler de incelenmelidir.

## Veritabanı ve yayın akışı

Veritabanı değişiklikleri migration olarak sürümlenir. Yeni dosya `pnpm db:new kisa_isim` ile oluşturulur; yayınlanmış migration değiştirilmez. Yeni tablolarda RLS ve gerekli erişim izinleri aynı migration'da tanımlanır.

```text
PR → CI + DB Kontrol → main'e merge → DB Yayın → Vercel
```

- **CI:** Tip, lint ve test kontrolleri.
- **DB Kontrol:** Veritabanı değişiklikleri için migration denetimi, boş veritabanında tekrar oynatma ve Türkçe PR raporu. Tehlikeli değişiklikler açık onay gerektirir.
- **DB Yayın:** Bekleyen migration'lar varsa kontrol, tekrar oynatma ve canlı şemada geri alınan ön-deneme; ardından uygulama ve doğrulama. Veritabanı hazır olduktan sonra Vercel yayını tetiklenir.

`main` için Vercel'in bağımsız otomatik Git yayını [`vercel.json`](vercel.json) içinde kapalıdır. Yayın workflow'u `SUPABASE_DB_URL` ve `VERCEL_DEPLOY_HOOK_URL` GitHub secret'larına ihtiyaç duyar. Ayrıntılar ve hata durumunda izlenecek yol: [`docs/veritabani-yayini.md`](docs/veritabani-yayini.md).

## Dokümantasyon

| Belge | İçerik |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Proje geliştirme kuralları ve migration politikası. |
| [`SPEC.md`](SPEC.md) | Başlangıç kapsamı, domain modeli ve ilk mimari kararlar. |
| [`docs/veritabani-yayini.md`](docs/veritabani-yayini.md) | DB Kontrol, DB Yayın, onay ve hata giderme akışı. |
| [`docs/claude-connector.md`](docs/claude-connector.md) | MCP araçları, OAuth, yetkilendirme ve bağlantı kurulumu. |
| [`docs/google-maps-setup.md`](docs/google-maps-setup.md) | Harita/Places kurulumu ve sorun giderme; rota optimizasyonu ayrıca Routes API kullanır. |
| [`docs/maps/README.md`](docs/maps/README.md) | Bulut tabanlı harita stili ve Map ID ayarları. |
| [`.env.example`](.env.example) | Ortam değişkenleri ve servis yapılandırma notları. |

## Lisans

Bu repoda açık kaynak lisansı tanımlanmamıştır. Kullanım ve dağıtım izni için proje sahibiyle iletişime geçin.
