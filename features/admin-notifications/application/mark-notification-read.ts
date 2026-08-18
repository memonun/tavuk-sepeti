"use server";

/**
 * Mark one (or all) notifications read. RLS (is_admin()) gates who can call
 * this successfully; the bell only renders for an admin anyway.
 *
 * No revalidatePath: the bell is optimistic (updates its own local state
 * the moment the admin clicks) and the notifications table is in the
 * supabase_realtime publication, so a second admin's screen reconciles via
 * useTableRealtime the same way the customer/order grids do — see
 * patch-customer-cell.ts for the same "optimistic + realtime" contract.
 */
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/admin-notifications/infrastructure/notifications.repository";
import { logger } from "@/shared/logger";

export async function markNotificationReadAction(id: string): Promise<void> {
  const result = await markNotificationRead(id);
  if (!result.ok) {
    logger.warn({ code: result.error.code, id }, "mark_notification_read_action_failed");
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const result = await markAllNotificationsRead();
  if (!result.ok) {
    logger.warn({ code: result.error.code }, "mark_all_notifications_read_action_failed");
  }
}
