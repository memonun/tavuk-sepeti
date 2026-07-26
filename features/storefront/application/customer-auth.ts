"use server";

/**
 * Storefront customer authentication (email + password via Supabase Auth).
 * Distinct from the admin auth actions: these redirect into `/magaza`, and
 * signup does NOT grant any admin role — the auto-admin trigger was dropped in
 * migration 20260726120200, so a new auth user is just a customer.
 */
import { redirect } from "next/navigation";

import {
  customerSignInSchema,
  customerSignUpSchema,
} from "@/features/storefront/domain/customer-auth.schema";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type CustomerAuthState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "verify_email"; email: string };

export async function customerSignInAction(
  _previous: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = customerSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz giriş.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logger.warn({ supabaseStatus: error.status }, "customer_sign_in_failed");
    return { status: "error", message: "E-posta veya şifre hatalı." };
  }

  redirect("/magaza/hesap");
}

export async function customerSignUpAction(
  _previous: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = customerSignUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz kayıt bilgisi.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/magaza/auth/confirm`,
      data: {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        role: "customer",
      },
    },
  });

  if (error) {
    logger.warn({ supabaseStatus: error.status }, "customer_sign_up_failed");
    const alreadyRegistered = /already|registered|exists/i.test(error.message);
    return {
      status: "error",
      message: alreadyRegistered
        ? "Bu e-posta ile zaten bir hesap var. Giriş yapın."
        : "Kayıt oluşturulamadı, tekrar deneyin.",
    };
  }

  // Email confirmation on → a user exists but there's no active session yet.
  if (data.user && !data.session) {
    return { status: "verify_email", email: parsed.data.email };
  }

  redirect("/magaza/hesap");
}

export async function customerSignOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/magaza");
}
