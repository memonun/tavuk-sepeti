/**
 * Customer Zod schemas — single source of truth for both the form (UI) and
 * the server action (application). Anything reaching the DB has been parsed
 * by these.
 *
 * Address is structured (TR postal convention): il / ilçe / mahalle /
 * cadde / bina no / daire no / posta kodu / tarif. raw_text is composed
 * server-side from these parts; the form never sets it directly.
 *
 * Phone: accepts loose user input ("0532 123 45 67"), normalizes to E.164.
 * Email: accepts blank → null (so the DB unique-when-present constraint
 * doesn't trip).
 */
import { z } from "zod";

import { latLngSchema, coordinateAccuracySchema, coordinateSourceSchema } from "@/shared/geo/coordinate.schema";
import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const trimmedString = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .min(min, message)
    .max(max, `En fazla ${max} karakter olabilir.`);

const optionalShortText = (max: number) =>
  z.preprocess(
    blankToNull,
    z.string().trim().max(max, `En fazla ${max} karakter olabilir.`).nullable(),
  );

const phoneTR = z
  .string()
  .min(1, "Telefon gerekli.")
  .transform((s, ctx) => {
    const normalized = normalizeTRPhone(s);
    if (normalized === null || !isE164TR(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Geçerli bir TR cep numarası girin (ör. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return normalized;
  });

const emailOrNull = z.preprocess(
  blankToNull,
  z
    .string()
    .email("Geçerli bir e-posta girin.")
    .toLowerCase()
    .nullable(),
);

const notesOrNull = z.preprocess(
  blankToNull,
  z.string().max(2000, "Not en fazla 2000 karakter olabilir.").nullable(),
);

/**
 * What the customer-create form posts. Address pin is provided by the
 * geocoding pipeline (auto) or the pin corrector (manual) — both routes
 * eventually populate `coordinate`.
 */
export const customerFormSchema = z.object({
  first_name: trimmedString(1, 100, "Ad gerekli."),
  last_name: trimmedString(1, 100, "Soyad gerekli."),
  email: emailOrNull,
  phone: phoneTR,
  notes: notesOrNull,
  status: z
    .enum(["active", "inactive", "blocked"])
    .default("active"),
  address: z.object({
    // Structured fields — TR postal convention.
    city: trimmedString(1, 100, "İl gerekli."),
    district: trimmedString(1, 100, "İlçe gerekli."),
    neighborhood: trimmedString(1, 100, "Mahalle gerekli."),
    street: optionalShortText(150),
    building_no: optionalShortText(20),
    apartment_no: optionalShortText(20),
    postal_code: optionalShortText(10),
    description: optionalShortText(500),
    // Lat/lng come from the pin (auto-geocoded or admin-corrected).
    ...latLngSchema.shape,
    source: coordinateSourceSchema,
    accuracy: coordinateAccuracySchema,
  }),
});

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormParsed = z.output<typeof customerFormSchema>;

/** Sortable columns on the customer list. Constrained set so the URL
 *  param can't ask the DB to sort by an unindexed / sensitive column. */
export const customerSortFieldSchema = z.enum([
  "first_name",
  "last_name",
  "phone",
  "status",
  "account_type",
  "tag",
  "legacy_segment",
  "created_at",
]);
export type CustomerSortField = z.output<typeof customerSortFieldSchema>;

/** Search/list query parameters for the customer table. */
export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  city: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(100).optional(),
  account_type: z
    .enum(["individual", "business", "charity", "bazaar_vendor"])
    .optional(),
  legacy_segment: z.string().trim().max(100).optional(),
  sort: customerSortFieldSchema.default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  // CLAUDE.md §9: max 100, default 25.
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type CustomerListQuery = z.output<typeof customerListQuerySchema>;
