/**
 * Finance configuration tools: recurring expense templates (rutin giderler),
 * expense categories and market locations — thin adapters over the panel's
 * Server Actions. These change how FUTURE expenses/sales are recorded, so the
 * partial-update tools overlay the given fields on the stored record rather than
 * blanking whatever the model left out.
 */
import "server-only";

import {
  createExpenseCategoryAction,
  setExpenseCategoryActiveAction,
  updateExpenseCategoryAction,
} from "@/features/finance/application/expense-category-actions";
import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import {
  listRecurringExpenseTemplates,
  listRecurringExpenseTemplatesFull,
} from "@/features/finance/application/list-recurring-expense-templates";
import {
  createMarketLocationAction,
  deleteMarketLocationAction,
  setMarketLocationActiveAction,
} from "@/features/finance/application/market-location-actions";
import {
  createRecurringExpenseTemplateAction,
  deleteRecurringExpenseTemplateAction,
  setRecurringExpenseTemplateActiveAction,
  updateRecurringExpenseTemplateAction,
} from "@/features/finance/application/recurring-expense-template-actions";
import {
  createExpenseCategoryInput,
  createMarketLocationInput,
  createRecurringExpenseTemplateInput,
  deleteMarketLocationInput,
  deleteRecurringExpenseTemplateInput,
  setExpenseCategoryActiveInput,
  setMarketLocationActiveInput,
  setRecurringExpenseTemplateActiveInput,
  updateExpenseCategoryInput,
  updateRecurringExpenseTemplateInput,
} from "@/features/mcp/domain/mcp-write-inputs";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { mergeRecurringTemplate } from "./merge-recurring-template";
import { toolError, toolFromResult, toolJson, toolRefusal } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerFinanceAdminTools(server: McpServer): void {
  // ---- recurring expense templates ---------------------------------------

  server.registerTool(
    "list_recurring_expense_templates",
    {
      title: "Rutin giderleri listele",
      description: "Rutin gider şablonlarını (ad, kategori, tutar, sıklık, sonraki çalışma, aktif mi) listeler. Tutarlar kuruştur.",
      annotations: { ...READ_ONLY, title: "Rutin giderleri listele" },
    },
    async () => {
      const result = await listRecurringExpenseTemplates();
      return result.ok ? toolJson(result.value) : toolError("list_recurring_expense_templates", result.error);
    },
  );

  server.registerTool(
    "create_recurring_expense_template",
    {
      title: "Rutin gider ekle",
      description:
        "Düzenli tekrarlayan bir gider şablonu oluşturur (kira, fatura, abonelik…). Sıklık weekly ise day_of_week (0=Pazar … 6=Cumartesi), diğerlerinde day_of_month (1-31) zorunludur. Şablon, vadesi gelen giderleri otomatik üretir.",
      inputSchema: createRecurringExpenseTemplateInput,
      annotations: { ...WRITE, title: "Rutin gider ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_recurring_expense_template", await createRecurringExpenseTemplateAction(input));
      } catch (cause) {
        return toolError("create_recurring_expense_template", cause);
      }
    },
  );

  server.registerTool(
    "update_recurring_expense_template",
    {
      title: "Rutin gideri düzenle",
      description:
        "Rutin gider şablonunu günceller. Sadece gönderdiğin alanlar değişir. Sıklığı değiştirirsen yeni sıklığa uygun günü ver (weekly → day_of_week, diğerleri → day_of_month); eski sıklığın günü otomatik temizlenir. Yalnızca gelecek üretimleri etkiler.",
      inputSchema: updateRecurringExpenseTemplateInput,
      annotations: { ...WRITE, title: "Rutin gideri düzenle" },
    },
    async ({ id, ...fields }) => {
      try {
        const all = await listRecurringExpenseTemplatesFull();
        if (!all.ok) return toolError("update_recurring_expense_template", all.error, { templateId: id });
        const current = all.value.find((t) => t.id === id);
        if (!current) return toolRefusal("Rutin gider bulunamadı.");
        return toolFromResult(
          "update_recurring_expense_template",
          await updateRecurringExpenseTemplateAction(mergeRecurringTemplate(current, id, fields)),
          { templateId: id },
        );
      } catch (cause) {
        return toolError("update_recurring_expense_template", cause, { templateId: id });
      }
    },
  );

  server.registerTool(
    "set_recurring_expense_template_active",
    {
      title: "Rutin gideri duraklat / devam ettir",
      description:
        "Rutin gider şablonunu duraklatır veya devam ettirir. Devam ettirilince sonraki çalışma bugünden hesaplanır; duraklatma süresince kaçan dönemler geriye dönük üretilmez.",
      inputSchema: setRecurringExpenseTemplateActiveInput,
      annotations: { ...WRITE, title: "Rutin gideri duraklat / devam ettir" },
    },
    async (input) => {
      try {
        return toolFromResult(
          "set_recurring_expense_template_active",
          await setRecurringExpenseTemplateActiveAction(input),
          { templateId: input.id },
        );
      } catch (cause) {
        return toolError("set_recurring_expense_template_active", cause, { templateId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_recurring_expense_template",
    {
      title: "Rutin gideri sil",
      description:
        "Rutin gider şablonunu KALICI olarak siler. Geri alınamaz; geçici durdurmak için set_recurring_expense_template_active kullan.",
      inputSchema: deleteRecurringExpenseTemplateInput,
      annotations: { ...DESTRUCTIVE, title: "Rutin gideri sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult(
          "delete_recurring_expense_template",
          await deleteRecurringExpenseTemplateAction({ id }),
          { templateId: id },
        );
      } catch (cause) {
        return toolError("delete_recurring_expense_template", cause, { templateId: id });
      }
    },
  );

  // ---- expense categories -------------------------------------------------

  server.registerTool(
    "create_expense_category",
    {
      title: "Gider kategorisi ekle",
      description: "Yeni gider kategorisi ekler. parent_id boşsa ana kategori olur; doluysa bir ana kategorinin altına (en fazla iki seviye).",
      inputSchema: createExpenseCategoryInput,
      annotations: { ...WRITE, title: "Gider kategorisi ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_expense_category", await createExpenseCategoryAction(input));
      } catch (cause) {
        return toolError("create_expense_category", cause);
      }
    },
  );

  server.registerTool(
    "update_expense_category",
    {
      title: "Gider kategorisini düzenle",
      description: "Kategorinin adını, üst kategorisini veya sırasını değiştirir. Sadece gönderdiğin alanlar değişir.",
      inputSchema: updateExpenseCategoryInput,
      annotations: { ...WRITE, title: "Gider kategorisini düzenle" },
    },
    async ({ id, ...fields }) => {
      try {
        const all = await listExpenseCategoriesFlat();
        if (!all.ok) return toolError("update_expense_category", all.error, { categoryId: id });
        const current = all.value.find((c) => c.id === id);
        if (!current) return toolRefusal("Kategori bulunamadı.");
        return toolFromResult(
          "update_expense_category",
          await updateExpenseCategoryAction({
            id,
            name: fields.name ?? current.name,
            parent_id: fields.parent_id !== undefined ? fields.parent_id : current.parent_id,
            sort_order: fields.sort_order ?? current.sort_order,
          }),
          { categoryId: id },
        );
      } catch (cause) {
        return toolError("update_expense_category", cause, { categoryId: id });
      }
    },
  );

  server.registerTool(
    "set_expense_category_active",
    {
      title: "Gider kategorisini aktif / pasif yap",
      description: "Kategoriyi pasife alır (yeni giderlerde seçilemez, eski kayıtlar korunur) veya geri açar.",
      inputSchema: setExpenseCategoryActiveInput,
      annotations: { ...WRITE, title: "Gider kategorisini aktif / pasif yap" },
    },
    async (input) => {
      try {
        return toolFromResult("set_expense_category_active", await setExpenseCategoryActiveAction(input), {
          categoryId: input.id,
        });
      } catch (cause) {
        return toolError("set_expense_category_active", cause, { categoryId: input.id });
      }
    },
  );

  // ---- market locations ---------------------------------------------------

  server.registerTool(
    "create_market_location",
    {
      title: "Pazar lokasyonu ekle",
      description: "Yeni pazar/tezgah lokasyonu ekler.",
      inputSchema: createMarketLocationInput,
      annotations: { ...WRITE, title: "Pazar lokasyonu ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_market_location", await createMarketLocationAction(input));
      } catch (cause) {
        return toolError("create_market_location", cause);
      }
    },
  );

  server.registerTool(
    "set_market_location_active",
    {
      title: "Pazar lokasyonunu aktif / pasif yap",
      description: "Lokasyonu pasife alır (yeni satışlarda seçilemez, eski satışlar korunur) veya geri açar.",
      inputSchema: setMarketLocationActiveInput,
      annotations: { ...WRITE, title: "Pazar lokasyonunu aktif / pasif yap" },
    },
    async (input) => {
      try {
        return toolFromResult("set_market_location_active", await setMarketLocationActiveAction(input), {
          locationId: input.id,
        });
      } catch (cause) {
        return toolError("set_market_location_active", cause, { locationId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_market_location",
    {
      title: "Pazar lokasyonunu sil",
      description:
        "Lokasyonu KALICI olarak siler. Satışı olan bir lokasyon silinemeyebilir; bu durumda set_market_location_active ile pasife al. Geri alınamaz.",
      inputSchema: deleteMarketLocationInput,
      annotations: { ...DESTRUCTIVE, title: "Pazar lokasyonunu sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_market_location", await deleteMarketLocationAction({ id }), {
          locationId: id,
        });
      } catch (cause) {
        return toolError("delete_market_location", cause, { locationId: id });
      }
    },
  );
}
