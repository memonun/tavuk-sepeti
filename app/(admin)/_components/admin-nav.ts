import {
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Images,
  Map,
  Megaphone,
  Package,
  PiggyBank,
  Repeat,
  Store,
  Tags,
  Truck,
  Users,
} from "lucide-react";

/**
 * Single source for the panel's destinations. The desktop sidebar, the phone
 * tab bar and the phone menu all read from here, so a new page shows up in all
 * three (a new top-level section also goes in
 * shared/routes/admin-route-prefixes.ts — a test enforces it).
 */
export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active only on an exact path match (the dashboard would otherwise match everything). */
  readonly exact: boolean;
}

const PANEL: AdminNavItem = { href: "/admin", label: "Panel", icon: LayoutDashboard, exact: true };
const TAKVIM: AdminNavItem = { href: "/takvim", label: "Takvim", icon: CalendarDays, exact: false };
const ANIMSATICILAR: AdminNavItem = { href: "/animsaticilar", label: "Anımsatıcılar", icon: ListChecks, exact: false };
const MUSTERILER: AdminNavItem = { href: "/customers", label: "Müşteriler", icon: Users, exact: false };
const SIPARISLER: AdminNavItem = { href: "/orders", label: "Siparişler", icon: Package, exact: false };
const TEKRARLANANLAR: AdminNavItem = { href: "/recurring", label: "Tekrarlananlar", icon: Repeat, exact: false };
const URUNLER: AdminNavItem = { href: "/products", label: "Ürünler", icon: Tags, exact: false };
const HARITA: AdminNavItem = { href: "/map", label: "Harita", icon: Map, exact: false };
const ROTA: AdminNavItem = { href: "/routes", label: "Rota", icon: CalendarRange, exact: false };
const KARGO: AdminNavItem = { href: "/kargo", label: "Kargo", icon: Truck, exact: false };
const REKLAM: AdminNavItem = { href: "/reklam", label: "Reklam", icon: Megaphone, exact: false };
const VITRIN: AdminNavItem = { href: "/vitrin", label: "Vitrin", icon: Images, exact: false };
const MAGAZA_AYARLARI: AdminNavItem = { href: "/magaza-ayarlari", label: "Mağaza ayarları", icon: Store, exact: false };

/** Desktop sidebar order (unchanged from before the phone shell existed). */
export const navItems: readonly AdminNavItem[] = [
  PANEL,
  TAKVIM,
  ANIMSATICILAR,
  MUSTERILER,
  SIPARISLER,
  TEKRARLANANLAR,
  URUNLER,
  HARITA,
  ROTA,
  KARGO,
  REKLAM,
  VITRIN,
  MAGAZA_AYARLARI,
];

export const FINANS_HREF = "/finans";
export const FINANS_ICON = PiggyBank;

export const financeSubItems = [
  { href: "/finans", label: "Finans Özeti" },
  { href: "/finans/pazar-satislari", label: "Pazar Satışları" },
  { href: "/finans/giderler", label: "Giderler" },
  { href: "/finans/rutin-giderler", label: "Rutin Giderler" },
  { href: "/finans/urun-cetelesi", label: "Ürün Çetelesi" },
] as const;

export function isNavItemActive(
  pathname: string,
  item: Pick<AdminNavItem, "href" | "exact">,
): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The four destinations pinned to the phone tab bar — the daily loop: what is
 * waiting, the orders, today's drive, who it is for. Everything else lives one
 * tap away under "Menü".
 */
export const tabBarItems: readonly AdminNavItem[] = [
  PANEL,
  SIPARISLER,
  ROTA,
  MUSTERILER,
];

/** Phone menu, grouped by the job being done rather than alphabetically. */
export const menuGroups: readonly { readonly title: string; readonly items: readonly AdminNavItem[] }[] = [
  {
    title: "Günlük iş",
    items: [PANEL, SIPARISLER, ROTA, KARGO],
  },
  {
    title: "Planlama",
    items: [TAKVIM, ANIMSATICILAR, TEKRARLANANLAR],
  },
  {
    title: "Kayıtlar",
    items: [MUSTERILER, URUNLER, HARITA],
  },
  {
    title: "Satış",
    items: [REKLAM, VITRIN],
  },
];

export const settingsItem: AdminNavItem = MAGAZA_AYARLARI;

/** The drive screen is a focused, full-height mode with its own bottom action
 *  bar ("Atla / Teslim Edildi"); the tab bar stays out of its way. */
export function hidesTabBar(pathname: string): boolean {
  return pathname === "/routes/drive" || pathname.startsWith("/routes/drive/");
}
