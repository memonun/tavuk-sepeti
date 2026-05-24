"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { deleteView as repoDelete } from "@/features/views/infrastructure/view.repository";
import { logger } from "@/shared/logger";
import {
  type AppError,
  NotFoundError,
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

  // Atomic delete that returns the deleted row's table_id — single
  // round-trip, no separate lookup. RLS gates the delete, so probing
  // someone else's view ID returns NotFoundError instead of a silent
  // success (which would have leaked existence info AND lied to the
  // user about whether the delete happened).
  const result = await repoDelete(parsed.data);
  if (!result.ok) return err(result.error);

  if (result.value.deletedTableId === null) {
    logger.warn({ id: parsed.data }, "delete_view_not_found_or_denied");
    return err(
      new NotFoundError({ message: "Görünüm bulunamadı veya silme yetkisi yok." }),
    );
  }

  revalidatePath(`/${result.value.deletedTableId}`);
  return ok({ deleted: 1 });
}
