import type { Viewport } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/app/(admin)/_components/admin-sidebar";
import { AdminTabBar } from "@/app/(admin)/_components/admin-tab-bar";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { getNotificationFeed } from "@/features/admin-notifications/application/list-notifications";
import { NotificationBell } from "@/features/admin-notifications/ui/notification-bell";
import { ReminderDueTicker } from "@/features/reminders/ui/reminder-due-ticker";
import { ErrorCode } from "@/shared/errors/error-codes";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

import "./theme.css";

// Matches the panel's ground (the colour at the very top of the page) so the
// phone's status bar reads as part of the app. Repeats the root layout's
// fields rather than relying on segment merging, same as the storefront.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#11150f" },
  ],
};

/**
 * Admin shell. Requires an ADMIN session — not merely any logged-in user. Since
 * Faz 2, customers authenticate through the same Supabase Auth, so "is someone
 * signed in?" is no longer sufficient: a logged-in customer must never see
 * admin chrome. assertAdmin() checks is_admin(); anon → /login, non-admin
 * (customer) → the storefront.
 *
 * Two navigations, one per input: the sidebar from `md` up (mouse, wide
 * screen), a bottom tab bar below it (thumb, phone). Both read the same
 * destination list (admin-nav.ts).
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
    <SidebarProvider className="admin-theme">
      <AdminSidebar userEmail={user.email} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top,0px)]">
          <SidebarTrigger className="hidden md:inline-flex" />
          <div className="flex items-center gap-2 md:hidden">
            <Image
              src="/brand/apuhan-logo.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-full"
            />
            <span className="text-base font-semibold tracking-tight">Apuhan Çiftliği</span>
          </div>
          <div className="ml-auto">
            <NotificationBell
              initialNotifications={notificationFeed.notifications}
              initialUnreadCount={notificationFeed.unreadCount}
            />
          </div>
        </header>
        {/* `overflow-x-clip`, not `overflow-hidden`: hidden would make <main> a
            scroll container, and a `position: sticky` bar inside a page (the
            order form's save bar) would then never stick to the screen. */}
        <main className="min-w-0 flex-1 overflow-x-clip px-3 pt-2 pb-[calc(0.5rem+var(--admin-tabbar-h))] sm:px-4">
          {children}
        </main>
      </SidebarInset>
      <AdminTabBar userEmail={user.email} />
      <Toaster mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }} />
      <ReminderDueTicker />
    </SidebarProvider>
  );
}
