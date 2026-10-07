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
`list_customers`, `get_customer`, `list_products`, `get_finance_summary`, `get_agenda`.

Yazma — hepsi panelin kendi Server Action'larını çağırır (aynı doğrulama, fiyat dondurma,
durum kuralları, audit, cache revalidate); `shared/supabase/request-client.ts` isteği
`source: "mcp"` ile işaretler, her audit satırına otomatik yazılır:

| Alan | Tool'lar |
| --- | --- |
| Sipariş | `create_order`, `update_order`, `transition_order`, `confirm_orders`, `delete_orders`* |
| Ödeme | `add_order_payment`, `mark_order_fully_paid`, `delete_order_payment`* |
| Müşteri | `create_customer`, `update_customer`, `delete_customers`* |
| Ürün / fiyat | `create_product`, `update_product`, `set_product_pricing`, `set_product_active`, `set_product_flags`, `delete_product`* |
| Ajanda | `create_agenda_task`, `update_agenda_task`, `complete_agenda_task`, `delete_agenda_task`* |

\* Silme tool'ları `confirm: true` ister ve `destructiveHint` taşır (claude.ai onay kartında görünür).
`update_customer` / `update_product` yalnızca gönderilen alanları değiştirir (mevcut kaydı
okuyup üzerine bindirir); `update_order` / `update_agenda_task` tüm alanları yeniden yazar.
Müşteri adresi Google'da konumlandırılmaz: `lat/lng` verilmezse pinsiz kalır, pin panelden düzeltilir.
Kapsam dışı: ürün görseli yükleme, müşteriye özel fiyatlar, gider/pazar satışı, şifre/ayarlar.
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
