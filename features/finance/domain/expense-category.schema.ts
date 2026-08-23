import { z } from "zod";

export const createExpenseCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Kategori adı gerekli.")
    .max(100, "En fazla 100 karakter olabilir."),
  /** null = top-level (Ana Kategori). Non-null must reference a top-level
   *  category — enforced by the repository/DB trigger, not here (this
   *  schema has no DB access to check the referenced row's own parent). */
  parent_id: z.string().uuid().nullish().transform((v) => v ?? null),
  sort_order: z.coerce.number().int().min(0).default(0),
});
export type CreateExpenseCategoryInput = z.input<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = createExpenseCategorySchema.extend({
  id: z.string().uuid(),
});
export type UpdateExpenseCategoryInput = z.input<typeof updateExpenseCategorySchema>;

export const setExpenseCategoryActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetExpenseCategoryActiveInput = z.input<typeof setExpenseCategoryActiveSchema>;
