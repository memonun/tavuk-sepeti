# Android uygulaması (APK)

Uygulama ayrı bir yazılım değil: `apuhanciftligi.com`'u adres çubuğu olmadan, tam ekran açan ince bir kabuk (Trusted Web Activity). Site yayınlandığında uygulama da güncellenmiş olur; yeni APK dağıtmaya gerek kalmaz. Açılış sayfası `/admin`.

## APK üretmek

```bash
pnpm android:apk
```

Çıktı: `mobile/android-build/apuhan-<sürüm>.apk`. Gerekenler: JDK 17, Android SDK (Android Studio ile gelen yeterli) ve imza anahtarı.

Ayarlar `mobile/twa-manifest.json` içinde. Yeni bir APK dağıtırken `appVersionCode`'u bir artır, yoksa telefon eski sürümün üzerine kurmaz.

## İmza anahtarı — kaybetme

Anahtar repoda **değil**: `~/.apuhan-android/apuhan-release.keystore`, şifresi aynı klasördeki `keystore.env` içinde. Bu klasörü güvenli bir yere yedekle.

Anahtar kaybolursa aynı uygulamanın güncellemesi yapılamaz: yeni anahtarla imzalanan APK kurulmadan önce telefondaki eski uygulamanın silinmesi gerekir ve yeni parmak izinin `shared/android-app.ts`'e **eklenmesi** gerekir.

## Adres çubuğu görünüyorsa

Chrome, uygulamayı siteyle eşleştirmek için `https://apuhanciftligi.com/.well-known/assetlinks.json` adresine bakar. Orada `shared/android-app.ts`'teki paket adı ve parmak izi yoksa (veya APK başka bir anahtarla imzalandıysa) uygulama çalışır ama üstte adres çubuğu çıkar.

Kontrol:

```bash
curl -s https://apuhanciftligi.com/.well-known/assetlinks.json
```

## Telefona kurmak

APK dosyasını telefona gönder (WhatsApp, Drive, kablo), dosyaya dokun, "bilinmeyen kaynaklardan yükleme" iznini ver. Telefonda Chrome kurulu ve güncel olmalı.
