"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { updatePlannerTaskSchema } from "@/features/planner/domain/task.schema";
import { updateTask as repoUpdate } from "@/features/planner/infrastructure/task.repository";
import { logger } from "@/shared/logger";
import { type AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { PlannerTask } from "@/features/planner/domain/task";

export async function updatePlannerTaskAction(
  raw: unknown,
): Promise<Result<PlannerTask, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updatePlannerTaskSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "update_planner_task_invalid");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz görev.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoUpdate({
    id: parsed.data.id,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    ...(parsed.data.scheduled_date !== undefined
      ? { scheduledDate: parsed.data.scheduled_date }
      : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
  });

  if (result.ok) {
    revalidatePath("/planlayici");
  }
  return result;
}
