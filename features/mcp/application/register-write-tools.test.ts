/**
 * Each write tool must hand the panel's own Server Action exactly what the
 * panel would send. The actions are mocked, so this pins the adapter contract:
 * argument shape, the read-before-write merges, and error/validation relaying.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const m = {
  createOrderAction: vi.fn(),
  updateOrderAction: vi.fn(),
  bulkDeleteOrdersAction: vi.fn(),
  addPaymentAction: vi.fn(),
  deletePaymentAction: vi.fn(),
  markOrderFullyPaidAction: vi.fn(),
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
  bulkDeleteCustomersAction: vi.fn(),
  getCustomerById: vi.fn(),
  createProductAction: vi.fn(),
  updateProductMetadataAction: vi.fn(),
  saveProductPricingAction: vi.fn(),
  deleteProductAction: vi.fn(),
  listAllProducts: vi.fn(),
  createReminderAction: vi.fn(),
  updateReminderAction: vi.fn(),
  setReminderCompletedAction: vi.fn(),
  deleteReminderAction: vi.fn(),
  createEventAction: vi.fn(),
  deleteEventAction: vi.fn(),
  deleteEventOccurrenceAction: vi.fn(),
  createExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  getMarketSaleById: vi.fn(),
  updateMarketSaleAction: vi.fn(),
  createMarketSaleAction: vi.fn(),
  deleteMarketSaleAction: vi.fn(),
  fetchRemoteImage: vi.fn(),
  uploadProductImageAction: vi.fn(),
  removeProductImageAction: vi.fn(),
  listRecurringExpenseTemplatesFull: vi.fn(),
  updateRecurringExpenseTemplateAction: vi.fn(),
  createRecurringExpenseTemplateAction: vi.fn(),
  deleteRecurringExpenseTemplateAction: vi.fn(),
  listExpenseCategoriesFlat: vi.fn(),
  createExpenseCategoryAction: vi.fn(),
  updateExpenseCategoryAction: vi.fn(),
  deleteMarketLocationAction: vi.fn(),
  getCustomerProductPricesAction: vi.fn(),
  completeDeliveryAction: vi.fn(),
  createOrdersBulkAction: vi.fn(),
  addOrderGiftAction: vi.fn(),
  removeOrderGiftAction: vi.fn(),
  updateOrderCargoInfoAction: vi.fn(),
  updateRecurringTemplateAction: vi.fn(),
  deleteRecurringTemplateAction: vi.fn(),
  getRecurringTemplateAction: vi.fn(),
  getNotificationFeed: vi.fn(),
  markNotificationReadAction: vi.fn(),
  getStorefrontSettings: vi.fn(),
  updateStorefrontSettingsAction: vi.fn(),
  getOrderById: vi.fn(),
};

vi.mock("@/features/orders/application/create-order", () => ({ createOrderAction: (...a: unknown[]) => m.createOrderAction(...a) }));
vi.mock("@/features/orders/application/update-order", () => ({ updateOrderAction: (...a: unknown[]) => m.updateOrderAction(...a) }));
vi.mock("@/features/orders/application/bulk-delete-orders", () => ({ bulkDeleteOrdersAction: (...a: unknown[]) => m.bulkDeleteOrdersAction(...a) }));
vi.mock("@/features/orders/application/payments", () => ({
  addPaymentAction: (...a: unknown[]) => m.addPaymentAction(...a),
  deletePaymentAction: (...a: unknown[]) => m.deletePaymentAction(...a),
  markOrderFullyPaidAction: (...a: unknown[]) => m.markOrderFullyPaidAction(...a),
  getOrderPaymentsAction: vi.fn(),
}));
vi.mock("@/features/customers/application/create-customer", () => ({ createCustomerAction: (...a: unknown[]) => m.createCustomerAction(...a) }));
vi.mock("@/features/customers/application/update-customer", () => ({ updateCustomerAction: (...a: unknown[]) => m.updateCustomerAction(...a) }));
vi.mock("@/features/customers/application/bulk-delete-customers", () => ({ bulkDeleteCustomersAction: (...a: unknown[]) => m.bulkDeleteCustomersAction(...a) }));
vi.mock("@/features/customers/application/get-customer", () => ({ getCustomerById: (...a: unknown[]) => m.getCustomerById(...a) }));
vi.mock("@/features/customers/application/list-customers", () => ({ listCustomers: vi.fn() }));
vi.mock("@/features/products/application/create-product", () => ({ createProductAction: (...a: unknown[]) => m.createProductAction(...a) }));
vi.mock("@/features/products/application/update-product-metadata", () => ({ updateProductMetadataAction: (...a: unknown[]) => m.updateProductMetadataAction(...a) }));
vi.mock("@/features/products/application/save-product-pricing", () => ({ saveProductPricingAction: (...a: unknown[]) => m.saveProductPricingAction(...a) }));
vi.mock("@/features/products/application/delete-product", () => ({ deleteProductAction: (...a: unknown[]) => m.deleteProductAction(...a) }));
vi.mock("@/features/products/application/set-product-active", () => ({ setProductActiveAction: vi.fn() }));
vi.mock("@/features/products/application/set-product-flags", () => ({ updateProductFlagsAction: vi.fn() }));
vi.mock("@/features/products/application/list-products", () => ({ listAllProducts: (...a: unknown[]) => m.listAllProducts(...a) }));
vi.mock("@/features/customers/application/customer-price-actions", () => ({
  getCustomerProductPricesAction: (...a: unknown[]) => m.getCustomerProductPricesAction(...a),
  getCustomerProductPricesBatchAction: vi.fn(),
  getCustomersMissingPrimaryAddressAction: vi.fn(),
}));
vi.mock("@/features/orders/application/complete-delivery", () => ({ completeDeliveryAction: (...a: unknown[]) => m.completeDeliveryAction(...a) }));
vi.mock("@/features/orders/application/revert-delivery", () => ({ revertDeliveryAction: vi.fn() }));
vi.mock("@/features/orders/application/create-orders-bulk", () => ({ createOrdersBulkAction: (...a: unknown[]) => m.createOrdersBulkAction(...a) }));
vi.mock("@/features/orders/application/get-order-gifts", () => ({ getOrderGifts: vi.fn() }));
vi.mock("@/features/orders/application/order-gift-actions", () => ({
  addOrderGiftAction: (...a: unknown[]) => m.addOrderGiftAction(...a),
  removeOrderGiftAction: (...a: unknown[]) => m.removeOrderGiftAction(...a),
}));
vi.mock("@/features/orders/application/update-order-cargo-info", () => ({ updateOrderCargoInfoAction: (...a: unknown[]) => m.updateOrderCargoInfoAction(...a) }));
vi.mock("@/features/products/application/set-product-sort-order", () => ({ updateProductSortOrderAction: vi.fn() }));
vi.mock("@/features/recurring/application/recurring-template-actions", () => ({
  createRecurringTemplateAction: vi.fn(),
  updateRecurringTemplateAction: (...a: unknown[]) => m.updateRecurringTemplateAction(...a),
  setRecurringTemplateActiveAction: vi.fn(),
  deleteRecurringTemplateAction: (...a: unknown[]) => m.deleteRecurringTemplateAction(...a),
  getRecurringTemplateAction: (...a: unknown[]) => m.getRecurringTemplateAction(...a),
  listAllRecurringTemplatesAction: vi.fn(),
  listCustomerRecurringTemplatesAction: vi.fn(),
}));
vi.mock("@/features/admin-notifications/application/list-notifications", () => ({ getNotificationFeed: (...a: unknown[]) => m.getNotificationFeed(...a) }));
vi.mock("@/features/admin-notifications/application/mark-notification-read", () => ({
  markNotificationReadAction: (...a: unknown[]) => m.markNotificationReadAction(...a),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("@/features/cargo/application/get-cargo-orders", () => ({ getCargoOrders: vi.fn() }));
vi.mock("@/features/finance/application/get-expense-category-breakdown", () => ({ getExpenseCategoryBreakdown: vi.fn() }));
vi.mock("@/features/finance/application/get-expense-summary", () => ({ getExpenseSummary: vi.fn() }));
vi.mock("@/features/finance/application/get-market-report", () => ({ getMarketReport: vi.fn() }));
vi.mock("@/features/finance/application/get-product-tally", () => ({ getProductTally: vi.fn() }));
vi.mock("@/features/finance/application/get-upcoming-recurring-expenses", () => ({ getUpcomingRecurringExpenses: vi.fn() }));
vi.mock("@/features/storefront/application/get-storefront-settings", () => ({ getStorefrontSettings: (...a: unknown[]) => m.getStorefrontSettings(...a) }));
vi.mock("@/features/storefront/application/update-storefront-settings", () => ({ updateStorefrontSettingsAction: (...a: unknown[]) => m.updateStorefrontSettingsAction(...a) }));
// Meta ad tools: covered in register-panel-tools.test.ts; stubbed here so the
// ads feature (and the env it reads) never loads.
vi.mock("@/features/ads/application/get-ads-overview", () => ({ getAdsOverview: vi.fn() }));
vi.mock("@/features/ads/application/ads-settings-actions", () => ({ listAdsChangesAction: vi.fn() }));
vi.mock("@/features/ads/application/change-ads", () => ({ changeAdBudget: vi.fn(), setAdStatus: vi.fn() }));
vi.mock("@/features/ads/application/create-ads", () => ({ createAdsCampaign: vi.fn(), createAdsAdSet: vi.fn(), createAdsAd: vi.fn() }));
vi.mock("@/features/reminders/application/reminder-actions", () => ({
  createReminderAction: (...a: unknown[]) => m.createReminderAction(...a),
  updateReminderAction: (...a: unknown[]) => m.updateReminderAction(...a),
  setReminderCompletedAction: (...a: unknown[]) => m.setReminderCompletedAction(...a),
  deleteReminderAction: (...a: unknown[]) => m.deleteReminderAction(...a),
}));
vi.mock("@/features/calendar/application/calendar-event-actions", () => ({
  createEventAction: (...a: unknown[]) => m.createEventAction(...a),
  updateEventAction: vi.fn(),
  deleteEventAction: (...a: unknown[]) => m.deleteEventAction(...a),
  deleteEventOccurrenceAction: (...a: unknown[]) => m.deleteEventOccurrenceAction(...a),
}));

vi.mock("@/features/finance/application/expense-actions", () => ({
  createExpenseAction: (...a: unknown[]) => m.createExpenseAction(...a),
  deleteExpenseAction: (...a: unknown[]) => m.deleteExpenseAction(...a),
  updateExpenseAction: vi.fn(),
  markExpensePaidAction: vi.fn(),
}));
vi.mock("@/features/finance/application/list-expense-categories", () => ({ listExpenseCategoriesFlat: (...a: unknown[]) => m.listExpenseCategoriesFlat(...a) }));
vi.mock("@/features/finance/application/list-expenses", () => ({ listExpenses: vi.fn() }));
vi.mock("@/features/finance/application/list-market-locations", () => ({ listMarketLocations: vi.fn(), listAllMarketLocations: vi.fn() }));
vi.mock("@/features/finance/application/expense-category-actions", () => ({
  createExpenseCategoryAction: (...a: unknown[]) => m.createExpenseCategoryAction(...a),
  updateExpenseCategoryAction: (...a: unknown[]) => m.updateExpenseCategoryAction(...a),
  setExpenseCategoryActiveAction: vi.fn(),
}));
vi.mock("@/features/finance/application/list-recurring-expense-templates", () => ({
  listRecurringExpenseTemplates: vi.fn(),
  listRecurringExpenseTemplatesFull: (...a: unknown[]) => m.listRecurringExpenseTemplatesFull(...a),
}));
vi.mock("@/features/finance/application/market-location-actions", () => ({
  createMarketLocationAction: vi.fn(),
  setMarketLocationActiveAction: vi.fn(),
  deleteMarketLocationAction: (...a: unknown[]) => m.deleteMarketLocationAction(...a),
}));
vi.mock("@/features/finance/application/recurring-expense-template-actions", () => ({
  createRecurringExpenseTemplateAction: (...a: unknown[]) => m.createRecurringExpenseTemplateAction(...a),
  updateRecurringExpenseTemplateAction: (...a: unknown[]) => m.updateRecurringExpenseTemplateAction(...a),
  setRecurringExpenseTemplateActiveAction: vi.fn(),
  deleteRecurringExpenseTemplateAction: (...a: unknown[]) => m.deleteRecurringExpenseTemplateAction(...a),
}));

vi.mock("@/features/finance/application/list-market-sales", () => ({
  listMarketSales: vi.fn(),
  getMarketSaleById: (...a: unknown[]) => m.getMarketSaleById(...a),
}));
vi.mock("@/features/finance/application/market-sale-actions", () => ({
  createMarketSaleAction: (...a: unknown[]) => m.createMarketSaleAction(...a),
  updateMarketSaleAction: (...a: unknown[]) => m.updateMarketSaleAction(...a),
  deleteMarketSaleAction: (...a: unknown[]) => m.deleteMarketSaleAction(...a),
}));
vi.mock("@/features/mcp/infrastructure/fetch-remote-image", () => ({ fetchRemoteImage: (...a: unknown[]) => m.fetchRemoteImage(...a) }));
vi.mock("@/features/products/application/upload-product-image", () => ({ uploadProductImageAction: (...a: unknown[]) => m.uploadProductImageAction(...a) }));
vi.mock("@/features/products/application/remove-product-image", () => ({ removeProductImageAction: (...a: unknown[]) => m.removeProductImageAction(...a) }));
vi.mock("@/features/routing/application/get-day-load-manifest", () => ({ buildDayLoadManifest: vi.fn() }));
vi.mock("@/features/routing/application/get-day-orders", () => ({ getDayOrders: vi.fn() }));
vi.mock("@/features/routing/application/get-day-route", () => ({ getDayRoute: vi.fn() }));
vi.mock("@/features/calendar/application/get-calendar-range", () => ({ getCalendarForDays: vi.fn() }));
vi.mock("@/features/reminders/application/get-reminders-page", () => ({ getRemindersPage: vi.fn() }));
vi.mock("@/features/orders/application/list-orders", () => ({ listOrders: vi.fn() }));
vi.mock("@/features/orders/application/get-order", () => ({ getOrderById: (...a: unknown[]) => m.getOrderById(...a), getOrderEvents: vi.fn() }));
vi.mock("@/features/orders/application/get-dashboard-order-stats", () => ({ getDashboardOrderStats: vi.fn() }));
vi.mock("@/features/orders/application/transition-order-as", () => ({ transitionOrderAs: vi.fn() }));
vi.mock("@/features/orders/application/confirm-orders-as", () => ({ confirmOrdersAs: vi.fn() }));
vi.mock("@/features/finance/application/get-finance-summary", () => ({ getFinanceSummary: vi.fn() }));

const { registerPanelTools } = await import("@/features/mcp/application/register-panel-tools");

const UUID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";
const UUID2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0" });
  registerPanelTools(server, { id: "admin-1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "c", version: "0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: unknown) => (r as { content: Array<{ text?: string }> }).content[0]?.text ?? "";

describe("write tool adapters", () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) fn.mockReset();
  });

  it("create_order sends the panel's form payload (items as JSON, blanks as empty strings)", async () => {
    m.createOrderAction.mockResolvedValue({ status: "success", orderId: UUID });
    const client = await connect();
    const res = await client.callTool({
      name: "create_order",
      arguments: {
        customer_id: UUID,
        scheduled_for: "2026-10-10",
        payment_method: "cash_on_delivery",
        items: [{ product_key: "dut_kurusu", quantity: 1.5 }],
      },
    });
    expect(res.isError).toBeFalsy();
    const [previous, fd] = m.createOrderAction.mock.calls[0] as [unknown, FormData];
    expect(previous).toEqual({ status: "idle" });
    expect(fd.get("customer_id")).toBe(UUID);
    expect(fd.get("time_slot")).toBe("");
    expect(fd.get("delivery_fee_minor")).toBe("0");
    expect(JSON.parse(String(fd.get("items_json")))).toEqual([{ product_key: "dut_kurusu", quantity: 1.5 }]);
    expect(JSON.parse(text(res))).toMatchObject({ ok: true, orderId: UUID });
  });

  it("relays the action's field errors so the model can correct and retry", async () => {
    m.createOrderAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { items: ["Miktar adıma uymuyor."] },
    });
    const res = await (await connect()).callTool({
      name: "create_order",
      arguments: {
        customer_id: UUID,
        scheduled_for: "2026-10-10",
        payment_method: "bank_transfer",
        items: [{ product_key: "peynir", quantity: 0.3 }],
      },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).fieldErrors).toEqual({ items: ["Miktar adıma uymuyor."] });
  });

  it("delete tools refuse without confirm:true and never reach the action", async () => {
    const client = await connect();
    for (const [name, args] of [
      ["delete_orders", { order_ids: [UUID] }],
      ["delete_customers", { customer_ids: [UUID] }],
      ["delete_product", { product_key: "x" }],
      ["delete_reminder", { id: UUID }],
      ["delete_order_payment", { order_id: UUID, payment_id: UUID2 }],
      ["delete_expense", { id: UUID }],
      ["delete_market_sale", { id: UUID }],
      ["remove_product_image", { product_key: "x" }],
      ["delete_recurring_expense_template", { id: UUID }],
      ["delete_market_location", { id: UUID }],
      ["delete_recurring_order", { id: UUID }],
      ["delete_calendar_event", { id: UUID }],
      ["remove_order_gift", { order_id: UUID, gift_id: UUID2 }],
    ] as const) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, name).toBe(true);
    }
    expect(m.bulkDeleteOrdersAction).not.toHaveBeenCalled();
    expect(m.bulkDeleteCustomersAction).not.toHaveBeenCalled();
    expect(m.deleteProductAction).not.toHaveBeenCalled();
    expect(m.deleteReminderAction).not.toHaveBeenCalled();
    expect(m.deletePaymentAction).not.toHaveBeenCalled();
    expect(m.deleteExpenseAction).not.toHaveBeenCalled();
    expect(m.deleteMarketSaleAction).not.toHaveBeenCalled();
    expect(m.removeProductImageAction).not.toHaveBeenCalled();
    expect(m.deleteRecurringExpenseTemplateAction).not.toHaveBeenCalled();
    expect(m.deleteMarketLocationAction).not.toHaveBeenCalled();
    expect(m.deleteRecurringTemplateAction).not.toHaveBeenCalled();
    expect(m.deleteEventAction).not.toHaveBeenCalled();
    expect(m.deleteEventOccurrenceAction).not.toHaveBeenCalled();
    expect(m.removeOrderGiftAction).not.toHaveBeenCalled();
  });

  it("delete_orders forwards the ids when confirmed", async () => {
    m.bulkDeleteOrdersAction.mockResolvedValue(ok({ deleted: 2 }));
    const res = await (await connect()).callTool({
      name: "delete_orders",
      arguments: { order_ids: [UUID, UUID2], confirm: true },
    });
    expect(m.bulkDeleteOrdersAction).toHaveBeenCalledWith([UUID, UUID2]);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { deleted: 2 } });
  });

  it("update_customer reads the record first and preserves unmentioned fields", async () => {
    m.getCustomerById.mockResolvedValue(
      ok({
        first_name: "Ayşe",
        last_name: "Yılmaz",
        email: "ayse@example.com",
        phone: "+905321234567",
        notes: null,
        status: "active",
        address: null,
      }),
    );
    m.updateCustomerAction.mockResolvedValue({ status: "success", customerId: UUID });
    await (await connect()).callTool({
      name: "update_customer",
      arguments: { customer_id: UUID, notes: "VIP" },
    });
    const [id, , fd] = m.updateCustomerAction.mock.calls[0] as [string, unknown, FormData];
    expect(id).toBe(UUID);
    expect(fd.get("first_name")).toBe("Ayşe");
    expect(fd.get("email")).toBe("ayse@example.com");
    expect(fd.get("notes")).toBe("VIP");
  });

  it("update_product overlays the given fields on the current product", async () => {
    m.listAllProducts.mockResolvedValue(
      ok([
        {
          key: "dut_kurusu",
          display_name: "Dut Kurusu",
          unit: "kilogram",
          unit_label: "kg",
          package_size: 1,
          min_qty: 0.5,
          step: 0.5,
          fulfillment_type: "shipping",
          web_description: "Tatlı",
          image_alt: null,
        },
      ]),
    );
    m.updateProductMetadataAction.mockResolvedValue(ok(undefined));
    await (await connect()).callTool({
      name: "update_product",
      arguments: { product_key: "dut_kurusu", min_qty: 1 },
    });
    expect(m.updateProductMetadataAction).toHaveBeenCalledWith({
      product_key: "dut_kurusu",
      display_name: "Dut Kurusu",
      unit: "kilogram",
      unit_label: "kg",
      package_size: 1,
      min_qty: 1,
      step: 0.5,
      fulfillment_type: "shipping",
      web_description: "Tatlı",
      image_alt: null,
    });
  });

  it("update_product reports an unknown key instead of writing", async () => {
    m.listAllProducts.mockResolvedValue(ok([]));
    const res = await (await connect()).callTool({
      name: "update_product",
      arguments: { product_key: "yok", min_qty: 1 },
    });
    expect(res.isError).toBe(true);
    expect(m.updateProductMetadataAction).not.toHaveBeenCalled();
  });

  it("masks upstream errors but keeps the panel's validation messages", async () => {
    m.createReminderAction.mockResolvedValue(
      err(new ValidationError({ message: "Tekrarlayan anımsatıcı için bir tarih seçin." })),
    );
    const res = await (await connect()).callTool({
      name: "create_reminder",
      arguments: { list_id: UUID, title: "Aşı", repeat_unit: "week" },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toBe("Tekrarlayan anımsatıcı için bir tarih seçin.");
  });

  it("set_product_pricing passes tiers through untouched", async () => {
    m.saveProductPricingAction.mockResolvedValue(ok(undefined));
    const args = {
      product_key: "dut_kurusu",
      base_price_minor: 110000,
      tiers: [{ min_qty: 5, unit_price_minor: 100000 }],
    };
    await (await connect()).callTool({ name: "set_product_pricing", arguments: args });
    expect(m.saveProductPricingAction).toHaveBeenCalledWith(args);
  });

  it("create_expense passes the payload straight to the panel action", async () => {
    m.createExpenseAction.mockResolvedValue(ok({ id: UUID }));
    const args = {
      category_id: UUID,
      amount_minor: 125000,
      expense_date: "2026-10-07",
      payment_status: "pending",
    };
    const res = await (await connect()).callTool({ name: "create_expense", arguments: args });
    expect(m.createExpenseAction).toHaveBeenCalledWith(args);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { id: UUID } });
  });

  it("update_market_sale keeps the stored items when none are given", async () => {
    m.getMarketSaleById.mockResolvedValue(
      ok({
        id: UUID,
        location_id: UUID2,
        sale_date: "2026-10-05",
        total_amount_minor: 90000,
        payment_method: "cash",
        note: "eski",
        items: [{ product_key: "dut_kurusu", quantity: 2, unit_price_minor: 45000 }],
      }),
    );
    m.updateMarketSaleAction.mockResolvedValue(ok({ id: UUID }));
    await (await connect()).callTool({
      name: "update_market_sale",
      arguments: { id: UUID, total_amount_minor: 95000 },
    });
    expect(m.updateMarketSaleAction).toHaveBeenCalledWith({
      id: UUID,
      location_id: UUID2,
      sale_date: "2026-10-05",
      total_amount_minor: 95000,
      payment_method: "cash",
      note: "eski",
      items: [{ product_key: "dut_kurusu", quantity: 2, unit_price_minor: 45000 }],
    });
  });

  it("set_product_image downloads first, then hands the panel's upload action a File", async () => {
    m.fetchRemoteImage.mockResolvedValue(
      ok({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), type: "image/jpeg" }),
    );
    m.uploadProductImageAction.mockResolvedValue(ok({ imagePath: "dut/abc.jpg" }));
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "https://cdn.example.com/dut.jpg" },
    });
    expect(m.fetchRemoteImage).toHaveBeenCalledWith("https://cdn.example.com/dut.jpg");
    const fd = m.uploadProductImageAction.mock.calls[0]?.[0] as FormData;
    expect(fd.get("product_key")).toBe("dut_kurusu");
    const file = fd.get("file") as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(4);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { imagePath: "dut/abc.jpg" } });
  });

  it("set_product_image never reaches the upload action when the download is refused", async () => {
    m.fetchRemoteImage.mockResolvedValue(err(new ValidationError({ message: "Bu bağlantıdan görsel indirilemez." })));
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "https://169.254.169.254/x.jpg" },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toContain("indirilemez");
    expect(m.uploadProductImageAction).not.toHaveBeenCalled();
  });

  it("set_product_image rejects a non-URL before any fetch", async () => {
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "not a url" },
    });
    expect(res.isError).toBe(true);
    expect(m.fetchRemoteImage).not.toHaveBeenCalled();
  });

  const TEMPLATE = {
    id: UUID,
    name: "Kira",
    category_id: UUID2,
    vendor: "Ev sahibi",
    description: null,
    amount_type: "fixed",
    default_amount_minor: 1500000,
    cadence: "monthly",
    day_of_week: null,
    day_of_month: 5,
    start_date: "2026-01-05",
    end_date: null,
    payment_method: "bank_transfer",
    note: null,
  };

  it("update_recurring_expense_template overlays only the given fields on the stored template", async () => {
    m.listRecurringExpenseTemplatesFull.mockResolvedValue(ok([TEMPLATE]));
    m.updateRecurringExpenseTemplateAction.mockResolvedValue(ok({ id: UUID }));
    await (await connect()).callTool({
      name: "update_recurring_expense_template",
      arguments: { id: UUID, default_amount_minor: 1650000 },
    });
    const { id, ...rest } = TEMPLATE;
    expect(m.updateRecurringExpenseTemplateAction).toHaveBeenCalledWith({
      id,
      ...rest,
      default_amount_minor: 1650000,
    });
  });

  it("update_recurring_expense_template reports an unknown id instead of writing", async () => {
    m.listRecurringExpenseTemplatesFull.mockResolvedValue(ok([]));
    const res = await (await connect()).callTool({
      name: "update_recurring_expense_template",
      arguments: { id: UUID, name: "x" },
    });
    expect(res.isError).toBe(true);
    expect(m.updateRecurringExpenseTemplateAction).not.toHaveBeenCalled();
  });

  it("update_expense_category keeps the stored parent and order unless told otherwise", async () => {
    m.listExpenseCategoriesFlat.mockResolvedValue(
      ok([{ id: UUID, name: "Yem", parent_id: UUID2, sort_order: 3, active: true }]),
    );
    m.updateExpenseCategoryAction.mockResolvedValue(ok({ id: UUID }));
    const client = await connect();
    await client.callTool({ name: "update_expense_category", arguments: { id: UUID, name: "Yem ve saman" } });
    expect(m.updateExpenseCategoryAction).toHaveBeenLastCalledWith({
      id: UUID,
      name: "Yem ve saman",
      parent_id: UUID2,
      sort_order: 3,
    });
    // An explicit null moves it to the top level.
    await client.callTool({ name: "update_expense_category", arguments: { id: UUID, parent_id: null } });
    expect(m.updateExpenseCategoryAction).toHaveBeenLastCalledWith({
      id: UUID,
      name: "Yem",
      parent_id: null,
      sort_order: 3,
    });
  });

  it("delete_market_location relays the panel's 'has sales' refusal", async () => {
    m.deleteMarketLocationAction.mockResolvedValue(
      err(new ValidationError({ message: "Bu lokasyonda kayıtlı satış var, silinemez." })),
    );
    const res = await (await connect()).callTool({
      name: "delete_market_location",
      arguments: { id: UUID, confirm: true },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toContain("kayıtlı satış");
  });

  it("complete_delivery forwards the order id and relays the panel's refusal", async () => {
    m.completeDeliveryAction.mockResolvedValue({ status: "error", message: "Bu sipariş teslim edilemez (durum: cancelled)." });
    const res = await (await connect()).callTool({ name: "complete_delivery", arguments: { order_id: UUID } });
    expect(m.completeDeliveryAction).toHaveBeenCalledWith({ order_id: UUID });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toContain("teslim edilemez");
  });

  it("update_order_cargo_info keeps stored cargo fields that were not mentioned", async () => {
    m.getOrderById.mockResolvedValue(
      ok({ cargo_carrier: "Yurtiçi", cargo_tracking_number: "123", cargo_tracking_url: "https://x.example/123" }),
    );
    m.updateOrderCargoInfoAction.mockResolvedValue({ status: "success", orderId: UUID });
    await (await connect()).callTool({
      name: "update_order_cargo_info",
      arguments: { order_id: UUID, cargo_tracking_number: "999" },
    });
    expect(m.updateOrderCargoInfoAction).toHaveBeenCalledWith({
      order_id: UUID,
      cargo_carrier: "Yurtiçi",
      cargo_tracking_number: "999",
      cargo_tracking_url: "https://x.example/123",
    });
  });

  it("create_orders_bulk sends the batch as JSON and reports customers without an address", async () => {
    m.createOrdersBulkAction.mockResolvedValue({ status: "missing_address", customerIds: [UUID2] });
    const args = {
      scheduled_for: "2026-10-10",
      payment_method: "cash_on_delivery",
      orders: [{ customer_id: UUID2, items: [{ product_key: "dut_kurusu", quantity: 1 }] }],
    };
    const res = await (await connect()).callTool({ name: "create_orders_bulk", arguments: args });
    const fd = m.createOrdersBulkAction.mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(String(fd.get("batch_json")))).toMatchObject({
      scheduled_for: "2026-10-10",
      time_slot: null,
      delivery_fee_minor: 0,
      orders: args.orders,
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).customer_ids_without_address).toEqual([UUID2]);
  });

  it("add_order_gift passes the payload straight through", async () => {
    m.addOrderGiftAction.mockResolvedValue(ok({ id: UUID2 }));
    const args = { order_id: UUID, product_key: "dut_kurusu", quantity: 200, unit_label: "gr" };
    await (await connect()).callTool({ name: "add_order_gift", arguments: args });
    expect(m.addOrderGiftAction).toHaveBeenCalledWith(args);
  });

  const RECURRING = {
    id: UUID,
    customer_id: UUID2,
    cadence: "weekly",
    day_of_week: 2,
    day_of_month: null,
    items: [{ product_key: "dut_kurusu", quantity: 1 }],
    payment_method: "cash_on_delivery",
    active: false,
  };

  it("update_recurring_order never re-activates a paused template", async () => {
    m.getRecurringTemplateAction.mockResolvedValue(ok(RECURRING));
    m.updateRecurringTemplateAction.mockResolvedValue(ok(RECURRING));
    await (await connect()).callTool({
      name: "update_recurring_order",
      arguments: { id: UUID, payment_method: "bank_transfer" },
    });
    const [id, payload] = m.updateRecurringTemplateAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(UUID);
    expect(payload).toMatchObject({ active: false, payment_method: "bank_transfer", customer_id: UUID2, cadence: "weekly", day_of_week: 2 });
  });

  it("update_reminder forwards only the keys the model sent", async () => {
    m.updateReminderAction.mockResolvedValue(ok({ id: UUID }));
    await (await connect()).callTool({
      name: "update_reminder",
      arguments: { id: UUID, flagged: true },
    });
    expect(m.updateReminderAction).toHaveBeenCalledWith({ id: UUID, flagged: true });

    await (await connect()).callTool({
      name: "update_reminder",
      arguments: { id: UUID, due_date: null },
    });
    expect(m.updateReminderAction).toHaveBeenLastCalledWith({ id: UUID, due_date: null });
  });

  it("delete_calendar_event deletes one occurrence when a date is given, else the whole event", async () => {
    m.deleteEventAction.mockResolvedValue(ok({ id: UUID }));
    m.deleteEventOccurrenceAction.mockResolvedValue(ok({ id: UUID }));
    const client = await connect();

    await client.callTool({
      name: "delete_calendar_event",
      arguments: { id: UUID, occurrence_date: "2026-10-12", confirm: true },
    });
    expect(m.deleteEventOccurrenceAction).toHaveBeenCalledWith({ id: UUID, occurrence_date: "2026-10-12" });
    expect(m.deleteEventAction).not.toHaveBeenCalled();

    await client.callTool({ name: "delete_calendar_event", arguments: { id: UUID, confirm: true } });
    expect(m.deleteEventAction).toHaveBeenCalledWith({ id: UUID });
  });

  it("update_storefront_settings changes only the given value and keeps the rest (a missing fee must not become free delivery)", async () => {
    m.getStorefrontSettings.mockResolvedValue({
      homeDeliveryDays: [1, 3, 5],
      cargoMinOrderMinor: 100000,
      homeMinOrderMinor: 25000,
      homeDeliveryFeeMinor: 5000,
      cargoFeeMinor: 15000,
      cargoFreeShippingThresholdMinor: 100000,
      heroTitle: "Çiftlikten sofranıza",
      heroSubtitle: "Köy yumurtası.",
    });
    m.updateStorefrontSettingsAction.mockResolvedValue({ status: "success", savedAt: 1 });
    await (await connect()).callTool({
      name: "update_storefront_settings",
      arguments: { home_min_order_minor: 30000 },
    });
    const fd = m.updateStorefrontSettingsAction.mock.calls[0]?.[1] as FormData;
    expect(fd.getAll("home_delivery_days")).toEqual(["1", "3", "5"]);
    expect(fd.get("cargo_min_order_minor")).toBe("100000");
    expect(fd.get("home_min_order_minor")).toBe("30000");
    expect(fd.get("home_delivery_fee_minor")).toBe("5000");
    expect(fd.get("hero_title")).toBe("Çiftlikten sofranıza");
    expect(fd.get("hero_subtitle")).toBe("Köy yumurtası.");
  });

  it("mark_notification_read reports the real unread count afterwards", async () => {
    m.markNotificationReadAction.mockResolvedValue(undefined);
    m.getNotificationFeed.mockResolvedValue({ notifications: [], unreadCount: 3 });
    const res = await (await connect()).callTool({ name: "mark_notification_read", arguments: { id: UUID } });
    expect(m.markNotificationReadAction).toHaveBeenCalledWith(UUID);
    expect(JSON.parse(text(res))).toEqual({ ok: true, unreadCount: 3 });
  });

  it("get_customer_prices returns the stored special prices", async () => {
    m.getCustomerProductPricesAction.mockResolvedValue({ dut_kurusu: 95000 });
    const res = await (await connect()).callTool({ name: "get_customer_prices", arguments: { customer_id: UUID } });
    expect(JSON.parse(text(res))).toEqual({ dut_kurusu: 95000 });
  });
});
