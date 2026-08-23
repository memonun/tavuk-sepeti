/**
 * Expense Zod schemas — single source of truth for the Giderler form (UI)
 * and the expense Server Actions (application). Amount arrives already
 * converted to kuruş (the form parses the TRY string client-side via
 * shared/utils/money.ts, same as the product form does for base_price_minor).
 */
import { z } from "zod";

import type { ExpensePaymentStatus, ExpenseUnit, ManualPaymentMethod } from "@/features/finance/domain/expense";

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
export const expenseUnitSchema = z.enum(["kg", "litre", "adet", "koli", "paket", "ton"]);

/** Base object (no refinements) so `updateExpenseSchema` can still `.extend()`
 *  it with `id` — Zod's `.superRefine()` returns a ZodEffects, which has no
 *  `.extend()`, so the refinement is applied last, identically, to both. */
const expenseObjectSchema = z.object({
  category_id: z.string().uuid("Gider kategorisi seçin."),
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
  // Miktar/Birim (spec §7) — optional, but only meaningful as a pair: a
  // quantity with no unit (or vice versa) can't render "14,00 ₺ / kg".
  quantity: z.coerce.number().positive("Miktar 0'dan büyük olmalı.").nullish().transform((v) => v ?? null),
  unit: expenseUnitSchema.nullish().transform((v) => v ?? null),
});

function requireQuantityUnitPair(
  val: { quantity: number | null; unit: ExpenseUnit | null },
  ctx: z.RefinementCtx,
) {
  if ((val.quantity === null) !== (val.unit === null)) {
    const path = val.quantity === null ? ["quantity"] : ["unit"];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Miktar ve birim birlikte girilmeli.",
    });
  }
}

export const expenseInputSchema = expenseObjectSchema.superRefine(requireQuantityUnitPair);
export type ExpenseInput = z.output<typeof expenseInputSchema>;

export const createExpenseSchema = expenseInputSchema;
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const updateExpenseSchema = expenseObjectSchema
  .extend({ id: z.string().uuid() })
  .superRefine(requireQuantityUnitPair);
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export const deleteExpenseSchema = z.object({ id: z.string().uuid() });
export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>;

export const markExpensePaidSchema = z.object({
  id: z.string().uuid(),
  payment_method: manualPaymentMethodSchema.nullish().transform((v) => v ?? null),
});
export type MarkExpensePaidInput = z.input<typeof markExpensePaidSchema>;

// ---- List query -------------------------------------------------------------

// "category" dropped from sortable fields: it's now a joined display name
// (category_id → expense_categories.name), not a plain column PostgREST can
// order by directly. The Kategori column header is no longer clickable.
export const expenseSortFieldSchema = z.enum([
  "expense_date",
  "amount_minor",
  "payment_status",
  "created_at",
]);
export type ExpenseSortField = z.output<typeof expenseSortFieldSchema>;

/** New table, not a virtualized grid — default/max pagination follows the
 *  plain CLAUDE.md §9 rule (25/100), no GRID_PAGE_SIZE-style override. */
export const expenseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** A top-level category id is expanded to itself + all children before
   *  hitting the repository (features/finance/application/list-expenses.ts) —
   *  see collectSelfAndDescendantIds. */
  category_id: z.string().uuid().optional(),
  payment_status: expensePaymentStatusSchema.optional(),
  date_from: z.string().regex(YMD_RE).optional(),
  date_to: z.string().regex(YMD_RE).optional(),
  sort: expenseSortFieldSchema.default("expense_date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type ExpenseListQuery = z.output<typeof expenseListQuerySchema>;

export type { ExpensePaymentStatus, ExpenseUnit, ManualPaymentMethod };
