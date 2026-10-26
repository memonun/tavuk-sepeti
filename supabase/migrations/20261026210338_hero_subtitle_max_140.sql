-- hero_subtitle_max_140
--
-- Vitrin açıklaması (storefront_settings.hero_subtitle) artık ana sayfadaki
-- kayan vitrinde, fotoğrafların üstünde duruyor ve telefonda da görünüyor.
-- Fotoğrafı tamamen kapatmaması için admin formu (Zod) en fazla 140 karakter
-- kabul ediyor. Bu migration aynı sınırı veritabanına da koyar.
--
-- NEDEN veritabanında da: ayar satırı okunurken aynı Zod şemasıyla kontrol
-- ediliyor. Elle 140'tan uzun bir metin yazılırsa satırın tamamı geçersiz
-- sayılır ve mağaza TÜM ayarlarda (teslimat günleri, ücretler) varsayılanlara
-- düşer. CHECK bunu kaynağında engeller.
--
-- Sadece EKLEME: 20261026200332'deki 240 sınırlı constraint olduğu gibi kalıyor
-- (artık gereksiz ama zararsız). Hiçbir şey silinmiyor. Canlıdaki metin 96
-- karakter, yani mevcut satır bu kurala zaten uyuyor.
--
-- Geriye dönük uyum (CLAUDE.md §7): şema ile kod yayını arasındaki birkaç
-- dakikada eski kod 140–240 karakter arası bir metni kaydetmeye çalışırsa
-- kayıt reddedilir ve admin hata mesajı görür; başka bir şey etkilenmez.

alter table storefront_settings
  add constraint storefront_settings_hero_subtitle_max_140
    check (char_length(hero_subtitle) <= 140);
