/**
 * Admin notification feed (panel bell icon). Two event types, per the
 * owner's explicit request: a new order landing (any channel) and a
 * customer's recurring-order approval request.
 */

export const NOTIFICATION_TYPES = ["order_created", "recurring_request"] as const;
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
