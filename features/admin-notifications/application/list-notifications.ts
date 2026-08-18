import "server-only";

/**
 * Admin-only reads for the notification bell. RLS (is_admin()) is the actual
 * gate — these run through the SSR client, not the service-role one.
 */
import {
  countUnreadNotifications,
  listRecentNotifications,
} from "@/features/admin-notifications/infrastructure/notifications.repository";

import type { AdminNotification } from "@/features/admin-notifications/domain/notification";

const BELL_LIST_LIMIT = 20;

export interface NotificationFeed {
  readonly notifications: readonly AdminNotification[];
  readonly unreadCount: number;
}

export async function getNotificationFeed(): Promise<NotificationFeed> {
  const [notifications, unreadCount] = await Promise.all([
    listRecentNotifications(BELL_LIST_LIMIT),
    countUnreadNotifications(),
  ]);
  return { notifications, unreadCount };
}
