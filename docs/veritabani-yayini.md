# Veritabanı yayını — kısaca

> Teknik bilgi gerekmez. Bir değişiklik yaptıran herkes (Hamit Bey dahil) için.

## Ne olur?

```
Claude değişikliği yapar → PR açılır → "DB Kontrol" (otomatik) → sen "Merge" dersin
                                                                      │
                          ┌───────────────────────────────────────────┘
                          ▼
                     "DB Yayın" (otomatik)
   önce kontrol → canlıda deneme (geri alınır) → veritabanını güncelle → ardından siteyi yayınla
```

Önce **veritabanı**, sonra **site**. Veritabanında bir sorun çıkarsa site **hiç yayınlanmaz**,
eski sürümde çalışmaya devam eder; müşteri hiçbir şey fark etmez.

## PR'da ne görürsün?

PR'ın altında "🗄️ DB Kontrol" başlıklı **tek bir yorum** çıkar (her değişiklikte kendini yeniler):

| Başlık | Anlamı | Ne yapmalı |
| --- | --- | --- |
| ✅ Bu PR veritabanına dokunmuyor | Sadece site değişikliği | Merge et |
| ✅ Veritabanı değişikliği güvenli görünüyor | Veri eklenen/genişleyen, zararsız değişiklik | Merge et |
| ❌ Düzeltilmesi gereken şeyler var | Proje kuralı çiğnenmiş (ör. tabloda güvenlik açılmamış) | Claude'a: *"DB Kontrol hatalarını düzelt"* de |
| ⛔ Tehlikeli değişiklik — onay bekliyor | Bir şey **siliyor** veya geri dönülmez şekilde **değiştiriyor** | Aşağıya bak |

### ⛔ Tehlikeli değişiklik görürsen

Yorum, ne olacağını (veri silinir mi, geri döner mi, siteyi nasıl etkiler) ve **Claude'a yapıştıracağın
hazır bir cümleyi** yazar. O cümleyi Claude'a yapıştır:

1. Claude sana **sade Türkçe** ile anlatır, daha güvenli bir yol varsa önerir.
2. Anladıysan ve istiyorsan **"onaylıyorum"** de. Claude onay etiketini (`db-onayli`) ekler ve kontrol yeşile döner.
3. Emin değilsen "hayır" de; Claude daha güvenli yolu uygular.

Onaydan sonra migration'ı değiştirirsen onay **otomatik silinir** — yeni haline tekrar bakmak gerekir.

## Merge'den sonra

- Her şey yolundaysa PR'a **✅ Yayınlandı** yorumu düşer. Yapacak bir şey yok.
- Bir şey ters giderse GitHub'da **🚨 Yayın durdu** başlıklı bir **Issue** açılır (e-posta gelir). İçinde:
  hangi aşamada durdu, veritabanı değişti mi, **site şu an hangi sürümde**, ne yapılmalı ve Claude'a
  yapıştırılacak hazır bir cümle yazar. Çoğu zaman: cümleyi Claude'a ver, düzeltsin, bir PR daha aç.
- Geçici bir sorunsa (bağlantı vb.): **Actions → DB Yayın → Run workflow** düğmesiyle tekrar dene. Güvenlidir.

## Yeni migration yazarken (Claude'a / geliştiriciye)

```bash
pnpm db:new musteri_notlari   # doğru sürüm numarasıyla boş şablon oluşturur
```

Kurallar `CLAUDE.md` §7 ve §7.1'de. Kısaca: yayınlanmış migration değiştirilmez, yeni tabloda RLS + `grant` + `timestamptz`
+ açık `on delete`, imza değişikliği yerine `default null` ile genişletme, silme/yeniden adlandırma iki adımda.

## Bir kerelik kurulum (Vercel)

Site yayını artık GitHub üzerinden tetiklenir (`vercel.json` ile `main` için Vercel'in kendi otomatik yayını kapalı).

1. Vercel → proje → **Settings → Git → Deploy Hooks** → ad: `github-db-yayin`, branch: `main` → **Create**.
2. Çıkan adresi kopyala. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret** →
   ad: `VERCEL_DEPLOY_HOOK_URL`, değer: o adres.
3. Bu adres bir şifre gibidir; kimseyle paylaşma. Sızarsa Vercel'de sil, yenisini oluştur, secret'ı güncelle.

Preview (PR) yayınları eskisi gibi otomatik çalışmaya devam eder.

## Acil durum

GitHub Actions çökerse site yayınlanmaz (eski sürüm çalışır). Vercel → **Deployments** → son commit → **Redeploy** ile elle
yayınlanabilir. Ama o commit'in migration'ı canlı veritabanına uygulanmamışsa önce **Actions → DB Yayın → Run workflow** çalıştır.

## Bu sistem neyi garanti etmez?

- Migration içindeki **mantık hatalarını** (yanlış hesap, yanlış veri) yakalayamaz; sadece çalışıp çalışmadığına, proje kurallarına
  ve tehlikeli kalıplara bakar.
- Canlıda zaten bozuk/elle değiştirilmiş bir şemayı onarmaz; farkı **uyarı** olarak gösterir.
