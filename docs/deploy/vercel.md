# Vercel deploy — adım adım

Vercel, Next.js'in arkasındaki şirket; otomatik deploy + env management +
preview-per-PR + edge network. Sıfır config — repo'yu bağla, deploy başlar.

## 1. Hesap + import

1. https://vercel.com → **Sign in with GitHub** (ücretsiz Hobby plan yeterli).
2. Dashboard → **Add New → Project**.
3. **Import Git Repository** → `memonun/tavuk-sepeti`'yi bul → **Import**.
4. Vercel otomatik algılar:
   - Framework: **Next.js** ✓
   - Build command: `pnpm build` ✓
   - Install command: `pnpm install` ✓
   - Output directory: `.next` ✓
5. **Henüz Deploy'a basma** — env vars'ı eklememiz lazım.

## 2. Environment variables

**Configure Project** ekranındaki **Environment Variables** bölümüne, kendi
`.env`'inden 14 değişkeni kopyala:

| Variable | Source / not |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env`'den |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env`'den |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`'den — **secret**, Production + Preview için |
| `SUPABASE_DB_URL` | `.env`'den (port 6543, transaction pooler) |
| `SUPABASE_DIRECT_URL` | `.env`'den (port 5432, session pooler — IPv4) |
| `GOOGLE_MAPS_SERVER_KEY` | `.env`'den — **secret** |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | `.env`'den (referrer-restricted, görünür olması ok) |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | `.env`'den |
| `NEXT_PUBLIC_APP_URL` | **Şimdilik:** `https://tavuk-sepeti.vercel.app` (Vercel default) — sonra custom domain'e güncellenir |
| `WAREHOUSE_LAT`, `WAREHOUSE_LNG` | `.env`'den |
| `GEOCODING_DAILY_LIMIT` | `2000` |
| `LOG_LEVEL` | `info` |
| `DEFAULT_TIMEZONE` | `Europe/Istanbul` |
| `DEFAULT_CURRENCY` | `TRY` |

> **Vercel UI'da** her değişken için **Production**, **Preview**, **Development**
> ortamlarına ayrı ekleniyor. Hepsini her üç ortama da işaretle (en kolayı:
> "Bulk add" varsa env'i komple yapıştır, ya da tek tek aynı değeri 3 ortama da ver).

## 3. Deploy → ilk URL'yi al

**Deploy** → 2-3 dk → "Congratulations" → URL'yi al, örn:
`https://tavuk-sepeti-xyz.vercel.app`. Bu URL prod'da çalışıyor ama 3
servisin onu **tanıması** lazım — yoksa boot ederken patlar.

## 4. Post-deploy: 3 servisi prod URL'den haberdar et

### 4a. Supabase Auth → Redirect URLs

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://tavuk-sepeti.vercel.app` (veya custom domain'in)
- **Redirect URLs (allowlist):** ekle:
  - `https://tavuk-sepeti.vercel.app/**`
  - `https://*.vercel.app/**` (preview deploy'ları için — opsiyonel ama
    PR review akışı varsa kolaylık)
  - `http://localhost:3000/**` (lokal dev hâlâ çalışsın)

Yoksa Vercel'de login → Supabase auth callback → "redirect_uri not
allowed" hatası.

### 4b. Google Maps browser key → HTTP referrer

Cloud Console → Credentials → `Tavuk Sepeti — Browser` key → Edit →
**Application restrictions → Websites** listesine ekle:

```
https://tavuk-sepeti.vercel.app/*
https://*.vercel.app/*
```

Yoksa harita yüklenmez (browser console'da `RefererNotAllowedMapError`).

### 4c. Google Maps server key → IP restrictions (opsiyonel, atlanabilir)

Vercel'in egress IP'leri sabit değil — IP restriction pratik değil.
Server key'i **None** bırak (kod tarafı `shared/env.ts` Proxy'siyle
zaten browser'a sızdırmaz). Quota guard + bütçe alarmı koruma yeter.

### 4d. `NEXT_PUBLIC_APP_URL`'i gerçek URL'ye güncelle

Vercel Dashboard → Project → Settings → Environment Variables →
`NEXT_PUBLIC_APP_URL` = `https://tavuk-sepeti.vercel.app` (veya custom
domain). Save → redeploy bir sonraki commit'te otomatik olur, ya da
"Redeploy" butonuyla manuel.

## 5. Custom domain (opsiyonel)

1. Vercel → Project → **Settings → Domains** → "Add" → domain'ini gir.
2. Domain registrar'ında DNS:
   - **A record**: `@` → `76.76.21.21` (Vercel default), VEYA
   - **CNAME**: `www` → `cname.vercel-dns.com`
   - Vercel UI tam DNS değerlerini gösterir.
3. SSL otomatik (Let's Encrypt). 5-30 dk içinde aktif.
4. **Site URL** ve **Maps referrer** listelerine yeni domain'i ekle (4a + 4b).
5. `NEXT_PUBLIC_APP_URL`'i güncelle, redeploy.

## 6. Smoke test (her deploy sonrası)

| Adım | Beklenen |
|---|---|
| Anasayfa aç | `/login`'e redirect |
| Admin email + şifre ile gir | Panel'e iniş, sidebar gözükür |
| Müşteriler sekmesi | Tablo render, eklediğin müşteri görünür |
| Yeni müşteri → adres yaz → pin gelir | Geocoding pipeline çalışıyor |
| Pin'i sürükle, kaydet | DB'ye yazıyor; pin source `admin_corrected` |
| Harita sekmesi | GTA stilli haritada müşteriler mor pin |
| Sipariş oluştur | Customer typeahead, ürün step validation, total hesabı |
| Onayla → Teslim Edildi | State machine, status timeline event log'a düşer |
| Rota → bugünü optimize et | Mor polyline yola tam oturur, ETA per stop |
| Driver mode → konum izni → yaklaşma popup | Sheet bottom slide-up |

Hata olursa: Vercel Dashboard → Project → **Logs** sekmesinden runtime
log'ları izle. `pino` JSON log'ları orada görünür.

## 7. CI/CD davranışı (otomatik)

Push'tan sonra Vercel:
- `main` → **Production** deploy (URL: tavuk-sepeti.vercel.app)
- Diğer branch / PR → **Preview** deploy (URL: pr-name-xyz.vercel.app)

Repo'da `.github/workflows/ci.yml` zaten typecheck + lint + test
yapıyor. PR'da hem CI hem Vercel preview paralel koşar.

## 8. Pre-deploy checklist (lokal'de)

```bash
pnpm verify   # typecheck + lint + test — Vercel build buna yakın
pnpm build    # prod bundle'ı lokal'de üret, hata varsa şimdi yakala
```

İkisi de yeşil → push → otomatik deploy.

---

**Şu an yapman gerekenler:**

1. Vercel hesabı / login (GitHub ile)
2. Repo'yu import (env variables hariç **Deploy'a tıklama**)
3. 14 env variable'ı UI'a yapıştır
4. Deploy → URL'yi paylaş
5. URL elinde varken Supabase + Google Maps allowlist'lerini güncelle

Adım 4'te URL elinde olunca buraya yaz, ben Supabase + Google Maps
ayar adımlarını birlikte koşarız. Custom domain'e geçmek istersen onu
da Vercel UI'dan ekleriz, DNS değerlerini söylerim.
