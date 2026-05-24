"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { updateViewSchema } from "@/features/views/domain/view.schema";
import { updateView as repoUpdate } from "@/features/views/infrastructure/view.repository";
import { logger } from "@/shared/logger";
import {
  type AppError,
  ValidationError,
} from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { View } from "@/features/views/domain/view";

export async function updateViewAction(
  raw: unknown,
): Promise<Result<View, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateViewSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "update_view_invalid");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz görünüm verisi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoUpdate({
    id: parsed.data.id,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.config !== undefined ? { config: parsed.data.config } : {}),
    ...(parsed.data.is_default !== undefined
      ? { isDefault: parsed.data.is_default }
      : {}),
  });

  if (result.ok) {
    revalidatePath(`/${result.value.tableId}`);
  }
  return result;
}
