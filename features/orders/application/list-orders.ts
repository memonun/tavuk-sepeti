import "server-only";

import { ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";

import { orderListQuerySchema } from "@/features/orders/domain/order.schema";
import {
  listOrders as repoListOrders,
  type ListOrdersResult,
} from "@/features/orders/infrastructure/order.repository";

import type { ExternalApiError } from "@/shared/errors/app-error";

export type ListOrdersFailure = ExternalApiError | ValidationError;

export async function listOrders(
  rawQuery: unknown,
): Promise<Result<ListOrdersResult, ListOrdersFailure>> {
  const parsed = orderListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "list_orders_invalid_query");
    return err(
      new ValidationError({
        message: "Geçersiz arama parametresi.",
        details: parsed.error.flatten(),
      }),
    );
  }
  return repoListOrders(parsed.data);
}
