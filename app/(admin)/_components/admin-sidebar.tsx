"use client";

import {
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Map,
  Package,
  Repeat,
  Store,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/features/auth/application/sign-out";
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
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/customers", label: "Müşteriler", icon: Users, exact: false },
  { href: "/orders", label: "Siparişler", icon: Package, exact: false },
  { href: "/recurring", label: "Tekrarlananlar", icon: Repeat, exact: false },
  { href: "/products", label: "Ürünler", icon: Tags, exact: false },
  { href: "/map", label: "Harita", icon: Map, exact: false },
  { href: "/routes", label: "Rota", icon: CalendarRange, exact: false },
  { href: "/magaza-ayarlari", label: "Mağaza ayarları", icon: Store, exact: false },
] as const;

interface AdminSidebarProps {
  userEmail: string | null;
}

export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            TS
          </div>
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
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          {userEmail ? (
            <span
              className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
              title={userEmail}
            >
              {userEmail}
            </span>
          ) : null}
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Çıkış">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
