import { z } from "zod";

export const MAX_BULK_ORDERS = 250;

const bulkOrderItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.number().positive(),
});

const bulkCustomerOrderSchema = z.object({
  customer_id: z.string().uuid(),
  items: z.array(bulkOrderItemSchema).min(1, "En az bir ürün gerekli."),
});

export const bulkOrderSchema = z.object({
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalı."),
  time_slot: z.enum(["morning", "afternoon", "evening"]).nullable(),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer"]),
  delivery_fee_minor: z.coerce.number().int().nonnegative().default(0),
  orders: z
    .array(bulkCustomerOrderSchema)
    .min(1, "En az bir müşteri seç.")
    .max(MAX_BULK_ORDERS, `Tek seferde en fazla ${MAX_BULK_ORDERS} sipariş.`),
});

export type BulkOrderInput = z.infer<typeof bulkOrderSchema>;
