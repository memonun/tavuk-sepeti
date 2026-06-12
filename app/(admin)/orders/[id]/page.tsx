import { notFound } from "next/navigation";

import { loadCustomerProductPriceMap } from "@/features/customers/application/customer-prices";
import { getCustomerById } from "@/features/customers/application/get-customer";
import {
  getOrderById,
  getOrderEvents,
} from "@/features/orders/application/get-order";
import { getOrderPaymentsAction } from "@/features/orders/application/payments";
import { listActiveProducts } from "@/features/products/application/list-products";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;

  const [orderResult, eventsResult, productsResult, payments] =
    await Promise.all([
      getOrderById(id),
      getOrderEvents(id),
      listActiveProducts(),
      getOrderPaymentsAction(id),
    ]);

  if (!orderResult.ok) notFound();
  const order = orderResult.value;
  const events = eventsResult.ok ? eventsResult.value : [];
  const products = productsResult.ok ? productsResult.value : [];

  const [customerResult, customerPriceMap] = await Promise.all([
    getCustomerById(order.customer_id),
    loadCustomerProductPriceMap(order.customer_id),
  ]);
  const customerName = customerResult.ok
    ? `${customerResult.value.first_name} ${customerResult.value.last_name}`
    : "—";

  return (
    <OrderDetailPanel
      order={order}
      products={products}
      customerName={customerName}
      events={events}
      customerPrices={Object.fromEntries(customerPriceMap)}
      payments={payments}
    />
  );
}
