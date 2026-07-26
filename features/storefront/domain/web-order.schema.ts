/**
 * Web-order (guest checkout) Zod schemas — single source of truth for the
 * storefront checkout form (UI) and the placeOrderAction (application).
 * CLAUDE.md §4: every server-action boundary parses with Zod first.
 *
 * Values arrive from an anonymous customer's browser, so everything is parsed
 * before it's trusted. Prices are NOT accepted from the client at all — the
 * action re-prices every line from the catalog (see place-order.ts). The item
 * schema therefore carries only product_key + quantity.
 *
 * Phone normalizes to E.164 via the shared util (same rule as the admin
 * customer form). The time_slot / payment_method enums mirror the DB enums.
 */
import { z } from "zod";

import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const phoneTR = z
  .string()
  .min(1, "Telefon gerekli.")
  .transform((s, ctx) => {
    const normalized = normalizeTRPhone(s);
    if (normalized === null || !isE164TR(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Geçerli bir telefon girin (ör. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return normalized;
  });

/** Who is ordering + how to reach them. Phone is the identity. */
export const webContactSchema = z.object({
  first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
  last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
  phone: phoneTR,
  email: z.preprocess(
    blankToNull,
    z.string().email("Geçerli bir e-posta girin.").toLowerCase().nullable(),
  ),
});

/** Where to deliver. il / ilçe / mahalle are required for a geocodable pin;
 *  the rest refine the address. Mirrors the admin address field set. */
export const webAddressSchema = z.object({
  city: z.string().trim().min(1, "İl gerekli.").max(100),
  district: z.string().trim().min(1, "İlçe gerekli.").max(100),
  neighborhood: z.string().trim().min(1, "Mahalle gerekli.").max(100),
  street: z.string().trim().max(150).default(""),
  building_no: z.string().trim().max(20).default(""),
  apartment_no: z.string().trim().max(20).default(""),
  postal_code: z.string().trim().max(10).default(""),
  description: z.preprocess(
    blankToNull,
    z.string().trim().max(500).nullable(),
  ),
});

/** One basket line. Pricing is derived server-side — never sent by the client. */
export const webOrderItemSchema = z.object({
  product_key: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

/** The full checkout payload. */
export const webOrderSchema = z.object({
  contact: webContactSchema,
  address: webAddressSchema,
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Teslimat günü seçin."),
  time_slot: z.preprocess(
    blankToNull,
    z.enum(["morning", "afternoon", "evening"]).nullable(),
  ),
  payment_method: z.enum(["cash_on_delivery", "bank_transfer"], {
    message: "Ödeme yöntemi seçin.",
  }),
  delivery_notes: z.preprocess(
    blankToNull,
    z.string().max(2000).nullable(),
  ),
  items: z.array(webOrderItemSchema).min(1, "Sepetiniz boş."),
});

export type WebContactInput = z.input<typeof webContactSchema>;
export type WebAddressInput = z.input<typeof webAddressSchema>;
export type WebOrderItemInput = z.input<typeof webOrderItemSchema>;
export type WebOrderInput = z.input<typeof webOrderSchema>;
export type WebOrderParsed = z.output<typeof webOrderSchema>;
