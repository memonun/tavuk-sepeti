-- urun_aylik_satis
--
-- Ürün satışlarını ay ay tek sorguda verir. Ürün kataloğu (list_products_with_sales)
-- yalnızca tüm zamanların toplamını, product_tally ise tek bir tarih aralığının
-- toplamını veriyordu; "son 6 ayda hangi üründen ayda ne sattık" sorusu ay
-- başına bir çağrı gerektiriyordu.
--
-- Kural product_tally ile birebir aynı: iptal hariç tüm siparişler, satılan
-- (order_items) ve hediye (order_gift_items) ayrı satır, tarih p_date_basis'e
-- göre (scheduled_for ya da created_at::date). Tek fark: sonuç ayrıca aya
-- (month = ayın ilk günü) göre gruplanır. Böylece bir ayın toplamı, o ayın
-- tarihleriyle çağrılan product_tally ile aynı çıkar.
--
-- Yeni fonksiyon: mevcut hiçbir şeyi değiştirmez. Aralık sınırı (en fazla 24
-- ay) uygulama katmanında. Index: product_tally gibi tarih ifadesi
-- (case ... end) üzerinden süzer, yani tarih index'ini kullanmaz ve aralıktaki
-- siparişleri tek geçişte toplar. Yalnızca admin raporu; product_tally ile aynı
-- maliyet sınıfında olduğu için yeni index eklenmedi.

create function product_tally_by_month(
  p_from date,
  p_to date,
  p_date_basis text default 'scheduled_for'
)
returns table (
  month date,
  product_key text,
  display_name text,
  kind text,
  unit_label text,
  quantity numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    date_trunc('month', d.day)::date as month,
    oi.product_key,
    p.display_name,
    'sold'::text as kind,
    p.unit_label,
    sum(oi.quantity) as quantity
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.key = oi.product_key
  cross join lateral (
    select case when p_date_basis = 'created_at' then o.created_at::date else o.scheduled_for end as day
  ) d
  where o.status <> 'cancelled'
    and d.day between p_from and p_to
  group by 1, oi.product_key, p.display_name, p.unit_label

  union all

  select
    date_trunc('month', d.day)::date as month,
    ogi.product_key,
    p.display_name,
    'gift'::text as kind,
    ogi.unit_label,
    sum(ogi.quantity) as quantity
  from order_gift_items ogi
  join orders o on o.id = ogi.order_id
  join products p on p.key = ogi.product_key
  cross join lateral (
    select case when p_date_basis = 'created_at' then o.created_at::date else o.scheduled_for end as day
  ) d
  where o.status <> 'cancelled'
    and d.day between p_from and p_to
  group by 1, ogi.product_key, p.display_name, ogi.unit_label

  order by month, product_key, kind, unit_label;
$$;

-- New functions need an explicit grant since mid-2026 (see
-- 20260823120000_schema_wide_authenticated_grants). SECURITY INVOKER, so RLS on
-- orders/order_items/order_gift_items/products still decides what each caller sees.
grant execute on function public.product_tally_by_month(date, date, text) to authenticated;

comment on function product_tally_by_month is
  'product_tally grouped by month (month = first day of the month). Same rule: non-cancelled orders, sold and gift rows separate.';
