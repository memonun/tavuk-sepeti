/**
 * Order + payment write tools. Each one calls the SAME Server Action the panel
 * uses, so validation, pricing freeze, state rules, audit and cache revalidation
 * are identical; the connector request's admin identity reaches them through the
 * token-bound Supabase client.
 */
import "server-only";

import { addPaymentAction, deletePaymentAction, getOrderPaymentsAction, markOrderFullyPaidAction } from "@/features/orders/application/payments";
import { bulkDeleteOrdersAction } from "@/features/orders/application/bulk-delete-orders";
import { createOrderAction } from "@/features/orders/application/create-order";
import { updateOrderAction } from "@/features/orders/application/update-order";
import {
  addOrderPaymentInput,
  createOrderInput,
  deleteOrderPaymentInput,
  deleteOrdersInput,
  getOrderPaymentsInput,
  markOrderFullyPaidInput,
  updateOrderInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult, toolFromState, toolJson } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerOrderWriteTools(server: McpServer): void {
  server.registerTool(
    "create_order",
    {
      title: "Sipariş oluştur",
      description:
        "Bir müşteri için yeni sipariş oluşturur. Fiyatlar oluşturma anında dondurulur (katalog/kademe veya müşteriye özel fiyat). Önce müşteriyi list_customers, ürün anahtarlarını list_products ile bul.",
      inputSchema: createOrderInput,
      annotations: { ...WRITE, title: "Sipariş oluştur" },
    },
    async (input) => {
      try {
        const fd = new FormData();
        fd.set("customer_id", input.customer_id);
        fd.set("scheduled_for", input.scheduled_for);
        fd.set("time_slot", input.time_slot ?? "");
        fd.set("payment_method", input.payment_method);
        fd.set("delivery_notes", input.delivery_notes ?? "");
        fd.set("delivery_fee_minor", String(input.delivery_fee_minor));
        fd.set("items_json", JSON.stringify(input.items));
        return toolFromState(await createOrderAction({ status: "idle" }, fd));
      } catch (cause) {
        return toolError("create_order", cause);
      }
    },
  );

  server.registerTool(
    "update_order",
    {
      title: "Siparişi düzenle",
      description:
        "Bekleyen veya onaylı bir siparişi düzenler. Tüm alanlar (kalemler dahil) yeniden yazılır ve güncel fiyatlarla yeniden fiyatlanır: önce get_order ile mevcut siparişi oku, değiştirmediğin alanları aynen gönder.",
      inputSchema: updateOrderInput,
      annotations: { ...WRITE, title: "Siparişi düzenle" },
    },
    async ({ order_id, ...body }) => {
      try {
        const result = await updateOrderAction(order_id, body);
        return toolFromResult("update_order", result, { orderId: order_id });
      } catch (cause) {
        return toolError("update_order", cause, { orderId: order_id });
      }
    },
  );

  server.registerTool(
    "delete_orders",
    {
      title: "Siparişleri sil",
      description:
        "Siparişleri KALICI olarak siler (en fazla 100). Geri alınamaz; iptal etmek istiyorsan transition_order kullan. Silinecek siparişleri kullanıcıya göstermeden çağırma.",
      inputSchema: deleteOrdersInput,
      annotations: { ...DESTRUCTIVE, title: "Siparişleri sil" },
    },
    async ({ order_ids }) => {
      try {
        return toolFromResult("delete_orders", await bulkDeleteOrdersAction(order_ids));
      } catch (cause) {
        return toolError("delete_orders", cause);
      }
    },
  );

  server.registerTool(
    "get_order_payments",
    {
      title: "Sipariş ödemeleri",
      description: "Bir siparişe kayıtlı ödemeleri (tutar kuruş, kanal, tarih, not) getirir.",
      inputSchema: getOrderPaymentsInput,
      annotations: { ...READ_ONLY, title: "Sipariş ödemeleri" },
    },
    async ({ order_id }) => {
      try {
        return toolJson(await getOrderPaymentsAction(order_id));
      } catch (cause) {
        return toolError("get_order_payments", cause, { orderId: order_id });
      }
    },
  );

  server.registerTool(
    "add_order_payment",
    {
      title: "Ödeme kaydı ekle",
      description:
        "Bir siparişe ödeme kaydı ekler (tutar kuruş; negatif = iade/düzeltme). Sipariş ödeme durumu otomatik güncellenir.",
      inputSchema: addOrderPaymentInput,
      annotations: { ...WRITE, title: "Ödeme kaydı ekle" },
    },
    async (input) => {
      try {
        return toolFromState(await addPaymentAction(input));
      } catch (cause) {
        return toolError("add_order_payment", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "mark_order_fully_paid",
    {
      title: "Siparişi tam ödendi işaretle",
      description: "Kalan tutar kadar ödeme kaydı ekleyerek siparişi tamamen ödenmiş yapar.",
      inputSchema: markOrderFullyPaidInput,
      annotations: { ...WRITE, title: "Siparişi tam ödendi işaretle" },
    },
    async (input) => {
      try {
        return toolFromState(
          await markOrderFullyPaidAction({
            order_id: input.order_id,
            ...(input.channel ? { channel: input.channel } : {}),
          }),
        );
      } catch (cause) {
        return toolError("mark_order_fully_paid", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "delete_order_payment",
    {
      title: "Ödeme kaydını sil",
      description:
        "Bir ödeme kaydını siler (yanlış girilen tahsilat için). Geri alınamaz; sipariş ödeme durumu yeniden hesaplanır.",
      inputSchema: deleteOrderPaymentInput,
      annotations: { ...DESTRUCTIVE, title: "Ödeme kaydını sil" },
    },
    async ({ order_id, payment_id }) => {
      try {
        return toolFromState(await deletePaymentAction({ order_id, payment_id }));
      } catch (cause) {
        return toolError("delete_order_payment", cause, { orderId: order_id });
      }
    },
  );
}
