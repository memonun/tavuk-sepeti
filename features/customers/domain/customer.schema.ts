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

import { filterRuleListSchema } from "@/shared/filter/filter-rule";
import { coordinateAccuracySchema, coordinateSourceSchema } from "@/shared/geo/coordinate.schema";
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

// Like phoneTR but allows blank/null input — used in the form where phone
// is no longer required.
const phoneTROrNull = z.preprocess(
  blankToNull,
  z.string().nullable().transform((s, ctx) => {
    if (s === null) return null;
    const normalized = normalizeTRPhone(s);
    if (normalized === null || !isE164TR(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Geçerli bir TR cep numarası girin (ör. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return normalized;
  }),
);

// Name field: trims, enforces 1–100 chars when non-null, but accepts blank
// strings and maps them to null (so a form field left empty is null, not "").
const nullableName = (label: string) =>
  z.preprocess(
    blankToNull,
    z.string().trim().min(1, label).max(100, "En fazla 100 karakter olabilir.").nullable(),
  );

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
  first_name: nullableName("Ad gerekli.").default(null),
  last_name: nullableName("Soyad gerekli.").default(null),
  email: emailOrNull.optional(),
  phone: phoneTROrNull.default(null),
  notes: notesOrNull.optional(),
  status: z
    .enum(["active", "inactive", "blocked"])
    .default("active"),
  address: z
    .object({
      // Structured fields — TR postal convention.
      city: optionalShortText(100),
      district: optionalShortText(100),
      neighborhood: optionalShortText(100),
      street: optionalShortText(150),
      building_no: optionalShortText(20),
      apartment_no: optionalShortText(20),
      postal_code: optionalShortText(10),
      description: optionalShortText(500),
      // Lat/lng come from the pin (auto-geocoded or admin-corrected).
      lat: z.number().gte(-90).lte(90).optional(),
      lng: z.number().gte(-180).lte(180).optional(),
      source: coordinateSourceSchema.optional(),
      accuracy: coordinateAccuracySchema.optional(),
    })
    .nullable()
    .optional(),
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
  /** Primary-address pin accuracy bucket. "accurate" = pin reliable enough
   *  to route to (rooftop / range_interpolated). "approximate" = the row
   *  is sitting on a city-center placeholder or a low-confidence geocode
   *  and needs admin attention before it can ship an order. */
  location: z.enum(["accurate", "approximate"]).optional(),
  sort: customerSortFieldSchema.default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  // CLAUDE.md §9: max 100, default 25.
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  // Multi-condition AND filter from the popover. Layered on top of
  // the simple dropdowns above (which still drive the most common
  // single-value filters). Empty array = no advanced filters.
  filters: filterRuleListSchema.default([]),
});

export type CustomerListQuery = z.output<typeof customerListQuerySchema>;

// ---- Cell-level patch schemas ---------------------------------------------
//
// Used by the inline-edit DataGrid: each editable cell gets its own Zod
// schema so the same validation runs in the UI (cell editor) and on the
// server (patch-customer-cell action). Keeping them as a discriminated map
// lets the Server Action route to the right schema by columnId without a
// switch ladder.
//
// Naming convention matches the column ids in customer-grid-columns.ts —
// changing one without the other is a type error.

const accountTypeSchema = z.enum([
  "individual",
  "business",
  "charity",
  "bazaar_vendor",
]);
const statusSchema = z.enum(["active", "inactive", "blocked"]);

export const customerCellPatchSchemas = {
  first_name: optionalShortText(100),
  last_name: optionalShortText(100),
  phone: phoneTR,
  email: emailOrNull,
  status: statusSchema,
  account_type: accountTypeSchema,
  // Free-text classification fields — empty string collapses to null so the
  // DB doesn't see a meaningless "" row.
  tag: optionalShortText(100),
  legacy_segment: optionalShortText(100),
  notes: notesOrNull,
  // Address fields proxy to the primary address row.
  city: optionalShortText(100),
  district: optionalShortText(100),
  neighborhood: optionalShortText(100),
} as const;

export type CustomerCellField = keyof typeof customerCellPatchSchemas;

/** Discriminated union of every legal cell patch — `field` selects the
 *  schema, `value` carries the parsed payload. The Server Action accepts
 *  this shape and dispatches to the right repository update. */
export const customerCellPatchSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("first_name"), value: customerCellPatchSchemas.first_name }),
  z.object({ field: z.literal("last_name"), value: customerCellPatchSchemas.last_name }),
  z.object({ field: z.literal("phone"), value: customerCellPatchSchemas.phone }),
  z.object({ field: z.literal("email"), value: customerCellPatchSchemas.email }),
  z.object({ field: z.literal("status"), value: customerCellPatchSchemas.status }),
  z.object({ field: z.literal("account_type"), value: customerCellPatchSchemas.account_type }),
  z.object({ field: z.literal("tag"), value: customerCellPatchSchemas.tag }),
  z.object({ field: z.literal("legacy_segment"), value: customerCellPatchSchemas.legacy_segment }),
  z.object({ field: z.literal("notes"), value: customerCellPatchSchemas.notes }),
  z.object({ field: z.literal("city"), value: customerCellPatchSchemas.city }),
  z.object({ field: z.literal("district"), value: customerCellPatchSchemas.district }),
  z.object({ field: z.literal("neighborhood"), value: customerCellPatchSchemas.neighborhood }),
]);

export type CustomerCellPatch = z.output<typeof customerCellPatchSchema>;

/** Fields that contain PII — values are redacted from audit logs / logger
 *  output, only the field name is kept so an admin can audit "phone was
 *  changed at HH:MM:SS" without leaking the value into observability. */
export const PII_CELL_FIELDS: ReadonlySet<CustomerCellField> = new Set([
  "first_name",
  "last_name",
  "phone",
  "email",
  "city",
  "district",
  "neighborhood",
]);

// ---- Bulk-create schema (paste into empty rows) --------------------------
//
// Smaller than customerFormSchema: paste flow only carries scalar fields,
// not a full structured address + geocoded pin. Created rows get a
// placeholder address with accuracy=unknown so the location filter
// surfaces them under "approximate" — admin then opens the detail page,
// fills the real address, and the geocoding pipeline pins the row.
//
// Only required: first_name + last_name. phone/email are optional (legacy
// imports + bazaar walk-ins routinely lack one or both). Any extra column
// in the paste payload that isn't in this schema is dropped on parse.
export const bulkCreateCustomerRowSchema = z.object({
  first_name: trimmedString(1, 100, "Ad gerekli."),
  last_name: trimmedString(1, 100, "Soyad gerekli."),
  phone: z.preprocess(
    blankToNull,
    z.string().nullable().transform((s, ctx) => {
      if (s === null) return null;
      const normalized = normalizeTRPhone(s);
      if (normalized === null || !isE164TR(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Geçerli bir TR cep numarası girin (ör. 0532 123 45 67).",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  ),
  email: emailOrNull,
  status: statusSchema.default("active"),
  account_type: accountTypeSchema.default("individual"),
  tag: optionalShortText(100),
  legacy_segment: optionalShortText(100),
  city: optionalShortText(100),
});

export type BulkCreateCustomerRow = z.output<typeof bulkCreateCustomerRowSchema>;

/** Whole paste payload — used by the Server Action's outer parse. */
export const bulkCreateCustomersSchema = z
  .array(bulkCreateCustomerRowSchema)
  .min(1, "En az bir satır gerekli.")
  .max(200, "Tek seferde en fazla 200 satır yapıştırabilirsin.");
