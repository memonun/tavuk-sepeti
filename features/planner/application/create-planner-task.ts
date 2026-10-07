"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { createPlannerTaskSchema } from "@/features/planner/domain/task.schema";
import { createTask as repoCreate } from "@/features/planner/infrastructure/task.repository";
import { logger } from "@/shared/logger";
import { type AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { PlannerTask } from "@/features/planner/domain/task";

export async function createPlannerTaskAction(
  raw: unknown,
): Promise<Result<PlannerTask, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createPlannerTaskSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "create_planner_task_invalid");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz görev.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoCreate({
    ownerId: auth.value.id,
    title: parsed.data.title,
    notes: parsed.data.notes,
    scheduledDate: parsed.data.scheduled_date,
  });

  if (result.ok) {
    revalidatePath("/planlayici");
  }
  return result;
}
