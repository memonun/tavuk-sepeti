# Tarif içeriğini güncelleme

Tarifler `features/content/domain/recipes.ts` içinde tutulur. Veritabanı veya
admin editörü gerekmez. Liste `/tarifler` adresinde yayın tarihine göre yeniden
eskiye sıralanır. Aynı gün yayınlanan tarifler dosyadaki sırasını korur.

Yeni tarif eklerken benzersiz bir ASCII `slug`, `YYYY-MM-DD` biçiminde gerçek
bir yayın tarihi, malzemeler, yapılış adımları, süreler ve porsiyon sayısı yazın.
Görseli `public/tarifler/` altına koyun; `image` değerinde `/tarifler/...` yolunu
ve görseli açıklayan `imageAlt` metnini kullanın. Schema, statik parametreler,
metadata, Recipe/BreadcrumbList JSON-LD ve sitemap bu kaydı kullanır.

`productSlugs` alanında ürünün kalıcı anahtarını değil, `products.web_slug`
değerini kullanın. Canlı vitrindeki yumurta adresi `/urun/yumurta` olarak
doğrulandı. Süt için `sut` tanımlıdır; bu slug vitrinde bulunmadığında kart
gösterilmez. Yayından kaldırılan, fiyatı olmayan veya slug'ı değişen ürünler de
aynı şekilde atlanır. Slug'ları ürünün mevcut web adresiyle eşleştirin.

Hazırlık (`prepMinutes`), pişirme (`cookMinutes`) ve bekleme (`restMinutes`)
süreleri dakika cinsindendir. Bekleme; mayalanma, buzdolabında dinlenme gibi
elle bir şey yapılmayan süredir. Google'a giden toplam süreye eklenir, sayfada
"Bekleme" olarak görünür. Beklemesi olmayan tarifte `0` yazın. Yoğurtta en az
4 saat mayalanma ve 6 saat dinlenme için `600` kullanılır.

## Fotoğraflar

Üç tarifin her biri `public/tarifler/` altında ayrı bir WebP görseli kullanır.
Bu görseller yapay zekâyla üretildi; üretim yöntemi ve kullanılan prompt'lar
`docs/tarif-gorselleri.md` dosyasında kayıtlıdır. Gerçek çiftlik çekimi değildir.
İleride kendi yemek fotoğraflarınızla değiştirebilirsiniz; görseli değiştirirken
`imageAlt` değerini de güncelleyin. Aynı görsel indeks, detay, OG/Twitter ve
Recipe JSON-LD çıktısında kullanılır.

## Kontrol

`pnpm typecheck && pnpm lint && pnpm test`

Testler benzersiz slug'ları, geçerli takvim tarihlerini, boş olmayan malzeme ve
adımları, yerel görselleri, JSON-LD'yi, metadata/404 davranışını, eksik ürünleri
ve katalog kullanılamadığında da sitemap'te tariflerin kalmasını denetler.

## Sonraki yazı fikirleri

- Köy yumurtası ile market yumurtası farkı
- Yumurta kodu nasıl okunur (0-TR-…)
- Yumurta nasıl saklanır ve tazelik testi
- Malatya kayısısı
