/**
 * Customer recurring-order templates (tekrarlayan siparişler) — thin adapters over
 * the panel's recurring Server Actions. Activating a template that came from the
 * storefront (`customer_web`, awaiting review) is how staff APPROVE it, exactly as
 * in the panel.
 */
import "server-only";

import {
  createRecurringTemplateAction,
  deleteRecurringTemplateAction,
  getRecurringTemplateAction,
  listAllRecurringTemplatesAction,
  listCustomerRecurringTemplatesAction,
  setRecurringTemplateActiveAction,
  updateRecurringTemplateAction,
} from "@/features/recurring/application/recurring-template-actions";
import {
  createRecurringOrderInput,
  deleteRecurringOrderInput,
  getRecurringOrderInput,
  listRecurringOrdersInput,
  setRecurringOrderActiveInput,
  updateRecurringOrderInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { mergeRecurringOrder } from "./merge-recurring-order";
import { toolError, toolFromResult } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerRecurringOrderTools(server: McpServer): void {
  server.registerTool(
    "list_recurring_orders",
    {
      title: "Tekrarlayan siparişleri listele",
      description:
        "Müşterilerin tekrarlayan sipariş şablonlarını listeler (sıklık, gün, kalemler, aktif mi, kaynak, onay durumu). customer_id verilirse sadece o müşterinin. Mağazadan gelen ve henüz onaylanmamış talepler de burada görünür.",
      inputSchema: listRecurringOrdersInput,
      annotations: { ...READ_ONLY, title: "Tekrarlayan siparişleri listele" },
    },
    async ({ customer_id }) => {
      try {
        const result = customer_id
          ? await listCustomerRecurringTemplatesAction(customer_id)
          : await listAllRecurringTemplatesAction();
        return toolFromResult("list_recurring_orders", result);
      } catch (cause) {
        return toolError("list_recurring_orders", cause);
      }
    },
  );

  server.registerTool(
    "get_recurring_order",
    {
      title: "Tekrarlayan sipariş detayı",
      description: "Tek bir tekrarlayan sipariş şablonunu getirir.",
      inputSchema: getRecurringOrderInput,
      annotations: { ...READ_ONLY, title: "Tekrarlayan sipariş detayı" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("get_recurring_order", await getRecurringTemplateAction(id), { templateId: id });
      } catch (cause) {
        return toolError("get_recurring_order", cause, { templateId: id });
      }
    },
  );

  server.registerTool(
    "create_recurring_order",
    {
      title: "Tekrarlayan sipariş ekle",
      description:
        "Müşteri için tekrarlayan sipariş şablonu oluşturur. weekly/biweekly için day_of_week (0=Pazar … 6=Cumartesi), monthly için day_of_month (1-31) zorunlu. Aktif şablonlar vadesi geldikçe otomatik sipariş üretir; müşterinin birincil adresi olmalı.",
      inputSchema: createRecurringOrderInput,
      annotations: { ...WRITE, title: "Tekrarlayan sipariş ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_recurring_order", await createRecurringTemplateAction(input));
      } catch (cause) {
        return toolError("create_recurring_order", cause);
      }
    },
  );

  server.registerTool(
    "update_recurring_order",
    {
      title: "Tekrarlayan siparişi düzenle",
      description:
        "Şablonu günceller. Sadece gönderdiğin alanlar değişir; aktif/duraklatılmış durumu korunur. items verirsen kalemlerin tamamı değişir. Sıklığı değiştirirsen yeni sıklığa uygun günü ver.",
      inputSchema: updateRecurringOrderInput,
      annotations: { ...WRITE, title: "Tekrarlayan siparişi düzenle" },
    },
    async ({ id, ...fields }) => {
      try {
        const current = await getRecurringTemplateAction(id);
        if (!current.ok) return toolError("update_recurring_order", current.error, { templateId: id });
        return toolFromResult(
          "update_recurring_order",
          await updateRecurringTemplateAction(id, mergeRecurringOrder(current.value, fields)),
          { templateId: id },
        );
      } catch (cause) {
        return toolError("update_recurring_order", cause, { templateId: id });
      }
    },
  );

  server.registerTool(
    "set_recurring_order_active",
    {
      title: "Tekrarlayan siparişi aktif / duraklat",
      description:
        "Şablonu aktif eder veya duraklatır. Mağazadan gelen, onay bekleyen bir talebi aktif etmek onu ONAYLAMAK demektir. Devam ettirilince sonraki üretim bugünden hesaplanır.",
      inputSchema: setRecurringOrderActiveInput,
      annotations: { ...WRITE, title: "Tekrarlayan siparişi aktif / duraklat" },
    },
    async ({ id, active }) => {
      try {
        return toolFromResult("set_recurring_order_active", await setRecurringTemplateActiveAction(id, active), {
          templateId: id,
        });
      } catch (cause) {
        return toolError("set_recurring_order_active", cause, { templateId: id });
      }
    },
  );

  server.registerTool(
    "delete_recurring_order",
    {
      title: "Tekrarlayan siparişi sil",
      description: "Şablonu KALICI olarak siler (daha önce üretilmiş siparişler kalır). Geri alınamaz; geçici durdurmak için set_recurring_order_active kullan.",
      inputSchema: deleteRecurringOrderInput,
      annotations: { ...DESTRUCTIVE, title: "Tekrarlayan siparişi sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_recurring_order", await deleteRecurringTemplateAction(id), {
          templateId: id,
        });
      } catch (cause) {
        return toolError("delete_recurring_order", cause, { templateId: id });
      }
    },
  );
}
