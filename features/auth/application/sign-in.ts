"use server";

import { redirect } from "next/navigation";

import { signInSchema } from "@/features/auth/domain/sign-in.schema";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Server-action state passed to/from `useActionState`.
 *
 * Successful sign-in throws via `redirect()` (Next's mechanism) and never
 * returns; this state is only ever observed in the failure paths. Keeping it
 * as a discriminated union means the UI can pattern-match instead of
 * checking truthy/falsy fields.
 */
export type SignInState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      status: "error",
      message: first?.message ?? "Geçersiz giriş.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Don't echo Supabase's English message back to the admin; log the
    // detail and surface a deliberately vague Turkish message so a
    // brute-forcer can't tell whether the email exists.
    logger.warn({ supabaseStatus: error.status }, "sign_in_failed");
    return {
      status: "error",
      message: "E-posta veya şifre hatalı.",
    };
  }

  redirect("/admin");
}
