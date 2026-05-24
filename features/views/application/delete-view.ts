"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  deleteView as repoDelete,
  findViewById,
} from "@/features/views/infrastructure/view.repository";
import { logger } from "@/shared/logger";
import {
  type AppError,
  ValidationError,
} from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const idSchema = z.string().uuid("Geçersiz görünüm kimliği.");

export async function deleteViewAction(
  rawId: string,
): Promise<Result<{ deleted: number }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: "Geçersiz görünüm kimliği.",
        details: parsed.error.flatten(),
      }),
    );
  }

  // Look up the tableId before we delete so we can targeted-bust the
  // right grid page's cache. RLS will reject the lookup if the caller
  // doesn't own the row (same surface error the delete would emit).
  const lookup = await findViewById(parsed.data);
  if (!lookup.ok) {
    logger.warn({ id: parsed.data }, "delete_view_lookup_failed");
    return ok({ deleted: 0 });
  }

  const result = await repoDelete(parsed.data);
  if (result.ok) {
    revalidatePath(`/${lookup.value.tableId}`);
  }
  return result;
}
