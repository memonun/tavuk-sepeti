import "server-only";

import { listOrderGifts } from "@/features/orders/infrastructure/order-gift.repository";

import type { OrderGiftItem } from "@/features/orders/domain/order-gift";
import type { ExternalApiError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

export async function getOrderGifts(
  orderId: string,
): Promise<Result<OrderGiftItem[], ExternalApiError>> {
  return listOrderGifts(orderId);
}
