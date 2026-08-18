import { redirect } from "next/navigation";

import { AdminSidebar } from "@/app/(admin)/_components/admin-sidebar";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { getNotificationFeed } from "@/features/admin-notifications/application/list-notifications";
import { NotificationBell } from "@/features/admin-notifications/ui/notification-bell";
import { ErrorCode } from "@/shared/errors/error-codes";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

/**
 * Admin shell. Requires an ADMIN session — not merely any logged-in user. Since
 * Faz 2, customers authenticate through the same Supabase Auth, so "is someone
 * signed in?" is no longer sufficient: a logged-in customer must never see
 * admin chrome. assertAdmin() checks is_admin(); anon → /login, non-admin
 * (customer) → the storefront.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await assertAdmin();
  if (!result.ok) {
    redirect(result.error.code === ErrorCode.UNAUTHORIZED ? "/login" : "/");
  }
  const user = result.value;
  const notificationFeed = await getNotificationFeed();

  return (
    <SidebarProvider>
      <AdminSidebar userEmail={user.email} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <div className="ml-auto">
            <NotificationBell
              initialNotifications={notificationFeed.notifications}
              initialUnreadCount={notificationFeed.unreadCount}
            />
          </div>
        </header>
        <main className="flex-1 overflow-hidden px-3 py-2 sm:px-4">{children}</main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
