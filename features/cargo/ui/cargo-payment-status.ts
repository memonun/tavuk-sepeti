/** Payment-status vocabulary shared by the /kargo prep queue, the
 *  shipped-history view below it, and their phone cards. */
import type { PaymentStatus } from "@/features/orders/application/list-orders";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  partial: "Kısmi",
  paid: "Ödendi",
  failed: "Başarısız",
  refunded: "İade",
};

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  partial: "secondary",
  paid: "default",
  failed: "destructive",
  refunded: "destructive",
};
