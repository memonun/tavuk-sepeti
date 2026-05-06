# Google Maps özelleştirilmiş stiller

Google Maps cloud-based styling akışı: bir **Map Style** (görsel kurallar) +
bir **Map ID** (style'a referans) yarat → kodda `mapId={...}` olarak referans
ver. Stil JSON'ları bu klasörde versiyon kontrol altında durur ki Cloud
Console'daki konfigürasyon kaybolursa kolayca yeniden import edilebilsin.

> **Not — `styles` prop'u + `mapId` birlikte çalışmaz.** Mevcut kodumuz
> her `<Map>` instance'ında `mapId` kullanıyor (AdvancedMarker bunu zorunlu
> kılıyor). Stil bu yüzden cloud-based olmak zorunda; `<Map styles=...>`
> inline yaklaşımı yok sayılır.

## JSON şema notu — yeni cloud format vs eski snazzymaps

Cloud Console iki şemayı da kabul eder, **ama** eski (legacy
`featureType` + `stylers`) format **approximate** dönüştürülür — bazı
kurallar kaybolur veya yanlış uygulanır. Bu yüzden bu klasördeki JSON'lar
native **cloud-based schema**'da yazılı:

- Wrapper object: `{ "variant", "backgroundColor", "styles": [...] }`
- Selector: dotted path (`natural.water`, `infrastructure.roadNetwork.road.highway`)
- Geometry/label nested object: `{ "geometry": { "fillColor": "..." }, "label": { "visible": false } }`
- Visibility property: `"visible": false` (boolean — değil `"visibility": "off"`)
- Cascade: parent selector çocukları kapsar (`pointOfInterest` → tüm POI alt türleri etkilenir)

## Stil dosyaları

| Dosya | Kullanıldığı yer |
|---|---|
| [`gta-style.json`](./gta-style.json) | GTA 5 paper-map estetiği — beyaz arka plan, gri yol hiyerarşisi, olive parklar, steel blue su, koyu yapı blokları, kırmızı tren hatları, label'lar kapalı |

## Cloud Console adımları (tek seferlik)

1. **APIs & Services → Map Management → Map Styles → Create new map style**
2. **Choose your starting point → Import JSON** seç → bu klasördeki JSON'u yapıştır.
   - "This is the new format" mesajını görmelisin (legacy uyarısı çıkmamalı).
3. İsim ver: `Tavuk Sepeti — GTA`. Preview'da gözden geçir.
4. **Save**.
5. **Map Management → Map IDs → Create new Map ID**.
   - Map type: **JavaScript**
   - Tile type: **Vector** (AdvancedMarker için zorunlu)
   - Map style: yukarıda yarattığın "Tavuk Sepeti — GTA"
   - **Save** → ürettiği Map ID'yi (`a1b2c3d4...` benzeri) kopyala.
6. `.env`'e ekle:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=a1b2c3d4...
   ```
7. Dev server'ı restart et. Bütün `<Map>` instance'ları (admin harita,
   müşteri form pin'i, rota planlama, driver mode) bu Map ID'yi alır
   ve GTA stilini kullanır.

## Tweaking ipuçları

Cloud Console'un Map Style editor'ünde live preview var. Bir özellik
hâlâ "tipik Google" görünüyorsa:

- Selector'u kontrol et — yeni şemada `road.highway` değil
  `infrastructure.roadNetwork.road.highway`. Tam path kullanmazsan kural
  hiç çalışmaz.
- Cascade: `pointOfInterest` parent kuralı ile çocukları toplu sustur,
  sonra istediğin alt-türleri tek tek aç.
- Label'lar metinle birlikte ICON da içerebilir; her ikisi için ayrı
  declaration gerekebilir.

## Birden fazla stil isteğin olduğunda

Driver mode için karanlık, planlama için açık tema vb. farklı stiller
istersen **birden fazla Map ID** yaratıp `mapId` prop'unu component bazlı
geçebiliriz. Şu an tek `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` var; çoğa çıkarmak
ileride `MapIdEnv = { default, driver, planning }` benzeri bir grupla
yapılır.
