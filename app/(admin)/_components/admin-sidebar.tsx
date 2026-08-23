"use client";

import {
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Map,
  Package,
  PiggyBank,
  Repeat,
  Store,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import Image from "next/image";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/customers", label: "Müşteriler", icon: Users, exact: false },
  { href: "/orders", label: "Siparişler", icon: Package, exact: false },
  { href: "/recurring", label: "Tekrarlananlar", icon: Repeat, exact: false },
  { href: "/products", label: "Ürünler", icon: Tags, exact: false },
  { href: "/map", label: "Harita", icon: Map, exact: false },
  { href: "/routes", label: "Rota", icon: CalendarRange, exact: false },
  { href: "/kargo", label: "Kargo", icon: Truck, exact: false },
  { href: "/magaza-ayarlari", label: "Mağaza ayarları", icon: Store, exact: false },
] as const;

// Finans has sub-pages, so it's kept out of the flat navItems list above —
// every other item stays exactly as it was, this is additive.
const FINANS_HREF = "/finans";
const financeSubItems = [
  { href: "/finans", label: "Finans Özeti" },
  { href: "/finans/pazar-satislari", label: "Pazar Satışları" },
  { href: "/finans/giderler", label: "Giderler" },
  { href: "/finans/rutin-giderler", label: "Rutin Giderler" },
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
          <Image
            src="/brand/apuhan-logo.png"
            alt="Apuhan Çiftliği"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-md"
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
                      <PiggyBank />
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
