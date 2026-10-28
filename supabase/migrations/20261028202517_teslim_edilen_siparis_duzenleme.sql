-- teslim_edilen_siparis_duzenleme
--
-- Teslim edilmiş siparişin teslimat ücreti ve kalemleri sonradan
-- düzeltilebilsin (owner kararı, 2026-10-28). Şimdiye kadar tek yol
-- "teslimatı geri al → düzenle → tekrar teslim et" idi; bu da teslim saatini
-- kaydırıyor ve geçmişe sahte durum satırları ekliyordu.
--
-- Tek değişiklik: update_order_with_items artık 'delivered' durumunu da kabul
-- ediyor. İmza ve gövdenin geri kalanı 20260805090500_order_writers_v2 ile
-- birebir aynı (create or replace, mevcut grant'lar korunur). Eski kod bu
-- fonksiyonu aynı imzayla çağırdığı için yayın penceresinde sorun çıkmaz.
--
-- Teslim edilmiş siparişte değişmeyen kalemlerin eski fiyatla kalması
-- uygulama katmanında yapılır (features/orders/application/order-item-pricing.ts
-- → priceDeliveredOrderEdit); veritabanı gelen fiyatı olduğu gibi yazar.
-- Ödeme durumu, toplam değişince orders_total_recompute trigger'ı ile
-- yeniden hesaplanır. Kargoda (shipped) ve iptal edilmiş sipariş hâlâ
-- düzenlenemez; uygulamadaki eşi: isEditableOrderStatus (features/orders/domain/order.ts).

create or replace function update_order_with_items(
  p_order_id uuid,
  p_scheduled_for date,
  p_time_slot time_slot,
  p_payment_method payment_method,
  p_delivery_notes text,
  p_delivery_fee_minor bigint,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_subtotal bigint := 0;
  v_count int;
begin
  select status into v_status from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0001';
  end if;
  if v_status not in ('pending', 'confirmed', 'delivered') then
    raise exception 'order % is % and cannot be edited', p_order_id, v_status
      using errcode = 'P0001';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  if v_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint
  );

  update orders set
    scheduled_for      = p_scheduled_for,
    time_slot          = p_time_slot,
    payment_method     = p_payment_method,
    delivery_notes     = p_delivery_notes,
    delivery_fee_minor = coalesce(p_delivery_fee_minor, 0),
    subtotal_minor     = v_subtotal
  where id = p_order_id;

  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor,
    product_snapshot, fulfillment_type
  )
  select
    p_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot,
    coalesce(p.fulfillment_type, 'delivery')
  from jsonb_to_recordset(p_items) as x(
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint,
    product_snapshot jsonb
  )
  left join products p on p.key = x.product_key;

  -- Re-freeze the channel from the NEW item set.
  update orders set fulfillment_channel = resolve_order_channel(p_order_id)
  where id = p_order_id;
end;
$$;
