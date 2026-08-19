import { z } from "zod";

import { manualPaymentMethodSchema } from "@/features/finance/domain/expense.schema";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

export const marketSaleItemInputSchema = z.object({
  product_key: z.string().min(1, "Ürün seçin."),
  quantity: z.coerce.number().positive("Miktar 0'dan büyük olmalı."),
});
export type MarketSaleItemInput = z.output<typeof marketSaleItemInputSchema>;

export const marketSaleInputSchema = z.object({
  location_id: z.string().uuid("Pazar/lokasyon seçin."),
  sale_date: z
    .string()
    .regex(YMD_RE, "Geçerli bir tarih girin.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin."),
  total_amount_minor: z.coerce
    .number()
    .int("Tutar tam sayı (kuruş) olmalı.")
    .positive("Toplam tutar 0'dan büyük olmalı."),
  payment_method: manualPaymentMethodSchema.default("cash"),
  note: nullableText(500, "En fazla 500 karakter olabilir."),
  items: z.array(marketSaleItemInputSchema).max(50).default([]),
});
export type MarketSaleInput = z.output<typeof marketSaleInputSchema>;

export const createMarketSaleSchema = marketSaleInputSchema;
export type CreateMarketSaleInput = z.input<typeof createMarketSaleSchema>;

export const updateMarketSaleSchema = marketSaleInputSchema.extend({
  id: z.string().uuid(),
});
export type UpdateMarketSaleInput = z.input<typeof updateMarketSaleSchema>;

export const deleteMarketSaleSchema = z.object({ id: z.string().uuid() });
export type DeleteMarketSaleInput = z.input<typeof deleteMarketSaleSchema>;

// ---- List query -------------------------------------------------------------

export const marketSaleSortFieldSchema = z.enum([
  "sale_date",
  "total_amount_minor",
  "created_at",
]);
export type MarketSaleSortField = z.output<typeof marketSaleSortFieldSchema>;

export const marketSaleListQuerySchema = z.object({
  location_id: z.string().uuid().optional(),
  date_from: z.string().regex(YMD_RE).optional(),
  date_to: z.string().regex(YMD_RE).optional(),
  sort: marketSaleSortFieldSchema.default("sale_date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type MarketSaleListQuery = z.output<typeof marketSaleListQuerySchema>;
