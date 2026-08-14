import { getMyOrderPaymentState } from "@/features/storefront/application/get-order-payment-status";
import { PaymentSuccess } from "@/features/storefront/ui/payment-success";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  // Never take PayTR's redirect as proof of payment — read the order.
  const paymentState = await getMyOrderPaymentState(no ?? null);
  return <PaymentSuccess orderNumber={no ?? null} paymentState={paymentState} />;
}
