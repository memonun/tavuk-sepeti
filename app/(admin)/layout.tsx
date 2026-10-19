import type { Viewport } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AdminOfflineSupport } from "@/app/(admin)/_components/admin-offline-support";
import { AdminSidebar } from "@/app/(admin)/_components/admin-sidebar";
import { AdminTabBar } from "@/app/(admin)/_components/admin-tab-bar";
import { TEXT_SIZE_COOKIE, parseTextSize } from "@/app/(admin)/_components/text-size";
import { TextSizeProvider } from "@/app/(admin)/_components/text-size-controls";
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

import "@/app/globals.css";
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
 *
 * The text size (Normal / Büyük / En büyük) is a per-device cookie read here,
 * so the first paint is already at the chosen size.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both start at once: the feed is an RLS-gated read (a non-admin gets an
  // empty list and is redirected below anyway), so it need not wait for the
  // admin check — one round trip saved on every page load.
  const [result, notificationFeed, cookieStore] = await Promise.all([
    assertAdmin(),
    getNotificationFeed(),
    cookies(),
  ]);
  if (!result.ok) {
    redirect(result.error.code === ErrorCode.UNAUTHORIZED ? "/login" : "/");
  }
  const user = result.value;
  const textSize = parseTextSize(cookieStore.get(TEXT_SIZE_COOKIE)?.value);

  return (
    <TextSizeProvider initialSize={textSize}>
      <SidebarProvider className="admin-theme">
        <AdminSidebar userEmail={user.email} />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top,0px)]">
            <SidebarTrigger className="hidden md:inline-flex" />
            <div className="flex items-center gap-2 md:hidden">
              {/* The tab icon's mark: the full farm badge is unreadable at 28px.
                  SVG needs `unoptimized`; the image optimizer rejects it. */}
              <Image
                src="/icon.svg"
                alt=""
                width={28}
                height={28}
                unoptimized
                className="size-7 shrink-0"
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
        <AdminOfflineSupport />
      </SidebarProvider>
    </TextSizeProvider>
  );
}
