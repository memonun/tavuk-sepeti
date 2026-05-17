import { redirect } from "next/navigation";

import { AdminSidebar } from "@/app/(admin)/_components/admin-sidebar";
import { getCurrentUser } from "@/features/auth/application/get-session";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

/**
 * Admin shell. Defense-in-depth check on top of proxy.ts — if the proxy ever
 * fails-open, we still won't render admin chrome to an anon visitor.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <SidebarProvider>
      <AdminSidebar userEmail={user.email} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
        </header>
        <main className="flex-1 overflow-hidden px-3 py-2 sm:px-4">{children}</main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
