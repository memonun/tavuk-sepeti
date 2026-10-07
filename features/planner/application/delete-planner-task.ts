"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { deleteTask as repoDelete } from "@/features/planner/infrastructure/task.repository";
import {
  type AppError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const idSchema = z.string().uuid("Geçersiz görev kimliği.");

export async function deletePlannerTaskAction(
  rawId: string,
): Promise<Result<{ deleted: true }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: "Geçersiz görev kimliği.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoDelete(parsed.data);
  if (!result.ok) return err(result.error);
  if (!result.value.deleted) {
    return err(new NotFoundError({ message: "Görev bulunamadı veya silme yetkisi yok." }));
  }

  revalidatePath("/planlayici");
  return ok({ deleted: true });
}
