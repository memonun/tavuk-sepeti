"use client";

/**
 * Admin panel bell: unread badge + dropdown list of the most recent
 * notifications (new order, new recurring request). Lives in
 * app/(admin)/layout.tsx's header, fed by getNotificationFeed() server-side.
 *
 * Optimistic + realtime, same contract as the customer/order grids
 * (patch-customer-cell.ts): clicking a row (or "tümünü okundu işaretle")
 * updates the local read overlay immediately and fires the server action in
 * the background; `notifications` is in the supabase_realtime publication,
 * so a peer admin's screen — and this one, once the local overlay's
 * cooldown lapses — reconciles via useTableRealtime's router.refresh().
 */
import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/admin-notifications/application/mark-notification-read";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTableRealtime } from "@/shared/realtime/use-table-realtime";
import { formatDateTime } from "@/shared/utils/date";

import type { AdminNotification } from "@/features/admin-notifications/domain/notification";

interface NotificationBellProps {
  readonly initialNotifications: readonly AdminNotification[];
  readonly initialUnreadCount: number;
}

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: NotificationBellProps) {
  const [locallyRead, setLocallyRead] = useState<ReadonlySet<string>>(new Set());
  const { markLocalWrite } = useTableRealtime({
    tables: ["notifications"],
    channelPrefix: "admin-notifications-bell",
  });

  // Render-phase state adjustment (React's documented pattern, not an
  // effect — see checkout-form.tsx's seenAccountState for the same idiom):
  // once a fresh unread count arrives from the server (realtime round-trip
  // or navigation), it already reflects whatever this client marked read,
  // so the optimistic overlay resets in lockstep rather than lagging a render.
  const [seenUnreadCount, setSeenUnreadCount] = useState(initialUnreadCount);
  if (seenUnreadCount !== initialUnreadCount) {
    setSeenUnreadCount(initialUnreadCount);
    setLocallyRead(new Set());
  }

  const unreadCount = Math.max(0, initialUnreadCount - locallyRead.size);

  const handleOpen = (notification: AdminNotification) => {
    if (notification.readAt || locallyRead.has(notification.id)) return;
    setLocallyRead((prev) => new Set(prev).add(notification.id));
    markLocalWrite();
    void markNotificationReadAction(notification.id);
  };

  const handleMarkAllRead = () => {
    const unreadIds = initialNotifications
      .filter((n) => !n.readAt && !locallyRead.has(n.id))
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    setLocallyRead((prev) => new Set([...prev, ...unreadIds]));
    markLocalWrite();
    void markAllNotificationsReadAction();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unreadCount > 0 ? `Bildirimler (${unreadCount} okunmamış)` : "Bildirimler"}
          />
        }
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <p className="text-xs font-medium text-muted-foreground">Bildirimler</p>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Tümünü okundu işaretle
            </button>
          ) : null}
        </div>
        {initialNotifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Henüz bildirim yok.
          </p>
        ) : (
          initialNotifications.map((notification) => {
            const isRead = Boolean(notification.readAt) || locallyRead.has(notification.id);
            return (
              <DropdownMenuItem
                key={notification.id}
                render={<Link href={notification.link} />}
                onClick={() => handleOpen(notification)}
                className="flex-col items-start gap-0.5 whitespace-normal py-2"
              >
                <span className={cn("text-sm", !isRead && "font-semibold")}>
                  {notification.title}
                </span>
                <span className="text-xs text-muted-foreground">{notification.body}</span>
                <span className="text-[11px] text-muted-foreground/70">
                  {formatDateTime(notification.createdAt)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
