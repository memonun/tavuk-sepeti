/**
 * Finance tools: expenses (giderler) and market-stall sales (pazar satışı) —
 * thin adapters over the panel's finance Server Actions and list queries.
 * Money is kuruş. Lookup tools (categories, market locations) exist so the model
 * can resolve the ids the write tools need instead of guessing them.
 */
import "server-only";

import {
  createExpenseInput,
  createMarketSaleInput,
  deleteExpenseInput,
  deleteMarketSaleInput,
  listExpensesInput,
  listMarketSalesInput,
  markExpensePaidInput,
  updateExpenseInput,
  updateMarketSaleInput,
} from "@/features/mcp/domain/mcp-write-inputs";
import {
  createExpenseAction,
  deleteExpenseAction,
  markExpensePaidAction,
  updateExpenseAction,
} from "@/features/finance/application/expense-actions";
import { listExpenseCategoriesFlat } from "@/features/finance/application/list-expense-categories";
import { listExpenses } from "@/features/finance/application/list-expenses";
import { listMarketLocations } from "@/features/finance/application/list-market-locations";
import { getMarketSaleById, listMarketSales } from "@/features/finance/application/list-market-sales";
import {
  createMarketSaleAction,
  deleteMarketSaleAction,
  updateMarketSaleAction,
} from "@/features/finance/application/market-sale-actions";

import { DESTRUCTIVE, READ_ONLY, WRITE } from "./annotations";
import { toolError, toolFromResult, toolJson } from "../tool-result";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerFinanceTools(server: McpServer): void {
  // ---- lookups / reads ----------------------------------------------------

  server.registerTool(
    "list_expense_categories",
    {
      title: "Gider kategorileri",
      description: "Gider kategorilerini (id, ad, üst kategori) listeler. create_expense için category_id buradan alınır.",
      annotations: { ...READ_ONLY, title: "Gider kategorileri" },
    },
    async () => {
      const result = await listExpenseCategoriesFlat();
      return result.ok
        ? toolJson(result.value.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id, active: c.active })))
        : toolError("list_expense_categories", result.error);
    },
  );

  server.registerTool(
    "list_expenses",
    {
      title: "Giderleri listele",
      description: "Giderleri kategori, ödeme durumu, tarih aralığı veya aramaya göre listeler. Sayfalıdır; tutarlar kuruştur.",
      inputSchema: listExpensesInput,
      annotations: { ...READ_ONLY, title: "Giderleri listele" },
    },
    async (input) => {
      const result = await listExpenses(input);
      return result.ok ? toolJson(result.value) : toolError("list_expenses", result.error);
    },
  );

  server.registerTool(
    "list_market_locations",
    {
      title: "Pazar lokasyonları",
      description: "Pazar/tezgah lokasyonlarını (id, ad) listeler. create_market_sale için location_id buradan alınır.",
      annotations: { ...READ_ONLY, title: "Pazar lokasyonları" },
    },
    async () => {
      const result = await listMarketLocations();
      return result.ok ? toolJson(result.value) : toolError("list_market_locations", result.error);
    },
  );

  server.registerTool(
    "list_market_sales",
    {
      title: "Pazar satışlarını listele",
      description: "Pazar satışlarını lokasyon ve tarih aralığına göre listeler (satılan ürünlerle). Sayfalıdır; tutarlar kuruştur.",
      inputSchema: listMarketSalesInput,
      annotations: { ...READ_ONLY, title: "Pazar satışlarını listele" },
    },
    async (input) => {
      const result = await listMarketSales(input);
      return result.ok ? toolJson(result.value) : toolError("list_market_sales", result.error);
    },
  );

  // ---- expenses -----------------------------------------------------------

  server.registerTool(
    "create_expense",
    {
      title: "Gider ekle",
      description: "Yeni gider kaydı ekler (tutar kuruş). Kategori id'sini list_expense_categories ile bul. quantity ve unit birlikte verilmeli.",
      inputSchema: createExpenseInput,
      annotations: { ...WRITE, title: "Gider ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_expense", await createExpenseAction(input));
      } catch (cause) {
        return toolError("create_expense", cause);
      }
    },
  );

  server.registerTool(
    "update_expense",
    {
      title: "Gideri düzenle",
      description:
        "Gider kaydını günceller. Tüm alanlar yeniden yazılır (boş bırakılan açıklama/tedarikçi/not temizlenir): önce list_expenses ile mevcut kaydı oku, değişmeyenleri aynen gönder.",
      inputSchema: updateExpenseInput,
      annotations: { ...WRITE, title: "Gideri düzenle" },
    },
    async (input) => {
      try {
        return toolFromResult("update_expense", await updateExpenseAction(input), { expenseId: input.id });
      } catch (cause) {
        return toolError("update_expense", cause, { expenseId: input.id });
      }
    },
  );

  server.registerTool(
    "mark_expense_paid",
    {
      title: "Gideri ödendi işaretle",
      description: "Bekleyen bir gideri ödendi yapar.",
      inputSchema: markExpensePaidInput,
      annotations: { ...WRITE, title: "Gideri ödendi işaretle" },
    },
    async (input) => {
      try {
        return toolFromResult("mark_expense_paid", await markExpensePaidAction(input), { expenseId: input.id });
      } catch (cause) {
        return toolError("mark_expense_paid", cause, { expenseId: input.id });
      }
    },
  );

  server.registerTool(
    "delete_expense",
    {
      title: "Gideri sil",
      description: "Gider kaydını KALICI olarak siler. Geri alınamaz.",
      inputSchema: deleteExpenseInput,
      annotations: { ...DESTRUCTIVE, title: "Gideri sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_expense", await deleteExpenseAction({ id }), { expenseId: id });
      } catch (cause) {
        return toolError("delete_expense", cause, { expenseId: id });
      }
    },
  );

  // ---- market sales -------------------------------------------------------

  server.registerTool(
    "create_market_sale",
    {
      title: "Pazar satışı ekle",
      description:
        "Pazar/tezgah satışı kaydeder: günün toplamı (kuruş) ve isteğe bağlı satılan ürünler. Lokasyon id'sini list_market_locations, ürün anahtarlarını list_products ile bul.",
      inputSchema: createMarketSaleInput,
      annotations: { ...WRITE, title: "Pazar satışı ekle" },
    },
    async (input) => {
      try {
        return toolFromResult("create_market_sale", await createMarketSaleAction(input));
      } catch (cause) {
        return toolError("create_market_sale", cause);
      }
    },
  );

  server.registerTool(
    "update_market_sale",
    {
      title: "Pazar satışını düzenle",
      description:
        "Pazar satışını günceller. Sadece gönderdiğin alanlar değişir. items verirsen mevcut kalemlerin tamamı değişir; vermezsen kalemler korunur.",
      inputSchema: updateMarketSaleInput,
      annotations: { ...WRITE, title: "Pazar satışını düzenle" },
    },
    async ({ id, ...fields }) => {
      try {
        // The action replaces the whole sale, so start from the stored one.
        const existing = await getMarketSaleById(id);
        if (!existing.ok) return toolError("update_market_sale", existing.error, { saleId: id });
        const current = existing.value;
        const result = await updateMarketSaleAction({
          id,
          location_id: fields.location_id ?? current.location_id,
          sale_date: fields.sale_date ?? current.sale_date,
          total_amount_minor: fields.total_amount_minor ?? current.total_amount_minor,
          payment_method: fields.payment_method ?? current.payment_method,
          note: fields.note !== undefined ? fields.note : current.note,
          items:
            fields.items ??
            current.items.map((i) => ({
              product_key: i.product_key,
              quantity: i.quantity,
              unit_price_minor: i.unit_price_minor,
            })),
        });
        return toolFromResult("update_market_sale", result, { saleId: id });
      } catch (cause) {
        return toolError("update_market_sale", cause, { saleId: id });
      }
    },
  );

  server.registerTool(
    "delete_market_sale",
    {
      title: "Pazar satışını sil",
      description: "Pazar satışı kaydını KALICI olarak siler. Geri alınamaz.",
      inputSchema: deleteMarketSaleInput,
      annotations: { ...DESTRUCTIVE, title: "Pazar satışını sil" },
    },
    async ({ id }) => {
      try {
        return toolFromResult("delete_market_sale", await deleteMarketSaleAction({ id }), { saleId: id });
      } catch (cause) {
        return toolError("delete_market_sale", cause, { saleId: id });
      }
    },
  );
}
