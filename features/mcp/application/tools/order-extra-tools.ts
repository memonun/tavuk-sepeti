/**
 * Order extras: delivery completion/revert, cargo tracking, gifts, bulk create,
 * product display order and a customer's special prices. Thin adapters over the
 * panel's own Server Actions.
 *
 * Customer special prices have no editor of their own in the panel: a unit price
 * typed on an order line is what gets remembered for that customer (see
 * `reconcileCustomerProductPrices`). `create_order` / `update_order` /
 * `create_orders_bulk` therefore already set them; `get_customer_prices` reads them.
 */
import "server-only";

import {
  getCustomerProductPricesAction,
} from "@/features/customers/application/customer-price-actions";
import { completeDeliveryAction } from "@/features/orders/application/complete-delivery";
import { createOrdersBulkAction } from "@/features/orders/application/create-orders-bulk";
import { getOrderById } from "@/features/orders/application/get-order";
import { getOrderGifts } from "@/features/orders/application/get-order-gifts";
import { addOrderGiftAction, removeOrderGiftAction } from "@/features/orders/application/order-gift-actions";
import { revertDeliveryAction } from "@/features/orders/application/revert-delivery";
import { updateOrderCargoInfoAction } from "@/features/orders/application/update-order-cargo-info";
import { updateProductSortOrderAction } from "@/features/products/application/set-product-sort-order";
import {
  addOrderGiftInput,
  completeDeliveryInput,
  createOrdersBulkInput,
  getCustomerPricesInput,
  getOrderGiftsInput,
  removeOrderGiftInput,
  revertDeliveryInput,
  setProductSortOrderInput,
  updateOrderCargoInfoInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult, toolFromState, toolJson } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerOrderExtraTools(server: McpServer): void {
  server.registerTool(
    "complete_delivery",
    {
      title: "Teslim edildi işaretle",
      description:
        "Siparişi teslim edildi yapar. Sipariş hâlâ bekleyen (pending) ise önce onaylanır, sonra teslim edilir (paneldeki 'Teslim Edildi' ile aynı). Zaten teslim edilmişse işlem yapmaz, başarılı döner.",
      inputSchema: completeDeliveryInput,
      annotations: { ...WRITE, title: "Teslim edildi işaretle" },
    },
    async (input) => {
      try {
        return toolFromState(await completeDeliveryAction(input));
      } catch (cause) {
        return toolError("complete_delivery", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "revert_delivery",
    {
      title: "Teslimatı geri al",
      description: "Yanlışlıkla 'teslim edildi' yapılan siparişi onaylı (confirmed) duruma geri alır. Sadece delivered → confirmed.",
      inputSchema: revertDeliveryInput,
      annotations: { ...DESTRUCTIVE, title: "Teslimatı geri al" },
    },
    async (input) => {
      try {
        return toolFromState(await revertDeliveryAction(input));
      } catch (cause) {
        return toolError("revert_delivery", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "update_order_cargo_info",
    {
      title: "Kargo takip bilgisini güncelle",
      description:
        "Kargo siparişinin firma, takip numarası ve takip linkini günceller. Sipariş durumunu değiştirmez. Sadece gönderdiğin alanlar değişir; temizlemek için null/boş gönder.",
      inputSchema: updateOrderCargoInfoInput,
      annotations: { ...WRITE, title: "Kargo takip bilgisini güncelle" },
    },
    async (input) => {
      try {
        // The action replaces all three fields, so start from the stored ones.
        const existing = await getOrderById(input.order_id);
        if (!existing.ok) return toolError("update_order_cargo_info", existing.error, { orderId: input.order_id });
        return toolFromState(
          await updateOrderCargoInfoAction({
            order_id: input.order_id,
            cargo_carrier: input.cargo_carrier !== undefined ? input.cargo_carrier : existing.value.cargo_carrier,
            cargo_tracking_number:
              input.cargo_tracking_number !== undefined
                ? input.cargo_tracking_number
                : existing.value.cargo_tracking_number,
            cargo_tracking_url:
              input.cargo_tracking_url !== undefined ? input.cargo_tracking_url : existing.value.cargo_tracking_url,
          }),
        );
      } catch (cause) {
        return toolError("update_order_cargo_info", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "get_order_gifts",
    {
      title: "Sipariş hediyeleri",
      description: "Bir siparişe eklenmiş hediye ürünleri listeler.",
      inputSchema: getOrderGiftsInput,
      annotations: { ...READ_ONLY, title: "Sipariş hediyeleri" },
    },
    async ({ order_id }) => {
      const result = await getOrderGifts(order_id);
      return result.ok ? toolJson(result.value) : toolError("get_order_gifts", result.error, { orderId: order_id });
    },
  );

  server.registerTool(
    "add_order_gift",
    {
      title: "Siparişe hediye ekle",
      description: "Siparişe hediye ürün ekler. Sipariş tutarını, kalemlerini veya durumunu değiştirmez.",
      inputSchema: addOrderGiftInput,
      annotations: { ...WRITE, title: "Siparişe hediye ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("add_order_gift", await addOrderGiftAction(input), { orderId: input.order_id });
      } catch (cause) {
        return toolError("add_order_gift", cause, { orderId: input.order_id });
      }
    },
  );

  server.registerTool(
    "remove_order_gift",
    {
      title: "Hediyeyi kaldır",
      description: "Siparişten bir hediye kaydını siler. Geri alınamaz.",
      inputSchema: removeOrderGiftInput,
      annotations: { ...DESTRUCTIVE, title: "Hediyeyi kaldır" },
    },
    async ({ order_id, gift_id }) => {
      try {
        return toolFromResult("remove_order_gift", await removeOrderGiftAction(gift_id, order_id), {
          orderId: order_id,
        });
      } catch (cause) {
        return toolError("remove_order_gift", cause, { orderId: order_id });
      }
    },
  );

  server.registerTool(
    "create_orders_bulk",
    {
      title: "Toplu sipariş oluştur",
      description:
        "Aynı tarih/ödeme yöntemi/ücretle birçok müşteri için (en fazla 250) tek seferde sipariş oluşturur. Fiyatlar katalog/kademe veya müşteriye özel fiyattan dondurulur. Birincil adresi olmayan müşteri varsa HİÇBİR sipariş oluşturulmaz ve o müşteriler listelenir. Kullanıcıya özetini göstermeden çağırma.",
      inputSchema: createOrdersBulkInput,
      annotations: { ...WRITE, title: "Toplu sipariş oluştur" },
    },
    async (input) => {
      try {
        const fd = new FormData();
        fd.set("batch_json", JSON.stringify(input));
        const state = await createOrdersBulkAction({ status: "idle" }, fd);
        if (state.status === "missing_address") {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  message: "Bazı müşterilerin birincil adresi yok; hiçbir sipariş oluşturulmadı.",
                  customer_ids_without_address: state.customerIds,
                }),
              },
            ],
          };
        }
        return toolFromState(state);
      } catch (cause) {
        return toolError("create_orders_bulk", cause);
      }
    },
  );

  server.registerTool(
    "set_product_sort_order",
    {
      title: "Ürün sırasını değiştir",
      description: "Ürünün anasayfa ve yönetim listesindeki sırasını ayarlar (düşük değer önce gösterilir).",
      inputSchema: setProductSortOrderInput,
      annotations: { ...WRITE, title: "Ürün sırasını değiştir" },
    },
    async (input) => {
      try {
        return toolFromResult("set_product_sort_order", await updateProductSortOrderAction(input), {
          productKey: input.product_key,
        });
      } catch (cause) {
        return toolError("set_product_sort_order", cause, { productKey: input.product_key });
      }
    },
  );

  server.registerTool(
    "get_customer_prices",
    {
      title: "Müşteriye özel fiyatlar",
      description:
        "Müşteriye kayıtlı özel birim fiyatları (ürün anahtarı → kuruş) getirir. Özel fiyat, siparişte o kaleme yazılan fiyattan hatırlanır; ayrı düzenleme ekranı yoktur.",
      inputSchema: getCustomerPricesInput,
      annotations: { ...READ_ONLY, title: "Müşteriye özel fiyatlar" },
    },
    async ({ customer_id }) => {
      try {
        return toolJson(await getCustomerProductPricesAction(customer_id));
      } catch (cause) {
        return toolError("get_customer_prices", cause, { customerId: customer_id });
      }
    },
  );
}
