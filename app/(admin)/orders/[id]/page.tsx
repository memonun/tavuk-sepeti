import { notFound } from "next/navigation";

import { getCustomerById } from "@/features/customers/application/get-customer";
import {
  getOrderById,
  getOrderEvents,
} from "@/features/orders/application/get-order";
import { OrderDetail } from "@/features/orders/ui/order-detail";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;

  const [orderResult, eventsResult] = await Promise.all([
    getOrderById(id),
    getOrderEvents(id),
  ]);

  if (!orderResult.ok) notFound();
  const order = orderResult.value;
  const events = eventsResult.ok ? eventsResult.value : [];

  const customerResult = await getCustomerById(order.customer_id);
  const customerName = customerResult.ok
    ? `${customerResult.value.first_name} ${customerResult.value.last_name}`
    : "—";

  return <OrderDetail order={order} events={events} customerName={customerName} />;
}
