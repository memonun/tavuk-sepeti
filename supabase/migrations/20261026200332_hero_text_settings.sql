-- hero_text_settings
--
-- Ana sayfanın en üstündeki başlık ("Çiftlikten sofranıza") ve altındaki cümle
-- app/(shop)/page.tsx içine yazılıydı; değiştirmek için yayın gerekiyordu. Owner
-- (2026-10-26) bu iki metni /magaza-ayarlari'dan kendisi düzenlemek istiyor.
--
--   * hero_title — ana sayfa başlığı (h1). 1–80 karakter.
--   * hero_subtitle — başlığın altındaki cümle (telefonda gizli, tablet ve
--     masaüstünde görünür). 1–240 karakter.
--
-- Tek satırlık storefront_settings tablosuna iki kolon: tablonun mevcut RLS'i
-- (herkes okur, sadece admin yazar) ve tablo düzeyindeki grant'ler yeni
-- kolonları da kapsar; ek grant gerekmez.
--
-- Default'lar bugün sitede yazan metin: `add column ... default` mevcut tek
-- satırı da bu metinle doldurur, ayrıca bir UPDATE gerekmez.
--
-- Uzunluk sınırları admin formundaki Zod şemasıyla aynı. Boş (sadece boşluk)
-- metin reddedilir: boş bir başlık ana sayfayı başlıksız bırakırdı.
--
-- Geriye dönük uyum (CLAUDE.md §7): sadece kolon ekleniyor. Eski kod bu
-- kolonları seçmediği için şema ile kod yayını arasındaki birkaç dakikada eski
-- kod sabit metni göstermeye devam eder. RPC imzaları değişmiyor.

alter table storefront_settings
  add column if not exists hero_title text not null
    default 'Çiftlikten sofranıza'
    constraint storefront_settings_hero_title_length
      check (char_length(btrim(hero_title)) >= 1 and char_length(hero_title) <= 80),
  add column if not exists hero_subtitle text not null
    default 'Akçadağ''daki çiftliğimizden köy yumurtası, kayısı ve dut. Seçin, sepete ekleyin, biz getirelim.'
    constraint storefront_settings_hero_subtitle_length
      check (char_length(btrim(hero_subtitle)) >= 1 and char_length(hero_subtitle) <= 240);

comment on column storefront_settings.hero_title is
  'Storefront home page heading (h1). Owner-editable in /magaza-ayarlari. 1-80 chars.';
comment on column storefront_settings.hero_subtitle is
  'Sentence under the storefront home heading (hidden on phones). Owner-editable in /magaza-ayarlari. 1-240 chars.';
