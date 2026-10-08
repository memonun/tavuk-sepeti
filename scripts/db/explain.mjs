// Plain-language (Turkish) explanations for the migration linter and the deploy pipeline.
// Audience: someone who has never seen SQL. Every danger says WHAT happens, whether it
// can be undone, what it does to the live site, and the safer way to get the same result.

export const DANGER_EXPLANATIONS = {
  "drop-table": {
    baslik: "Bir tabloyu tamamen siliyor",
    ne: "Tablo ve içindeki TÜM satırlar yok olur.",
    geri: "Geri dönüş YOK (yalnızca Supabase yedeğinden elle geri yüklenebilir).",
    site: "Bu tabloyu kullanan her sayfa ve özellik hata verir.",
    guvenli: "Önce uygulamada bu tabloyu kullanan kodu kaldırıp yayınla; tabloyu ancak sonraki bir PR'da, verinin artık gerekmediğinden emin olunca sil.",
  },
  "drop-column": {
    baslik: "Bir kolonu (sütunu) siliyor",
    ne: "O kolondaki tüm bilgi her satırdan kalıcı olarak silinir.",
    geri: "Geri dönüş YOK.",
    site: "Yayında çalışan eski kod hâlâ o kolonu okuyorsa, kod yeni sürüme geçene kadar o ekranlar hata verir.",
    guvenli: "Önce kodu kolonu kullanmayacak şekilde değiştirip yayınla; kolonu sonraki bir PR'da sil.",
  },
  "drop-function": {
    baslik: "Veritabanı fonksiyonunun eski sürümünü kaldırıyor",
    ne: "Uygulamanın çağırdığı bir fonksiyon (ör. sipariş verme) silinir veya imzası (aldığı bilgiler) değişir.",
    geri: "Fonksiyonu yeniden yazmak gerekir; veri kaybı olmaz.",
    site: "19 Ağustos'ta tam olarak bu yüzden her sipariş düştü: eski kod eski fonksiyonu çağırıyordu, o artık yoktu.",
    guvenli: "Eski fonksiyonu SİLME. Yeni parametreyi 'default null' ile aynı fonksiyona ekle; eski imzayı yeni kod yayınlandıktan SONRAKİ bir PR'da düşür.",
  },
  "drop-type": {
    baslik: "Bir veri tipini (liste seçeneklerini) siliyor",
    ne: "Bu tipi kullanan kolon/fonksiyonlar bozulur veya silinmesi engellenir.",
    geri: "Tipi yeniden oluşturmak gerekir.",
    site: "Tipi kullanan sorgular hata verebilir.",
    guvenli: "Tipi silmek yerine kullanılmaz bırak; gerçekten gerekiyorsa önce kullanan her yeri taşı.",
  },
  "drop-schema": {
    baslik: "Bir şemayı (tablo grubunu) siliyor",
    ne: "Şemanın içindeki her şey yok olabilir.",
    geri: "Geri dönüş YOK.",
    site: "Çok geniş etki; sitenin büyük kısmı bozulabilir.",
    guvenli: "Bu işlemi elle ve bilerek yap; otomatik yayından geçirme.",
  },
  "drop-view": {
    baslik: "Bir görünümü (hazır sorguyu) siliyor",
    ne: "O görünümü okuyan sorgular çalışmaz.",
    geri: "Görünümü yeniden yazmak gerekir; veri kaybı olmaz.",
    site: "Görünümü kullanan sayfalar hata verir.",
    guvenli: "Önce görünümü kullanan kodu kaldır, sonra sonraki PR'da sil.",
  },
  "drop-sequence": {
    baslik: "Bir sayaç dizisini siliyor",
    ne: "Otomatik numara üreten sayaç kaybolur.",
    geri: "Sayaç değeri kaybolur.",
    site: "Yeni kayıt eklerken hata çıkabilir.",
    guvenli: "Silme; gerçekten gerekiyorsa değerini not et.",
  },
  truncate: {
    baslik: "Bir tablonun bütün satırlarını siliyor (truncate)",
    ne: "Tablo kalır ama içindeki TÜM veri gider.",
    geri: "Geri dönüş YOK.",
    site: "O tabloyu gösteren her ekran boş kalır.",
    guvenli: "Hangi satırların silineceğini 'where' ile daralt; ya da bunu elle ve bilerek yap.",
  },
  "delete-all": {
    baslik: "Koşulsuz 'delete' — bütün satırları siliyor",
    ne: "'where' yok; tablodaki her kayıt silinir.",
    geri: "Geri dönüş YOK.",
    site: "Tablonun verisi tamamen gider.",
    guvenli: "'where' ekleyerek yalnızca silinmesi gerekeni seç.",
  },
  "update-all": {
    baslik: "Koşulsuz 'update' — bütün satırları değiştiriyor",
    ne: "'where' yok; tablodaki her kaydın o alanı değişir.",
    geri: "Eski değerler kaybolur.",
    site: "Her kayıt etkilenir.",
    guvenli: "'where' ile yalnızca değişmesi gerekenleri seç.",
  },
  "alter-type": {
    baslik: "Bir kolonun veri tipini değiştiriyor",
    ne: "Mevcut her değer yeni tipe çevrilir; çevrilemeyen bir değer varsa hata verir, tablo da kısa süre kilitlenir.",
    geri: "Dönüştürme veri kaybettirebilir (ör. ondalıklı sayı → tam sayı).",
    site: "Tablo büyükse kilit sırasında sipariş/sayfa yavaşlayabilir.",
    guvenli: "Yeni tipte yeni kolon ekle, veriyi taşı, kodu ona geçir, eskisini sonraki PR'da kaldır.",
  },
  "set-not-null": {
    baslik: "Bir kolonu 'boş olamaz' yapıyor",
    ne: "Şu an boş olan bir kayıt varsa işlem hata verir.",
    geri: "Kural tekrar gevşetilebilir.",
    site: "Yayındaki eski kod o kolonu boş yazıyorsa o işlemler (ör. sipariş kaydı) hata verir.",
    guvenli: "Önce kod her zaman değer yazsın ve eski boşlar doldurulsun; 'not null' sonraki PR'da gelsin.",
  },
  rename: {
    baslik: "Bir tablo/kolon/fonksiyonun adını değiştiriyor",
    ne: "Eski ad artık yok.",
    geri: "Adı geri değiştirmek mümkün.",
    site: "Eski adı kullanan yayındaki kod anında hata verir.",
    guvenli: "Yeni adı ekle (ikisi bir süre yan yana kalsın), kodu geçir, eskiyi sonraki PR'da kaldır.",
  },
  revoke: {
    baslik: "Uygulamanın bir tabloya erişim yetkisini kaldırıyor",
    ne: "Panel veya mağaza o tabloyu okuyamaz/yazamaz hale gelir.",
    geri: "Yetki tekrar verilebilir.",
    site: "Tabloyu kullanan sayfalar 'permission denied' hatası verir.",
    guvenli: "Gerçekten kaldırılması gerekiyorsa önce hangi ekranların etkileneceğini listele.",
  },
  "disable-rls": {
    baslik: "Bir tablonun satır güvenliğini (RLS) kapatıyor",
    ne: "Tablodaki bütün satırlar yetkisi olan herkese açılır.",
    geri: "RLS tekrar açılabilir ama o sürede veri sızmış olabilir.",
    site: "Müşteri verisi (adres, telefon, sipariş) yetkisiz kişilere görünebilir.",
    guvenli: "Proje kuralı: her tabloda RLS açık kalır. Sorun neyse politikayı düzelt.",
  },
  "add-required-column": {
    baslik: "Zorunlu (boş olamaz) ve varsayılan değeri olmayan yeni kolon ekliyor",
    ne: "Mevcut satırlar bu kolonu dolduramadığı için işlem hata verir; verirse de eski kod yeni kayıtta kolonu bilmediği için kayıt ekleyemez.",
    geri: "Kolon silinebilir.",
    site: "Yayındaki eski kod sipariş/kayıt eklerken hata alabilir.",
    guvenli: "Kolonu 'default' değerle ekle (ya da önce boş olabilir ekle, doldur, sonra zorunlu yap).",
  },
};

export const ERROR_TITLES = {
  "bad-filename": "Dosya adı yanlış",
  "no-rls": "Tabloda satır güvenliği (RLS) açılmamış",
  "no-grant": "Tabloya uygulama yetkisi (grant) verilmemiş",
  "fk-no-on-delete": "Yabancı anahtarda silme davranışı belirtilmemiş",
  "timestamp-without-tz": "Saat dilimsiz tarih kolonu",
  "non-transactional": "Transaction içinde çalışmayan komut",
  "modified-existing": "Yayınlanmış bir migration değiştirilmiş",
  "deleted-existing": "Yayınlanmış bir migration silinmiş",
  "renamed-existing": "Yayınlanmış bir migration'ın adı değişmiş",
  "duplicate-version": "İki migration aynı sürüm numarasına sahip",
  "version-not-newer": "Migration tarihi eski kalmış",
};

export const WARNING_TITLES = {
  empty: "Dosya boş",
  "float-column": "Para için ondalık (float) kolon",
  "explicit-transaction": "Gereksiz begin/commit",
  "definer-no-search-path": "security definer fonksiyonunda search_path yok",
  "definer-no-grant": "security definer fonksiyonunda yetki belirtilmemiş",
  "open-policy": "Herkese açık politika",
  "anon-write-grant": "Giriş yapmamış kullanıcıya yazma yetkisi",
};

/** Text Hamit pastes into Claude when a danger needs a human decision. */
export function claudePrompt({ prNumber }) {
  const pr = prNumber ? `#${prNumber}` : "bu";
  return (
    `${pr} PR'ındaki "DB Kontrol" yorumunu oku (gh pr view ${prNumber ?? "<PR numarası>"} --comments). ` +
    `Tehlikeli migration'ı, hiç teknik bilmeyen birine anlatır gibi sade Türkçe açıkla: tam olarak neyi siler veya değiştirir, ` +
    `geri döner mi, canlı siteyi nasıl etkiler. Daha güvenli bir yol varsa (önce ekle, kodu geçir, eskiyi sonraki PR'da kaldır) ` +
    `onu öner ve istersem uygula. Ben açıkça "onaylıyorum" demeden db-onayli etiketini EKLEME.`
  );
}
