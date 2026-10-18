"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  FINANS_HREF,
  FINANS_ICON,
  financeSubItems,
  isNavItemActive,
  navItems,
} from "@/app/(admin)/_components/admin-nav";
import { TextSizeMenu } from "@/app/(admin)/_components/text-size-controls";
import { signOutAction } from "@/features/auth/application/sign-out";
import { clearDriveOfflineCache } from "@/features/routing/ui/drive-offline-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

interface AdminSidebarProps {
  userEmail: string | null;
}

export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {/* Same mark as the tab icon (app/icon.svg); the full badge is
              unreadable at 32px, which is also the collapsed sidebar's size. */}
          <Image
            src="/icon.svg"
            alt="Apuhan Çiftliği"
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 shrink-0"
          />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight">Apuhan Çiftliği</span>
            <span className="text-xs text-muted-foreground leading-tight">Yönetim</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isNavItemActive(pathname, item);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {(() => {
                const isFinansActive =
                  pathname === FINANS_HREF || pathname.startsWith(`${FINANS_HREF}/`);
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={isFinansActive}
                      tooltip="Finans"
                      render={<Link href={FINANS_HREF} />}
                    >
                      <FINANS_ICON />
                      <span>Finans</span>
                    </SidebarMenuButton>
                    {isFinansActive ? (
                      <SidebarMenuSub>
                        {financeSubItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton
                              isActive={pathname === item.href}
                              render={<Link href={item.href} />}
                            >
                              <span>{item.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {userEmail ? (
          <span
            className="truncate px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden"
            title={userEmail}
          >
            {userEmail}
          </span>
        ) : null}
        <div className="flex items-center gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <TextSizeMenu />
          <ThemeToggle />
          {/* Drop the offline route copies too — they hold customer names and
              addresses and must not outlive the session on a shared phone.
              Labelled while the sidebar is open: an icon alone is easy to miss. */}
          <form
            action={signOutAction}
            onSubmit={clearDriveOfflineCache}
            className="ml-auto group-data-[collapsible=icon]:ml-0"
          >
            <Button type="submit" variant="ghost" size="sm" aria-label="Çıkış yap" title="Çıkış yap">
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Çıkış</span>
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
