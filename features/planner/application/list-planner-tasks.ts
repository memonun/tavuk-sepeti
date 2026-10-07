/**
 * List the current admin's planner tasks for a given week, plus their
 * backlog (unscheduled) tasks.
 *
 * Invoked from the Server Component shell, not a Client Component — no
 * "use server" directive (mirrors features/views/application/list-views.ts).
 */
import "server-only";

import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { addDaysIso } from "@/features/planner/domain/week";
import {
  listTasksInRange,
  listUnscheduledTasks,
} from "@/features/planner/infrastructure/task.repository";
import { logger } from "@/shared/logger";
import { type AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { PlannerTask } from "@/features/planner/domain/task";

export interface PlannerWeekTasks {
  readonly scheduled: readonly PlannerTask[];
  readonly backlog: readonly PlannerTask[];
}

const mondayIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz hafta.");

export async function listPlannerWeekTasks(
  weekStartIso: string,
): Promise<Result<PlannerWeekTasks, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = mondayIsoSchema.safeParse(weekStartIso);
  if (!parsed.success) {
    logger.warn({ weekStartIso }, "list_planner_tasks_invalid_week");
    return err(new ValidationError({ message: "Geçersiz hafta." }));
  }

  const weekEndIso = addDaysIso(parsed.data, 6);

  const [scheduled, backlog] = await Promise.all([
    listTasksInRange(parsed.data, weekEndIso),
    listUnscheduledTasks(),
  ]);
  if (!scheduled.ok) return err(scheduled.error);
  if (!backlog.ok) return err(backlog.error);

  return ok({ scheduled: scheduled.value, backlog: backlog.value });
}
