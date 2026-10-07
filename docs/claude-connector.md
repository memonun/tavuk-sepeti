# Claude connector (claude.ai ↔ panel)

claude.ai'deki bir sohbetten panelle konuşmak için remote MCP server. Kod:
`features/mcp/`, route kabuğu `app/api/mcp/route.ts`, onay sayfası
`app/oauth/consent/page.tsx`.

## Nasıl çalışır

1. claude.ai connector'ı `https://apuhanciftligi.com/api/mcp` (apex — `www` 308'lenir)
   adresine bağlanır. Token yoksa 401 + `WWW-Authenticate: Bearer resource_metadata=…` alır.
2. `/.well-known/oauth-protected-resource/api/mcp` yetkilendirme sunucusu olarak
   **Supabase Auth'u** (`<project>.supabase.co/auth/v1`, OAuth 2.1 server) gösterir.
3. Admin tarayıcıda `/oauth/consent` sayfasına düşer (giriş yoksa `/login?next=…`),
   **admin değilse reddedilir**, "İzin ver"e basar.
4. claude.ai Supabase'ten token alır. Token = o adminin gerçek Supabase JWT'si; her
   istekte `auth.getUser(token)` + `is_admin()` ile doğrulanır, DB çağrıları
   `shared/supabase/request-client.ts` ile **o kullanıcının kimliğiyle** (RLS açık, service
   role yok) çalışır.

Müşteri hesapları aynı Supabase projesinde olduğundan "geçerli token" tek başına yetmez;
admin kontrolü hem consent sayfasında hem her MCP isteğinde yapılır.

## Tool'lar

Okuma: `get_dashboard_summary`, `list_orders`, `get_order`, `get_order_payments`,
`list_customers`, `get_customer`, `list_products`, `get_finance_summary`, `get_agenda`,
`list_expense_categories`, `list_expenses`, `list_market_locations`, `list_market_sales`,
`list_recurring_expense_templates`, `get_route_summary`, `get_order_gifts`, `get_customer_prices`,
`list_recurring_orders`, `get_recurring_order`, `list_planner_tasks`, `list_notifications`,
`get_storefront_settings`, `list_cargo_orders`, `get_market_report`, `get_product_tally`,
`get_expense_summary`, `get_expense_category_breakdown`, `get_upcoming_recurring_expenses`.

Yazma — hepsi panelin kendi Server Action'larını çağırır (aynı doğrulama, fiyat dondurma,
durum kuralları, audit, cache revalidate); `shared/supabase/request-client.ts` isteği
`source: "mcp"` ile işaretler, her audit satırına otomatik yazılır:

| Alan | Tool'lar |
| --- | --- |
| Sipariş | `create_order`, `update_order`, `transition_order`, `confirm_orders`, `delete_orders`* |
| Ödeme | `add_order_payment`, `mark_order_fully_paid`, `delete_order_payment`* |
| Müşteri | `create_customer`, `update_customer`, `delete_customers`* |
| Ürün / fiyat | `create_product`, `update_product`, `set_product_pricing`, `set_product_active`, `set_product_flags`, `set_product_image`, `remove_product_image`*, `delete_product`* |
| Gider | `create_expense`, `update_expense`, `mark_expense_paid`, `delete_expense`* |
| Pazar satışı | `create_market_sale`, `update_market_sale`, `delete_market_sale`* |
| Rutin gider | `create_recurring_expense_template`, `update_recurring_expense_template`, `set_recurring_expense_template_active`, `delete_recurring_expense_template`* |
| Gider kategorisi | `create_expense_category`, `update_expense_category`, `set_expense_category_active` |
| Pazar lokasyonu | `create_market_location`, `set_market_location_active`, `delete_market_location`* |
| Teslimat / kargo | `complete_delivery`, `revert_delivery`, `update_order_cargo_info` |
| Sipariş ekstraları | `add_order_gift`, `remove_order_gift`*, `create_orders_bulk`, `set_product_sort_order` |
| Tekrarlayan sipariş | `create_recurring_order`, `update_recurring_order`, `set_recurring_order_active` (mağaza talebini onaylar), `delete_recurring_order`* |
| Planlayıcı | `create_planner_task`, `update_planner_task`, `delete_planner_task`* |
| Bildirim | `mark_notification_read`, `mark_all_notifications_read` |
| Mağaza ayarları | `update_storefront_settings` (CANLI kurallar: eve servis günleri, alt limitler, ücret) |
| Ajanda | `create_agenda_task`, `update_agenda_task`, `complete_agenda_task`, `delete_agenda_task`* |

\* Silme tool'ları `confirm: true` ister ve `destructiveHint` taşır (claude.ai onay kartında görünür).
`update_customer` / `update_product` yalnızca gönderilen alanları değiştirir (mevcut kaydı
okuyup üzerine bindirir); `update_order` / `update_agenda_task` tüm alanları yeniden yazar.
Müşteri adresi Google'da konumlandırılmaz: `lat/lng` verilmezse pinsiz kalır, pin panelden düzeltilir.
`update_market_sale`, `update_recurring_expense_template` ve `update_expense_category` mevcut kaydı okuyup
üzerine bindirir (kalemler/günler/üst kategori verilmezse korunur); rutin giderde sıklık değişince eski
sıklığın günü (haftanın günü ↔ ayın günü) devralınmaz. `update_expense` tüm alanları yeniden yazar.
Gider kategorisi silme tool'u yoktur (panelde de yok; pasife alınır). Dolu bir pazar lokasyonu silinemez,
pasife alınır.

**Ürün görseli:** sohbete eklenen dosyalar araçlara iletilemez, bu yüzden `set_product_image` bir
**https bağlantısı** alır; sunucu görseli indirip panelin kendi yükleme action'ına verir
(tip/boyut yeniden doğrulanır, eski dosya temizlenir, audit yazılır). İndirme SSRF'e karşı
korunur (`features/mcp/domain/remote-image.ts`, `infrastructure/fetch-remote-image.ts`): yalnızca
herkese açık https, DNS cevabı sunucuda çözülüp bağlantı o adrese sabitlenir (özel/loopback/
metadata adresleri ve DNS rebinding reddedilir), her yönlendirme yeniden kontrol edilir (en çok 3),
10 sn / 5 MB sınırı, tür `Content-Type`'a değil dosyanın ilk baytlarına bakılarak belirlenir.

**Müşteriye özel fiyat:** panelde ayrı bir düzenleme ekranı yok; siparişteki kaleme yazılan birim fiyat
o müşteri için hatırlanıyor. Bu yüzden `create_order` / `update_order` / `create_orders_bulk` içindeki
`unit_price_minor` aynı işi görür; `get_customer_prices` okur.

**Sınırlar / güvenlik notları**
- `update_recurring_order` aktif/duraklatılmış durumu korur (panelin şeması `active`'i varsayılan true yapar,
  kısmi güncelleme duraklatılmış şablonu yanlışlıkla açmasın diye); `update_storefront_settings` yalnızca verilen
  değeri değiştirir (eksik bir ücret "ücretsiz teslimat" gibi okunmasın).
- `updateTag` / `refresh` Next 16'da Route Handler içinde **hata fırlatır**; connector action'ları
  `/api/mcp`'den çağırdığı için application kodu `shared/cache/invalidate-tag.ts` kullanır
  (`route-handler-safety.test.ts` doğrudan import'u build'de yakalar).
- Kapsam dışı: harita pinleri, şoför modu ve canlı yeniden sıralama, kayıtlı görünümler, kullanıcı/güvenlik ayarları.
**Rota özeti** (`get_route_summary`, varsayılan YARIN): panelin kendi `getDayRoute` hesabını
(Google Routes, ücretli, kısa süre önbelleklenir) `persistEtas: false` ile çalıştırır; yani
müşteriye `/siparis-sorgula`'da gösterilen teslimat saatlerini **değiştirmez**. Sıralı duraklar,
müşteri/adres/telefon, ürünler, tahsil edilecek tutar, toplam km/süre ve yüklenecekler döner;
saat, çizgi (polyline) ve harita verisi dönmez. Sadece onaylı siparişler rotaya girer; bekleyenler
uyarı olarak ayrıca listelenir. Şoför modu, canlı yeniden sıralama ve pin düzeltme kapsam dışıdır.
Sayfalama: varsayılan 25, en çok 100.

## Kurulum (bir kez, prod)

1. Supabase Dashboard → Authentication → **OAuth Server**: aç; Authorization Path =
   `/oauth/consent`. **Site URL** `https://apuhanciftligi.com` olmalı.
2. Dynamic client registration **kapalı** kalsın. Bir OAuth client'ı elle kaydet,
   redirect URI: `https://claude.ai/api/mcp/auth_callback`.
3. claude.ai → Settings → Connectors → Add custom connector: URL
   `https://apuhanciftligi.com/api/mcp`, Advanced'a client ID/secret.

## Erişimi kesmek

Supabase Dashboard → Authentication → OAuth Server'dan client'ı sil / grant'i iptal et;
token bir sonraki istekte `getUser` doğrulamasında düşer.

## Sınırlar

Sunucu stateless (oturum yok, GET/DELETE 405). Rate limit
(`features/mcp/infrastructure/rate-limit.ts`) instance başına in-memory; ortak bir
store gelince gövdesi değiştirilir.
