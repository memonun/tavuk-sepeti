/**
 * Registers the panel tools on an MCP server.
 *
 * Read tools call the same application-layer functions the panel pages use, so
 * they get identical validation and shaping. They run inside the request's
 * `runWithSupabaseClient` scope, i.e. as the verified admin (RLS applies).
 *
 * Write tools are deliberately limited to order status changes. They are
 * annotated so claude.ai asks the user before each call, and every write is
 * audit-logged with `source: "mcp"`.
 */
import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { revalidatePath } from "next/cache";

import { getCustomerById } from "@/features/customers/application/get-customer";
import { listCustomers } from "@/features/customers/application/list-customers";
import { getFinanceSummary } from "@/features/finance/application/get-finance-summary";
import {
  agendaInput,
  confirmOrdersInput,
  financeSummaryInput,
  getCustomerInput,
  getOrderInput,
  listCustomersInput,
  listOrdersInput,
  transitionOrderInput,
} from "@/features/mcp/domain/mcp-tool-inputs";
import { getAgendaPage } from "@/features/agenda/application/get-agenda-page";
import { confirmOrdersAs } from "@/features/orders/application/confirm-orders-as";
import { getDashboardOrderStats } from "@/features/orders/application/get-dashboard-order-stats";
import { getOrderById, getOrderEvents } from "@/features/orders/application/get-order";
import { listOrders } from "@/features/orders/application/list-orders";
import { transitionOrderAs } from "@/features/orders/application/transition-order-as";
import { listAllProducts } from "@/features/products/application/list-products";
import { logger } from "@/shared/logger";

import { registerAgendaWriteTools } from "./tools/agenda-write-tools";
import { registerFinanceAdminTools } from "./tools/finance-admin-tools";
import { registerFinanceTools } from "./tools/finance-tools";
import { registerCustomerWriteTools } from "./tools/customer-write-tools";
import { registerOrderWriteTools } from "./tools/order-write-tools";
import { registerProductWriteTools } from "./tools/product-write-tools";
import { registerRouteTools } from "./tools/route-tools";
import { toolError, toolJson, toolRefusal } from "./tool-result";

export interface McpActor {
  readonly id: string;
}

import { READ_ONLY } from "./tools/annotations";

export function registerPanelTools(server: McpServer, actor: McpActor): void {
  server.registerTool(
    "get_dashboard_summary",
    {
      title: "Panel özeti",
      description:
        "Teslim edilmemiş sipariş sayısı ile bugünün rota ve kargo hazırlık listesini getirir.",
      annotations: { ...READ_ONLY, title: "Panel özeti" },
    },
    async () => {
      try {
        return toolJson(await getDashboardOrderStats());
      } catch (cause) {
        return toolError("get_dashboard_summary", cause);
      }
    },
  );

  server.registerTool(
    "list_orders",
    {
      title: "Siparişleri listele",
      description:
        "Siparişleri filtreleyerek listeler (durum, kanal, tarih aralığı, müşteri, arama). Sayfalıdır.",
      inputSchema: listOrdersInput,
      annotations: { ...READ_ONLY, title: "Siparişleri listele" },
    },
    async (input) => {
      const result = await listOrders(input);
      return result.ok ? toolJson(result.value) : toolError("list_orders", result.error);
    },
  );

  server.registerTool(
    "get_order",
    {
      title: "Sipariş detayı",
      description: "Tek bir siparişi kalemleriyle ve durum geçmişiyle getirir.",
      inputSchema: getOrderInput,
      annotations: { ...READ_ONLY, title: "Sipariş detayı" },
    },
    async ({ order_id }) => {
      const [order, events] = await Promise.all([
        getOrderById(order_id),
        getOrderEvents(order_id),
      ]);
      if (!order.ok) return toolError("get_order", order.error, { orderId: order_id });
      if (!events.ok) return toolError("get_order", events.error, { orderId: order_id });
      return toolJson({ order: order.value, events: events.value });
    },
  );

  server.registerTool(
    "list_customers",
    {
      title: "Müşterileri listele",
      description: "Müşterileri ada/telefona göre arayarak listeler. Sayfalıdır.",
      inputSchema: listCustomersInput,
      annotations: { ...READ_ONLY, title: "Müşterileri listele" },
    },
    async (input) => {
      const result = await listCustomers(input);
      return result.ok ? toolJson(result.value) : toolError("list_customers", result.error);
    },
  );

  server.registerTool(
    "get_customer",
    {
      title: "Müşteri detayı",
      description: "Tek bir müşteriyi getirir.",
      inputSchema: getCustomerInput,
      annotations: { ...READ_ONLY, title: "Müşteri detayı" },
    },
    async ({ customer_id }) => {
      const result = await getCustomerById(customer_id);
      return result.ok
        ? toolJson(result.value)
        : toolError("get_customer", result.error, { customerId: customer_id });
    },
  );

  server.registerTool(
    "list_products",
    {
      title: "Ürünleri listele",
      description:
        "Tüm ürün kataloğunu (aktif ve arşivli) fiyat kademeleri ve toplam satış adediyle getirir.",
      annotations: { ...READ_ONLY, title: "Ürünleri listele" },
    },
    async () => {
      const result = await listAllProducts();
      return result.ok ? toolJson(result.value) : toolError("list_products", result.error);
    },
  );

  server.registerTool(
    "get_finance_summary",
    {
      title: "Finans özeti",
      description:
        "Seçilen tarih aralığı için kanal bazlı ciro, tahsilat, beklenen ödemeler, pazar geliri ve giderleri özetler. Tutarlar kuruş cinsindendir.",
      inputSchema: financeSummaryInput,
      annotations: { ...READ_ONLY, title: "Finans özeti" },
    },
    async (input) => {
      const result = await getFinanceSummary(input);
      return result.ok ? toolJson(result.value) : toolError("get_finance_summary", result.error);
    },
  );

  server.registerTool(
    "get_agenda",
    {
      title: "Ajanda / yapılacaklar",
      description:
        "Haftanın günlere göre görevlerini, bekleyen yapılacaklar listesini (backlog) ve hafta özetini getirir.",
      inputSchema: agendaInput,
      annotations: { ...READ_ONLY, title: "Ajanda / yapılacaklar" },
    },
    async (input) => {
      const result = await getAgendaPage(input);
      return result.ok ? toolJson(result.value) : toolError("get_agenda", result.error);
    },
  );

  server.registerTool(
    "transition_order",
    {
      title: "Sipariş durumunu değiştir",
      description:
        "Bir siparişin durumunu değiştirir (örn. confirmed, shipped, delivered, cancelled). Geçiş kuralları panelle aynıdır; iptal için reason zorunludur. Gerçek siparişi etkiler.",
      inputSchema: transitionOrderInput,
      annotations: {
        title: "Sipariş durumunu değiştir",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await transitionOrderAs(
          actor,
          {
            order_id: input.order_id,
            to_status: input.to_status,
            reason: input.reason ?? null,
          },
          { source: "mcp" },
        );
        if (result.status === "error") return toolRefusal(result.message);

        revalidatePath("/orders");
        revalidatePath(`/orders/${input.order_id}`);
        logger.info(
          { orderId: input.order_id, to: result.toStatus, actorId: actor.id },
          "mcp_order_transitioned",
        );
        return toolJson({
          ok: true,
          orderId: result.orderId,
          from: result.fromStatus,
          to: result.toStatus,
        });
      } catch (cause) {
        return toolError("transition_order", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "confirm_orders",
    {
      title: "Siparişleri onayla",
      description:
        "Bekleyen (pending) siparişleri toplu olarak 'confirmed' yapar. Zaten onaylı olanlar atlanır; kaç sipariş onaylandığı döner.",
      inputSchema: confirmOrdersInput,
      annotations: {
        title: "Siparişleri onayla",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await confirmOrdersAs(actor, input, { source: "mcp" });
        if (result.status === "error") return toolRefusal(result.message);

        revalidatePath("/orders");
        revalidatePath("/routes");
        return toolJson({
          ok: true,
          requested: input.order_ids.length,
          confirmed: result.confirmed,
          confirmedIds: result.confirmedIds,
        });
      } catch (cause) {
        return toolError("confirm_orders", cause);
      }
    },
  );

  registerOrderWriteTools(server);
  registerCustomerWriteTools(server);
  registerProductWriteTools(server);
  registerAgendaWriteTools(server);
  registerFinanceTools(server);
  registerFinanceAdminTools(server);
  registerRouteTools(server);
}
