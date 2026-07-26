/**
 * Customer auth Zod schemas — storefront sign-in / sign-up (email + password
 * via Supabase Auth). Parsed first thing in the auth Server Actions.
 */
import { z } from "zod";

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
  first_name: z.string().trim().max(100).default(""),
  last_name: z.string().trim().max(100).default(""),
});

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
