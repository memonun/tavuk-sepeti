/**
 * List the current admin's saved views for a given grid.
 *
 * Invoked from the Server Component shell, not a Client Component —
 * no "use server" directive.
 */
import "server-only";

import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { listViewsForTable } from "@/features/views/infrastructure/view.repository";
import { logger } from "@/shared/logger";
import {
  type AppError,
  ValidationError,
} from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { View } from "@/features/views/domain/view";

const tableIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Geçersiz tablo kimliği.");

export async function listViewsAction(
  tableId: string,
): Promise<Result<View[], AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = tableIdSchema.safeParse(tableId);
  if (!parsed.success) {
    logger.warn({ tableId }, "list_views_invalid_table_id");
    return err(
      new ValidationError({
        message: "Geçersiz tablo kimliği.",
        details: parsed.error.flatten(),
      }),
    );
  }

  return listViewsForTable(parsed.data);
}
