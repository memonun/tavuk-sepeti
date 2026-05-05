/**
 * List query for the customer table — invoked from the Server Component
 * shell, not from a Client Component. No "use server" needed.
 */
import "server-only";

import { customerListQuerySchema } from "@/features/customers/domain/customer.schema";
import {
  listCustomers as listCustomersFromRepo,
  type ListCustomersResult,
} from "@/features/customers/infrastructure/customer.repository";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";
import type { ExternalApiError } from "@/shared/errors/app-error";
import { ValidationError } from "@/shared/errors/app-error";

export type ListCustomersFailure = ExternalApiError | ValidationError;

export async function listCustomers(
  rawQuery: unknown,
): Promise<Result<ListCustomersResult, ListCustomersFailure>> {
  const parsed = customerListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "list_customers_invalid_query");
    return err(
      new ValidationError({
        message: "Geçersiz arama parametresi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  return listCustomersFromRepo(parsed.data);
}
