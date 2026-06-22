import { z } from "zod";

/** A single template line — `[{product_key, quantity}]`, no frozen price. */
export const recurringItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

/**
 * Create/edit input — single source for the form + the server action. The
 * superRefine mirrors the DB `recurring_cadence_shape` CHECK exactly:
 *   weekly | biweekly → day_of_week required, day_of_month forbidden
 *   monthly           → day_of_month required, day_of_week forbidden
 */
export const recurringTemplateFormSchema = z
  .object({
    customer_id: z.string().uuid("Müşteri seç."),
    cadence: z.enum(["weekly", "biweekly", "monthly"]),
    day_of_week: z.coerce.number().int().min(0).max(6).nullable().default(null),
    day_of_month: z.coerce.number().int().min(1).max(31).nullable().default(null),
    items: z.array(recurringItemSchema).min(1, "En az bir ürün gerekli."),
    payment_method: z.enum(["cash_on_delivery", "bank_transfer"]),
    active: z.boolean().default(true),
    first_run_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.cadence === "monthly") {
      if (v.day_of_month == null)
        ctx.addIssue({ code: "custom", path: ["day_of_month"], message: "Aylık için ayın günü gerekli." });
      if (v.day_of_week != null)
        ctx.addIssue({ code: "custom", path: ["day_of_week"], message: "Aylık şablonda haftanın günü olamaz." });
    } else {
      if (v.day_of_week == null)
        ctx.addIssue({ code: "custom", path: ["day_of_week"], message: "Haftanın günü gerekli." });
      if (v.day_of_month != null)
        ctx.addIssue({ code: "custom", path: ["day_of_month"], message: "Haftalık/iki haftalık şablonda ayın günü olamaz." });
    }
  });

export type RecurringTemplateFormInput = z.infer<typeof recurringTemplateFormSchema>;
