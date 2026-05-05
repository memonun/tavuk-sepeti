import { z } from "zod";

/**
 * Login input shape. Single source of truth for both the form (UI) and the
 * server action (application). Anything reaching the application layer must
 * pass this parse — no `as` casts, no manual type assertions.
 */
export const signInSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, "Şifre gerekli."),
});

export type SignInInput = z.infer<typeof signInSchema>;
