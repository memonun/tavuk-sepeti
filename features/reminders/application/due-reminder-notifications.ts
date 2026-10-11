"use server";

/**
 * Raises the bell notification for every reminder whose time has come. There
 * is no cron in this project (see materialize-due-recurring-expenses.ts): the
 * open admin panel calls this on load and again when the next reminder falls
 * due (features/reminders/ui/reminder-due-ticker.tsx). The database function
 * behind it is idempotent and safe to call from several tabs at once.
 */
import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  materializeDueReminderNotifications,
  type DueNotificationSummary,
} from "@/features/reminders/infrastructure/reminder.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function checkDueRemindersAction(): Promise<Result<DueNotificationSummary, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const result = await materializeDueReminderNotifications();
  if (!result.ok) return err(result.error);
  return ok(result.value);
}
