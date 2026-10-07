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

Okuma: `get_dashboard_summary`, `list_orders`, `get_order`, `list_customers`,
`get_customer`, `list_products`, `get_finance_summary`, `get_agenda`.
Yazma (yalnızca sipariş durumu): `transition_order`, `confirm_orders` — audit log'a
`metadata.source = "mcp"` ile yazılır. Sipariş oluşturma/silme, ödeme kaydı yok.
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
