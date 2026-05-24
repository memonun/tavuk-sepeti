"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { createViewSchema } from "@/features/views/domain/view.schema";
import { createView as repoCreate } from "@/features/views/infrastructure/view.repository";
import { logger } from "@/shared/logger";
import {
  type AppError,
  ValidationError,
} from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { View } from "@/features/views/domain/view";

export async function createViewAction(
  raw: unknown,
): Promise<Result<View, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createViewSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "create_view_invalid");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz görünüm verisi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoCreate({
    tableId: parsed.data.table_id,
    ownerId: auth.value.id,
    name: parsed.data.name,
    config: parsed.data.config,
    isDefault: parsed.data.is_default,
  });

  if (result.ok) {
    // The grid page refetches views on revalidate; bust its cache so
    // the new tab shows up immediately.
    revalidatePath(`/${parsed.data.table_id}`);
  }
  return result;
}
