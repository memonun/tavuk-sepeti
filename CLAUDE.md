# CLAUDE.md — Project Rules

Bu dosya Claude Code'un bu repo'da uyacağı zorunlu kuralları içerir. Hiçbir kural "şimdilik" istisnası kabul etmez. Tam spec için `SPEC.md`'ye bak; bu dosya ondaki §11'in repo-root kopyasıdır.

## 1. Birinci İlke
Bu sistem **1000 eşzamanlı kullanıcıya** dayanacak şekilde tasarlanır. Şu anki yük düşük olsa bile hiçbir karar "küçük ölçek varsayımı"yla alınmaz. Bir karar şüpheliyse → daha conservative / scalable olanı seç. Buna **paranoyak karar mekanizması** denir.

## 2. Mimari Kuralları
- **Domain-driven, feature-first.** Tüm kod `features/<domain>/{domain,application,infrastructure,ui}` altında yaşar.
- **Layering one-way.** ui → application → domain. infrastructure domain'e implement eder. Reverse asla.
- **Cross-feature import sadece `application/` üzerinden.** Bir feature başkasının repository'sini import edemez. (ESLint `boundaries` plugin'i ile zorlanır.)
- **Self-containment.** Yeni feature eklemek mevcut feature'ları değiştirmemeli (open/closed). Shared concept'ler `shared/`'a taşınır.

## 3. TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`.
- `any` yasak. Gerekiyorsa `unknown` + Zod parse.
- Dış sınırlardan (API, DB, env, kullanıcı) gelen her şey **Zod ile parse** edilir, sonra typed.
- Domain entity'leri ile DB row'ları **mapper** ile ayrılır. Domain Postgres'i bilmez.

## 4. Validation
- Her Server Action / Route Handler **ilk satırı** Zod parse.
- Schema'lar `domain/<entity>.schema.ts`'de tek kaynak; UI ve API aynısını kullanır.

## 5. Error Handling
- `try/catch` yerine `Result<T, E>` (`shared/result.ts`) tercih edilir.
- Tüm error'lar `AppError` extend eder ve `code` (enum) içerir.
- API yanıtları **error envelope** standardına uyar (`shared/errors/error-envelope.ts`).
- Hiçbir error swallow edilmez. Yakalanan her error log'lanır + correlation id ile.

## 6. Logging
- `console.log` yasak (ESLint `no-console: error`).
- `shared/logger.ts`'den `logger` import edilir.
- Her log structured (object), human-readable mesaj **ve** kontekst alanları.
- PII (email, telefon, adres, isim) log'a yazılmaz veya redact edilir — logger'da merkezi redact paths var.

## 7. Database
- Tüm değişiklikler **migration** ile. Manual SQL yasak.
- RLS her tabloda **on**.
- Index'ler PR'da gerekçesiyle birlikte (yorum satırı) eklenir.
- Foreign key'ler `on delete` davranışı **explicit** belirtilir (cascade/restrict/set null).
- Money: minor units (kuruş), `numeric` veya `bigint`. Float yasak.
- Tarih/saat: `timestamptz` zorunlu. App layer Europe/Istanbul'a çevirir.
- **Migration'lar geriye dönük uyumlu yazılır.** Vercel merge'de deploy eder, migration CI gate'i (`.github/workflows/migrations.yml`) ise ayrı çalışır — aralarında bir pencere var. Bir RPC'nin imzasını değiştiriyorsan (`drop function` + yeni zorunlu parametreyle `create function`), eski kod o pencerede hâlâ eski imzayı çağırıyor olabilir. Bunun yerine: yeni parametreyi `default null` ile ekle (overload değil, aynı fonksiyonu genişlet) ve eski imzayı ancak yeni kod deploy olduktan sonraki bir PR'da düşür. 2026-08-19'da tam olarak bu yüzden — `place_web_order`'a zorunlu `p_legal_acceptance` eklenip eski imza aynı anda düşürülünce — her ödeme yöntemiyle sipariş alımı durdu.

## 8. Geocoding & Maps
- Adres → koordinat dönüşümü **her zaman cache'ten kontrol** edilir.
- Google API key **server-side** key + **browser** key ayrı; browser key referrer-restricted.
- Düşük accuracy (`approximate`) sonuçlar admin onayı olmadan kaydedilmez.
- Quota %80'de warning, %95'te hard stop.

## 9. Performance
- Listeleme endpoint'leri **pagination zorunlu** (default 25, max 100).
- N+1 yasak. JOIN ya da batch fetch.
- Server Component default; Client Component sadece interactivity gerektiğinde.
- Image optimization (`next/image`) zorunlu.

## 10. Security
- Service role key **asla** client'a sızmaz. Sadece server-only modüllerde. (`shared/env.ts` Proxy ile runtime-block ediyor.)
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
- ~~Müşteri-facing route ekleme.~~ 2026-08-19'da owner onayıyla kaldırıldı: `/siparis-sorgula` artık teslimat siparişleri için tahmini teslimat saati gösteriyor (`orders.estimated_delivery_at`, admin rota optimizasyonu sırasında doldurulur — yeni Google API çağrısı yok, sadece zaten hesaplanmış ETA'nın müşteriye yansıtılması). Canlı takip / harita hâlâ yok.
- Online ödeme entegrasyonu.

## 14. Karar Verirken Sor
Eğer aşağıdakilerden biri belirsizse → **kod yazmadan önce** sor:
- Bir feature başka feature'ın internal'ına dokunmak zorundaysa
- Schema değişikliği başka tablolara migration cascade gerektiriyorsa
- Bir Google API call'u cache'lenmeyecekse (gerekçesi olmalı)
- Bir kararı "şimdilik" yapma temayülü varsa

## 15. Done Tanımı
Bir görev "done" sayılması için:
- [ ] TypeScript hatası yok (`pnpm typecheck`)
- [ ] ESLint clean (`pnpm lint`)
- [ ] Domain logic'i için unit test yazıldı (`pnpm test`)
- [ ] Migration eklendiyse `supabase db reset` ile lokal'de çalıştı
- [ ] PR description'da etkilenen feature(ler) yazıldı
- [ ] CLAUDE.md kurallarına uyulduğu mental check yapıldı
