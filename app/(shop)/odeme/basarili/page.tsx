import { getReturnPaymentState } from "@/features/storefront/application/get-order-payment-status";
import { PaymentSuccess } from "@/features/storefront/ui/payment-success";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string; t?: string }>;
}) {
  const { no, t } = await searchParams;
  // Never take PayTR's redirect as proof of payment — read the order. `t` is
  // the signed return token, which is what lets a GUEST (no session) get a
  // real answer here instead of a permanent "kontrol ediliyor".
  const paymentState = await getReturnPaymentState({
    orderNumber: no ?? null,
    returnToken: t ?? null,
  });
  return (
    <PaymentSuccess
      orderNumber={no ?? null}
      returnToken={t ?? null}
      initialPaymentState={paymentState}
    />
  );
}
