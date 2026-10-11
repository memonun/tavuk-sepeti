/**
 * Admin notification feed (panel bell icon). Three event types: a new order
 * landing (any channel), a customer's recurring-order approval request, and a
 * reminder coming due (written by the database itself — see
 * materialize_due_reminder_notifications in
 * supabase/migrations/20261010221830_takvim_ve_animsaticilar.sql).
 */

export const NOTIFICATION_TYPES = ["order_created", "recurring_request", "reminder_due"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AdminNotification {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  /** App-relative path the bell item navigates to on click. */
  readonly link: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}
