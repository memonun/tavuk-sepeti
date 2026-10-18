"use client";

import { ChevronRight, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";

import {
  type AdminNavItem,
  FINANS_HREF,
  FINANS_ICON,
  financeSubItems,
  hidesTabBar,
  isNavItemActive,
  menuGroups,
  settingsItem,
  tabBarItems,
} from "@/app/(admin)/_components/admin-nav";
import { TextSizeRow } from "@/app/(admin)/_components/text-size-controls";
import { signOutAction } from "@/features/auth/application/sign-out";
import { clearDriveOfflineCache } from "@/features/routing/ui/drive-offline-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Açık", icon: Sun },
  { value: "dark", label: "Koyu", icon: Moon },
  { value: "system", label: "Otomatik", icon: Monitor },
] as const;

interface AdminTabBarProps {
  userEmail: string | null;
}

/**
 * Phone navigation for the panel: four pinned destinations plus "Menü", which
 * opens every other page as a list of large rows. Replaces the slide-out
 * sidebar below the `md` breakpoint (the sidebar is unchanged on desktop).
 */
export function AdminTabBar({ userEmail }: AdminTabBarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (hidesTabBar(pathname)) return null;

  const onPinnedTab = tabBarItems.some((item) => isNavItemActive(pathname, item));

  return (
    <>
      <nav
        aria-label="Ana menü"
        className="admin-tab-bar fixed inset-x-0 bottom-0 z-40 bg-card pb-[env(safe-area-inset-bottom,0px)] shadow-(--admin-shadow-bar) md:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {tabBarItems.map((item) => (
            <li key={item.href} className="min-w-0">
              <TabLink item={item} active={isNavItemActive(pathname, item)} />
            </li>
          ))}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className="admin-tab flex h-full w-full flex-col items-center justify-center gap-0.5"
            >
              <TabFace icon={Menu} label="Menü" active={!onPinnedTab} />
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="admin-drawer max-h-[88dvh] gap-0 overflow-y-auto bg-background overscroll-contain rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-lg">Menü</SheetTitle>
            <SheetDescription className="truncate">
              {userEmail ?? "Apuhan Çiftliği yönetim paneli"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4">
            {menuGroups.map((group) => (
              <MenuGroup key={group.title} title={group.title}>
                {group.items.map((item) => (
                  <MenuLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isNavItemActive(pathname, item)}
                    onNavigate={() => setMenuOpen(false)}
                  />
                ))}
              </MenuGroup>
            ))}

            <MenuGroup title="Para">
              {financeSubItems.map((item) => (
                <MenuLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={FINANS_ICON}
                  active={
                    item.href === FINANS_HREF
                      ? pathname === FINANS_HREF
                      : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  }
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </MenuGroup>

            <MenuGroup title="Ayarlar">
              <MenuLink
                href={settingsItem.href}
                label={settingsItem.label}
                icon={settingsItem.icon}
                active={isNavItemActive(pathname, settingsItem)}
                onNavigate={() => setMenuOpen(false)}
              />
              <TextSizeRow />
              <ThemeRow />
              {/* Drop the offline route copies too — they hold customer names and
                  addresses and must not outlive the session on a shared phone. */}
              <form action={signOutAction} onSubmit={clearDriveOfflineCache}>
                <button
                  type="submit"
                  className="admin-menu-row flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-medium text-destructive"
                >
                  <LogOut className="size-5 shrink-0" aria-hidden />
                  Çıkış yap
                </button>
              </form>
            </MenuGroup>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabLink({ item, active }: { item: AdminNavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="admin-tab flex h-full w-full flex-col items-center justify-center gap-0.5"
    >
      <TabFace icon={item.icon} label={item.label} active={active} />
    </Link>
  );
}

function TabFace({
  icon: Icon,
  label,
  active,
}: {
  icon: AdminNavItem["icon"];
  label: string;
  active: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "admin-tab-pill flex h-8 w-14 items-center justify-center rounded-full",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      {/* 12px, growing with the text size but capped at 13px so five labels
          ("Siparişler", "Müşteriler") still fit across a 360px phone. */}
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[length:min(0.75rem,13px)] leading-4",
          active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
        )}
      >
        {label}
      </span>
    </>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</div>
    </section>
  );
}

function MenuLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: AdminNavItem["icon"];
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "admin-menu-row flex min-h-14 items-center gap-3 px-4 text-base font-medium",
        active && "bg-(--admin-green-soft) text-accent-foreground",
      )}
    >
      <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Same three choices as the desktop theme switch, laid out as one row of
 *  thumb-sized buttons instead of a dropdown. */
function ThemeRow() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-base font-medium">Görünüm</span>
      <div role="group" aria-label="Görünüm" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(option.value)}
              className={cn(
                "admin-tab flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-sm font-medium",
                selected ? "bg-card text-foreground shadow-(--admin-shadow-sm)" : "text-muted-foreground",
              )}
            >
              <option.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
