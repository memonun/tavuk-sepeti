import { PaymentSuccess } from "@/features/storefront/ui/payment-success";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  return <PaymentSuccess orderNumber={no ?? null} />;
}
