/**
 * Notifications, storefront rules and the extra reports.
 *
 * `update_storefront_settings` changes LIVE shop rules (delivery days, order
 * floors, delivery fee), so it overlays only the given fields on the current
 * settings — a model that mentions one value must not blank the others (an absent
 * delivery fee would otherwise read as "free delivery").
 */
import "server-only";

import { getNotificationFeed } from "@/features/admin-notifications/application/list-notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/admin-notifications/application/mark-notification-read";
import { getCargoOrders } from "@/features/cargo/application/get-cargo-orders";
import { getExpenseCategoryBreakdown } from "@/features/finance/application/get-expense-category-breakdown";
import { getExpenseSummary } from "@/features/finance/application/get-expense-summary";
import { getMarketReport } from "@/features/finance/application/get-market-report";
import { getProductTally } from "@/features/finance/application/get-product-tally";
import { getUpcomingRecurringExpenses } from "@/features/finance/application/get-upcoming-recurring-expenses";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { updateStorefrontSettingsAction } from "@/features/storefront/application/update-storefront-settings";
import {
  dateRangeInput,
  markNotificationReadInput,
  productTallyInput,
  updateStorefrontSettingsInput,
  upcomingRecurringExpensesInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult, toolFromState, toolJson } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAdminMiscTools(server: McpServer): void {
  // ---- notifications ------------------------------------------------------

  server.registerTool(
    "list_notifications",
    {
      title: "Bildirimler",
      description: "Panel bildirimlerini (yeni sipariş vb.) ve okunmamış sayısını getirir.",
      annotations: { ...READ_ONLY, title: "Bildirimler" },
    },
    async () => {
      try {
        return toolJson(await getNotificationFeed());
      } catch (cause) {
        return toolError("list_notifications", cause);
      }
    },
  );

  server.registerTool(
    "mark_notification_read",
    {
      title: "Bildirimi okundu yap",
      description: "Tek bir bildirimi okundu işaretler ve kalan okunmamış sayısını döner.",
      inputSchema: markNotificationReadInput,
      annotations: { ...WRITE, idempotentHint: true, title: "Bildirimi okundu yap" },
    },
    async ({ id }) => {
      try {
        await markNotificationReadAction(id);
        // The action reports nothing back on failure, so read the real state.
        const feed = await getNotificationFeed();
        return toolJson({ ok: true, unreadCount: feed.unreadCount });
      } catch (cause) {
        return toolError("mark_notification_read", cause);
      }
    },
  );

  server.registerTool(
    "mark_all_notifications_read",
    {
      title: "Tüm bildirimleri okundu yap",
      description: "Bütün bildirimleri okundu işaretler ve kalan okunmamış sayısını döner.",
      annotations: { ...WRITE, idempotentHint: true, title: "Tüm bildirimleri okundu yap" },
    },
    async () => {
      try {
        await markAllNotificationsReadAction();
        const feed = await getNotificationFeed();
        return toolJson({ ok: true, unreadCount: feed.unreadCount });
      } catch (cause) {
        return toolError("mark_all_notifications_read", cause);
      }
    },
  );

  // ---- storefront settings ------------------------------------------------

  server.registerTool(
    "get_storefront_settings",
    {
      title: "Mağaza ayarları",
      description:
        "Canlı mağaza kurallarını getirir: eve servis günleri (0=Pazar … 6=Cumartesi), kargo ve eve servis alt limitleri ve eve servis ücreti (kuruş).",
      annotations: { ...READ_ONLY, title: "Mağaza ayarları" },
    },
    async () => {
      try {
        return toolJson(await getStorefrontSettings());
      } catch (cause) {
        return toolError("get_storefront_settings", cause);
      }
    },
  );

  server.registerTool(
    "update_storefront_settings",
    {
      title: "Mağaza ayarlarını değiştir",
      description:
        "CANLI mağaza kurallarını değiştirir: eve servis günleri, kargo/eve servis alt limiti, eve servis ücreti (kuruş). Müşterilerin ödeme ekranını hemen etkiler. Sadece gönderdiğin alanlar değişir. Önce get_storefront_settings ile mevcut değerleri göster, değişikliği kullanıcıya açıkça söyle.",
      inputSchema: updateStorefrontSettingsInput,
      annotations: { ...WRITE, title: "Mağaza ayarlarını değiştir" },
    },
    async (input) => {
      try {
        const current = await getStorefrontSettings();
        const fd = new FormData();
        for (const day of input.home_delivery_days ?? current.homeDeliveryDays) fd.append("home_delivery_days", String(day));
        fd.set("cargo_min_order_minor", String(input.cargo_min_order_minor ?? current.cargoMinOrderMinor));
        fd.set("home_min_order_minor", String(input.home_min_order_minor ?? current.homeMinOrderMinor));
        fd.set("home_delivery_fee_minor", String(input.home_delivery_fee_minor ?? current.homeDeliveryFeeMinor));
        return toolFromState(await updateStorefrontSettingsAction({ status: "idle" }, fd));
      } catch (cause) {
        return toolError("update_storefront_settings", cause);
      }
    },
  );

  // ---- reports ------------------------------------------------------------

  server.registerTool(
    "list_cargo_orders",
    {
      title: "Kargo bekleyen siparişler",
      description: "Onaylı, henüz kargolanmamış kargo siparişlerini, alıcı bilgilerini ve toplam hazırlık listesini getirir.",
      annotations: { ...READ_ONLY, title: "Kargo bekleyen siparişler" },
    },
    async () => {
      try {
        return toolFromResult("list_cargo_orders", await getCargoOrders());
      } catch (cause) {
        return toolError("list_cargo_orders", cause);
      }
    },
  );

  server.registerTool(
    "get_market_report",
    {
      title: "Pazar raporu",
      description: "Tarih aralığı için pazar cirosu, lokasyon kırılımı ve en çok satan ürünler. Tutarlar kuruştur.",
      inputSchema: dateRangeInput,
      annotations: { ...READ_ONLY, title: "Pazar raporu" },
    },
    async ({ from, to }) => {
      try {
        return toolFromResult("get_market_report", await getMarketReport(from, to));
      } catch (cause) {
        return toolError("get_market_report", cause);
      }
    },
  );

  server.registerTool(
    "get_product_tally",
    {
      title: "Ürün satış sayımı",
      description: "Tarih aralığında hangi üründen kaç adet/kg satıldığını (sipariş bazlı) döner.",
      inputSchema: productTallyInput,
      annotations: { ...READ_ONLY, title: "Ürün satış sayımı" },
    },
    async (input) => {
      try {
        return toolFromResult("get_product_tally", await getProductTally(input));
      } catch (cause) {
        return toolError("get_product_tally", cause);
      }
    },
  );

  server.registerTool(
    "get_expense_summary",
    {
      title: "Gider özeti",
      description: "Tarih aralığı için toplam, ödenen ve bekleyen giderleri özetler. Tutarlar kuruştur.",
      inputSchema: dateRangeInput,
      annotations: { ...READ_ONLY, title: "Gider özeti" },
    },
    async ({ from, to }) => {
      try {
        return toolFromResult("get_expense_summary", await getExpenseSummary(from, to));
      } catch (cause) {
        return toolError("get_expense_summary", cause);
      }
    },
  );

  server.registerTool(
    "get_expense_category_breakdown",
    {
      title: "Gider kategori dağılımı",
      description: "Tarih aralığı için giderlerin ana kategori ve alt kategori dağılımı. Tutarlar kuruştur.",
      inputSchema: dateRangeInput,
      annotations: { ...READ_ONLY, title: "Gider kategori dağılımı" },
    },
    async ({ from, to }) => {
      try {
        return toolFromResult("get_expense_category_breakdown", await getExpenseCategoryBreakdown(from, to));
      } catch (cause) {
        return toolError("get_expense_category_breakdown", cause);
      }
    },
  );

  server.registerTool(
    "get_upcoming_recurring_expenses",
    {
      title: "Yaklaşan rutin giderler",
      description: "Vadesi yaklaşan rutin giderleri (ad, tutar, tarih) sırayla getirir.",
      inputSchema: upcomingRecurringExpensesInput,
      annotations: { ...READ_ONLY, title: "Yaklaşan rutin giderler" },
    },
    async ({ limit }) => {
      try {
        return toolFromResult("get_upcoming_recurring_expenses", await getUpcomingRecurringExpenses(limit));
      } catch (cause) {
        return toolError("get_upcoming_recurring_expenses", cause);
      }
    },
  );
}
