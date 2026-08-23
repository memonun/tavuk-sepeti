import { z } from "zod";

import { manualPaymentMethodSchema } from "@/features/finance/domain/expense.schema";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymdSchema = z
  .string()
  .regex(YMD_RE, "Geçerli bir tarih girin.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.");

const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

export const recurringExpenseCadenceSchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
]);
export const recurringExpenseAmountTypeSchema = z.enum(["fixed", "variable"]);

const recurringExpenseTemplateObjectSchema = z.object({
  name: z.string().trim().min(1, "Gider adı gerekli.").max(150, "En fazla 150 karakter olabilir."),
  category_id: z.string().uuid("Kategori seçin."),
  vendor: nullableText(200, "En fazla 200 karakter olabilir."),
  description: nullableText(500, "En fazla 500 karakter olabilir."),
  amount_type: recurringExpenseAmountTypeSchema,
  default_amount_minor: z.coerce
    .number()
    .int("Tutar tam sayı (kuruş) olmalı.")
    .positive("Tutar 0'dan büyük olmalı."),
  cadence: recurringExpenseCadenceSchema,
  day_of_week: z.coerce.number().int().min(0).max(6).nullish().transform((v) => v ?? null),
  day_of_month: z.coerce.number().int().min(1).max(31).nullish().transform((v) => v ?? null),
  start_date: ymdSchema,
  end_date: ymdSchema.nullish().transform((v) => v ?? null),
  payment_method: manualPaymentMethodSchema.nullish().transform((v) => v ?? null),
  note: nullableText(500, "En fazla 500 karakter olabilir."),
});

/** Cadence-shape + end-date invariants — mirrored in the DB CHECK
 *  constraint (belt-and-suspenders, CLAUDE.md §11). */
function refineRecurringExpenseTemplate(
  val: {
    cadence: z.infer<typeof recurringExpenseCadenceSchema>;
    day_of_week: number | null;
    day_of_month: number | null;
    start_date: string;
    end_date: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (val.cadence === "weekly") {
    if (val.day_of_week === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["day_of_week"], message: "Haftanın gününü seçin." });
    }
    if (val.day_of_month !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["day_of_month"], message: "Haftalık tekrar için ayın günü girilmez." });
    }
  } else {
    if (val.day_of_month === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["day_of_month"], message: "Ayın gününü seçin (1-31)." });
    }
    if (val.day_of_week !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["day_of_week"], message: "Bu tekrar sıklığı için haftanın günü girilmez." });
    }
  }
  if (val.end_date !== null && val.end_date < val.start_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Bitiş tarihi başlangıçtan önce olamaz." });
  }
}

export const createRecurringExpenseTemplateSchema = recurringExpenseTemplateObjectSchema.superRefine(
  refineRecurringExpenseTemplate,
);
export type CreateRecurringExpenseTemplateInput = z.input<typeof createRecurringExpenseTemplateSchema>;

export const updateRecurringExpenseTemplateSchema = recurringExpenseTemplateObjectSchema
  .extend({ id: z.string().uuid() })
  .superRefine(refineRecurringExpenseTemplate);
export type UpdateRecurringExpenseTemplateInput = z.input<typeof updateRecurringExpenseTemplateSchema>;

export const setRecurringExpenseTemplateActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetRecurringExpenseTemplateActiveInput = z.input<typeof setRecurringExpenseTemplateActiveSchema>;

export const deleteRecurringExpenseTemplateSchema = z.object({ id: z.string().uuid() });
export type DeleteRecurringExpenseTemplateInput = z.input<typeof deleteRecurringExpenseTemplateSchema>;
