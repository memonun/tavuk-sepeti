import { z } from "zod";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const financeDateBasisSchema = z.enum(["scheduled_for", "created_at"]);

/** Query for get-finance-summary — always a concrete [from, to] range; the
 *  period-preset resolution (Bugün/Bu Hafta/...) happens in the page/filter,
 *  not here, so this schema stays a plain bounds+basis validator. */
export const financeSummaryQuerySchema = z
  .object({
    from: z.string().regex(YMD_RE, "Geçerli bir başlangıç tarihi girin."),
    to: z.string().regex(YMD_RE, "Geçerli bir bitiş tarihi girin."),
    dateBasis: financeDateBasisSchema.default("scheduled_for"),
  })
  .refine((v) => v.from <= v.to, {
    message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.",
    path: ["from"],
  });

export type FinanceSummaryQuery = z.output<typeof financeSummaryQuerySchema>;
