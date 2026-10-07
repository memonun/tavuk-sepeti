/**
 * Input shapes for the connector's WRITE tools. They describe + clamp what the
 * model may send; the panel's own Server Action re-parses every payload with the
 * owning feature's schema (single source of truth), so a rule changed there is
 * enforced here too.
 *
 * Money is kuruş (minor units, CLAUDE.md §7). Deletes carry a literal
 * `confirm: true` so the approval card claude.ai shows the admin names the
 * destructive intent explicitly.
 */
import { z } from "zod";

import { ORDER_STATUSES } from "@/features/mcp/domain/mcp-tool-inputs";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");
const uuid = z.string().uuid();

export const confirmDelete = z
  .literal(true)
  .describe("Silme işlemini onayladığını belirtmek için true olmalı. Geri alınamaz.");

// ---- Orders ---------------------------------------------------------------

const orderItem = z.object({
  product_key: z.string().min(1).describe("list_products çıktısındaki ürün anahtarı (key)."),
  quantity: z.number().positive().describe("Miktar (ürünün birim adımına uymalı)."),
  unit_price_minor: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Kuruş. Verilmezse katalog/kademe veya müşteriye özel fiyat kullanılır."),
});

const orderBody = {
  scheduled_for: ymd.describe("Planlanan teslim/kargo tarihi."),
  time_slot: z.enum(["morning", "afternoon", "evening"]).nullable().optional(),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer", "credit_card"]),
  delivery_notes: z.string().max(2000).nullable().optional(),
  delivery_fee_minor: z.number().int().nonnegative().default(0),
  items: z.array(orderItem).min(1),
};

export const createOrderInput = {
  customer_id: uuid.describe("list_customers ile bulunan müşteri id'si."),
  ...orderBody,
};

export const updateOrderInput = {
  order_id: uuid,
  ...orderBody,
};

export const deleteOrdersInput = {
  order_ids: z.array(uuid).min(1).max(100),
  confirm: confirmDelete,
};

export const getOrderPaymentsInput = { order_id: uuid };

export const addOrderPaymentInput = {
  order_id: uuid,
  amount_minor: z
    .number()
    .int()
    .refine((n) => n !== 0, "Tutar sıfır olamaz.")
    .describe("Kuruş. Pozitif = tahsilat; negatif = iade/düzeltme."),
  channel: z.enum(["cash", "bank_transfer", "card"]),
  paid_at: z.string().min(1).optional().describe("ISO tarih-saat; boşsa şimdi."),
  note: z.string().max(500).nullable().optional(),
};

export const markOrderFullyPaidInput = {
  order_id: uuid,
  channel: z.enum(["cash", "bank_transfer", "card"]).optional(),
};

export const deleteOrderPaymentInput = {
  order_id: uuid,
  payment_id: uuid.describe("get_order_payments çıktısındaki ödeme id'si."),
  confirm: confirmDelete,
};

// ---- Customers ------------------------------------------------------------

const customerAddress = z
  .object({
    city: z.string().max(100).nullish(),
    district: z.string().max(100).nullish(),
    neighborhood: z.string().max(100).nullish(),
    street: z.string().max(150).nullish(),
    building_no: z.string().max(20).nullish(),
    apartment_no: z.string().max(20).nullish(),
    postal_code: z.string().max(10).nullish(),
    description: z.string().max(500).nullish().describe("Adres tarifi."),
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
  })
  .describe(
    "Bu araç adresi Google'da konumlandırmaz. lat/lng verilmezse müşteri haritada pinsiz kalır; pin panelden düzeltilir.",
  );

const customerBody = {
  first_name: z.string().max(100).nullish(),
  last_name: z.string().max(100).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish().describe("TR cep numarası, ör. 0532 123 45 67."),
  notes: z.string().max(2000).nullish(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  address: customerAddress.optional(),
};

export const createCustomerInput = customerBody;

export const updateCustomerInput = {
  customer_id: uuid,
  ...customerBody,
};

export const deleteCustomersInput = {
  customer_ids: z.array(uuid).min(1).max(100),
  confirm: confirmDelete,
};

// ---- Products -------------------------------------------------------------

const productKey = z.string().min(1).describe("list_products çıktısındaki ürün anahtarı (key).");
const productUnit = z.enum(["package", "liter", "kilogram", "piece"]);
const fulfillmentType = z
  .enum(["delivery", "shipping"])
  .describe("delivery = kendi teslimatı (rotaya dahil), shipping = kargo.");

export const createProductInput = {
  display_name: z.string().min(1).max(100),
  unit: productUnit,
  unit_label: z.string().min(1).max(50),
  package_size: z.number().positive(),
  min_qty: z.number().positive(),
  step: z.number().positive(),
  fulfillment_type: fulfillmentType.default("delivery"),
  web_description: z.string().max(500).nullish(),
  image_alt: z.string().max(200).nullish(),
  base_price_minor: z.number().nonnegative().default(0).describe("Kuruş."),
};

export const updateProductInput = {
  product_key: productKey,
  display_name: z.string().min(1).max(100).optional(),
  unit: productUnit.optional(),
  unit_label: z.string().min(1).max(50).optional(),
  package_size: z.number().positive().optional(),
  min_qty: z.number().positive().optional(),
  step: z.number().positive().optional(),
  fulfillment_type: fulfillmentType.optional(),
  web_description: z.string().max(500).nullish(),
  image_alt: z.string().max(200).nullish(),
};

export const setProductPricingInput = {
  product_key: productKey,
  base_price_minor: z.number().nonnegative().describe("Kuruş."),
  tiers: z
    .array(
      z.object({
        min_qty: z.number().positive(),
        unit_price_minor: z.number().nonnegative().describe("Kuruş."),
      }),
    )
    .max(20)
    .describe("Mevcut kademelerin TAMAMININ yerine geçer; boş liste kademeleri siler."),
};

export const setProductActiveInput = {
  product_key: productKey,
  active: z.boolean().describe("false = arşivle, true = geri getir."),
};

export const setProductFlagsInput = {
  product_key: productKey,
  is_web_visible: z.boolean().optional().describe("Mağazada görünür mü."),
  is_featured: z.boolean().optional().describe("Mağazada öne çıkan mı."),
};

export const deleteProductInput = {
  product_key: productKey,
  confirm: confirmDelete,
};

// ---- Agenda (yapılacaklar) ------------------------------------------------

const agendaCategory = z.enum([
  "genel",
  "hayvan_sagligi",
  "kumes_bakimi",
  "satis_teslimat",
  "alisveris",
]);

const agendaBody = {
  title: z.string().min(1).max(200),
  notes: z.string().max(1000).nullish(),
  category: agendaCategory.default("genel"),
  due_date: ymd.nullish().describe("Boşsa tarihsiz (backlog)."),
  repeat_unit: z.enum(["day", "week", "month"]).nullish(),
  repeat_every: z.number().int().min(1).max(365).nullish().describe("repeat_unit ile birlikte verilmeli."),
};

export const createAgendaTaskInput = agendaBody;

export const updateAgendaTaskInput = {
  id: uuid,
  ...agendaBody,
};

export const completeAgendaTaskInput = {
  id: uuid,
  completed: z.boolean().describe("true = tamamlandı, false = yeniden aç."),
};

export const deleteAgendaTaskInput = {
  id: uuid,
  confirm: confirmDelete,
};

export { ORDER_STATUSES };
