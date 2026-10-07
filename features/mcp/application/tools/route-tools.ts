/**
 * Route summary tool. Calls the panel's own `getDayRoute` (Google Routes
 * optimisation, cached) with `persistEtas: false`, so asking for a summary never
 * rewrites the delivery times customers see on /siparis-sorgula. The load
 * manifest comes from the same day-orders the route is built from.
 */
import "server-only";

import { buildEmptyRouteSummary, buildRouteSummary } from "@/features/mcp/application/route-summary";
import { routeSummaryInput } from "@/features/mcp/domain/mcp-tool-inputs";
import { listOrders } from "@/features/orders/application/list-orders";
import { buildDayLoadManifest } from "@/features/routing/application/get-day-load-manifest";
import { getDayOrders } from "@/features/routing/application/get-day-orders";
import { getDayRoute } from "@/features/routing/application/get-day-route";
import { ErrorCode } from "@/shared/errors/error-codes";
import { addDaysToYmd, todayInIstanbul } from "@/shared/utils/date";

import { READ_ONLY } from "./annotations";
import { toolError, toolJson } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerRouteTools(server: McpServer): void {
  server.registerTool(
    "get_route_summary",
    {
      title: "Rota özeti",
      description:
        "Bir günün teslimat rotasının özetini verir (varsayılan: YARIN): optimum durak sırası, müşteri/adres/telefon, ürünler, tahsil edilecek tutar, toplam km ve süre, yüklenecek ürünler ve rotaya girmeyen bekleyen siparişler. Google Routes ile sıralar (ücretli çağrı, kısa süre önbelleklenir); müşteriye gösterilen teslimat saatlerini DEĞİŞTİRMEZ. Tutarlar kuruştur. Sadece onaylı siparişler rotaya girer.",
      inputSchema: routeSummaryInput,
      // Reaches an external paid API, but changes nothing.
      annotations: { ...READ_ONLY, openWorldHint: true, title: "Rota özeti" },
    },
    async ({ date }) => {
      const day = date ?? addDaysToYmd(todayInIstanbul(), 1);
      try {
        // Pending orders never enter a route (the optimiser only takes confirmed
        // ones), so surface them instead of letting the summary look complete.
        const pending = await listOrders({
          status: "pending",
          fulfillment_channel: "delivery",
          scheduled_from: day,
          scheduled_to: day,
          page: 1,
          pageSize: 20,
        });
        const pendingTotal = pending.ok ? pending.value.total : 0;
        const pendingOrderNumbers = pending.ok ? pending.value.items.map((o) => o.order_number) : [];

        const orders = await getDayOrders(day);
        if (!orders.ok) return toolError("get_route_summary", orders.error, { date: day });
        if (orders.value.length === 0) {
          return toolJson(buildEmptyRouteSummary({ date: day, pendingOrderNumbers, pendingTotal }));
        }

        const route = await getDayRoute(day, { persistEtas: false });
        if (!route.ok) {
          if (route.error.code === ErrorCode.NOT_FOUND) {
            return toolJson(buildEmptyRouteSummary({ date: day, pendingOrderNumbers, pendingTotal }));
          }
          return toolError("get_route_summary", route.error, { date: day });
        }

        const manifest = await buildDayLoadManifest(orders.value);
        return toolJson(
          buildRouteSummary({
            date: day,
            route: {
              stops: route.value.stops.map((s) => ({
                sequence: s.sequence,
                order_number: s.order_number,
                customer_name: s.customer_name,
                customer_phone: s.customer_phone,
                address: s.delivery_address,
                delivery_notes: s.delivery_notes,
                customer_notes: s.customer_notes,
                total_minor: s.total_minor,
                amount_paid_minor: s.amount_paid_minor,
                items: s.items,
                in_service_area: s.in_service_area,
              })),
              completed_markers: route.value.completed_markers,
              total_distance_m: route.value.total_distance_m,
              total_duration_s: route.value.total_duration_s,
            },
            manifest,
            pendingOrderNumbers,
            pendingTotal,
          }),
        );
      } catch (cause) {
        return toolError("get_route_summary", cause, { date: day });
      }
    },
  );
}
