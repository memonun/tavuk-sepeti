/**
 * Customer auth Zod schemas — storefront sign-in / sign-up (email + password
 * via Supabase Auth). Parsed first thing in the auth Server Actions.
 */
import { z } from "zod";

import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

/**
 * Optional TR phone: empty → null, otherwise normalized to E.164 — the same
 * rule as checkout, so a phone entered at signup/profile dedupes against a
 * guest customer created from a prior order.
 */
const optionalPhoneTR = z.preprocess(
  (v) =>
    v === undefined || v === null || (typeof v === "string" && v.trim() === "")
      ? null
      : v,
  z
    .string()
    .nullable()
    .transform((s, ctx) => {
      if (s === null) return null;
      const normalized = normalizeTRPhone(s);
      if (normalized === null || !isE164TR(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Geçerli bir telefon girin (ör. 0532 123 45 67).",
        });
        return z.NEVER;
      }
      return normalized;
    }),
);

export const customerSignInSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
  password: z.string().min(1, "Şifre gerekli."),
});

export const customerSignUpSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
  last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
  // Required, not optional. A delivery the driver cannot phone fails at the
  // door, and phone is the field the CRM and the route readiness check key on.
  // The same rule applies to the inline signup at checkout.
  phone: z
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
    }),
});

/** Account "Bilgilerim" editor — name required, phone optional (E.164). */
export const customerProfileSchema = z.object({
  first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
  last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
  phone: optionalPhoneTR,
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;

/** "Forgot password" — request a reset link by email. */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
});

/** Set a new password (from the recovery-link session). */
export const passwordUpdateSchema = z.object({
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
});

export type CustomerSignInInput = z.input<typeof customerSignInSchema>;
export type CustomerSignUpInput = z.input<typeof customerSignUpSchema>;
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordUpdateInput = z.input<typeof passwordUpdateSchema>;
