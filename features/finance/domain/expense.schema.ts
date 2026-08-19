/**
 * Expense Zod schemas — single source of truth for the Giderler form (UI)
 * and the expense Server Actions (application). Amount arrives already
 * converted to kuruş (the form parses the TRY string client-side via
 * shared/utils/money.ts, same as the product form does for base_price_minor).
 */
import { z } from "zod";

import type { ExpensePaymentStatus, ManualPaymentMethod } from "@/features/finance/domain/expense";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional free-text field: trims, caps length, maps empty → null. */
const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

export const expensePaymentStatusSchema = z.enum(["paid", "pending"]);
export const manualPaymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank_transfer",
  "other",
]);

export const expenseInputSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, "Gider kategorisi gerekli.")
    .max(100, "En fazla 100 karakter olabilir."),
  amount_minor: z.coerce
    .number()
    .int("Tutar tam sayı (kuruş) olmalı.")
    .positive("Tutar 0'dan büyük olmalı."),
  expense_date: z
    .string()
    .regex(YMD_RE, "Geçerli bir tarih girin.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin."),
  description: nullableText(500, "En fazla 500 karakter olabilir."),
  payment_status: expensePaymentStatusSchema.default("pending"),
  payment_method: manualPaymentMethodSchema.nullish().transform((v) => v ?? null),
  vendor: nullableText(200, "En fazla 200 karakter olabilir."),
  note: nullableText(500, "En fazla 500 karakter olabilir."),
});

export type ExpenseInput = z.output<typeof expenseInputSchema>;

export const createExpenseSchema = expenseInputSchema;
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const updateExpenseSchema = expenseInputSchema.extend({
  id: z.string().uuid(),
});
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export const deleteExpenseSchema = z.object({ id: z.string().uuid() });
export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>;

export const markExpensePaidSchema = z.object({
  id: z.string().uuid(),
  payment_method: manualPaymentMethodSchema.nullish().transform((v) => v ?? null),
});
export type MarkExpensePaidInput = z.input<typeof markExpensePaidSchema>;

// ---- List query -------------------------------------------------------------

export const expenseSortFieldSchema = z.enum([
  "expense_date",
  "category",
  "amount_minor",
  "payment_status",
  "created_at",
]);
export type ExpenseSortField = z.output<typeof expenseSortFieldSchema>;

/** New table, not a virtualized grid — default/max pagination follows the
 *  plain CLAUDE.md §9 rule (25/100), no GRID_PAGE_SIZE-style override. */
export const expenseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  payment_status: expensePaymentStatusSchema.optional(),
  date_from: z.string().regex(YMD_RE).optional(),
  date_to: z.string().regex(YMD_RE).optional(),
  sort: expenseSortFieldSchema.default("expense_date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type ExpenseListQuery = z.output<typeof expenseListQuerySchema>;

export type { ExpensePaymentStatus, ManualPaymentMethod };
