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

// ---- Finance: expenses + market sales -------------------------------------

const paymentMethodManual = z.enum(["cash", "card", "bank_transfer", "other"]);
const expenseUnit = z.enum(["kg", "litre", "adet", "koli", "paket", "ton"]);

const expenseBody = {
  category_id: uuid.describe("list_expense_categories ile bulunan kategori id'si."),
  amount_minor: z.number().int().positive().describe("Kuruş."),
  expense_date: ymd,
  description: z.string().max(500).nullish(),
  payment_status: z.enum(["paid", "pending"]).default("pending"),
  payment_method: paymentMethodManual.nullish(),
  vendor: z.string().max(200).nullish().describe("Tedarikçi / satıcı."),
  note: z.string().max(500).nullish(),
  quantity: z.number().positive().nullish().describe("unit ile birlikte verilmeli."),
  unit: expenseUnit.nullish().describe("quantity ile birlikte verilmeli."),
};

export const createExpenseInput = expenseBody;

export const updateExpenseInput = {
  id: uuid,
  ...expenseBody,
};

export const markExpensePaidInput = {
  id: uuid,
  payment_method: paymentMethodManual.nullish().describe("Boşsa giderin mevcut yöntemi, o da yoksa nakit."),
};

export const deleteExpenseInput = {
  id: uuid,
  confirm: confirmDelete,
};

export const listExpensesInput = {
  q: z.string().trim().max(100).optional(),
  category_id: uuid.optional().describe("Üst kategori verilirse alt kategorileri de kapsar."),
  payment_status: z.enum(["paid", "pending"]).optional(),
  date_from: ymd.optional(),
  date_to: ymd.optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
};

const marketSaleItem = z.object({
  product_key: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_minor: z.number().int().nonnegative().describe("Kuruş."),
});

export const createMarketSaleInput = {
  location_id: uuid.describe("list_market_locations ile bulunan pazar/lokasyon id'si."),
  sale_date: ymd,
  total_amount_minor: z.number().int().positive().describe("Günün toplam satışı, kuruş."),
  payment_method: paymentMethodManual.default("cash"),
  note: z.string().max(500).nullish(),
  items: z
    .array(marketSaleItem)
    .max(50)
    .default([])
    .describe("Hangi ürünlerden satıldığı (raporlama içindir; toplamla eşleşmesi şart değil)."),
};

export const updateMarketSaleInput = {
  id: uuid,
  location_id: uuid.optional(),
  sale_date: ymd.optional(),
  total_amount_minor: z.number().int().positive().optional(),
  payment_method: paymentMethodManual.optional(),
  note: z.string().max(500).nullish(),
  items: z
    .array(marketSaleItem)
    .max(50)
    .optional()
    .describe("Verilirse mevcut kalemlerin TAMAMININ yerine geçer; verilmezse kalemler korunur."),
};

export const deleteMarketSaleInput = {
  id: uuid,
  confirm: confirmDelete,
};

export const listMarketSalesInput = {
  location_id: uuid.optional(),
  date_from: ymd.optional(),
  date_to: ymd.optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
};

// ---- Product image --------------------------------------------------------

export const setProductImageInput = {
  product_key: productKey,
  image_url: z
    .string()
    .url()
    .max(2000)
    .describe(
      "Görselin DOĞRUDAN https bağlantısı (JPEG/PNG/WEBP, en çok 5 MB). Sohbete eklenen dosyalar araçlara iletilemez; panelden yükle veya bir bağlantı ver.",
    ),
};

export const removeProductImageInput = {
  product_key: productKey,
  confirm: confirmDelete,
};

// ---- Finance admin: recurring templates, expense categories, market locations

const templateBody = {
  name: z.string().min(1).max(150).describe("Rutin giderin adı, ör. 'Kira'."),
  category_id: uuid.describe("list_expense_categories ile bulunan kategori id'si."),
  vendor: z.string().max(200).nullish(),
  description: z.string().max(500).nullish(),
  amount_type: z.enum(["fixed", "variable"]).describe("fixed = sabit tutar, variable = her dönem değişir (tahmini tutar)."),
  default_amount_minor: z.number().int().positive().describe("Kuruş. Değişken giderde tahmini tutar."),
  cadence: z.enum(["weekly", "monthly", "quarterly", "semiannual", "yearly"]),
  day_of_week: z
    .number()
    .int()
    .min(0)
    .max(6)
    .nullish()
    .describe("Sadece weekly için zorunlu: 0 = Pazar, 1 = Pazartesi … 6 = Cumartesi."),
  day_of_month: z.number().int().min(1).max(31).nullish().describe("weekly dışındaki tüm sıklıklar için zorunlu (1-31)."),
  start_date: ymd,
  end_date: ymd.nullish().describe("Boşsa süresiz."),
  payment_method: paymentMethodManual.nullish(),
  note: z.string().max(500).nullish(),
};

export const createRecurringExpenseTemplateInput = templateBody;

export const updateRecurringExpenseTemplateInput = {
  id: uuid,
  name: templateBody.name.optional(),
  category_id: templateBody.category_id.optional(),
  vendor: templateBody.vendor,
  description: templateBody.description,
  amount_type: templateBody.amount_type.optional(),
  default_amount_minor: templateBody.default_amount_minor.optional(),
  cadence: templateBody.cadence.optional(),
  day_of_week: templateBody.day_of_week,
  day_of_month: templateBody.day_of_month,
  start_date: templateBody.start_date.optional(),
  end_date: templateBody.end_date,
  payment_method: templateBody.payment_method,
  note: templateBody.note,
};

export const setRecurringExpenseTemplateActiveInput = {
  id: uuid,
  active: z.boolean().describe("false = duraklat, true = devam ettir (sonraki çalışma bugünden hesaplanır, kaçan dönemler geriye dönük üretilmez)."),
};

export const deleteRecurringExpenseTemplateInput = {
  id: uuid,
  confirm: confirmDelete,
};

export const createExpenseCategoryInput = {
  name: z.string().min(1).max(100),
  parent_id: uuid.nullish().describe("Boşsa ana kategori. Doluysa bir ANA kategorinin id'si olmalı (iki seviye)."),
  sort_order: z.number().int().min(0).default(0),
};

export const updateExpenseCategoryInput = {
  id: uuid,
  name: z.string().min(1).max(100).optional(),
  parent_id: uuid.nullish().describe("Verilmezse mevcut üst kategori korunur; null = ana kategoriye taşı."),
  sort_order: z.number().int().min(0).optional(),
};

export const setExpenseCategoryActiveInput = {
  id: uuid,
  active: z.boolean().describe("false = pasife al (yeni giderlerde seçilemez, eski kayıtlar korunur)."),
};

export const listMarketLocationsInput = {
  include_inactive: z.boolean().default(false).describe("true = pasif lokasyonları da getir."),
};

export const createMarketLocationInput = {
  name: z.string().min(1).max(100),
};

export const setMarketLocationActiveInput = {
  id: uuid,
  active: z.boolean(),
};

export const deleteMarketLocationInput = {
  id: uuid,
  confirm: confirmDelete,
};
