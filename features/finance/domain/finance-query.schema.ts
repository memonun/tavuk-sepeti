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

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Most months one monthly product-tally call may span. */
export const PRODUCT_TALLY_MAX_MONTHS = 24;

/** Months from `from` to `to` inclusive ("2026-01".."2026-03" → 3). */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Query for the month-by-month product tally: whole months, YYYY-MM. */
export const productTallyByMonthQuerySchema = z
  .object({
    from_month: z.string().regex(YM_RE, "Ay YYYY-AA biçiminde olmalı."),
    to_month: z.string().regex(YM_RE, "Ay YYYY-AA biçiminde olmalı."),
    dateBasis: financeDateBasisSchema.default("scheduled_for"),
  })
  .refine((v) => v.from_month <= v.to_month, {
    message: "Başlangıç ayı bitiş ayından sonra olamaz.",
    path: ["from_month"],
  })
  .refine((v) => monthSpan(v.from_month, v.to_month) <= PRODUCT_TALLY_MAX_MONTHS, {
    message: `En fazla ${PRODUCT_TALLY_MAX_MONTHS} ay seçilebilir.`,
    path: ["to_month"],
  });

export type ProductTallyByMonthQuery = z.output<typeof productTallyByMonthQuerySchema>;
