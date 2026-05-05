# E-Commerce CRM — Full Project Specification

> **Version:** 1.0 — Initial spec for Claude Code  
> **Owner:** [Sen]  
> **Status:** Ready to build  
> **Target audience:** Claude Code agent + future developers

---

## 0. TL;DR (Claude Code, önce bunu oku)

Süt/yumurta/peynir/yoğurt satışı yapan küçük ölçekli bir operasyonun **mevcut WordPress + manuel Excel + manuel koordinat girme** acısını öldürmek için **Next.js 15 (App Router) + TypeScript strict + Supabase (Postgres + PostGIS + Auth + RLS) + Vercel + Google Maps Platform** üstünde bir **admin-first e-commerce CRM** kuruyoruz.

**Faz 1 (bu spec'in kapsamı):** Tek adminin kullanacağı dashboard. Müşteri CRUD + otomatik geocoding, sipariş CRUD + state machine, harita üzerinde tüm müşteri/sipariş görselleştirmesi, günlük teslimat listesi + Google Directions ile otomatik rota optimizasyonu.

**Faz 1'de YOK ama altyapı buna hazır olacak:** Müşteri-facing website, recurring subscription (scheduled tek seferlik var, tekrar eden yok), online ödeme, multi-admin/role, SMS/email bildirim, stok takibi.

**Birinci kural:** Bu sistem **1000 eşzamanlı kullanıcı taşıyabilecek bir mimariye** sahip olarak yazılır. Şu anki yük düşük olsa bile **hiçbir kararda "şimdilik basit yapalım sonra düzeltiriz" denmez.** Schema, indeksleme, modülerlik, validation ve logging baştan production-grade kurulur. "Sonra eklenir" yalnızca **feature kapsamı** için geçerlidir, **mimari kararlar** için değil.

---

## 1. Hedef ve Kapsam

### 1.1 Problem
- Şu anda WordPress üzerinde sipariş takibi yapılıyor.
- Müşteri açık adresinden koordinata geçiş **manuel** (Google Maps'te bakıp elle giriliyor).
- Notlar ayrı, sipariş geçmişi dağınık, günlük teslimat rotası kafadan çıkarılıyor.
- Birden fazla SaaS aracına para ödeniyor.

### 1.2 Çözüm
Tek bir admin dashboard:
- Müşteri kayıtlarını tutar; **adresten otomatik koordinat** çıkarır (Google Geocoding API), gerekirse harita üzerinden **manuel düzeltme** yapılır.
- Sipariş alma, durum güncelleme, geçmiş görüntüleme tek panelden yapılır.
- Günlük teslimat planında **tüm o günün siparişleri haritaya basılır** ve Google Directions API ile **optimize rota** çıkarılır.
- İleride müşteri-facing site eklendiğinde aynı domain modeli üzerinde sorunsuz genişler.

### 1.3 Faz 1 MVP Kapsamı (kararlaştırıldı)
✅ Müşteri CRUD + adres → koordinat geocoding (manuel düzeltme dahil)  
✅ Sipariş CRUD + basit state machine: `pending → confirmed → delivered → cancelled`  
✅ Sipariş için **scheduled delivery date** alanı (recurring DEĞİL ama altyapı recurring'e hazır)  
✅ Harita view — tüm müşteri ve aktif siparişlerin görsel listesi  
✅ Günlük teslimat rotası — seçilen gün için Google Directions ile optimize rota  
✅ Tek admin authentication (Supabase Auth email/password)  
✅ Ödeme: kapıda / havale (sadece sipariş üzerinde `payment_method` ve `payment_status` alanları, gateway entegrasyonu yok)

### 1.4 Faz 1 Kapsam DIŞI (ama mimari hazır olacak)
❌ Müşteri-facing storefront (Faz 2)  
❌ Recurring subscription (Faz 2 — `recurring_template` tablosu schema'da hazır olacak ama UI yok)  
❌ Online ödeme — Stripe/Iyzico (Faz 3)  
❌ Stok takibi (Faz 2)  
❌ SMS/email bildirimleri (Faz 2)  
❌ Multi-admin role'leri (Faz 2 — schema'da `role` enum'u olacak ama tek admin var)  
❌ Raporlama dashboard'u (Faz 2)

---

## 2. Tech Stack — Karar Logu

| Katman | Seçim | Gerekçe |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Server Components + Server Actions admin panelinde minimum JS payload, Vercel'da first-class destek, RSC ile data-fetch çok temiz. |
| Dil | **TypeScript (strict, noUncheckedIndexedAccess)** | Domain modelinin runtime'a kadar güvenli aktığından emin olmak. |
| Validation | **Zod** | Tüm API/Server Action input'ları, env var'lar, dış API response'ları Zod ile parse edilir. |
| Database | **Supabase (Postgres 15+) + PostGIS** | PostGIS'siz koordinat sorguları (radius, içinde mi, en yakın N nokta) ölçeklenmez. PostGIS başından açılır. |
| Auth | **Supabase Auth (email/password)** | Tek admin için yeterli; gelecekte role eklemek RLS ile sorunsuz. |
| ORM/Query | **Supabase JS client + Postgres types via `supabase gen types`** + ham SQL gerektiğinde `postgres.js` ile sunucu tarafı | Heavy ORM (Prisma) overhead'ı yok; type-safety `gen types` ile sağlanır. Karmaşık sorgular için RPC (Postgres function) kullanılır. |
| Maps | **Google Maps Platform** — Geocoding API + Directions API + Maps JavaScript API | En doğru geocoding TR adresleri için Google. |
| Map UI | **`@vis.gl/react-google-maps`** (resmi React wrapper) | Maintained, hooks-friendly, lazy load destekli. |
| State machine | **Pure TS reducer + audit table** (XState'e Faz 1'de gerek yok) | Basit lifecycle için XState overkill; ama transition logic tek dosyada izole, Faz 2'de XState'e geçiş 1 günlük iş. |
| Logging | **`pino`** (server) + structured log + Vercel log drain | `console.log` yasak. Tüm log'lar JSON, korelasyon ID'li. |
| Error tracking | **Sentry** | Production'da hata yakalamadan deploy edilmez. |
| UI | **Tailwind CSS + shadcn/ui** | Hızlı ve consistent; admin panel için yeterli. |
| Forms | **react-hook-form + zod resolver** | Validation Zod ile aynı schema. |
| Tables | **TanStack Table v8** | Müşteri/sipariş tabloları büyüyecek; sort, filter, pagination first-class. |
| Date | **`date-fns` + `date-fns-tz`** | Türkiye saati (Europe/Istanbul) her yerde explicit. |
| Testing | **Vitest** (unit) + **Playwright** (e2e — Faz 2'den itibaren) | Faz 1'de domain logic ve geocoding pipeline unit-tested olmalı. |
| Deploy | **Vercel** | Next.js native; preview deploy'lar PR başına. |
| CI | **GitHub Actions** | typecheck + lint + test + supabase migration check her PR'da. |

---

## 3. Domain Model

### 3.1 Çekirdek Kavramlar

```
Customer ──< Order >── OrderItem >── Product
   │           │
   │           ├── DeliveryWindow (scheduled_for, time_slot)
   │           ├── PaymentInfo (method, status, amount)
   │           └── StatusEvent[] (audit trail)
   │
   └── Address (one-to-one currently, one-to-many ready)
            └── Coordinate (lat, lng, source, accuracy)
```

### 3.2 Products (sabit katalog — Faz 1'de seed'lenir)

| key | display_name | unit | unit_label | package_size | min_qty | step |
|---|---|---|---|---|---|---|
| `eggs` | Yumurta | package | paket (15 adet) | 15 | 1 | 1 |
| `milk` | Süt | liter | litre | 1 | 1 | 1 |
| `cheese` | Peynir | kilogram | kg | 0.5 | 0.5 | 0.5 |
| `yogurt` | Yoğurt | kilogram | kg | 0.5 | 0.5 | 0.5 |

> **Önemli kural:** `cheese` ve `yogurt` için `quantity % step === 0` validation'ı domain layer'da zorunlu. UI sadece izin verilen değerleri gösterir; ama backend de doğrular.

### 3.3 Customer

```ts
interface Customer {
  id: UUID;
  first_name: string;       // not null, trimmed, 1-100 char
  last_name: string;        // not null, trimmed, 1-100 char
  email: string | null;     // unique if present, lowercased
  phone: string;            // E.164 format zorunlu, +90... — unique
  address: Address;         // one-to-one (Faz 1) — Faz 2'de Address[] olacak
  notes: string | null;     // admin'in serbest notu (max 2000 char)
  status: 'active' | 'inactive' | 'blocked';
  created_at: timestamptz;
  updated_at: timestamptz;
  created_by: UUID;         // admin user id
}
```

### 3.4 Address (value object — şimdilik 1-1 ama tablo olarak ayrı)

```ts
interface Address {
  id: UUID;
  customer_id: UUID;
  raw_text: string;             // kullanıcının yazdığı açık adres
  description: string | null;   // "kapı kodu 4521", "kırmızı bina" vb.
  coordinate: Coordinate;
  city: string | null;          // geocoding'den gelir
  district: string | null;
  postal_code: string | null;
  country: string;              // default 'TR'
  is_primary: boolean;          // Faz 1'de hep true; Faz 2 multi-address
  created_at: timestamptz;
  updated_at: timestamptz;
}

interface Coordinate {
  lat: number;                  // -90 to 90
  lng: number;                  // -180 to 180
  source: 'geocoded_auto' | 'geocoded_manual' | 'user_pin' | 'admin_corrected';
  accuracy: 'rooftop' | 'range_interpolated' | 'geometric_center' | 'approximate' | 'unknown';
  geocoded_at: timestamptz | null;
  geocoder_response_hash: string | null;  // cache invalidation için
}
```

> **Postgres'te:** `coordinate` kolonu `geography(Point, 4326)` tipinde — PostGIS native. `lat/lng` ayrıca normal kolonlar olarak da tutulur (read-easy). Source/accuracy/geocoded_at meta kolonlar ayrı.

### 3.5 Order

```ts
interface Order {
  id: UUID;
  order_number: string;         // human-friendly: "ORD-2026-00001" — sequence'tan üretilir
  customer_id: UUID;
  status: OrderStatus;          // 'pending' | 'confirmed' | 'delivered' | 'cancelled'
  
  // Delivery
  scheduled_for: date;          // hangi gün teslim edilecek (timezone Europe/Istanbul)
  time_slot: TimeSlot | null;   // opsiyonel: 'morning' | 'afternoon' | 'evening'
  delivery_address_snapshot: Address;  // sipariş anındaki adres (donmuş kopya)
  delivery_notes: string | null;
  
  // Pricing
  items: OrderItem[];
  subtotal_minor: number;       // kuruş cinsinden
  delivery_fee_minor: number;
  total_minor: number;
  currency: 'TRY';
  
  // Payment
  payment_method: 'cash_on_delivery' | 'bank_transfer';  // Faz 1
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  paid_at: timestamptz | null;
  
  // Future-proofing
  recurring_template_id: UUID | null;  // Faz 2'de doldurulacak; null = tek seferlik
  source: 'admin_manual' | 'customer_web' | 'recurring_generated';  // Faz 1'de hep 'admin_manual'
  
  // Metadata
  created_at: timestamptz;
  updated_at: timestamptz;
  created_by: UUID;
}

interface OrderItem {
  id: UUID;
  order_id: UUID;
  product_key: ProductKey;      // FK to products.key
  quantity: number;             // numeric(10,2) — kg/paket/litre
  unit_price_minor: number;     // sipariş anındaki birim fiyat (kuruş) — donmuş
  line_total_minor: number;     // quantity * unit_price_minor (generated column)
  product_snapshot: jsonb;      // {display_name, unit, unit_label} — fiyat/isim tarihi koruma
}

type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';
type TimeSlot = 'morning' | 'afternoon' | 'evening';
```

### 3.6 Order State Machine

İzin verilen geçişler (sıkı kontrol; pure TS reducer'da implement edilir):

```
pending ──→ confirmed ──→ delivered
   │            │
   ↓            ↓
cancelled   cancelled
```

- `delivered → *` YASAK (terminal)
- `cancelled → *` YASAK (terminal)
- Her transition `order_status_events` tablosuna yazılır:
  - `id, order_id, from_status, to_status, reason, actor_id, created_at`
- Transition fonksiyonu: `transitionOrder(order, toStatus, { reason, actor }): Result<Order, TransitionError>`

### 3.7 Recurring Template (Faz 2 hazırlığı — schema'da var, UI yok)

```ts
interface RecurringTemplate {
  id: UUID;
  customer_id: UUID;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  day_of_week: number | null;   // 0-6 (Pazar=0)
  day_of_month: number | null;  // 1-31
  items: { product_key: string; quantity: number; }[];
  active: boolean;
  next_run_at: timestamptz;
  created_at: timestamptz;
}
```

> Faz 1'de bu tablo **boş** olur, ama migration'da yaratılır. `orders.recurring_template_id` FK olarak hazırdır.

---

## 4. Database Schema (Supabase migrations)

### 4.1 Extensions
```sql
create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists pg_trgm;  -- müşteri arama için
```

### 4.2 Migration Sırası
1. `001_init_extensions.sql`
2. `002_create_enums.sql` — order_status, payment_method, payment_status, customer_status, time_slot, recurring_cadence, coordinate_source, coordinate_accuracy, address_source, user_role
3. `003_create_products.sql` + seed
4. `004_create_customers.sql`
5. `005_create_addresses.sql` (PostGIS geography column + GIST index)
6. `006_create_orders.sql` + sequence for order_number
7. `007_create_order_items.sql`
8. `008_create_order_status_events.sql`
9. `009_create_recurring_templates.sql` (Faz 2 hazırlığı)
10. `010_create_geocoding_cache.sql`
11. `011_rls_policies.sql`
12. `012_indexes.sql`
13. `013_functions.sql` — RPC: `find_orders_for_route(date, bounds)`, `find_customers_within_radius(lat, lng, meters)`

### 4.3 Kritik İndeksler (1000+ kullanıcı için baştan)
```sql
-- Customers
create index customers_phone_idx on customers (phone);
create index customers_status_idx on customers (status) where status = 'active';
create index customers_name_trgm_idx on customers using gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Addresses — PostGIS GIST
create index addresses_coordinate_gist on addresses using gist (coordinate);
create index addresses_customer_id_idx on addresses (customer_id);

-- Orders — en sık sorgular: günlük teslimat, customer geçmişi, status filtreleme
create index orders_scheduled_for_status_idx on orders (scheduled_for, status) 
  where status in ('pending', 'confirmed');
create index orders_customer_id_created_at_idx on orders (customer_id, created_at desc);
create index orders_status_idx on orders (status);

-- Order items
create index order_items_order_id_idx on order_items (order_id);
create index order_items_product_key_idx on order_items (product_key);

-- Geocoding cache
create unique index geocoding_cache_input_hash_idx on geocoding_cache (input_hash);
```

### 4.4 RLS (Row-Level Security)
- Tüm tablolarda RLS **on**.
- Faz 1 policy: `auth.uid() in (select id from app_users where role = 'admin')` → tüm CRUD.
- Service role (server actions için) RLS bypass eder ama **sadece server-side'da** kullanılır; client'a service key sızdırma yasak.
- `app_users` tablosu Supabase'in `auth.users`'ına FK ile bağlı; `role` enum: `admin | operator | viewer` (Faz 2 için hazır, Faz 1'de hep `admin`).

### 4.5 Order Number Generation
```sql
create sequence order_number_seq start 1;

create or replace function next_order_number() returns text as $$
  select 'ORD-' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY') 
         || '-' || lpad(nextval('order_number_seq')::text, 5, '0');
$$ language sql;
```

---

## 5. Modular Architecture

### 5.1 Folder Structure (DDD-lite, feature-first)

```
/
├── app/                          # Next.js App Router (UI + route handlers)
│   ├── (admin)/
│   │   ├── customers/
│   │   ├── orders/
│   │   ├── map/
│   │   ├── routes/               # günlük teslimat rotası
│   │   └── layout.tsx
│   ├── api/                      # webhook'lar, public endpoints (Faz 2)
│   ├── login/
│   └── layout.tsx
│
├── features/                     # ← KALBİ. Her feature self-contained.
│   ├── customers/
│   │   ├── domain/               # pure types, value objects, business rules
│   │   │   ├── customer.ts
│   │   │   ├── customer.schema.ts    # Zod
│   │   │   └── customer.errors.ts
│   │   ├── application/          # use cases — orchestration
│   │   │   ├── create-customer.ts
│   │   │   ├── update-customer.ts
│   │   │   ├── list-customers.ts
│   │   │   └── search-customers.ts
│   │   ├── infrastructure/       # Supabase, dış API'lar
│   │   │   ├── customer.repository.ts
│   │   │   └── customer.mapper.ts    # DB row ↔ domain
│   │   └── ui/                   # React components specific to customers
│   │       ├── customer-form.tsx
│   │       ├── customer-table.tsx
│   │       └── customer-detail.tsx
│   │
│   ├── orders/
│   │   ├── domain/
│   │   │   ├── order.ts
│   │   │   ├── order.schema.ts
│   │   │   ├── order-state-machine.ts   # transition logic
│   │   │   └── order.errors.ts
│   │   ├── application/
│   │   │   ├── create-order.ts
│   │   │   ├── transition-order.ts
│   │   │   └── list-orders-for-day.ts
│   │   ├── infrastructure/
│   │   └── ui/
│   │
│   ├── geocoding/                # ← MVP'nin can damarı
│   │   ├── domain/
│   │   │   ├── coordinate.ts
│   │   │   └── geocoding.errors.ts
│   │   ├── application/
│   │   │   ├── geocode-address.ts        # ana pipeline
│   │   │   └── reverse-geocode.ts
│   │   ├── infrastructure/
│   │   │   ├── google-geocoder.ts        # Google API wrapper
│   │   │   ├── geocoding-cache.repository.ts
│   │   │   └── geocoding.mapper.ts
│   │   └── ui/
│   │       └── address-pin-corrector.tsx # harita üzerinde manuel düzeltme
│   │
│   ├── routing/                  # günlük rota optimizasyonu
│   │   ├── domain/
│   │   ├── application/
│   │   │   └── optimize-daily-route.ts
│   │   ├── infrastructure/
│   │   │   └── google-directions.ts
│   │   └── ui/
│   │       └── route-map.tsx
│   │
│   ├── products/                 # küçük ama izole (sonra ürün eklenebilir)
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   │
│   └── auth/
│       ├── application/
│       └── infrastructure/
│
├── shared/                       # cross-cutting concerns
│   ├── result.ts                 # Result<T, E> type — try/catch yerine
│   ├── logger.ts                 # pino instance + correlation id
│   ├── env.ts                    # Zod-validated env vars
│   ├── supabase/
│   │   ├── server.ts             # service role client (server-only)
│   │   ├── browser.ts            # anon client
│   │   └── types.ts              # supabase gen types output
│   ├── errors/
│   │   ├── app-error.ts          # base class
│   │   ├── error-codes.ts
│   │   └── error-envelope.ts     # API response shape
│   ├── ui/                       # generic shadcn components
│   └── utils/
│       ├── date.ts               # tz-aware helpers
│       ├── money.ts              # minor units math
│       └── phone.ts              # E.164 normalize
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/                # edge functions (Faz 2)
│
├── tests/
│   ├── unit/
│   └── e2e/                      # Faz 2
│
├── CLAUDE.md                     # Claude Code'un her commit'te uyacağı kurallar
├── README.md
├── package.json
├── tsconfig.json                 # strict + noUncheckedIndexedAccess
├── next.config.ts
├── tailwind.config.ts
├── .env.example
└── .github/workflows/ci.yml
```

### 5.2 Layering Kuralları (sıkı)

```
ui/  ──depends on──▶  application/  ──depends on──▶  domain/
                              │
                              ▼
                      infrastructure/  ──implements──▶  domain/ ports
```

- **`domain/`** dış dünyadan habersiz. Supabase, fetch, React YOK. Pure TS + Zod.
- **`application/`** use case'leri orchestrate eder. Repository'leri **interface üzerinden** çağırır.
- **`infrastructure/`** Supabase ve dış API implementation'ları. Domain'e implement eder, domain ona değil.
- **`ui/`** Server Component / Client Component karışık olabilir; ama **`infrastructure/`'a doğrudan dokunmaz** — `application/` çağırır.

### 5.3 Cross-Feature Çağrı Kuralı
Bir feature başka bir feature'ı **sadece application/ portları** üzerinden çağırır. Örnek: `orders/application/create-order.ts`, `customers/application/get-customer.ts`'i çağırır — `customer.repository.ts`'e doğrudan dokunmaz.

---

## 6. Geocoding Pipeline (MVP'nin kalbi)

### 6.1 Akış

```
Admin müşteri adresi yazar
        │
        ▼
[1] Address normalize (trim, multi-space, TR-specific)
        │
        ▼
[2] geocoding_cache lookup (input_hash = sha256(normalized))
        │
        ├─ HIT → cached coordinate döner (geocoded_at güncellenir)
        │
        └─ MISS ↓
               │
               ▼
        [3] Google Geocoding API call (region=TR, language=tr)
               │
               ├─ OK → cache'e yaz, accuracy = location_type'tan map et
               │
               ├─ ZERO_RESULTS → null coordinate döner, UI uyarı verir
               │
               └─ OVER_QUERY_LIMIT / API_ERROR → exponential backoff + Sentry
        │
        ▼
[4] Admin UI'da harita gösterilir, pin draggable
        │
        ▼
[5] Admin pin'i kaydırırsa → source='admin_corrected', accuracy='rooftop'
        │
        ▼
[6] Save → addresses tablosu + geocoding_cache update
```

### 6.2 Cache Tablosu

```sql
create table geocoding_cache (
  id uuid primary key default uuid_generate_v4(),
  input_hash text not null unique,        -- sha256(normalized_address + country)
  input_normalized text not null,
  lat double precision not null,
  lng double precision not null,
  accuracy text not null,
  raw_response jsonb not null,
  hit_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
```

### 6.3 Quota Koruma
- Günlük Google API çağrı limiti `GEOCODING_DAILY_LIMIT` env var'ında.
- Her çağrı `geocoding_api_calls` tablosuna log'lanır (`called_at, status, response_time_ms`).
- Limit'e %80 yaklaşınca Sentry warning, %95'te hard block + admin'e UI uyarı.

### 6.4 Error Modes (UI'da gösterilecek)
| Hata | Mesaj | Aksiyon |
|---|---|---|
| ZERO_RESULTS | "Bu adres bulunamadı. Haritada manuel pin koy." | Harita modal açılır |
| OVER_QUERY_LIMIT | "Geçici sınır aşıldı, 1 dk sonra tekrar dene." | Geri sayım |
| API_ERROR | "Google'a ulaşılamadı." | Retry butonu |
| LOW_ACCURACY (`approximate`) | "Konum kesin değil, lütfen onayla." | Pin draggable, "onaylıyorum" butonu zorunlu |

---

## 7. Routing (Günlük Teslimat Rotası)

### 7.1 Akış
1. Admin tarih seçer → o günün `confirmed` siparişleri listelenir.
2. Backend RPC `find_orders_for_route(target_date)` → siparişler + adres koordinatları döner.
3. Origin = depo (env: `WAREHOUSE_LAT`, `WAREHOUSE_LNG`).
4. Google Directions API call:
   - `origin` = depo
   - `destination` = depo (round trip)
   - `waypoints` = sipariş adresleri, `optimize: true`
5. Response'tan `waypoint_order` alınır → siparişler bu sıraya göre listelenir.
6. Harita üzerinde polyline çizilir.
7. Admin "Rotaya başla" der → her sipariş için "teslim edildi" butonu görür.

### 7.2 Limitler
- Google Directions API tek call'da **max 25 waypoint** (premium plan'sa 25, standartta 10).
- 25'ten fazla sipariş varsa: clustering (lat/lng'ye göre k-means, küme başına ayrı rota) — Faz 1'de basit "ilk 25 / sonraki 25" bölme yeterli, Faz 2'de proper VRP.
- `routing/domain/route-planner.ts` içinde split logic izole edilir, gelecekte VRP solver'a geçiş izole olur.

---

## 8. API Layer

### 8.1 Server Actions vs Route Handlers

- **Server Actions** (form mutations, internal admin mutations) — type-safe, RSC ile harika.
- **Route Handlers** (`/app/api/...`) — webhook'lar, dış sistemler, future müşteri site'ı.

### 8.2 Standart Error Envelope

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown; correlationId: string } };
```

### 8.3 Validation Kuralı
- Her Server Action ilk satırı: `const input = MySchema.parse(rawInput)` — başarısızsa otomatik 400 + log.
- Hiçbir endpoint Zod'suz input kabul etmez.

---

## 9. Observability & Logging

### 9.1 Logger
```ts
// shared/logger.ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', '*.password', '*.email'],  // PII redaction
  base: { service: 'crm', env: process.env.VERCEL_ENV },
});
```

### 9.2 Correlation ID
Her request'te `x-correlation-id` header (yoksa middleware üretir). Tüm log'lara enjekte. Sentry breadcrumb'ına eklenir.

### 9.3 Audit Log
Mutating action'lar için `audit_log` tablosu:
```sql
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id),
  action text not null,           -- 'customer.created', 'order.transitioned'
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);
```

### 9.4 console.log Yasağı
ESLint rule: `no-console: error`. Logger zorunlu.

---

## 10. Environment Variables

`.env.example`:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=                # SERVER-ONLY

# Google Maps
GOOGLE_MAPS_SERVER_KEY=                   # Geocoding + Directions (server-side)
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=      # Maps JS API (browser, referrer-restricted)

# App
NEXT_PUBLIC_APP_URL=
WAREHOUSE_LAT=
WAREHOUSE_LNG=
GEOCODING_DAILY_LIMIT=2000

# Observability
SENTRY_DSN=
LOG_LEVEL=info

# Defaults
DEFAULT_TIMEZONE=Europe/Istanbul
DEFAULT_CURRENCY=TRY
```

`shared/env.ts` — Zod ile validate edilir, ilk import'ta crash etmesi için `app/layout.tsx` üst seviyede import edilir.

---

## 11. CLAUDE.md (Ruleset — repo root'a konacak)

> Aşağıdaki içerik aynen `CLAUDE.md` olarak repo root'a yazılır. Claude Code her görevde bunu okur.

```markdown
# CLAUDE.md — Project Rules

Bu dosya Claude Code'un bu repo'da uyacağı zorunlu kuralları içerir. Hiçbir kural "şimdilik" istisnası kabul etmez.

## 1. Birinci İlke
Bu sistem **1000 eşzamanlı kullanıcıya** dayanacak şekilde tasarlanır. Şu anki yük düşük olsa bile hiçbir karar "küçük ölçek varsayımı"yla alınmaz. Bir karar şüpheliyse → daha conservative / scalable olanı seç. Buna **paranoyak karar mekanizması** denir.

## 2. Mimari Kuralları
- **Domain-driven, feature-first.** Tüm kod `features/<domain>/{domain,application,infrastructure,ui}` altında yaşar.
- **Layering one-way.** ui → application → domain. infrastructure domain'e implement eder. Reverse asla.
- **Cross-feature import sadece `application/` üzerinden.** Bir feature başkasının repository'sini import edemez.
- **Self-containment.** Yeni feature eklemek mevcut feature'ları değiştirmemeli (open/closed). Shared concept'ler `shared/`'a taşınır.

## 3. TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- `any` yasak. Gerekiyorsa `unknown` + Zod parse.
- Dış sınırlardan (API, DB, env, kullanıcı) gelen her şey **Zod ile parse** edilir, sonra typed.
- Domain entity'leri ile DB row'ları **mapper** ile ayrılır. Domain Postgres'i bilmez.

## 4. Validation
- Her Server Action / Route Handler **ilk satırı** Zod parse.
- Schema'lar `domain/<entity>.schema.ts`'de tek kaynak; UI ve API aynısını kullanır.

## 5. Error Handling
- `try/catch` yerine `Result<T, E>` (shared/result.ts) tercih edilir.
- Tüm error'lar `AppError` extend eder ve `code` (enum) içerir.
- API yanıtları **error envelope** standardına uyar.
- Hiçbir error swallow edilmez. Yakalanan her error log'lanır + correlation id ile.

## 6. Logging
- `console.log` yasak (ESLint enforced).
- `shared/logger.ts`'den `logger` import edilir.
- Her log structured (object), human-readable mesaj **ve** kontekst alanları.
- PII (email, telefon, adres) log'a yazılmaz veya redact edilir.

## 7. Database
- Tüm değişiklikler **migration** ile. Manual SQL yasak.
- RLS her tabloda **on**.
- Index'ler PR'da gerekçesiyle birlikte (yorum satırı) eklenir.
- Foreign key'ler `on delete` davranışı **explicit** belirtilir (cascade/restrict/set null).
- Money: minor units (kuruş), `numeric` veya `bigint`. Float yasak.
- Tarih/saat: `timestamptz` zorunlu. App layer Europe/Istanbul'a çevirir.

## 8. Geocoding & Maps
- Adres → koordinat dönüşümü **her zaman cache'ten kontrol** edilir.
- Google API key **server-side** key + **browser** key ayrı; browser key referrer-restricted.
- Düşük accuracy (`approximate`) sonuçlar admin onayı olmadan kaydedilmez.
- Quota %80'de warning, %95'te hard stop.

## 9. Performance
- Listeleme endpoint'leri **pagination zorunlu** (default 25, max 100).
- N+1 yasak. JOIN ya da batch fetch.
- Server Component default; Client Component sadece interactivity gerektiğinde.
- Image optimization (next/image) zorunlu.

## 10. Security
- Service role key **asla** client'a sızmaz. Sadece server-only modüllerde.
- Tüm input sanitize (Zod) + RLS.
- Rate limiting kritik endpoint'lerde (Faz 2 production'a giderken; ama hook'lar şimdiden hazır).
- Secrets `.env`, asla commit edilmez.

## 11. Testing
- Domain layer **unit test** zorunlu (Vitest).
- Geocoding pipeline test'leri **mocked Google response** ile.
- State machine her transition için test.

## 12. Git & PR
- Branch: `feat/`, `fix/`, `chore/`, `refactor/`.
- Commit: conventional commits.
- PR template: amaç / yaklaşım / test / screenshot.
- CI yeşil olmadan merge yok.

## 13. Faz 1'de Yasak Kararlar
- Recurring subscription UI yazma — schema hazır, UI Faz 2.
- Stok takibi ekleme.
- Müşteri-facing route ekleme.
- Online ödeme entegrasyonu.

## 14. Karar Verirken Sor
Eğer aşağıdakilerden biri belirsizse → **kod yazmadan önce** sor:
- Bir feature başka feature'ın internal'ına dokunmak zorundaysa
- Schema değişikliği başka tablolara migration cascade gerektiriyorsa
- Bir Google API call'u cache'lenmeyecekse (gerekçesi olmalı)
- Bir kararı "şimdilik" yapma temayülü varsa

## 15. Done Tanımı
Bir görev "done" sayılması için:
- [ ] TypeScript hatası yok
- [ ] ESLint clean
- [ ] Domain logic'i için unit test yazıldı
- [ ] Migration eklendiyse `supabase db reset` ile lokal'de çalıştı
- [ ] PR description'da etkilenen feature(ler) yazıldı
- [ ] CLAUDE.md kurallarına uyulduğu mental check yapıldı
```

---

## 12. Phased Roadmap

### Faz 1 — Admin CRM Backbone (bu spec)
1. Repo + tooling + CI
2. Supabase schema + migrations + seed
3. Auth (tek admin)
4. Customer CRUD + geocoding pipeline
5. Map view (tüm müşteri pin'leri)
6. Order CRUD + state machine + scheduled_for
7. Daily route page + Google Directions
8. Audit log + Sentry + production deploy

### Faz 2 — Customer-Facing & Recurring
9. Public storefront (Next.js, aynı repo, `/(shop)` route group)
10. Customer self-signup + login
11. Recurring template UI + cron job (Supabase scheduled function)
12. Notification system (SMS via Netgsm/Iletimerkezi, email via Resend)
13. Stock tracking
14. Reporting dashboard

### Faz 3 — Payments & Scale
15. Iyzico entegrasyonu
16. Multi-admin + role'ler
17. Driver mobile view (PWA)
18. Real VRP solver

---

## 13. İlk Sprint — Claude Code'a Atılacak Görev Listesi

> Aşağıdaki sırayı **bozma**. Her madde tamamlanınca PR açılır, merge edilir, sonraki maddeye geçilir.

### Sprint 0 — Foundation
1. Next.js 15 + TS strict + Tailwind + shadcn/ui repo init.
2. ESLint config (no-console, import boundaries — `eslint-plugin-boundaries` ile feature izolasyonu enforce edilir).
3. tsconfig: strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
4. `shared/env.ts` — Zod env validation.
5. `shared/result.ts` — Result type.
6. `shared/logger.ts` — pino setup.
7. `shared/errors/` — AppError + codes + envelope.
8. CLAUDE.md repo root'a yaz.
9. GitHub Actions CI: typecheck + lint + test.

### Sprint 1 — Database & Auth
10. Supabase project setup + local CLI.
11. Migrations 001–013 (bkz. §4.2).
12. `supabase gen types` → `shared/supabase/types.ts`.
13. RLS policy testleri (tek admin login → CRUD; başka kullanıcı → reddedilir).
14. Login sayfası (Supabase Auth UI minimal).
15. Auth middleware (admin layout korumalı).

### Sprint 2 — Customers + Geocoding
16. `features/geocoding/` — Google Geocoder wrapper, cache repo, geocode-address use case.
17. Geocoding unit testleri (mocked).
18. `features/customers/` — domain + schema + repository + use cases (create, update, list, search).
19. Customer form (react-hook-form + Zod).
20. Customer table (TanStack Table, server-side pagination).
21. Address pin corrector component (Google Maps JS, draggable marker).
22. E2E manuel test: müşteri ekle → adres yaz → otomatik pin → manuel düzeltme → kaydet.

### Sprint 3 — Map View
23. `/(admin)/map` — tüm aktif müşterilerin pin'leri, cluster (>50).
24. Marker click → customer mini detay.
25. Filter: status, son 30 gün sipariş veren vs vermeyen.

### Sprint 4 — Orders
26. `features/products/` — sabit katalog seed + read.
27. `features/orders/` — domain + state machine + schema + repository.
28. Order create form (customer seçici + product picker + scheduled_for + notes).
29. Order list (table + filters).
30. Order detail page (timeline of status events).
31. State transition action (confirm / deliver / cancel + reason).

### Sprint 5 — Routing
32. `features/routing/` — Google Directions wrapper.
33. `/(admin)/routes` page — tarih seçici, o günkü `confirmed` orderlar.
34. Optimize butonu → API → polyline + sıralı liste.
35. Liste üzerinden tek tek "delivered" işaretleme.

### Sprint 6 — Polish & Deploy
36. Sentry setup.
37. Audit log enforcement (mutating action'larda zorunlu).
38. Vercel production deploy + env'ler + custom domain.
39. README + CLAUDE.md final review.
40. Production smoke test checklist.

---

## 14. Açık Sorular / İleride Karar Alınacaklar

Bunlar Faz 1'i bloke etmiyor ama listede dursun:

- [ ] Teslimat ücreti nasıl hesaplanır? (sabit / mesafeye göre / threshold üstü ücretsiz?)
- [ ] Müşteri ürün fiyatlarını nereden görecek? (Faz 2 storefront)
- [ ] İade/iptal politikası — `cancelled` order'ın stoğa etkisi (Faz 2)
- [ ] Driver assignment — tek araç mı, çoklu araç mı? (Faz 3 VRP'de)
- [ ] Müşteri segmentasyonu / etiketleme (VIP, sorunlu, vb.) — Faz 2 CRM özelliği
- [ ] Veri yedekleme stratejisi — Supabase Pro plan PITR yeterli mi?

---

## 15. Definition of "Spec Complete"

Bu spec aşağıdakileri sağladığında hazırdır:
- [x] Tech stack kararları gerekçeli ✅
- [x] Domain model TS interface'leri ile tanımlı ✅
- [x] Database schema ve indeksler explicit ✅
- [x] Folder structure ve layering kuralları yazılı ✅
- [x] Geocoding pipeline akışı çizildi ✅
- [x] State machine kuralları net ✅
- [x] Logging/observability stratejisi var ✅
- [x] CLAUDE.md ruleset hazır ✅
- [x] Phased roadmap ve ilk sprint görev listesi sıralı ✅

**Bu spec Claude Code'a yapıştırılarak Sprint 0'dan başlanabilir.**

---

## 16. Long-Term Vision — Multi-Channel Customer Ingestion

> Bu bölüm uzun vadeli bir north-star. Sprint 1-6 kapsamı dışı, ama mimari kararları bugünden hizalıyor.

### 16.1 Hedef

Müşteri kayıtları **üç farklı kanaldan** sisteme girebilmeli — ama **tek standardize Customer + Address şeması** ile sonuçlanmalı. Hangi kanaldan gelirse gelsin, sipariş alma / harita gösterme / rota optimize etme kodu fark etmemeli.

### 16.2 Kanallar (yakından uzağa)

**Kanal 1 — Admin manual entry** _(şu anki Faz 1 — implementasyonda)_
- Admin paneli üzerinden form ile giriş.
- `address_source: 'admin_input'`, `coordinate.source: 'geocoded_auto'` veya `'admin_corrected'`.
- Cost: yüksek (admin zamanı).

**Kanal 2 — E-commerce customer self-signup** _(Faz 2 storefront)_
- Müşteri kendisi web sitesi üzerinden hesap açar, adresini kendi yazar.
- `address_source: 'customer_signup'`, `coordinate.source: 'user_pin'` veya `'geocoded_auto'`.
- Cost: sıfır admin çabası — müşteri yapıyor.
- Web altyapısı **Faz 2'de zaten yeterince hazır** (aynı schema, aynı geocoding pipeline, sadece yeni UI route'u gerekecek).

**Kanal 3 — Conversational ingestion (Instagram DM / WhatsApp)** _(Faz 3+ uzun vadeli)_
- Meta Business API + (LLM ile zenginleştirilmiş) NLP pipeline'ı.
- Müşteri Instagram'a "merhaba bana 2 paket yumurta + 1 kg peynir lazım, Bağdat Cad No 12'ye gönderebilir misiniz" yazar → sistem ad/soyad/telefon (mesaj kanalından) + adres + sipariş kalemlerini yapılandırılmış veriye dönüştürüp veritabanına düşürür.
- Ambigous mesajlar bile (eksik adres, hatalı yumurta sayısı) **manual review queue**'ya düşer; admin tek tıkla onaylar.
- `address_source: 'messaging_inbound'` (Faz 3'te enum'a eklenecek), `coordinate.source: 'geocoded_auto'`.
- Cost: minimal admin çabası — sadece review.

### 16.3 Mimari implikasyonlar — bugünden hazırlanan

Spec'in şu anki yapısı zaten bu vizyonu destekliyor:
- `address_source` enum **birden fazla değer** kabul ediyor (`admin_input | customer_signup | bulk_import`); Faz 3'te `messaging_inbound` eklenecek (`alter type` migration).
- `coordinate.source` enum (`geocoded_auto | geocoded_manual | user_pin | admin_corrected`) hangi kanaldan gelirse gelsin pin'in nasıl elde edildiğini izliyor.
- Customer schema kanal-agnostik — telefon E.164, isim trimmed, adres geocoding pipeline'ından geçiyor. Admin form'u, storefront sign-up, ya da AI ingestion fark etmez.
- Geocoding cache + quota guard ortak — üç kanal aynı altyapıyı kullanır.

### 16.4 Faz 3+ için açık tasarım kararları (henüz cevaplanmadı)

- LLM extraction provider — Claude API mı, OpenAI mı, self-hosted mı? (Maliyet + Türkçe kalitesi + privacy)
- Manual review queue UI — separate route mu, customer detail page'de "review" sekmesi mi?
- Dedup logic — aynı telefon farklı kanaldan gelirse merge mi, çakıştır uyarısı mı?
- Mesaj geçmişi audit — Instagram DM thread'i Customer record'a bağlanacak mı? KVKK/GDPR implikasyonu var.
- Tek kullanıcının birden fazla adresi — Faz 1 single-address'ten Faz 3'te multi-address'e geçiş; schema zaten one-to-many ready.

### 16.5 Birinci ilkeyle uyumu

Bu vizyon **paranoyak karar mekanizmasının** uzun-vadeli sonucu. Faz 1'de admin formu yazarken bile şu sorular sorulmalı:
- Bu Customer şeması storefront sign-up'tan da gelebilir mi? → Evet, aynı şema.
- Bu Address coordinate'ı bir AI extraction'dan da gelebilir mi? → Evet, source enum'u kanal göstermek için var.
- Yeni kanal eklemek mevcut feature'ları değiştirecek mi? → Hayır — open/closed: sadece yeni adapter eklemek.
