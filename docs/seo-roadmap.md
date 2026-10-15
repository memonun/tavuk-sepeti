# SEO & Google Arama Yol Haritası — apuhanciftligi.com

**Durum (2026-10-15):** Sitenin temeli iyi: Türkçe başlık ve açıklama, paylaşım görseli, Organization şeması hazır. Ama Google siteyi hâlâ tam okuyamıyor:

- `/robots.txt` ve `/sitemap.xml` yok (404).
- Hiçbir sayfada canonical etiketi yok.
- Giriş, hesap ve ödeme sayfaları Google'a açık.
- Ürünlerin kendi sayfası yok; Google "köy yumurtası fiyat" gibi bir arama için gösterecek sayfa bulamıyor.
- "Apuhan Çiftliği" aramasında site henüz görünmüyor.

## Sıralama

| Aşama | Kim | Ne zaman |
|---|---|---|
| 0. Google hesapları | Hamit Bey | Hemen |
| 1. Teknik temel | Claude (PR `feat/seo-foundation`) | Yayınlandı (#219) |
| 2. Ürün sayfaları | Codex: Prompt P2 | PR #220 açık |
| 3. Güven ve bölge sayfaları | Codex: Prompt P3 | Ertelendi; P4 merge olduktan sonra yapılabilir |
| 4. Tarifler / blog | Codex: Prompt P4 | P2 merge olup `DB Yayın` bittikten sonra |
| 5. Büyüme (Merchant Center, yorumlar) | Codex: Prompt P5 | P2 yayınlandıktan sonra |

Codex PR'larını aynı dosyalara aynı anda dokundurmayın. P2, P3 ve P4'ün üçü de sitemap'e yazar; P3 ile P4 footer'a da yazar. O yüzden sırayla gitmeliler. P4, P3'e bağlı değil ama P2'ye bağlı: tarifler ürün sayfalarına (`/urun/<slug>`) link veriyor.

## Aşama 0: Google hesapları (kod yok, yaklaşık 1 saat)

1. **Google Search Console** (search.google.com/search-console):
   - "Alan adı" (Domain) mülkü olarak `apuhanciftligi.com` ekleyin.
   - Doğrulama için verilen TXT kaydını alan adının DNS ayarlarına ekleyin (Vercel → Domains, ya da alan adını aldığınız firma).
   - DNS zor gelirse "URL ön eki" ve "HTML etiketi" yöntemini seçin. Verilen `content="..."` değerini Vercel'de `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` ortam değişkeni olarak ekleyip yeniden yayınlayın; Aşama 1 bunu destekliyor.
2. **Google İşletme Profili** (business.google.com). Malatya aramaları için en büyük etki bu:
   - İşletme adı: tam olarak **Apuhan Çiftliği**.
   - Kategori: "Çiftlik" veya "Yumurta tedarikçisi".
   - "Hizmet bölgesi" olarak Malatya ilçelerini ekleyin. Adres ev adresiyse gizlenebilir.
   - Telefon `+90 533 255 64 44` ve web sitesi `https://apuhanciftligi.com`. Bunlar sitedekiyle birebir aynı olmalı.
   - Çiftlikten, tavuklardan ve ürünlerden **gerçek fotoğraflar** yükleyin.
   - Doğrulama (kartpostal veya video) tamamlanınca profil linkini Claude'a/Codex'e verin; P5'te siteye eklenecek.
3. **Bing Webmaster Tools**: Search Console'dan tek tıkla içe aktarın.
4. Aşama 1 yayınlandıktan sonra Search Console'da:
   - Site haritaları → `sitemap.xml` gönderin.
   - URL denetimi → `https://apuhanciftligi.com/` → "Dizine eklenmesini iste".

## Aşama 1: Teknik temel (Claude, bu PR)

- `robots.txt` ve `sitemap.xml` eklendi.
- Giriş, hesap, ödeme ve yönetim sayfaları "noindex" yapıldı; yeni yönetim sayfaları varsayılan olarak gizli.
- Her mağaza sayfasına canonical eklendi; `/?teslimat=` gibi varyantlar ana sayfada birleşiyor.
- Şema LocalBusiness oldu: adres, telefon, hizmet bölgesi (Malatya + Türkiye).
- İsteğe bağlı Google doğrulama etiketi: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- Yönetim sayfası listesi tek bir yere toplandı (`shared/routes/admin-route-prefixes.ts`). Proxy'nin unuttuğu `/finans`, `/kargo` ve `/magaza-ayarlari` da artık korunuyor.

---

## Codex promptları

Her birini ayrı bir Codex görevi olarak, olduğu gibi yapıştırın.

### P2: Ürün sayfaları

```text
Repo: apuhanciftligi.com storefront (Next.js app router, Supabase). Read CLAUDE.md first and follow it strictly (feature-first layering, Zod at boundaries, Result<T,E>, no any, no console, unit tests for domain logic). Also read docs/veritabani-yayini.md.

Goal: every web-visible product gets its own indexable page at /urun/<slug> so Google can rank it.

1. Migration: run `node scripts/db/new-migration.mjs product_web_slug`. Add `products.web_slug text` NULLABLE with a UNIQUE index (comment explaining the index). Backfill existing rows with a Turkish ASCII slug of display_name using the same rules as features/products/domain/product-key.ts `slugifyProductKey` (suffix -2, -3 on collision). Additive only, never drop or rename. Do not edit any existing migration. Note products.key is a permanent PK (legacy keys like 'eggs' are English), so do NOT use key in URLs.
2. Domain + admin: add web_slug to the product domain type, schema (features/products/domain/product.schema.ts: lowercase a-z0-9 and dashes, 1–80 chars) and mapper. Add an editable "Web adresi (slug)" field to features/products/ui/product-form.tsx, saved via the existing update-product-metadata action. New products get slugifyProductKey(display_name) by default. Add unit tests.
3. Application: add getStorefrontProductBySlug(slug) in features/storefront/application/ that filters the existing getStorefrontCatalog() result. No new DB query, same visibility and price rules. Return null when not found.
4. Page: app/(shop)/urun/[slug]/page.tsx (Server Component). Zod-parse params. notFound() when missing. generateMetadata: title = product display_name (the layout template adds "| Apuhan Çiftliği"), description = web_description (fallback: a short Turkish sentence), alternates.canonical = `/urun/${slug}`, openGraph image = product image. Body: next/image (alt = image_alt ?? display_name), price via shared/utils/money.ts formatTRY, price tiers, unit_label, delivery type (Malatya eve teslim / Türkiye geneli kargo), an add-to-basket button reusing useCart().addItem exactly like features/storefront/ui/product-card.tsx, and 3 related products. Match the existing storefront look. Do not touch components/address (Google Maps code is frozen).
5. JSON-LD: a pure builder in features/storefront/domain/product-structured-data.ts with tests. Product (name, description, image, sku = key, brand "Apuhan Çiftliği"), Offer (price = minor/100 as a "125.00" string, priceCurrency "TRY", availability InStock, url = canonical, seller = { "@id": "https://apuhanciftligi.com/#organization" }), and BreadcrumbList (Ana sayfa → product). NO aggregateRating or review: there are no real reviews.
6. Make the ProductCard image and name link to /urun/<slug> (keep the add-to-cart button working without navigating).
7. Sitemap: if features/storefront/domain/sitemap-entries.ts exists, add product URLs there. app/sitemap.ts may then need to become async and call getStorefrontCatalog(); wrap failures so the sitemap still returns the static pages. If it does not exist yet, skip this step and say so in the PR.

Done = `pnpm typecheck && pnpm lint && pnpm test` green, branch feat/product-pages, PR description in Turkish explaining the migration in plain words (it is additive and safe).
```

### P3: Güven ve bölge sayfaları

```text
Repo: apuhanciftligi.com storefront. Read CLAUDE.md and follow it. Start from main AFTER the feat/seo-foundation PR is merged (it adds app/sitemap.ts, features/storefront/domain/sitemap-entries.ts, and canonical tags on every shop page).

Goal: content pages that build trust and target local searches. Turkish copy, warm and plain (the owner's customers are often older). No DB changes.

Pages, all under app/(shop)/ as Server Components with a `title`, a `description` and `alternates.canonical`:
- /hakkimizda: the farm story (Akçadağ, Malatya), how the hens are raised and fed, freshness. Leave clearly marked TODO placeholders for facts you don't know rather than inventing them; the owner will fill in real numbers and photos.
- /teslimat-bolgeleri: ONE page. Section 1: Malatya home delivery (districts, how delivery days work; read features/storefront/domain/delivery-date.ts and delivery-window.ts for the real rules). Section 2: cargo to all of Türkiye (packaging, minimum order from storefront settings). Do NOT create per-city or per-district pages (Google treats them as doorway spam).
- /sss: 8–12 real questions (freshness, storage, egg code, cargo packaging, payment options from features/storefront/domain/payment-options.ts, recurring orders via /duzenli-siparis, order tracking via /siparis-sorgula). Plain HTML <details>/<h2>. FAQPage JSON-LD is optional and must match the visible text.
- /iletisim: name, address, phone and e-mail from COMPANY in features/storefront/domain/legal.ts, plus WhatsApp via buildWhatsAppLink(SUPPORT_WHATSAPP_E164) from features/storefront/domain/support-contact.ts. Write them exactly the same as in those files (consistent with the Google Business Profile).

Put the content in a typed module features/storefront/domain/info-pages.ts (same pattern as LEGAL_DOCS in legal.ts) and render it with a shared component styled like features/storefront/ui/legal-article.tsx. Add the pages to features/storefront/ui/shop-footer.tsx and to the sitemap entries (the existing sitemap test checks that each listed page declares a matching canonical). Unit-test the content module (unique slugs, non-empty sections).

Done = `pnpm typecheck && pnpm lint && pnpm test` green, branch feat/info-pages, PR in Turkish listing every TODO placeholder the owner must fill.
```

### P4: Tarifler / blog

```text
Repo: apuhanciftligi.com storefront. Read CLAUDE.md and follow it. Start from main AFTER the product-pages PR (feat/product-pages, #220) is merged. The info-pages (P3) work was skipped: do not assume /hakkimizda, /sss etc. exist.

Goal: a recipes section that brings long-tail Google traffic and links to product pages. Content lives in the repo (no DB, no admin editor).

1. features/content/domain/recipe.ts: a Recipe type (slug, title, description, publishedAt YYYY-MM-DD, image path under public/tarifler/, imageAlt, prepMinutes, cookMinutes, servings, ingredients[], steps[], productSlugs[] linking to /urun/<slug>) plus a Zod schema. features/content/domain/recipes.ts holds the list. Unit tests: unique slugs, valid dates, non-empty ingredients and steps, and every image file exists in public/.
2. Pages: app/(shop)/tarifler/page.tsx (index, newest first) and app/(shop)/tarifler/[slug]/page.tsx. Zod-parse params, notFound(), generateStaticParams, generateMetadata with canonical, OG image = the recipe image. next/image everywhere.
3. JSON-LD: a pure builder with tests for schema.org Recipe (name, image, description, datePublished, prepTime/cookTime/totalTime as ISO-8601 durations, recipeYield, recipeIngredient, recipeInstructions as HowToStep[], author = Organization "Apuhan Çiftliği") and BreadcrumbList.
4. Each recipe shows "Bu tarifte kullanılan ürünler" cards linking to /urun/<slug>. Product slugs live in the DB (products.web_slug), so resolve each productSlugs entry with getStorefrontProductBySlug and silently skip any that return null; never render a dead /urun/ link. Add "Tarifler" to the header/footer nav and add recipe URLs to the sitemap entries.
5. Write 3 starter recipes in natural Turkish, original text (no copying): "Köy yumurtalı menemen", "Fırında yumurtalı patates", and "Ev yapımı yoğurt" (taze sütle). Use a placeholder image and add a TODO for real photos.

Done = `pnpm typecheck && pnpm lint && pnpm test` green, branch feat/recipes, PR in Turkish.

Next topic ideas for later posts: köy yumurtası ile market yumurtası farkı; yumurta kodu nasıl okunur (0-TR-…); yumurta nasıl saklanır, tazelik testi; Malatya kayısısı.
```

### P5: Büyüme (P2 yayınlandıktan sonra)

```text
Repo: apuhanciftligi.com storefront. Read CLAUDE.md and follow it. Requires the product pages (/urun/<slug>) to be live.

1. Google Merchant Center free listings feed: app/merchant-feed.xml/route.ts returning an RSS 2.0 + g: namespace product feed built from getStorefrontCatalog() (features/storefront/application/get-catalog.ts). Fields: g:id = key, title, description, link = https://apuhanciftligi.com/urun/<slug>, g:image_link, g:price "125.00 TRY" from minor units, g:availability in_stock, g:condition new, g:brand "Apuhan Çiftliği", g:identifier_exists no. Pure builder in features/storefront/domain with tests (XML-escape everything). Cache with `revalidate = 3600`. Exclude products without an image (Merchant Center rejects them) and log the count via logger.
2. Add `sameAs` (Google Business Profile URL, Instagram URL; the owner provides them, keep them in a constant in features/storefront/domain/legal.ts next to COMPANY) to the organization node in features/storefront/domain/structured-data.ts, with tests.
3. Footer: a "Bizi Google'da değerlendirin" link to the Business Profile review URL (same constant), shown only when it is set.

Done = `pnpm typecheck && pnpm lint && pnpm test` green, branch feat/seo-growth, PR in Turkish with the steps to register the feed URL in Merchant Center.
```

## Düzenli takip (ayda bir, 15 dakika)

- **Search Console → Performans:** hangi aramalarda görünüyoruz, hangi sayfalar tıklanıyor.
- **Search Console → Sayfalar:** "Dizine eklenmedi" hatası var mı.
- **Teslimattan sonra müşteriye WhatsApp'tan Google yorum linki gönderin.** Yerel aramada en etkili şey yorumlardır.
- **Ayda 2–4 iyi tarif veya yazı yazın.** Bu, 20 kısa yazıdan daha değerlidir.
